// 합성 HTML. 실제 사이트의 금리·수익 보장을 모사하지 않는다. 로컬 검증 전용.
const http = require('http');
let mode = 'ok';
let pages = 0;
const kbank = `<title>플러스박스 | 합성 공시</title><p>조회기준일: 2026.10.30 현재</p>
<table><caption>적용금리 금액구간, 금리안내</caption><thead><tr><th>금액구간</th><th>금리</th></tr></thead>
<tbody><tr><td>5천만원 이하</td><td>1.23%</td></tr><tr><td>5천만원 초과분</td><td>2.34%</td></tr></tbody></table>
<ul><li>가입대상: 개인</li><li>가입금액: 제한없음</li><li>적용금리: 구간별 적용</li><li>이자계산방법: 일별 구간별 금리</li><li>이자결산지급일: 매월 정산</li></ul>`;
const eugene = `<div class="cma_benefit"><div>CMA-RP수익률 (2026 . 10 . 31 기준)</div><div><table>
<caption>CMA - RP 수익률 정보 제공</caption><tbody>
<tr><th>자유형 CMA</th><td>-</td><td>2.10%</td><td>-</td></tr>
<tr><th>자산관리형 CMA</th><td>1일 ~ 30일</td><td>2.20%</td><td>30일 뒤 재투자</td></tr>
<tr><th>법인 CMA</th><td>-</td><td>99%</td><td>-</td></tr></tbody></table></div>
<ul><li>- 가입대상 : 개인 및 법인</li><li>- 자동투자 : 당일 매수</li></ul></div>`;
const fsb = `<table id="apdTbl"><thead><tr><th>비교공시일</th></tr></thead><tbody>
<tr><td>합성가</td><td>보통예금</td><td>0.10%</td><td>3.20%</td><td>100만원 이하</td><td>20261030</td></tr>
<tr><td>합성나</td><td>보통예금</td><td>2.00%</td><td>2.00%</td><td>제한없음</td><td>20261101</td></tr></tbody></table>`;
// HTTP 헤더 EUC-KR 디코딩을 검증한다. PERSON은 EUC-KR '개인' 바이트로 치환한다.
const mirae = Buffer.concat(`<table><caption>CMA</caption><tbody><tr><td>PERSON</td><td>CMA RP_PERSON</td><td>-</td><td>1.23%</td></tr></tbody></table>`
  .split('PERSON').flatMap((part, i) => i ? [Buffer.from([0xb0,0xb3,0xc0,0xce]), Buffer.from(part)] : [Buffer.from(part)]));
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, text, type = 'text/html; charset=utf-8') => { res.writeHead(status, {'Content-Type': type}); res.end(text); };
  if (url.pathname === '/_mode') { mode = url.searchParams.get('value') || 'ok'; return send(200, mode, 'text/plain'); }
  if (url.pathname === '/_pages') return send(200, String(pages), 'text/plain');
  if (url.pathname === '/robots.txt') return send(200, `User-agent: *\n${mode === 'robots' ? 'Disallow' : 'Allow'}: /`, 'text/plain');
  if (url.pathname === '/ratanym_0100_01.act') {
    if (req.method !== 'POST' || req.headers['content-type'] !== 'application/x-www-form-urlencoded') return send(400, 'Expected export form POST');
    let body = ''; req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const form = new URLSearchParams(body);
      if (form.get('ORDERBY') !== 'BANK_NAME ASC' || form.get('DEPO_INTS_PRVS_MTHD_CD') !== '1|2|3|4|5|6'
          || form.get('JOIN_LOCATION') !== '1|2|3|4|5|9' || form.get('RATE_HIGH') !== '0'
          || form.get('SEARCH_TEXT_IN') !== '') return send(400, 'Incomplete export');
      pages++;
      return send(200, mode === 'malformed' ? fsb.replace('<td>2.00%</td>', '') : fsb);
    });
    return;
  }
  if (url.pathname === '/mirae') { pages++; return send(200, mirae, 'text/html; charset=EUC-KR'); }
  if (url.pathname !== '/kbank' && url.pathname !== '/eugene') return send(501, 'Not modelled');
  pages++;
  if (url.pathname === '/kbank') {
    if (mode === 'kbank-error') return send(503, 'upstream unavailable');
    if (mode === 'malformed') return send(200, '<title>changed layout</title>');
    if (mode === 'oversize') return send(200, 'x'.repeat(2_000_001));
    if (mode === 'redirect') { res.writeHead(302, {Location:'/not-modelled'}); return res.end(); }
    return send(200, kbank);
  }
  return send(200, eugene);
}).listen(process.env.PORT);
