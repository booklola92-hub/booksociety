import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LockKeyhole, LogOut, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";

import { PageTitle } from "@/components/empty-state";
import { EditAvatarButton } from "@/components/edit-avatar-button";
import { UserAvatar } from "@/components/user-avatar";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyId, useMe } from "@/lib/social";
import { uploadMedia, useMediaUrl } from "@/lib/media";

function SettingsPage() {
  const { data: me, isLoading } = useMe();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [discoverableSaving, setDiscoverableSaving] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [readingGoal, setReadingGoal] = useState("12");
  const [isPrivate, setIsPrivate] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const bannerInput = useRef<HTMLInputElement>(null);
  const bannerPreview = useMediaUrl((me as any)?.banner_url);

  useEffect(() => {
    if (!me) return;
    setName(me.display_name ?? "");
    setUsername(me.username ?? "");
    setBio(me.bio ?? "");
    setBirthDate(me.birth_date ?? "");
    setReadingGoal(String(me.reading_goal ?? 12));
    setIsPrivate(Boolean(me.is_private));
  }, [me]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !username.trim()) {
      toast.error("Preencha seu nome e seu usuário.");
      return;
    }
    const goal = Number(readingGoal);
    if (!Number.isInteger(goal) || goal < 1) {
      toast.error("A meta anual deve ser um número maior que zero.");
      return;
    }
    setSaving(true);
    try {
      const id = await getMyId();
      const { error } = await supabase.from("profiles").update({
        display_name: name.trim(),
        username: username.trim().replace(/^@/, ""),
        bio: bio.trim(),
        birth_date: birthDate || null,
        reading_goal: goal,
        is_private: isPrivate,
      }).eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries();
      toast.success("Perfil salvo com sucesso!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadBanner(file?: File) {
    if (!file) return;
    setBannerSaving(true);
    try {
      const id = await getMyId();
      const path = await uploadMedia(id, file, "banners");
      const { error } = await (supabase as any).from("profiles").update({ banner_url: path }).eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["public-profile"] });
      toast.success("Banner do perfil atualizado!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o banner.");
    } finally { setBannerSaving(false); if (bannerInput.current) bannerInput.current.value = ""; }
  }

  async function toggleDiscoverable(next: boolean) {
    setDiscoverableSaving(true);
    try {
      const id = await getMyId();
      const { error } = await supabase.from("profiles").update({ discoverable: next }).eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(next ? "Agora você aparece na busca de pessoas." : "Você não aparece mais na busca de pessoas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setDiscoverableSaving(false);
    }
  }

  async function resetPassword() {
    setSendingReset(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!data.user?.email) throw new Error("Não encontramos um e-mail associado à sua conta.");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.user.email, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw resetError;
      toast.success("Enviamos um link para redefinir sua senha por e-mail.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o e-mail.");
    } finally {
      setSendingReset(false);
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.clear();
    window.location.href = "/entrar";
  }

  return (
    <div className="space-y-7">
      <PageTitle title="Configurações" subtitle="Gerencie seu perfil, sua privacidade e a segurança da sua conta." />

      <form onSubmit={(event) => void saveProfile(event)} className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center gap-4">
          {me ? <UserAvatar profile={me} className="h-20 w-20" /> : <div className="h-20 w-20 rounded-full bg-muted" />}
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold text-primary">{me?.display_name || me?.username || "Meu perfil"}</h2>
            <p className="text-sm text-muted-foreground">@{me?.username ?? ""}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Banner do perfil</label>
          <div className="overflow-hidden rounded-2xl border border-border bg-muted">
            <div className="h-36 w-full bg-cover bg-center sm:h-44" style={bannerPreview ? { backgroundImage: `url("${bannerPreview}")` } : undefined}>
              {!bannerPreview ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Nenhum banner escolhido</div> : null}
            </div>
            <div className="p-3">
              <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={(e) => void uploadBanner(e.target.files?.[0])} />
              <Button type="button" variant="outline" disabled={bannerSaving} onClick={() => bannerInput.current?.click()}>{bannerSaving ? "Enviando..." : "Escolher banner"}</Button>
              <p className="mt-2 text-xs text-muted-foreground">Escolha uma imagem de até 10 MB. Ela aparecerá no topo do seu perfil.</p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-name" className="text-sm font-medium">Nome</label>
          <input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-username" className="text-sm font-medium">Usuário</label>
          <input id="settings-username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={isLoading} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-bio" className="text-sm font-medium">Biografia</label>
          <textarea id="settings-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} disabled={isLoading} className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Foto de perfil</label>
          <div><EditAvatarButton variant="button" /></div>
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-birthdate" className="text-sm font-medium">Data de nascimento (opcional, privada)</label>
          <input id="settings-birthdate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-goal" className="text-sm font-medium">Meta anual de leitura</label>
          <input id="settings-goal" type="number" min="1" value={readingGoal} onChange={(e) => setReadingGoal(e.target.value)} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <label className="flex cursor-pointer items-center gap-3 py-1 text-sm">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="h-4 w-4 accent-primary" />
          <LockKeyhole className="h-5 w-5 text-primary" />
          <span>Publicações apenas para amigos</span>
        </label>
        <Button type="submit" disabled={saving || isLoading} className="rounded-lg px-7">
          {saving ? "Salvando..." : "Salvar perfil"}
        </Button>
      </form>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <h2 className="flex items-center gap-3 font-display text-2xl font-semibold text-primary"><SettingsIcon className="h-6 w-6" /> Privacidade</h2>
        <p className="mt-2 text-sm text-muted-foreground">Controle como outros leitores encontram sua conta.</p>
        <div className="mt-5 flex items-start justify-between gap-4 rounded-2xl border border-border bg-background p-4">
          <label htmlFor="discoverable" className="min-w-0">
            <span className="block font-semibold text-foreground">Aparecer na busca de pessoas</span>
            <span className="mt-1 block text-sm text-muted-foreground">Quando ligado, outros leitores encontram seu nome, @usuário e foto em Explorar. Seu e-mail e sua biografia nunca aparecem.</span>
          </label>
          <Switch id="discoverable" checked={Boolean(me?.discoverable)} disabled={!me || discoverableSaving} onCheckedChange={(v) => void toggleDiscoverable(v)} />
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <h2 className="flex items-center gap-3 font-display text-2xl font-semibold text-primary"><LockKeyhole className="h-6 w-6" /> Segurança</h2>
        <p className="mt-2 text-muted-foreground">Gerencie o acesso e a senha da sua conta.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" variant="outline" disabled={sendingReset} onClick={() => void resetPassword()}>
            {sendingReset ? "Enviando..." : "Redefinir senha por e-mail"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void signOut()} className="text-primary">
            <LogOut className="mr-2 h-4 w-4" /> Sair da conta
          </Button>
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — The Secret Bookshelf" }] }),
  component: SettingsPage,
});
