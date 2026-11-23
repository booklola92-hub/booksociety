/* eslint-disable prettier/prettier */
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Download, FileUp, Library, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageTitle } from "@/components/empty-state";
import { BookCover } from "@/components/book-cover";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyId, useInvalidate, useMe, useShelf } from "@/lib/social";

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) lines.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) lines.push(row);
  const headers = (lines.shift() ?? []).map((value) => value.trim().toLowerCase());
  return lines.map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])));
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function GoodreadsTransfer() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();

  async function importGoodreads(file: File) {
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length || !("title" in rows[0])) throw new Error("Esse arquivo não parece ser uma exportação CSV do Goodreads.");
      const userId = await getMyId();
      const [{ data: allBooks, error: booksError }, { data: shelf, error: shelfError }] = await Promise.all([
        supabase.from("books").select("id,title,author").limit(10000),
        supabase.from("shelf_items").select("book_id").eq("user_id", userId),
      ]);
      if (booksError) throw booksError;
      if (shelfError) throw shelfError;

      const bookMap = new Map((allBooks ?? []).map((book) => [`${normalize(book.title)}|${normalize(book.author ?? "")}`, book.id]));
      const shelfIds = new Set((shelf ?? []).map((item) => item.book_id));
      const pending: Array<{ title: string; author: string; pages: number | null; cover_url: null; created_by: string }> = [];
      const pendingKeys = new Set<string>();
      for (const row of rows) {
        const title = row.title?.trim();
        if (!title) continue;
        const author = row.author?.trim() ?? "";
        const key = `${normalize(title)}|${normalize(author)}`;
        if (!bookMap.has(key) && !pendingKeys.has(key)) {
          const pages = Number(row["number of pages"]);
          pending.push({ title: title.slice(0, 200), author: author.slice(0, 120), pages: pages > 0 ? pages : null, cover_url: null, created_by: userId });
          pendingKeys.add(key);
        }
      }

      for (let offset = 0; offset < pending.length; offset += 100) {
        const { data, error } = await supabase.from("books").insert(pending.slice(offset, offset + 100)).select("id,title,author");
        if (error) throw error;
        for (const book of data ?? []) bookMap.set(`${normalize(book.title)}|${normalize(book.author ?? "")}`, book.id);
      }

      const shelfRows: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        const title = row.title?.trim();
        if (!title) continue;
        const author = row.author?.trim() ?? "";
        const bookId = bookMap.get(`${normalize(title)}|${normalize(author)}`);
        if (!bookId || shelfIds.has(bookId)) continue;
        const shelves = `${row["exclusive shelf"] ?? ""} ${row.bookshelves ?? ""}`.toLowerCase();
        const status = shelves.includes("currently-reading") ? "reading" : shelves.includes("read") || row["date read"] ? "read" : "want";
        const rating = Number(row["my rating"]);
        const startedAt = parseDate(row["date started"] ?? "");
        const finishedAt = parseDate(row["date read"] ?? "");
        shelfRows.push({
          user_id: userId,
          book_id: bookId,
          status,
          current_page: 0,
          rating: rating >= 1 && rating <= 5 ? rating : null,
          review: (row["my review"] ?? "").slice(0, 3000),
          started_at: startedAt,
          finished_at: finishedAt,
        });
        shelfIds.add(bookId);
      }
      for (let offset = 0; offset < shelfRows.length; offset += 100) {
        const { error } = await supabase.from("shelf_items").insert(shelfRows.slice(offset, offset + 100) as never[]);
        if (error) throw error;
      }
      await invalidate("shelf");
      await invalidate("books");
      toast.success(`Importação concluída: ${shelfRows.length} livros adicionados à sua biblioteca.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o arquivo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function exportGoodreads() {
    setBusy(true);
    try {
      const userId = await getMyId();
      const { data, error } = await supabase
        .from("shelf_items")
        .select("status,rating,review,started_at,finished_at,created_at,books(title,author,pages)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const headers = ["Title", "Author", "ISBN", "ISBN13", "My Rating", "Average Rating", "Publisher", "Binding", "Number of Pages", "Year Published", "Original Publication Year", "Date Read", "Date Added", "Bookshelves", "Exclusive Shelf", "My Review"];
      const lines = [headers.map(csvCell).join(",")];
      for (const item of data ?? []) {
        const book = item.books as unknown as { title: string; author: string; pages: number | null } | null;
        if (!book) continue;
        const shelfName = item.status === "reading" ? "currently-reading" : item.status === "read" ? "read" : "to-read";
        lines.push([
          book.title, book.author, "", "", item.rating ?? "", "", "", "", book.pages ?? "", "", "",
          csvDate(item.finished_at), csvDate(item.created_at), shelfName, shelfName, item.review,
        ].map(csvCell).join(","));
      }
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "book-society-goodreads.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Sua biblioteca foi exportada em CSV.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar sua biblioteca.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary"><Library className="h-6 w-6" /></div>
        <div>
          <h2 className="font-display text-2xl font-semibold">Importar e exportar</h2>
          <p className="text-sm text-muted-foreground">Transfira sua lista de leitura usando o arquivo CSV do Goodreads.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 font-semibold"><Upload className="h-4 w-4 text-primary" /> Importar do Goodreads</div>
          <p className="text-sm leading-relaxed text-muted-foreground">Baixe sua planilha no Goodreads e envie o arquivo CSV aqui. Títulos, autores, status de leitura, avaliações e resenhas serão adicionados à sua biblioteca. Livros que já estão nela serão ignorados.</p>
          <Button className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> {busy ? "Processando..." : "Escolher arquivo CSV"}</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importGoodreads(file); }} />
          <a className="text-sm text-primary underline underline-offset-4" href="https://www.goodreads.com/review/import" target="_blank" rel="noreferrer">Abrir exportação do Goodreads</a>
        </div>
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 font-semibold"><Download className="h-4 w-4 text-primary" /> Exportar do Book Society</div>
          <p className="text-sm leading-relaxed text-muted-foreground">Baixe seus livros em CSV compatível com a planilha de importação do Goodreads. O arquivo inclui status, notas, datas e resenhas disponíveis.</p>
          <Button variant="outline" className="w-full" disabled={busy} onClick={() => void exportGoodreads()}><Download className="h-4 w-4" /> Baixar minha biblioteca</Button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">A importação apenas acrescenta livros que ainda não estão na sua biblioteca; ela não apaga nem substitui seus registros atuais. O Book Society não acessa sua conta ou senha do Goodreads.</p>
    </section>
  );
}

function ReadBooks() {
  const { data: me } = useMe();
  const { data: shelf = [], isLoading } = useShelf(me?.id);
  const readBooks = shelf.filter((item) => item.status === "read" && item.book);
  const lookedUp = useRef(new Set<string>());

  // Livros importados do Goodreads podem não ter capa. Tenta encontrá-la pelo título/autor.
  useEffect(() => {
    let cancelled = false;
    async function fillMissingCovers() {
      for (const item of shelf.filter((entry) => entry.status === "read" && entry.book)) {
        const book = item.book;
        if (!book || book.cover_url || lookedUp.current.has(book.id)) continue;
        lookedUp.current.add(book.id);
        try {
          const params = new URLSearchParams({ title: book.title, fields: "cover_i", limit: "1" });
          if (book.author) params.set("author", book.author);
          const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
          if (!response.ok) continue;
          const result = await response.json();
          const coverId = result.docs?.[0]?.cover_i;
          if (!coverId || cancelled) continue;
          const coverUrl = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
          const { error } = await supabase.from("books").update({ cover_url: coverUrl }).eq("id", book.id);
          if (error) console.error("Não foi possível salvar a capa do livro:", error);
        } catch (error) {
          console.error("Não foi possível buscar a capa do livro:", error);
        }
      }
    }
    if (!isLoading && readBooks.length) void fillMissingCovers();
    return () => { cancelled = true; };
  }, [isLoading, shelf]);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Livros que já li</h2>
          <p className="text-sm text-muted-foreground">Suas leituras concluídas, com as capas dos livros.</p>
        </div>
        <span className="text-sm text-muted-foreground">{readBooks.length} {readBooks.length === 1 ? "livro" : "livros"}</span>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando seus livros...</p>
      ) : readBooks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Você ainda não marcou livros como lidos.</p>
          <p className="mt-1 text-sm text-muted-foreground">Quando mudar o status de um livro para “Lido”, ele aparecerá aqui.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {readBooks.map((item) => (
            <article key={item.id} className="min-w-0 space-y-2">
              <div className="aspect-[2/3] overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
                <BookCover book={item.book} className="h-full w-full rounded-none object-cover" />
              </div>
              <div>
                <h3 className="line-clamp-2 text-sm font-medium leading-snug">{item.book.title}</h3>
                <p className="line-clamp-1 text-xs text-muted-foreground">{item.book.author || "Autor desconhecido"}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function BibliotecaPage() {
  return (
    <div className="space-y-7">
      <PageTitle title="Biblioteca" subtitle="Organize suas leituras e mantenha sua coleção por perto." />
      <ReadBooks />
      <GoodreadsTransfer />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/biblioteca")({
  head: () => ({ meta: [{ title: "Biblioteca — The Secret Bookshelf" }] }),
  component: BibliotecaPage,
});
