import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Heart } from "lucide-react";

import openBook from "@/assets/open-book-hearts.png.asset.json";
import { Composer } from "@/components/composer";
import { Feed } from "@/components/feed";
import { RightRail } from "@/components/right-rail";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/social";

export const Route = createFileRoute("/_authenticated/_shell/inicio")({
  head: () => ({ meta: [{ title: "Início — Book Society" }] }),
  component: Inicio,
});

function Inicio() {
  const { data: me } = useMe();
  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <section className="relative isolate flex min-h-[270px] overflow-hidden rounded-[1.4rem] border border-rose-200/80 bg-gradient-to-r from-[#f4cbb9] via-[#f8e1d7] to-[#71432f] shadow-soft sm:min-h-[320px]">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_25%,rgba(255,255,255,.75),transparent_45%)]" />
          <img src={openBook.url} alt="Livros e leitura" className="absolute bottom-0 left-0 h-[90%] w-[52%] object-contain object-bottom sm:w-[55%]" />
          <div className="ml-auto flex w-[62%] flex-col justify-center px-4 py-7 text-right text-white sm:w-[58%] sm:px-8">
            <h1 className="font-display text-3xl leading-tight italic sm:text-4xl lg:text-5xl">
              Bem-vinda ao <span className="text-rose-300">♡</span><br />Book Society!
            </h1>
            <p className="ml-auto mt-4 max-w-sm text-sm leading-relaxed text-white/95 sm:text-base">
              Descubra, leia, compartilhe e faça parte da nossa comunidade literária!
            </p>
            <Button asChild className="mt-5 self-end rounded-full bg-rose-500 px-5 text-white hover:bg-rose-600">
              <a href="/comunidade">Explorar a comunidade <ArrowRight className="ml-1 h-4 w-4" /></a>
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-rose-200/80 bg-[#fffaf7] p-3 shadow-soft">
          <div className="flex items-center gap-3 px-1">
            <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 sm:flex"><Heart className="h-5 w-5 fill-current" /></div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg text-rose-900/70">Compartilhe o que está lendo...</p>
              <p className="text-xs text-muted-foreground">{me?.display_name || me?.username || "Leitora"}, conte sua próxima história.</p>
            </div>
          </div>
          <div className="mt-3">
            <Composer className="border-rose-100 bg-white/70 p-3 shadow-none" />
          </div>
        </section>

        <Feed filter={{ kind: "all" }} empty={{ title: "Sua comunidade começa com uma história", body: "Compartilhe uma leitura ou uma recomendação para iniciar a conversa." }} />
      </div>
      <div className="hidden 2xl:block"><RightRail /></div>
      <div className="2xl:hidden"><RightRail /></div>
    </div>
  );
}
