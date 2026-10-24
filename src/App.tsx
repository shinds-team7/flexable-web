import { createBrowserRouter, Link, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import Active from '@/pages/Active';
import BillingResult from '@/pages/BillingResult';
import GoalPage from '@/pages/Goal';
import Home from '@/pages/Home';
import Invest from '@/pages/Invest';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Me from '@/pages/Me';
import Mix from '@/pages/Mix';
import News from '@/pages/News';
import OAuthCallback from '@/pages/OAuthCallback';
import Passive from '@/pages/Passive';
import PassiveAccounts from '@/pages/PassiveAccounts';
import PassiveIndex from '@/pages/PassiveIndex';
import PassivePlan from '@/pages/PassivePlan';
import Placeholder from '@/pages/Placeholder';
import Plus from '@/pages/Plus';
import Privacy from '@/pages/Privacy';
import Savings from '@/pages/Savings';
import Signup from '@/pages/Signup';

// 화면·경로 기준: docs/product/README.md §5. 새 화면은 Placeholder 자리를 바꿔 끼운다.
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/login', element: <Login /> },
      { path: '/signup', element: <Signup /> },
      { path: '/oauth/callback', element: <OAuthCallback /> },
      // 액티브·패시브 구분 시안(docs/product/proposal-active-passive.md). 팀 동의 전 화면이다.
      { path: '/active', element: <Active /> },
      { path: '/invest', element: <Invest /> },
      { path: '/passive', element: <Passive /> },
      { path: '/passive/index', element: <PassiveIndex /> },
      { path: '/passive/plan', element: <PassivePlan /> },
      { path: '/passive/accounts', element: <PassiveAccounts /> },
      { path: '/savings', element: <Savings /> },
      { path: '/mix', element: <Mix /> },
      // 예전 경로(하위 탭 시절) 호환
      { path: '/lab/stocks', element: <Navigate to="/invest" replace /> },
      { path: '/lab/savings', element: <Navigate to="/savings" replace /> },
      { path: '/lab/mix', element: <Navigate to="/mix" replace /> },
      { path: '/news', element: <News /> },
      { path: '/news/:id', element: <Placeholder title="소식 상세" desc="소식 한 건의 자세한 내용" wireframe="청년 돈 소식" /> },
      { path: '/plus', element: <Plus /> },
      { path: '/billing/result', element: <BillingResult /> },
      { path: '/p/:id', element: <Placeholder title="공유된 결과" desc="기준일 고정 결과 · 고지 · 내 돈으로 체험 진입" wireframe="공유 결과" /> },
      { path: '/home', element: <Home /> },
      { path: '/goal', element: <GoalPage /> },
      { path: '/me', element: <Me /> },
      { path: '/privacy', element: <Privacy /> },
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
