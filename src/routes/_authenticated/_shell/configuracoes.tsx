import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageTitle } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/_shell/configuracoes")({
  
  head: () => ({ meta: [{ title: "Configurações — The Secret Bookshelf" }] }),
  component: () => (
    <div>
      <PageTitle title="Configurações" />
      <EmptyState title="Em construção">Esta área ainda está sendo preparada.</EmptyState>
    </div>
  ),
});
