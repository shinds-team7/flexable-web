// 30초 진단: 5단계로 받은 내 조건을 소식과 맞춰 "신청 가능성이 높은 소식"과 "추가 확인이 필요한 소식"으로 나눈다. 화면과 분리한 순수 함수.
// 나이·지역·분야와 신청 대상 조건(취업·혼인·학력·전공·특화, 온통청년 코드)을 소식과 맞춘다. 소득은 금액으로 따지지 않는다
// (중위소득 비교는 서버 계산 영역이라 소득 기준이 있는 소식은 늘 추가 확인으로 보낸다).
// 소식의 조건 목록은 null = 원문에서 확인 못 함, [] = 제한 없음, 값이 있으면 그중 하나에 해당해야 한다.
import { newsCategories, type NewsCategory, type RegionName, type YouthNews } from '@/data/news';
import { selectNews, type NewsSort } from './newsList';

export const AGE_RANGE = { min: 15, max: 45 } as const;

export type EmployStatus = 'UNEMPLOYED' | 'EMPLOYED' | 'FREELANCE';

export const EMPLOY_OPTIONS: { id: EmployStatus; label: string }[] = [
  { id: 'UNEMPLOYED', label: '미취업' },
  { id: 'EMPLOYED', label: '재직자' },
  { id: 'FREELANCE', label: '프리랜서' },
];
export const JOB_DETAILS = ['재직자', '자영업자', '미취업자', '프리랜서', '일용근로자', '(예비)창업자', '단기근로자', '영농종사자', '기타'] as const;
export const MARITAL_OPTIONS = ['미혼', '기혼'] as const;
export const SCHOOL_OPTIONS = ['고졸 미만', '고교 재학', '고졸 예정', '고교 졸업', '대학 재학', '대학 예정', '대학 졸업', '석·박사', '기타', '제한없음'] as const;
export const MAJOR_OPTIONS = ['인문계열', '사회계열', '상경계열', '이학계열', '공학계열', '예체능계열', '농산업계열', '기타', '제한없음'] as const;
export const SPECIAL_OPTIONS = ['중소기업', '여성', '기초생활수급자', '한부모가정', '장애인', '농업인', '군인', '지역인재', '기타'] as const;
export type IncomeKind = 'YEAR' | 'MONTH' | 'UNKNOWN';

export type DiagnoseProfile = {
  age: number | null;
  region: RegionName | null;
  employ: EmployStatus | null;
  jobDetail: string | null;
  household: number | null;
  incomeKind: IncomeKind;
  income: number | null; // 만 원
  marital: string | null;
  topic: NewsCategory | null; // null = 전체
  school: string | null;
  major: string | null;
  special: string[];
  keyword: string;
  sort: NewsSort;
};

export const EMPTY_PROFILE: DiagnoseProfile = {
  age: null,
  region: null,
  employ: null,
  jobDetail: null,
  household: null,
  incomeKind: 'UNKNOWN',
  income: null,
  marital: null,
  topic: null,
  school: null,
  major: null,
  special: [],
  keyword: '',
  sort: 'deadline',
};

export type Diagnosed = { n: YouthNews; checks: string[] };
export type DiagnoseResult = { fit: Diagnosed[]; confirm: Diagnosed[] };

export const validAge = (a: number | null) => a != null && Number.isInteger(a) && a >= AGE_RANGE.min && a <= AGE_RANGE.max;

const EMPLOY_LABEL: Record<EmployStatus, string> = { UNEMPLOYED: '미취업자', EMPLOYED: '재직자', FREELANCE: '프리랜서' };

/** 내 조건 하나(고른 이름들)를 소식의 조건 목록과 맞춘다 */
type CondResult = 'SKIP' | 'MATCH' | 'UNKNOWN' | 'OUT';
function cond(mine: string[], theirs: string[] | null): CondResult {
  if (mine.length === 0) return 'SKIP';
  if (theirs === null) return 'UNKNOWN';
  if (theirs.length === 0) return 'MATCH'; // 제한 없음
  return mine.some((m) => theirs.includes(m)) ? 'MATCH' : 'OUT';
}

/**
 * 나이·지역·분야나 내가 고른 취업·혼인·학력·전공 조건이 안 맞으면 뺀다. 남은 소식 중 원문에서 확인 못 한 조건이 있거나 소득 기준이 있거나
 * 대상이 정해진 특화 정책이면(내가 특화를 안 골랐을 때) "추가 확인", 나머지는 "신청 가능성 높음".
 * 마감된 소식은 selectNews가 이미 내린다.
 */
export function diagnose(items: YouthNews[], p: DiagnoseProfile, today: string): DiagnoseResult {
  const base = selectNews(items, { sort: p.sort, query: p.keyword }, today);
  const fit: Diagnosed[] = [];
  const confirm: Diagnosed[] = [];
  const job = [p.employ ? EMPLOY_LABEL[p.employ] : null, p.jobDetail].filter((x): x is string => x != null);
  const mine: [string, string[], keyof YouthNews['audience']][] = [
    ['취업', job, 'employment'],
    ['혼인', p.marital ? [p.marital] : [], 'marital'],
    ['학력', p.school ? [p.school] : [], 'schools'],
    ['전공', p.major ? [p.major] : [], 'majors'],
  ];
  for (const n of base) {
    const { ageMin, ageMax, incomeLimit, special } = n.audience;
    const ageKnown = ageMin != null || ageMax != null;
    if (p.age != null && ageKnown && ((ageMin != null && p.age < ageMin) || (ageMax != null && p.age > ageMax))) continue;
    if (p.region && n.regions !== 'NATIONWIDE' && !n.regions.includes(p.region)) continue;
    if (p.topic && !newsCategories(n).includes(p.topic)) continue;

    const checks: string[] = [];
    let needsConfirm = false;
    let out = false;
    if (p.age != null) {
      if (ageKnown) checks.push('나이 맞음');
      else {
        checks.push('나이 조건 공고문 확인');
        needsConfirm = true;
      }
    }
    if (p.region) checks.push(n.regions === 'NATIONWIDE' ? '전국 대상' : '지역 맞음');
    for (const [label, values, key] of mine) {
      const r = cond(values, n.audience[key] as string[] | null);
      if (r === 'OUT') out = true;
      else if (r === 'UNKNOWN') {
        checks.push(`${label} 조건 공고문 확인`);
        needsConfirm = true;
      } else if (r === 'MATCH' && (n.audience[key] as string[]).length > 0) checks.push(`${label} 맞음`);
    }
    // 특화 대상 정책: 내가 해당하는 특화를 골랐으면 맞는 것만 남기고, 아무것도 안 골랐으면 제외하지 않고 추가 확인
    if (special != null && special.length > 0) {
      if (p.special.length === 0) {
        checks.push(`특화 대상(${special.join('·')}) 확인`);
        needsConfirm = true;
      } else if (p.special.some((x) => special.includes(x))) checks.push('특화 조건 맞음');
      else out = true;
    } else if (special === null && p.special.length > 0) {
      checks.push('특화 조건 공고문 확인');
      needsConfirm = true;
    }
    if (out) continue;
    if (incomeLimit) {
      checks.push('소득 기준 확인 필요');
      needsConfirm = true;
    }
    (needsConfirm ? confirm : fit).push({ n, checks });
  }
  return { fit, confirm };
}
