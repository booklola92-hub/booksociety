import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadMedia, useMediaUrl } from "@/lib/media";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, UserPlus, Search, Folder, Camera, Image as ImageIcon, Smile, Bell, Send, Palette, Heart, Gift, Settings, Shirt, Volume2, VolumeX, Pencil, X, ChevronDown, Radio, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/social";

type Contact = { id: string; name: string; handle: string; avatar: string | null };
type ChatMessage = { id: string; sender_id: string; recipient_id?: string; content: string; created_at: string; read_at?: string | null };
type MessengerGroup = { id: string; name: string; created_at: string };
type WinkKind = "pig" | "heart" | "kiss" | "dance" | "laugh" | "surprise" | "rainbow";
type Wink = { kind: WinkKind; label: string; icon: string; caption: string };
const stamp = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const emojis = ["😀", "😂", "😍", "🥰", "😘", "😉", "😮", "😎", "🥳", "❤️", "💋", "📚", "✨", "🙈", "👏", "🤍", "🤣", "🌹", "🐷", "🌈"];
const messengerPresets = {
  winecream: { label: "Vinho e creme", bg: "#f8e9df", sidebar: "#261514", panel: "#f2d9ca", sent: "#741b2b", received: "#fff4e9", text: "#351a18", accent: "#a52c40", border: "#c58e7a" },
  blackwhite: { label: "Preto e branco", bg: "#eeeeee", sidebar: "#171717", panel: "#ffffff", sent: "#222222", received: "#ffffff", text: "#171717", accent: "#444444", border: "#999999" },
  pinkwhite: { label: "Rosa e branco", bg: "#fff0f4", sidebar: "#4b202e", panel: "#ffe0e9", sent: "#bd5477", received: "#ffffff", text: "#482333", accent: "#d46b91", border: "#e4a5b8" },
  bluewhite: { label: "Azul e branco", bg: "#edf5ff", sidebar: "#142b49", panel: "#dcecff", sent: "#245b9a", received: "#ffffff", text: "#172d48", accent: "#3979bd", border: "#9bbce0" },
  greencream: { label: "Verde e creme", bg: "#edf3e7", sidebar: "#243a2c", panel: "#e0ead8", sent: "#386447", received: "#fffdf3", text: "#23372a", accent: "#54845c", border: "#a8bea0" },
} as const;
type MessengerColors = { bg: string; sidebar: string; panel: string; sent: string; received: string; text: string; accent: string; border: string };
const defaultCustomColors: MessengerColors = { bg: "#f8e9df", sidebar: "#261514", panel: "#f2d9ca", sent: "#741b2b", received: "#fff4e9", text: "#351a18", accent: "#a52c40", border: "#c58e7a" };
const winks: Wink[] = [
  { kind: "pig", label: "Porquinho dançante", icon: "🐷", caption: "Olha quem veio dançar!" },
  { kind: "heart", label: "Coração", icon: "🐱", caption: "Um coração para você!" },
  { kind: "kiss", label: "Beijo", icon: "💋", caption: "Mil beijos!" },
  { kind: "dance", label: "Dança", icon: "💃", caption: "Vamos dançar!" },
  { kind: "laugh", label: "Gargalhada", icon: "🤣", caption: "Não consigo parar de rir!" },
  { kind: "surprise", label: "Surpresa", icon: "😲", caption: "Surpresaaa!" },
  { kind: "rainbow", label: "Arco-íris", icon: "🌈", caption: "Um dia colorido para você!" },
];
function playWinkSound(kind: WinkKind = "pig") {
  try {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const notes: Record<WinkKind, number[]> = {
      pig: [440, 554, 659, 784], heart: [523, 659, 784], kiss: [880, 1046],
      dance: [392, 494, 587, 784], laugh: [660, 740, 880, 740],
      surprise: [330, 880], rainbow: [392, 494, 587, 659, 784],
    };
    notes[kind].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.12;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(start); oscillator.stop(start + 0.18);
      oscillator.onended = () => { if (index === notes[kind].length - 1) void ctx.close(); };
    });
  } catch { /* áudio pode estar bloqueado pelo navegador */ }
}

function WinkArtwork({ kind }: { kind: WinkKind }) {
  const art: Record<WinkKind, { main: string; extra: string[]; className: string }> = {
    pig: { main: "🐷", extra: ["🎵", "🎧", "♫", "♪"], className: "wink-pig" },
    heart: { main: "🐱", extra: ["❤️", "💗", "💕", "❤️"], className: "wink-heart" },
    kiss: { main: "😘", extra: ["💋", "💋", "💞"], className: "wink-kiss" },
    dance: { main: "💃", extra: ["♪", "♫", "✨"], className: "wink-dance" },
    laugh: { main: "🤣", extra: ["😂", "！", "🤣"], className: "wink-laugh" },
    surprise: { main: "😲", extra: ["✨", "❗", "😮"], className: "wink-surprise" },
    rainbow: { main: "🌈", extra: ["☁️", "⭐", "✨"], className: "wink-rainbow" },
  };
  const item = art[kind];
  return <div className={`wink-stage ${item.className}`} aria-label={winks.find((w) => w.kind === kind)?.label}>
    {item.extra.map((e, i) => <span key={i} className={`wink-spark spark-${i}`}>{e}</span>)}
    <span className="wink-main">{item.main}</span>
    {kind === "pig" && <span className="wink-note">♪ ♫ ♪</span>}
  </div>;
}

function MessengerAvatar({ url, name, size, extra = "" }: { url: string | null; name: string; size: string; extra?: string }) {
  const resolvedUrl = useMediaUrl(url);
  return resolvedUrl ? <img src={resolvedUrl} alt={name} className={"messenger-avatar " + size + " shrink-0 object-cover " + extra} /> : <div className={"messenger-avatar " + size + " grid shrink-0 place-items-center bg-[#ead9c8] font-semibold text-[#a71925] " + extra}>{name.slice(0,1).toUpperCase()}</div>;
}
function ChatAttachment({ content }: { content: string }) {
  const isPhoto = content.startsWith("[PHOTO]");
  const raw = content.slice(isPhoto ? 7 : 6);
  const [path, fileName] = raw.split("|", 2);
  const url = useMediaUrl(path);
  if (!url) return <span className="text-xs opacity-70">Carregando anexo…</span>;
  return isPhoto ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto enviada" className="max-h-40 max-w-full rounded-xl object-contain" /></a> : <a href={url} target="_blank" rel="noreferrer" download className="inline-flex items-center gap-2 underline"><Folder size={16} />{fileName || "Abrir arquivo"}</a>;
}
function MessengerPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [phrase, setPhrase] = useState("Sonhe, leia, converse...");
  const [draftPhrase, setDraftPhrase] = useState(phrase);
  const [editingPhrase, setEditingPhrase] = useState(false);
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [winksOpen, setWinksOpen] = useState(false);
  const [attention, setAttention] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [chatTheme, setChatTheme] = useState("winecream");
  const [customColors, setCustomColors] = useState<MessengerColors>(defaultCustomColors);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const lastIncomingRef = useRef<string | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("book-messenger-phrase");
    if (saved) { setPhrase(saved); setDraftPhrase(saved); }
    setSoundOn(window.localStorage.getItem("book-messenger-sound") !== "off");
  }, []);
  useEffect(() => {
    if (!me?.id) return;
    let active = true;
    void (async () => {
      const savedTheme = window.localStorage.getItem("book-messenger-theme-" + me.id);
      const savedColors = window.localStorage.getItem("book-messenger-custom-colors-" + me.id);
      if (savedTheme && active) setChatTheme(savedTheme);
      if (savedColors && active) {
        try { setCustomColors({ ...defaultCustomColors, ...JSON.parse(savedColors) }); } catch { /* ignora preferência local inválida */ }
      }
      const { data } = await supabase.auth.getUser();
      const metadata = data.user?.user_metadata ?? {};
      if (!active) return;
      if (typeof metadata["messenger_theme"] === "string") setChatTheme(metadata["messenger_theme"]);
      if (metadata["messenger_custom_colors"] && typeof metadata["messenger_custom_colors"] === "object") {
        setCustomColors({ ...defaultCustomColors, ...metadata["messenger_custom_colors"] });
      }
    })();
    return () => { active = false; };
  }, [me?.id]);

  const contactsQuery = useQuery({
    queryKey: ["messages", "contacts", me?.id], enabled: !!me?.id,
    queryFn: async () => {
      const [following, followers, friendships] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", me!.id),
        supabase.from("follows").select("follower_id").eq("following_id", me!.id),
        supabase.from("friend_requests").select("requester_id, addressee_id").eq("status", "accepted").or(`requester_id.eq.${me!.id},addressee_id.eq.${me!.id}`),
      ]);
      if (following.error) throw following.error;
      if (followers.error) throw followers.error;
      if (friendships.error) throw friendships.error;
      const friendIds = (friendships.data ?? []).map((r) => r.requester_id === me!.id ? r.addressee_id : r.requester_id);
      const ids = [...new Set([...(following.data ?? []).map((r) => r.following_id), ...(followers.data ?? []).map((r) => r.follower_id), ...friendIds])];
      if (!ids.length) return [] as Contact[];
      const { data, error } = await supabase.rpc("list_visible_profiles", { _ids: ids });
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, name: p.display_name || p.username, handle: "@" + p.username, avatar: p.avatar_url }));
    },
  });
  const contacts = contactsQuery.data ?? [];
  const groupsQuery = useQuery<MessengerGroup[]>({ queryKey: ["messages", "groups", me?.id], enabled: !!me?.id, queryFn: async () => { const { data, error } = await (supabase as any).from("messenger_group_members").select("group_id, messenger_groups!inner(id,name,created_at)").eq("user_id", me!.id); if (error) throw error; return (data ?? []).map((row: any) => row.messenger_groups as MessengerGroup); } });
  const groups = groupsQuery.data ?? [];
  const activeGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const groupMembersQuery = useQuery({ queryKey: ["messages", "group-members", selectedGroupId], enabled: !!selectedGroupId, queryFn: async () => { const { data, error } = await (supabase as any).from("messenger_group_members").select("user_id").eq("group_id", selectedGroupId); if (error) throw error; return (data ?? []).map((row: { user_id: string }) => row.user_id as string); } });
  const groupMemberIds = groupMembersQuery.data ?? [];
  useEffect(() => {
    if (!selectedGroupId && !selected && contacts.length) setSelected(contacts[0]!.id);
    if (!selectedGroupId && selected && contacts.length && !contacts.some((c) => c.id === selected)) setSelected(contacts[0]!.id);
  }, [contacts, selected, selectedGroupId]);

  const myPresenceQuery = useQuery({
    queryKey: ["messages", "presence", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("messenger_presence").select("*").eq("user_id", me!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const contactPresenceQuery = useQuery({
    queryKey: ["messages", "presence", selected],
    enabled: !!selected,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from("messenger_presence").select("*").eq("user_id", selected).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", "conversation", me?.id, selected, selectedGroupId], enabled: !!me?.id && (!!selected || !!selectedGroupId),
    queryFn: async () => {
      if (selectedGroupId) {
        const { data, error } = await (supabase as any).from("messenger_group_messages").select("id, sender_id, content, created_at").eq("group_id", selectedGroupId).order("created_at", { ascending: true }).limit(200);
        if (error) throw error;
        return (data ?? []) as ChatMessage[];
      }
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
    const channel = supabase.channel(selectedGroupId ? "book-messenger-group-" + selectedGroupId : "book-messenger-" + me.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const row = (payload.new ?? payload.old) as Partial<ChatMessage>;
        if (row.sender_id === me.id || row.recipient_id === me.id) {
          qc.invalidateQueries({ queryKey: ["messages"] });
          qc.invalidateQueries({ queryKey: ["unread"] });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messenger_presence" }, () => {
        qc.invalidateQueries({ queryKey: ["messages", "presence"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messenger_group_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["messages", "conversation", me.id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messenger_group_members" }, () => {
        qc.invalidateQueries({ queryKey: ["messages", "groups", me.id] });
        qc.invalidateQueries({ queryKey: ["messages", "group-members"] });
      })
      .on("broadcast", { event: "nudge" }, (event) => {
        const payload = event["payload"] as { sender_id?: string };
        if (payload.sender_id && payload.sender_id !== me.id) {
          setAttention(true);
          window.setTimeout(() => setAttention(false), 1100);
          if (soundOn) playWinkSound("surprise");
        }
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [me?.id, qc, soundOn, selectedGroupId]);

  const contact = selectedGroupId ? undefined : contacts.find((c) => c.id === selected);
  const messages = messagesQuery.data ?? [];
  const myPresence = myPresenceQuery.data;
  const contactPresence = contactPresenceQuery.data;
  const displayName = me?.display_name || me?.username || "Leitora";
  const myAvatar = me?.avatar_url || null;
  const avatar = (url: string | null, name: string, size = "h-12 w-12", extra = "") => <MessengerAvatar url={url} name={name} size={size} extra={extra} />;

  async function uploadChatFile(file: File, photo: boolean) {
    if (!me?.id || !selected) return;
    try {
      const path = await uploadMedia(me.id, file, "messages/" + selected);
      await sendContent(photo ? "[PHOTO]" + path : "[FILE]" + path + "|" + file.name);
      toast.success(photo ? "Foto enviada!" : "Arquivo enviado!");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível enviar o arquivo."); }
  }
  async function inviteContact() {
    if (!me?.id || (!selected && !selectedGroupId)) return;
    setInviteIds([]); setInviteOpen(true);
  }
  async function createGroupConversation() {
    if (!me?.id || inviteIds.length < 1) return;
    if (inviteIds.length > 3) { toast.error("Você pode convidar até 3 pessoas por vez."); return; }
    if (selectedGroupId) {
      const { error } = await (supabase as any).rpc("add_messenger_group_members", { _group_id: selectedGroupId, _participant_ids: inviteIds });
      if (error) { toast.error(error.message || "Não foi possível adicionar participantes."); return; }
      await qc.invalidateQueries({ queryKey: ["messages", "group-members", selectedGroupId] });
      setInviteOpen(false); setInviteIds([]); toast.success("Participantes adicionados à conversa!");
      return;
    }
    if (!selected) return;
    const { data, error } = await (supabase as any).rpc("create_messenger_group", { _participant_ids: [selected, ...inviteIds] });
    if (error) { toast.error(error.message || "Não foi possível criar o grupo."); return; }
    await qc.invalidateQueries({ queryKey: ["messages", "groups", me.id] });
    setSelectedGroupId(data as string); setSelected(""); setInviteOpen(false); toast.success("Conversa em grupo criada!");
  }

  async function sendContent(value: string) {
    if (!value.trim() || !me?.id || (!selected && !selectedGroupId)) return;
    if (selectedGroupId) {
      const { error } = await (supabase as any).from("messenger_group_messages").insert({ group_id: selectedGroupId, sender_id: me.id, content: value });
      if (error) { toast.error("Não foi possível enviar a mensagem ao grupo."); return; }
      await qc.invalidateQueries({ queryKey: ["messages", "conversation", me.id, selected, selectedGroupId] });
      return;
    }
    const { error } = await supabase.from("messages").insert({ sender_id: me.id, recipient_id: selected, content: value });
    if (error) { console.error("Erro ao enviar mensagem:", error); return; }
    await qc.invalidateQueries({ queryKey: ["messages", "conversation", me.id, selected, selectedGroupId] });
  }
  async function sendMessage() {
    const text = draft.trim(); if (!text) return;
    setDraft(""); await sendContent(text);
  }
  async function sendWink(wink: Wink) {
    await sendContent(`[WINK:${wink.kind}]${wink.caption}`);
    setWinksOpen(false);
    if (soundOn) playWinkSound(wink.kind);
  }
  async function savePhrase() {
    const next = draftPhrase.trim().slice(0, 80) || "Sonhe, leia, converse...";
    setPhrase(next);
    window.localStorage.setItem("book-messenger-phrase", next);
    setEditingPhrase(false);
    if (me?.id) {
      const { error } = await supabase.from("messenger_presence").upsert({ user_id: me.id, status_text: next }, { onConflict: "user_id" });
      if (error) console.error("Não foi possível salvar seu status:", error);
      await qc.invalidateQueries({ queryKey: ["messages", "presence", me.id] });
    }
  }
  async function chooseTheme(theme: string) {
    setChatTheme(theme);
    if (me?.id) {
      window.localStorage.setItem("book-messenger-theme-" + me.id, theme);
      const { error } = await supabase.auth.updateUser({ data: { messenger_theme: theme, messenger_custom_colors: customColors } });
      if (error) console.error("Não foi possível sincronizar o tema da conta:", error);
    }
    setBackgroundOpen(false);
  }
  async function updateCustomColor(key: keyof MessengerColors, value: string) {
    const next = { ...customColors, [key]: value };
    setCustomColors(next);
    if (me?.id) {
      window.localStorage.setItem("book-messenger-custom-colors-" + me.id, JSON.stringify(next));
      const { error } = await supabase.auth.updateUser({ data: { messenger_theme: "custom", messenger_custom_colors: next } });
      if (error) console.error("Não foi possível salvar as cores personalizadas:", error);
      setChatTheme("custom");
      window.localStorage.setItem("book-messenger-theme-" + me.id, "custom");
    }
  }
  async function callAttention() {
    if ((!selected && !selectedGroupId) || !me?.id) return;
    const conversationId = selectedGroupId || selected;
    const rateKey = "book-messenger-nudge-" + me.id + "-" + conversationId;
    const lastSent = Number(window.localStorage.getItem(rateKey) || "0");
    const remaining = 30000 - (Date.now() - lastSent);
    if (remaining > 0) {
      toast.info(`Aguarde ${Math.ceil(remaining / 1000)} segundos para chamar a atenção novamente.`);
      return;
    }

    const nudgeText = `[NUDGE]✨ ${displayName} está chamando sua atenção!`;
    if (selectedGroupId) {
      const { error } = await (supabase as any).from("messenger_group_messages").insert({
        group_id: selectedGroupId,
        sender_id: me.id,
        content: nudgeText,
      });
      if (error) {
        toast.error(error.message || "Não foi possível enviar o chamado.");
        return;
      }
    } else {
      const { error } = await supabase.from("messages").insert({
        sender_id: me.id,
        recipient_id: selected,
        content: nudgeText,
      });
      if (error) {
        toast.error(error.message || "Não foi possível enviar o chamado.");
        return;
      }
    }

    window.localStorage.setItem(rateKey, String(Date.now()));
    setAttention(true);
    window.setTimeout(() => setAttention(false), 1100);
    await qc.invalidateQueries({ queryKey: ["messages"] });
    await qc.invalidateQueries({ queryKey: ["unread"] });
    toast.success("Chamado de atenção enviado!");

    const channel = supabase.channel(selectedGroupId ? "book-messenger-group-" + selectedGroupId : "book-messenger-" + selected);
    try {
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error("O aviso foi salvo, mas a animação instantânea não pôde ser enviada."));
        });
      });
      await channel.send({ type: "broadcast", event: "nudge", payload: { sender_id: me.id, sender_name: displayName, sent_at: Date.now() } });
    } catch (error) {
      console.warn("O chamado foi salvo na conversa; o alerta instantâneo não foi enviado:", error);
    } finally {
      await supabase.removeChannel(channel);
    }
  }

  useEffect(() => {
    if (!messages.length) return;
    const latest = messages[messages.length - 1];
    if (!latest) return;
    if (lastIncomingRef.current && latest.id !== lastIncomingRef.current && latest.sender_id !== me?.id) {
      const wink = winkFromContent(latest.content);
      if (wink && soundOn) playWinkSound(wink);
      if (latest.content.startsWith("[NUDGE]")) {
        setAttention(true);
        window.setTimeout(() => setAttention(false), 1100);
        if (soundOn) playWinkSound("surprise");
      }
    }
    lastIncomingRef.current = latest.id;
  }, [messages, me?.id, soundOn]);

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, selected]);

  useEffect(() => {
    if (myPresence?.status_text) {
      setPhrase(myPresence.status_text);
      setDraftPhrase(myPresence.status_text);
    }
  }, [myPresence?.status_text]);

  const winkFromContent = (value: string): WinkKind | null => {
    const match = value.match(/^\[WINK:(pig|heart|kiss|dance|laugh|surprise|rainbow)\]/);
    if (match) return match[1] as WinkKind;
    if (value.includes("[WINK]")) return "pig";
    return null;
  };

  const activeColors: MessengerColors = chatTheme === "custom" ? customColors : (messengerPresets[chatTheme as keyof typeof messengerPresets] ?? messengerPresets.winecream);
  const messengerStyle = {
    "--msg-bg": activeColors.bg, "--msg-sidebar": activeColors.sidebar, "--msg-panel": activeColors.panel,
    "--msg-sent": activeColors.sent, "--msg-received": activeColors.received, "--msg-text": activeColors.text,
    "--msg-accent": activeColors.accent, "--msg-border": activeColors.border,
  } as React.CSSProperties;

  return (
    <section style={messengerStyle} className="bs-messenger mx-auto max-w-[1000px] overflow-hidden rounded-[14px] border border-[var(--msg-border)] bg-[var(--msg-bg)] text-[var(--msg-text)] shadow-[0_14px_38px_rgba(40,15,15,.22)]">
      <div className="flex items-center gap-2 bg-gradient-to-r from-[#790d19] to-[#a51b28] px-3 py-1.5 text-[#fff8ed]">
        <BookOpen size={25} strokeWidth={2.2} />
        <span className="text-sm font-semibold tracking-tight">Book Society Messenger</span>
        <span className="ml-auto hidden text-xs text-[#ffe4d3] sm:block">● Conectado</span>
      </div>

      <div className="grid min-h-[240px] grid-cols-1 lg:h-[570px] lg:min-h-0 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="min-h-0 border-b-2 border-[#d9b49b] bg-[#f4e5d1] lg:overflow-hidden lg:border-b-0 lg:border-r-2">
          <div className="flex items-center gap-2 border-b border-[#d9b49b] p-2">
            {avatar(myAvatar, displayName, "h-8 w-8", "max-h-8 max-w-8")}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{displayName} <ChevronDown className="inline" size={16} /></p>
              <p className="mt-1 text-[10px] text-[#258a43]">● Online</p>
              {editingPhrase ? <div className="mt-2 flex gap-1"><input value={draftPhrase} onChange={(e) => setDraftPhrase(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePhrase()} className="min-w-0 w-full rounded border border-[#d9b49b] bg-[#fffaf1] px-2 py-1 text-xs" /><button onClick={savePhrase} className="text-xs font-bold">OK</button></div> : <button onClick={() => { setDraftPhrase(phrase); setEditingPhrase(true); }} className="mt-1 text-left text-xs italic">“{phrase}” <Pencil className="inline" size={13} /></button>}
            </div>
          </div>


          <div className="p-2">
            <div className="flex items-center gap-2 rounded-full border border-[#d9a78d] bg-[#fff8ed] px-3 py-1.5"><Search size={16} /><input placeholder="Pesquisar contatos..." className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-[#b78c79]" onChange={(e) => { const q = e.target.value.toLowerCase(); document.querySelectorAll("[data-contact-name]").forEach((el) => { (el as HTMLElement).style.display = (el.getAttribute("data-contact-name") ?? "").includes(q) ? "" : "none"; }); }} /></div>
          </div>
          <div className="px-2 pb-1 text-xs font-bold">🟢 Online ({contacts.length})</div>
          <div className="max-h-[100px] overflow-y-auto lg:max-h-[190px] px-2 pb-2">
            {contactsQuery.isLoading && <p className="p-4 text-xs">Carregando contatos…</p>}
            {contactsQuery.isError && <p className="p-4 text-xs">Não foi possível carregar os contatos.</p>}
            {!contactsQuery.isLoading && !contacts.length && <p className="p-4 text-xs text-[#8c5b51]">Seus contatos aparecerão aqui quando você seguir alguém ou aceitar uma amizade.</p>}
            {contacts.map((c) => <button key={c.id} data-contact-name={c.name.toLowerCase()} onClick={() => { setSelected(c.id); setSelectedGroupId(null); }} className={`mb-1 flex w-full items-center gap-2 rounded-lg border p-1.5 text-left transition ${selected === c.id && !selectedGroupId ? "border-[#9a1d29] bg-[#ead6c0]" : "border-transparent hover:bg-[#fff8ed]"}`}>
              {avatar(c.avatar, c.name, "h-7 w-7")}<span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{c.name}</span><span className="block truncate text-[10px] text-[#8c5b51]">{c.handle}</span></span><span className="text-xs text-[#a71925]">▮▮▮</span>
            </button>)}
            {!!groups.length && <p className="px-1 pb-1 pt-2 text-xs font-bold">Grupos</p>}
            {groups.map((g) => <button key={g.id} onClick={() => { setSelectedGroupId(g.id); setSelected(""); }} className={`mb-1 flex w-full items-center gap-2 rounded-lg border p-1.5 text-left ${selectedGroupId === g.id ? "border-[#9a1d29] bg-[#ead6c0]" : "border-transparent hover:bg-[#fff8ed]"}`}><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#ead6c0] text-sm">👥</span><span className="min-w-0 flex-1 truncate text-xs font-bold">{g.name}</span></button>)}
          </div>
          <div className="flex items-center gap-4 border-t border-[#d9b49b] px-3 py-1.5"><button onClick={() => { window.location.href = "/configuracoes"; }} title="Configurações"><Settings size={18} /></button><button onClick={() => setBackgroundOpen(true)} title="Personalizar tema"><Shirt size={18} /></button><button onClick={() => { window.location.href = "/notificacoes"; }} title="Notificações"><Bell size={18} /></button></div>
        </aside>

        <main className={`flex min-h-[250px] min-w-0 flex-col bg-[#fff8ed] lg:min-h-0 ${attention ? "messenger-attention" : ""}`}>
          {(contact || activeGroup) ? <>
            <div className="flex min-h-[44px] items-center gap-2 border-b border-[var(--msg-border)] bg-[var(--msg-panel)] px-2 py-1">
              {activeGroup ? <div className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--msg-border)] bg-[var(--msg-received)] text-lg">👥</div> : avatar(contact!.avatar, contact!.name, "h-8 w-8")}
              <div className="min-w-0 flex-1"><p className="text-xs font-bold">{activeGroup?.name || contact?.name} <ChevronDown className="inline" size={19} /></p><p className="mt-0.5 text-xs text-[#258a43]">🟢 <span className="text-[var(--msg-text)]">Online</span></p><p className="mt-0.5 text-xs italic">“{activeGroup ? "Conversa em grupo" : (contactPresence?.status_text || "Sonhe, leia, converse...")}” <Heart className="inline" size={16} /></p></div>
              <button onClick={callAttention} className="hidden items-center gap-2 rounded-full border border-[var(--msg-border)] bg-gradient-to-b from-[var(--msg-accent)] to-[var(--msg-sent)] px-3 py-2 text-xs font-bold text-white shadow-lg hover:brightness-110 md:flex"><Bell size={18} />Chamar atenção</button>
            </div>
            <div className="flex flex-wrap items-center gap-1 border-b border-[#d9b49b] bg-[#f8ead7] px-1.5 py-0.5">
              <button onClick={() => { void inviteContact(); }} className="toolbar-btn"><UserPlus size={14} />Convidar</button>
              <button onClick={() => fileInputRef.current?.click()} className="toolbar-btn"><Folder size={16} />Enviar arquivos</button>
              <button onClick={() => { setEmojiOpen(!emojiOpen); setWinksOpen(false); setBackgroundOpen(false); }} className="toolbar-btn"><Smile size={15} />Emoticons <ChevronDown size={13} /></button>
              <button onClick={() => { setWinksOpen(!winksOpen); setEmojiOpen(false); setBackgroundOpen(false); }} className="toolbar-btn"><span className="text-lg">✦</span>Winks <ChevronDown size={13} /></button>
              <button onClick={() => photoInputRef.current?.click()} className="toolbar-btn"><Camera size={16} />Enviar fotos</button>
              <button onClick={() => { setBackgroundOpen(!backgroundOpen); setWinksOpen(false); setEmojiOpen(false); }} className="toolbar-btn"><ImageIcon size={15} />Planos de fundo <ChevronDown size={13} /></button>
            </div>
            {(emojiOpen || winksOpen || backgroundOpen) && <div className="relative z-30 mx-2 my-2 rounded-xl border border-[var(--msg-border)] bg-[var(--msg-received)] p-2 text-[var(--msg-text)] shadow-2xl">
{emojiOpen && <div className="grid grid-cols-8 gap-1 rounded-xl border-2 border-[#9a1d29] bg-[#fffaf1] p-3 shadow-xl">{emojis.map((emoji) => <button key={emoji} onClick={() => { setDraft((v) => v + emoji); setEmojiOpen(false); }} className="rounded p-1 text-2xl hover:bg-[#f0dfcf]">{emoji}</button>)}</div>}
                {winksOpen && <div className="grid grid-cols-2 gap-2 rounded-xl border-2 border-[#9a1d29] bg-[#fffaf1] p-3 shadow-xl sm:grid-cols-3">{winks.map((wink) => <button key={wink.kind} onClick={() => void sendWink(wink)} className="flex min-w-28 items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-[#f0dfcf]"><span className="text-3xl">{wink.icon}</span><span>{wink.label}</span></button>)}</div>}
                {backgroundOpen && <div className="w-full max-w-[320px] mx-auto rounded-2xl border-2 border-[var(--msg-border)] bg-[var(--msg-received)] p-3 text-[var(--msg-text)] shadow-2xl">
                  <p className="mb-2 text-sm font-bold">Personalizar sua interface</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.entries(messengerPresets) as [keyof typeof messengerPresets, typeof messengerPresets[keyof typeof messengerPresets]][]).map(([id,preset]) => <button key={id} onClick={() => void chooseTheme(id)} className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition hover:brightness-95 ${chatTheme === id ? "border-[var(--msg-accent)] ring-2 ring-[var(--msg-accent)]" : "border-[var(--msg-border)]"}`}><span className="h-7 w-7 shrink-0 rounded-full border" style={{background: `linear-gradient(135deg,${preset.sent} 50%,${preset.received} 50%)`,borderColor:preset.border}} />{preset.label}</button>)}
                  </div>
                  <div className="mt-3 border-t border-[var(--msg-border)] pt-3">
                    <p className="mb-2 text-xs font-semibold">Suas próprias cores</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([{key:"bg",label:"Fundo"},{key:"sidebar",label:"Barra lateral"},{key:"panel",label:"Cabeçalho e ferramentas"},{key:"sent",label:"Balões enviados"},{key:"received",label:"Balões recebidos"},{key:"text",label:"Texto"},{key:"accent",label:"Detalhes e botões"},{key:"border",label:"Bordas"}] as {key:keyof MessengerColors;label:string}[]).map(({key,label}) => <label key={key} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--msg-border)] px-2 py-1.5 text-xs">{label}<input aria-label={label} type="color" value={customColors[key]} onChange={(e) => void updateCustomColor(key,e.target.value)} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent" /></label>)}
                    </div>
                    <p className="mt-2 text-[10px] opacity-70">Essas escolhas aparecem somente na sua conta. Cada pessoa controla o próprio tema.</p>
                  </div>
                </div>}
            </div>}
            {noticeVisible && <div className="mx-2 mt-1.5 flex items-center gap-2 rounded-full border border-[var(--msg-border)] bg-[var(--msg-panel)] px-3 py-1.5 text-xs"><span>ⓘ</span><span className="flex-1">Nunca compartilhe sua senha ou dados pessoais com ninguém.</span><button onClick={() => setNoticeVisible(false)} aria-label="Fechar aviso"><X size={15} /></button></div>}
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const file=e.target.files?.[0]; if(file) void uploadChatFile(file,false); e.currentTarget.value=""; }} />
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file=e.target.files?.[0]; if(file) void uploadChatFile(file,true); e.currentTarget.value=""; }} />

            <div ref={conversationRef} className={`messenger-chat-area messenger-theme-${chatTheme} flex-1 space-y-1 overflow-y-auto px-2 py-2`}>
              {messagesQuery.isLoading && <p className="py-10 text-center text-sm">Carregando mensagens…</p>}
              {messages.map((m) => {
                const mine = m.sender_id === me?.id;
                const winkKind = winkFromContent(m.content);
                const isNudge = m.content.startsWith("[NUDGE]");
                const isAttachment = m.content.startsWith("[PHOTO]") || m.content.startsWith("[FILE]");
                const clean = winkKind ? (winks.find((w) => w.kind === winkKind)?.caption ?? m.content.replace(/^\[WINK[^\]]*\]/, "")) : m.content.replace(/^\[NUDGE\]/, "🔔 ");
                if (winkKind) return <div key={m.id} className={`flex items-center gap-3 py-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && (contact ? avatar(contact.avatar, contact.name, "h-7 w-7") : <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#ead6c0]">👥</span>)}
                  <div className="wink-message">
                    <WinkArtwork kind={winkKind} />
                    <p className="text-center text-xs font-semibold">{clean}</p>
                    <p className="mt-1 text-right text-[10px] text-[#9c6d60]">{stamp(m.created_at)}</p>
                  </div>
                  {mine && avatar(myAvatar, displayName, "h-7 w-7")}
                </div>;
                return <div key={m.id} className={`flex items-end gap-2 py-1 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && (contact ? avatar(contact.avatar, contact.name, "h-7 w-7") : <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#ead6c0]">👥</span>)}
                  <div className={`max-w-[80%] rounded-[16px] border border-[#d9a78d] bg-[#fff4e5] px-3 py-1.5 text-[#981d27] shadow-sm ${mine ? "rounded-br-md" : "rounded-bl-md"} ${isNudge ? "font-bold" : ""}`}>
                    {isAttachment ? <ChatAttachment content={m.content} /> : <p className="whitespace-pre-wrap text-xs leading-tight">{clean}</p>}<p className="mt-1 text-right text-[10px] text-[#9c6d60]">{stamp(m.created_at)}{mine && m.read_at ? " · lida" : ""}</p>
                  </div>
                  {mine && avatar(myAvatar, displayName, "h-7 w-7")}
                </div>;
              })}
              {!messagesQuery.isLoading && !messages.length && <p className="py-12 text-center text-sm text-[#9c6d60]">Diga oi e comece uma conversa!</p>}
            </div>

            <div className="border-t border-[#d9a78d] bg-[#fff2df] p-1">
              <div className="relative mb-1 flex flex-wrap items-center gap-1 border-b border-[#d9b49b] pb-1">
                <button className="rounded-md px-1.5 py-0.5 text-lg font-bold hover:bg-[#f0dfcb]" title="Fonte">A</button>
                <button onClick={() => { setEmojiOpen(!emojiOpen); setWinksOpen(false); }} className="rounded-md p-1 hover:bg-[#f0dfcb]" title="Emoticons"><Smile size={16} /></button>
                <button onClick={() => photoInputRef.current?.click()} className="rounded-md p-1 hover:bg-[#f0dfcb]" title="Enviar foto"><ImageIcon size={16} /></button>
                <button onClick={() => void sendWink({kind:"heart",label:"Presente",icon:"🎁",caption:"Um presente para você! 🎁"})} className="rounded-md p-1 hover:bg-[#f0dfcb]" title="Enviar presente"><Gift size={16} /></button>
                <button onClick={() => void sendWink(winks[0]!)} className="rounded-md p-1.5 text-lg hover:bg-[#f0dfcb]" title="Porquinho dançante">🐷</button>
                <button onClick={() => void sendWink(winks[1]!)} className="rounded-md p-2 text-2xl hover:bg-[#f0dfcb]" title="Coração">❤️</button>
                <button onClick={() => void sendWink(winks[2]!)} className="rounded-md p-2 text-2xl hover:bg-[#f0dfcb]" title="Beijo">💋</button>
                <button onClick={() => void sendWink(winks[3]!)} className="rounded-md p-2 text-2xl hover:bg-[#f0dfcb]" title="Dança">♫</button>
                <button onClick={() => { setBackgroundOpen(!backgroundOpen); setWinksOpen(false); setEmojiOpen(false); }} className="ml-auto rounded-md px-2 py-1.5 text-xs font-semibold hover:bg-[#f0dfcb]"><Palette className="mr-1 inline" size={15} />Fundo da conversa <ChevronDown className="ml-2 inline" size={15} /></button>
                <button onClick={() => { const next = !soundOn; setSoundOn(next); localStorage.setItem("book-messenger-sound", next ? "on" : "off"); }} className="rounded-md p-1 hover:bg-[#f0dfcb]" title={soundOn ? "Desativar som" : "Ativar som"}>{soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>

              </div>
              <div className="flex items-center gap-3 rounded-lg border border-[#d9a78d] bg-[#fffaf3] p-1">
                <textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} placeholder="Digite sua mensagem..." className="min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-[11px] text-[#981d27] outline-none placeholder:text-[#b78c79]" />
                <button onClick={() => void sendMessage()} disabled={!draft.trim()} className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-[#a71c29] to-[#780d19] px-3 py-2 text-xs font-bold text-white shadow hover:brightness-110 disabled:opacity-40"><Send size={14} />Enviar</button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button onClick={callAttention} className="flex items-center gap-2 rounded-full border border-[var(--msg-border)] bg-gradient-to-b from-[var(--msg-accent)] to-[var(--msg-sent)] px-3 py-1.5 text-xs font-bold text-white shadow-md hover:brightness-110"><Bell size={19} />Chamar atenção <ChevronDown size={15} /></button>
                <span className="text-[10px] text-[#9c6d60]">Enter para enviar · Shift + Enter para pular linha</span>
              </div>
            </div>
          </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><p className="text-xl font-semibold">Seu cantinho de conversas</p><p className="mt-2 max-w-sm text-sm text-[#9c6d60]">Adicione amigos ou conecte-se com leitores para começar a conversar.</p></div></div>}
        </main>

        </div>

      {inviteOpen && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-3" role="dialog" aria-modal="true" aria-label="Convidar pessoas para a conversa">
        <div className="w-full max-w-sm rounded-2xl border-2 border-[#9a1d29] bg-[#fff4e8] p-4 text-[#351a18] shadow-2xl">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-bold">Convidar pessoas</h3><button onClick={() => setInviteOpen(false)} aria-label="Fechar"><X size={18} /></button></div>
          <p className="mb-3 text-xs">Escolha até 3 pessoas para entrar nesta conversa. O grupo poderá ter no máximo 6 participantes, contando você.</p>
          <div className="max-h-60 space-y-1 overflow-y-auto">{contacts.filter((c) => c.id !== selected && !groupMemberIds.includes(c.id)).map((c) => <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-[#f0dfcf]"><input type="checkbox" checked={inviteIds.includes(c.id)} disabled={!inviteIds.includes(c.id) && inviteIds.length >= 3} onChange={(e) => setInviteIds((old) => e.target.checked ? [...old, c.id] : old.filter((id) => id !== c.id))} />{avatar(c.avatar,c.name,"h-7 w-7")}<span>{c.name}</span></label>)}</div>
          <div className="mt-4 flex items-center justify-between"><span className="text-xs">{inviteIds.length}/3 selecionadas</span><button onClick={() => void createGroupConversation()} disabled={!inviteIds.length} className="rounded-full bg-gradient-to-b from-[#a71c29] to-[#780d19] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Criar conversa</button></div>
        </div>
      </div>}
      <style>{`
        .bs-messenger { font-family: Arial, Helvetica, sans-serif; }
        .bs-messenger .messenger-avatar { border:3px solid #f5fff0; border-radius:17px; box-shadow:0 0 0 2px #8bbd77, 0 0 13px 4px rgba(110,220,90,.72), inset 0 0 0 1px rgba(255,255,255,.85); background:#e9d6c6; }
        .bs-messenger .messenger-chat-area { min-height:0; max-height:100%; padding:3px 4px; }
        .bs-messenger .toolbar-btn { min-height:24px; padding:2px 6px; font-size:9px; }
        .bs-messenger .toolbar-btn svg { width:12px; height:12px; }
        .bs-messenger aside { background:var(--msg-sidebar) !important; color:#fff8f1; border-color:var(--msg-border) !important; }
        .bs-messenger aside .border-b, .bs-messenger aside .border-t { border-color:var(--msg-border) !important; }
        .bs-messenger aside input { color:var(--msg-text); }
        .bs-messenger main { background:var(--msg-bg) !important; color:var(--msg-text); }
        .bs-messenger main > div:first-child, .bs-messenger main > div:nth-child(2), .bs-messenger main > div:last-child { background:var(--msg-panel) !important; color:var(--msg-text); border-color:var(--msg-border) !important; }
        .bs-messenger .toolbar-btn { display:flex; align-items:center; gap:4px; border-radius:999px; border:1px solid var(--msg-border); background:linear-gradient(180deg,var(--msg-accent),var(--msg-sent)); color:#fff; padding:2px 6px; font-size:9px; font-weight:700; white-space:nowrap; box-shadow:0 2px 5px #0002; }
        .bs-messenger .toolbar-btn:hover { filter:brightness(1.12); }
        .bs-messenger .messenger-chat-area { background-color:var(--msg-bg) !important; color:var(--msg-text); transition:background-color .2s ease; }
        .bs-messenger .messenger-chat-area > div > div { border-color:var(--msg-border) !important; }
        .bs-messenger .messenger-chat-area > div > div[class*="bg-"] { background:var(--msg-received) !important; color:var(--msg-text) !important; }
        .bs-messenger .messenger-chat-area > div > div[class*="justify-end"] { background:transparent !important; }
        .bs-messenger .messenger-chat-area .rounded-\\[20px\\] { background:var(--msg-received) !important; color:var(--msg-text) !important; border-color:var(--msg-border) !important; }
        .bs-messenger .messenger-chat-area .rounded-br-md { background:var(--msg-sent) !important; color:#fff !important; border-color:var(--msg-accent) !important; }
        .bs-messenger textarea { color:var(--msg-text) !important; }
        .bs-messenger .border-t { border-color:var(--msg-border) !important; }
        .wink-message { width:min(310px,65vw); padding:3px 8px; }
        .wink-stage { position:relative; display:grid; place-items:center; min-height:125px; overflow:visible; }
        .wink-main { display:block; font-size:clamp(72px,9vw,120px); line-height:1; filter:drop-shadow(0 7px 2px #7b263522); animation:wink-bounce 1.05s ease-in-out infinite alternate; }
        .wink-spark { position:absolute; font-size:clamp(26px,4vw,44px); animation:wink-float 1.4s ease-in-out infinite alternate; }
        .spark-0 { left:4%; top:10%; }.spark-1 { right:4%; top:4%; animation-delay:.25s; }.spark-2 { left:8%; bottom:10%; animation-delay:.5s; }.spark-3 { right:9%; bottom:7%; animation-delay:.75s; }
        .wink-note { position:absolute; bottom:3px; left:22%; font-size:28px; letter-spacing:12px; animation:wink-float .7s ease-in-out infinite alternate; }
        .wink-pig .wink-main { animation:wink-dance .55s ease-in-out infinite alternate; }
        .wink-heart .wink-main { animation:wink-heartbeat .7s ease-in-out infinite; }
        .wink-kiss .wink-main { animation:wink-kiss 1s ease-in-out infinite; }
        .wink-dance .wink-main { animation:wink-dance .45s ease-in-out infinite alternate; }
        .wink-laugh .wink-main { animation:wink-shake .25s linear infinite; }
        .wink-surprise .wink-main { animation:wink-pop .7s ease-in-out infinite alternate; }
        .wink-rainbow .wink-main { animation:wink-float 1.1s ease-in-out infinite alternate; }
        @keyframes wink-bounce { from { transform:translateY(0) rotate(-3deg) } to { transform:translateY(-12px) rotate(3deg) } }
        @keyframes wink-dance { from { transform:rotate(-12deg) translateY(2px) } to { transform:rotate(12deg) translateY(-9px) } }
        @keyframes wink-heartbeat { 0%,100% { transform:scale(1) } 50% { transform:scale(1.16) } }
        @keyframes wink-kiss { 0%,100% { transform:scale(1) rotate(-5deg) } 50% { transform:scale(1.12) rotate(6deg) } }
        @keyframes wink-shake { 0%,100% { transform:rotate(-8deg) } 50% { transform:rotate(8deg) } }
        @keyframes wink-pop { from { transform:scale(.88) } to { transform:scale(1.12) } }
        @keyframes wink-float { from { transform:translateY(7px) rotate(-7deg) } to { transform:translateY(-9px) rotate(8deg) } }
        @keyframes messenger-attention { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        .messenger-attention { animation:messenger-attention .12s ease-in-out 8; }
        @media (prefers-reduced-motion: reduce) { .wink-main,.wink-spark,.wink-note,.messenger-attention { animation:none !important; } }
        @media (max-width: 1023px) { .bs-messenger .toolbar-btn { padding:4px 6px; } .wink-main { font-size:88px; } }
      `}</style>
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens — Book Society" }] }),
  component: MessengerPage,
});
