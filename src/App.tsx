import { createBrowserRouter, Link } from 'react-router-dom';
import { Layout, RequireMember } from '@/components/Layout';
import Home from '@/pages/Home';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Me from '@/pages/Me';
import OAuthCallback from '@/pages/OAuthCallback';
import Placeholder from '@/pages/Placeholder';

// 화면·경로 기준: project2 docs/web/README.md §5. 새 화면은 Placeholder 자리를 바꿔 끼운다.
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/login', element: <Login /> },
      { path: '/signup', element: <Placeholder title="이메일로 가입하기" desc="앱과 같은 계정으로 가입해요(POST /auth/signup)." wireframe="로그인" /> },
      { path: '/oauth/callback', element: <OAuthCallback /> },
      { path: '/lab/stocks', element: <Placeholder title="주식 타임머신" desc="조건 · 원금/평가액/적금 비교선 · 사건 목록/상세" wireframe="주식 타임머신" /> },
      { path: '/lab/savings', element: <Placeholder title="적금 비교" desc="지금 상품 · 과거 평균 · 정책 적금 조건 입력" wireframe="적금 비교" /> },
      { path: '/lab/mix', element: <Placeholder title="섞어보기" desc="배분 · 비교 · 프리셋 저장 · 공유" wireframe="섞어보기" /> },
      { path: '/news', element: <Placeholder title="청년 돈 소식" desc="혜택 · 대상 · 마감 · 원문 · 계산 연결 · 챙기기" wireframe="청년 돈 소식" /> },
      { path: '/news/:id', element: <Placeholder title="소식 상세" desc="소식 한 건의 자세한 내용" wireframe="청년 돈 소식" /> },
      { path: '/plus', element: <Placeholder title="플러스" desc="무료/유료 가치 · 모의 결제" wireframe="플러스" /> },
      { path: '/billing/result', element: <Placeholder title="모의 결제 결과" desc="모의 완료 · 실패 · 해지 확인" wireframe="모의 결제 결과" /> },
      { path: '/p/:id', element: <Placeholder title="공유된 결과" desc="기준일 고정 결과 · 고지 · 내 돈으로 체험 진입" wireframe="공유 결과" /> },
      {
        element: <RequireMember />,
        children: [
          { path: '/home', element: <Home /> },
          { path: '/goal', element: <Placeholder title="목표" desc="웹 목표 설정 · 진행 확인" wireframe="웹 목표" /> },
          { path: '/me', element: <Me /> },
        ],
      },
      {
        path: '*',
        element: (
          <div className="page">
            <div className="empty-box">
              <h3>찾는 화면이 없어요</h3>
              <Link className="btn btn-primary" to="/">
                처음으로
              </Link>
            </div>
          </div>
        ),
      },
    ],
  },
]);
