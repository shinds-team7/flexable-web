// 읽기 전용 적재 점검. 시장 전체/원천 수집 완전성을 보증하는 검사는 아니다.
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const option = name => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
function base(value) {
  const url = new URL(value);
  assert.ok(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
    'API 주소에는 인증정보·쿼리·fragment를 넣지 마세요.');
  return url.href.replace(/\/$/, '');
}
const cashBase = base(option('--cash-base') ?? 'http://127.0.0.1:8080/api/v1');
const depositBase = base(option('--deposit-base') ?? cashBase);
async function get(root, path) {
  const response = await fetch(root + path, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  const data = await response.json();
  assert.equal(data.isSample, false, `${path}: 실제 데이터 응답이 필요해요.`);
  assert.ok(Array.isArray(data.items));
  return data;
}
function unique(items) {
  assert.equal(new Set(items.map(p => p.id)).size, items.length, '페이지/출처 사이에 중복 상품 ID가 있어요.');
}
const report = { verifiedAt: new Date().toISOString(), marketComplete: false, cash: {}, deposit: {} };
for (const kind of ['parking', 'cma']) {
  const { items } = await get(cashBase, `/${kind}/products`);
  assert.ok(items.length, `${kind}: 적재된 상품이 없어요.`);
  const expected = option(`--expect-${kind}`);
  if (expected !== undefined) {
    assert.ok(Number.isSafeInteger(Number(expected)) && Number(expected) > 0, '예상 건수는 양의 정수여야 해요.');
    assert.equal(items.length, Number(expected), `${kind}: 별도로 확인한 전체 건수와 달라요.`);
  }
  unique(items);
  for (const p of items) {
    for (const field of ['id', 'company', 'name', 'conditions', 'sourceName']) assert.ok(p[field]?.trim(), `${kind}: ${field} 누락`);
    assert.equal(new URL(p.sourceUrl).protocol, 'https:');
    assert.ok(p.verifiedAt?.endsWith('+09:00') && Number.isFinite(Date.parse(p.verifiedAt)), '검증 시각은 +09:00이어야 해요.');
    for (const field of ['baseRate', 'maxRate']) assert.ok(p[field] === null || (Number.isFinite(p[field]) && p[field] >= 0));
  }
  report.cash[kind] = {
    count: items.length,
    companies: new Set(items.map(p => p.company)).size,
    sources: Object.fromEntries([...new Set(items.map(p => p.sourceUrl))].map(url => [url, items.filter(p => p.sourceUrl === url).length])),
    unknownSourceDates: items.filter(p => p.sourceAsOf === null).length,
  };
}
const depositIds = new Set();
for (const term of [6, 12, 24, 36]) {
  const items = [];
  let total;
  for (let page = 1; ; page++) {
    assert.ok(page <= 1000, '비정상 페이지 수');
    const data = await get(depositBase, `/deposit/products?amount=10000000&termMonths=${term}&page=${page}&size=100`);
    assert.ok(Number.isSafeInteger(data.total) && data.total > 0);
    total ??= data.total;
    assert.equal(data.total, total, '조회 중 전체 건수가 변경됐어요. 잠시 후 다시 확인하세요.');
    assert.ok(data.items.length, '마지막 페이지 전에 빈 응답이 왔어요.');
    items.push(...data.items);
    if (items.length >= total) break;
  }
  assert.equal(items.length, total);
  unique(items);
  items.forEach(p => depositIds.add(p.id));
  report.deposit[term] = { count: items.length, companies: new Set(items.map(p => p.company)).size };
}
report.deposit.uniqueProducts = depositIds.size;
console.log(JSON.stringify(report, null, 2));
