import { createBrowserRouter, Link, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import BillingResult from '@/pages/BillingResult';
import Diversify from '@/pages/Diversify';
import FinanceGuide from '@/pages/FinanceGuide';
import FinanceGuideCategory from '@/pages/FinanceGuideCategory';
import FinanceGuideDetail from '@/pages/FinanceGuideDetail';
import GoalScenarios from '@/pages/GoalScenarios';
import Home from '@/pages/Home';
import Invest from '@/pages/Invest';
import { InvestorTypeAbout } from '@/pages/InvestorTypeAbout';
import { InvestorTypeDetail, InvestorTypePick, InvestorTypes, InvestorTypeTest } from '@/pages/InvestorType';
import Simulation from '@/pages/Simulation';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Me from '@/pages/Me';
import News from '@/pages/News';
import NewsGuide from '@/pages/NewsGuide';
import OAuthCallback from '@/pages/OAuthCallback';
import Placeholder from '@/pages/Placeholder';
import Plus from '@/pages/Plus';
import Privacy from '@/pages/Privacy';
import { Cma, Deposit, Parking } from '@/pages/LumpSum';
import Savings from '@/pages/Savings';
import Signup from '@/pages/Signup';
import Support from '@/pages/Support';

// 화면·경로 기준: docs/product/README.md §5. 새 화면은 Placeholder 자리를 바꿔 끼운다.
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Navigate to="/home" replace /> },
      { path: '/home', element: <Landing /> },
      { path: '/login', element: <Login /> },
      { path: '/signup', element: <Signup /> },
      { path: '/oauth/callback', element: <OAuthCallback /> },
      // 투자 성향 시연 화면(docs/product/proposal-investor-type.md)
      { path: '/finance', element: <Placeholder title="금융정보" desc="금융정보 카테고리" wireframe="금융정보" /> },
      { path: '/type', element: <InvestorTypes /> },
      { path: '/type/about', element: <InvestorTypeAbout /> },
      { path: '/type/test', element: <InvestorTypeTest /> },
      { path: '/type/choose', element: <InvestorTypePick /> },
      { path: '/type/:id', element: <InvestorTypeDetail /> },
      { path: '/diversify', element: <Diversify /> },
      { path: '/invest', element: <Invest /> },
      { path: '/simulation', element: <Simulation /> },
      { path: '/savings', element: <Savings /> },
      { path: '/deposit', element: <Deposit /> },
      { path: '/parking', element: <Parking /> },
      { path: '/cma', element: <Cma /> },
      { path: '/mix', element: <Placeholder title="섞어보기" desc="배분 · 비교 · 프리셋 저장 · 공유" wireframe="섞어보기" /> },
      // 예전 경로(하위 탭 시절) 호환
      { path: '/lab/stocks', element: <Navigate to="/invest" replace /> },
      { path: '/lab/savings', element: <Navigate to="/savings" replace /> },
      { path: '/lab/mix', element: <Navigate to="/mix" replace /> },
      { path: '/news', element: <News /> },
      { path: '/news/guide', element: <NewsGuide /> },
      // 금융 가이드(처음 쓰는 사람에게 예적금·주식·ETF 등 개념 안내). 금융정보(/finance)와 다른 화면
      { path: '/guide', element: <FinanceGuide /> },
      { path: '/guide/:category', element: <FinanceGuideCategory /> },
      { path: '/guide/:category/:id', element: <FinanceGuideDetail /> },
      { path: '/news/:id', element: <Placeholder title="소식 상세" desc="소식 한 건의 자세한 내용" wireframe="청년 돈 소식" /> },
      { path: '/plus', element: <Plus /> },
      { path: '/billing/result', element: <BillingResult /> },
      { path: '/p/:id', element: <Placeholder title="공유된 결과" desc="기준일 고정 결과 · 고지 · 내 돈으로 체험 진입" wireframe="공유 결과" /> },
      { path: '/mypage', element: <Home /> },
      { path: '/goal', element: <GoalScenarios /> },
      { path: '/goal/demo', element: <Navigate to="/goal" replace /> },
      { path: '/mypage/settings', element: <Me /> },
      { path: '/me', element: <Navigate to="/mypage/settings" replace /> },
      { path: '/privacy', element: <Privacy /> },
      { path: '/support', element: <Support /> },
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
