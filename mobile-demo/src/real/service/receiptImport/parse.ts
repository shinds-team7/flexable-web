// 거래내역 스크린샷의 OCR 줄(텍스트와 좌표)을 거래 후보로 바꾼다. expo·ML Kit 모듈을 쓰지 않아 단위 테스트에서 바로 돌린다.
// 지원하는 화면: 토스(날짜 머리글형 / 왼쪽 날짜 열형), 카카오뱅크, 카카오페이. 못 읽은 값은 채우지 않고 review에 이유를 남긴다.

export type OcrLine = { text: string; x: number; y: number };
export type ImportSource = "toss" | "kakaobank" | "kakaopay";
export type ImportCandidate = {
  /** "YYYY-MM-DD". 연도는 화면에 없어 오늘 기준 가장 가까운 과거로 추정한다 */
  date: string;
  title: string;
  amount: number;
  type: "EXPENSE" | "INCOME" | null;
  balance: number | null;
  ownTransfer: boolean;
  refund: boolean;
  /** 사용자가 확인해야 하는 이유. 비어 있지 않으면 확인 전에는 저장하지 않는다 */
  review: string[];
};
export type ParseResult = {
  source: ImportSource | null;
  items: ImportCandidate[];
};

const AMOUNT = /^([+\-−–])?\s*(\d{1,3}(?:,\d{3})*|\d+)\s*원$/;
const PAY_BARE_AMOUNT = /^([+\-−–])\s*(\d{1,3}(?:,\d{3})*|\d+)$/;
// 토스 금액 열의 원 누락·글자 오인식용. 숫자와 쉼표는 고치지 않는다.
const BANK_LOOSE_AMOUNT =
  /^([+\-−–])?\s*(\d{1,3}(?:,\d{3})*|\d+)\s*[가-힣a-zA-Z]{0,2}$/;
const BANK_AMOUNT_SHAPE = /^[+\-−–]?\s*[\d,]+\s*[가-힣a-zA-Z]{0,2}$/;
const TIME = /^\d{1,2}:\d{2}$/;
const DATE_DOT = /^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?$/;
const DATE_KOR = /^(\d{1,2})\s*월\s*(\d{1,2})\s*일$/;
const DATE_DAY = /^(\d{1,2})\s*일\s*[월화수목금토일]\s*요\s*일/;
const MONTH_HEAD =
  /^(\d{1,2})\s*월\s*(?:[·・•ㆍ]|(?:카카오\s*)?페이\s*머니(?:\s|$))/;
const PAY_ROW =
  /^(결제\s*취소\s*[·・•ㆍ]?\s*환불|결제|충전|송금\s*받기|송금|출금|입금)\s*[|｜│丨]\s*(.+)$/;
const PAY_LOGO = /^[p,]?pay$/i;
const OWN = /내\s*\S*\s*(계좌|통장)|\(내\s*[^)]*\)|충전/;
const REFUND = /취소\s*[·・•ㆍ]?\s*환불/;

const won = (m: RegExpMatchArray) => Number(m[2].replace(/[,\s]/g, ""));
const unsigned = (s: string) => s.replace(/^[+\-−–]\s*/, "");

export const REVIEW_TYPE = "입금인지 출금인지 확인이 필요해요";

/**
 * OCR이 한 줄로 합쳐 준 "10.26 CU 광화문점 -6,800원", "체크카드 잔액 2,336,700원" 같은 줄을
 * 날짜·내용·금액 조각으로 나눈다. 조각의 x는 줄 안의 대략적인 순서만 맞춘다.
 */
export function splitLines(lines: OcrLine[]): OcrLine[] {
  return lines.flatMap((line) => {
    const out: OcrLine[] = [];
    let rest = line.text.trim();
    let x = line.x;
    const date = rest.match(/^(\d{1,2}\s*\.\s*\d{1,2})\s+(\S.*)$/);
    if (date) {
      out.push({ text: date[1], x, y: line.y });
      rest = date[2];
      x += 1;
    }
    const amount = rest.match(
      /^(\S.*?)\s+([+\-−–]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\s*원)$/,
    );
    if (amount && !/^[+\-−–]?\s*[\d,]+$/.test(amount[1])) {
      out.push({ text: amount[1], x, y: line.y });
      out.push({
        text: amount[2].replace(/\s+/g, ""),
        x: x + 100000,
        y: line.y,
      });
    } else out.push({ text: rest, x, y: line.y });
    return out;
  });
}

/** y가 비슷한 줄을 한 행으로 묶고, 행 안에서는 왼쪽부터 정렬한다. */
export function toRows(input: OcrLine[], tolerance = 14): OcrLine[][] {
  const lines = splitLines(input);
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const rows: OcrLine[][] = [];
  for (const line of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - line.y) <= tolerance) last.push(line);
    else rows.push([line]);
  }
  return rows.map((r) => joinFragments(r.sort((a, b) => a.x - b.x)));
}

/** 날짜와 금액의 기호가 별도 OCR 줄이어도 같은 시각적 행 안에서만 합친다. */
function joinFragments(input: OcrLine[]): OcrLine[] {
  const row = [...input];
  if (!DATE_DOT.test(row[0]?.text ?? "")) {
    for (const count of [2, 3]) {
      if (row.length < count) continue;
      const text = row
        .slice(0, count)
        .map((l) => l.text)
        .join("");
      if (!DATE_DOT.test(text)) continue;
      row.splice(0, count, { ...row[0], text });
      break;
    }
  }
  const end = row.length - 1;
  let amount = end;
  if (row[end]?.text === "원" && end > 0) {
    if (!AMOUNT.test(`${row[end - 1].text}원`)) return row;
    amount--;
  } else if (!AMOUNT.test(row[end]?.text ?? "")) return row;
  if (/^[+\-−–]$/.test(row[amount - 1]?.text ?? "")) amount--;
  if (amount < end) {
    row.splice(amount, row.length - amount, {
      ...row[amount],
      text: row
        .slice(amount)
        .map((l) => l.text)
        .join(""),
    });
  }
  return row;
}

function payDetail(
  text: string,
  allowMissingDivider = false,
): { kind: string; detail: string } | null {
  // 1/I/l은 금액이나 일반 상호에서 바꾸지 않고, 송금 문구와 페이머니 사이의 구분선일 때만 허용한다.
  const normalized = text.replace(
    /^(송금\s*받기|송금|충전|출금|입금)\s+[1Il]\s+(?=카카오\s*페이\s*머니)/,
    "$1 | ",
  );
  const pay = normalized.match(PAY_ROW);
  if (pay) return { kind: pay[1].replace(/\s+/g, ""), detail: pay[2].trim() };
  const subscription = text.match(/^My\s*구독\s*[-－–—·•]\s*(.+)$/i);
  if (subscription) return { kind: "결제", detail: subscription[1].trim() };
  // 화면이 카카오페이로 판별된 뒤에만 구분선 누락을 허용한다. 다른 은행의 송금 상호는 그대로 둔다.
  const missing = allowMissingDivider
    ? text.match(
        /^(결제\s*취소\s*[·・•ㆍ]?\s*환불|송금\s*받기|송금|결제|충전|출금|입금)\s+(?![1Il]\s)(\S.*)$/,
      )
    : null;
  return missing
    ? { kind: missing[1].replace(/\s+/g, ""), detail: missing[2].trim() }
    : null;
}

function payText(row: OcrLine[]): string {
  return row
    .filter((l) => !PAY_LOGO.test(l.text))
    .map((l) => l.text)
    .join(" ");
}

/** 월·일만 있는 날짜의 연도를 오늘 기준 가장 가까운 과거로 정한다. */
export function resolveDate(month: number, day: number, today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const year = month > m || (month === m && day > d) ? y - 1 : y;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

function detect(rows: OcrLine[][]): ImportSource | null {
  const text = rows.map((r) => r.map((l) => l.text).join(" ")).join("\n");
  if (
    /카카오\s*페이\s*머니|카드\s*만들기/.test(text) ||
    rows.some((r) => payDetail(payText(r)))
  )
    return "kakaopay";
  // 거래 행의 "내 토스뱅크 계좌" 같은 문구가 섞이므로 화면 고유 문구만 본다.
  if (/입출금통장|가져오기/.test(text)) return "kakaobank";
  if (/채우기|보내기/.test(text)) return "toss";
  // 잔액 열이 있는 화면은 어느 쪽이든 같은 규칙으로 읽는다.
  if (/잔액/.test(text) || rows.some((r) => r.some((l) => AMOUNT.test(l.text))))
    return "toss";
  // 위아래를 자르면 앱 이름·버튼·원 단위가 모두 사라질 수 있다.
  // 날짜 뒤의 거래/시각/잔액 열이 맞을 때만 기존 토스 규칙으로 읽는다.
  let dated = false;
  return rows.some((row, i) => {
    if (
      DATE_DOT.test(row[0]?.text ?? "") ||
      DATE_KOR.test(row.map((l) => l.text).join(" "))
    )
      dated = true;
    return (
      dated &&
      hasBankColumns(row, rows[i + 1] ?? []) &&
      BANK_LOOSE_AMOUNT.test(row[row.length - 1].text)
    );
  })
    ? "toss"
    : null;
}

/** 원 없는 금액을 화면 판별과 거래 해석에서 같은 행·열 조건으로 제한한다. */
function hasBankColumns(row: OcrLine[], subRow: OcrLine[]): boolean {
  if (row.length < 2 || subRow.length !== 2) return false;
  const amount = row[row.length - 1];
  const [time, balance] = subRow;
  return (
    TIME.test(time.text) &&
    balance.x > time.x * 2 &&
    amount.x > row[row.length - 2].x * 2 &&
    Math.abs(amount.x - balance.x) <= Math.max(30, amount.x * 0.25) &&
    BANK_AMOUNT_SHAPE.test(balance.text)
  );
}

type Raw = {
  date: string;
  title: string;
  sub: string;
  amountText: string;
  amount: number;
  sign: "+" | "-" | null;
  balance: number | null;
  amountReview?: boolean;
};

function finish(source: ImportSource, raws: Raw[]): ImportCandidate[] {
  // 화면은 최신순이다. 다음 항목(더 오래된 거래)의 잔액과 비교하면 부호를 확인할 수 있다.
  return raws.map((r, i) => {
    const review: string[] = [];
    if (r.amountReview) review.push("금액의 원 표시를 정확히 읽지 못했어요");
    let type: ImportCandidate["type"] = null;
    const next = raws[i + 1];
    if (r.sign) type = r.sign === "+" ? "INCOME" : "EXPENSE";
    else if (r.balance != null && next?.balance != null)
      type = r.balance - next.balance === r.amount ? "INCOME" : "EXPENSE";
    else if (REFUND.test(r.sub) || /입금|급여/.test(r.sub)) type = "INCOME";
    if (type === null) review.push(REVIEW_TYPE);
    if (r.balance != null && next?.balance != null && type) {
      const delta = type === "INCOME" ? r.amount : -r.amount;
      if (r.balance - next.balance !== delta)
        review.push("잔액과 금액이 맞지 않아요");
    }
    const refund = REFUND.test(r.sub) || REFUND.test(r.title);
    return {
      date: r.date,
      title: r.title,
      amount: r.amount,
      type,
      balance: r.balance,
      ownTransfer: OWN.test(r.sub) || OWN.test(r.title),
      refund,
      review,
    };
  });
}

function parseBalanceStyle(rows: OcrLine[][], today: string): Raw[] {
  const out: Raw[] = [];
  let date: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const joined = row.map((l) => l.text).join(" ");
    const head = joined.match(DATE_KOR);
    if (head) {
      date = resolveDate(Number(head[1]), Number(head[2]), today);
      continue;
    }
    // 금액이 깨진 행의 날짜도 다음 거래에 이어진다. 숫자를 고쳐 잘못된 금액으로 가져오지는 않는다.
    const dot = row[0]?.text.match(DATE_DOT);
    if (dot) date = resolveDate(Number(dot[1]), Number(dot[2]), today);
    if (TIME.test(row[0]?.text ?? "")) continue;
    // 거래 행: 오른쪽 끝에 금액이 있고 바로 아래 행에 부제와 잔액이 있다.
    const amountLine = row[row.length - 1];
    const subRow = rows[i + 1] ?? [];
    const balLine = subRow[subRow.length - 1];
    // 원 없는 숫자는 날짜가 있고, 아래 행의 시각과 별도 오른쪽 잔액 열이 확인될 때만 후보로 둔다.
    const bankColumns = hasBankColumns(row, subRow);
    const exactAmount = amountLine?.text.match(AMOUNT);
    const am =
      exactAmount ??
      (bankColumns ? amountLine.text.match(BANK_LOOSE_AMOUNT) : null);
    if (!am || (row.length < 2 && !DATE_DOT.test(row[0].text))) continue;
    const rest = row.slice(0, -1);
    const title = rest
      .filter((l) => !DATE_DOT.test(l.text))
      .map((l) => l.text)
      .join(" ")
      .trim();
    if (!title || !date) continue;
    const bm =
      balLine &&
      (unsigned(balLine.text.replace(/^잔액\s*/, "")).match(AMOUNT) ??
        (bankColumns ? balLine.text.match(BANK_LOOSE_AMOUNT) : null));
    const sub = subRow
      .slice(0, bm || bankColumns ? -1 : undefined)
      .map((l) => l.text.replace(/\s*잔액$/, ""))
      .join(" ")
      .trim();
    out.push({
      date,
      title,
      sub,
      amountText: amountLine.text,
      amount: won(am),
      sign: am[1] ? (am[1] === "+" ? "+" : "-") : null,
      balance: bm ? won(bm) : null,
      amountReview: !exactAmount,
    });
    if (bm || bankColumns) i++;
  }
  return out;
}

function parsePay(rows: OcrLine[][], today: string): Raw[] {
  const out: Raw[] = [];
  let month: number | null = null;
  let date: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const joined = payText(row);
    const mh = joined.match(MONTH_HEAD);
    if (mh) month = Number(mh[1]);
    const dm = joined.match(DATE_DAY);
    if (dm && month != null) {
      date = resolveDate(month, Number(dm[1]), today);
      continue;
    }
    const inlineAmount =
      row.length > 1 && row[row.length - 1].text.match(AMOUNT);
    const pm = payDetail(
      inlineAmount ? payText(row.slice(0, -1)) : joined,
      true,
    );
    if (!pm || !date) continue;
    // ML Kit이 왼쪽 로고를 임의 글자로 읽기도 한다. 제목 열의 내용이나 날짜는 건너뛰지 않는다.
    const titleLeft = row.find((l) => !PAY_LOGO.test(l.text))!.x;
    let amountRow = i;
    let amountLine: OcrLine | undefined = inlineAmount
      ? row[row.length - 1]
      : undefined;
    for (let j = i + 1; !amountLine && j < rows.length; j++) {
      const next = rows[j];
      const nextText = payText(next);
      if (DATE_DAY.test(nextText) || MONTH_HEAD.test(nextText)) break;
      if (next.every((l) => PAY_LOGO.test(l.text) && l.x < row[0].x)) continue;
      if (next.every((l) => l.x < titleLeft * 0.65)) continue;
      const content = next.filter((l) => !PAY_LOGO.test(l.text));
      if (
        content.length === 1 &&
        (AMOUNT.test(content[0].text) ||
          (PAY_BARE_AMOUNT.test(content[0].text) &&
            Math.abs(content[0].x - titleLeft) <=
              Math.max(14, titleLeft * 0.25)))
      ) {
        amountLine = content[0];
        amountRow = j;
      }
      break;
    }
    const am =
      amountLine?.text.match(AMOUNT) ?? amountLine?.text.match(PAY_BARE_AMOUNT);
    if (!amountLine || !am) continue;
    const { kind, detail } = pm;
    const arrow = detail.split(/→/);
    const income = am[1] === "+";
    const counterpart =
      arrow.length === 2 ? (income ? arrow[0] : arrow[1]) : detail;
    out.push({
      date,
      title: counterpart.replace(/\([^)]*\)/g, "").trim() || detail,
      sub: `${kind} ${detail}`,
      amountText: amountLine.text,
      amount: won(am),
      sign: am[1] ? (income ? "+" : "-") : null,
      balance: null,
    });
    i = amountRow;
  }
  return out;
}

export function parseReceipt(lines: OcrLine[], today: string): ParseResult {
  const rows = toRows(lines);
  const source = detect(rows);
  if (!source) return { source: null, items: [] };
  const raws =
    source === "kakaopay"
      ? parsePay(rows, today)
      : parseBalanceStyle(rows, today);
  return { source, items: finish(source, raws) };
}

/** 원문 없이 실패한 단계를 구분하는 로컬 진단용 개수만 반환한다. */
export function receiptDiagnostics(lines: OcrLine[]) {
  const rows = toRows(lines);
  const isPay = detect(rows) === "kakaopay";
  return {
    lines: lines.length,
    rows: rows.length,
    amounts: rows
      .flat()
      .filter(
        (l) => AMOUNT.test(l.text) || (isPay && PAY_BARE_AMOUNT.test(l.text)),
      ).length,
    dates: rows
      .flat()
      .filter((l) => DATE_DOT.test(l.text) || DATE_KOR.test(l.text)).length,
    payMonths: rows.filter((r) => MONTH_HEAD.test(payText(r))).length,
    payDays: rows.filter((r) => DATE_DAY.test(payText(r))).length,
    payDetails: rows.filter((r) => payDetail(payText(r), isPay)).length,
  };
}
