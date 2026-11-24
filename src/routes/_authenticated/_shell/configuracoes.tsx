import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageTitle } from "@/components/empty-state";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { getMyId, useMe } from "@/lib/social";

function SettingsPage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  async function toggleDiscoverable(next: boolean) {
    setSaving(true);
    try {
      const id = await getMyId();
      const { error } = await supabase.from("profiles").update({ discoverable: next }).eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(next ? "Agora você aparece na busca de pessoas." : "Você não aparece mais na busca de pessoas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-7">
      <PageTitle title="Configurações" subtitle="Escolha como outros leitores podem encontrar você." />
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <h2 className="font-display text-2xl font-semibold text-primary">Privacidade</h2>
        <div className="mt-5 flex items-start justify-between gap-4 rounded-2xl border border-border bg-background p-4">
          <label htmlFor="discoverable" className="min-w-0">
            <span className="block font-semibold text-foreground">Aparecer na busca de pessoas</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Quando ligado, outros leitores encontram seu nome, @usuário e foto em Explorar. Seu e-mail e sua biografia nunca aparecem.
            </span>
          </label>
          <Switch
            id="discoverable"
            checked={Boolean(me?.discoverable)}
            disabled={!me || saving}
            onCheckedChange={(v) => void toggleDiscoverable(v)}
          />
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — The Secret Bookshelf" }] }),
  component: SettingsPage,
});
