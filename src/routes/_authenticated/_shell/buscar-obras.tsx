import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PageTitle } from "@/components/empty-state";

declare global {
  interface Window {
    __gcse?: {
      parsetags?: string;
      initializationCallback?: () => void;
    };
    google?: {
      search?: {
        cse?: {
          element?: {
            render: (config: { div: string; tag: "search" }) => void;
          };
        };
      };
    };
  }
}

const SEARCH_ELEMENT_ID = "book-society-google-search";
const GOOGLE_SEARCH_ENGINE_ID = "418f88fdcd5194abc";

export const Route = createFileRoute("/_authenticated/_shell/buscar-obras")({
  head: () => ({
    meta: [
      { title: "Buscar obras — Book Society" },
      {
        name: "description",
        content: "Pesquise livros, novels e mangás e veja os resultados dentro do Book Society.",
      },
      { property: "og:title", content: "Buscar obras — Book Society" },
      {
        property: "og:description",
        content: "Pesquise obras diretamente na página do Book Society.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuscarObras,
});

function BuscarObras() {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const renderSearch = () => {
      const render = window.google?.search?.cse?.element?.render;
      if (render) {
        render({ div: SEARCH_ELEMENT_ID, tag: "search" });
      }
    };

    window.__gcse = {
      ...(window.__gcse ?? {}),
      parsetags: "explicit",
      initializationCallback: renderSearch,
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-book-society-cse="true"]',
    );

    if (existingScript) {
      if (window.google?.search?.cse?.element?.render) {
        renderSearch();
      } else {
        existingScript.addEventListener("load", renderSearch, { once: true });
        existingScript.addEventListener("error", () => setLoadError(true), { once: true });
      }
    } else {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://cse.google.com/cse.js?cx=${GOOGLE_SEARCH_ENGINE_ID}`;
      script.dataset.bookSocietyCse = "true";
      script.addEventListener("error", () => setLoadError(true), { once: true });
      document.head.appendChild(script);
    }

    return () => {
      const container = document.getElementById(SEARCH_ELEMENT_ID);
      if (container) container.innerHTML = "";
    };
  }, []);

  return (
    <div>
      <PageTitle
        title="Buscar obras"
        subtitle="Pesquise livros, novels e mangás e veja os resultados aqui mesmo no Book Society."
      />

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div id={SEARCH_ELEMENT_ID} className="min-h-24" />
        {loadError && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            Não foi possível carregar a busca do Google. Tente atualizar a página.
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Busca fornecida pelo Google. Os resultados podem conter links para os sites de origem.
        </p>
      </section>
    </div>
  );
}
