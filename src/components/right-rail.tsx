import { Link } from "@tanstack/react-router";
import { ArrowRight, Flame, Star } from "lucide-react";

import openBook from "@/assets/open-book-hearts.png.asset.json";
import { BookCover } from "@/components/book-cover";
import { FollowButton } from "@/components/follow-button";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { useSuggestedReaders, useTrendingBooks } from "@/lib/social";

export function RightRail() {
  return (
    <aside className="space-y-5">
      <SuggestedReaders />
      <TrendingBooks />
      <ChallengeCard />
    </aside>
  );
}

function SuggestedReaders() {
  const { data: readers = [] } = useSuggestedReaders(4);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Star className="h-4 w-4 fill-foreground" /> Pessoas que você pode seguir
        </h2>
        <Link to="/comunidade" search={{ aba: "leitores" }} className="text-xs font-medium text-primary hover:underline">
          Ver todas
        </Link>
      </div>
      {readers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Você já segue todo mundo por aqui. Convide amigas leitoras!</p>
      ) : (
        <ul className="space-y-3">
          {readers.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <Link to="/perfil/$username" params={{ username: r.username }}>
                <UserAvatar profile={r} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  to="/perfil/$username"
                  params={{ username: r.username }}
                  className="block truncate text-sm font-semibold hover:underline"
                >
                  {r.display_name || r.username}
                </Link>
              </div>
              <FollowButton userId={r.id} following={false} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TrendingBooks() {
  const { data: books = [] } = useTrendingBooks(3);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Flame className="h-4 w-4 text-primary" /> Livros em alta
        </h2>
        <Link to="/explorar" className="text-xs font-medium text-primary hover:underline">
          Ver mais
        </Link>
      </div>
      <ul className="space-y-3">
        {books.map((b) => (
          <li key={b.id} className="flex items-center gap-3">
            <BookCover book={b} className="w-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{b.title}</p>
              <p className="truncate text-xs text-muted-foreground">{b.author}</p>
            </div>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {Number(b.readers)} leitor{Number(b.readers) === 1 ? "" : "es"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChallengeCard() {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-secondary/60 p-5 text-center shadow-soft">
      <img src={openBook.url} alt="" className="mx-auto h-24 w-auto mix-blend-multiply" />
      <p className="font-display mt-2 text-2xl leading-tight text-foreground italic">
        Crie sua meta de leitura e acompanhe cada marco!
      </p>
      <Button asChild className="mt-4 rounded-full px-5">
        <Link to="/desafios">
          Saiba mais <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </section>
  );
}
