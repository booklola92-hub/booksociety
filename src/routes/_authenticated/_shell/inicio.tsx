import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Heart, Sparkles } from "lucide-react";

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
    <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-6">
        <section
          aria-label="Boas-vindas ao Book Society"
          className="relative isolate flex min-h-[230px] overflow-hidden rounded-[26px] border border-[#e9c9b8] bg-[#e9c4ad] shadow-[0_12px_35px_rgba(112,65,45,0.10)] sm:min-h-[280px] lg:min-h-[310px]"
        >
          <img
            src="/book-society-banner.jpg"
            alt="Caneca Book Society sobre livros, flores e uma manta aconchegante"
            className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#3c2018]/55 via-[#4b2b20]/15 to-transparent" />
          <div className="flex w-full max-w-[610px] flex-col items-start justify-center px-6 py-9 text-white sm:px-10 lg:px-12">
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" /> UM CANTINHO PARA QUEM AMA LER
            </span>
            <h1 className="font-display text-3xl leading-[1.08] font-semibold drop-shadow sm:text-4xl lg:text-5xl">
              Bem-vinda ao<br />Book Society <span className="text-[#ffe0d0]">♡</span>
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/95 drop-shadow sm:text-base">
              Descubra novas histórias, compartilhe suas leituras e encontre pessoas que amam livros tanto quanto você.
            </p>
            <Button asChild className="mt-5 rounded-full bg-[#a95348] px-5 text-white shadow-md hover:bg-[#91443c]">
              <a href="/comunidade">Explorar comunidade <ArrowRight className="ml-2 h-4 w-4" /></a>
            </Button>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-[#ad7868] uppercase">Seu espaço literário</p>
            <h2 className="mt-1 font-display text-2xl text-[#684438] sm:text-3xl">O que vamos ler hoje?</h2>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-[#f8e9e1] px-3 py-2 text-xs font-medium text-[#996b5d] sm:inline-flex">
            <BookOpen className="h-4 w-4" /> Leituras & encontros
          </span>
        </div>

        <section className="rounded-[22px] border border-[#efdcd2] bg-[#fffaf7] p-4 shadow-[0_8px_25px_rgba(112,65,45,0.05)] sm:p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f6e4dc] text-[#a65f54]">
              <Heart className="h-5 w-5 fill-current" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-lg text-[#714b3f]">Compartilhe um pedacinho da sua leitura</p>
              <p className="text-xs text-[#a17e71]">{me?.display_name || me?.username || "Leitora"}, sua comunidade quer ouvir você.</p>
            </div>
          </div>
          <Composer className="rounded-xl border-[#f0dfd7] bg-white p-3 shadow-none" />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display text-2xl text-[#684438]">Novidades da comunidade</h2>
            <span className="text-xs font-medium text-[#ad7868]">Feed de leitura</span>
          </div>
          <Feed filter={{ kind: "all" }} empty={{ title: "Sua comunidade começa com uma história", body: "Compartilhe uma leitura ou uma recomendação para iniciar a conversa." }} />
        </section>
      </div>

      <aside className="hidden min-w-0 2xl:block">
        <div className="sticky top-[108px]">
          <RightRail />
        </div>
      </aside>
      <div className="min-w-0 2xl:hidden">
        <RightRail />
      </div>
    </div>
  );
}
