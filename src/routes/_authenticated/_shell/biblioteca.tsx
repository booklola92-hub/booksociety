import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageTitle } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/_shell/biblioteca")({
  
  head: () => ({ meta: [{ title: "Biblioteca — The Secret Bookshelf" }] }),
  component: () => (
    <div>
      <PageTitle title="Biblioteca" />
      <EmptyState title="Em construção">Esta área ainda está sendo preparada.</EmptyState>
    </div>
  ),
});
