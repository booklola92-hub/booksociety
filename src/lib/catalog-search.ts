/** Internal catalog search (books + saved works). Client-safe; reads only the site's own database. */

export type CatalogCategory = "todos" | "livros" | "novels" | "mangas" | "manhwas" | "bl";

export const CATALOG_CATEGORIES: { value: CatalogCategory; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "livros", label: "Livros" },
  { value: "novels", label: "Novels e Light Novels" },
  { value: "mangas", label: "Mangás" },
  { value: "manhwas", label: "Manhwas" },
  { value: "bl", label: "BL (Boys' Love)" },
];

export const CATALOG_PAGE_SIZE = 24;

export interface CatalogItem {
  id: string;
  origin: "book" | "work" | "external";
  title: string;
  authors: string[];
  cover_url: string | null;
  synopsis: string | null;
  kind: string;
  is_bl: boolean;
  alt_titles: string[];
  language?: string | null;
}

export function catalogKindLabel(kind: string): string {
  switch (kind) {
    case "livro":
      return "Livro";
    case "novel":
      return "Novel / Light Novel";
    case "webnovel":
      return "Novel / Light Novel";
    case "manga":
      return "Mangá";
    case "manhwa":
      return "Manhwa";
    default:
      return "Outro formato";
  }
}

/** Mirrors the category rule used by the database search, for tests and client checks. */
export function inCategory(
  item: Pick<CatalogItem, "kind" | "is_bl">,
  category: CatalogCategory,
): boolean {
  switch (category) {
    case "livros":
      return item.kind === "livro";
    case "novels":
      return item.kind === "novel" || item.kind === "webnovel";
    case "mangas":
      return item.kind === "manga";
    case "manhwas":
      return item.kind === "manhwa";
    case "bl":
      return item.is_bl;
    default:
      return ["livro", "novel", "webnovel", "manga", "manhwa"].includes(item.kind) || item.is_bl;
  }
}

/** Trims and collapses extra spaces before sending the query; accent/case/punctuation folding happens in the database. */
export function cleanCatalogQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 200);
}
