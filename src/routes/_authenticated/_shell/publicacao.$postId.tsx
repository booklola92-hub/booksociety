import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageTitle } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/_shell/publicacao/$postId")({
  
  head: () => ({ meta: [{ title: "Publicação — The Secret Bookshelf" }] }),
  component: () => (
    <div>
      <PageTitle title="Publicação" />
      <EmptyState title="Em construção">Esta área ainda está sendo preparada.</EmptyState>
    </div>
  ),
});
