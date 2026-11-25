import { useEffect, useState } from "react";

import { useMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export function BookCover({
  book,
  className,
}: {
  book: { title: string; cover_url: string | null };
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const storedCover = book.cover_url?.trim() || null;
  // Quando uma capa é encontrada e salva depois da primeira renderização,
  // libera o estado de erro da imagem anterior para tentar carregar a nova URL.
  useEffect(() => {
    setFailed(false);
  }, [storedCover]);
  const normalizedCover = storedCover?.startsWith("//") ? `https:${storedCover}` : storedCover?.startsWith("http://") ? storedCover.replace(/^http:\/\//i, "https://") : storedCover;
  const url = useMediaUrl(normalizedCover);
  if (!url || failed) {
    return (
      <div
        className={cn(
          "flex aspect-[2/3] shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/20 bg-primary p-1.5 text-center shadow-sm",
          className,
        )}
        aria-label={`Capa de ${book.title}`}
      >
        <span className="font-display text-xs leading-tight font-semibold text-primary-foreground">
          {book.title}
        </span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`Capa de ${book.title}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("aspect-[2/3] shrink-0 rounded-md object-cover shadow-sm", className)}
    />
  );
}
