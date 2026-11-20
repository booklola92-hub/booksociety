import { Link } from "@tanstack/react-router";
import {
  Bell,
  Bookmark,
  Compass,
  Home,
  Images,
  Library,
  LogOut,
  Mail,
  NotebookPen,
  Settings,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { useSignOut } from "@/lib/auth";
import { useMe, useUnreadCounts } from "@/lib/social";

const linkClass =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.95rem] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent";
const activeClass = "bg-primary text-primary-foreground shadow-soft hover:bg-primary";

function NavItem({ icon: Icon, label, badge, children }: { icon: LucideIcon; label: string; badge?: number | undefined; children?: ReactNode }) {
  return (
    <>
      <Icon className="h-5 w-5 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="rounded-full bg-destructive px-1.5 text-xs leading-5 font-semibold text-destructive-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      {children}
    </>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data: me } = useMe();
  const { data: unread } = useUnreadCounts();
  const signOut = useSignOut();
  const props = { className: linkClass, activeProps: { className: activeClass }, onClick: onNavigate };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-5">
      <Link to="/inicio" className="block text-center" onClick={onNavigate}>
        <img src={booksTeacup.url} alt="" className="mx-auto h-24 w-auto mix-blend-multiply" />
        <span className="font-display block text-3xl leading-none font-semibold text-primary">
          Book Society
          <br />
          Bookshelf
        </span>
        <span className="mt-2 block text-xs tracking-wide text-muted-foreground">Leia • Conecte • Compartilhe</span>
      </Link>

      <nav className="mt-6 space-y-1" aria-label="Menu principal">
        <Link to="/inicio" {...props}>
          <NavItem icon={Home} label="Início" />
        </Link>
        <Link to="/explorar" {...props}>
          <NavItem icon={Compass} label="Explorar" />
        </Link>
        <Link to="/biblioteca" {...props}>
          <NavItem icon={Library} label="Biblioteca" />
        </Link>
        <Link to="/comunidade" {...props}>
          <NavItem icon={Users} label="Comunidade" />
        </Link>
        <Link to="/galeria" {...props}>
          <NavItem icon={Images} label="Galeria" />
        </Link>
        <Link to="/desafios" {...props}>
          <NavItem icon={Trophy} label="Desafios" />
        </Link>
        <Link to="/resenhas" {...props}>
          <NavItem icon={NotebookPen} label="Resenhas" />
        </Link>
        <Link to="/notificacoes" {...props}>
          <NavItem icon={Bell} label="Notificações" badge={unread?.notifications} />
        </Link>
        <Link to="/mensagens" {...props}>
          <NavItem icon={Mail} label="Mensagens" badge={unread?.messages} />
        </Link>
        {me ? (
          <Link to="/perfil/$username" params={{ username: me.username }} {...props}>
            <NavItem icon={User} label="Perfil" />
          </Link>
        ) : null}
      </nav>

      <div className="mt-4 space-y-1 border-t border-sidebar-border pt-4">
        <Link to="/salvos" {...props}>
          <NavItem icon={Bookmark} label="Salvos" />
        </Link>
        <Link to="/configuracoes" {...props}>
          <NavItem icon={Settings} label="Configurações" />
        </Link>
        <button type="button" onClick={signOut} className={`${linkClass} w-full`}>
          <NavItem icon={LogOut} label="Sair" />
        </button>
      </div>

      <p className="font-display mt-auto pt-6 text-center text-base text-muted-foreground italic">
        “Grandes histórias começam com pessoas que compartilham.”
      </p>
    </div>
  );
}
