// 소식 카드·저장함이 같이 쓰는 작은 조각: 마감 배지, 저장 버튼, 공고문 링크.
import type { YouthNews } from '@/data/news';
import { deadlineState, type ApplyPeriod } from '@/lib/deadline';
import { fmtMonthDay } from '@/lib/format';
import { Icon } from '../Icons';

/** 오늘 마감은 빨강, 7일 이내는 브랜드 블루(둘 다 시계 아이콘). 색만으로 구분하지 않도록 글자를 늘 같이 쓴다. */
export function DeadlineBadge({ period, today }: { period: ApplyPeriod; today: string }) {
  const s = deadlineState(period, today);
  switch (s.kind) {
    case 'today':
      return (
        <span className="dday urgent">
          <Icon id="i-clock" />
          오늘 마감
        </span>
      );
    case 'open':
      return s.days <= 7 ? (
        <span className="dday">
          <Icon id="i-clock" />
          D-{s.days}
        </span>
      ) : (
        <span className="dday calm">D-{s.days}</span>
      );
    case 'always':
      return <span className="dday calm">상시</span>;
    case 'upcoming':
      return <span className="dday calm">{fmtMonthDay(s.start)} 시작</span>;
    case 'closed':
      return <span className="dday calm">마감됨</span>;
    default:
      return <span className="dday calm">마감일 미정</span>;
  }
}

export function SaveButton({ title, saved, onToggle }: { title: string; saved: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="bookmark" aria-pressed={saved} aria-label={`${title} 저장`} title={saved ? '저장 빼기' : '저장'} onClick={onToggle}>
      <Icon id={saved ? 'i-mark-on' : 'i-mark'} size={18} />
    </button>
  );
}

/** 공유: 기기 공유 창이 있으면 그것을, 없으면 제목·공고문 링크를 클립보드에 복사한다. 상세 화면이 생기면 그 주소로 바꾼다. */
export function ShareButton({ n, onDone }: { n: Pick<YouthNews, 'title' | 'summary' | 'source'>; onDone: (msg: string) => void }) {
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: n.title, text: n.summary ? `${n.title} · ${n.summary}` : n.title, url: n.source.url });
      } catch {
        // 사용자가 공유 창을 닫은 경우. 알릴 것 없음
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${n.title}\n${n.source.url}`);
      onDone('링크를 복사했어요');
    } catch {
      onDone('링크를 복사하지 못했어요');
    }
  };
  return (
    <button type="button" className="bookmark" aria-label={`${n.title} 공유`} title="공유" onClick={share}>
      <Icon id="i-share" size={18} />
    </button>
  );
}

export function NoticeLink({ url, className, arrow = true }: { url: string; className?: string; arrow?: boolean }) {
  return (
    <a className={className} href={url} target="_blank" rel="noreferrer">
      공고문 보기{arrow && ' ↗'}
      <span className="sr-only">(새 창)</span>
    </a>
  );
}

/** 마감일 문장: "10월 25일까지" / "상시 모집" / "공고문에서 확인" */
export function deadlineText(n: Pick<YouthNews, 'applyDeadline' | 'alwaysOpen'>) {
  if (n.alwaysOpen) return '상시 모집';
  return n.applyDeadline ? `${fmtMonthDay(n.applyDeadline)}까지` : '마감일 미정 · 공고문에서 확인';
}
