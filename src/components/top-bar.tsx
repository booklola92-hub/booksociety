import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Mail, Menu, Plus, Search } from "lucide-react";
import { useState } from "react";

import { SidebarContent } from "@/components/app-sidebar";
import { Composer } from "@/components/composer";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSignOut } from "@/lib/auth";
import { useMe, useUnreadCounts } from "@/lib/social";

function CountDot({ n }: { n: number | undefined }) {
  if (!n) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 font-semibold text-destructive-foreground">
      {n > 9 ? "9+" : n}
    </span>
  );
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
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 lg:gap-4 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>
        <form
          className="relative max-w-lg flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/explorar", search: q.trim() ? { q: q.trim() } : {} });
          }}
        >
          <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar livros, pessoas, comunidades…"
            className="h-11 rounded-full border-border bg-card pl-11 shadow-soft"
          />
        </form>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild className="relative">
            <Link to="/notificacoes" aria-label="Notificações">
              <Bell className="h-5 w-5" />
              <CountDot n={unread?.notifications} />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild className="relative">
            <Link to="/mensagens" aria-label="Mensagens">
              <Mail className="h-5 w-5" />
              <CountDot n={unread?.messages} />
            </Link>
          </Button>
          <Button onClick={() => setComposeOpen(true)} className="ml-1 h-10 rounded-full px-4 shadow-soft">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Criar publicação</span>
          </Button>
          {me ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-2 rounded-full" aria-label="Sua conta">
                <UserAvatar profile={me} className="h-10 w-10" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/perfil/$username" params={{ username: me.username }}>
                    Meu perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/configuracoes">Configurações</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarContent onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-primary">Criar publicação</DialogTitle>
          </DialogHeader>
          <Composer autoFocus onDone={() => setComposeOpen(false)} className="border-0 p-0 shadow-none" />
        </DialogContent>
      </Dialog>
    </header>
  );
}
