import { Link } from "@tanstack/react-router";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Pencil, Share2, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BookCover } from "@/components/book-cover";
import { UserAvatar } from "@/components/user-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { fmtPostDate, fmtRelative } from "@/lib/format";
import { useMediaUrl } from "@/lib/media";
import {
  getMyId,
  toggleLike,
  toggleSave,
  useComments,
  useInvalidate,
  useMe,
  votePoll,
  type PostView,
} from "@/lib/social";
import { cn } from "@/lib/utils";

export function PostCard({ post, defaultShowComments = false }: { post: PostView; defaultShowComments?: boolean }) {
  const { data: me } = useMe();
  const invalidate = useInvalidate();
  const [showComments, setShowComments] = useState(defaultShowComments);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const imageUrl = useMediaUrl(post.image_url);
  const isMine = me?.id === post.author.id;

  async function run(fn: () => Promise<void>, keys: string[] = ["posts"]) {
    try {
      await fn();
      await invalidate(...keys);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Algo deu errado.");
    }
  }

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <header className="flex items-start gap-3">
        <Link to="/perfil/$username" params={{ username: post.author.username }}>
          <UserAvatar profile={post.author} className="h-11 w-11" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to="/perfil/$username"
            params={{ username: post.author.username }}
            className="font-semibold text-primary hover:underline"
          >
            {post.author.display_name || post.author.username}
          </Link>
          <p className="text-xs text-muted-foreground">
            <Link to="/publicacao/$postId" params={{ postId: post.id }} className="hover:underline">
              {fmtPostDate(post.created_at)}
            </Link>
            {post.edited ? " • editado" : ""}
          </p>
          {post.community ? (
            <Link
              to="/c/$slug"
              params={{ slug: post.community.slug }}
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary/80 hover:underline"
            >
              <Users className="h-3 w-3" /> {post.community.name}
            </Link>
          ) : null}
        </div>
        {isMine ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Opções da publicação">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      {post.content ? <p className="mt-3 whitespace-pre-wrap break-words text-[0.95rem]">{post.content}</p> : null}

      {imageUrl ? (
        <img src={imageUrl} alt="Foto da publicação" className="mt-3 max-h-[480px] w-full rounded-xl object-cover" />
      ) : null}

      {post.book ? (
        <div className="mt-3 flex items-center gap-4 rounded-xl bg-secondary/70 p-3">
          <BookCover book={post.book} className="w-12" />
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight font-semibold">{post.book.title}</p>
            <p className="text-sm text-muted-foreground">{post.book.author}</p>
          </div>
        </div>
      ) : null}

      {post.poll ? (
        <div className="mt-3 space-y-2 rounded-xl bg-secondary/50 p-3">
          {post.poll.options.map((o) => {
            const pct = post.poll!.total ? Math.round((o.votes * 100) / post.poll!.total) : 0;
            const mine = post.poll!.myOptionId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => run(() => votePoll(post.id, o.id))}
                className={cn(
                  "relative flex w-full items-center justify-between overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  mine ? "border-primary" : "border-transparent hover:border-border",
                )}
              >
                <span
                  className="absolute inset-y-0 left-0 bg-primary/20 transition-all"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <span className="relative font-medium">
                  {o.label}
                  {mine ? " ✓" : ""}
                </span>
                <span className="relative text-muted-foreground">{pct}%</span>
              </button>
            );
          })}
          <p className="text-xs text-muted-foreground">
            {post.poll.total} voto{post.poll.total === 1 ? "" : "s"} • toque para votar
          </p>
        </div>
      ) : null}

      <footer className="mt-4 flex items-center gap-1 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={post.likedByMe}
          onClick={() => run(() => toggleLike(post.id, post.likedByMe))}
        >
          <Heart className={cn("h-4 w-4", post.likedByMe && "fill-primary text-primary")} /> {post.likeCount}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowComments((s) => !s)}>
          <MessageCircle className="h-4 w-4" /> {post.commentCount}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const url = `${window.location.origin}/publicacao/${post.id}`;
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Link copiado!");
              } catch {
                toast.message(url);
              }
            }}
          >
            <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">Compartilhar</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={post.savedByMe}
            onClick={() => run(() => toggleSave(post.id, post.savedByMe))}
          >
            <Bookmark className={cn("h-4 w-4", post.savedByMe && "fill-primary text-primary")} />
            <span className="hidden sm:inline">{post.savedByMe ? "Salvo" : "Salvar"}</span>
          </Button>
        </div>
      </footer>

      {showComments ? <Comments postId={post.id} /> : null}

      <EditPostDialog post={post} open={editing} onOpenChange={setEditing} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir publicação?</AlertDialogTitle>
            <AlertDialogDescription>Ela some para todos, junto com curtidas e comentários.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                run(async () => {
                  const { error } = await supabase.from("posts").delete().eq("id", post.id);
                  if (error) throw error;
                  toast.success("Publicação excluída.");
                })
              }
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

function EditPostDialog({
  post,
  open,
  onOpenChange,
}: {
  post: PostView;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [content, setContent] = useState(post.content);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">Editar publicação</DialogTitle>
        </DialogHeader>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={3000} className="min-h-32" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const { error } = await supabase.from("posts").update({ content: content.trim() }).eq("id", post.id);
              setBusy(false);
              if (error) return toast.error(error.message);
              await invalidate("posts");
              onOpenChange(false);
            }}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Comments({ postId }: { postId: string }) {
  const { data: comments = [], isLoading } = useComments(postId, true);
  const { data: me } = useMe();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando comentários…</p> : null}
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2">
          <Link to="/perfil/$username" params={{ username: c.author.username }}>
            <UserAvatar profile={c.author} className="h-8 w-8" />
          </Link>
          <div className="min-w-0 flex-1 rounded-xl bg-secondary/60 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-primary">{c.author.display_name || c.author.username}</span>
              <span className="text-xs text-muted-foreground">{fmtRelative(c.created_at)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{c.content}</p>
            {me?.id === c.author.id ? (
              <button
                type="button"
                className="mt-1 text-xs text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  const { error } = await supabase.from("comments").delete().eq("id", c.id);
                  if (error) return toast.error(error.message);
                  await invalidate("comments", "posts");
                }}
              >
                Excluir
              </button>
            ) : null}
          </div>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          try {
            const uid = await getMyId();
            const { error } = await supabase
              .from("comments")
              .insert({ post_id: postId, user_id: uid, content: text.trim() });
            if (error) throw error;
            setText("");
            await invalidate("comments", "posts");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Não foi possível comentar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Escreva um comentário…"
          className="rounded-full bg-background"
        />
        <Button type="submit" disabled={busy || !text.trim()} className="rounded-full">
          Enviar
        </Button>
      </form>
    </div>
  );
}
