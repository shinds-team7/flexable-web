// 소식 카드·저장함이 같이 쓰는 작은 조각: 마감 배지, 저장 버튼, 공고문 링크.
import type { YouthNews } from '@/data/news';
import { deadlineState, type ApplyPeriod } from '@/lib/deadline';
import { fmtMonthDay } from '@/lib/format';
import { Icon } from '../Icons';

/** 오늘 마감은 빨강, 7일 이내는 주황(둘 다 시계 아이콘). 색만으로 구분하지 않도록 글자를 늘 같이 쓴다. */
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
    <button type="button" className="bookmark" aria-pressed={saved} aria-label={`${title} 저장`} onClick={onToggle}>
      <Icon id={saved ? 'i-mark-on' : 'i-mark'} size={18} />
    </button>
  );
}

export function NoticeLink({ url, className }: { url: string; className?: string }) {
  return (
    <a className={className} href={url} target="_blank" rel="noreferrer">
      공고문 보기 ↗<span className="sr-only">(새 창)</span>
    </a>
  );
}

/** 카드 아래쪽 마감일: "마감일 10월 25일" / "상시 모집" / "마감일 미정" */
export function deadlineDateText(n: Pick<YouthNews, 'applyDeadline' | 'alwaysOpen'>) {
  if (n.alwaysOpen) return '상시 모집';
  return n.applyDeadline ? `마감일 ${fmtMonthDay(n.applyDeadline)}` : '마감일 미정';
}

/** 마감일 문장: "10월 25일까지" / "상시 모집" / "공고문에서 확인" */
export function deadlineText(n: Pick<YouthNews, 'applyDeadline' | 'alwaysOpen'>) {
  if (n.alwaysOpen) return '상시 모집';
  return n.applyDeadline ? `${fmtMonthDay(n.applyDeadline)}까지` : '마감일 미정 · 공고문에서 확인';
}
