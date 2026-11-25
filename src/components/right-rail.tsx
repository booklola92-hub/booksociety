import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, BookOpen, Crown, Flame, Heart, Medal, Star, Trophy, Users } from "lucide-react";

import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSuggestedReaders } from "@/lib/social";

type Achievement = { id: string; title: string; description: string; achievement_key: string };
type Challenge = { id: string; title: string; description: string; goal_books: number; end_date: string };

const badgeIcons = [BookOpen, Star, Crown, Award, Heart, Medal];

export function RightRail() {
  const { data: me } = useMe();
  const readers = useSuggestedReaders(3);
  const achievements = useQuery({
    queryKey: ["home-achievements", me?.id],
    enabled: Boolean(me?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("profile_achievements")
        .select("id, achievement_key, title, description, unlocked_at")
        .eq("user_id", me!.id).order("unlocked_at", { ascending: false }).limit(6);
      if (error) throw error;
      return (data ?? []) as Achievement[];
    },
  });
  const challenges = useQuery({
    queryKey: ["home-reading-challenges"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("reading_challenges")
        .select("id, title, description, goal_books, end_date")
        .gte("end_date", new Date().toISOString().slice(0, 10))
        .order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      return (data ?? []) as Challenge[];
    },
  });
  const shelf = useQuery({
    queryKey: ["home-read-count", me?.id],
    enabled: Boolean(me?.id),
    queryFn: async () => {
      const { count, error } = await supabase.from("shelf_items").select("*", { count: "exact", head: true })
        .eq("user_id", me!.id).eq("status", "read");
      if (error) throw error;
      return count ?? 0;
    },
  });
  const challenge = challenges.data?.[0];
  const progress = challenge ? Math.min(100, Math.round(((shelf.data ?? 0) / Math.max(1, challenge.goal_books)) * 100)) : 0;

  return (
    <aside className="space-y-4">
      <div className="space-y-4">
        <section className="rounded-[17px] border border-[#f3d9d1] bg-gradient-to-br from-[#fff8f5] to-[#fde9e4] p-4">
          <div className="mb-4 flex items-center justify-between gap-2 border-b border-[#efd9d1] pb-3">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-[#3f201d]"><Trophy className="h-5 w-5 text-amber-500"/> Minhas Conquistas</h2>
            <Link to="/desafios" className="whitespace-nowrap text-xs font-medium text-[#c94e6a]">Ver todas →</Link>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-4">
            {(achievements.data ?? []).slice(0,6).map((badge, index) => {
              const Icon = badgeIcons[index % badgeIcons.length];
              return <div key={badge.id} className="flex min-w-0 flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#e7a0a6] bg-gradient-to-br from-[#ffe2e2] to-[#f6a9b1] text-[#9c293b] shadow-inner"><Icon className="h-7 w-7"/></div>
                <span className="mt-1.5 line-clamp-2 text-[11px] leading-tight text-[#49231f]">{badge.title}</span>
              </div>;
            })}
            {(!achievements.data || achievements.data.length === 0) && <p className="col-span-3 py-3 text-center text-xs leading-relaxed text-[#956e66]">Suas medalhas de leitura aparecerão aqui conforme você desbloquear conquistas.</p>}
          </div>
        </section>

        <section className="rounded-[17px] border border-[#e8e2c3] bg-gradient-to-br from-[#f7f4df] to-[#eee9c9] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-[#3f321b]"><Medal className="h-5 w-5 text-[#81944c]"/> Meus Desafios</h2>
            <Link to="/desafios" className="whitespace-nowrap text-xs font-medium text-[#47744b]">Ver todos →</Link>
          </div>
          {challenge ? <div className="flex items-center gap-3">
            <div className="relative grid h-[94px] w-[94px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#668d4f ${progress}%, #dedbbd ${progress}% 100%)` }}>
              <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[#f5f1d8] font-display text-2xl font-bold text-[#2d321f]">{progress}%</div>
            </div>
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold leading-snug text-[#352a1c]">{challenge.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[#665b40]">{challenge.description || `Leia ${challenge.goal_books} livros no desafio!`}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ddd9b8]"><div className="h-full rounded-full bg-[#829b50]" style={{ width: `${progress}%` }}/></div>
              <p className="mt-1 text-[11px] text-[#4b4630]">{shelf.data ?? 0} / {challenge.goal_books} livros</p>
            </div>
          </div> : <div className="py-2 text-center"><p className="text-xs text-[#665b40]">Crie ou participe de um desafio literário.</p><Button asChild size="sm" className="mt-2 rounded-full bg-[#6f8c48] text-white hover:bg-[#5c7839]"><Link to="/desafios">Ver desafios</Link></Button></div>}
        </section>
      </div>

      <section className="rounded-[20px] border border-[#f0d8d0] bg-[#fff8f5] p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-display text-base font-semibold text-[#49231f]"><Users className="h-5 w-5 text-[#d85c76]"/> Leitoras em alta</h2><Link to="/comunidade" search={{ aba: "leitores" }} className="text-xs font-medium text-[#c94e6a]">Ver todas →</Link></div>
        {readers.isLoading ? <p className="text-xs text-muted-foreground">Buscando leitoras...</p> : readers.data?.length ? <ul className="space-y-3">{readers.data.map((person) => <li key={person.id} className="flex items-center gap-2.5"><UserAvatar profile={person} className="h-10 w-10"/><div className="min-w-0 flex-1"><Link to="/perfil/$username" params={{username:person.username}} className="block truncate text-xs font-semibold text-[#49231f] hover:underline">{person.display_name || person.username}</Link><span className="text-[10px] text-[#9b766c]">@{person.username}</span></div><Link to="/perfil/$username" params={{username:person.username}} className="rounded-full bg-[#dc5d78] px-3 py-1.5 text-[10px] font-semibold text-white">Ver</Link></li>)}</ul> : <p className="text-xs text-[#956e66]">Novas leitoras aparecerão aqui em breve.</p>}
      </section>
    </aside>
  );
}
