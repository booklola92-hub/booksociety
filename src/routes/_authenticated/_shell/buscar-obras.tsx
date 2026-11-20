import { useQueries } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, ExternalLink, ImageOff, Info, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState, PageTitle } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { searchWorkSource } from "@/lib/work-search.functions";
import {
  dedupeWorks,
  getSource,
  isSourceId,
  SOURCE_IDS,
  WORK_SOURCES,
  type MergedWork,
  type SearchField,
  type SourceId,
  type SourceResponse,
} from "@/lib/work-sources";

interface SearchParams {
  q?: string;
  campo?: SearchField;
  fontes?: string;
}

const FIELDS: { value: SearchField; label: string }[] = [
  { value: "titulo", label: "Título" },
  { value: "autor", label: "Autor(a)" },
  { value: "palavra", label: "Palavra-chave" },
];

export const Route = createFileRoute("/_authenticated/_shell/buscar-obras")({
  validateSearch: (s: Record<string, unknown>): SearchParams => {
    const out: SearchParams = {};
    if (typeof s["q"] === "string" && s["q"].trim()) out.q = s["q"].slice(0, 200);
    if (s["campo"] === "titulo" || s["campo"] === "autor" || s["campo"] === "palavra") out.campo = s["campo"];
    if (typeof s["fontes"] === "string") out.fontes = s["fontes"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Buscar obras — Book Society" },
      {
        name: "description",
        content: "Pesquise livros, novels e mangás em Goodreads, Google Books, Novel Updates, KakaoPage e outras fontes, tudo em um só lugar.",
      },
      { property: "og:title", content: "Buscar obras — Book Society" },
      {
        property: "og:description",
        content: "Busca de obras em várias plataformas de leitura, com link para a página original.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuscarObras,
});

function parseSources(fontes: string | undefined): SourceId[] {
  if (fontes === undefined) return [...SOURCE_IDS];
  return fontes.split(",").filter(isSourceId);
}

function BuscarObras() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const field: SearchField = search.campo ?? "titulo";
  const selected = parseSources(search.fontes);
  const [q, setQ] = useState(search.q ?? "");
  const [draftField, setDraftField] = useState<SearchField>(field);
  const [draftSources, setDraftSources] = useState<SourceId[]>(selected);

  const submit = () => {
    const clean = q.trim();
    navigate({
      search: {
        ...(clean ? { q: clean } : {}),
        campo: draftField,
        ...(draftSources.length === SOURCE_IDS.length ? {} : { fontes: draftSources.join(",") }),
      },
    });
  };

  const toggleSource = (id: SourceId) =>
    setDraftSources((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]));

  return (
    <div>
      <PageTitle
        title="Buscar obras"
        subtitle="Pesquise em plataformas de leitura selecionadas e abra a página original de cada obra."
      />

      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
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
          <Button type="submit" className="h-11 rounded-full px-6" disabled={!q.trim() || draftSources.length === 0}>
            <Search className="h-4 w-4" /> Buscar
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Buscar por:</span>
          <ToggleGroup
            type="single"
            value={draftField}
            onValueChange={(v) => v && setDraftField(v as SearchField)}
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

        <fieldset>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <legend className="text-sm font-medium text-muted-foreground">Fontes ({draftSources.length})</legend>
            <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setDraftSources([...SOURCE_IDS])}>
              Todas
            </button>
            <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setDraftSources([])}>
              Nenhuma
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {WORK_SOURCES.map((s) => {
              const on = draftSources.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  title={s.note}
                  onClick={() => toggleSource(s.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </form>

      <div className="mt-6">
        {search.q ? (
          <Results
            key={`${search.q}|${field}|${selected.join(",")}`}
            q={search.q}
            field={field}
            sources={selected}
          />
        ) : (
          <Intro />
        )}
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="space-y-4">
      <EmptyState title="O que você quer ler hoje?">
        Digite um título, autor(a) ou palavra-chave. Os resultados vêm apenas das fontes listadas acima.
      </EmptyState>
      <SourceNotes />
    </div>
  );
}

function SourceNotes() {
  return (
    <details className="rounded-2xl border border-border bg-card p-4 text-sm">
      <summary className="cursor-pointer font-medium text-foreground">Como cada fonte é pesquisada</summary>
      <ul className="mt-3 space-y-1.5 text-muted-foreground">
        {WORK_SOURCES.map((s) => (
          <li key={s.id}>
            <span className="font-medium text-foreground">{s.label}:</span> {s.note}
          </li>
        ))}
        <li className="pt-2">
          Não guardamos nem exibimos o conteúdo das obras: mostramos só título, autor, capa e resumo quando a fonte
          os fornece, com link para a página original.
        </li>
      </ul>
    </details>
  );
}

/* ---------------- Results ---------------- */

interface SourceEntry {
  pages: (SourceResponse | undefined)[];
  loading: boolean;
  error: boolean;
}

function Results({ q, field, sources }: { q: string; field: SearchField; sources: SourceId[] }) {
  const run = useServerFn(searchWorkSource);
  // Extra pages per source; a source only gets another page when its last one said there is more.
  const [extra, setExtra] = useState<Partial<Record<SourceId, number>>>({});

  const plan = useMemo(
    () => sources.flatMap((s) => Array.from({ length: 1 + (extra[s] ?? 0) }, (_, p) => ({ s, p }))),
    [sources, extra],
  );

  const queries = useQueries({
    queries: plan.map(({ s, p }) => ({
      queryKey: ["work-search", s, q, field, p],
      staleTime: 10 * 60 * 1000,
      retry: false,
      queryFn: (): Promise<SourceResponse> => run({ data: { source: s, q, field, page: p } }),
    })),
  });

  const bySource = new Map<SourceId, SourceEntry>();
  plan.forEach(({ s, p }, i) => {
    const entry = bySource.get(s) ?? { pages: [], loading: false, error: false };
    const query = queries[i];
    if (query) {
      entry.pages[p] = query.data;
      if (query.isLoading) entry.loading = true;
      if (query.isError) entry.error = true;
    }
    bySource.set(s, entry);
  });

  const lastPage = (s: SourceId) => bySource.get(s)?.pages[extra[s] ?? 0];
  const moreSources = sources.filter((s) => {
    const last = lastPage(s);
    return last?.status === "ok" && last.hasMore && (extra[s] ?? 0) < 9;
  });

  const allResults = sources.flatMap((s) => (bySource.get(s)?.pages ?? []).flatMap((r) => (r?.status === "ok" ? r.results : [])));
  // Google Books first so its covers and authors win when the same work appears elsewhere.
  allResults.sort((a, b) => Number(b.platform === "google_books") - Number(a.platform === "google_books"));
  const works = dedupeWorks(allResults);

  const anyLoading = [...bySource.values()].some((e) => e.loading);
  const canLoadMore = moreSources.length > 0;

  return (
    <div className="space-y-5">
      <SourceStatusBar sources={sources} bySource={bySource} />

      {works.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {works.length} {works.length === 1 ? "obra encontrada" : "obras encontradas"}
            {anyLoading ? " — ainda buscando em outras fontes…" : ""}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {works.map((w) => (
              <WorkCard key={w.key} work={w} />
            ))}
          </div>
        </>
      ) : anyLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Carregando resultados">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
              <Skeleton className="h-36 w-24 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Nenhuma obra encontrada">
          Tente outro termo, troque “Buscar por” ou inclua mais fontes.
        </EmptyState>
      )}

      {canLoadMore ? (
        <div className="flex justify-center">
          <Button variant="outline" className="rounded-full px-6" disabled={anyLoading} onClick={() =>
              setExtra((cur) => {
                const next = { ...cur };
                for (const s of moreSources) next[s] = (cur[s] ?? 0) + 1;
                return next;
              })
            }>
            {anyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Mais resultados
          </Button>
        </div>
      ) : null}

      <SourceNotes />
    </div>
  );
}

function SourceStatusBar({
  sources,
  bySource,
}: {
  sources: SourceId[];
  bySource: Map<SourceId, SourceEntry>;
}) {
  const notes: { id: SourceId; text: string; bad: boolean }[] = [];
  const chips = sources.map((id) => {
    const entry = bySource.get(id);
    const first = entry?.pages[0];
    const count = (entry?.pages ?? []).reduce((n, r) => n + (r?.status === "ok" ? r.results.length : 0), 0);
    let state: "loading" | "ok" | "bad" = "loading";
    let label = "buscando…";
    if (entry?.error) {
      state = "bad";
      label = "indisponível";
      notes.push({ id, text: "Não foi possível consultar esta fonte agora.", bad: true });
    } else if (first) {
      if (first.status === "ok") {
        state = "ok";
        label = `${count} ${count === 1 ? "resultado" : "resultados"}`;
        if (first.message) notes.push({ id, text: first.message, bad: false });
      } else {
        state = "bad";
        label = first.status === "not_configured" ? "não configurada" : "indisponível";
        if (first.message) notes.push({ id, text: first.message, bad: true });
      }
    }
    return { id, state, label };
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {chips.map((c) => (
          <span
            key={c.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              c.state === "ok" && "border-border bg-card text-foreground",
              c.state === "loading" && "border-border bg-muted text-muted-foreground",
              c.state === "bad" && "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {c.state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {c.state === "ok" ? <CheckCircle2 className="h-3 w-3 text-primary" /> : null}
            {c.state === "bad" ? <AlertCircle className="h-3 w-3" /> : null}
            {getSource(c.id).label}: {c.label}
          </span>
        ))}
      </div>
      {notes.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-1.5">
              {n.bad ? <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" /> : <Info className="mt-0.5 h-3 w-3 shrink-0" />}
              <span>
                <span className="font-medium text-foreground">{getSource(n.id).label}:</span> {n.text}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WorkCard({ work }: { work: MergedWork }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = work.coverUrl && !coverFailed;
  return (
    <article className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
      {showCover ? (
        <img
          src={work.coverUrl!}
          alt={`Capa de ${work.title}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setCoverFailed(true)}
          className="aspect-[2/3] w-24 shrink-0 rounded-md object-cover shadow-sm"
        />
      ) : (
        <div className="flex aspect-[2/3] w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted p-2 text-center">
          <ImageOff className="h-5 w-5 text-muted-foreground" />
          <span className="text-[11px] leading-tight text-muted-foreground">Capa indisponível</span>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="font-display line-clamp-2 text-lg leading-snug font-semibold text-foreground">{work.title}</h2>
        <p className={cn("mt-0.5 line-clamp-1 text-sm", work.authors.length ? "text-foreground/80" : "text-muted-foreground italic")}>
          {work.authors.length ? work.authors.join(", ") : "Autor(a) não informado(a)"}
        </p>
        {work.snippet ? <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{work.snippet}</p> : null}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          {work.links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
              title={`Abrir em ${getSource(l.platform).label}`}
            >
              {getSource(l.platform).label}
              <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}
