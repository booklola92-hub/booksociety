import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

export function Stars({
  value,
  onChange,
  size = "h-4 w-4",
}: {
  value: number | null;
  onChange?: (v: number) => void;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-0.5" aria-label={value ? `${value} de 5 estrelas` : "Sem nota"}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (value ?? 0) >= n;
        const icon = (
          <Star className={cn(size, filled ? "fill-rating text-rating" : "text-muted-foreground/40")} />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
            className="rounded p-0.5 transition-transform hover:scale-110"
          >
            {icon}
          </button>
        ) : (
          <span key={n}>{icon}</span>
        );
      })}
    </div>
  );
}
