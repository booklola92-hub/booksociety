import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMe } from "@/lib/social";

type Contact = { id: string; name: string; handle: string; status: "online" | "away" | "offline"; phrase: string; song?: string };
type ChatMessage = { id: number; from: "me" | "them"; text: string; time: string };

const initialContacts: Contact[] = [
  { id: "luna", name: "Luna Martins", handle: "@lunamartins", status: "online", phrase: "só mais um capítulo…", song: "Dreams — Fleetwood Mac" },
  { id: "clara", name: "Clara Oliveira", handle: "@claralivros", status: "online", phrase: "vivendo entre páginas ♡" },
  { id: "bia", name: "Beatriz Costa", handle: "@bia.reads", status: "away", phrase: "já volto, leitores!" },
  { id: "marina", name: "Marina Alves", handle: "@marinaalves", status: "offline", phrase: "um livro e um café." },
];

const stamp = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function MessengerPage() {
  const { data: me } = useMe();
  const [contacts] = useState(initialContacts);
  const [selected, setSelected] = useState("luna");
  const [phrase, setPhrase] = useState("perdida em um bom livro ♡");
  const [editingPhrase, setEditingPhrase] = useState(false);
  const [draftPhrase, setDraftPhrase] = useState(phrase);
  const [draft, setDraft] = useState("");
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({
    luna: [{ id: 1, from: "them", text: "oiii! já começou aquele livro?", time: "14:32" }, { id: 2, from: "me", text: "comecei ontem e já estou apaixonada!!", time: "14:34" }],
  });
  const contact = contacts.find((c) => c.id === selected) ?? contacts[0];
  const messages = chats[selected] ?? [];
  const onlineCount = contacts.filter((c) => c.status !== "offline").length;
  const displayName = me?.display_name || me?.username || "Leitora";

  function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    setChats((current) => ({ ...current, [selected]: [...(current[selected] ?? []), { id: Date.now(), from: "me", text, time: stamp() }] }));
    setDraft("");
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9b6b65]">Book Society • conexão</p><h1 className="mt-1 font-serif text-3xl text-[#512b35]">Mensagens</h1><p className="mt-1 text-sm text-muted-foreground">Um cantinho para conversar entre capítulos.</p></div>
        <div className="rounded-full border border-[#e7d7ce] bg-[#fbf6ef] px-4 py-2 text-xs text-[#71464a]">● {onlineCount} contatos por aqui</div>
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
                <div className="grid h-11 w-11 place-items-center rounded-full border-2 border-white bg-[#d8b8aa] font-serif text-lg text-[#512b35]">{displayName.slice(0,1).toUpperCase()}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#512b35]">{displayName}</p><p className="text-xs text-emerald-700">● disponível</p></div>
              </div>
              <div className="mt-3 rounded-lg border border-[#e7d5ca] bg-white/70 p-2">
                {editingPhrase ? <div className="flex gap-1"><input autoFocus value={draftPhrase} onChange={(e) => setDraftPhrase(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setPhrase(draftPhrase), setEditingPhrase(false))} className="min-w-0 flex-1 bg-transparent text-xs text-[#71464a] outline-none" /><button onClick={() => { setPhrase(draftPhrase); setEditingPhrase(false); }} className="text-xs font-semibold text-[#8b4f5a]">OK</button></div> : <button onClick={() => { setDraftPhrase(phrase); setEditingPhrase(true); }} className="w-full text-left text-xs text-[#8b6866]">“{phrase}” <span className="float-right">✎</span></button>}
              </div>
            </div>
            <div className="flex items-center justify-between border-y border-[#eadbd2] px-4 py-2"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#956d68]">Meus contatos</span><span className="text-xs text-[#956d68]">{contacts.length}</span></div>
            <div className="p-2">
              {contacts.map((c) => <button key={c.id} onClick={() => setSelected(c.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected === c.id ? "bg-[#ead8d0] shadow-inner" : "hover:bg-white/70"}`}>
                <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d9c0b4] font-serif text-[#623b42]">{c.name.split(" ").map((n) => n[0]).slice(0,2).join("")}<span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#f7eee6] ${c.status === "online" ? "bg-emerald-500" : c.status === "away" ? "bg-amber-400" : "bg-stone-400"}`} /></div>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[#573640]">{c.name}</span><span className="block truncate text-xs text-[#9a7772]">{c.phrase}</span></span>
                {c.status === "offline" && <span className="text-[9px] text-stone-400">off</span>}
              </button>)}
            </div>
          </aside>

          <div className="flex min-h-[570px] flex-col bg-[#fffaf4]">
            <div className="flex items-center justify-between border-b border-[#eadbd2] bg-white/60 px-5 py-4">
              <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#e4cec3] font-serif text-[#623b42]">{contact.name.split(" ").map((n) => n[0]).slice(0,2).join("")}</div><div><p className="font-serif text-lg text-[#512b35]">{contact.name}</p><p className="text-xs text-[#9a7772]">{contact.handle} · {contact.status === "online" ? "online agora" : contact.status === "away" ? "ausente" : "offline"}</p></div></div>
              <span className="text-xl text-[#a47c75]">♡</span>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="mx-auto w-fit rounded-full bg-[#f4e9e1] px-3 py-1 text-[10px] text-[#a17d76]">✦ início da conversa ✦</div>
              {messages.map((m) => <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${m.from === "me" ? "rounded-br-sm bg-[#754653] text-white" : "rounded-bl-sm border border-[#eadbd2] bg-white text-[#60434a]"}`}><p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p><p className={`mt-1 text-right text-[9px] ${m.from === "me" ? "text-white/60" : "text-[#b29a91]"}`}>{m.time}</p></div></div>)}
              {messages.length === 0 && <p className="py-12 text-center text-sm text-[#b0958c]">Diga oi e comece uma conversa ♡</p>}
            </div>
            <div className="border-t border-[#eadbd2] bg-white/70 p-4">
              {contact.song && <div className="mb-3 flex items-center gap-2 rounded-lg bg-[#f4eae3] px-3 py-2 text-xs text-[#80545b]"><span>♫</span><span>Ouvindo agora: <strong>{contact.song}</strong></span><span className="ml-auto text-[10px]">Spotify</span></div>}
              <div className="flex items-center gap-2 rounded-xl border border-[#dec9be] bg-white p-2 focus-within:border-[#a8797b]"><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Escreva uma mensagem..." className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[#573640] outline-none placeholder:text-[#b9a39b]" /><button onClick={sendMessage} className="rounded-lg bg-[#754653] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5b3440]">Enviar ↗</button></div>
              <p className="mt-2 text-center text-[10px] text-[#b49a90]">conversas, livros e boas companhias ♡</p>
            </div>
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Prévia do Book Messenger · mensagens desta demonstração ficam apenas nesta sessão.</p>
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens — Book Society" }] }),
  component: MessengerPage,
});
