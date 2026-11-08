import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { reportCrash } from '@/lib/errorReport';

/** 화면을 그리다 처리하지 못한 오류가 나면 라우터가 대신 보여 주는 화면. 오류 기록에도 남긴다. */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    // 404 같은 라우터 응답은 화면 오류가 아니다
    if (!isRouteErrorResponse(error)) reportCrash(error);
  }, [error]);
  return (
    <section>
      <div className="page">
        <div className="card col" style={{ gap: 12 }} role="alert">
          <h1 className="page-title">화면을 불러오지 못했어요</h1>
          <p className="sub">잠시 뒤 다시 시도해 주세요. 계속 같으면 홈으로 돌아가 주세요.</p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              다시 불러오기
            </button>
            <Link className="btn" to="/home">
              홈으로
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
