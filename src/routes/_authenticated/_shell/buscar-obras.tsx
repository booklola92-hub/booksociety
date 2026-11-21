import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PageTitle } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GOOGLE_CSE_ID = "418f88fdcd5194abc";
const GOOGLE_SCRIPT_ID = "book-society-google-cse";

export const Route = createFileRoute("/_authenticated/_shell/buscar-obras")({
  head: () => ({
    meta: [
      { title: "Buscar obras — Book Society" },
      {
        name: "description",
        content: "Pesquise livros, novels e mangás no Google sem sair do Book Society.",
      },
    ],
  }),
  component: BuscarObras,
});

function BuscarObras() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const pendingQuery = useRef("");
  const rendered = useRef(false);

  const renderGoogleResults = () => {
    const google = (window as any).google;
    const elementApi = google?.search?.cse?.element;
    const container = document.getElementById("book-society-google-results");
    if (!elementApi || !container || rendered.current) return;

    elementApi.render({
      div: "book-society-google-results",
      tag: "searchresults-only",
      gname: "bookSocietyResults",
    });
    rendered.current = true;
    setGoogleReady(true);

    if (pendingQuery.current) {
      window.setTimeout(() => {
        elementApi.getElement("bookSocietyResults")?.execute(pendingQuery.current);
      }, 0);
    }
  };

  useEffect(() => {
    const w = window as any;
    w.__gcse = {
      ...(w.__gcse || {}),
      parsetags: "explicit",
      callback: renderGoogleResults,
    };

    if (w.google?.search?.cse?.element) {
      renderGoogleResults();
      return;
    }

    if (!document.getElementById(GOOGLE_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = GOOGLE_SCRIPT_ID;
      script.async = true;
      script.src = `https://cse.google.com/cse.js?cx=${GOOGLE_CSE_ID}`;
      script.onerror = () => console.error("Não foi possível carregar a pesquisa do Google.");
      document.head.appendChild(script);
    }
  }, []);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = query.trim();
    if (!clean) return;

    pendingQuery.current = clean;
    setSearched(clean);

    const element = (window as any).google?.search?.cse?.element?.getElement("bookSocietyResults");
    if (element) {
      element.execute(clean);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Buscar obras"
        subtitle="Pesquise no Google e veja os resultados aqui mesmo, sem sair do Book Society."
      />

      <form
        onSubmit={submitSearch}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:p-5"
      >
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={200}
            placeholder="Ex.: Solo Leveling, livros de fantasia, manhwa BL…"
            aria-label="Buscar obras no Google"
            className="h-11 rounded-full pl-11"
          />
        </div>
        <Button type="submit" disabled={!query.trim()} className="h-11 rounded-full px-6">
          <Search className="h-4 w-4" /> Buscar
        </Button>
      </form>

      {searched ? (
        <p className="text-sm text-muted-foreground">
          Resultados do Google para: <strong className="text-foreground">{searched}</strong>
        </p>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Digite o nome de um livro, novel, mangá ou autor para começar a pesquisa.
        </div>
      )}

      <section aria-label="Resultados da pesquisa Google" className="min-h-24 rounded-2xl border border-border bg-card p-3 sm:p-5">
        {!googleReady && searched ? (
          <p className="text-sm text-muted-foreground">Carregando a pesquisa do Google…</p>
        ) : null}
        <div id="book-society-google-results" />
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Pesquisa fornecida pelo Google Programmable Search.
      </p>
    </div>
  );
}
