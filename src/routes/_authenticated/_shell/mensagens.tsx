import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageTitle } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/_shell/mensagens")({
  
  head: () => ({ meta: [{ title: "Mensagens — The Secret Bookshelf" }] }),
  component: () => (
    <div>
      <PageTitle title="Mensagens" />
      <EmptyState title="Em construção">Esta área ainda está sendo preparada.</EmptyState>
    </div>
  ),
});
