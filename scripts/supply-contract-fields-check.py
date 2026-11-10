"""공급 계약 원문 두 칸 추출 확인(Issue #375, 읽기 전용).

서버 PlacementDetails.supplyContract와 같은 규칙으로 단일판매ㆍ공급계약체결 원공시(정정·종속회사·자회사 공시 제외)의
"매출액대비(%)"와 계약 기간(시작일~종료일) 길이를 OpenDART 공시서류원본파일(document.xml)에서 뽑아 본다.
원문은 저장하지 않고, 출력에는 건수와 뽑은 값만 남긴다(회사명·접수번호 없음).

입력: disc.csv(scripts/vsim-ruleset-diagnosis.py 첫머리 쿼리). 키는 환경 변수 DART_API_KEY로만 받는다(명령줄·출력에 넣지 않음).
실행: DART_API_KEY=... python3 scripts/supply-contract-fields-check.py <DIR> [표본 수, 기본 40]
"""
import csv
import io
import os
import random
import re
import sys
import time
import urllib.request
import zipfile
from collections import Counter
from datetime import date, timedelta

D = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 40
KEY = os.environ.get("DART_API_KEY", "").strip()
if not KEY:
    sys.exit("DART_API_KEY 환경 변수가 비어 있어요.")
TITLE_STRIP = re.compile(r"[\s ·ㆍ・/]")
# 서버 DartDisclosureSource.bodyText처럼 칸은 "|"로, 그 밖 태그는 지운 뒤 공백을 모두 지운다
CELL = re.compile(r"(?i)</(TD|TH|TE|TU)\s*>")
TAG = re.compile(r"<[^>]+>")
SALES_RATIO = re.compile(r"매출액대비(?:\(%\))?\|*(-?[\d,]+(?:\.\d+)?)")
DAY = r"(\d{4})[-.년](\d{1,2})[-.월](\d{1,2})일?"
PERIOD = re.compile(r"계약기간\|*시작일\|*" + DAY + r"\|*종료일\|*" + DAY)


def target(title):
    t = TITLE_STRIP.sub("", title)
    return ("단일판매공급계약체결" in t and not t.startswith("[") and "종속회사" not in t and "자회사의주요경영사항" not in t
            and not any(w in t for w in ("해지", "철회", "취소")))


def text_of(receipt_no):
    url = f"https://opendart.fss.or.kr/api/document.xml?crtfc_key={KEY}&rcept_no={receipt_no}"
    with urllib.request.urlopen(url, timeout=30) as res:
        body = res.read()
    if not body.startswith(b"PK"):
        raise RuntimeError(re.sub(r"crtfc_key=[^&]+", "crtfc_key=***", body[:200].decode("utf-8", "replace")))
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".xml")]
        main = next((n for n in names if n.lower() == f"{receipt_no}.xml"), names[0] if names else None)
        if main is None:
            return ""
        raw = z.read(main)
    for enc in ("utf-8", "euc-kr"):
        try:
            xml = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    return re.sub(r"[\s ]", "", TAG.sub(" ", CELL.sub("|", xml)).replace("&nbsp;", " "))


def months_between(a, b):
    # java.time.Period.between(a, b).toTotalMonths(): 다 찬 달 수
    m = (b.year - a.year) * 12 + (b.month - a.month)
    if b.day < a.day:
        m -= 1
    return m


def duration(a, b):
    if a is None or b is None or b < a:
        return None
    m = months_between(a, b + timedelta(days=1))
    return f"{m}개월" if m >= 1 else f"{(b - a).days + 1}일"


def day(y, mo, d):
    try:
        return date(int(y), int(mo), int(d))
    except ValueError:
        return None


pool = []
with open(f"{D}/disc.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if r["receipt_date"] >= str(date.today() - timedelta(days=5 * 365)) and target(r["title"]):
            pool.append(r["receipt_no"])
sample = random.Random(375).sample(pool, min(N, len(pool)))
ratio_ok, period_ok, failed, ratios, periods = 0, 0, 0, [], Counter()
for rn in sample:
    try:
        t = text_of(rn)
    except Exception as ex:  # noqa: BLE001 - 확인용이라 실패도 센다
        failed += 1
        print(f"  호출 실패: {type(ex).__name__}", file=sys.stderr)
        continue
    finally:
        time.sleep(0.3)
    r = SALES_RATIO.findall(t)
    if r:
        v = r[-1].replace(",", "")
        try:
            x = float(v)
            if x > 0:
                ratio_ok += 1
                ratios.append(int(x * 10) / 10)
        except ValueError:
            pass
    p = None
    for m in PERIOD.finditer(t):
        p = duration(day(*m.group(1, 2, 3)), day(*m.group(4, 5, 6)))
    if p:
        period_ok += 1
        periods[p] += 1
done = len(sample) - failed
print(f"- 모집단 {len(pool):,}건, 표본 {len(sample)}건(호출 실패 {failed}건)")
print(f"- 매출액 대비: {ratio_ok}/{done}건. 값: {', '.join(f'{x:.1f}%' for x in sorted(ratios))}")
print(f"- 계약 기간: {period_ok}/{done}건. 값: {', '.join(f'{k}×{v}' for k, v in periods.most_common())}")
