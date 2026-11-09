import type Ionicons from "@expo/vector-icons/Ionicons";
import type { Href } from "expo-router";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { AppState } from "react-native";
import { colors } from "@/real/theme";
import { api, sessionGeneration } from "./api/client";
import { getLedger } from "./coinApi";
import { ledgerDetail, ledgerTitle } from "./coinLedger";
import {
  hasUnread,
  isUnread,
  type BudgetNote,
  type ReminderTime,
  type ReadReceipt,
} from "./inboxRecords";
import {
  readInbox,
  recordBudget,
  setInboxOwner,
  useInboxVersion,
} from "./inboxStore";
import { ENTRY_REMINDER, SEED_REMINDER } from "./reminderTexts";
import { useSession } from "./Session";
import type { CoinLedgerEntry, Today, Transaction } from "./types";
import { money, parseTime, seoulDate } from "./ui";
import { useWallet } from "./wallet";

export type InboxItem = {
  key: string;
  at: number;
  /** "coin"은 Ionicons에 없는 코인(🪙) 그림 */
  icon: ComponentProps<typeof Ionicons>["name"] | "coin";
  color: string;
  title: string;
  detail: string;
  href: Href;
};
// 알림함은 최근 30일 것만 보여 준다.
const DAYS = 30;
const DAY = 86400000;

function seoulDay(offset: number) {
  return new Date(Date.now() + 9 * 3600000 + offset * DAY)
    .toISOString()
    .slice(0, 10);
}
const time = (iso: string) => parseTime(iso).getTime();

function coinItem(e: CoinLedgerEntry): InboxItem {
  return {
    key: `coin:${e.id}`,
    at: time(e.createdAt),
    // 예산 지킴 보너스·코인 모으기는 코인 그림, 나머지 받은 코인(가입 선물 등)은 선물 상자
    icon:
      e.amount < 0
        ? "bag-handle-outline"
        : e.reason === "BUDGET_BONUS" || e.reason === "PASSIVE"
          ? "coin"
          : "gift-outline",
    color: colors.brand,
    title: ledgerTitle(e),
    detail: ledgerDetail(e),
    href: "/coins/history",
  };
}
function fixedItem(t: Transaction): InboxItem {
  return {
    key: `fixed:${t.id}`,
    at: time(t.createdAt),
    icon: "repeat-outline",
    color: colors.textSub,
    title: "고정지출을 기록했어요",
    detail: `${t.title} ${money(t.amount)}원`,
    href: `/transactions/${t.id}`,
  };
}
function budgetItem(n: BudgetNote): InboxItem {
  return {
    key: `budget:${n.date}:${n.over}`,
    at: n.at,
    icon: "alert-circle-outline",
    color: colors.warn,
    title: n.over ? "오늘 예산을 넘었어요" : "오늘 예산을 다 썼어요",
    detail: "입력한 잔액·기록 기준 추정이에요",
    href: "/home",
  };
}
function reminderItem(r: ReminderTime): InboxItem {
  const seed = r.kind === "seed";
  const text = seed ? SEED_REMINDER : ENTRY_REMINDER;
  return {
    key: `${r.kind}:${r.at}`,
    at: r.at,
    icon: seed ? "wallet-outline" : "create-outline",
    color: colors.brand,
    title: text.title,
    detail: text.body,
    href: seed ? "/home" : "/transactions/new",
  };
}

type Server = {
  id: number;
  /** 읽어 온 시각. 이보다 30일 앞선 알림은 보여 주지 않는다 */
  at: number;
  ledger: CoinLedgerEntry[];
  fixed: Transaction[];
};
type Local = {
  id: number;
  sent: ReminderTime[];
  budget: BudgetNote[];
  seen: number;
  read: ReadReceipt[];
  /** 밀어서 지운 알림. 목록과 안 읽음 표시에서 뺀다 */
  deleted: ReadReceipt[];
};

/**
 * 알림함 항목(최근 30일, 최신순)과 안 읽은 알림이 있는지.
 * 코인 내역 첫 쪽·최근 30일 거래·오늘 예산은 서버에서, 보낸 기기 알림·예산 상태·항목별 읽음은 기기에서 읽는다.
 */
export function useInbox() {
  const { user, revision } = useSession();
  const id = user?.onboarded ? user.id : undefined;
  const version = useInboxVersion();
  // 홈 첫 방문 선물·모으기·구매로 코인이 바뀌면 화면 데이터를 다시 읽지 않으므로, 잔액이 바뀔 때 코인 내역을 다시 읽는다.
  const balance = useWallet()?.balance;
  const [resumed, resume] = useState(0);
  const [attempt, retry] = useState(0);
  const [server, setServer] = useState<Server>();
  const [local, setLocal] = useState<Local>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") resume((x) => x + 1);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const generation = sessionGeneration();
    const current = () => alive && generation === sessionGeneration();
    Promise.all([
      getLedger(),
      api<{ items: Transaction[] }>(
        `/transactions?from=${seoulDay(-DAYS)}&to=${seoulDay(0)}`,
      ),
      api<Today>("/budget/today"),
    ])
      .then(async ([ledger, tx, today]) => {
        if (!current()) return;
        setError(undefined);
        setServer({
          id,
          at: Date.now(),
          ledger: ledger.items,
          fixed: tx.items.filter((t) => t.fromFixed),
        });
        await recordBudget(id, seoulDate(), today.todayAvailable);
      })
      .catch((e) => {
        if (current()) setError(e);
      });
    return () => {
      alive = false;
    };
  }, [id, revision, resumed, attempt, balance]);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    readInbox(id)
      .then((value) => {
        if (alive) setLocal({ id, ...value });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, version, resumed]);

  const items = useMemo(() => {
    if (!id || server?.id !== id || local?.id !== id) return undefined;
    const since = server.at - DAYS * DAY;
    const gone = new Set(local.deleted.map((d) => d.key));
    return [
      ...server.ledger.map(coinItem),
      ...server.fixed.map(fixedItem),
      ...local.budget.map(budgetItem),
      ...local.sent.map(reminderItem),
    ]
      .filter((i) => !Number.isNaN(i.at) && i.at >= since && !gone.has(i.key))
      .sort((a, b) => b.at - a.at);
  }, [id, server, local]);
  const readState = local?.id === id ? local : undefined;
  return {
    id,
    items,
    isUnread: (item: InboxItem) =>
      !!readState && isUnread(item, readState.seen, readState.read),
    unread:
      !!items &&
      !!readState &&
      hasUnread(items, readState.seen, readState.read),
    error,
    loading: !items && !error,
    retry: () => retry((x) => x + 1),
  };
}

/** 알림을 예약하는 곳이 로그인한 사용자의 기록에 남기도록 사용자를 알려 준다 */
export function useInboxOwner() {
  const { user } = useSession();
  const id = user?.id ?? null;
  useEffect(() => {
    setInboxOwner(id);
  }, [id]);
}
