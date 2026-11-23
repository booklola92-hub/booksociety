import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/social";

type Contact = { id: string; name: string; handle: string; avatar: string | null };
type ChatMessage = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string; read_at: string | null };

const stamp = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function MessengerPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [phrase, setPhrase] = useState("perdida em um bom livro ♡");
  useEffect(() => { const saved = window.localStorage.getItem("book-messenger-phrase"); if (saved) { setPhrase(saved); setDraftPhrase(saved); } }, []);
  const [editingPhrase, setEditingPhrase] = useState(false);
  const [draftPhrase, setDraftPhrase] = useState(phrase);
  const [draft, setDraft] = useState("");

  const contactsQuery = useQuery({
    queryKey: ["messages", "contacts", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const [following, followers, friendships] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", me!.id),
        supabase.from("follows").select("follower_id").eq("following_id", me!.id),
        supabase.from("friend_requests").select("requester_id, addressee_id").eq("status", "accepted")
          .or(`requester_id.eq.${me!.id},addressee_id.eq.${me!.id}`),
      ]);
      if (following.error) throw following.error;
      if (followers.error) throw followers.error;
      if (friendships.error) throw friendships.error;
      const friendIds = (friendships.data ?? []).map((r) => r.requester_id === me!.id ? r.addressee_id : r.requester_id);
      const ids = [...new Set([...(following.data ?? []).map((r) => r.following_id), ...(followers.data ?? []).map((r) => r.follower_id), ...friendIds])];
      if (!ids.length) return [] as Contact[];
      const { data, error } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids).order("display_name");
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, name: p.display_name || p.username, handle: "@" + p.username, avatar: p.avatar_url }));
    },
  });

  const contacts = contactsQuery.data ?? [];
  useEffect(() => {
    if (!selected && contacts.length) setSelected(contacts[0].id);
    if (selected && contacts.length && !contacts.some((c) => c.id === selected)) setSelected(contacts[0].id);
  }, [contacts, selected]);

  const messagesQuery = useQuery({
    queryKey: ["messages", "conversation", me?.id, selected],
    enabled: !!me?.id && !!selected,
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("id, sender_id, recipient_id, content, created_at, read_at")
        .or(`and(sender_id.eq.${me!.id},recipient_id.eq.${selected}),and(sender_id.eq.${selected},recipient_id.eq.${me!.id})`)
        .order("created_at", { ascending: true }).limit(200);
      if (error) throw error;
      const rows = (data ?? []) as ChatMessage[];
      const unread = rows.filter((m) => m.recipient_id === me!.id && !m.read_at).map((m) => m.id);
      if (unread.length) {
        const { error: readError } = await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread);
        if (readError) console.error("Não foi possível marcar mensagens como lidas:", readError);
      }
      return rows;
    },
  });

  useEffect(() => {
    if (!me?.id) return;
    const channel = supabase.channel("book-messenger-" + me.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const row = (payload.new ?? payload.old) as Partial<ChatMessage>;
        if (row.sender_id === me.id || row.recipient_id === me.id) {
          qc.invalidateQueries({ queryKey: ["messages"] });
          qc.invalidateQueries({ queryKey: ["unread"] });
        }
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [me?.id, qc]);

  const contact = contacts.find((c) => c.id === selected);
  const messages = messagesQuery.data ?? [];
  const onlineCount = 0;

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !me?.id || !selected) return;
    setDraft("");
    const { error } = await supabase.from("messages").insert({ sender_id: me.id, recipient_id: selected, content: text });
    if (error) {
      setDraft(text);
      console.error("Erro ao enviar mensagem:", error);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["messages", "conversation", me.id, selected] });
  }

  function savePhrase() {
    setPhrase(draftPhrase);
    window.localStorage.setItem("book-messenger-phrase", draftPhrase);
    setEditingPhrase(false);
  }

  const displayName = me?.display_name || me?.username || "Leitora";

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9b6b65]">Book Society • conexão</p><h1 className="mt-1 font-serif text-3xl text-[#512b35]">Mensagens</h1><p className="mt-1 text-sm text-muted-foreground">Um cantinho para conversar entre capítulos.</p></div>
        <div className="rounded-full border border-[#e7d7ce] bg-[#fbf6ef] px-4 py-2 text-xs text-[#71464a]">✦ {contacts.length} contatos</div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-[#d9c4b8] bg-[#fffaf4] shadow-[0_14px_45px_-28px_rgba(81,43,53,.45)]">
        <div className="flex items-center justify-between border-b border-[#d9c4b8] bg-gradient-to-r from-[#713e4a] to-[#9b6870] px-4 py-3 text-white">
          <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-xl">✉</div><div><p className="font-serif text-lg leading-tight">Book Messenger</p><p className="text-[10px] tracking-[0.18em] text-white/75">SEU CLUBE DE LEITURA, SEM SAIR DO CHAT</p></div></div>
          <span className="rounded-md border border-white/25 px-2 py-1 text-[10px]">● conectado</span>
        </div>

        <div className="grid min-h-[570px] md:grid-cols-[260px_1fr]">
          <aside className="border-b border-[#eadbd2] bg-[#f7eee6] md:border-b-0 md:border-r">
            <div className="p-4">
              <div className="flex items-center gap-3">
                {me?.avatar_url ? <img src={me.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-white" /> : <div className="grid h-11 w-11 place-items-center rounded-full border-2 border-white bg-[#d8b8aa] font-serif text-lg text-[#512b35]">{displayName.slice(0,1).toUpperCase()}</div>}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#512b35]">{displayName}</p><p className="text-xs text-emerald-700">● disponível</p></div>
              </div>
              <div className="mt-3 rounded-lg border border-[#e7d5ca] bg-white/70 p-2">
                {editingPhrase ? <div className="flex gap-1"><input autoFocus value={draftPhrase} onChange={(e) => setDraftPhrase(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePhrase()} className="min-w-0 flex-1 bg-transparent text-xs text-[#71464a] outline-none" /><button onClick={savePhrase} className="text-xs font-semibold text-[#8b4f5a]">OK</button></div> : <button onClick={() => { setDraftPhrase(phrase); setEditingPhrase(true); }} className="w-full text-left text-xs text-[#8b6866]">“{phrase}” <span className="float-right">✎</span></button>}
              </div>
            </div>
            <div className="flex items-center justify-between border-y border-[#eadbd2] px-4 py-2"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#956d68]">Meus contatos</span><span className="text-xs text-[#956d68]">{contacts.length}</span></div>
            <div className="p-2">
              {contactsQuery.isLoading && <p className="p-4 text-xs text-[#9a7772]">Carregando contatos…</p>}
              {contactsQuery.isError && <p className="p-4 text-xs text-rose-700">Não foi possível carregar seus contatos.</p>}
              {!contactsQuery.isLoading && !contacts.length && <p className="p-4 text-xs leading-relaxed text-[#9a7772]">Seus contatos aparecerão aqui quando você seguir alguém, receber seguidores ou aceitar uma amizade.</p>}
              {contacts.map((c) => <button key={c.id} onClick={() => setSelected(c.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected === c.id ? "bg-[#ead8d0] shadow-inner" : "hover:bg-white/70"}`}>
                {c.avatar ? <img src={c.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d9c0b4] font-serif text-[#623b42]">{c.name.slice(0,1).toUpperCase()}</div>}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[#573640]">{c.name}</span><span className="block truncate text-xs text-[#9a7772]">{c.handle}</span></span>
              </button>)}
            </div>
          </aside>

          <div className="flex min-h-[570px] flex-col bg-[#fffaf4]">
            {contact ? <>
              <div className="flex items-center justify-between border-b border-[#eadbd2] bg-white/60 px-5 py-4">
                <div className="flex items-center gap-3">{contact.avatar ? <img src={contact.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="grid h-10 w-10 place-items-center rounded-full bg-[#e4cec3] font-serif text-[#623b42]">{contact.name.slice(0,1).toUpperCase()}</div>}<div><p className="font-serif text-lg text-[#512b35]">{contact.name}</p><p className="text-xs text-[#9a7772]">{contact.handle}</p></div></div>
                <span className="text-xl text-[#a47c75]">♡</span>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="mx-auto w-fit rounded-full bg-[#f4e9e1] px-3 py-1 text-[10px] text-[#a17d76]">✦ conversa ✦</div>
                {messagesQuery.isLoading && <p className="py-10 text-center text-sm text-[#b0958c]">Carregando mensagens…</p>}
                {messages.map((m) => { const mine = m.sender_id === me?.id; return <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${mine ? "rounded-br-sm bg-[#754653] text-white" : "rounded-bl-sm border border-[#eadbd2] bg-white text-[#60434a]"}`}><p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p><p className={`mt-1 text-right text-[9px] ${mine ? "text-white/60" : "text-[#b29a91]"}`}>{stamp(m.created_at)}{mine && m.read_at ? " · lida" : ""}</p></div></div>; })}
                {!messagesQuery.isLoading && !messages.length && <p className="py-12 text-center text-sm text-[#b0958c]">Diga oi e comece uma conversa ♡</p>}
              </div>
              <div className="border-t border-[#eadbd2] bg-white/70 p-4">
                <div className="flex items-center gap-2 rounded-xl border border-[#dec9be] bg-white p-2 focus-within:border-[#a8797b]"><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Escreva uma mensagem..." className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[#573640] outline-none placeholder:text-[#b9a39b]" /><button onClick={sendMessage} disabled={!draft.trim()} className="rounded-lg bg-[#754653] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5b3440] disabled:opacity-50">Enviar ↗</button></div>
                <p className="mt-2 text-center text-[10px] text-[#b49a90]">conversas, livros e boas companhias ♡</p>
              </div>
            </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><p className="font-serif text-xl text-[#754653]">Seu cantinho de conversas</p><p className="mt-2 max-w-sm text-sm text-[#a17d76]">Adicione amigos ou conecte-se com leitores para começar a trocar mensagens por aqui. ♡</p></div></div>}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Mensagens salvas na sua conta · atualização em tempo real quando o Supabase Realtime estiver habilitado.</p>
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens — Book Society" }] }),
  component: MessengerPage,
});
