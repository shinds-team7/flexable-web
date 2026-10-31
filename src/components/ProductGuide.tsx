// 예금·적금·파킹·CMA가 각각 어떤 상품인지 설명하는 가이드 창. 각 화면에 처음 들어오면 한 번 저절로 뜨고, 상단 카드의 [?]로 다시 연다.
// 본 적이 있는지는 이 브라우저(localStorage fx.tour 와 같은 종류의 "첫 화면 안내 표시 여부")에만 남긴다. 서버로 보내지 않는다.
// 설명은 일반적인 상품 구조만 적는다. 특정 상품 추천·수익 보장·가입 유도는 하지 않는다.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icons';
import { lumpReady } from '@/data/deposit';

export type ProductKind = 'deposit' | 'savings' | 'parking' | 'cma';

type Guide = { name: string; lead: string; what: string[]; fit: string[]; know: string[] };

const GUIDES: Record<ProductKind, Guide> = {
  deposit: {
    name: '예금',
    lead: '목돈을 한 번에 맡겨 두고, 정한 기간이 끝나면 원금과 이자를 받는 상품이에요.',
    what: ['가입할 때 기간(6개월·1년 등)과 금리가 정해져요.', '금리는 처음 정한 대로 만기까지 이어지는 상품이 대부분이에요.', '이자 계산은 단리(원금에만 이자)와 복리(이자에도 이자)로 나뉘어요.'],
    fit: ['당장 쓸 일이 없는 목돈이 있을 때', '원금이 줄지 않는 안전한 상품을 원할 때'],
    know: ['만기 전에 해지하면 약속한 금리보다 낮은 중도해지 금리를 받아요.', '이자에는 이자소득세 15.4%가 붙어요(세후 이자로 보여 드려요).', '은행·저축은행 예금은 금융회사당 1인 기준 원금과 이자를 합쳐 1억 원까지 보호돼요.'],
  },
  savings: {
    name: '적금',
    lead: '매달 정해진 돈을 꾸준히 넣어 만기에 원금과 이자를 한꺼번에 받는 상품이에요.',
    what: ['매달 넣는 돈과 기간(6개월·1년 등)을 정해 가입해요.', '정액적립식은 매달 같은 금액, 자유적립식은 넣고 싶은 때 넣고 싶은 만큼 넣어요.', '넣은 기간만큼만 이자가 붙어서, 같은 금리라도 예금보다 이자가 적어 보여요.'],
    fit: ['목돈이 없지만 꾸준히 모으고 싶을 때', '월급날마다 일정액을 따로 떼어 두고 싶을 때'],
    know: ['금리가 높아 보여도 우대조건을 채워야 받는 경우가 많아요. 기본금리와 최고금리를 같이 보세요.', '월 납입 한도가 있는 상품이 있어요.', '이자에는 이자소득세 15.4%가 붙고, 보호 한도는 예금과 같아요.'],
  },
  parking: {
    name: '파킹통장',
    lead: '주차하듯 잠깐 돈을 넣어 두어도 이자가 붙고, 언제든 넣고 뺄 수 있는 통장이에요.',
    what: ['하루만 맡겨도 이자가 붙고, 해지 없이 자유롭게 꺼낼 수 있어요.', '정해진 만기가 없어서 이 화면은 1년 두었을 때를 기준으로 계산해요.', '금리는 시장 상황에 따라 바뀔 수 있어요.'],
    fit: ['곧 쓸 돈이나 비상금을 잠깐 두고 싶을 때', '월급을 받고 다음 달 지출까지 이자를 받고 싶을 때'],
    know: ['높은 금리를 받는 금액에 한도가 있는 상품이 있어요. 한도를 넘는 돈은 금리가 낮아질 수 있어요.', '금리가 바뀌면 받는 이자도 달라져요.', '보호 한도는 예금과 같아요(금융회사당 1인 1억 원).'],
  },
  cma: {
    name: 'CMA',
    lead: '증권사에 돈을 맡기면 증권사가 채권 등에 투자해 그 수익을 이자로 나눠 주는 통장이에요.',
    what: ['RP형·MMF형·종금형·발행어음형처럼 돈을 굴리는 방식이 달라요.', '입출금이 자유로운 편이고, 하루만 맡겨도 수익이 생겨요.', '실적에 따라 수익이 달라져서 금리가 고정된 것이 아니에요.'],
    fit: ['증권 계좌에 대기 중인 돈을 놀리지 않고 싶을 때', '은행 파킹통장과 비교해 보고 싶을 때'],
    know: ['상품 종류에 따라 예금자보호 대상이 아닐 수 있어요. 종류별로 꼭 확인하세요.', 'MMF형 등 일부는 원금이 줄어들 수 있어요.', '화면의 이자는 지금 금리가 1년 동안 이어진다고 가정한 추정이에요.'],
  },
};

const ORDER = (['deposit', 'savings', 'parking', 'cma'] as ProductKind[]).filter((k) => k === 'savings' || lumpReady(k));
const storeKey = (k: ProductKind) => `fx.guide.${k}`;
const seenHere = (k: ProductKind) => {
  try {
    return localStorage.getItem(storeKey(k)) === '1';
  } catch {
    return true; // 저장소를 못 쓰면 매번 띄우지 않는다
  }
};
const markHere = (k: ProductKind) => {
  try {
    localStorage.setItem(storeKey(k), '1');
  } catch {
    /* 무시 */
  }
};

/** 가이드 창과 여는 [?] 버튼. autoOpen이면 이 화면을 처음 볼 때 저절로 열린다. */
export function ProductGuide({ kind, autoOpen = true }: { kind: ProductKind; autoOpen?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(() => autoOpen && !seenHere(kind));
  const [shown, setShown] = useState<ProductKind>(kind);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setShown(kind);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, kind]);
  const close = () => {
    markHere(kind);
    setOpen(false);
  };
  const g = GUIDES[shown];
  return (
    <>
      <button type="button" className="pg-help" aria-label={`${GUIDES[kind].name} 가이드 보기`} onClick={() => setOpen(true)}>
        ?
      </button>
      <dialog ref={ref} className="bank-dlg pg-dlg" aria-labelledby="pgTitle" onCancel={(e) => (e.preventDefault(), close())}>
        <div className="bank-dlg-head">
          <h2 id="pgTitle">{g.name} 가이드</h2>
          <button type="button" className="bank-dlg-x" aria-label="닫기" onClick={close}>
            <Icon id="i-close" size={20} />
          </button>
        </div>
        <div className="bank-dlg-tabs" role="tablist" aria-label="상품 종류">
          {ORDER.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={shown === k} onClick={() => setShown(k)}>
              {GUIDES[k].name}
            </button>
          ))}
        </div>
        <div className="bank-dlg-body pg-body">
          <p className="pg-lead">{g.lead}</p>
          <h3>이런 상품이에요</h3>
          <ul>
            {g.what.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <h3>이럴 때 찾아봐요</h3>
          <ul>
            {g.fit.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <h3>꼭 알아두세요</h3>
          <ul>
            {g.know.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="meta">일반적인 설명이에요. 상품마다 조건이 다르니 가입 전에 상품 설명서를 꼭 확인해 주세요.</p>
        </div>
        <div className="bank-dlg-foot">
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={close}>
            확인
          </button>
        </div>
      </dialog>
    </>
  );
}
