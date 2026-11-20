import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageTitle } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/_shell/notificacoes")({
  
  head: () => ({ meta: [{ title: "Notificações — The Secret Bookshelf" }] }),
  component: () => (
    <div>
      <PageTitle title="Notificações" />
      <EmptyState title="Em construção">Esta área ainda está sendo preparada.</EmptyState>
    </div>
  ),
});
