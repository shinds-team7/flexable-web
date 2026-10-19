// mobile-demo(Expo 웹 빌드, baseUrl /m)의 결과를 사이트 빌드 dist/m 에 합친다.
import { cpSync, existsSync, rmSync } from 'node:fs';

const from = 'mobile-demo/dist';
const to = 'dist/m';
if (!existsSync(from)) {
  console.error(`${from} 이 없어요. 먼저 npm run build:m 을 실행하세요.`);
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`merged ${from} -> ${to}`);
