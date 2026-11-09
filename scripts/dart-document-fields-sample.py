"""공시 원문 수치 추출 가능성 표본 확인(Issue #371 작업 8, 읽기 전용).

단일판매·공급계약체결의 "매출액 대비(%)"와 잠정실적의 "전년 동기 대비 증감률(%)"을 OpenDART 공시서류원본파일(document.xml)에서
글자 규칙만으로 뽑을 수 있는지 유형마다 25건씩 확인한다. 원문은 저장하지 않고, 출력에는 건수와 뽑은 숫자만 남긴다(회사명·접수번호 없음).

입력: disc.csv(scripts/vsim-ruleset-diagnosis.py 첫머리 쿼리). 키는 환경 변수 DART_API_KEY로만 받는다(명령줄·출력에 넣지 않음).
실행: DART_API_KEY=... python3 scripts/dart-document-fields-sample.py <DIR>
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

D = sys.argv[1]
KEY = os.environ.get("DART_API_KEY", "").strip()
if not KEY:
    sys.exit("DART_API_KEY 환경 변수가 비어 있어요.")
N = 25
STRIP = re.compile(r"[\s ·ㆍ・/]")
TAG = re.compile(r"<[^>]+>")
NUM = r"(-?\d[\d,]*\.?\d*)"

KINDS = {
    "공급 계약 · 매출액 대비(%)": (lambda t: "단일판매공급계약체결" in t, re.compile(r"매출액대비\(?%\)?" + NUM)),
    "잠정실적 · 전년 동기 대비 증감률(%)": (lambda t: "영업(잠정)실적" in t or "잠정)실적" in t, re.compile(r"전년동기대비증감율?\(?%\)?.{0,40}?" + NUM)),
}

pool = {k: [] for k in KINDS}
with open(f"{D}/disc.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        t = STRIP.sub("", r["title"])
        if t.startswith("["):
            continue  # 정정본 제외
        for k, (match, _) in KINDS.items():
            if match(t):
                pool[k].append(r["receipt_no"])


def text_of(receipt_no):
    url = f"https://opendart.fss.or.kr/api/document.xml?crtfc_key={KEY}&rcept_no={receipt_no}"
    with urllib.request.urlopen(url, timeout=30) as res:
        body = res.read()
    if not body.startswith(b"PK"):
        raise RuntimeError(re.sub(r"crtfc_key=[^&]+", "crtfc_key=***", body[:200].decode("utf-8", "replace")))
    out = []
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        for name in z.namelist():
            raw = z.read(name)
            for enc in ("utf-8", "euc-kr"):
                try:
                    out.append(raw.decode(enc))
                    break
                except UnicodeDecodeError:
                    continue
    return STRIP.sub("", TAG.sub(" ", " ".join(out)))


rng = random.Random(371)
for k, (_, pattern) in KINDS.items():
    sample = rng.sample(pool[k], min(N, len(pool[k])))
    got, failed, values = 0, 0, []
    for rn in sample:
        try:
            m = pattern.search(text_of(rn))
        except Exception as ex:  # noqa: BLE001 - 표본 확인이라 실패도 센다
            failed += 1
            print(f"  호출 실패: {type(ex).__name__}", file=sys.stderr)
            continue
        finally:
            time.sleep(0.3)
        if m:
            got += 1
            values.append(m.group(1))
    print(f"- {k}: 표본 {len(sample)}건(모집단 {len(pool[k]):,}건) 중 추출 {got}건, 호출 실패 {failed}건. 뽑은 값: {', '.join(values)}")
