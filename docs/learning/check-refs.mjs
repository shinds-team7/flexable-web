// 학습 가이드의 코드 위치(R("파일", "찾을 글자"))를 지금 체크아웃한 코드와 맞춘다.
// - 찾을 글자가 있는 첫 줄 번호를 content/*.js에 다시 써 넣는다.
// - 파일이 없거나 글자를 못 찾으면 목록을 보여 주고 종료 코드 1로 끝난다(코드가 바뀌었으니 내용을 고칠 차례).
// 실행: 저장소 루트에서 `node docs/learning/check-refs.mjs` (확인만: `--check`)
// 앱 저장소 위치(app: 접두사)는 FLEXABLE_APP 환경변수, 없으면 ../flexable-app, ../../flexable-app 순서로 찾는다.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const checkOnly = process.argv.includes('--check');
const B = 'backend/src/main/java/com/flexable/web/';
const appRoot = [process.env.FLEXABLE_APP, join(root, '../flexable-app'), join(root, '../../flexable-app'), join(root, '../../../flexable-app')]
  .find((p) => p && existsSync(join(p, 'backend/src/main/java/com/flexable/api')));

const re = /R\(\s*(B\s*\+\s*)?"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*(?:,\s*\d+\s*)?\)/g;
const cache = new Map();
const lines = (file) => {
  if (!cache.has(file)) cache.set(file, existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : null);
  return cache.get(file);
};

const problems = [];
const warnings = [];
let total = 0;
let changed = 0;
for (const name of readdirSync(join(here, 'content')).filter((f) => f.endsWith('.js'))) {
  const path = join(here, 'content', name);
  const src = readFileSync(path, 'utf8');
  const out = src.replace(re, (whole, pre, p, rawNeedle) => {
    total++;
    const rel = pre ? B + p : p;
    const needle = JSON.parse(`"${rawNeedle}"`);
    let file;
    if (rel.startsWith('app:')) {
      if (!appRoot) { warnings.push(`앱 저장소를 찾지 못해 건너뜀: ${rel}`); return whole; }
      file = join(appRoot, rel.slice(4));
    } else file = join(root, rel);
    const ls = lines(file);
    if (!ls) { problems.push(`${name}: 파일 없음 ${rel}`); return whole; }
    const hits = ls.reduce((a, l, i) => (l.includes(needle) ? [...a, i + 1] : a), []);
    if (!hits.length) { problems.push(`${name}: "${needle}"를 ${rel}에서 못 찾음`); return whole; }
    if (hits.length > 1 && !rel.endsWith('.sql') && !rel.endsWith('.yml')) warnings.push(`${rel}: "${needle}"가 ${hits.length}곳(첫 줄 ${hits[0]} 사용)`);
    const next = `R(${pre ? 'B + ' : ''}"${p}", "${rawNeedle}", ${hits[0]})`;
    if (next !== whole) changed++;
    return next;
  });
  if (!checkOnly && out !== src) writeFileSync(path, out);
}

console.log(`코드 위치 ${total}개 확인, ${checkOnly ? '바뀔' : '바꾼'} 줄 번호 ${changed}개${appRoot ? '' : ' (앱 저장소 없음)'}`);
warnings.forEach((w) => console.log('  참고: ' + w));
if (problems.length) {
  console.log('고쳐야 할 위치:');
  problems.forEach((p) => console.log('  ' + p));
  process.exit(1);
}
if (checkOnly && changed) process.exit(1);
