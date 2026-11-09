import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from '@/components/Layout';

const SUPPORT_EMAIL = 'ucmnuniverse@gmail.com';
const CATEGORIES = ['전체', '계정·로그인', '시드머니·앱 연동', '서비스 이용'] as const;
const FAQ = [
  { category: '계정·로그인', question: '로그인 없이도 이용할 수 있나요?', answer: '체험하기를 누르면 로그인 없이 둘러볼 수 있어요. 시드머니 등 예시 데이터에는 예시 표시가 붙고, 체험 내용은 웹 계정에 저장되지 않아요.', to: '/mypage', label: '체험하러 가기' },
  { category: '계정·로그인', question: '앱 계정으로 웹사이트에 로그인할 수 있나요?', answer: '웹과 앱은 계정과 저장 환경을 따로 사용해요. 웹 계정으로 로그인한 뒤 설정의 앱 연동하기에서 앱 기록을 연결해 주세요.', to: '/mypage/settings#app-link', label: '앱 연동 설정' },
  { category: '계정·로그인', question: '웹 계정을 삭제하고 싶어요.', answer: '설정 아래의 서비스 탈퇴 버튼에서 진행할 수 있어요. 이메일 가입자는 비밀번호, 소셜 가입자는 확인 문구로 본인을 확인해요. 웹에서 탈퇴해도 앱 계정은 탈퇴되지 않아요. 로그인할 수 없다면 아래 이메일로 문의해 주세요.', to: '/mypage/settings', label: '설정으로 이동' },
  { category: '시드머니·앱 연동', question: '시드머니가 실제 통장 잔액과 달라요.', answer: '시드머니는 연동한 앱 기록 또는 웹에서 직접 입력한 금액을 기준으로 보여 줘요. 실제 통장 잔액과 다를 수 있어요. 마이페이지의 수정하기로 금액을 변경할 수 있고, 앱 반영에 실패하면 웹에만 저장됐다는 안내를 확인해 주세요.', to: '/mypage', label: '시드머니 확인' },
  { category: '시드머니·앱 연동', question: '앱 연동이 안 되거나 해제하고 싶어요.', answer: '설정의 앱 연동하기에서 연결 상태와 안내를 확인해 주세요. 연결된 상태에서는 같은 곳에서 해제할 수 있어요. 오류가 계속되면 오류 문구와 발생 시각을 이메일로 알려 주세요.', to: '/mypage/settings#app-link', label: '연동 상태 확인' },
  { category: '서비스 이용', question: 'AI 목표달성과 시뮬레이션 결과는 실제 수익인가요?', answer: '과거 자료나 가정에 따른 추정 결과예요. 실제 수익이나 목표 달성을 보장하지 않으며 원금 손실이 생길 수 있어요. 결과 화면의 계산 근거·기준일·위험 안내와 예시 표시를 함께 확인해 주세요.', to: '/goal', label: 'AI 목표달성 보기' },
  { category: '서비스 이용', question: '플러스 결제 시 실제 요금이 청구되나요?', answer: '현재 플러스는 시연용 모의 결제예요. 실제 청구나 요금제 변경은 없고, 결제·해지 화면을 미리 볼 수 있어요.', to: '/plus', label: '플러스 확인' },
  { category: '서비스 이용', question: '화면이 안 뜨거나 저장에 실패해요.', answer: '인터넷 연결을 확인하고 화면의 다시 시도 버튼을 눌러 주세요. 문제가 계속되면 이용한 화면, 발생 시각, 브라우저와 오류 문구를 이메일로 알려 주세요. 비밀번호나 인증·연동 코드는 보내지 마세요.', to: '/mypage/settings', label: '계정 상태 확인' },
];

export default function Support() {
  const [category, setCategory] = useState<string>('전체');
  const [query, setQuery] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const search = query.trim().toLocaleLowerCase();
  const items = FAQ.filter((item) => (category === '전체' || item.category === category)
    && `${item.question} ${item.answer} ${item.category}`.toLocaleLowerCase().includes(search));
  const emailHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[solpa 웹] 이용 문의')}&body=${encodeURIComponent('문의 내용:\n\n이용한 화면:\n발생 시각:\n브라우저 / 기기:\n오류 문구:\n\n※ 비밀번호와 인증·연동 코드는 보내지 마세요.')}`;

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopyMessage('이메일 주소를 복사했어요.');
    } catch {
      setCopyMessage(`복사하지 못했어요. ${SUPPORT_EMAIL} 주소를 직접 복사해 주세요.`);
    }
  };

  return (
    <div className="page support-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">고객지원</h1>
          <p className="page-desc">solpa 웹사이트 이용 중 궁금한 점을 확인해 보세요.</p>
        </div>
        <a className="btn btn-line btn-sm" href="/m/support">모바일 고객지원</a>
      </div>
      <div className="g84">
        <section className="card support-faq" aria-labelledby="faq-title">
          <h2 id="faq-title">자주 묻는 질문</h2>
          <div className="field">
            <label htmlFor="support-search">궁금한 내용을 검색해 보세요</label>
            <input id="support-search" className="input" type="search" placeholder="로그인, 시드머니, 앱 연동…"
              value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="support-categories" role="group" aria-label="질문 분류">
            {CATEGORIES.map((value) => <button type="button" key={value} className="btn btn-line btn-sm"
              aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}
          </div>
          <p className="meta" role="status">질문 {items.length}개</p>
          <div>
            {items.map((item) => <details className="support-question" key={item.question}>
              <summary>{item.question}</summary>
              <div className="support-answer">
                <p>{item.answer}</p>
                <Link to={item.to}>{item.label} →</Link>
              </div>
            </details>)}
            {items.length === 0 && <div className="empty-box">
              <h3>검색 결과가 없어요</h3>
              <p className="sub">다른 단어로 검색하거나 이메일로 문의해 주세요.</p>
              <button type="button" className="btn btn-line btn-sm" onClick={() => { setQuery(''); setCategory('전체'); }}>전체 질문 보기</button>
            </div>}
          </div>
        </section>
        <aside className="col" aria-label="문의와 이용 안내">
          <section className="card support-contact">
            <h2>도움이 더 필요하신가요?</h2>
            <p className="sub">웹사이트 오류나 이용 관련 문의를 이메일로 보내 주세요.</p>
            <a href={emailHref}>{SUPPORT_EMAIL}</a>
            <a className="btn btn-primary" href={emailHref}>이메일로 문의하기</a>
            <button type="button" className="btn btn-line" onClick={copyEmail}>이메일 주소 복사</button>
            <p className="meta">기본 메일 앱에서 작성해요. 메일 앱이 열리지 않으면 주소를 복사해 이용 중인 이메일 서비스에서 보내 주세요.</p>
            <p className="meta" role="status">{copyMessage}</p>
          </section>
          <section className="card support-contact">
            <h2>문의 전 확인해 주세요</h2>
            <p className="sub">이용한 화면, 발생 시각, 브라우저와 오류 문구를 함께 보내 주시면 확인에 도움이 돼요.</p>
            <p className="meta">비밀번호와 인증·연동 코드는 보내지 마세요. 화면을 첨부한다면 개인정보를 가려 주세요.</p>
            <Link to="/mypage/settings">계정·앱 연동 설정 →</Link>
            <Link to="/privacy">웹 개인정보처리방침 →</Link>
            <a href="/m/support">앱·모바일 관련 도움말 →</a>
          </section>
        </aside>
      </div>
      <Footer />
    </div>
  );
}
