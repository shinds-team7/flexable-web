import { useLocalSearchParams } from "expo-router";
import { ScheduledExpenseDetailScreen } from "@/real/service/ScheduledExpenseDetailScreen";
export default function Route() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  return <ScheduledExpenseDetailScreen id={id} date={date} />;
}
