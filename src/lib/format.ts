import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const fmtPostDate = (iso: string) =>
  format(parseISO(iso), "d 'de' MMM 'de' yyyy • HH:mm", { locale: ptBR });

export const fmtRelative = (iso: string) =>
  formatDistanceToNowStrict(parseISO(iso), { locale: ptBR, addSuffix: true });

export const fmtDay = (iso: string) => format(parseISO(iso), "d 'de' MMMM 'de' yyyy", { locale: ptBR });

export const fmtShortDay = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale: ptBR });

export const fmtMonth = (iso: string) => format(parseISO(iso), "MMMM 'de' yyyy", { locale: ptBR });

export function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export const compactNumber = (n: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
