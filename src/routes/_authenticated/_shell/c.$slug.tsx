import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageTitle } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/_shell/c/$slug")({
  
  head: () => ({ meta: [{ title: "Comunidade — The Secret Bookshelf" }] }),
  component: () => (
    <div>
      <PageTitle title="Comunidade" />
      <EmptyState title="Em construção">Esta área ainda está sendo preparada.</EmptyState>
    </div>
  ),
});
