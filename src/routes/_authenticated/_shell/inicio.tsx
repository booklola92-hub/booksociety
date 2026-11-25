import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Heart, Sparkles } from "lucide-react";

import booksTeacup from "@/assets/books-teacup.png.asset.json";
import { Composer } from "@/components/composer";
import { Feed } from "@/components/feed";
import { RightRail } from "@/components/right-rail";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_shell/inicio")({
  head: () => ({ meta: [{ title: "Início — Book Society" }] }),
  component: Inicio,
});

function Inicio() {
  return (
    <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <section aria-label="Boas-vindas ao Book Society" className="relative isolate flex min-h-[250px] overflow-hidden rounded-[24px] border border-[#e9c9b8] bg-[#6a3829] shadow-[0_12px_35px_rgba(112,65,45,0.10)] sm:min-h-[290px] lg:min-h-[330px]">
          <img src={booksTeacup.url} alt="Livros e uma xícara em um cantinho aconchegante de leitura" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#3c2018]/5 via-[#3c2018]/35 to-[#3c2018]/85" />
          <div className="ml-auto flex w-full max-w-[470px] flex-col items-start justify-center px-6 py-8 text-white sm:px-9 lg:px-10">
            <h1 className="font-display text-3xl leading-[1.12] italic drop-shadow sm:text-4xl lg:text-[2.65rem]">Bem-vinda ao <span className="text-[#ff9fb0]">♡</span><br/>Book Society!</h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/95 drop-shadow sm:text-base">Descubra, leia, compartilhe e faça parte da nossa comunidade literária!</p>
            <Button asChild className="mt-6 rounded-full bg-[#dc5d78] px-5 text-white shadow-md hover:bg-[#c94e6a]">
              <a href="/comunidade">Explorar a comunidade <ArrowRight className="ml-2 h-4 w-4" /></a>
            </Button>
          </div>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-white"/><span className="h-2.5 w-2.5 rounded-full border border-white bg-white/30"/><span className="h-2.5 w-2.5 rounded-full border border-white bg-white/30"/></div>
        </section>

        <section className="rounded-[20px] border border-[#f0d8d0] bg-[#fffaf8] p-3 shadow-[0_5px_18px_rgba(112,65,45,0.05)] sm:p-4">
          <div className="mb-2 flex items-center gap-2 px-1 text-[#a45b60]"><Heart className="h-4 w-4 fill-current"/><span className="font-display text-base">Compartilhe um pedacinho da sua leitura</span></div>
          <Composer className="rounded-xl border-[#efd9d1] bg-white p-3 shadow-none" />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1"><h2 className="font-display text-2xl text-[#684438]">Novidades da comunidade</h2><span className="hidden items-center gap-1.5 text-xs font-medium text-[#ad7868] sm:inline-flex"><BookOpen className="h-4 w-4"/> Feed de leitura</span></div>
          <Feed filter={{ kind: "all" }} empty={{ title: "Sua comunidade começa com uma história", body: "Compartilhe uma leitura ou uma recomendação para iniciar a conversa." }} />
        </section>
      </div>

      <aside className="min-w-0 2xl:sticky 2xl:top-[108px]">
        <RightRail />
      </aside>
    </div>
  );
}
