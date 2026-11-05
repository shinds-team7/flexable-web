import { useEffect, useState } from "react";
import { readStorage, writeStorage } from "./storage";
// Whether to schedule a device reminder. A per-device choice like the home style,
// because the reminder itself is scheduled on the device. On unless the user turned it off.
function deviceSetting(key: string) {
  let current: boolean | null = null;
  const listeners = new Set<(on: boolean) => void>();
  return function useSetting() {
    const [on, setOn] = useState(current ?? true);
    useEffect(() => {
      listeners.add(setOn);
      if (current === null)
        readStorage(key)
          .then((saved) => {
            current = saved !== "off";
            listeners.forEach((l) => l(current!));
          })
          .catch(() => {});
      return () => {
        listeners.delete(setOn);
      };
    }, []);
    const change = (next: boolean) => {
      current = next;
      listeners.forEach((l) => l(next));
      writeStorage(key, next ? "on" : "off").catch(() => {});
    };
    return [on, change] as const;
  };
}
// Payday-eve seed money reminder.
export const useSeedReminderSetting = deviceSetting(
  "flexable.service.seedReminder",
);
// Reminder to record when nothing was entered for 24 hours.
export const useEntryReminderSetting = deviceSetting(
  "flexable.service.entryReminder",
);

// Time of day for the record reminder, "HH:MM". Null means automatic: 24 hours after the last record.
let entryTime: string | null | undefined;
const timeListeners = new Set<(time: string | null) => void>();
const TIME_KEY = "flexable.service.entryReminderTime";
export const parseReminderTime = (value: string | null) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour < 24 && minute < 60 ? { hour, minute } : null;
};
export function useEntryReminderTime() {
  const [time, setTime] = useState<string | null>(entryTime ?? null);
  useEffect(() => {
    timeListeners.add(setTime);
    if (entryTime === undefined)
      readStorage(TIME_KEY)
        .then((saved) => {
          entryTime = parseReminderTime(saved) ? saved : null;
          timeListeners.forEach((l) => l(entryTime ?? null));
        })
        .catch(() => {});
    return () => {
      timeListeners.delete(setTime);
    };
  }, []);
  const change = (next: string | null) => {
    entryTime = next;
    timeListeners.forEach((l) => l(next));
    writeStorage(TIME_KEY, next).catch(() => {});
  };
  return [time, change] as const;
}
