import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

import { PageTitle } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type SearchField = "titulo" | "autor" | "alternativo" | "palavra";

const FIELDS: { value: SearchField; label: string }[] = [
  { value: "titulo", label: "Título" },
  { value: "autor", label: "Autor(a)" },
  { value: "alternativo", label: "Nome alternativo" },
  { value: "palavra", label: "Palavra-chave" },
];

export const Route = createFileRoute("/_authenticated/_shell/buscar-obras")({
  head: () => ({
    meta: [
      { title: "Buscar obras — Book Society" },
      {
        name: "description",
        content: "Pesquise livros, novels e mangás usando a busca do Google.",
      },
      { property: "og:title", content: "Buscar obras — Book Society" },
      {
        property: "og:description",
        content: "Pesquise obras na busca do Google a partir do Book Society.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuscarObras,
});

function BuscarObras() {
  const [q, setQ] = useState("");
  const [field, setField] = useState<SearchField>("titulo");

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;

    const prefix: Record<SearchField, string> = {
      titulo: "",
      autor: "autor ",
      alternativo: "nome alternativo ",
      palavra: "",
    };
    const query = field === "palavra" ? term : `${prefix[field]}${term}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <PageTitle
        title="Buscar obras"
        subtitle="Digite o que procura e pesquise no Google. Os resultados serão abertos em outra aba."
      />

      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5"
        onSubmit={submit}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={200}
              placeholder="Ex.: Solo Leveling, Machado de Assis, dragões…"
              className="h-11 rounded-full pl-11"
              aria-label="O que você procura"
            />
          </div>
          <Button type="submit" className="h-11 rounded-full px-6" disabled={!q.trim()}>
            <Search className="h-4 w-4" /> Pesquisar no Google
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Buscar por:</span>
          <ToggleGroup
            type="single"
            value={field}
            onValueChange={(v) => v && setField(v as SearchField)}
            className="flex-wrap justify-start"
          >
            {FIELDS.map((f) => (
              <ToggleGroupItem
                key={f.value}
                value={f.value}
                className="rounded-full px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <p className="text-xs text-muted-foreground">
          A pesquisa é feita pelo Google; o Book Society não coleta nem exibe os resultados nesta página.
        </p>
      </form>
    </div>
  );
}
