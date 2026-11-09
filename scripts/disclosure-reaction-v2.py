"""공시 반응 측정 v2(Issue #371, 읽기 전용). 측정 기록: docs/reference/disclosure-reaction-v2-2026-11-09.md

#369(scripts/vsim-ruleset-diagnosis.py)의 한계를 고친다.
  - 정정공시는 같은 종목·같은 보고서명의 가장 가까운 앞 원공시 한 건으로 합친다(원공시 접수일 기준).
  - 시장 조정은 실제 KOSPI·KOSDAQ 지수(index.csv)를 쓰고, 지수가 모자라면 수집 종목 동일가중 지수로 대신한다(둘 다 표시).
  - 창 두 개: 반응 창 R = 전날 종가 → t+1 종가, 체결 가능 창 T = t+1 종가 → t+5 종가(사용자는 공시를 본 다음 날 체결).
    시가가 있는 봉(ohlc.csv, practice_datasets)에서는 T의 시가 판(t+1 시가 → t+5 종가)도 비교한다.
  - 회귀: 모든 종목·거래일을 행으로 두고(공시 없는 날 = 기준선) 공시 칸 더미 + 겹친 공시 수를 넣는다.
    초과수익은 OLS, 오름 여부는 로지스틱이고 표준오차는 날짜·종목 2중 클러스터다. 겹친 표본을 버리지 않는다.
  - 다중 비교: 판정 대상 칸 전체에 Benjamini-Hochberg(FDR 10%)와 Bonferroni.
  - 기간 검증: 앞 기간(~2024-05-09)과 뒤 기간(2024-05-10~)을 따로 추정해 같은 방향으로 재현되는지 본다.

사전 고정(데이터를 돌리기 전에 커밋, 결과를 본 뒤 바꾸지 않음):
  - 칸 목록: PREREGISTERED. 같은 유형 안에서 항목 묶음(family)마다 유형을 칸으로 나누고, 상세가 없는 공시는 "상세 없음" 칸이다.
  - 판정 대상: 전체 기간 표본이 MIN_N 이상인 칸. 그보다 작으면 표시만 하고 다중 비교 수에 넣지 않는다.
  - "근거 있음": 전체 기간 OLS(창별)에서 BH q < 0.10 이고, 앞 기간 p < 0.05 · 뒤 기간 같은 부호 p < 0.05.
  - 주의: 후보 칸은 #369 부록(탐색 측정)과 같은 묶음이다. 그 결과를 본 상태라 기간 검증이 주된 안전장치다.

입력(CSV, 로컬 H2 DB 사본에서 내보냄. 원본 DB를 열지 않는다):
  prices.csv  : code, market, trade_date, close           (scripts/vsim-ruleset-diagnosis.py 첫머리의 쿼리)
  disc.csv    : receipt_no, stock_code, title, receipt_date (같음)
  details.csv : receipt_no, category, items, version        (같음)
  index.csv   : index_key, trade_date, index_value          select index_key, trade_date, index_value from market_index_daily where index_key in ('KOSPI','KOSDAQ')
  ohlc.csv    : code, payload                               select code, payload from practice_datasets   (없으면 시가 비교를 건너뜀)
실행: python3 -m venv .venv && .venv/bin/pip install numpy statsmodels
      .venv/bin/python scripts/disclosure-reaction-v2.py <DIR> > report.md
"""
import bisect
import csv
import json
import math
import os
import re
import sys
import warnings
from collections import Counter, defaultdict
from datetime import date

import numpy as np
import statsmodels.api as sm

warnings.filterwarnings("ignore")
csv.field_size_limit(10**9)

D = sys.argv[1]
SPLIT = date(2024, 5, 10)
MIN_N = 30
FDR = 0.10

# ---- VirtualSimCategory(vsim-types-v3)와 같은 분류 ----
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
STRIP = re.compile(r"[\s ·ㆍ・/]")
PREFIX = re.compile(r"^\s*(\[[^\]]*\]\s*)+")


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


def base_title(title):
    return STRIP.sub("", PREFIX.sub("", title))


# ---- 사전 고정 칸(항목 값 → 칸 이름). 값이 없거나 규칙에 안 맞으면 "상세 없음" ----
def ratio(v):
    x = float(v.rstrip("%"))
    return "희석 10% 미만" if x < 10 else "희석 10~30%" if x < 30 else "희석 30% 이상"


def use(v):
    if "타법인" in v:
        return "자금: 타법인 증권 취득 포함"
    if v == "운영 100%":
        return "자금: 운영만"
    return "자금: 그 밖"


PREREGISTERED = [
    ("NEW_SHARES", "증자 방식", "증자 방식", lambda v: v if v in ("제3자배정", "주주배정 후 일반공모") else "주주배정·일반공모"),
    ("NEW_SHARES", "희석", "새 주식 수(기존 대비)", ratio),
    ("NEW_SHARES", "자금 용도", "자금 용도", use),
    ("BUYBACK_ACQUIRE", "취득 방법", "취득 방법", lambda v: v if v in ("신탁 계약", "장내 매수") else "장외·공개매수"),
    ("BUYBACK_ACQUIRE", "소각", None, None),  # 취득 목적·계약 목적 중 하나에 "소각"
    ("BUYBACK_DISPOSE", "처분 목적", "처분 목적", lambda v: v if v in ("임직원 보상", "교환사채 발행") else "자금 마련·제휴 등"),
    ("BONDS", "사채 종류", "사채 종류", lambda v: v),
    ("RESTRUCTURE", "분할 방법", "분할 방법", lambda v: v),
]


def cell_of(cat, family, det):
    for c, fam, label, fn in PREREGISTERED:
        if c != cat or fam != family:
            continue
        if det is None:
            return "상세 없음"
        if fam == "소각":
            purposes = [det.get("취득 목적"), det.get("계약 목적")]
            if all(p is None for p in purposes):
                return "상세 없음"
            return "소각 포함" if any(p and "소각" in p for p in purposes) else "소각 없음"
        v = det.get(label)
        return "상세 없음" if v is None else fn(v)
    raise KeyError((cat, family))


# ---- 읽기 ----
px = defaultdict(lambda: ([], []))
mkt_of = {}
with open(f"{D}/prices.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        ds, cs = px[r["code"]]
        ds.append(date.fromisoformat(r["trade_date"]))
        cs.append(int(r["close"]))
        mkt_of[r["code"]] = r["market"]
codes = sorted(px)

# 동일가중 시장 대용(하루 평균 수익률 누적)
acc = defaultdict(lambda: [0.0, 0])
for code in codes:
    ds, cs = px[code]
    for i in range(1, len(ds)):
        a = acc[(mkt_of[code], ds[i])]
        a[0] += cs[i] / cs[i - 1] - 1
        a[1] += 1
ew_level = {}
for m in ("KOSPI", "KOSDAQ"):
    lvl = 1.0
    for d in sorted(k[1] for k in acc if k[0] == m):
        s, n = acc[(m, d)]
        lvl *= 1 + s / n
        ew_level[(m, d)] = lvl

idx_level = {}
if os.path.exists(f"{D}/index.csv"):
    with open(f"{D}/index.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            idx_level[(r["index_key"], date.fromisoformat(r["trade_date"]))] = float(r["index_value"])
all_days = {(mkt_of[c], d) for c in codes for d in px[c][0]}
idx_cover = sum(1 for k in all_days if k in idx_level) / len(all_days)
USE_INDEX = idx_cover >= 0.95
MARKET = idx_level if USE_INDEX else ew_level
MARKET_NAME = "실제 KOSPI·KOSDAQ 지수" if USE_INDEX else "수집 종목 동일가중 지수(실제 지수 부족)"

det = {}
if os.path.exists(f"{D}/details.csv"):
    with open(f"{D}/details.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            det[r["receipt_no"]] = {it["label"]: it["value"] for it in json.loads(r["items"])}

opens = {}
if os.path.exists(f"{D}/ohlc.csv"):
    with open(f"{D}/ohlc.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            for c in json.loads(r["payload"]).get("candles", []):
                if c.get("open"):
                    opens[(r["code"], date.fromisoformat(c["date"]))] = c["open"]

# ---- 공시: 분류 → 정정 병합 ----
raw = defaultdict(list)
n_titles = 0
with open(f"{D}/disc.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        n_titles += 1
        c = classify(r["title"])
        if c and r["stock_code"] in px:
            raw[r["stock_code"]].append((date.fromisoformat(r["receipt_date"]), r["receipt_no"], r["title"], c))

events = []  # dict(code, cat, rn, date, b, det, corrected)
merge = Counter()
for code, fl in raw.items():
    fl.sort(key=lambda x: (x[0], x[1]))
    originals = {}
    ds = px[code][0]
    for d, rn, title, c in fl:
        key = (base_title(title), c)
        if is_correction(title):
            o = originals.get(key)
            if o is None:
                merge["정정: 앞 원공시 없음(버림)"] += 1
                continue
            merge["정정: 원공시에 합침"] += 1
            o["corrected"] = True
            if o["det"] is None and rn in det:
                o["det"] = det[rn]  # DS005는 정정된 공시를 정정본 접수번호로 준다(대회 결정 11-06)
            continue
        b = bisect.bisect_right(ds, d) - 1
        if b < 1:
            continue
        e = dict(code=code, cat=c, rn=rn, date=d, b=b, det=det.get(rn), corrected=False)
        originals[key] = e
        events.append(e)
        merge["원공시"] += 1

ev_at = defaultdict(list)  # (code, b) -> events
for e in events:
    ev_at[(e["code"], e["b"])].append(e)
ev_b = defaultdict(list)
for e in events:
    ev_b[e["code"]].append(e["b"])
for v in ev_b.values():
    v.sort()


def count_in(code, lo, hi, exclude_b):
    bs = ev_b.get(code, [])
    n = bisect.bisect_right(bs, hi) - bisect.bisect_left(bs, lo)
    return n - sum(1 for _ in ev_at.get((code, exclude_b), []))


def mret(m, d0, d1, level=None):
    level = MARKET if level is None else level
    a, b = level.get((m, d0)), level.get((m, d1))
    return None if a is None or b is None else b / a - 1


# ---- 패널: 종목·거래일 행 ----
rows = []  # (code_i, date, R, T, T_open, ovR, ovT, events, R_ew, T_ew)
code_i = {c: i for i, c in enumerate(codes)}
for code in codes:
    ds, cs = px[code]
    m = mkt_of[code]
    for b in range(1, len(cs) - 5):
        mR, mT = mret(m, ds[b - 1], ds[b + 1]), mret(m, ds[b + 1], ds[b + 5])
        if mR is None or mT is None:
            continue
        R = cs[b + 1] / cs[b - 1] - 1 - mR
        T = cs[b + 5] / cs[b + 1] - 1 - mT
        o = opens.get((code, ds[b + 1]))
        To = (cs[b + 5] / o - 1 - mT) if o else None
        eR, eT = mret(m, ds[b - 1], ds[b + 1], ew_level), mret(m, ds[b + 1], ds[b + 5], ew_level)
        rows.append((code_i[code], ds[b], R, T, To, count_in(code, b - 2, b + 1, b), count_in(code, b - 1, b + 5, b), ev_at.get((code, b), []),
                     np.nan if eR is None else cs[b + 1] / cs[b - 1] - 1 - eR, np.nan if eT is None else cs[b + 5] / cs[b + 1] - 1 - eT))

dates = sorted({r[1] for r in rows})
date_i = {d: i for i, d in enumerate(dates)}
Y = {"R": np.array([r[2] for r in rows]), "T": np.array([r[3] for r in rows])}
OV = {"R": np.array([r[5] for r in rows], float), "T": np.array([r[6] for r in rows], float)}
G = np.column_stack([np.array([date_i[r[1]] for r in rows]), np.array([r[0] for r in rows])])
FIRST = np.array([r[1] < SPLIT for r in rows])
TO = np.array([np.nan if r[4] is None else r[4] for r in rows])


def design(split_family=None):
    """칸 더미 행렬. split_family=(cat, family)면 그 유형만 칸으로 나눈다."""
    names = []
    for c in ORDER:
        if split_family and c == split_family[0]:
            cells = sorted({cell_of(c, split_family[1], e["det"]) for e in events if e["cat"] == c})
            names += [(c, x) for x in cells]
        else:
            names.append((c, None))
    col = {n: i for i, n in enumerate(names)}
    X = np.zeros((len(rows), len(names)))
    for i, r in enumerate(rows):
        for e in r[7]:
            if split_family and e["cat"] == split_family[0]:
                X[i, col[(e["cat"], cell_of(e["cat"], split_family[1], e["det"]))]] = 1
            else:
                X[i, col[(e["cat"], None)]] = 1
    return names, X


def fit(y, X, ov, mask, logit=False):
    Xf = sm.add_constant(np.column_stack([X[mask], ov[mask]]), has_constant="add")
    keep = np.r_[True, X[mask].sum(axis=0) > 0, True]
    Xf = Xf[:, keep]
    g = G[mask]
    if logit:
        res = sm.Logit((y[mask] > 0).astype(float), Xf).fit(disp=0, cov_type="cluster", cov_kwds={"groups": g})
    else:
        res = sm.OLS(y[mask], Xf).fit(cov_type="cluster", cov_kwds={"groups": g})
    out = {}
    j = 1
    for k, kept in enumerate(keep[1:-1]):
        if kept:
            out[k] = (res.params[j], res.bse[j], res.pvalues[j])
            j += 1
    return out


def bh(pvals):
    """Benjamini-Hochberg q값"""
    m = len(pvals)
    order = sorted(range(m), key=lambda i: pvals[i])
    q = [0.0] * m
    prev = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        prev = min(prev, pvals[i] * m / rank)
        q[i] = prev
    return q


# ---- 추정 ----
results = []  # dict(cat, cell, n, n1, n2, per window: full/first/second (b,se,p), logit p)
models = [None] + [(c, fam) for c, fam, _, _ in PREREGISTERED]
ALL = np.ones(len(rows), bool)
for sf in models:
    names, X = design(sf)
    targets = [k for k, (c, cell) in enumerate(names) if (sf is None and cell is None) or (sf and c == sf[0])]
    fits = {}
    for w in ("R", "T"):
        fits[(w, "full")] = fit(Y[w], X, OV[w], ALL)
        fits[(w, "first")] = fit(Y[w], X, OV[w], FIRST)
        fits[(w, "second")] = fit(Y[w], X, OV[w], ~FIRST)
        fits[(w, "logit")] = fit(Y[w], X, OV[w], ALL, logit=True)
    for k in targets:
        c, cell = names[k]
        n = int(X[:, k].sum())
        results.append(dict(cat=c, family=sf[1] if sf else None, cell=cell, n=n, n1=int(X[FIRST, k].sum()), n2=int(X[~FIRST, k].sum()),
                            **{f"{w}_{p}": fits[(w, p)].get(k) for w in ("R", "T") for p in ("full", "first", "second", "logit")}))

# 다중 비교: 창마다, 판정 대상 칸 전체(유형 12 + 사전 고정 칸, MIN_N 이상, "상세 없음" 제외)
for w in ("R", "T"):
    judged = [r for r in results if r["n"] >= MIN_N and r["cell"] != "상세 없음" and r[f"{w}_full"]]
    qs = bh([r[f"{w}_full"][2] for r in judged])
    for r, q in zip(judged, qs):
        r[f"{w}_q"] = q
        r[f"{w}_bonf"] = min(1.0, r[f"{w}_full"][2] * len(judged))
    for r in results:
        r.setdefault(f"{w}_q", None)
        r.setdefault(f"{w}_bonf", None)
        a, b = r[f"{w}_first"], r[f"{w}_second"]
        r[f"{w}_rep"] = bool(a and b and a[2] < 0.05 and b[2] < 0.05 and (a[0] > 0) == (b[0] > 0))
        r[f"{w}_ok"] = bool(r[f"{w}_q"] is not None and r[f"{w}_q"] < FDR and r[f"{w}_rep"])
    globals()[f"M_{w}"] = len(judged)


# ---- 출력 ----
out = []
P = out.append


def bp(x):
    return "-" if x is None else f"{x[0] * 100:+.2f}"


def ci(x):
    return "-" if x is None else f"{(x[0] - 1.96 * x[1]) * 100:+.2f}~{(x[0] + 1.96 * x[1]) * 100:+.2f}"


def pv(x):
    return "-" if x is None else f"{x:.4f}" if x >= 0.0001 else "<0.0001"


def label(r):
    if r["cell"] is None:
        return NAME[r["cat"]]
    return f"{NAME[r['cat']]} · {r['cell']}" + (f"({r['family']} 묶음)" if r["cell"] == "상세 없음" else "")


P(f"- 공시 {n_titles:,}건 중 분류된 원공시 {merge['원공시']:,}건(정정 {merge['정정: 원공시에 합침']:,}건은 원공시에 합침, 앞 원공시가 없는 정정 {merge['정정: 앞 원공시 없음(버림)']:,}건은 버림)")
P(f"- 패널: {len(codes)}종목 × 거래일 = {len(rows):,}행(공시 없는 날이 기준선). 시장 조정: {MARKET_NAME}, 지수 날짜 커버 {idx_cover * 100:.1f}%")
P(f"- 다중 비교 수: 반응 창 {M_R}칸, 체결 가능 창 {M_T}칸(표본 {MIN_N}건 이상, \"상세 없음\" 제외)\n")

for w, title in (("R", "반응 창 R: 전날 종가 → t+1 종가, 시장 대비 초과수익"), ("T", "체결 가능 창 T: t+1 종가 → t+5 종가, 시장 대비 초과수익")):
    P(f"### {title}")
    P("값은 공시 없는 날 대비 평균 초과수익 차이(%p, OLS 계수), 95% 구간은 날짜·종목 2중 클러스터 표준오차 기준이다.\n")
    P("| 칸 | n(앞/뒤) | 계수 %p | 95% 구간 | p | BH q | Bonf. | 오름 여부 logit p | 앞 기간 계수 (p) | 뒤 기간 계수 (p) | 기간 재현 | 근거 있음 |")
    P("|---|---|---:|---|---:|---:|---:|---:|---|---|:-:|:-:|")
    for r in results:
        if r["family"] and r["cell"] == "상세 없음" and r["n"] < MIN_N:
            continue
        f, a, b = r[f"{w}_full"], r[f"{w}_first"], r[f"{w}_second"]
        small = " (표본 부족)" if r["n"] < MIN_N else ""
        P(f"| {label(r)}{small} | {r['n']:,} ({r['n1']}/{r['n2']}) | {bp(f)} | {ci(f)} | {pv(f and f[2])} | {pv(r[f'{w}_q'])} | {pv(r[f'{w}_bonf'])} | "
          f"{pv(r[f'{w}_logit'] and r[f'{w}_logit'][2])} | {bp(a)} ({pv(a and a[2])}) | {bp(b)} ({pv(b and b[2])}) | {'○' if r[f'{w}_rep'] else ''} | {'**○**' if r[f'{w}_ok'] else ''} |")
    P("")

P("### 근거 있음 / 반응 창에만 있음")
okR = [label(r) for r in results if r["R_ok"]]
okT = [label(r) for r in results if r["T_ok"]]
P(f"- 반응 창 근거 있음: {', '.join(okR) if okR else '없음'}")
P(f"- 체결 가능 창 근거 있음: {', '.join(okT) if okT else '없음'}")
only = [label(r) for r in results if r["R_ok"] and not r["T_ok"]]
P(f"- 반응 창에는 있고 체결 가능 창에는 남지 않음: {', '.join(only) if only else '없음'}\n")

# 시가 판 비교(최근 구간)
mask_o = ~np.isnan(TO)
if mask_o.sum() > 0:
    names, X = design(None)
    fo = fit(np.nan_to_num(TO), X, OV["T"], mask_o)
    ft = fit(Y["T"], X, OV["T"], mask_o)
    span = [r[1] for r, m in zip(rows, mask_o) if m]
    P(f"### 체결 가능 창의 시가 판 비교({min(span)}~{max(span)}, 시가가 있는 {int(mask_o.sum()):,}행)")
    P("| 유형 | n | t+1 종가 기준 계수 %p (p) | t+1 시가 기준 계수 %p (p) |")
    P("|---|---:|---|---|")
    for k, (c, _) in enumerate(names):
        n = int(X[mask_o, k].sum())
        if n == 0:
            continue
        P(f"| {NAME[c]} | {n} | {bp(ft.get(k))} ({pv(ft.get(k) and ft[k][2])}) | {bp(fo.get(k))} ({pv(fo.get(k) and fo[k][2])}) |")
    P("")

# 시장 대용 비교(실제 지수를 쓸 때만): 같은 유형 모형을 동일가중 지수 초과수익으로 다시 추정
if USE_INDEX:
    names, X = design(None)
    P("### 시장 대용 비교: 실제 지수 vs 수집 종목 동일가중 지수(전체 기간 OLS 계수 %p, p)")
    P("| 유형 | R 실제 지수 | R 동일가중 | T 실제 지수 | T 동일가중 |")
    P("|---|---|---|---|---|")
    ew = {w: np.array([r[8 if w == "R" else 9] for r in rows]) for w in ("R", "T")}
    fe = {w: fit(np.nan_to_num(ew[w]), X, OV[w], ~np.isnan(ew[w])) for w in ("R", "T")}
    fi = {w: fit(Y[w], X, OV[w], ALL) for w in ("R", "T")}
    for k, (c, _) in enumerate(names):
        cell = lambda f: f"{bp(f.get(k))} ({pv(f.get(k) and f[k][2])})"
        P(f"| {NAME[c]} | {cell(fi['R'])} | {cell(fe['R'])} | {cell(fi['T'])} | {cell(fe['T'])} |")
    P("")

# 상세 커버리지 분해
P("### 상세 항목(DS005) 커버리지 분해(원공시 기준)")
P("| 유형 | 원공시 | 상세 있음 | 종속회사·자회사 공시 | 거래소 수시공시 등(주요사항보고서 아님) | 주요사항보고서인데 상세 없음 |")
P("|---|---:|---:|---:|---:|---:|")
titles = {}
for fl in raw.values():
    for d, rn, title, c in fl:
        titles[rn] = title
for c in ("NEW_SHARES", "BONUS_SHARES", "BONDS", "BUYBACK_ACQUIRE", "BUYBACK_DISPOSE", "RESTRUCTURE", "FACILITY"):
    E = [e for e in events if e["cat"] == c]
    has = sum(1 for e in E if e["det"] is not None)
    sub = sum(1 for e in E if e["det"] is None and ("종속회사" in titles[e["rn"]] or "자회사" in titles[e["rn"]]))
    exch = sum(1 for e in E if e["det"] is None and not ("종속회사" in titles[e["rn"]] or "자회사" in titles[e["rn"]]) and "주요사항보고서" not in titles[e["rn"]])
    P(f"| {NAME[c]} | {len(E):,} | {has:,} ({has / len(E) * 100:.0f}%) | {sub:,} | {exch:,} | {len(E) - has - sub - exch:,} |")
P("")

print("\n".join(out))
