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
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarContent />
      </aside>
      <div className="min-w-0">
        <TopBar />
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
