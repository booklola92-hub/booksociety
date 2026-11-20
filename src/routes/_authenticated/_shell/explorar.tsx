import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageTitle } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/_shell/explorar")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s["q"] === "string" ? { q: s["q"] } : {}),
  head: () => ({ meta: [{ title: "Explorar — The Secret Bookshelf" }] }),
  component: () => (
    <div>
      <PageTitle title="Explorar" />
      <EmptyState title="Em construção">Esta área ainda está sendo preparada.</EmptyState>
    </div>
  ),
});
