// 페이지 제목 아래 낮은 가로 배너. 이미지가 준비되면 public/news/에 넣고 BANNER_IMAGE만 바꾼다.
import { useState } from 'react';

/** 예: '/news/banner.webp' (권장 600×224 이상, 가로:세로 약 2.7:1). null이면 자리 표시를 보여 준다. */
export const BANNER_IMAGE: string | null = null;

export function NewsBanner() {
  const [broken, setBroken] = useState(false);
  const src = broken ? null : BANNER_IMAGE;
  return (
    <div className="news-banner">
      <div className="news-banner-copy">
        <p className="news-banner-main">청년에게 필요한 정책, 한곳에서</p>
        <p className="news-banner-sub">놓치기 쉬운 지원 소식부터 신청 마감일까지</p>
      </div>
      <div className="news-banner-art">
        {src ? (
          <img src={src} alt="" onError={() => setBroken(true)} />
        ) : (
          <div className="news-banner-ph" aria-hidden="true">
            배너 이미지 자리
          </div>
        )}
      </div>
    </div>
  );
}
