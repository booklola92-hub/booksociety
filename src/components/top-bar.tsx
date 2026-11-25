import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, BookOpen, Camera, Menu, Search, Star, Trophy, Users } from "lucide-react";
import { useState } from "react";

import { SidebarContent } from "@/components/app-sidebar";
import { Composer } from "@/components/composer";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSignOut } from "@/lib/auth";
import { useMe, useUnreadCounts } from "@/lib/social";

function CountDot({ n }: { n: number | undefined }) {
  if (!n) return null;
  return <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] leading-4 font-semibold text-white">{n > 9 ? "9+" : n}</span>;
}

export function TopBar() {
  const { data: me } = useMe();
  const { data: unread } = useUnreadCounts();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-rose-200/70 bg-[#fff9f6]/95 backdrop-blur">
      <div className="mx-auto flex min-h-[86px] max-w-[1920px] items-center gap-3 px-4 py-3 lg:px-6 xl:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu className="h-5 w-5" /></Button>
        <Link to="/inicio" className="flex shrink-0 items-center"><img src="/book-society-logo.svg" alt="Book Society" className="h-12 w-auto sm:h-14" /></Link>
        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex" aria-label="Navegação principal">
          <Link to="/inicio" className="flex items-center gap-2 whitespace-nowrap rounded-xl px-2 py-3 text-sm font-semibold text-rose-800 hover:bg-rose-100"><BookOpen className="h-4 w-4" />Início</Link>
          <Link to="/biblioteca" className="flex items-center gap-2 whitespace-nowrap rounded-xl px-2 py-3 text-sm text-rose-950 hover:bg-rose-100"><BookOpen className="h-4 w-4" />Biblioteca</Link>
          <Link to="/desafios" className="flex items-center gap-2 whitespace-nowrap rounded-xl px-2 py-3 text-sm text-rose-950 hover:bg-rose-100"><Star className="h-4 w-4" />Desafios</Link>
          <Link to="/desafios" className="flex items-center gap-2 whitespace-nowrap rounded-xl px-2 py-3 text-sm text-rose-950 hover:bg-rose-100"><Trophy className="h-4 w-4" />Conquistas</Link>
          <Link to="/galeria" className="flex items-center gap-2 whitespace-nowrap rounded-xl px-2 py-3 text-sm text-rose-950 hover:bg-rose-100"><Camera className="h-4 w-4" />Fotos</Link>
          <Link to="/comunidade" className="flex items-center gap-2 whitespace-nowrap rounded-xl px-2 py-3 text-sm text-rose-950 hover:bg-rose-100"><Users className="h-4 w-4" />Grupos</Link>
        </nav>
        <form className="relative hidden w-full max-w-[280px] shrink lg:block" onSubmit={(e) => { e.preventDefault(); navigate({ to: "/explorar", search: q.trim() ? { q: q.trim() } : {} }); }}>
          <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-rose-900" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no Book Society..." className="h-11 rounded-full border-rose-200 bg-rose-50/80 pl-11 shadow-none placeholder:text-rose-800/60" />
        </form>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" asChild className="relative text-rose-900"><Link to="/notificacoes" aria-label="Notificações"><Bell className="h-5 w-5" /><CountDot n={unread?.notifications} /></Link></Button>
          {me ? <DropdownMenu><DropdownMenuTrigger className="ml-1 rounded-full" aria-label="Sua conta"><UserAvatar profile={me} className="h-11 w-11" /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem asChild><Link to="/perfil/$username" params={{ username: me.username }}>Meu perfil</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/configuracoes">Configurações</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={signOut}>Sair</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}
        </div>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}><SheetContent side="left" className="w-72 bg-sidebar p-0"><SheetTitle className="sr-only">Menu</SheetTitle><SidebarContent onNavigate={() => setMenuOpen(false)} /></SheetContent></Sheet>
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle className="font-display text-2xl text-primary">Criar publicação</DialogTitle></DialogHeader><Composer autoFocus onDone={() => setComposeOpen(false)} className="border-0 p-0 shadow-none" /></DialogContent></Dialog>
    </header>
  );
}
