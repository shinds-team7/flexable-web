// 예금·적금·파킹·CMA 비교 화면 맨 위 종류 선택. 화면마다 주소가 달라 링크로 옮긴다.
import { NavLink } from 'react-router-dom';
import '@/styles/compare.css'; // 비교 화면 4개가 함께 쓰는 모양(탭·은행 줄·필터·상품 줄)

export const PRODUCT_TABS = [
  { to: '/deposit', label: '예금' },
  { to: '/savings', label: '적금' },
  { to: '/parking', label: '파킹' },
  { to: '/cma', label: 'CMA' },
];

export function ProductTabs() {
  return (
    <nav className="pt-tabs" aria-label="상품 종류">
      {PRODUCT_TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'on' : '')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
