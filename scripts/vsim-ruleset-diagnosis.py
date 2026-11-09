"""가상 시뮬레이션 룰셋 신뢰도 진단(읽기 전용). 측정 기록: docs/reference/vsim-ruleset-diagnosis-2026-11-09.md

서버 룰셋(VirtualSimRules·VirtualSimCategory vsim-types-v3)과 같은 분류·기준일로 유형별 5거래일 경로를 다시 만들고,
시장 조정·정정공시·겹침·종목 쏠림·기간 안정성·기준일 당일 움직임·공시 상세 내용별 차이를 잰다. 표준 라이브러리만 쓴다.

입력: 로컬 H2 DB "사본"에서 내보낸 CSV 4개(DB 원본을 열지 말고 .mv.db 파일을 복사해서 연다).
  java -cp h2-2.4.240.jar org.h2.tools.Shell -user sa -password "" \
    -url "jdbc:h2:file:<사본 경로>/flexable-web;MODE=MySQL;DATABASE_TO_LOWER=TRUE;ACCESS_MODE_DATA=r" -sql "
    call csvwrite('<DIR>/prices.csv','select i.code, i.market, p.trade_date, p.close from daily_prices p join instruments i on i.id=p.instrument_id where i.kind=''STOCK'' order by i.code, p.trade_date');
    call csvwrite('<DIR>/disc.csv','select d.receipt_no, d.stock_code, d.title, d.receipt_date from dart_disclosures d join dart_disclosure_archive a on a.stock_code=d.stock_code where a.covered_from is not null');
    call csvwrite('<DIR>/details.csv','select receipt_no, category, items, version from dart_disclosure_details')"
실행: python3 scripts/vsim-ruleset-diagnosis.py <DIR> > report.md   (details.csv가 없으면 부록을 건너뛴다)
"""
import csv, math, re, sys, bisect
from collections import defaultdict
from datetime import date

D = sys.argv[1]
FOLLOW = 5
SPLIT = date(2024, 5, 10)

# ---- VirtualSimCategory(vsim-types-v3) 그대로 ----
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
STRIP = re.compile(r"[\s ·ㆍ・/]")


def classify(title):
    t = STRIP.sub("", title)
    if any(w in t for w in ("해지", "철회", "취소")) or any(w in t for w in ("증권발행실적보고서", "실적공시예고")):
        return None
    for code, _, kws in CATS:
        if any(k in t for k in kws):
            return None if code == "FACILITY" and "처분" in t else code
    return None


def is_correction(title):
    return bool(re.match(r"\s*\[[^\]]*정정[^\]]*\]", title))


# ---- 시세 ----
px = defaultdict(lambda: ([], []))
mkt_of = {}
with open(f"{D}/prices.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        code = r["code"]
        ds, cs = px[code]
        ds.append(date.fromisoformat(r["trade_date"]))
        cs.append(int(r["close"]))
        mkt_of[code] = r["market"]

# 시장 대용: 시장별 동일가중 하루 수익률(수집 200종목)
acc = defaultdict(lambda: [0.0, 0])
for code, (ds, cs) in px.items():
    m = mkt_of[code]
    for i in range(1, len(ds)):
        if cs[i - 1] > 0:
            a = acc[(m, ds[i])]
            a[0] += cs[i] / cs[i - 1] - 1
            a[1] += 1
mret = {k: v[0] / v[1] for k, v in acc.items()}


def fwd(code, b):
    """기준 봉 b → (원 5일 수익률, 시장 5일 수익률, 기준일 당일 수익률)"""
    ds, cs = px[code]
    raw = cs[b + FOLLOW] / cs[b] - 1
    m = 1.0
    for k in range(1, FOLLOW + 1):
        m *= 1 + mret.get((mkt_of[code], ds[b + k]), 0.0)
    d0 = cs[b] / cs[b - 1] - 1 if b >= 1 else None
    return raw, m - 1, d0


# ---- 공시 ----
seen = set()
filings = defaultdict(list)  # code -> [(base, cat, receipt, title, date, corr)]
all_titles = 0
with open(f"{D}/disc.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        all_titles += 1
        rn = r["receipt_no"]
        if rn in seen:
            continue
        seen.add(rn)
        c = classify(r["title"])
        code = r["stock_code"]
        if c is None or code not in px:
            continue
        ds, _ = px[code]
        rd = date.fromisoformat(r["receipt_date"])
        b = bisect.bisect_right(ds, rd) - 1
        if b < 0:
            continue
        filings[code].append((b, c, rn, r["title"], rd, is_correction(r["title"])))

samples = []
for code, fl in filings.items():
    ds, cs = px[code]
    bases = sorted(x[0] for x in fl)
    for b, c, rn, title, rd, corr in fl:
        if b + FOLLOW >= len(cs) or b < 1:
            continue
        raw, mk, d0 = fwd(code, b)
        # 겹침: 같은 종목의 다른 분류 공시 기준 봉이 [b-5, b+5] 안(자기 자신 1건 제외)
        lo, hi = bisect.bisect_left(bases, b - FOLLOW), bisect.bisect_right(bases, b + FOLLOW)
        overlap = (hi - lo) > 1
        samples.append(dict(code=code, cat=c, rn=rn, date=rd, b=b, raw=raw, ex=raw - mk, d0=d0, corr=corr, overlap=overlap,
                            sign=(cs[b + FOLLOW] > cs[b]) - (cs[b + FOLLOW] < cs[b])))

# ---- 기준선: 모든 종목·모든 날(5일 앞 자료가 있는 날), 분류 공시 창 밖의 날 ----
win = defaultdict(set)
for code, fl in filings.items():
    for b, *_ in fl:
        for k in range(0, FOLLOW + 1):
            win[code].add(b + k)
base_all, base_quiet = [], []
d0_all = []
for code, (ds, cs) in px.items():
    for b in range(1, len(cs) - FOLLOW):
        raw, mk, d0 = fwd(code, b)
        t = (raw, raw - mk, ds[b])
        base_all.append(t)
        d0_all.append(abs(d0))
        if b not in win[code]:
            base_quiet.append(t)


def share_up(xs):
    xs = list(xs)
    return (sum(1 for x in xs if x > 0) / len(xs), len(xs)) if xs else (float("nan"), 0)


def wilson(p, n, z=1.96):
    if n == 0:
        return (float("nan"),) * 2
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / d, (c + h) / d)


def pval(p, n, p0):
    if n == 0:
        return float("nan")
    z = (p - p0) / math.sqrt(p0 * (1 - p0) / n)
    return math.erfc(abs(z) / math.sqrt(2))


def median(xs):
    xs = sorted(xs)
    n = len(xs)
    return float("nan") if n == 0 else (xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2)


def trend(p, n):
    return "UP" if n >= 100 and p >= 0.55 else "DOWN" if n >= 100 and p <= 0.45 else "MIXED"


def pct(x):
    return "  -  " if x != x else f"{x * 100:5.1f}"


out = []
P = out.append

P(f"# 자료: 공시 {all_titles:,}건(접수번호 중복 제거 {len(seen):,}), 분류된 표본(5거래일 후 종가 있음) {len(samples):,}, 종목 {len(px)}")
P(f"# 시장 대용: 수집 종목 시장별 동일가중 평균(KOSPI·KOSDAQ 지수는 DB에 21일치뿐이라 못 씀)\n")

# 1. 기준선
P("## 1. 기준선(공시 아닌 날 포함) 5거래일 상승 비율")
for lab, xs in (("모든 날", base_all), ("분류 공시 창 밖의 날", base_quiet)):
    pr, n = share_up(x[0] for x in xs)
    pe, _ = share_up(x[1] for x in xs)
    P(f"- {lab}: 원 {pct(pr)}% · 시장 대비 초과 {pct(pe)}% (n={n:,})")
for lab, cond in (("앞 절반(~2024-05-09)", lambda d: d < SPLIT), ("뒤 절반(2024-05-10~)", lambda d: d >= SPLIT)):
    pr, n = share_up(x[0] for x in base_quiet if cond(x[2]))
    pe, _ = share_up(x[1] for x in base_quiet if cond(x[2]))
    P(f"  - 창 밖, {lab}: 원 {pct(pr)}% · 초과 {pct(pe)}% (n={n:,})")
P0_RAW = share_up(x[0] for x in base_quiet)[0]
P0_EX = share_up(x[1] for x in base_quiet)[0]
P("")

bycat = defaultdict(list)
for s in samples:
    bycat[s["cat"]].append(s)
order = [c for c, _, _ in CATS if c in bycat]

# 2. 원 vs 초과
P("## 2. 유형별: 지금 방식(원 수익률) vs 시장 조정(초과수익) · Wilson 95% · 기준선 대비 p값")
P(f"기준선(창 밖): 원 {pct(P0_RAW)}%, 초과 {pct(P0_EX)}%. p*는 12개 유형 Bonferroni 기준 0.05/12=0.0042 미만이면 표시\n")
P("| 유형 | n | 원 상승% | 95% 구간 | 지금 판정 | 기준선 대비 p | 초과 상승% | 95% 구간 | 기준선 대비 p | 초과 중앙값% |")
P("|---|---:|---:|---|---|---:|---:|---|---:|---:|")
for c in order:
    L = bycat[c]
    n = len(L)
    pr = sum(1 for s in L if s["sign"] > 0) / n  # 서버와 같은 방식(종가 비교)
    lo, hi = wilson(pr, n)
    pe = sum(1 for s in L if s["ex"] > 0) / n
    elo, ehi = wilson(pe, n)
    p1, p2 = pval(pr, n, P0_RAW), pval(pe, n, P0_EX)
    P(f"| {NAME[c]} | {n:,} | {pct(pr)} | {pct(lo)}~{pct(hi)} | {trend(pr, n)} | {p1:.4f}{'*' if p1 < 0.05/12 else ''} | {pct(pe)} | {pct(elo)}~{pct(ehi)} | {p2:.4f}{'*' if p2 < 0.05/12 else ''} | {median([s['ex'] for s in L]) * 100:+.2f} |")
P("")

# 3. 정정
P("## 3. 정정공시([기재정정] 등) 비율과 뺐을 때")
P("| 유형 | n | 정정 비율% | 원 상승%(전체) | 원 상승%(정정 제외) | n(정정 제외) |")
P("|---|---:|---:|---:|---:|---:|")
for c in order:
    L = bycat[c]
    K = [s for s in L if not s["corr"]]
    P(f"| {NAME[c]} | {len(L):,} | {pct(sum(s['corr'] for s in L) / len(L))} | {pct(sum(s['sign'] > 0 for s in L) / len(L))} | {pct(sum(s['sign'] > 0 for s in K) / len(K) if K else float('nan'))} | {len(K):,} |")
P("")

# 4. 겹침
P("## 4. 겹침: 같은 종목에서 앞뒤 5거래일 안에 다른 분류 공시가 있는 표본")
P("| 유형 | n | 겹침 비율% | 원 상승%(겹침 제외) | 초과 상승%(겹침 제외) | n(겹침 제외) |")
P("|---|---:|---:|---:|---:|---:|")
for c in order:
    L = bycat[c]
    K = [s for s in L if not s["overlap"]]
    P(f"| {NAME[c]} | {len(L):,} | {pct(sum(s['overlap'] for s in L) / len(L))} | {pct(sum(s['sign'] > 0 for s in K) / len(K) if K else float('nan'))} | {pct(sum(s['ex'] > 0 for s in K) / len(K) if K else float('nan'))} | {len(K):,} |")
P("")

# 5. 종목 쏠림
CAP = 10
P(f"## 5. 종목 쏠림: 상위 5종목 비중, 종목당 {CAP}건 상한(시간순 앞 {CAP}건)")
P("| 유형 | n | 종목 수 | 상위5 비중% | 원 상승%(상한) | 초과 상승%(상한) | n(상한) |")
P("|---|---:|---:|---:|---:|---:|---:|")
for c in order:
    L = sorted(bycat[c], key=lambda s: (s["date"], s["rn"]))
    cnt = defaultdict(int)
    for s in L:
        cnt[s["code"]] += 1
    top5 = sum(sorted(cnt.values(), reverse=True)[:5]) / len(L)
    used = defaultdict(int)
    K = []
    for s in L:
        if used[s["code"]] < CAP:
            used[s["code"]] += 1
            K.append(s)
    P(f"| {NAME[c]} | {len(L):,} | {len(cnt)} | {pct(top5)} | {pct(sum(s['sign'] > 0 for s in K) / len(K))} | {pct(sum(s['ex'] > 0 for s in K) / len(K))} | {len(K):,} |")
P("")

# 6/7. 기간 안정성
P("## 6. 기간 안정성: 앞 절반(~2024-05-09) vs 뒤 절반(2024-05-10~)")
P("| 유형 | 앞 n | 앞 원% | 앞 판정 | 뒤 n | 뒤 원% | 뒤 판정 | 앞 초과% | 뒤 초과% |")
P("|---|---:|---:|---|---:|---:|---|---:|---:|")
for c in order:
    A = [s for s in bycat[c] if s["date"] < SPLIT]
    B = [s for s in bycat[c] if s["date"] >= SPLIT]
    f = lambda X, k: (sum((s["sign"] > 0) if k == "raw" else (s["ex"] > 0) for s in X) / len(X)) if X else float("nan")
    P(f"| {NAME[c]} | {len(A):,} | {pct(f(A, 'raw'))} | {trend(f(A, 'raw'), len(A)) if A else '-'} | {len(B):,} | {pct(f(B, 'raw'))} | {trend(f(B, 'raw'), len(B)) if B else '-'} | {pct(f(A, 'ex'))} | {pct(f(B, 'ex'))} |")
P("")

# 8. 기준일 당일
P("## 8. 기준일 당일(전날 종가 → 접수일 종가) 움직임: 경로에서 빠지는 반응")
P(f"평소 하루 |등락| 평균: {sum(d0_all) / len(d0_all) * 100:.2f}%\n")
P("| 유형 | 당일 |등락| 평균% | 당일 상승% | 5일 경로 |누적| 평균% |")
P("|---|---:|---:|---:|")
for c in order:
    L = bycat[c]
    P(f"| {NAME[c]} | {sum(abs(s['d0']) for s in L) / len(L) * 100:.2f} | {pct(sum(s['d0'] > 0 for s in L) / len(L))} | {sum(abs(s['raw']) for s in L) / len(L) * 100:.2f} |")
P("")

# 종합: 정정 제외 + 겹침 제외 + 종목 상한 + 초과수익 + 기준선 대비 Bonferroni
P("## 종합: 정정 제외·겹침 제외·종목당 10건 상한·초과수익 기준")
P("| 유형 | n | 초과 상승% | 95% 구간 | 기준선 대비 p | 판정(구간이 기준선 밖 & p*) | 지금 판정 |")
P("|---|---:|---:|---|---:|---|---|")
for c in order:
    L = sorted([s for s in bycat[c] if not s["corr"] and not s["overlap"]], key=lambda s: (s["date"], s["rn"]))
    used = defaultdict(int)
    K = []
    for s in L:
        if used[s["code"]] < CAP:
            used[s["code"]] += 1
            K.append(s)
    n = len(K)
    full = bycat[c]
    now = trend(sum(s["sign"] > 0 for s in full) / len(full), len(full))
    if n == 0:
        P(f"| {NAME[c]} | 0 | - | - | - | - | {now} |")
        continue
    pe = sum(s["ex"] > 0 for s in K) / n
    lo, hi = wilson(pe, n)
    p = pval(pe, n, P0_EX)
    j = "UP" if lo > P0_EX and p < 0.05 / 12 else "DOWN" if hi < P0_EX and p < 0.05 / 12 else "MIXED"
    P(f"| {NAME[c]} | {n:,} | {pct(pe)} | {pct(lo)}~{pct(hi)} | {p:.4f} | {j} | {now} |")


# ---- 부록: 공시 상세 내용(DS005, dart_disclosure_details)으로 나눈 예비 측정 ----
import json, os
if os.path.exists(f"{D}/details.csv"):
    det = {}
    with open(f"{D}/details.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            det[r["receipt_no"]] = {it["label"]: it["value"] for it in json.loads(r["items"])}

    def ratio_bucket(v):
        x = float(v.rstrip("%"))
        return "10% 미만" if x < 10 else "10~30%" if x < 30 else "30% 이상"

    def first_use(v):
        return v.split(" ")[0] + (" 100%" if v.endswith("100%") and "·" not in v else " 등 섞임")

    GROUPS = [
        ("NEW_SHARES", "증자 방식", lambda v: v),
        ("NEW_SHARES", "새 주식 수(기존 대비)", ratio_bucket),
        ("NEW_SHARES", "자금 용도", first_use),
        ("BUYBACK_ACQUIRE", "취득 방법", lambda v: v),
        ("BUYBACK_ACQUIRE", "취득 목적", lambda v: "소각 포함" if "소각" in v else "소각 없음"),
        ("BUYBACK_DISPOSE", "처분 목적", lambda v: v),
        ("BONDS", "사채 종류", lambda v: v),
        ("RESTRUCTURE", "분할 방법", lambda v: v),
        ("RESTRUCTURE", "상대 회사와의 관계", lambda v: v),
    ]
    P("\n## 부록: 공시 상세 내용으로 나눈 예비 측정(배치고사용 dart_disclosure_details, 정정 제외 안 함)")
    P(f"상세가 붙은 표본만. 기준선(창 밖) 원 {pct(P0_RAW)}%·초과 {pct(P0_EX)}%. n<20 행은 생략\n")
    P("| 유형 | 항목 | 값 | n | 원 상승% | 초과 상승% | 95% 구간(초과) | 기준선 대비 p | 초과 중앙값% |")
    P("|---|---|---|---:|---:|---:|---|---:|---:|")
    for cat, label, fn in GROUPS:
        g = defaultdict(list)
        for s in bycat.get(cat, []):
            d = det.get(s["rn"])
            if d and label in d:
                g[fn(d[label])].append(s)
        for v, L in sorted(g.items(), key=lambda kv: -len(kv[1])):
            n = len(L)
            if n < 20:
                continue
            pr = sum(s["sign"] > 0 for s in L) / n
            pe = sum(s["ex"] > 0 for s in L) / n
            lo, hi = wilson(pe, n)
            p = pval(pe, n, P0_EX)
            P(f"| {NAME[cat]} | {label} | {v} | {n} | {pct(pr)} | {pct(pe)} | {pct(lo)}~{pct(hi)} | {p:.4f}{'*' if p < 0.05/12 else ''} | {median([s['ex'] for s in L]) * 100:+.2f} |")

print("\n".join(out))
