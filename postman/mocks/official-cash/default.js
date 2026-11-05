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
const fsbRow = id => ({FINAN_COMP_CODE:id,FINAN_PROD_CODE:'p',CNT:'2',BANK_NAME:id,PRODUCT_NAME:'보통예금',HGST_INTR_APL_AMT:'1000000',RNG_CODE:'2',SWEETENER:'급여 이체',JOIN_TARGET:'개인',JOIN_LOCATION:'2,3',ETC_NOTE_MATTER:'없음',RATE_LOW:'0.10',RATE_HIGH:'2.34',DEPO_INTS_PRVS_MTHD_CD:'2',START_DATE:'20261030'});
const samsungHtml = ['RP형','발행어음형'].map(type => `<table><caption>CMA ${type}</caption><tbody><tr><th>자동매수</th><td>매일 자동매수</td></tr><tr><th>재투자</th><td>31일 재투자</td></tr><tr><th>수수료</th><td>없음</td></tr><tr><th>자동매수가능시간대</th><td>매일</td></tr><tr><th>수익률</th><td>99.99%</td></tr></tbody></table>`).join('');
const queries = {
  '/samsung-rp-json': {errorMsg:'',result:{outRec1:{A_NDVL_RP_ANCT_YILD:'1.23',ANCT_DATE:'20261030'}}},
  '/samsung-note-json': {errorMsg:'',result:{outRec1:{BSNS_DATE:'20261101'},outRec2:[{shrt_BILL_PRDT_SECT_CODE:'3',prdt_NAME:'특판',frst_SHRT_BILL_ANCT_YILD:'99'},{shrt_BILL_PRDT_SECT_CODE:'5',prdt_NAME:'CMA',frst_SHRT_BILL_ANCT_YILD:'2.34'}]}},
  '/kb-json': {cma100:'기준일 : 2026/10/30',cma111:'연 1.23%',cma112:'연 2.34%',cma121:'연 99%',cma001:'31일 재투자',cma002:'1일 재투자'},
  '/shinhan-json': {header:{succesCode:'0'},body:{list01:{outputList:[{rp_fund_code:'2000',fund_nm1:'명품 CMA RP(개인)',cntt1:'1-27일',intrt1:'1.23',amt_base:'1원 이상'}]}}},
  '/meritz-json': {sysCode:'0',sysNextYn:'N',resultList:[[{Iscd:'RP10000',KorIssuAbwrName:'CMA-RP',CustClsCode:'1',AplyInrt:'1.23',StplDynu:'30',InrtAplyDate:'20261030'}]]},
  '/kbank-other-json': {_msg_:{_common_:{resCode:'00','error.code':'F0000'},_body_:{inqryType:'SALE',inqryBaseDt:'20261030',pdInfoList10:[{pdCd:'synthetic',pdNm:'생활통장',typeList1:[{rate:'0.10'}],typeList4:[],typeList5:[{rate:'2.34',amtStcn:'100만원+이하'}]}]}}},
  '/sk-json': {output:{h_errcode:'',QueryCnt:'2',OutBlock_2:[{rp_dcd:'10',inv_cnt:'30일',rp_int_rt:'99'},{rp_dcd:'30',inv_cnt:'1일',rp_int_rt:'1.23'}],o_rp_int_rt:'1.23%',bs_dt_format:'2026.10.30'}},
  '/sc-catalog-json': {vector:[{OUTPUT:{PRDCT_ID:'a',PRDCT_NM:'합성통장'}}]},
  '/sc-rate-json': {vector:[{OUTPUT:{PRDCT_ID:'a',INT_RATE_TYPE:'입출금자유',INT_RATE_TTL:'기본이율',ENTRNC_TYPE:'인터넷',DFLT_INT_RATE:'0.10',INT_EFFCTV_DT:'2026-10-30'}}]},
  '/jeju-catalog-json': {itemsCount:1,DepositeVO:{typCdVal:'02'},data:[{prdId:'SID_'+'a'.repeat(32),prdNm:'합성 파킹통장',joingTrgtDesc:'실명의 개인'}]},
};
// HTTP 헤더 EUC-KR 디코딩을 검증한다. PERSON은 EUC-KR '개인' 바이트로 치환한다.
const mirae = Buffer.concat(`<table><caption>CMA</caption><tbody><tr><td>PERSON</td><td>CMA RP_PERSON</td><td>-</td><td>1.23%</td></tr></tbody></table>`
  .split('PERSON').flatMap((part, i) => i ? [Buffer.from([0xb0,0xb3,0xc0,0xce]), Buffer.from(part)] : [Buffer.from(part)]));
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, text, type = 'text/html; charset=utf-8') => { res.writeHead(status, {'Content-Type': type}); res.end(text); };
  if (url.pathname === '/_mode') { mode = url.searchParams.get('value') || 'ok'; return send(200, mode, 'text/plain'); }
  if (url.pathname === '/_pages') return send(200, String(pages), 'text/plain');
  if (url.pathname.startsWith('/kdb-')) {
    if (req.method !== 'POST' || req.headers['content-type'] !== 'application/x-www-form-urlencoded'
        || !req.headers.accept?.includes('application/json')) return send(400, 'Expected public form query');
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
      let q;
      try { q = JSON.parse(decodeURIComponent(new URLSearchParams(body).get('_JSON_'))); }
      catch { return send(400, 'Expected double encoded JSON form'); }
      pages++;
      const id = n => String(100000000000 + n);
      const name = code => '합성 입출금 ' + code;
      const header = {COMMON_HEAD:{ERROR:false}};
      const json = data => send(200, JSON.stringify({...header, ...data}), 'application/json; charset=utf-8');
      if (url.pathname.startsWith('/kdb-catalog-')) {
        const page = Number(url.pathname.at(-1));
        if (q.CTG_N1_SNO?.[0]?.value !== '1010300' || q.PRD_JIN_TGT_C?.[0]?.value !== '10'
            || q.XPO_TGT_C?.[0]?.value !== 20 || q.WEB_PRD_CLSF_C !== 10 || q.WGD_NM !== ''
            || q.HEADER_STD_WEB?.REQ_PAGE_NO !== page || q.HEADER_STD_WEB?.PAGE_ROW_COUNT !== 10
            || q.HEADER_STD_WEB?.NEXT_PAGE_YN !== (page === 1 ? 'S' : 'M')) return send(400, 'Expected complete personal demand catalog');
        const rows = Array.from({length: page === 1 ? 10 : mode === 'kdb-partial' ? 0 : 1}, (_, i) => {
          const code = id((page - 1) * 10 + i + 1);
          return {PRD_C:code,PRD_IRT_C:code,WGD_NM:name(code),CTG_N1_NM:'입출금자유상품',PRD_JIN_TGT_C:'10',WEB_PRD_CLSF_C:'10',SLE_YN:'Y'};
        });
        return json({HEADER_STD_WEB:{TOT_PAG_ROW_CNT:11,TOT_PAG_CNT:2,REQ_PAGE_NO:page,PAGE_ROW_COUNT:10,NEXT_PAGE_YN:page===1?'Y':'N'},GRID_LIST:rows});
      }
      const code = url.pathname.split('-').at(-1);
      if (q.PRD_C !== code) return send(400, 'Expected matching product');
      if (url.pathname.startsWith('/kdb-detail-')) {
        if (q.XPO_TGT_C !== 20 || q.WEB_PRD_CLSF_C !== 10) return send(400, 'Expected personal product detail');
        if (mode === 'kdb-last-error' && code === id(11)) return send(503, 'Final detail unavailable');
        return json({BSC_DATA:{PRD_C:code,PRD_IRT_C:code,WGD_NM:name(code),WEB_PRD_CLSF_C:'10',SLE_YN:'Y',DPW_PRT_TGT_PRD_YN:'Y'},
          DET_DATA:{PRD_C:code,PRD_JIN_TGT_DES:'실명의 개인',JIN_MANR_DES:'영업점',JIN_AMT_OTL:'제한없음'},
          COL_LIST:[{PRD_C:code,PRD_COL_NM:'이자지급시기',PRD_COL_DES_INF:'매월 지급'}]});
      }
      if (q.PRD_IRT_C !== code) return send(400, 'Expected matching rate code');
      return json({BSE_DT:'20261105',IRT_LIST:[{PRD_C:mode==='kdb-wrong-rate'&&code===id(11)?id(99):code,
        PRD_IRT_C:code,BSE_DT:'20261105',DEL_YN:'N',OPB_YN:'Y',MNG_ITSR_GRP_NM:name(code),MNG_PRD_IRT_STG_NM1:'-',AVR_ITSR:'1.23'}],
        HI_FIVE_LIST:[{PRD_C:id(99),AVR_ITSR:'99'}]});
    }); return;
  }
  if (url.pathname === '/robots.txt') return send(200, `User-agent: *\n${mode === 'robots' ? 'Disallow' : 'Allow'}: /\n${mode === 'query-robots' ? 'Disallow: /ux/kor/finance/cma/' : ''}`, 'text/plain');
  if (url.pathname === '/samsung') { pages++; return send(200, samsungHtml); }
  if (url.pathname === '/hanwha') { pages++; return send(200, '<div class="FI211_1p_numList"><ol><li><p>금액 구간별 세전, 연 1.23% ~ 2.34%, 2026.10.30 기준 RP 자동투자</p></li></ol></div>'); }
  if (url.pathname === '/hmc') { pages++; return send(200, '<h1>급여계좌 장점</h1><ul class="dot_list"><li>하루를 맡겨도 연 1.23% 금리 지급(2026-10-30 기준, RP형, 세전)</li></ul>'); }
  if (url.pathname === '/jeju-detail-SID_'+'a'.repeat(32)) {
    pages++;
    return send(200, mode === 'jeju-detail-error' ? '<h1>구조 변경</h1>' : '<h1>합성 파킹통장</h1><div class="card3"><h4 class="tit">기본금리</h4><p class="txt">연 1.23%</p></div><dl class="text-row-item"><dt>가입대상</dt><dd>실명의 개인</dd></dl>');
  }
  if (queries[url.pathname]) {
    if (!req.headers.accept?.includes('application/json')) return send(406, 'Expected JSON Accept');
    if (mode === 'samsung-note-error' && url.pathname === '/samsung-note-json') return send(503, 'Query unavailable');
    if (req.method !== (['/kb-json','/jeju-catalog-json'].includes(url.pathname) ? 'GET' : 'POST')) return send(400, 'Unexpected method');
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      if (url.pathname === '/shinhan-json' && (req.headers['content-type'] !== 'application/json' || JSON.parse(body).url !== '/mweb/api/fnin/fcma/rprtList')) return send(400, 'Expected public JSON query');
      if (url.pathname.startsWith('/sc-') && (req.headers['content-type'] !== 'application/json' || JSON.parse(body).TYPE_CD !== '243' || JSON.parse(body).PARTY_FG !== 'P')) return send(400, 'Expected personal demand deposits');
      const form = new URLSearchParams(body);
      if (url.pathname === '/samsung-note-json' && (form.get('cmd') !== 'getList' || form.get('A_RFRN_SECT_CODE') !== '1')) return send(400, 'Expected CMA form');
      if (url.pathname === '/kbank-other-json' && form.get('inqryType') !== 'SALE') return send(400, 'Expected active products');
      if (url.pathname === '/meritz-json' && (form.get('iscd') !== 'RP10000' || !/^\d{4}\.\d{2}\.\d{2}$/.test(form.get('aplyDate')))) return send(400, 'Expected date and CMA code');
      pages++; return send(200, JSON.stringify(queries[url.pathname]), 'application/json; charset=utf-8');
    }); return;
  }
  if (url.pathname === '/ratanym_0100.jct') {
    if (req.method !== 'POST' || req.headers['content-type'] !== 'application/x-www-form-urlencoded') return send(400, 'Expected public query form POST');
    let body = ''; req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const form = JSON.parse(decodeURIComponent(new URLSearchParams(body).get('_JSON_')));
      if (form.ORDERBY !== 'BANK_NAME ASC' || form.DEPO_INTS_PRVS_MTHD_CD !== '1|2|3|4|5|6'
          || form.JOIN_LOCATION !== '1|2|3|4|5|9' || form.RATE_HIGH !== '0' || form.END_NUM !== '100000' || form.START_NUM !== '1'
          || form.SEARCH_TEXT_IN !== '') return send(400, 'Incomplete query');
      pages++;
      return send(200, JSON.stringify({TOTAL_CNT:mode === 'malformed' ? 3 : 2,ANYM_REC:[fsbRow('합성가'),fsbRow('합성나')]}), 'application/json; charset=utf-8');
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
