import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Check, CheckCheck, Heart, MessageCircle, UserCheck, UserPlus, UserRound, Users,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState, PageTitle } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyId } from "@/lib/social";
import { fmtRelative } from "@/lib/format";

type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string;
  type: string;
  post_id: string | null;
  read: boolean;
  created_at: string;
  actor: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  post: { id: string; content: string } | null;
};

function notificationText(item: NotificationRow) {
  const name = item.actor?.display_name || item.actor?.username || "Alguém";
  switch (item.type) {
    case "like": return { title: name, detail: "curtiu sua publicação.", icon: Heart };
    case "comment": return { title: name, detail: "comentou na sua publicação.", icon: MessageCircle };
    case "follow": return { title: name, detail: "começou a seguir você.", icon: UserPlus };
    case "friend_request": return { title: name, detail: "enviou uma solicitação de amizade.", icon: Users };
    case "friend_accepted": return { title: name, detail: "aceitou sua solicitação de amizade.", icon: UserCheck };
    case "message": return { title: name, detail: "enviou uma mensagem.", icon: MessageCircle };
    default: return { title: name, detail: "interagiu com você.", icon: Bell };
  }
}

function NotificationsPage() {
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const me = await getMyId();
      const { data, error } = await supabase
        .from("notifications")
        .select(`
          id, user_id, actor_id, type, post_id, read, created_at,
          post:posts!notifications_post_id_fkey(id, content)
        `)
        .eq("user_id", me)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Omit<NotificationRow, "actor">[];
      const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))];
      const { data: actors, error: actorError } = await supabase.rpc("list_visible_profiles", { _ids: actorIds });
      if (actorError) throw actorError;
      const byId = new Map((actors ?? []).map((actor) => [actor.id, actor]));
      return rows.map((row) => ({ ...row, actor: byId.get(row.actor_id) ?? null })) as NotificationRow[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread"] });
    },
    onError: () => toast.error("Não foi possível atualizar a notificação."),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const me = await getMyId();
      const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", me).eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread"] });
      toast.success("Todas as notificações foram marcadas como lidas.");
    },
    onError: () => toast.error("Não foi possível marcar as notificações como lidas."),
  });

  const friendshipAction = useMutation({
    mutationFn: async ({ notification, accept }: { notification: NotificationRow; accept: boolean }) => {
      const me = await getMyId();
      const { data: request, error: findError } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("requester_id", notification.actor_id)
        .eq("addressee_id", me)
        .eq("status", "pending")
        .maybeSingle();
      if (findError) throw findError;
      if (!request) throw new Error("Esta solicitação já foi respondida ou não está mais disponível.");

      if (accept) {
        const { error } = await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", request.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("friend_requests").delete().eq("id", request.id);
        if (error) throw error;
      }
      const { error: readError } = await supabase.from("notifications").update({ read: true }).eq("id", notification.id);
      if (readError) throw readError;
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.accept ? "Solicitação aceita! Vocês agora são amigos." : "Solicitação recusada.");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread"] });
      queryClient.invalidateQueries({ queryKey: ["friendship"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível responder à solicitação."),
  });

  const rows = notifications.data ?? [];
  const unread = rows.filter((item) => !item.read).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title="Notificações"
          subtitle="Acompanhe amizades, curtidas, comentários e novidades da comunidade."
        />
        {unread > 0 ? (
          <Button
            variant="outline"
            className="mb-1 rounded-full"
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            <CheckCheck className="h-4 w-4" /> Marcar todas como lidas
          </Button>
        ) : null}
      </div>

      {notifications.isLoading ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Carregando notificações...
        </div>
      ) : notifications.isError ? (
        <EmptyState title="Não foi possível carregar as notificações">
          Tente novamente em alguns instantes.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="Você está em dia!" description="Quando alguém curtir, comentar ou enviar um pedido de amizade, a notificação aparecerá aqui.">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
        </EmptyState>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <p className="font-medium text-foreground">Atividades recentes</p>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
              {unread} não lida{unread === 1 ? "" : "s"}
            </span>
          </div>
          <div className="divide-y divide-border">
            {rows.map((item) => {
              const meta = notificationText(item);
              const Icon = meta.icon;
              const isFriendRequest = item.type === "friend_request";
              const actor = item.actor;
              return (
                <article key={item.id} className={`flex gap-3 px-4 py-4 transition-colors sm:px-5 ${item.read ? "bg-card" : "bg-primary/[0.045]"}`}>
                  <div className="relative shrink-0">
                    {actor ? (
                      <Link
                        to="/perfil/$username"
                        params={{ username: actor.username }}
                        onClick={() => !item.read && markRead.mutate(item.id)}
                      >
                        <UserAvatar profile={actor} className="h-11 w-11" />
                      </Link>
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
                        <UserRound className="h-5 w-5" />
                      </div>
                    )}
                    <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-secondary text-primary">
                      <Icon className="h-3 w-3" />
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6 text-foreground">
                      {actor ? (
                        <Link
                          to="/perfil/$username"
                          params={{ username: actor.username }}
                          className="font-semibold hover:text-primary hover:underline"
                          onClick={() => !item.read && markRead.mutate(item.id)}
                        >
                          {meta.title}
                        </Link>
                      ) : <strong>{meta.title}</strong>}
                      {" "}{meta.detail}
                    </p>
                    {item.type === "like" && item.post?.content ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">“{item.post.content}”</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">{fmtRelative(item.created_at)}</p>

                    {isFriendRequest ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="rounded-full"
                          disabled={friendshipAction.isPending}
                          onClick={() => friendshipAction.mutate({ notification: item, accept: true })}
                        >
                          <Check className="h-4 w-4" /> Aceitar amizade
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          disabled={friendshipAction.isPending}
                          onClick={() => friendshipAction.mutate({ notification: item, accept: false })}
                        >
                          Recusar
                        </Button>
                      </div>
                    ) : item.post_id && (item.type === "like" || item.type === "comment") ? (
                      <Button
                        size="sm"
                        variant="link"
                        className="mt-1 h-auto px-0"
                        asChild
                        onClick={() => !item.read && markRead.mutate(item.id)}
                      >
                        <Link to="/publicacao/$postId" params={{ postId: item.post_id }}>
                          Ver publicação
                        </Link>
                      </Button>
                    ) : null}
                  </div>

                  {!item.read ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      aria-label="Marcar como lida"
                      title="Marcar como lida"
                      onClick={() => markRead.mutate(item.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Book Society" }] }),
  component: NotificationsPage,
});
