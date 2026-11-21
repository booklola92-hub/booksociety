import { describe, expect, it } from "vitest";

import {
  buildWebQuery,
  dedupeWorks,
  getSource,
  isAllowedUrl,
  parseResultTitle,
  SOURCE_IDS,
  WORK_SOURCES,
  type WorkResult,
} from "@/lib/work-sources";

const r = (over: Partial<WorkResult>): WorkResult => ({
  title: "Solo Leveling",
  authors: [],
  coverUrl: null,
  url: "https://www.novelupdates.com/series/solo-leveling/",
  platform: "novel_updates",
  snippet: null,
  ...over,
});

describe("work search sources", () => {
  it("searches all 14 requested sources, with LunarX as a single entry", () => {
    expect(SOURCE_IDS).toEqual([
      "google_books",
      "openlibrary",
      "anilist",
      "mangaupdates",
      "goodreads",
      "novel_updates",
      "web",
      "novellist",
      "kakaopage",
      "visorikigai",
      "leituramanga",
      "eternalmangas",
      "lunarx",
      "risingshadow",
    ]);
    expect(WORK_SOURCES.filter((s) => s.domains.includes("lunarx.to") && s.id !== "web")).toHaveLength(1);
  });

  it("only allows links on allowlisted sites and their subdomains", () => {
    expect(isAllowedUrl("https://www.goodreads.com/book/show/1")).toBe(true);
    expect(isAllowedUrl("https://lunarx.to/manga/x")).toBe(true);
    expect(isAllowedUrl("https://goodreads.com.evil.net/book")).toBe(false);
    expect(isAllowedUrl("https://evilgoodreads.com/book")).toBe(false);
    expect(isAllowedUrl("https://wikipedia.org/wiki/Duna")).toBe(false);
    expect(isAllowedUrl("javascript:alert(1)")).toBe(false);
  });

  it("restricts the general internet search to the allowlisted domains only", () => {
    const query = buildWebQuery("Duna site:evil.com", "titulo", [getSource("web")]);
    expect(query).not.toContain("evil.com");
    const sites = [...query.matchAll(/site:(\S+?)(?=[\s)])/g)].map((m) => m[1]!);
    expect(sites.length).toBeGreaterThan(0);
    for (const s of sites) expect(isAllowedUrl(`https://${s}`)).toBe(true);
  });

  it("reads the author from a Goodreads page title without inventing one elsewhere", () => {
    expect(parseResultTitle("The Name of the Wind by Patrick Rothfuss | Goodreads", "goodreads")).toEqual({
      title: "The Name of the Wind",
      authors: ["Patrick Rothfuss"],
    });
    expect(parseResultTitle("Solo Leveling - Novel Updates", "novel_updates")).toEqual({
      title: "Solo Leveling",
      authors: [],
    });
  });

  it("merges the same work from different platforms and keeps every platform link", () => {
    const works = dedupeWorks([
      r({ title: "Solo Leveling", authors: ["Chugong"], coverUrl: "https://img.example/c.jpg", url: "https://books.google.com/books?id=1", platform: "google_books" }),
      r({}),
      r({ title: "Solo Leveling (Novel)", url: "https://page.kakao.com/content/1", platform: "kakaopage" }),
    ]);
    expect(works).toHaveLength(1);
    expect(works[0]!.links.map((l) => l.platform)).toEqual(["google_books", "novel_updates", "kakaopage"]);
    expect(works[0]!.coverUrl).toBe("https://img.example/c.jpg");
  });

  it("preserves and combines original/translated titles, synopsis, genres and authors", () => {
    const works = dedupeWorks([
      r({
        title: "Solo Leveling",
        originalTitle: "나 혼자만 레벨업",
        authors: ["Chugong"],
        synopsis: null,
        genres: ["Action"],
        url: "https://books.google.com/books?id=1",
        platform: "google_books",
      }),
      r({
        title: "Solo Leveling",
        originalTitle: null,
        authors: ["Chugong", "DUBU"],
        synopsis: "A hunter grows stronger.",
        genres: ["Fantasy"],
        tags: ["Adventure"],
        url: "https://www.novelupdates.com/series/solo-leveling/",
        platform: "novel_updates",
      }),
    ]);
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({
      title: "Solo Leveling",
      translatedTitle: "Solo Leveling",
      originalTitle: "나 혼자만 레벨업",
      authors: ["Chugong", "DUBU"],
      synopsis: "A hunter grows stronger.",
      genres: ["Action", "Fantasy", "Adventure"],
    });
  });

  it("keeps works apart when the authors differ, and drops links outside the allowlist", () => {
    const works = dedupeWorks([
      r({ title: "Duna", authors: ["Frank Herbert"], url: "https://books.google.com/books?id=a", platform: "google_books" }),
      r({ title: "Duna", authors: ["Outra Pessoa"], url: "https://books.google.com/books?id=b", platform: "google_books" }),
      r({ title: "Duna", url: "https://evil.example/duna", platform: "goodreads" }),
    ]);
    expect(works).toHaveLength(2);
  });
});
