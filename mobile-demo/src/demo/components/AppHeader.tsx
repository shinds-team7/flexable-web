import { router, usePathname } from "expo-router";
import { demoRoutes } from "@/demo/routes";
import { useStore } from "@/demo/store/AppStore";
import { toKey } from "@/utils/date";
import { AppHeaderView } from "@/components/AppHeaderView";
export { Logo } from "@/components/AppHeaderView";
const TABS = [
  {
    href: demoRoutes.home,
    label: "홈",
    match: (p: string) =>
      p === demoRoutes.home || p.startsWith(demoRoutes.home2),
  },
  {
    href: demoRoutes.plan,
    label: "지출계획",
    match: (p: string) => p.startsWith(demoRoutes.plan),
  },
  {
    href: demoRoutes.analysis,
    label: "분석",
    match: (p: string) =>
      p.startsWith(demoRoutes.analysis) ||
      p.startsWith(demoRoutes.transactions),
  },
  {
    href: demoRoutes.my,
    label: "마이페이지",
    match: (p: string) => p.startsWith(demoRoutes.my),
  },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const { scheduled, today, homeStyle } = useStore();
  const homeHref =
    homeStyle === "character" ? demoRoutes.home2 : demoRoutes.home;
  const pendingCount = scheduled.filter(
    (x) => x.status === "planned" && x.date < toKey(today),
  ).length;
  return (
    <AppHeaderView
      tabs={TABS.map((t) => ({
        ...t,
        href: t.href === demoRoutes.home ? homeHref : t.href,
      }))}
      pathname={pathname}
      homeHref={homeHref}
      pendingCount={pendingCount}
      onNotifications={() => router.push(demoRoutes.notifications)}
    />
  );
}
