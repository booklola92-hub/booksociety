import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/social";

type Contact = { id: string; name: string; handle: string; avatar: string | null };
type ChatMessage = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string; read_at: string | null };

const stamp = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const emojis = ["😀", "😂", "😍", "🥰", "😘", "😉", "😮", "😎", "🥳", "❤️", "💋", "📚", "✨", "🙈"];
const winks = [
  { label: "Porquinho dançante", icon: "🐷", message: "🐷 [WINK] Porquinho dançante!" },
  { label: "Coração", icon: "💗", message: "💗 [WINK] Um coração para você!" },
  { label: "Beijo", icon: "💋", message: "💋 [WINK] Um beijo!" },
  { label: "Dança", icon: "💃", message: "💃 [WINK] Vamos dançar!" },
  { label: "Gargalhada", icon: "🤣", message: "🤣 [WINK] Caindo de rir!" },
  { label: "Surpresa", icon: "😲", message: "😲 [WINK] Surpresa!" },
  { label: "Arco-íris", icon: "🌈", message: "🌈 [WINK] Um arco-íris para alegrar seu dia!" },
];

function MessengerPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [phrase, setPhrase] = useState("perdida em um bom livro ♡");
  const [draftPhrase, setDraftPhrase] = useState(phrase);
  const [editingPhrase, setEditingPhrase] = useState(false);
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [winksOpen, setWinksOpen] = useState(false);
  const [attention, setAttention] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("book-messenger-phrase");
    if (saved) { setPhrase(saved); setDraftPhrase(saved); }
  }, []);

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
  const displayName = me?.display_name || me?.username || "Leitora";
  const myAvatar = me?.avatar_url || null;

  async function sendContent(value: string) {
    if (!value.trim() || !me?.id || !selected) return;
    const { error } = await supabase.from("messages").insert({ sender_id: me.id, recipient_id: selected, content: value });
    if (error) { console.error("Erro ao enviar mensagem:", error); return; }
    await qc.invalidateQueries({ queryKey: ["messages", "conversation", me.id, selected] });
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await sendContent(text);
  }

  function savePhrase() {
    setPhrase(draftPhrase);
    window.localStorage.setItem("book-messenger-phrase", draftPhrase);
    setEditingPhrase(false);
  }

  async function callAttention() {
    if (!selected) return;
    setAttention(true);
    window.setTimeout(() => setAttention(false), 1100);
    await sendContent("📣 [NUDGE] chamou sua atenção!");
  }

  const avatar = (url: string | null, name: string, size = "h-10 w-10") => url
    ? <img src={url} alt={name} className={`${size} shrink-0 rounded-full border-2 border-[#7b2635]/25 object-cover`} />
    : <div className={`${size} grid shrink-0 place-items-center rounded-full border-2 border-[#7b2635]/20 bg-[#ead9c8] font-semibold text-[#b3262e]`}>{name.slice(0, 1).toUpperCase()}</div>;

  return (
    <section className="mx-auto max-w-[1500px] space-y-4 text-[#b3262e]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#9b6b55]">Book Society</p><h1 className="text-3xl font-semibold text-[#b3262e]">Mensagens</h1></div>
        <span className="rounded-full border border-[#d9c6ae] bg-[#fffaf1] px-4 py-2 text-xs font-medium text-[#7b2635]">● {contacts.length} contatos</span>
      </header>

      <div className="overflow-hidden rounded-xl border-2 border-[#7b2635] bg-[#f8efe2] shadow-[0_12px_35px_-20px_rgba(75,25,30,.45)]">
        <div className="flex items-center justify-between gap-3 border-b-2 border-[#7b2635] bg-[#7b2635] px-4 py-3 text-[#fff8ed]">
          <div className="flex items-center gap-3"><span className="text-2xl">📖</span><div><p className="text-lg font-semibold leading-tight">Book Society Messenger</p><p className="text-[10px] tracking-widest text-[#f4dfcf]">CONVERSAS ENTRE LEITORES</p></div></div>
          <span className="hidden rounded border border-white/30 px-2 py-1 text-[10px] sm:inline">● Conectado</span>
        </div>

        <div className="grid min-h-[650px] md:grid-cols-[245px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_210px]">
          <aside className="border-b border-[#d9c6ae] bg-[#f2e6d5] md:border-b-0 md:border-r">
            <div className="p-4">
              <div className="flex items-center gap-3">{avatar(myAvatar, displayName, "h-12 w-12")}<div className="min-w-0"><p className="truncate text-sm font-bold">{displayName}</p><p className="text-xs text-[#a3292f]">● Online</p></div></div>
              <div className="mt-3 rounded-md border border-[#d9c6ae] bg-[#fffaf1] p-2">
                {editingPhrase ? <div className="flex gap-1"><input autoFocus value={draftPhrase} onChange={(e) => setDraftPhrase(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePhrase()} className="min-w-0 flex-1 bg-transparent text-xs outline-none" /><button onClick={savePhrase} className="font-bold">OK</button></div> : <button onClick={() => { setDraftPhrase(phrase); setEditingPhrase(true); }} className="w-full text-left text-xs">“{phrase}” <span className="float-right">✎</span></button>}
              </div>
              <div className="mt-2 rounded-md border border-[#d9c6ae] bg-[#fffaf1] p-2 text-[11px]"><span className="font-bold">♫ Spotify</span><p className="mt-1 text-[#8c5b51]">Compartilhe o que está ouvindo</p><span className="text-[10px] text-[#a3292f]">Conecte sua música pelo seu perfil</span></div>
            </div>
            <div className="border-y border-[#d9c6ae] px-4 py-2 text-[11px] font-bold uppercase tracking-widest">Contatos <span className="float-right">{contacts.length}</span></div>
            <div className="max-h-[430px] overflow-y-auto p-2">
              {contactsQuery.isLoading && <p className="p-4 text-xs">Carregando contatos…</p>}
              {contactsQuery.isError && <p className="p-4 text-xs">Não foi possível carregar seus contatos.</p>}
              {!contactsQuery.isLoading && !contacts.length && <p className="p-4 text-xs leading-relaxed text-[#8c5b51]">Seus contatos aparecerão aqui quando você seguir alguém, receber seguidores ou aceitar uma amizade.</p>}
              {contacts.map((c) => <button key={c.id} onClick={() => setSelected(c.id)} className={`mb-1 flex w-full items-center gap-3 rounded-lg border px-2 py-3 text-left transition ${selected === c.id ? "border-[#7b2635] bg-[#ead9c8]" : "border-transparent hover:border-[#d9c6ae] hover:bg-[#fffaf1]"}`}>
                {avatar(c.avatar, c.name, "h-10 w-10")}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{c.name}</span><span className="block truncate text-[11px] text-[#8c5b51]">{c.handle}</span></span><span className="text-[10px] text-[#a3292f]">●</span>
              </button>)}
            </div>
          </aside>

          <main className={`flex min-h-[650px] min-w-0 flex-col bg-[#fffaf1] ${attention ? "animate-[messengerShake_.12s_ease-in-out_8]" : ""}`}>
            {contact ? <>
              <div className="flex items-center justify-between border-b border-[#d9c6ae] bg-[#f4e8d9] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">{avatar(contact.avatar, contact.name)}<div className="min-w-0"><p className="truncate font-bold">{contact.name}</p><p className="text-xs">● <span className="text-[#a3292f]">Online</span></p></div></div>
                <button onClick={callAttention} className="rounded-md border border-[#7b2635] bg-[#7b2635] px-3 py-2 text-xs font-semibold text-[#fff8ed] hover:bg-[#5e1c29]">🔔 Chamar atenção</button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                <div className="mx-auto w-fit rounded-full border border-[#e3d3c0] bg-[#f5eadb] px-3 py-1 text-[10px]">— conversa —</div>
                {messagesQuery.isLoading && <p className="py-10 text-center text-sm">Carregando mensagens…</p>}
                {messages.map((m) => {
                  const mine = m.sender_id === me?.id;
                  const isWink = m.content.includes("[WINK]");
                  const isNudge = m.content.includes("[NUDGE]");
                  const clean = m.content.replace(" [WINK]", "").replace(" [NUDGE]", "");
                  return <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                    {!mine && avatar(contact.avatar, contact.name, "h-8 w-8")}
                    <div className={`max-w-[82%] rounded-2xl border border-[#e5d5c3] bg-[#f4e6d4] px-4 py-3 text-[#b3262e] shadow-sm ${mine ? "rounded-br-sm" : "rounded-bl-sm"} ${isWink ? "text-center text-2xl font-semibold animate-bounce" : ""} ${isNudge ? "font-bold" : ""}`}>
                      <p className={`whitespace-pre-wrap leading-relaxed ${isWink ? "text-xl" : "text-sm"}`}>{clean}</p><p className="mt-1 text-right text-[9px] text-[#9c6d60]">{stamp(m.created_at)}{mine && m.read_at ? " · lida" : ""}</p>
                    </div>
                    {mine && avatar(myAvatar, displayName, "h-8 w-8")}
                  </div>;
                })}
                {!messagesQuery.isLoading && !messages.length && <p className="py-12 text-center text-sm text-[#9c6d60]">Diga oi e comece uma conversa!</p>}
              </div>

              <div className="border-t border-[#d9c6ae] bg-[#f4e8d9] p-3 sm:p-4">
                <div className="relative mb-2 flex flex-wrap items-center gap-1 border-b border-[#d9c6ae] pb-2">
                  <button onClick={() => { setEmojiOpen(!emojiOpen); setWinksOpen(false); }} className="rounded-md px-3 py-1 text-lg hover:bg-[#ead9c8]" title="Emoticons">😊 <span className="text-xs font-semibold">Emoticons</span></button>
                  <button onClick={() => { setWinksOpen(!winksOpen); setEmojiOpen(false); }} className="rounded-md px-3 py-1 text-lg hover:bg-[#ead9c8]" title="Winks">✨ <span className="text-xs font-semibold">Winks</span></button>
                  <span className="ml-auto text-[10px] text-[#8c5b51]">Personalize sua conversa</span>
                  {emojiOpen && <div className="absolute bottom-11 left-0 z-20 grid grid-cols-7 gap-1 rounded-lg border border-[#7b2635] bg-[#fffaf1] p-2 shadow-xl">{emojis.map((emoji) => <button key={emoji} onClick={() => { setDraft((v) => v + emoji); setEmojiOpen(false); }} className="rounded p-1 text-xl hover:bg-[#f0dfcf]">{emoji}</button>)}</div>}
                  {winksOpen && <div className="absolute bottom-11 left-0 z-20 grid grid-cols-2 gap-1 rounded-lg border border-[#7b2635] bg-[#fffaf1] p-2 shadow-xl sm:grid-cols-3">{winks.map((wink) => <button key={wink.label} onClick={() => { void sendContent(wink.message); setWinksOpen(false); }} className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-[#f0dfcf]"><span className="text-2xl">{wink.icon}</span>{wink.label}</button>)}</div>}
                </div>
                <div className="flex items-end gap-2 rounded-lg border border-[#cdb8a2] bg-[#fffdf8] p-2 focus-within:border-[#7b2635]">
                  <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} placeholder="Digite sua mensagem..." className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm text-[#b3262e] outline-none placeholder:text-[#b79b87]" />
                  <button onClick={() => void sendMessage()} disabled={!draft.trim()} className="rounded-md bg-[#7b2635] px-5 py-3 text-sm font-bold text-[#fff8ed] hover:bg-[#5e1c29] disabled:opacity-40">➤ Enviar</button>
                </div>
                <p className="mt-2 text-[10px] text-[#9c6d60]">Enter para enviar · Shift + Enter para pular linha</p>
              </div>
            </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><p className="text-xl font-semibold">Seu cantinho de conversas</p><p className="mt-2 max-w-sm text-sm text-[#9c6d60]">Adicione amigos ou conecte-se com leitores para começar a conversar.</p></div></div>}
          </main>

          <aside className="hidden border-l border-[#d9c6ae] bg-[#f2e6d5] p-4 xl:block">
            <p className="mb-4 text-center text-[11px] font-bold uppercase tracking-widest">Nesta conversa</p>
            <div className="flex flex-col items-center gap-2 rounded-lg border border-[#d9c6ae] bg-[#fffaf1] p-3 text-center">
              {avatar(contact?.avatar ?? null, contact?.name ?? "Contato", "h-24 w-24")}
              <p className="text-sm font-bold">{contact?.name ?? "Contato"}</p><p className="text-xs">● Online</p><p className="text-[10px] text-[#8c5b51]">{contact?.handle ?? ""}</p>
            </div>
            <div className="my-4 border-t border-[#d9c6ae]" />
            <div className="flex flex-col items-center gap-2 rounded-lg border border-[#d9c6ae] bg-[#fffaf1] p-3 text-center">
              {avatar(myAvatar, displayName, "h-24 w-24")}
              <p className="text-sm font-bold">Você</p><p className="text-xs">● Online</p><p className="text-[10px] text-[#8c5b51]">{phrase}</p>
            </div>
            <div className="mt-4 rounded-lg border border-[#d9c6ae] bg-[#fffaf1] p-3 text-center"><p className="text-xs font-bold">♫ Spotify</p><p className="mt-1 text-[10px] text-[#8c5b51]">Mostre aos amigos o que você está ouvindo quando conectar sua conta.</p></div>
          </aside>
        </div>
      </div>
      <p className="text-center text-xs text-[#9c6d60]">Mensagens sincronizadas pela sua conta · atualização em tempo real pelo Supabase.</p>
      <style>{`@keyframes messengerShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }`}</style>
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens — Book Society" }] }),
  component: MessengerPage,
});
