import type { components } from '@/lib/api-schema';

// 배치고사 문제 카드의 유형 설명과 제목 정리(decisions/2026-11-05-virtual-sim-contest 2-2, Issue #289).
// 설명은 그 공시가 무엇인지만 말한다. 방향 암시·과거 경향·상승 비율은 넣지 않는다(결과 화면에서만 공개).
// backend VirtualContestPolicyTest가 이 파일을 읽어 유형 12개 모두 설명이 있고 금지 표현이 없는지 검사한다.
type Category = components['schemas']['VirtualSimCategory'];

export const CATEGORY_GUIDE: Record<Category, string> = {
  EARNINGS: '회사가 결산을 마치기 전에 집계한 매출·영업이익 같은 실적을 먼저 알리는 공시예요. 감사 전 숫자라 확정 실적과 다를 수 있어요.',
  SUPPLY_CONTRACT: '제품이나 서비스를 공급하기로 계약을 맺었다고 알리는 공시예요. 계약 금액이 최근 매출에 견줘 일정 규모를 넘으면 알려야 해요.',
  NEW_SHARES: '새 주식을 발행해 투자자에게 돈을 받고 파는 결정이에요. 누구에게 어떤 방식으로 파는지, 모은 돈을 어디에 쓰는지가 함께 나와요.',
  BONUS_SHARES: '회사 안에 쌓아 둔 자본을 주식으로 바꿔 기존 주주에게 새 주식을 나눠 주는 결정이에요. 주식 수는 늘지만 회사로 새로 들어오는 돈은 없어요.',
  BONDS: '돈을 빌리려고 채권(사채)을 발행하는 결정이에요. 전환사채·신주인수권부사채·교환사채는 나중에 주식으로 바꾸거나 주식을 받을 수 있는 권리가 붙어 있어요.',
  BUYBACK_ACQUIRE: '회사가 자기 회사 주식을 사들이기로 한 결정이에요. 직접 사거나 증권사와 신탁 계약을 맺어 사고, 사들인 주식은 갖고 있거나 없앨(소각) 수 있어요.',
  BUYBACK_DISPOSE: '회사가 갖고 있던 자기 회사 주식을 팔거나 임직원 등에게 넘기기로 한 결정이에요.',
  DIVIDEND: '이익의 일부를 주주에게 현금이나 주식으로 나눠 주기로 한 결정이에요. 받을 수 있는 주주를 정하는 기준일이 함께 정해져요.',
  RESTRUCTURE: '회사를 다른 회사와 합치거나(합병) 사업 일부를 떼어 새 회사로 나누는(분할) 결정이에요. 사업을 사고파는 영업양수도도 여기에 들어가요.',
  FACILITY: '공장·설비·토지 같은 자산을 사거나 다른 회사의 지분을 사들이기로 한 결정이에요.',
  LEGAL: '회사가 일정 금액 이상의 소송을 당했거나, 임직원의 횡령·배임 혐의처럼 법적인 문제가 생겼다고 알리는 공시예요.',
  OWNERSHIP: '회사의 주식을 가장 많이 가진 최대주주가 바뀌었다고 알리는 공시예요.',
};

/**
 * 정리한 공시 제목. main: 보일 제목, kind: 보고서 이름(주요사항보고서 등), notes: [기재정정]·(자율공시) 같은 표시,
 * subsidiary: 종속회사·자회사의 주요경영사항(회사가 아니라 종속회사가 내린 결정)
 */
export type CleanTitle = { main: string; kind: string | null; notes: string[]; subsidiary: boolean };

/** 종속회사 공시 안내(유형 설명 아래). 방향·경향은 말하지 않는다 */
export const SUBSIDIARY_NOTE = '이 회사가 아니라 이 회사의 종속회사(자회사)가 내린 결정을 알리는 공시예요. 종속회사 공시는 공시 주요 내용을 제공하지 않아요.';

/**
 * DART 제목 "[기재정정]주요사항보고서(유상증자결정)" → main "유상증자 결정", kind "주요사항보고서", notes ["기재정정"].
 * "유상증자결정(종속회사의주요경영사항)" → main "유상증자 결정", kind "종속회사 주요경영사항", subsidiary.
 * 가운뎃점(ㆍ)은 ·로, 끝의 "결정"은 띄어 쓴다. 괄호가 하나로 감싸지 않은 제목은 그대로 둔다.
 */
export function cleanTitle(title: string): CleanTitle {
  const notes: string[] = [];
  let t = title.trim();
  for (let m = t.match(/^\[([^\]]+)\]\s*/); m; m = t.match(/^\[([^\]]+)\]\s*/)) {
    notes.push(m[1]);
    t = t.slice(m[0].length);
  }
  let kind: string | null = null;
  let subsidiary = false;
  // 끝의 (종속회사의주요경영사항)·(자회사의 주요경영사항)·(자율공시) 같은 꼬리 괄호를 떼어 표시로 옮긴다
  for (let m = t.match(/\(([^()]+)\)\s*$/); m && /주요경영사항|자율공시|공정공시/.test(m[1]); m = t.match(/\(([^()]+)\)\s*$/)) {
    const tail = m[1].replace(/\s/g, '');
    if (/주요경영사항/.test(tail)) { subsidiary = true; kind = tail.startsWith('자회사') ? '자회사 주요경영사항' : '종속회사 주요경영사항'; }
    else notes.unshift(tail);
    t = t.slice(0, m.index).trim();
  }
  const wrapped = t.match(/^(주요사항보고서)\((.+)\)$/);
  if (wrapped) { kind = kind ? `${wrapped[1]} · ${kind}` : wrapped[1]; t = wrapped[2]; }
  const main = t.replace(/ㆍ/g, '·').replace(/(\S)결정(\(|$)/, '$1 결정$2');
  return { main, kind, notes, subsidiary };
}
