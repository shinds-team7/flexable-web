"""배치고사 판 기준 모의 계산(Issue #376 2단계, 읽기 전용). 판 기준(policies §8-8, tests/policy/virtual-contest.json placementCuts)을 바꾸지 않는다.

지금 출제·채점 규칙(VirtualContestQuestions, 반응 창 11-09·정정 병합 11-10)을 그대로 따라 문제 10개를 여러 번 뽑고, 전략별 맞힌 수 분포와
판 기준 후보별 판 배정 비율을 낸다. 표준 라이브러리만 쓴다.
  - 문제 풀: 수집 종목(5년 공시를 다 받은 종목)의 최근 5년 공시 중 유형으로 분류되는 원공시. 정정 공시는 같은 공시 열쇠의 가장 가까운 앞 원공시(180일 안)에
    합치고 문제로 내지 않는다. 기준 봉 전날·5번째 후속 거래일이 없거나 공시 직후(전날 종가 → 다음 거래일 종가, 원 가격)가 보합이면 뺀다.
  - 출제: 반응 창 근거 유형(공급 계약·자기주식 취득·시설·지분 투자)에서 4개 + 남은 공시 전체에서 6개. 묶음마다 설명(AI 요약·공시 주요 내용)이 있는 공시를 먼저 고른다.
  - 정답: 공시 직후 방향.
  - 전략: 무작위 / 근거 유형만 ↑(나머지 무작위) / 모두 ↑ / (참고) 유형 다수 방향(풀의 유형별 상승 비율을 아는 경우의 상한).

입력: 로컬 H2 DB "사본"에서 내보낸 CSV(원본 .mv.db를 열지 말고 복사해서 연다. 운영 DB는 사람이 같은 SELECT로 내보낸다).
  java -cp h2-2.4.240.jar org.h2.tools.Shell -user sa -password "" \
    -url "jdbc:h2:file:<사본 경로>/flexable-web;MODE=MySQL;DATABASE_TO_LOWER=TRUE;ACCESS_MODE_DATA=r" -sql "
    call csvwrite('<DIR>/stocks.csv','select i.code, i.name from instruments i join dart_disclosure_archive a on a.stock_code = i.code where i.kind = ''STOCK'' and i.cap_rank is not null and a.covered_to is not null and a.pending_from is null');
    call csvwrite('<DIR>/prices.csv','select i.code, p.trade_date, p.close from daily_prices p join instruments i on i.id = p.instrument_id where i.kind = ''STOCK'' order by i.code, p.trade_date');
    call csvwrite('<DIR>/disc.csv','select receipt_no, stock_code, title, receipt_date from dart_disclosures');
    call csvwrite('<DIR>/details.csv','select receipt_no, items from dart_disclosure_details');
    call csvwrite('<DIR>/summaries.csv','select receipt_no from dart_disclosure_summaries where summary is not null and hidden = false')"
  details.csv·summaries.csv가 없으면 "설명 먼저"를 반영하지 않고 모두 설명 없는 공시로 본다(보고서에 적는다).
  쉼표 CSV와 탭 구분(mysql --batch 출력) 둘 다 읽는다.
실행: python3 scripts/placement-cuts-sim.py sim <DIR> [--trials 20000] [--seed 376] [--asof YYYY-MM-DD] > report.md
한계: 서버의 수집 종목은 상위 목록(topLimit) 안 종목이라 stocks.csv(cap_rank 있는 수집 종목)와 조금 다를 수 있다. 풀 캐시(POOL_TTL) 시점 차이도 무시한다.

실제 결과 집계(actual 모드): 채점된 배치고사 중 모든 문제가 basis = REACTION인 것만 시즌별로 모은다(11-09 배포 전에 시작해 5거래일로 채점한 것과
예시 자료 문제는 빼고 수만 센다). 회원 번호·배치고사 번호는 내보내지 않고 집계만 낸다.
  call csvwrite('<DIR>/placements.csv','select contest_id, correct, board, graded_at, result from virtual_contest_placements where graded_at is not null')
  문제 유형: 채점하면 문제 사본(questions)을 지우고 결과 JSON에는 유형이 없어서, 결과의 회사명·날짜를 stocks.csv(code, name)·disc.csv의
  같은 종목·같은 접수일 공시 유형으로 되찾는다(11-10 전 출제는 정정 공시도 문제였으므로 포함). 그날 유형이 둘 이상이면 결과에 남은 유형 통계
  (categorySampleCount·trend)로 가리고, 그래도 모르면 "알 수 없음"이다. 두 파일이 없으면 유형별 표를 건너뛴다.
실행: python3 scripts/placement-cuts-sim.py actual <DIR> [--min-n N] > report.md   (--min-n: 그보다 응시 수가 적은 시즌에 "최소 응시 수 미달" 표시)
"""
import argparse
import bisect
import csv
import json
import random
import re
import sys
from collections import defaultdict
from datetime import date

csv.field_size_limit(10**9)

FOLLOW = 5
POOL_YEARS = 5
CORRECTION_DAYS = 180
EVIDENCE, ANY = 4, 6
QUESTIONS = EVIDENCE + ANY
CURRENT_CUTS = (7, 9)
CUT_B50M = (6, 7, 8)
CUT_B100M = (8, 9, 10)

# ---- VirtualSimCategory(vsim-types-v4) 그대로 ----
CATS = [
    ("EARNINGS", "실적 발표", ["잠정", "실적", "매출액또는손익구조"]),
    ("SUPPLY_CONTRACT", "공급 계약", ["공급계약", "수주"]),
    ("NEW_SHARES", "유상증자", ["유상증자"]),
    ("BONUS_SHARES", "무상증자", ["무상증자"]),
    ("BONDS", "사채 발행", ["전환사채", "신주인수권부사채", "교환사채"]),
    ("BUYBACK_ACQUIRE", "자기주식 취득", ["자기주식취득"]),
    ("BUYBACK_DISPOSE", "자기주식 처분", ["자기주식처분"]),
    ("DIVIDEND", "배당", ["배당"]),
    ("RESTRUCTURE", "합병·분할", ["합병", "분할", "공개매수", "영업양수", "영업양도"]),
    ("FACILITY", "시설·지분 투자", ["신규시설투자", "유형자산", "타법인주식"]),
    ("LEGAL", "소송·사고", ["소송", "횡령", "배임", "중대재해", "영업정지"]),
    ("OWNERSHIP", "최대주주 변경", ["최대주주변경"]),
]
NAME = {c: n for c, n, _ in CATS}
ORDER = [c for c, _, _ in CATS]
EVIDENCE_TYPES = {"SUPPLY_CONTRACT", "BUYBACK_ACQUIRE", "FACILITY"}
REVERSED = ("해지", "철회", "취소")
NOT_EVENTS = ("증권발행실적보고서", "실적공시예고", "실적발표일정", "영업실적등에대한전망", "소액공모실적보고서")
# Java 정규식 \s(ASCII 공백) + U+00A0 + 가운뎃점·빗금
STRIP = re.compile(r"[ \t\n\x0b\f\r\u00a0·ㆍ・/]")
PREFIX = re.compile(r"^(\[[^\]]*\]\s*)+")
CORRECTION = re.compile(r"(\[[^\]]*\]\s*)*\[[^\]]*정정[^\]]*\].*")


def classify(title):
    if title is None:
        return None
    t = STRIP.sub("", title)
    if any(w in t for w in REVERSED) or any(w in t for w in NOT_EVENTS):
        return None
    for code, _, kws in CATS:
        if any(k in t for k in kws):
            return None if code == "FACILITY" and "처분" in t else code
    return None


def is_correction(title):
    return title is not None and CORRECTION.fullmatch(title.strip()) is not None


def same_filing_key(title):
    return STRIP.sub("", PREFIX.sub("", title))


def read_rows(path):
    with open(path, encoding="utf-8", newline="") as f:
        head = f.readline()
        f.seek(0)
        yield from csv.DictReader(f, delimiter="\t" if "\t" in head else ",")


def try_rows(path):
    try:
        return list(read_rows(path))
    except FileNotFoundError:
        return None


def years_before(d, n):
    try:
        return d.replace(year=d.year - n)
    except ValueError:  # 2월 29일 → 2월 28일(LocalDate.minusYears와 같음)
        return d.replace(year=d.year - n, day=28)


def day(v):
    return date.fromisoformat(v.strip()[:10])


# ---- 문제 풀(VirtualContestQuestions.merge·fromFilings 그대로) ----
def merge(filings):
    """filings: [(receipt_no, title, date)] → [(원공시, [합친 정정 공시...])]"""
    srt = sorted((f for f in filings if classify(f[1]) is not None), key=lambda f: (f[2], f[0]))
    latest = {}
    corrections = {}
    by_no = {}
    for f in srt:
        by_no[f[0]] = f
        key = same_filing_key(f[1])
        if not is_correction(f[1]):
            latest[key] = f
            corrections[f[0]] = []
            continue
        o = latest.get(key)
        if o is not None and (f[2] - o[2]).days <= CORRECTION_DAYS:
            corrections[o[0]].append(f)
    return [(by_no[no], lst) for no, lst in corrections.items()]


def build_pool(d, asof):
    stocks = {r["code"]: r["name"] for r in read_rows(f"{d}/stocks.csv")}
    rows = list(read_rows(f"{d}/prices.csv"))
    if asof is None:
        asof = max(day(r["trade_date"]) for r in rows)
    start = years_before(asof, POOL_YEARS)
    px = defaultdict(lambda: ([], []))
    for r in rows:
        if r["code"] not in stocks:
            continue
        t = day(r["trade_date"])
        if start <= t <= asof:
            ds, cs = px[r["code"]]
            ds.append(t)
            cs.append(int(r["close"]))
    for code, (ds, cs) in px.items():
        order = sorted(range(len(ds)), key=ds.__getitem__)
        px[code] = ([ds[i] for i in order], [cs[i] for i in order])

    seen = set()
    filings = defaultdict(list)
    for r in read_rows(f"{d}/disc.csv"):
        rn, code = r["receipt_no"], r["stock_code"]
        if rn in seen or code not in stocks:
            continue
        seen.add(rn)
        t = day(r["receipt_date"])
        if start <= t <= asof:
            filings[code].append((rn, r["title"], t))

    det_rows, sum_rows = try_rows(f"{d}/details.csv"), try_rows(f"{d}/summaries.csv")
    detailed = None if det_rows is None else {r["receipt_no"] for r in det_rows if (r.get("items") or "").strip() not in ("", "[]", "null")}
    summarized = None if sum_rows is None else {r["receipt_no"] for r in sum_rows}
    described_known = detailed is not None and summarized is not None
    has_text = (detailed or set()) | (summarized or set())

    pool = []
    for code, fl in filings.items():
        if code not in px:
            continue
        ds, cs = px[code]
        for orig, corrs in merge(fl):
            b = bisect.bisect_right(ds, orig[2]) - 1
            if b < 1 or b + FOLLOW >= len(ds):
                continue
            prev, nxt = cs[b - 1], cs[b + 1]
            if nxt == prev:
                continue
            sources = [orig[0]] + [c[0] for c in corrs]
            pool.append({
                "key": orig[0], "code": code, "title": orig[1], "cat": classify(orig[1]), "up": nxt > prev,
                "described": any(s in has_text for s in sources),
            })
    return pool, asof, described_known


# ---- 출제(VirtualContestQuestions.draw 그대로: 묶음마다 설명 있는 공시를 먼저 무작위로) ----
def pick(rng, tiers, k, used, out):
    for tier in tiers:
        need = k - len(out)
        if need <= 0:
            return
        for c in rng.sample(tier, min(len(tier), need + len(used))):
            if c not in used:
                used.add(c)
                out.append(c)
                if len(out) == k:
                    return


class Drawer:
    def __init__(self, pool, described_first=True):
        ev = [i for i, p in enumerate(pool) if p["cat"] in EVIDENCE_TYPES]
        al = list(range(len(pool)))
        split = lambda xs: ([i for i in xs if pool[i]["described"]], [i for i in xs if not pool[i]["described"]]) if described_first else (xs,)
        self.ev, self.al = split(ev), split(al)
        self.ok = len(ev) >= EVIDENCE and len(al) >= QUESTIONS

    def draw(self, rng):
        used, out = set(), []
        pick(rng, self.ev, EVIDENCE, used, out)
        pick(rng, self.al, QUESTIONS, used, out)
        return out


# ---- 전략 ----
def strategies(pool):
    tally = defaultdict(lambda: [0, 0])
    for p in pool:
        tally[p["cat"]][0] += p["up"]
        tally[p["cat"]][1] += 1
    majority = {c: 2 * m >= n for c, (m, n) in tally.items()}
    return [
        ("무작위", lambda p, rng: rng.random() < 0.5),
        ("근거 유형 ↑ · 나머지 무작위", lambda p, rng: True if p["cat"] in EVIDENCE_TYPES else rng.random() < 0.5),
        ("모두 ↑", lambda p, rng: True),
        ("(참고) 유형 다수 방향", lambda p, rng: majority[p["cat"]]),
    ]


def simulate(pool, trials, seed, described_first=True):
    drawer = Drawer(pool, described_first)
    if not drawer.ok:
        return None
    strats = strategies(pool)
    draw_rng, answer_rng = random.Random(seed), random.Random(seed + 1)
    hist = [[0] * (QUESTIONS + 1) for _ in strats]
    up_questions = ev_up = ev_n = 0
    for _ in range(trials):
        qs = [pool[i] for i in drawer.draw(draw_rng)]
        up_questions += sum(p["up"] for p in qs)
        for p in qs:
            if p["cat"] in EVIDENCE_TYPES:
                ev_n += 1
                ev_up += p["up"]
        for s, (_, fn) in enumerate(strats):
            hist[s][sum(fn(p, answer_rng) == p["up"] for p in qs)] += 1
    return {
        "names": [n for n, _ in strats], "hist": hist, "trials": trials,
        "up_share": up_questions / (trials * QUESTIONS), "ev_per_test": ev_n / trials, "ev_up_share": ev_up / ev_n if ev_n else 0.0,
    }


# ---- 보고서 ----
def pct(x):
    return f"{x * 100:.1f}%"


def stats(h):
    n = sum(h)
    mean = sum(k * c for k, c in enumerate(h)) / n
    sd = (sum((k - mean) ** 2 * c for k, c in enumerate(h)) / n) ** 0.5
    return mean, sd


def boards(h, cut50, cut100):
    n = sum(h)
    return sum(h[:cut50]) / n, sum(h[cut50:cut100]) / n, sum(h[cut100:]) / n


def cut_pairs():
    return [(a, b) for a in CUT_B50M for b in CUT_B100M if a < b]


def pool_table(pool):
    def row(label, ps, evidence=""):
        ds = [p for p in ps if p["described"]]
        share = lambda xs: f"{sum(p['up'] for p in xs) / len(xs):.4f}" if xs else "—"
        print(f"| {label} | {evidence} | {len(ps):,} | {share(ps)} | {len(ds):,} | {share(ds)} |")

    by_cat = defaultdict(list)
    for p in pool:
        by_cat[p["cat"]].append(p)
    print("| 유형 | 근거 유형 | 풀 공시 수 | 공시 직후 ↑ 비율 | 설명 있음 | 설명 있음 ↑ 비율 |")
    print("|---|---|---:|---:|---:|---:|")
    for c in ORDER:
        if c in by_cat:
            row(NAME[c], by_cat[c], "예" if c in EVIDENCE_TYPES else "")
    row("**근거 유형 합**", [p for p in pool if p["cat"] in EVIDENCE_TYPES])
    row("**전체**", pool)
    print()


def report(res, detail=True):
    names, hist = res["names"], res["hist"]
    print(f"출제된 문제 중 정답 ↑ 비율 {pct(res['up_share'])}, 한 번에 근거 유형 문제 평균 {res['ev_per_test']:.2f}개(그중 정답 ↑ {pct(res['ev_up_share'])}).")
    print()
    c50, c100 = CURRENT_CUTS
    print(f"| 전략 | 평균 | 표준편차 | 무작위 대비 | 5천만 이상({c50}·{c100}) | 1억({c50}·{c100}) |")
    print("|---|---:|---:|---:|---:|---:|")
    base = stats(hist[0])[0]
    for name, h in zip(names, hist):
        mean, sd = stats(h)
        _, b50, b100 = boards(h, c50, c100)
        print(f"| {name} | {mean:.2f} | {sd:.2f} | {mean - base:+.2f} | {pct(b50 + b100)} | {pct(b100)} |")
    print()
    if not detail:
        return
    print("**맞힌 수 분포**")
    print()
    print("| 전략 | " + " | ".join(str(k) for k in range(QUESTIONS + 1)) + " |")
    print("|---|" + "---:|" * (QUESTIONS + 1))
    for name, h in zip(names, hist):
        print(f"| {name} | " + " | ".join(pct(c / sum(h)) for c in h) + " |")
    print()
    print("**판 기준 후보별 배정 비율**(1천만 / 5천만 / 1억, ★ = 지금 기준)")
    print()
    print("| 5천만·1억 기준 | " + " | ".join(names) + " |")
    print("|---|" + "---|" * len(names))
    for a, b in cut_pairs():
        cells = [" / ".join(pct(x) for x in boards(h, a, b)) for h in hist]
        print(f"| {a}·{b}{' ★' if (a, b) == CURRENT_CUTS else ''} | " + " | ".join(cells) + " |")
    print()


# 1단계 잔여 분류 문제(Issue #376 5). 넣었을 때와 뺐을 때를 비교한다
SENSITIVITY = [
    ("자기주식취득결과보고서", lambda p: "자기주식취득결과보고서" in STRIP.sub("", p["title"])),
    ("주권매매거래정지", lambda p: "매매거래정지" in STRIP.sub("", p["title"])),
    ("[첨부추가]", lambda p: "첨부추가" in (PREFIX.match(p["title"].strip()) or [""])[0]),
]


def run_sim(args):
    pool, asof, described_known = build_pool(args.dir, args.asof and date.fromisoformat(args.asof))
    print(f"# 배치고사 판 기준 모의 계산({asof} 기준)")
    print()
    print(f"- 문제 풀: {years_before(asof, POOL_YEARS)} ~ {asof} 공시, 원공시 {len(pool):,}건(정정 병합·보합 제외). 시행 {args.trials:,}번, 시드 {args.seed}.")
    if not described_known:
        print("- details.csv·summaries.csv가 없어 \"설명 먼저\" 출제를 반영하지 않았다(모두 설명 없는 공시로 봄).")
    print(f"- 판 기준: 맞힌 수 ≥ 5천만 기준이면 5천만, ≥ 1억 기준이면 1억. 지금 기준 {CURRENT_CUTS[0]}·{CURRENT_CUTS[1]}.")
    print("- \"(참고) 유형 다수 방향\"은 풀 전체의 유형별 상승 비율을 미리 아는 경우라 실제 사용자가 낼 수 있는 상한에 가깝다.")
    print()
    print("## 문제 풀")
    print()
    pool_table(pool)
    res = simulate(pool, args.trials, args.seed)
    if res is None:
        print("문제 풀이 모자라 출제할 수 없다(근거 유형 4개 또는 전체 10개 미만).")
        return
    print("## 결과")
    print()
    report(res)

    if described_known:
        print("## 설명 먼저 출제를 빼면")
        print()
        print("설명(AI 요약·주요 내용) 있는 공시를 먼저 고르는 규칙이 정답 방향을 쏠리게 하는지 본다. 같은 풀에서 묶음 안 공시를 모두 같은 순위로 뽑는다.")
        print()
        report(simulate(pool, args.trials, args.seed, described_first=False), detail=False)

    print("## 민감도: 1단계 잔여 분류 항목")
    print()
    print("| 항목 | 풀 안 건수 | 그중 근거 유형 | 그중 설명 있음 | 공시 직후 ↑ 비율 |")
    print("|---|---:|---:|---:|---:|")
    for label, fn in SENSITIVITY:
        hit = [p for p in pool if fn(p)]
        ev = sum(p["cat"] in EVIDENCE_TYPES for p in hit)
        share = f"{sum(p['up'] for p in hit) / len(hit):.4f}" if hit else "—"
        print(f"| {label} | {len(hit):,} | {ev:,} | {sum(p['described'] for p in hit):,} | {share} |")
    print()
    print("설명 없는 공시는 설명 있는 공시가 모자랄 때만 출제되므로, 지금 설명 상태와 설명 순서를 무시한 경우를 함께 본다. 칸은 평균 맞힌 수 / 지금 기준 5천만 이상 비율.")
    print()
    variants = [("그대로", [])] + [(f"{label} 뺌", [fn]) for label, fn in SENSITIVITY] + [("셋 다 뺌", [fn for _, fn in SENSITIVITY])]
    orders = [("지금 설명 상태", True), ("설명 순서 무시", False)] if described_known else [("설명 순서 무시", False)]
    names = None
    lines = []
    for label, fns in variants:
        sub = [p for p in pool if not any(fn(p) for fn in fns)]
        for oname, first in orders:
            r = simulate(sub, args.trials, args.seed, described_first=first)
            if r is None:
                lines.append(f"| {label} | {oname} | {len(sub):,} | 출제 불가 |")
                continue
            names = r["names"]
            cells = []
            for h in r["hist"]:
                _, b50, b100 = boards(h, *CURRENT_CUTS)
                cells.append(f"{stats(h)[0]:.2f} / {pct(b50 + b100)}")
            lines.append(f"| {label} | {oname} | {len(sub):,} | {pct(r['up_share'])} | " + " | ".join(cells) + " |")
    print("| 풀 | 출제 순서 | 풀 건수 | 정답 ↑ | " + " | ".join(names or []) + " |")
    print("|---|---|---:|---:|" + "---|" * len(names or []))
    print("\n".join(lines))
    print()


# ---- 실제 결과 집계 ----
def graded_items(result):
    """VirtualContestService.gradedItems와 같은 해석: 11-10 전 배열 모양이면 basis가 없는 문제는 5거래일 기준"""
    data = json.loads(result)
    items = data if isinstance(data, list) else data.get("items") or []
    for it in items:
        it["basis"] = it.get("basis") or "FIVE_DAY"
    return items


def category_lookup(d, items):
    """문제 → 유형. 같은 종목·같은 접수일의 분류되는 공시(11-10 전 출제는 정정 공시도 문제였으므로 포함) 유형이 하나면 그 유형.
    둘 이상이면 결과에 남은 출제 때 유형 통계(categorySampleCount·trend)를 유형이 하나로 정해진 다른 문제에서 배운 짝으로 가린다. 그래도 모르면 None"""
    stocks, disc = try_rows(f"{d}/stocks.csv"), try_rows(f"{d}/disc.csv")
    if stocks is None or disc is None:
        return None
    codes = defaultdict(set)
    for r in stocks:
        codes[r["name"]].add(r["code"])
    cats = defaultdict(set)
    for r in disc:
        c = classify(r["title"])
        if c is not None:
            cats[(r["stock_code"], day(r["receipt_date"]))].add(c)

    def candidates(it):
        found = set()
        for code in codes.get(it["company"], ()):
            found |= cats.get((code, day(it["date"])), set())
        return found

    stat = lambda it: (it.get("categorySampleCount"), it.get("trend")) if it.get("categorySampleCount") is not None else None
    learned = defaultdict(set)
    for it in items:
        found = candidates(it)
        if len(found) == 1 and stat(it) is not None:
            learned[stat(it)] |= found

    def lookup(it):
        found = candidates(it)
        if len(found) > 1 and stat(it) is not None and len(learned.get(stat(it), ())) == 1:
            found &= learned[stat(it)]
        return next(iter(found)) if len(found) == 1 else None

    return lookup


def answer_table(rows):
    """rows: [(묶음 이름, [문제...])] → 정답률·답 쏠림 표"""
    print("| 묶음 | 문제 수 | 정답률(무응답 = 틀림) | 응답한 문제 정답률 | 무응답 | ↑ 고른 비율(응답 중) | 실제 ↑ 비율 |")
    print("|---|---:|---:|---:|---:|---:|---:|")
    for label, qs in rows:
        if not qs:
            continue
        answered = [q for q in qs if q.get("prediction")]
        ok = sum(bool(q.get("correct")) for q in qs)
        ok_answered = sum(bool(q.get("correct")) for q in answered)
        picked_up = sum(q["prediction"] == "POSITIVE" for q in answered)
        actual_up = sum(q.get("movement") == "UP" for q in qs)
        ratio = lambda a, b: pct(a / b) if b else "—"
        print(f"| {label} | {len(qs):,} | {ratio(ok, len(qs))} | {ratio(ok_answered, len(answered))} | {ratio(len(qs) - len(answered), len(qs))} | "
              f"{ratio(picked_up, len(answered))} | {ratio(actual_up, len(qs))} |")
    print()


def season_report(title, tests, lookup, min_n):
    n = len(tests)
    print(f"## {title}")
    print()
    if min_n and n < min_n:
        print(f"**최소 응시 수 미달**: 응시 {n}명 < {min_n}명. 아래 분포는 참고만 한다.")
        print()
    hist = [0] * (QUESTIONS + 1)
    stored = defaultdict(int)
    for t in tests:
        hist[t["correct"]] += 1
        stored[t["board"]] += 1
    mean, sd = stats(hist)
    print(f"응시 {n:,}명, 평균 {mean:.2f}, 표준편차 {sd:.2f}. 저장된 판 배정: " +
          " / ".join(f"{b} {stored[b]:,}명({pct(stored[b] / n)})" for b in ("B10M", "B50M", "B100M")) + ".")
    print()
    print("| 맞힌 수 | " + " | ".join(str(k) for k in range(QUESTIONS + 1)) + " |")
    print("|---|" + "---:|" * (QUESTIONS + 1))
    print("| 응시 수 | " + " | ".join(str(c) for c in hist) + " |")
    print("| 비율 | " + " | ".join(pct(c / n) for c in hist) + " |")
    print()
    print("**판 기준 후보별 배정 비율**(1천만 / 5천만 / 1억, ★ = 지금 기준)")
    print()
    print("| 5천만·1억 기준 | 배정 비율 |")
    print("|---|---|")
    for a, b in cut_pairs():
        print(f"| {a}·{b}{' ★' if (a, b) == CURRENT_CUTS else ''} | " + " / ".join(pct(x) for x in boards(hist, a, b)) + " |")
    print()
    items = [it for t in tests for it in t["items"]]
    groups = [("전체", items)]
    if lookup is not None:
        cat = [(it, lookup(it)) for it in items]
        groups += [("근거 유형", [it for it, c in cat if c in EVIDENCE_TYPES]),
                   ("나머지 유형", [it for it, c in cat if c is not None and c not in EVIDENCE_TYPES]),
                   ("알 수 없음", [it for it, c in cat if c is None])]
    if lookup is not None:
        found = sum(c is not None for _, c in cat)
        short = sum(sum(lookup(it) in EVIDENCE_TYPES for it in t["items"]) < EVIDENCE for t in tests)
        print(f"유형을 되찾은 문제 {found:,}/{len(items):,}개. 근거 유형을 {EVIDENCE}개 미만으로 되찾은 시험 {short:,}번"
              f"(시험마다 근거 유형이 {EVIDENCE}개 이상이므로, 0이 아니면 근거 유형 문제 일부가 \"알 수 없음\"에 남아 있다).")
        print()
    print("**문제 묶음별 정답률과 답 쏠림**")
    print()
    answer_table(groups)
    if lookup is not None:
        print("**유형별**")
        print()
        answer_table([(NAME[c], [it for it, k in cat if k == c]) for c in ORDER])


def run_actual(args):
    seasons = defaultdict(list)
    skipped = defaultdict(lambda: defaultdict(int))
    for r in read_rows(f"{args.dir}/placements.csv"):
        items = graded_items(r["result"])
        cid = r["contest_id"]
        if any(it["basis"] != "REACTION" for it in items):
            skipped[cid]["5거래일 채점(배포 전 시작)"] += 1
        elif any(not it.get("date") for it in items):
            skipped[cid]["예시 자료 문제"] += 1
        elif len(items) != QUESTIONS:
            skipped[cid][f"문제 수 {QUESTIONS}개 아님"] += 1
        else:
            seasons[cid].append({"correct": int(r["correct"]), "board": r["board"], "items": items})
    lookup = category_lookup(args.dir, [it for ts in seasons.values() for t in ts for it in t["items"]])
    print("# 배치고사 실제 결과 집계(반응 창 채점)")
    print()
    print("- 대상: 채점된 배치고사 중 모든 문제가 basis = REACTION인 것. 회원·배치고사 번호는 읽지 않는다.")
    if lookup is None:
        print("- stocks.csv·disc.csv가 없어 문제 유형별 표를 건너뛰었다.")
    else:
        print("- 문제 유형은 결과의 회사명·날짜로 같은 날 공시 유형을 되찾았다. 유형이 둘 이상이면 결과의 유형 통계로 가리고, 그래도 모르면 \"알 수 없음\".")
    print(f"- 최소 응시 수 조건: {args.min_n}명(--min-n)" if args.min_n else "- 최소 응시 수 조건: 정하지 않음(--min-n으로 지정).")
    for cid in sorted(set(seasons) | set(skipped)):
        if skipped[cid]:
            print(f"- {cid} 제외: " + ", ".join(f"{k} {v}건" for k, v in skipped[cid].items()))
    print()
    for cid in sorted(seasons):
        season_report(f"시즌 {cid}", seasons[cid], lookup, args.min_n)
    if len(seasons) > 1:
        season_report("전체 시즌", [t for ts in seasons.values() for t in ts], lookup, args.min_n)
    if not seasons:
        print("집계할 반응 창 배치고사가 없다.")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="mode", required=True)
    s = sub.add_parser("sim", help="지금 출제 규칙으로 모의 계산")
    s.add_argument("dir")
    s.add_argument("--trials", type=int, default=20000)
    s.add_argument("--seed", type=int, default=376)
    s.add_argument("--asof", help="문제 풀 기준일(기본: prices.csv의 마지막 거래일)")
    a = sub.add_parser("actual", help="실제 채점 결과 집계(반응 창)")
    a.add_argument("dir")
    a.add_argument("--min-n", type=int, default=0, help="이보다 응시 수가 적은 시즌에 '최소 응시 수 미달' 표시")
    args = ap.parse_args()
    if args.mode == "sim":
        run_sim(args)
    else:
        run_actual(args)


if __name__ == "__main__":
    sys.exit(main())
