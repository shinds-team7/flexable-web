// 은행 아이콘 자리. 은행 로고 이미지는 상표라 쓰지 않고, 이름에서 뽑은 글자를 토큰 색 동그라미에 넣는다(같은 이름은 늘 같은 색).
// 로고 파일이 준비되면 LOGOS에 이름 → 이미지 주소만 넣으면 된다.
import { bankColor } from '@/data/bankColors';

const LOGOS: Record<string, string> = {};
const COLORS = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-4)'];

/** '농협은행주식회사' → '농협', 'OK저축은행' → 'OK저축'. 화면에서 짧게 부를 때 쓴다. */
export function shortBankName(name: string): string {
  const cleaned = name.replace(/주식회사|\(주\)|㈜/g, '').trim();
  const sav = cleaned.endsWith('저축은행');
  const base = cleaned.replace(/저축은행$|은행$/, '').trim() || cleaned;
  return sav ? base + '저축' : base;
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function BankBadge({ name, size = 40 }: { name: string; size?: number }) {
  const logo = LOGOS[name];
  const short = shortBankName(name);
  const text = /^[A-Za-z0-9]/.test(short) ? short.slice(0, 2).toUpperCase() : short.slice(0, 2);
  const brand = logo ? undefined : bankColor(name);
  // 노랑처럼 밝은 대표 색 위에는 흰 글자가 안 보여 어두운 글자를 쓴다
  const light = brand ? 0.299 * parseInt(brand.slice(1, 3), 16) + 0.587 * parseInt(brand.slice(3, 5), 16) + 0.114 * parseInt(brand.slice(5, 7), 16) > 170 : false;
  return (
    <span
      className="bank-badge"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34), background: logo ? 'var(--card)' : (brand ?? COLORS[hash(name) % COLORS.length]), ...(light ? { color: '#1F2937' } : null) }}
      aria-hidden="true"
    >
      {logo ? <img src={logo} alt="" width={size} height={size} /> : text}
    </span>
  );
}
