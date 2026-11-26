function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/\\s+/g, " ").trim();
}

export async function canLoadPublicCover(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return true;
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = "";
      resolve(false);
    }, 1500);
    image.onload = () => { window.clearTimeout(timeout); resolve(image.naturalWidth > 0 && image.naturalHeight > 0); };
    image.onerror = () => { window.clearTimeout(timeout); resolve(false); };
    image.src = url;
  });
}

// Confere também arquivos salvos no Storage privado. Um caminho antigo ou sem
// permissão não pode ser tratado como se a capa ainda estivesse disponível.
export async function canLoadStoredCover(path: string): Promise<boolean> {
  try {
    const blob = await fetchPrivateObject("media", path);
    return Boolean(blob && blob.size > 0 && (!blob.type || blob.type.startsWith("image/")));
  } catch {
    return false;
  }
}

export async function findPublicCover(title: string, author: string, isbn10: string, isbn13: string): Promise<string | null> {
  const cleanIsbn = (value: string) => value.replace(/[^0-9Xx]/g, "");
  const isbn = cleanIsbn(isbn13) || cleanIsbn(isbn10);
  const cleanTitle = (value: string) => value
    .replace(/\s*[\[(（【][^\])）】]*[\])）】]\s*$/g, "")
    .replace(/\s*(?:-|—|:)\s*(?:volume|vol\.?|book|livro|série|serie|parte|part)\s*#?\s*\d+.*$/i, "")
    .replace(/\s*#\s*\d+\s*$/i, "")
    .trim();
  const titleVariants = [...new Set([
    title.trim(),
    cleanTitle(title),
    cleanTitle(title).replace(/\s*(?:—|:|-)\s*.+$/, "").trim(),
    title.replace(/\s*\([^)]*(?:series|série|volume|vol\.?|book|livro|#\s*\d+)[^)]*\)\s*$/i, "").trim(),
  ].filter(Boolean))];
  const normalizeTitle = (value: string) => normalize(cleanTitle(value)).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const tokens = (value: string) => normalizeTitle(value).split(" ").filter((word) => word.length > 1);
  const expectedAuthor = normalize(author).replace(/[^a-z0-9]+/g, " ").trim();
  const authorMatch = (names: string[]) => {
    if (!expectedAuthor || !names.length) return false;
    return names.some((name) => {
      const candidate = normalize(name).replace(/[^a-z0-9]+/g, " ").trim();
      if (!candidate) return false;
      if (candidate === expectedAuthor || candidate.includes(expectedAuthor) || expectedAuthor.includes(candidate)) return true;
      const expected = expectedAuthor.split(" ").filter((word) => word.length > 1);
      const actual = new Set(candidate.split(" "));
      return expected.length > 1 && expected.filter((word) => actual.has(word)).length / expected.length >= 0.7;
    });
  };
  const scoreTitle = (candidate: string) => {
    const candidateKey = normalizeTitle(candidate);
    if (!candidateKey) return 0;
    if (titleVariants.map(normalizeTitle).includes(candidateKey)) return 1;
    const candidateTokens = new Set(tokens(candidate));
    if (!candidateTokens.size) return 0;
    return Math.max(0, ...titleVariants.map((variant) => {
      const expected = new Set(tokens(variant));
      if (!expected.size) return 0;
      const overlap = [...expected].filter((word) => candidateTokens.has(word)).length;
      const recall = overlap / expected.size;
      const precision = overlap / candidateTokens.size;
      return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    }));
  };
  const pickBest = <T,>(items: T[], getTitle: (item: T) => string, getAuthors: (item: T) => string[]) => {
    const ranked = items.map((item) => {
      const titleScore = scoreTitle(getTitle(item));
      const authors = getAuthors(item);
      const hasAuthorData = authors.some((name) => Boolean(name?.trim()));
      const matchesAuthor = authorMatch(authors);
      const acceptable = titleScore >= 0.72 && (
        !expectedAuthor || !hasAuthorData || matchesAuthor || titleScore >= 0.98
      );
      return { item, titleScore, matchesAuthor, acceptable };
    }).filter((entry) => entry.acceptable)
      .sort((a, b) => Number(b.matchesAuthor) - Number(a.matchesAuthor) || b.titleScore - a.titleScore);
    return ranked[0]?.item ?? null;
  };
  const safeQuery = (value: string) => value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();

  // Internet Archive: pesquisa registros e arquivos de capa hospedados no próprio acervo.
  // Primeiro tenta título + autor; depois título simplificado. A capa é escolhida
  // entre arquivos identificados como imagem de capa; usa o serviço de miniatura como fallback.
  try {
    const queries = isbn
      ? ["isbn:" + isbn + " AND mediatype:texts"]
      : titleVariants.flatMap((variant) => {
          const exactTitle = 'title:("' + safeQuery(variant) + '")';
          return [
            expectedAuthor ? exactTitle + ' AND creator:("' + safeQuery(author) + '") AND mediatype:texts' : exactTitle + " AND mediatype:texts",
            exactTitle + " AND mediatype:texts",
          ];
        });
    for (const query of [...new Set(queries)]) {
      const url = "https://archive.org/advancedsearch.php?q=" + encodeURIComponent(query) + "&fl[]=identifier,title,creator&rows=50&page=1&output=json";
      const response = await fetch(url);
      if (!response.ok) continue;
      const payload = await response.json();
      const docs = payload.response?.docs ?? [];
      const match = pickBest(docs, (doc: any) => String(doc.title ?? ""), (doc: any) =>
        Array.isArray(doc.creator) ? doc.creator.map(String) : [String(doc.creator ?? "")]);
      if (!match?.identifier) continue;

      const identifier = String(match.identifier);
      try {
        const metadataResponse = await fetch("https://archive.org/metadata/" + encodeURIComponent(identifier));
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          const files = Array.isArray(metadata.files) ? metadata.files : [];
          const imageFiles = files
            .filter((file: any) => {
              const name = String(file.name ?? "").toLowerCase();
              const format = String(file.format ?? "").toLowerCase();
              return /\.(jpg|jpeg|png|webp)$/i.test(name) &&
                (/(^|[/_-])(cover|front|bookcover|itemimage|__ia_thumb)([/_.-]|$)/i.test(name) ||
                  /cover|thumbnail/i.test(format));
            })
            .sort((left: any, right: any) => {
              const rank = (file: any) => {
                const name = String(file.name ?? "").toLowerCase();
                return name.includes("cover") ? 0 : name.includes("__ia_thumb") ? 1 : name.includes("front") ? 2 : 3;
              };
              return rank(left) - rank(right);
            });
          const selected = imageFiles[0]?.name;
          if (selected) {
            const coverUrl = "https://archive.org/download/" + encodeURIComponent(identifier) + "/" +
              String(selected).split("/").map(encodeURIComponent).join("/");
            if (await canLoadPublicCover(coverUrl)) return coverUrl;
          }
        }
      } catch (metadataError) {
        console.warn("Não foi possível consultar os arquivos do Internet Archive:", metadataError);
      }
      const thumbnailUrl = "https://archive.org/services/img/" + encodeURIComponent(identifier);
      if (await canLoadPublicCover(thumbnailUrl)) return thumbnailUrl;
      // Uma miniatura indisponível no Archive não deve impedir a tentativa
      // nos outros catálogos (Open Library e Google Books).
    }
  } catch (error) { console.warn("Internet Archive não respondeu:", error); }


  \n\n  // AniList: alternativa pública para mangás, manhwas e novels (inclui BL).
  // Usa a capa publicada no catálogo; não baixa nem re-hospeda o arquivo.
  try {
    for (const variant of titleVariants) {
      const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: `query ($search: String) {
            Page(page: 1, perPage: 20) {
              media(search: $search, type: MANGA) {
                title { romaji english native }
                coverImage { extraLarge large }
                staff(perPage: 10) { edges { role node { name { full } } } }
              }
            }
          }`,
          variables: { search: variant },
        }),
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const items = payload.data?.Page?.media ?? [];
      const match = pickBest(items, (item: any) =>
        [item.title?.romaji, item.title?.english, item.title?.native].filter(Boolean).join(" "),
        (item: any) => (item.staff?.edges ?? [])
          .filter((edge: any) => /story|art|original creator|author/i.test(String(edge.role ?? "")))
          .map((edge: any) => String(edge.node?.name?.full ?? "")));
      const image = match?.coverImage?.extraLarge ?? match?.coverImage?.large;
      if (image && await canLoadPublicCover(String(image))) return String(image);
    }
  } catch (error) { console.warn("AniList não respondeu:", error); }

  // Google Books: título + autor, depois título isolado e variações sem subtítulo.
  try {
    const queries = isbn
      ? ["isbn:" + isbn]
      : titleVariants.flatMap((variant) => [
          'intitle:"' + variant + '"' + (author ? ' inauthor:"' + author + '"' : ""),
          'intitle:"' + variant + '"',
          '"' + variant + '"',
        ]);
    for (const query of [...new Set(queries)]) {
      const response = await fetch("https://www.googleapis.com/books/v1/volumes?q=" + encodeURIComponent(query) + "&maxResults=40&orderBy=relevance");
      if (!response.ok) continue;
      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];
      const match = pickBest(items, (item: any) => {
        const info = item.volumeInfo ?? {};
        return [info.title, info.subtitle].filter(Boolean).join(" ");
      }, (item: any) => Array.isArray(item.volumeInfo?.authors) ? item.volumeInfo.authors : []);
      const links = match?.volumeInfo?.imageLinks;
      const image = links?.extraLarge ?? links?.large ?? links?.medium ?? links?.thumbnail ?? links?.smallThumbnail;
      if (image) {
        const coverUrl = String(image).replace(/^http:\/\//i, "https://").replace("&edge=curl", "");
        if (await canLoadPublicCover(coverUrl)) return coverUrl;
      }
    }
  } catch (error) { console.warn("Google Books não respondeu:", error); }

  // Open Library: pesquisa título + autor e repete sem autor/subtítulo.
  try {
    const searches = isbn
      ? ["isbn=" + encodeURIComponent(isbn)]
      : titleVariants.flatMap((variant) => [
          "title=" + encodeURIComponent(variant) + (author ? "&author=" + encodeURIComponent(author) : ""),
          "title=" + encodeURIComponent(variant),
        ]);
    for (const search of [...new Set(searches)]) {
      const response = await fetch("https://openlibrary.org/search.json?" + search + "&limit=50&fields=title,author_name,cover_i,isbn,edition_key");
      if (!response.ok) continue;
      const payload = await response.json();
      const docs = Array.isArray(payload.docs) ? payload.docs : [];
      const match = pickBest(docs, (doc: any) => String(doc.title ?? ""), (doc: any) =>
        Array.isArray(doc.author_name) ? doc.author_name.map(String) : []);
      if (match?.cover_i) {
        const coverUrl = "https://covers.openlibrary.org/b/id/" + match.cover_i + "-L.jpg";
        if (await canLoadPublicCover(coverUrl)) return coverUrl;
      }
    }
  } catch (error) { console.warn("Open Library não respondeu:", error); }






  return null;
}

