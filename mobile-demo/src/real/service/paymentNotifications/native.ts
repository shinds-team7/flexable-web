/**
 * 시연판 신한카드 결제 알림 수집기. 실제 앱은 Android 알림 접근(네이티브 모듈)으로 신한 SOL페이 알림을 모으지만,
 * 시연 웹은 같은 인터페이스를 메모리에서 흉내 낸다. 모은 알림은 실제 앱과 같은 parse·process 코드로 지출이 된다.
 */
export type PaymentNotice = {
  id: string;
  title: string;
  body: string;
  postedAt: number;
  prepared: string;
};
export type CollectionStatus = {
  enabled: boolean;
  allowed: boolean;
  connected: boolean;
  pending: number;
  dropped: number;
};
export type PaymentNative = {
  addListener(event: "onChange", listener: () => void): { remove(): void };
  status(owner: string): Promise<CollectionStatus>;
  configure(owner: string, enabled: boolean): Promise<void>;
  openSettings(): Promise<void>;
  pending(owner: string): Promise<PaymentNotice[]>;
  prepare(owner: string, id: string, body: string): Promise<string>;
  acknowledge(owner: string, id: string): Promise<void>;
  clear(): Promise<void>;
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let enabled = false;
let allowed = false;
let notices: PaymentNotice[] = [];
let seq = 0;

const MERCHANTS: [string, number][] = [
  ["스타벅스 강남R점", 6300],
  ["GS25 역삼점", 4800],
  ["올리브영 강남점", 18900],
  ["버거킹 역삼역점", 9900],
  ["교보문고 광화문점", 16200],
];
/** 신한 SOL페이 국내 승인 알림 모양의 예시(실제 parse.ts가 읽는 형식) */
function approval(at: number): PaymentNotice {
  const [merchant, amount] = MERCHANTS[seq % MERCHANTS.length];
  const t = new Date(at - 2 * 60000 + 9 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    id: `demo-${++seq}`,
    title: "신한카드 승인",
    body: [
      "신한카드(1234)승인",
      "김*플 님",
      `${amount.toLocaleString("ko-KR")}원 일시불`,
      `${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`,
      merchant,
      "누적 1,284,300원",
    ].join("\n"),
    postedAt: at,
    prepared: "",
  };
}
function foreign(at: number): PaymentNotice {
  return {
    id: `demo-${++seq}`,
    title: "신한카드 해외승인",
    body: "신한카드(1234)해외승인\n김*플 님\nUSD 12.99\nNETFLIX.COM",
    postedAt: at,
    prepared: "",
  };
}

export const paymentNative: PaymentNative | null = {
  addListener(_event, listener) {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
  async status() {
    return { enabled, allowed, connected: enabled && allowed, pending: notices.length, dropped: 0 };
  },
  async configure(_owner, on) {
    enabled = on;
    if (!on) notices = [];
    // 켜면 그동안 받은 것처럼 알림 두 개(국내 승인 1, 해외 승인 1)를 넣어 둔다
    else if (seq === 0) notices = [approval(Date.now() - 30 * 60000), foreign(Date.now() - 20 * 60000)];
    emit();
  },
  async openSettings() {
    allowed = true;
    emit();
  },
  async pending() {
    return [...notices];
  },
  async prepare(_owner, id, body) {
    notices = notices.map((n) => (n.id === id ? { ...n, prepared: body } : n));
    return body;
  },
  async acknowledge(_owner, id) {
    notices = notices.filter((n) => n.id !== id);
  },
  async clear() {
    enabled = false;
    notices = [];
    emit();
  },
};

/** 시연: 방금 결제한 것처럼 승인 알림 하나를 받는다 */
export function demoReceivePayment() {
  notices = [...notices, approval(Date.now())];
  emit();
}
export const demoCollecting = () => enabled && allowed;

let mutations: Promise<unknown> = Promise.resolve();
/** Keep consent changes, request preparation and logout cleanup in order. */
export function mutatePaymentCollection<T>(
  task: () => Promise<T>,
  current = () => true,
): Promise<T> {
  const run = mutations
    .catch(() => {})
    .then(() => {
      if (!current()) throw new Error("계정이 변경됐어요. 다시 확인해 주세요");
      return task();
    });
  mutations = run;
  return run;
}
export async function clearPaymentNotifications() {
  await mutatePaymentCollection(async () => {
    await paymentNative?.clear();
  });
}
