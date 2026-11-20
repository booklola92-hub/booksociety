import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageTitle } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/_shell/comunidade")({
  validateSearch: (s: Record<string, unknown>): { aba?: string } => (typeof s["aba"] === "string" ? { aba: s["aba"] } : {}),
  head: () => ({ meta: [{ title: "Comunidade — The Secret Bookshelf" }] }),
  component: () => (
    <div>
      <PageTitle title="Comunidade" />
      <EmptyState title="Em construção">Esta área ainda está sendo preparada.</EmptyState>
    </div>
  ),
});
