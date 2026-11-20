import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookHeart, Library, Trophy, Users } from "lucide-react";
import { useEffect } from "react";

import booksTeacup from "@/assets/books-teacup.png.asset.json";
import openBook from "@/assets/open-book-hearts.png.asset.json";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Book Society — a rede social de quem ama livros" },
      {
        name: "description",
        content: "Compartilhe leituras, monte sua biblioteca, crie metas e entre em comunidades de leitores.",
      },
      { property: "og:title", content: "Book Society — a rede social de quem ama livros" },
      {
        property: "og:description",
        content: "Compartilhe leituras, monte sua biblioteca, crie metas e entre em comunidades de leitores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: BookHeart, title: "Compartilhe leituras", text: "Publique fotos, enquetes e o livro do momento." },
  { icon: Library, title: "Sua biblioteca", text: "Organize o que está lendo, o que leu e o que quer ler." },
  { icon: Trophy, title: "Metas com marcos", text: "Acompanhe 25%, 50%, 75% e comemore cada conquista." },
  { icon: Users, title: "Comunidades", text: "Entre em clubes de leitura e converse com quem ama os mesmos livros." },
];

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inicio", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-display text-2xl font-semibold text-primary">Book Society</span>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button asChild className="rounded-full px-5">
            <Link to="/auth" search={{ modo: "cadastro" }}>
              Criar conta
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-10 py-10 md:grid-cols-2 md:py-16">
          <div>
            <p className="text-sm font-medium tracking-widest text-primary/80 uppercase">Leia • Conecte • Compartilhe</p>
            <h1 className="font-display mt-3 text-5xl leading-[1.05] font-semibold text-primary md:text-6xl">
              Um cantinho secreto para quem vive entre páginas.
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted-foreground">
              Encontre leitoras e leitores como você, conte o que está lendo e acompanhe suas metas de leitura.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 rounded-full px-8 text-base shadow-soft">
                <Link to="/auth" search={{ modo: "cadastro" }}>
                  Criar minha conta
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-8 text-base">
                <Link to="/auth">Já tenho conta</Link>
              </Button>
            </div>
          </div>
          <img src={booksTeacup.url} alt="Pilha de livros com uma xícara de chá" className="w-full mix-blend-multiply" />
        </section>

        <section className="grid gap-4 pb-12 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <f.icon className="h-7 w-7 text-primary" />
              <h2 className="font-display mt-3 text-2xl font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="mb-16 grid items-center gap-6 rounded-3xl bg-secondary/70 p-8 md:grid-cols-[1fr_auto]">
          <div>
            <p className="font-display text-3xl text-foreground italic">
              “Grandes histórias começam com pessoas que compartilham.”
            </p>
            <Button asChild className="mt-5 rounded-full px-6">
              <Link to="/auth" search={{ modo: "cadastro" }}>
                Faça parte
              </Link>
            </Button>
          </div>
          <img src={openBook.url} alt="" className="h-40 w-auto mix-blend-multiply" />
        </section>
      </main>
    </div>
  );
}
