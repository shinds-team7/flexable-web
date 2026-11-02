import { Stack } from "expo-router";
import { useEntryReminder, useEntryReminderTap } from "@/real/service/entryReminder";
import { useInboxOwner } from "@/real/service/inbox";
import { useSeedReminderTap } from "@/real/service/seedReminder";
import { Guard } from "@/real/service/ui";
import { useAutomaticPaymentImport } from "@/real/service/paymentNotifications/usePaymentImport";
export default function Layout() {
  useInboxOwner();
  useAutomaticPaymentImport();
  useSeedReminderTap();
  useEntryReminder();
  useEntryReminderTap();
  return (
    <Guard>
      <Stack screenOptions={{ headerShown: false }} />
    </Guard>
  );
}
