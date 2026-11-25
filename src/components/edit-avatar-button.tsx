import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { getMyId } from "@/lib/social";
import { cn } from "@/lib/utils";

/** Lets the signed-in reader choose a new profile photo and refreshes it across the site. */
export function EditAvatarButton({ variant = "icon", className }: { variant?: "icon" | "button"; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const id = await getMyId();
      const path = await uploadMedia(id, file, "avatars");
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries();
      toast.success("Foto de perfil atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível trocar a foto.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      {variant === "icon" ? (
        <button
          type="button"
          aria-label="Editar foto"
          title="Editar foto"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={cn("grid h-10 w-10 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md transition hover:opacity-90 disabled:opacity-60", className)}
        >
          <Camera className="h-5 w-5" />
        </button>
      ) : (
        <Button type="button" variant="outline" className={cn("rounded-full", className)} disabled={busy} onClick={() => input.current?.click()}>
          <Camera className="mr-2 h-4 w-4" />
          {busy ? "Enviando..." : "Editar foto"}
        </Button>
      )}
    </>
  );
}
