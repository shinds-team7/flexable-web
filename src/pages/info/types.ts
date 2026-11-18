// /info-web, /info-app 소개 페이지의 내용 형식. 화면 틀은 InfoPage.tsx, 내용은 web.tsx·app.tsx에 둔다.
import type { ReactNode } from 'react';

/** 숫자 카드. viz가 있으면 링(비율) 또는 막대 두 개(전후 비교)를 같이 그린다 */
export type Stat = {
  value: string;
  unit?: string;
  label: string;
  source?: string;
  viz?: { kind: 'ring'; pct: number } | { kind: 'bars'; from: number; to: number; fromLabel: string; toLabel: string; max: number };
};
export type Card = { title: string; desc: string; tag?: string };
export type Step = { title: string; desc: string };
export type IconName = 'wallet' | 'book' | 'chart' | 'calendar' | 'coin' | 'bell' | 'target' | 'news' | 'link' | 'shield';
/** 고민 → 해결 카드(위 회색 알약 = 고민, 가운데 = 해결, 아래 파란 알약 = 어느 서비스) */
export type Pain = { pain: string; icon: IconName; title: string; desc: string; tag: string };

export type Feature = {
  name: string;
  /** 짧은 큰 제목. 줄바꿈은 \n */
  head: string;
  desc: string;
  /** 웹은 경로, 앱은 메뉴 위치 */
  where?: string;
  points?: string[];
  /** 화면 이미지. 파일이 없으면 "예시 이미지" 자리를 그린다 */
  img: string;
};

export type Milestone = { date: string; title: string; desc: string };
export type StackGroup = { group: string; items: string[] };

export type InfoContent = {
  docTitle: string;
  brand: string;
  brandSub: string;
  /** 마무리 띠 뒤의 큰 글자 */
  watermark: string;
  hero: { kicker: string; title: string; lead: string; visual: ReactNode; illust?: boolean };
  origin: { title: string; lead: string; stats: Stat[]; source: string; pains: Pain[]; answer: string };
  values: Card[];
  journey: { title: string; lead: string; steps: Step[] };
  features: { title: string; lead: string; frame: 'browser' | 'phone'; items: Feature[] };
  tech: { title: string; lead: string; stack: StackGroup[] };
  arch: { title: string; lead: string; diagram: ReactNode; notes: Card[] };
  principles: { title: string; lead: string; items: Card[] };
  collab: { title: string; lead: string; flow: Step[]; rules: Card[] };
  story: { title: string; lead: string; timeline: Milestone[]; numbers: Stat[] };
  outro: { title: string; lead: string; links: { label: string; url: string }[] };
};
