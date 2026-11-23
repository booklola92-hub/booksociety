import { describe, expect, it } from "vitest";

import { CATALOG_CATEGORIES, cleanCatalogQuery, inCategory } from "@/lib/catalog-search";

describe("catalog search categories", () => {
  it("offers exactly Livros, Novels e Light Novels, Mangás, Manhwas and BL (plus Todos)", () => {
    expect(CATALOG_CATEGORIES.map((c) => c.value)).toEqual(["todos", "livros", "novels", "mangas", "manhwas", "bl"]);
  });

  it("finds BL works in the BL filter whatever their format", () => {
    expect(inCategory({ kind: "novel", is_bl: true }, "bl")).toBe(true);
    expect(inCategory({ kind: "manga", is_bl: true }, "bl")).toBe(true);
    expect(inCategory({ kind: "manhwa", is_bl: true }, "bl")).toBe(true);
    expect(inCategory({ kind: "manhwa", is_bl: false }, "bl")).toBe(false);
  });

  it("keeps a BL manhwa in Manhwas too, as one record", () => {
    expect(inCategory({ kind: "manhwa", is_bl: true }, "manhwas")).toBe(true);
  });

  it("treats light novels and webnovels as Novels", () => {
    expect(inCategory({ kind: "webnovel", is_bl: false }, "novels")).toBe(true);
    expect(inCategory({ kind: "novel", is_bl: false }, "novels")).toBe(true);
  });

  it("leaves formats outside the five categories out of Todos unless they are BL", () => {
    expect(inCategory({ kind: "outro", is_bl: false }, "todos")).toBe(false);
    expect(inCategory({ kind: "manhua", is_bl: false }, "todos")).toBe(false);
    expect(inCategory({ kind: "manhua", is_bl: true }, "todos")).toBe(true);
  });
});


describe("catalog query cleanup", () => {
  it("collapses extra spaces so '  Nora   Roberts ' searches 'Nora Roberts'", () => {
    expect(cleanCatalogQuery("  Nora   Roberts ")).toBe("Nora Roberts");
  });
  it("caps the query at 200 characters", () => {
    expect(cleanCatalogQuery("a".repeat(300))).toHaveLength(200);
  });
});
