import { createFileRoute } from "@tanstack/react-router";

import { Composer } from "@/components/composer";
import { Feed } from "@/components/feed";
import { RightRail } from "@/components/right-rail";
import { useMe } from "@/lib/social";

export const Route = createFileRoute("/_authenticated/_shell/inicio")({
  head: () => ({ meta: [{ title: "Início — The Secret Bookshelf" }] }),
  component: Inicio,
});

function Inicio() {
  const { data: me } = useMe();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <h1 className="font-display text-3xl font-semibold text-primary">
          Olá, {me?.display_name || me?.username || "leitora"}!
        </h1>
        <Composer />
        <Feed filter={{ kind: "all" }} empty={{ title: "Nenhuma publicação ainda", body: "Seja a primeira a publicar!" }} />
      </div>
      <RightRail />
    </div>
  );
}
