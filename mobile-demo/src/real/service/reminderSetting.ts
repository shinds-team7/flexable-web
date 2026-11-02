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
export const useSeedReminderSetting = deviceSetting("flexable.service.seedReminder");
// Reminder to record when nothing was entered for 24 hours.
export const useEntryReminderSetting = deviceSetting("flexable.service.entryReminder");
