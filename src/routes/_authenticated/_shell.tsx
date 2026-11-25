import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SidebarContent } from "@/components/app-sidebar";
import { useRealtimeInbox } from "@/components/realtime";
import { TopBar } from "@/components/top-bar";

export const Route = createFileRoute("/_authenticated/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const { userId } = Route.useRouteContext();
  useRealtimeInbox(userId);
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="mx-auto grid max-w-[1920px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="sticky top-[86px] hidden h-[calc(100vh-86px)] border-r border-rose-200/70 bg-[#fff7f3] lg:block">
          <SidebarContent />
        </aside>
        <main className="min-w-0 px-3 py-4 sm:px-5 lg:px-6 xl:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
