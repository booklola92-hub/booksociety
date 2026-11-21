import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runProvider, Unavailable } from "@/lib/work-providers.server";
import { isSourceId, SEARCH_FIELDS, type SearchField, type SourceId, type SourceResponse } from "@/lib/work-sources";

const inputSchema = z.object({
  source: z.string().refine(isSourceId, "Fonte desconhecida"),
  q: z.string().trim().min(1).max(200),
  field: z.enum(SEARCH_FIELDS as [SearchField, ...SearchField[]]),
  page: z.number().int().min(0).max(9),
});

export const searchWorkSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<SourceResponse> => {
    const source = data.source as SourceId;
    try {
      const r = await runProvider(source, data.q, data.field, data.page);
      return { source, status: "ok", message: r.message ?? null, results: r.results, hasMore: r.hasMore };
    } catch (err) {
      if (err instanceof Unavailable) {
        const status = err.kind === "not_configured" ? "not_configured" : "unavailable";
        return { source, status, message: err.message, results: [], hasMore: false };
      }
      console.error(`Work search failed for ${source}:`, err);
      return { source, status: "unavailable", message: "A fonte está indisponível no momento.", results: [], hasMore: false };
    }
  });
