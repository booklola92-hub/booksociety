/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any, no-control-regex, no-useless-escape -- validação defensiva de respostas JSON externas e sanitização CSV. */
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownUp, BookOpen, Bookmark, CheckCircle2, Download, FileUp, Heart, Library, Plus, Search, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { BookPicker } from "@/components/book-picker";
import { Stars } from "@/components/stars";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookCover } from "@/components/book-cover";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchPrivateObject, uploadMedia } from "@/lib/media";
import { addToShelf, getMyId, SHELF_LABEL, useInvalidate, useMe, useShelf, type ShelfEntry, type ShelfStatus } from "@/lib/social";
import { cn } from "@/lib/utils";

type CsvRow = Record<string, string>;

function zipStore(files: Array<{ name: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    crcTable[n] = value >>> 0;
  }
  const crc32 = (data: Uint8Array) => {
    let crc = 0xffffffff;
    for (const byte of data) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true); lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, file.data.length, true); lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true); local.set(name, 30);
    chunks.push(local, file.data);
    const directory = new Uint8Array(46 + name.length);
    const dv = new DataView(directory.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x0800, true); dv.setUint16(10, 0, true); dv.setUint16(12, dosTime, true);
    dv.setUint16(14, dosDate, true); dv.setUint32(16, crc, true); dv.setUint32(20, file.data.length, true);
    dv.setUint32(24, file.data.length, true); dv.setUint16(28, name.length, true); dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true); dv.setUint16(34, 0, true); dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true); dv.setUint32(42, offset, true); directory.set(name, 46);
    central.push(directory); offset += local.length + file.data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
  return new Blob([...chunks, ...central, end] as BlobPart[], { type: "application/zip" });
}
function safeFileName(value: string): string {
  return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "livro";
}


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

// Neutraliza conteúdo que planilhas podem interpretar como fórmula (CSV injection).
// A verificação considera espaços e caracteres de controle antes do marcador.
// Neutraliza conteúdo que planilhas podem interpretar como fórmula (CSV injection).
// A verificação considera espaços e caracteres de controle antes do marcador.
function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
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



const COVER_CHECK_TIMEOUT_MS = 1500;

type CoverCheck = "valid" | "broken" | "unknown";

async function canLoadPublicCover(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve(false);
    }, COVER_CHECK_TIMEOUT_MS);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image.naturalWidth > 0 && image.naturalHeight > 0);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      resolve(false);
    };
    image.src = url;
  });
}

async function canLoadStoredCover(path: string): Promise<boolean> {
  try {
    const blob = await fetchPrivateObject("media", path);
    return Boolean(blob && blob.size > 0 && (!blob.type || blob.type.startsWith("image/")));
  } catch {
    return false;
  }
}

// Um timeout não prova que a capa está quebrada. Nesse caso, preservamos
// a imagem atual para evitar substituir capas válidas que só carregam devagar.
async function checkCurrentCover(url: string): Promise<CoverCheck> {
  if (!url.trim()) return "broken";
  if (!/^https?:\/\//i.test(url)) {
    return Promise.race([
      canLoadStoredCover(url).then((valid) => valid ? "valid" as const : "broken" as const),
      new Promise<CoverCheck>((resolve) => window.setTimeout(() => resolve("unknown"), COVER_CHECK_TIMEOUT_MS)),
    ]);
  }

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (result: CoverCheck) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timeout = window.setTimeout(() => finish("unknown"), COVER_CHECK_TIMEOUT_MS);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? "valid" : "broken");
    image.onerror = () => finish("broken");
    image.src = url;
  });
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(5000) });
}

async function findPublicCover(title: string, author: string, isbn10: string, isbn13: string): Promise<string | null> {
  const cleanIsbn = (value: string) => value.replace(/[^0-9Xx]/g, "");
  const isbn = cleanIsbn(isbn13) || cleanIsbn(isbn10);
  const cleanTitle = (value: string) => value
    .replace(/\s*[\[(（【][^\])）】]*[\])）】]\s*$/g, "")
    .replace(/\s*(?:-|—|:)\s*(?:volume|vol\.?|book|livro|série|serie|parte|part)\s*#?\s*\d+.*$/i, "")
    .replace(/\s*#\s*\d+\s*$/i, "").trim();
  const titleVariants = [...new Set([title.trim(), cleanTitle(title), cleanTitle(title).replace(/\s*(?:—|:|-)\s*.+$/, "").trim()].filter(Boolean))];
  const queryTitle = titleVariants[0] ?? title.trim();
  const expectedAuthor = normalize(author).replace(/[^a-z0-9]+/g, " ").trim();
  const normalizeTitle = (value: string) => normalize(cleanTitle(value)).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const scoreTitle = (candidate: string) => {
    const expected = normalizeTitle(queryTitle), actual = normalizeTitle(candidate);
    if (!expected || !actual) return 0;
    if (expected === actual) return 1;
    const a = new Set(expected.split(" ").filter((word) => word.length > 1));
    const b = new Set(actual.split(" ").filter((word) => word.length > 1));
    const overlap = [...a].filter((word) => b.has(word)).length;
    return a.size && b.size ? (2 * overlap) / (a.size + b.size) : 0;
  };
  const authorMatch = (names: string[]) => !expectedAuthor || names.some((name) => {
    const candidate = normalize(name).replace(/[^a-z0-9]+/g, " ").trim();
    return candidate === expectedAuthor || candidate.includes(expectedAuthor) || expectedAuthor.includes(candidate);
  });
  const pickBest = <T,>(items: T[], getTitle: (item: T) => string, getAuthors: (item: T) => string[]) =>
    items.map((item) => {
      const score = scoreTitle(getTitle(item)), authors = getAuthors(item).filter(Boolean);
      return { item, score, matchesAuthor: authorMatch(authors), acceptable: score >= 0.68 && (!expectedAuthor || !authors.length || authorMatch(authors) || score >= 0.98) };
    }).filter((entry) => entry.acceptable)
      .sort((a, b) => Number(b.matchesAuthor) - Number(a.matchesAuthor) || b.score - a.score)[0]?.item ?? null;
  const usable = async (url: string | null | undefined) => {
    if (!url) return null;
    const normalizedUrl = url.replace(/^http:\/\//i, "https:").replace("&edge=curl", "");
    return await canLoadPublicCover(normalizedUrl) ? normalizedUrl : null;
  };

  // 1. Internet Archive e Google Books são consultados simultaneamente.
  const [archiveResult, googleResult] = await Promise.allSettled([
    (async () => {
      const query = isbn ? "isbn:" + isbn + " AND mediatype:texts" :
        'title:("' + queryTitle.replace(/["\\]/g, " ") + '")' +
        (author ? ' AND creator:("' + author.replace(/["\\]/g, " ") + '")' : "") + " AND mediatype:texts";
      const response = await fetchWithTimeout("https://archive.org/advancedsearch.php?q=" + encodeURIComponent(query) + "&fl[]=identifier,title,creator&rows=20&page=1&output=json");
      if (!response.ok) return null;
      const payload = await response.json(), docs = payload.response?.docs ?? [];
      const match = pickBest(docs, (doc: any) => String(doc.title ?? ""),
        (doc: any) => Array.isArray(doc.creator) ? doc.creator.map(String) : [String(doc.creator ?? "")]);
      if (!match?.identifier) return null;
      const identifier = String(match.identifier);
      try {
        const metadataResponse = await fetchWithTimeout("https://archive.org/metadata/" + encodeURIComponent(identifier));
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json(), files = Array.isArray(metadata.files) ? metadata.files : [];
          const imageFile = files.filter((file: any) => {
            const name = String(file.name ?? "").toLowerCase(), format = String(file.format ?? "").toLowerCase();
            return /\.(jpg|jpeg|png|webp)$/i.test(name) &&
              (/(^|[/_-])(cover|front|bookcover|itemimage|__ia_thumb)([/_.-]|$)/i.test(name) || /cover|thumbnail/i.test(format));
          }).sort((a: any, b: any) => Number(!String(a.name).toLowerCase().includes("cover")) - Number(!String(b.name).toLowerCase().includes("cover")))[0];
          if (imageFile?.name) {
            const coverUrl = "https://archive.org/download/" + encodeURIComponent(identifier) + "/" + String(imageFile.name).split("/").map(encodeURIComponent).join("/");
            const valid = await usable(coverUrl);
            if (valid) return valid;
          }
        }
      } catch (error) { console.warn("Internet Archive metadata não respondeu:", error); }
      return await usable("https://archive.org/services/img/" + encodeURIComponent(identifier));
    })(),
    (async () => {
      const query = isbn ? "isbn:" + isbn : 'intitle:"' + queryTitle + '"' + (author ? ' inauthor:"' + author + '"' : "");
      const response = await fetchWithTimeout("https://www.googleapis.com/books/v1/volumes?q=" + encodeURIComponent(query) + "&maxResults=20&orderBy=relevance");
      if (!response.ok) return null;
      const payload = await response.json(), items = Array.isArray(payload.items) ? payload.items : [];
      const match = pickBest(items, (item: any) => [item.volumeInfo?.title, item.volumeInfo?.subtitle].filter(Boolean).join(" "),
        (item: any) => Array.isArray(item.volumeInfo?.authors) ? item.volumeInfo.authors : []);
      const links = match?.volumeInfo?.imageLinks;
      return await usable(links?.extraLarge ?? links?.large ?? links?.medium ?? links?.thumbnail ?? links?.smallThumbnail);
    })(),
  ]);
  if (archiveResult.status === "fulfilled" && archiveResult.value) return archiveResult.value;
  if (googleResult.status === "fulfilled" && googleResult.value) return googleResult.value;

  // 2. Open Library é consultada depois das duas fontes prioritárias.
  try {
    const query = isbn ? "isbn=" + encodeURIComponent(isbn) :
      "title=" + encodeURIComponent(queryTitle) + (author ? "&author=" + encodeURIComponent(author) : "");
    const response = await fetchWithTimeout("https://openlibrary.org/search.json?" + query + "&limit=30&fields=title,author_name,cover_i");
    if (response.ok) {
      const payload = await response.json(), docs = Array.isArray(payload.docs) ? payload.docs : [];
      const match = pickBest(docs, (doc: any) => String(doc.title ?? ""),
        (doc: any) => Array.isArray(doc.author_name) ? doc.author_name.map(String) : []);
      const cover = match?.cover_i ? await usable("https://covers.openlibrary.org/b/id/" + match.cover_i + "-L.jpg") : null;
      if (cover) return cover;
    }
  } catch (error) { console.warn("Open Library não respondeu:", error); }

  // 3. AniList como alternativa especializada para mangás e manhwas.
  try {
    const response = await fetchWithTimeout("https://graphql.anilist.co", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: "query ($search: String) { Page(page: 1, perPage: 20) { media(search: $search, type: MANGA) { title { romaji english native } coverImage { extraLarge large } staff(perPage: 10) { edges { role node { name { full } } } } } } }",
        variables: { search: queryTitle },
      }),
    });
    if (response.ok) {
      const payload = await response.json(), items = payload.data?.Page?.media ?? [];
      const match = pickBest(items, (item: any) => [item.title?.romaji, item.title?.english, item.title?.native].filter(Boolean).join(" "),
        (item: any) => (item.staff?.edges ?? []).filter((edge: any) => /story|art|original creator|author/i.test(String(edge.role ?? ""))).map((edge: any) => String(edge.node?.name?.full ?? "")));
      const cover = await usable(match?.coverImage?.extraLarge ?? match?.coverImage?.large);
      if (cover) return cover;
    }
  } catch (error) { console.warn("AniList não respondeu:", error); }

  // Barnes & Noble e Kobo não oferecem aqui uma API pública de capas documentada.
  // Não fazemos scraping nem contornamos proteções desses catálogos.
  return null;
}
function GoodreadsTransfer() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const coverScanLock = useRef(false);
  const coverScanRunner = useRef<() => Promise<void>>(async () => {});
  const invalidate = useInvalidate();
  const { data: me } = useMe();

  async function importGoodreads(files: FileList) {
    setBusy(true);
    try {
      const selectedFiles = Array.from(files);
      const csvFile = selectedFiles.find((file) => file.name.toLowerCase().endsWith(".csv"));
      if (!csvFile) throw new Error("Selecione o CSV do Goodreads junto com as imagens das capas.");
      const coverFiles = selectedFiles.filter((file) => file !== csvFile && file.type.startsWith("image/"));
      const coversByBookId = new Map(coverFiles.map((file) => [file.name.replace(/\.[^.]+$/, "").trim(), file]));
      const rows = parseCsv(await csvFile.text());
      if (!rows[0] || !("title" in rows[0])) throw new Error("Esse arquivo não parece ser uma exportação CSV do Goodreads.");
      const userId = await getMyId();
      const [{ data: allBooks, error: booksError }, { data: shelf, error: shelfError }] = await Promise.all([
        supabase.from("books").select("id,title,author,cover_url").limit(10000),
        supabase.from("shelf_items").select("book_id").eq("user_id", userId),
      ]);
      if (booksError) throw booksError;
      if (shelfError) throw shelfError;

      const bookMap = new Map((allBooks ?? []).map((book) => [`${normalize(book.title)}|${normalize(book.author ?? "")}`, book.id]));
      const shelfIds = new Set((shelf ?? []).map((item) => item.book_id));
      const pending: Array<{ title: string; author: string; pages: number | null; cover_url: null; created_by: string }> = [];
      const pendingKeys = new Set<string>();
      for (const row of rows) {
        const title = row["title"]?.trim();
        if (!title) continue;
        const author = row["author"]?.trim() ?? "";
        const key = `${normalize(title)}|${normalize(author)}`;
        if (!bookMap.has(key) && !pendingKeys.has(key)) {
          const pages = Number(row["number of pages"]);
          pending.push({ title: title.slice(0, 200), author: author.slice(0, 120), pages: pages > 0 ? pages : null, cover_url: null, created_by: userId });
          pendingKeys.add(key);
        }
      }

      for (let offset = 0; offset < pending.length; offset += 100) {
        const { data, error } = await supabase.from("books").insert(pending.slice(offset, offset + 100)).select("id,title,author,cover_url");
        if (error) throw error;
        for (const book of data ?? []) bookMap.set(`${normalize(book.title)}|${normalize(book.author ?? "")}`, book.id);
      }

      // Associa somente as capas fornecidas pelo usuário, usando o Goodreads Book Id no nome do arquivo.
      let importedCoverCount = 0;
      const processedBooks = new Set<string>();
      for (const row of rows) {
        const title = row["title"]?.trim();
        const goodreadsId = row["book id"]?.trim();
        if (!title || !goodreadsId) continue;
        const author = row["author"]?.trim() ?? "";
        const bookId = bookMap.get(`${normalize(title)}|${normalize(author)}`);
        const coverFile = coversByBookId.get(goodreadsId);
        if (!bookId || !coverFile || processedBooks.has(bookId)) continue;
        try {
          const coverPath = await uploadMedia(userId, coverFile, "book-covers");
          const { error } = await supabase.from("books").update({ cover_url: coverPath }).eq("id", bookId);
          if (error) throw error;
          processedBooks.add(bookId);
          importedCoverCount += 1;
        } catch (coverError) {
          console.warn(`Não foi possível importar a capa de "${title}":`, coverError);
        }
      }

      const shelfRows: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        const title = row["title"]?.trim();
        if (!title) continue;
        const author = row["author"]?.trim() ?? "";
        const bookId = bookMap.get(`${normalize(title)}|${normalize(author)}`);
        if (!bookId || shelfIds.has(bookId)) continue;
        const shelves = `${row["exclusive shelf"] ?? ""} ${row["bookshelves"] ?? ""}`.toLowerCase();
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
      toast.success(`Importação concluída: ${shelfRows.length} livros adicionados e ${importedCoverCount} capas importadas.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o arquivo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }


  async function findMissingCovers() {
    if (coverScanLock.current) return;
    coverScanLock.current = true;
    setCoverBusy(true);
    try {
      const userId = await getMyId();
      const shelfRows: Array<{ book_id: string }> = [];
      const pageSize = 500;

      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("shelf_items")
          .select("book_id")
          .eq("user_id", userId)
          .order("book_id")
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        shelfRows.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }

      const bookIds = [...new Set(shelfRows.map((item) => item.book_id).filter(Boolean))];
      if (!bookIds.length) {
        toast.info("Adicione livros à Biblioteca para buscar as capas.");
        return;
      }

      const books: Array<{ id: string; title: string; author: string | null; cover_url: string | null }> = [];
      for (let offset = 0; offset < bookIds.length; offset += 200) {
        const { data, error } = await supabase
          .from("books")
          .select("id,title,author,cover_url")
          .in("id", bookIds.slice(offset, offset + 200));
        if (error) throw error;
        books.push(...(data ?? []));
      }

      let saved = 0;
      let cursor = 0;
      const concurrency = 4;
      toast.info(`Verificando ${books.length} livros. Cada capa encontrada será salva imediatamente.`);

      const worker = async () => {
        while (true) {
          const index = cursor++;
          if (index >= books.length) return;
          const book = books[index];
          if (!book) continue;

          try {
            const originalCover = book.cover_url;
            const currentCover = originalCover?.trim() ?? "";
            const currentState = currentCover ? await checkCurrentCover(currentCover) : "broken";

            // Capas válidas ou com carregamento lento são mantidas. Só pesquisamos
            // para livros sem capa ou cuja imagem realmente retornou erro.
            if (currentState === "valid" || currentState === "unknown") continue;

            // A função consulta na ordem definida: Internet Archive, AniList,
            // Google Books e Open Library (última alternativa).
            const replacementCover = await findPublicCover(book.title, book.author ?? "", "", "");
            if (!replacementCover || replacementCover === currentCover) continue;

            // Atualização condicional: se outra tela alterou a capa enquanto
            // pesquisávamos, não sobrescrevemos a alteração mais recente.
            const updateResult = originalCover == null
              ? await supabase.from("books").update({ cover_url: replacementCover })
                  .eq("id", book.id).is("cover_url", null).select("id").maybeSingle()
              : await supabase.from("books").update({ cover_url: replacementCover })
                  .eq("id", book.id).eq("cover_url", originalCover).select("id").maybeSingle();

            if (updateResult.error) throw updateResult.error;
            if (updateResult.data?.id) {
              saved += 1;
              toast.success(`Capa de “${book.title}” adicionada à Biblioteca!`);
              await invalidate("shelf");
              await invalidate("books");
            }
          } catch (searchError) {
            // Falhas isoladas não interrompem a busca dos outros livros.
            console.warn(`Não foi possível atualizar a capa de “${book.title}”:`, searchError);
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, books.length) }, () => worker()));
      await invalidate("shelf");
      await invalidate("books");
      toast.info(`Busca concluída: ${saved} capas salvas. Os livros sem uma imagem disponível continuam na Biblioteca.`);
    } catch (error) {
      console.error("Não foi possível concluir a busca de capas:", error);
      toast.info("A busca de capas foi interrompida. Seus livros e capas existentes foram preservados; tente novamente mais tarde.");
    } finally {
      coverScanLock.current = false;
      setCoverBusy(false);
    }
  }

  // Mantém a busca de capas ativa enquanto a Biblioteca estiver aberta,
  // mesmo quando a aba fica em segundo plano. O navegador pode limitar
  // temporizadores em abas ocultas, mas a rotina não é pausada por visibilityState.
  // Uma nova rodada começa 30 segundos após a anterior terminar; nunca há duas simultâneas.
  coverScanRunner.current = findMissingCovers;
  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    let timer: number | undefined;
    const scheduleNext = () => {
      if (cancelled) return;
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        await coverScanRunner.current();
        scheduleNext();
      }, 30_000);
    };
    timer = window.setTimeout(async () => {
      if (!cancelled) await coverScanRunner.current();
      scheduleNext();
    }, 1_500);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [me?.id]);

  async function exportGoodreads() {
    setBusy(true);
    try {
      const userId = await getMyId();
      const { data, error } = await supabase.from("shelf_items")
        .select("status,rating,review,started_at,finished_at,created_at,books(title,author,pages,cover_url)")
        .eq("user_id", userId).order("created_at", { ascending: true });
      if (error) throw error;
      const headers = ["Title", "Author", "ISBN", "ISBN13", "My Rating", "Average Rating", "Publisher", "Binding", "Number of Pages", "Year Published", "Original Publication Year", "Date Read", "Date Added", "Bookshelves", "Exclusive Shelf", "My Review", "Cover File"];
      const lines = [headers.map(csvCell).join(",")];
      const files: Array<{ name: string; data: Uint8Array }> = [];
      const manifest = [["Title", "Author", "Cover File"]];
      let coverCount = 0;
      for (const item of data ?? []) {
        const book = item.books as unknown as { title: string; author: string; pages: number | null; cover_url: string | null } | null;
        if (!book) continue;
        const shelfName = item.status === "reading" ? "currently-reading" : item.status === "read" ? "read" : "to-read";
        let coverFile = "";
        if (book.cover_url) {
          try {
            let blob: Blob;
            if (!/^https?:\/\//i.test(book.cover_url)) {
              const privateBlob = await fetchPrivateObject("media", book.cover_url);
              if (!privateBlob) throw new Error("Sem acesso à capa");
              blob = privateBlob;
            } else {
              const response = await fetch(book.cover_url);
              if (!response.ok) throw new Error("Falha ao baixar a capa");
              blob = await response.blob();
            }
            const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : blob.type.includes("gif") ? "gif" : "jpg";
            coverFile = `capas/${String(coverCount + 1).padStart(4, "0")}-${safeFileName(book.title)}.${extension}`;
            files.push({ name: coverFile, data: new Uint8Array(await blob.arrayBuffer()) });
            coverCount += 1;
          } catch (coverError) { console.warn(`Não foi possível exportar a capa de "${book.title}":`, coverError); }
        }
        lines.push([book.title, book.author, "", "", item.rating ?? "", "", "", "", book.pages ?? "", "", "", csvDate(item.finished_at), csvDate(item.created_at), shelfName, shelfName, item.review, coverFile].map(csvCell).join(","));
        manifest.push([book.title, book.author, coverFile]);
      }
      const encoder = new TextEncoder();
      files.unshift({ name: "book-society-goodreads.csv", data: encoder.encode("\uFEFF" + lines.join("\r\n")) });
      files.push({ name: "indice-das-capas.csv", data: encoder.encode("\uFEFF" + manifest.map((row) => row.map(csvCell).join(",")).join("\r\n")) });
      files.push({ name: "LEIA-ME.txt", data: encoder.encode("Sua biblioteca Book Society\n\nO CSV contém os dados dos livros. A pasta capas contém as imagens disponíveis. A coluna Cover File e o indice-das-capas.csv relacionam cada imagem ao livro.\n\nAlguns serviços não importam capas pelo CSV; mantenha a pasta capas como cópia de segurança.\n") });
      const archive = zipStore(files);
      const url = URL.createObjectURL(archive);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "book-society-biblioteca-com-capas.zip"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Biblioteca exportada com ${coverCount} capas.${coverCount < manifest.length - 1 ? " Algumas capas não puderam ser baixadas." : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar sua biblioteca.");
    } finally { setBusy(false); }
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
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-semibold">Capas dos seus livros</p>
          <p className="text-sm text-muted-foreground">Cada capa encontrada é salva e aparece na Biblioteca imediatamente, sem esperar a pesquisa terminar.</p>
          {coverBusy ? <p className="text-xs text-primary" role="status" aria-live="polite">Buscando capas nos catálogos públicos…</p> : null}
        </div>
        {coverBusy ? <p className="shrink-0 text-sm text-primary" role="status" aria-live="polite">Buscando capas automaticamente…</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 font-semibold"><Upload className="h-4 w-4 text-primary" /> Importar do Goodreads</div>
          <p className="text-sm leading-relaxed text-muted-foreground">Selecione o CSV do Goodreads e, junto com ele, as imagens originais das capas. Nomeie cada imagem com o Goodreads Book Id (por exemplo: 260068020.jpg). Os livros, avaliações e resenhas serão importados; capas fornecidas serão associadas pelo ID.</p>
          <Button className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> {busy ? "Processando..." : "Escolher arquivo CSV"}</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,image/*" multiple className="hidden" onChange={(event) => { const files = event.target.files; if (files?.length) void importGoodreads(files); }} />
          <a className="text-sm text-primary underline underline-offset-4" href="https://www.goodreads.com/review/import" target="_blank" rel="noreferrer">Abrir exportação do Goodreads</a>
        </div>
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 font-semibold"><Download className="h-4 w-4 text-primary" /> Exportar do Book Society</div>
          <p className="text-sm leading-relaxed text-muted-foreground">Baixe um ZIP com a planilha CSV, as capas disponíveis e um índice que relaciona cada imagem ao livro.</p>
          <Button variant="outline" className="w-full" disabled={busy} onClick={() => void exportGoodreads()}><Download className="h-4 w-4" /> Baixar livros + capas (ZIP)</Button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">A importação apenas acrescenta livros que ainda não estão na sua biblioteca; ela não apaga nem substitui seus registros atuais. O Book Society não acessa sua conta ou senha do Goodreads.</p>
    </section>
  );
}

const STATUS_TABS = [
  { value: "all", label: "Todos" },
  { value: "read", label: "Lidos" },
  { value: "reading", label: "Lendo" },
  { value: "want", label: "Quero ler" },
  { value: "fav", label: "Favoritos" },
] as const;
type StatusTab = (typeof STATUS_TABS)[number]["value"];
type SortKey = "recent" | "title" | "author" | "rating";

/** Favoritos = livros que você avaliou com 5 estrelas. */
const isFavorite = (item: ShelfEntry) => item.rating === 5;

function LibraryHero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-accent/40 p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
          <BookOpen className="h-7 w-7" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-semibold text-primary sm:text-4xl">Biblioteca</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">Organize seus livros, descubra novas leituras e compartilhe suas impressões.</p>
        </div>
      </div>
    </section>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-primary transition-all" strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold text-primary">{value}%</span>
        <span className="text-xs text-muted-foreground">concluídos</span>
      </div>
    </div>
  );
}

function ReadingSummary({ shelf }: { shelf: ShelfEntry[] }) {
  const read = shelf.filter((i) => i.status === "read").length;
  const reading = shelf.filter((i) => i.status === "reading").length;
  const want = shelf.filter((i) => i.status === "want").length;
  const fav = shelf.filter(isFavorite).length;
  const pct = shelf.length ? Math.round((read / shelf.length) * 100) : 0;
  const rows = [
    { icon: CheckCircle2, label: "Livros concluídos", value: read },
    { icon: BookOpen, label: "Lendo agora", value: reading },
    { icon: Heart, label: "Favoritos", value: fav },
    { icon: Bookmark, label: "Quero ler", value: want },
  ];
  return (
    <aside className="h-fit space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-24">
      <div>
        <h3 className="font-display text-xl font-semibold">Sua Leitura</h3>
        <p className="text-xs text-muted-foreground">{read} de {shelf.length} {shelf.length === 1 ? "livro" : "livros"} da biblioteca</p>
      </div>
      <ProgressRing value={pct} />
      <ul className="space-y-2">
        {rows.map(({ icon: Icon, label, value }) => (
          <li key={label} className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-primary" /> {label}</span>
            <span className="font-semibold">{value}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Favoritos são os livros que você avaliou com 5 estrelas.</p>
    </aside>
  );
}

function MyLibrary() {
  const { data: me } = useMe();
  const { data: shelf = [], isLoading } = useShelf(me?.id);
  const invalidate = useInvalidate();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<StatusTab>("all");
  const [minRating, setMinRating] = useState("0");
  const [sort, setSort] = useState<SortKey>("recent");
  const [picking, setPicking] = useState(false);

  const counts: Record<StatusTab, number> = {
    all: shelf.length,
    read: shelf.filter((i) => i.status === "read").length,
    reading: shelf.filter((i) => i.status === "reading").length,
    want: shelf.filter((i) => i.status === "want").length,
    fav: shelf.filter(isFavorite).length,
  };

  const needle = normalize(q.trim());
  const min = Number(minRating);
  const items = shelf
    .filter((i) => i.book)
    .filter((i) => (tab === "all" ? true : tab === "fav" ? isFavorite(i) : i.status === tab))
    .filter((i) => (min ? (i.rating ?? 0) >= min : true))
    .filter((i) => !needle || normalize(i.book.title).includes(needle) || normalize(i.book.author ?? "").includes(needle))
    .sort((a, b) =>
      sort === "title" ? a.book.title.localeCompare(b.book.title, "pt-BR")
      : sort === "author" ? (a.book.author ?? "").localeCompare(b.book.author ?? "", "pt-BR")
      : sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0)
      : b.updated_at.localeCompare(a.updated_at),
    );

  async function removeBook(itemId: string, title: string) {
    if (!window.confirm(`Deseja excluir “${title}” da sua Biblioteca?`)) return;
    setDeletingId(itemId);
    try {
      const { error } = await supabase.from("shelf_items").delete().eq("id", itemId).eq("user_id", me!.id);
      if (error) throw error;
      await invalidate("shelf");
      toast.success(`“${title}” foi removido da sua Biblioteca.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o livro.");
    } finally {
      setDeletingId(null);
    }
  }

  async function removeLibrary() {
    if (!me?.id || !shelf.length) return;
    if (!window.confirm(`ATENÇÃO: deseja excluir todos os ${shelf.length} livros da sua Biblioteca? Essa ação não pode ser desfeita. Os livros públicos do catálogo não serão apagados.`)) return;
    setDeletingAll(true);
    try {
      const { error } = await supabase.from("shelf_items").delete().eq("user_id", me.id);
      if (error) throw error;
      await invalidate("shelf");
      toast.success("Sua Biblioteca foi esvaziada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir sua Biblioteca.");
    } finally {
      setDeletingAll(false);
    }
  }

  const removeBtn = (item: ShelfEntry) => (
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Excluir ${item.book.title} da Biblioteca`} title="Excluir livro" disabled={deletingAll || deletingId === item.id} onClick={() => void removeBook(item.id, item.book.title)}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section className="min-w-0 space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">Minha biblioteca</h2>
            <p className="text-sm text-muted-foreground">Cada livro, um pedacinho da sua história.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => document.getElementById("importar-exportar")?.scrollIntoView({ behavior: "smooth" })}>
              <ArrowDownUp className="h-4 w-4" /> Importar e exportar
            </Button>
            <Button onClick={() => setPicking(true)}><Plus className="h-4 w-4" /> Adicionar livro</Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar livros ou autores" className="pl-9" aria-label="Buscar livros ou autores" />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="sm:w-48" aria-label="Ordenar"><SlidersHorizontal className="h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="title">Título (A–Z)</SelectItem>
              <SelectItem value="author">Autor(a) (A–Z)</SelectItem>
              <SelectItem value="rating">Maior nota</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
          {STATUS_TABS.map((t) => (
            <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)}
              className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors", tab === t.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent")}>
              {t.label} <span className="ml-1 opacity-70">{counts[t.value]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Nota mínima</span>
            <Select value={minRating} onValueChange={setMinRating}>
              <SelectTrigger className="h-9 w-36" aria-label="Nota mínima"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Qualquer nota</SelectItem>
                {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{"★".repeat(n)}{n < 5 ? " ou mais" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando seus livros...</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{shelf.length ? "Nenhum livro corresponde aos filtros." : "Sua biblioteca ainda está vazia."}</p>
            <p className="mt-1 text-sm text-muted-foreground">{shelf.length ? "Tente outra busca ou mude os filtros." : "Use “Adicionar livro” para começar."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <article key={item.id} className="min-w-0 space-y-2">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
                  <BookCover book={item.book} className="h-full w-full rounded-none object-cover" />
                  <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium">{SHELF_LABEL[item.status as ShelfStatus] ?? item.status}</span>
                  {isFavorite(item) ? <Heart className="absolute top-2 right-2 h-5 w-5 fill-primary text-primary" /> : null}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-medium leading-snug">{item.book.title}</h3>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{item.book.author || "Autor desconhecido"}</p>
                    {item.rating ? <Stars value={item.rating} size="h-3 w-3" /> : null}
                  </div>
                  {removeBtn(item)}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Mostrando {items.length} de {shelf.length} {shelf.length === 1 ? "livro" : "livros"}</span>
          <Button type="button" variant="destructive" size="sm" disabled={!shelf.length || deletingAll || !!deletingId} onClick={() => void removeLibrary()}>
            <Trash2 className="h-4 w-4" /> {deletingAll ? "Excluindo..." : "Excluir biblioteca"}
          </Button>
        </div>
      </section>

      <ReadingSummary shelf={shelf} />

      <BookPicker open={picking} onOpenChange={setPicking} title="Adicionar livro à biblioteca" onSelect={async (book, details) => {
        try {
          if (!details) await addToShelf(book.id, "want");
          await invalidate("shelf");
          toast.success(details ? `“${book.title}” foi salvo na sua biblioteca.` : `“${book.title}” foi adicionado em Quero ler.`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Não foi possível adicionar o livro.");
        }
      }} />
    </div>
  );
}

function BibliotecaPage() {
  return (
    <div className="space-y-7">
      <LibraryHero />
      <MyLibrary />
      <div id="importar-exportar" className="scroll-mt-24"><GoodreadsTransfer /></div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/biblioteca")({
  head: () => ({ meta: [{ title: "Biblioteca — The Secret Bookshelf" }, { name: "description", content: "Organize seus livros, descubra novas leituras e compartilhe suas impressões." }] }),
  component: BibliotecaPage,
});