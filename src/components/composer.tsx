import { BarChart3, BookOpen, ImagePlus, Plus, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { BookCover } from "@/components/book-cover";
import { BookPicker } from "@/components/book-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadMedia } from "@/lib/media";
import { createPost, getMyId, useInvalidate, type Book } from "@/lib/social";
import { cn } from "@/lib/utils";

export function Composer({
  communityId,
  onDone,
  autoFocus,
  className,
}: {
  communityId?: string;
  onDone?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidate();

  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const pollFilled = poll ? poll.filter((o) => o.trim()).length : 0;
  const canPublish =
    !busy && (poll ? content.trim().length > 0 && pollFilled >= 2 : !!(content.trim() || image || book));

  async function publish() {
    setBusy(true);
    try {
      const me = await getMyId();
      const imagePath = image ? await uploadMedia(me, image, communityId ? `communities/${communityId}` : "posts") : null;
      await createPost({
        content: content.trim(),
        imagePath,
        bookId: book?.id ?? null,
        pollOptions: poll ?? [],
        communityId: communityId ?? null,
      });
      setContent("");
      setImage(null);
      setBook(null);
      setPoll(null);
      await invalidate("posts", "books");
      toast.success("Publicado!");
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível publicar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-soft", className)}>
      <Textarea
        autoFocus={autoFocus}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={3000}
        placeholder={poll ? "Faça sua pergunta para a enquete…" : "O que você está lendo ou pensando?"}
        className="min-h-24 resize-y rounded-xl border-border bg-background/60 px-4 py-3 text-base placeholder:text-muted-foreground/80"
      />

      {preview ? (
        <div className="relative mt-3 inline-block">
          <img src={preview} alt="Prévia da foto" className="max-h-64 rounded-xl border border-border object-cover" />
          <button
            type="button"
            onClick={() => setImage(null)}
            className="absolute top-2 right-2 rounded-full bg-foreground/70 p-1 text-background"
            aria-label="Remover foto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {book ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-secondary/70 p-3">
          <BookCover book={book} className="w-10" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{book.title}</p>
            <p className="truncate text-sm text-muted-foreground">{book.author}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setBook(null)} aria-label="Remover livro">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {poll ? (
        <div className="mt-3 space-y-2 rounded-xl bg-secondary/50 p-3">
          {poll.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={opt}
                maxLength={100}
                onChange={(e) => setPoll(poll.map((o, j) => (j === i ? e.target.value : o)))}
                placeholder={`Opção ${i + 1}`}
                className="bg-background"
              />
              {poll.length > 2 ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPoll(poll.filter((_, j) => j !== i))}
                  aria-label="Remover opção"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
          <div className="flex justify-between">
            {poll.length < 6 ? (
              <Button variant="ghost" size="sm" onClick={() => setPoll([...poll, ""])}>
                <Plus className="h-4 w-4" /> Opção
              </Button>
            ) : (
              <span />
            )}
            <Button variant="ghost" size="sm" onClick={() => setPoll(null)}>
              Remover enquete
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            setImage(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <Button variant="ghost" size="sm" className="text-foreground" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-4 w-4 text-primary" /> Adicionar foto
        </Button>
        <Button variant="ghost" size="sm" className="text-foreground" onClick={() => setPickerOpen(true)}>
          <BookOpen className="h-4 w-4 text-primary" /> Marcar livro
        </Button>
        {!poll ? (
          <Button variant="ghost" size="sm" className="text-foreground" onClick={() => setPoll(["", ""])}>
            <BarChart3 className="h-4 w-4 text-primary" /> Enquete
          </Button>
        ) : null}
        <Button onClick={publish} disabled={!canPublish} className="ml-auto h-10 rounded-full px-6 shadow-soft">
          <Send className="h-4 w-4" /> {busy ? "Publicando…" : "Publicar"}
        </Button>
      </div>

      <BookPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={(b) => setBook(b)} title="Marcar um livro" />
    </div>
  );
}
