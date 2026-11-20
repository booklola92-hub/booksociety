import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageTitle } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/_shell/resenhas")({
  
  head: () => ({ meta: [{ title: "Resenhas — The Secret Bookshelf" }] }),
  component: () => (
    <div>
      <PageTitle title="Resenhas" />
      <EmptyState title="Em construção">Esta área ainda está sendo preparada.</EmptyState>
    </div>
  ),
});
