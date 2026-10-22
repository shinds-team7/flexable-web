// 첫 방문 안내(F5)를 봤는지. 로그인하면 계정(GET·PATCH /me/settings의 seenTours·disclaimerAck), 체험은 이 브라우저에 남긴다.
// 서버 조회가 실패하면 브라우저 값으로 판단하고, 저장이 실패해도 화면은 그대로 쓴다(다음 로그인에 다시 뜰 수 있음, 01-product F5-5).
// 브라우저 저장은 개인정보처리방침 제8조 "첫 화면 안내 표시 여부"에 해당한다.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/auth/session';
import { saveSettings, type Settings } from '@/auth/settings';
import { api } from '@/lib/api';

/** 서버 seenTours 키와 같다([a-z0-9-], 40자 이내) */
export type TourKey = 'invest';

const storeKey = (k: TourKey) => `fx.tour.${k}`;
const seenHere = (k: TourKey) => {
  try {
    return localStorage.getItem(storeKey(k)) === '1';
  } catch {
    return false;
  }
};
const markHere = (k: TourKey) => {
  try {
    localStorage.setItem(storeKey(k), '1');
  } catch {
    /* 무시 */
  }
};

export type FirstVisit = {
  /** pending: 아직 판단 중(로그인 확인·설정 조회) */
  state: 'pending' | 'show' | 'seen';
  /** 안내를 닫았다. ack=true면 [첫 결과 보기]로 고지 확인까지 한 것 */
  done: (ack: boolean) => void;
};

export function useFirstVisit(key: TourKey): FirstVisit {
  const { status } = useSession();
  const [local, setLocal] = useState(() => seenHere(key));
  const member = status === 'member';
  const settings = useQuery({
    queryKey: ['me', 'settings'],
    queryFn: () => api<Settings>('/me/settings'),
    enabled: member && !local,
    staleTime: Infinity,
    retry: false,
  });

  const state: FirstVisit['state'] =
    local ? 'seen'
    : status === 'loading' ? 'pending'
    : !member ? 'show'
    : settings.isPending ? 'pending'
    : settings.data?.seenTours.includes(key) ? 'seen'
    : 'show';

  const done = (ack: boolean) => {
    markHere(key);
    setLocal(true);
    if (member) void saveSettings({ seenTours: [key], ...(ack ? { disclaimerAck: true as const } : {}) });
  };
  return { state, done };
}
