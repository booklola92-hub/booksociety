import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, UserPlus, Users, CalendarDays, Search, Folder, Camera, Image as ImageIcon, Smile, Bell, Send, Palette, Music2, Heart, Gift, Settings, Shirt, Volume2, VolumeX, Pencil, X, ChevronDown, Radio, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/social";

type Contact = { id: string; name: string; handle: string; avatar: string | null };
type ChatMessage = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string; read_at: string | null };
type WinkKind = "pig" | "heart" | "kiss" | "dance" | "laugh" | "surprise" | "rainbow";
type Wink = { kind: WinkKind; label: string; icon: string; caption: string };
type SpotifyTrack = { name: string; artist: string; album: string; image: string | null; url: string | null; isPlaying: boolean };
const stamp = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const emojis = ["😀", "😂", "😍", "🥰", "😘", "😉", "😮", "😎", "🥳", "❤️", "💋", "📚", "✨", "🙈", "👏", "🤍", "🤣", "🌹", "🐷", "🌈"];
const winks: Wink[] = [
  { kind: "pig", label: "Porquinho dançante", icon: "🐷", caption: "Olha quem veio dançar!" },
  { kind: "heart", label: "Coração", icon: "🐱", caption: "Um coração para você!" },
  { kind: "kiss", label: "Beijo", icon: "💋", caption: "Mil beijos!" },
  { kind: "dance", label: "Dança", icon: "💃", caption: "Vamos dançar!" },
  { kind: "laugh", label: "Gargalhada", icon: "🤣", caption: "Não consigo parar de rir!" },
  { kind: "surprise", label: "Surpresa", icon: "😲", caption: "Surpresaaa!" },
  { kind: "rainbow", label: "Arco-íris", icon: "🌈", caption: "Um dia colorido para você!" },
];
const spotifyClientId = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_SPOTIFY_CLIENT_ID || (typeof window !== "undefined" ? localStorage.getItem("book-spotify-client-id") || "6e85fcfa359647fc83b03995dc17e035" : "6e85fcfa359647fc83b03995dc17e035");
const spotifyScopes = "user-read-currently-playing user-read-playback-state";

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function spotifyChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}
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

function MessengerPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [phrase, setPhrase] = useState("Sonhe, leia, converse...");
  const [draftPhrase, setDraftPhrase] = useState(phrase);
  const [editingPhrase, setEditingPhrase] = useState(false);
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [winksOpen, setWinksOpen] = useState(false);
  const [attention, setAttention] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [spotifyTrack, setSpotifyTrack] = useState<SpotifyTrack | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyError, setSpotifyError] = useState("");
  const [chatTheme, setChatTheme] = useState("cream");
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const lastIncomingRef = useRef<string | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("book-messenger-phrase");
    if (saved) { setPhrase(saved); setDraftPhrase(saved); }
    setSoundOn(window.localStorage.getItem("book-messenger-sound") !== "off");
  }, []);
  useEffect(() => {
    setChatTheme(window.localStorage.getItem("book-messenger-theme-" + selected) || "cream");
  }, [selected]);

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
    queryKey: ["messages", "conversation", me?.id, selected], enabled: !!me?.id && !!selected,
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
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messenger_presence" }, () => {
        qc.invalidateQueries({ queryKey: ["messages", "presence"] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [me?.id, qc]);

  const contact = contacts.find((c) => c.id === selected);
  const messages = messagesQuery.data ?? [];
  const myPresence = myPresenceQuery.data;
  const contactPresence = contactPresenceQuery.data;
  const displayName = me?.display_name || me?.username || "Leitora";
  const myAvatar = me?.avatar_url || null;
  const avatar = (url: string | null, name: string, size = "h-10 w-10", extra = "") => url
    ? <img src={url} alt={name} className={`${size} shrink-0 rounded-full border-2 border-[#c98f79] object-cover ${extra}`} />
    : <div className={`${size} grid shrink-0 place-items-center rounded-full border-2 border-[#c98f79] bg-[#ead9c8] font-semibold text-[#a71925] ${extra}`}>{name.slice(0, 1).toUpperCase()}</div>;

  async function sendContent(value: string) {
    if (!value.trim() || !me?.id || !selected) return;
    const { error } = await supabase.from("messages").insert({ sender_id: me.id, recipient_id: selected, content: value });
    if (error) { console.error("Erro ao enviar mensagem:", error); return; }
    await qc.invalidateQueries({ queryKey: ["messages", "conversation", me.id, selected] });
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
  function chooseTheme(theme: string) {
    setChatTheme(theme);
    window.localStorage.setItem("book-messenger-theme-" + selected, theme);
    setBackgroundOpen(false);
  }
  async function callAttention() {
    if (!selected) return;
    setAttention(true); window.setTimeout(() => setAttention(false), 1100);
    await sendContent("[NUDGE] chamou sua atenção!");
  }

  useEffect(() => {
    if (!messages.length) return;
    const latest = messages[messages.length - 1];
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

  async function getSpotifyAccessToken() {
    let token = localStorage.getItem("book-spotify-token");
    const expiresAt = Number(localStorage.getItem("book-spotify-expires") || "0");
    if (token && expiresAt > Date.now() + 60000) return token;
    const refreshToken = localStorage.getItem("book-spotify-refresh");
    if (!refreshToken || !spotifyClientId) return token;
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: spotifyClientId, grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    if (!response.ok) {
      localStorage.removeItem("book-spotify-token");
      setSpotifyConnected(false);
      setSpotifyError("Sua sessão do Spotify expirou. Conecte novamente.");
      return null;
    }
    const tokens = await response.json();
    token = tokens.access_token as string;
    localStorage.setItem("book-spotify-token", token);
    localStorage.setItem("book-spotify-expires", String(Date.now() + Number(tokens.expires_in) * 1000));
    if (tokens.refresh_token) localStorage.setItem("book-spotify-refresh", tokens.refresh_token as string);
    return token;
  }

  async function refreshSpotify() {
    const token = await getSpotifyAccessToken();
    if (!token) return;
    const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 204) { setSpotifyTrack(null); return; }
    if (response.status === 401) {
      localStorage.removeItem("book-spotify-token");
      localStorage.removeItem("book-spotify-expires");
      const renewed = await getSpotifyAccessToken();
      if (!renewed) return;
      const retry = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers: { Authorization: `Bearer ${renewed}` } });
      if (retry.status === 204) { setSpotifyTrack(null); return; }
      if (!retry.ok) throw new Error("Não foi possível consultar o Spotify.");
      const retryData = await retry.json();
      if (!retryData.item) { setSpotifyTrack(null); return; }
      setSpotifyTrack({ name: retryData.item.name, artist: retryData.item.artists?.map((a: { name: string }) => a.name).join(", ") ?? "Artista", album: retryData.item.album?.name ?? "", image: retryData.item.album?.images?.[0]?.url ?? null, url: retryData.item.external_urls?.spotify ?? null, isPlaying: !!retryData.is_playing });
      return;
    }
    if (!response.ok) throw new Error("Não foi possível consultar o Spotify.");
    const data = await response.json();
    if (!data.item) { setSpotifyTrack(null); return; }
    setSpotifyTrack({
      name: data.item.name,
      artist: data.item.artists?.map((a: { name: string }) => a.name).join(", ") ?? "Artista",
      album: data.item.album?.name ?? "",
      image: data.item.album?.images?.[0]?.url ?? null,
      url: data.item.external_urls?.spotify ?? null,
      isPlaying: !!data.is_playing,
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const savedState = localStorage.getItem("book-spotify-state");
    const verifier = localStorage.getItem("book-spotify-verifier");
    if (code && state && savedState && state === savedState && verifier && spotifyClientId) {
      const redirectUri = window.location.origin + window.location.pathname;
      void (async () => {
        try {
          const body = new URLSearchParams({ client_id: spotifyClientId, grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
          const response = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
          if (!response.ok) throw new Error("O Spotify não autorizou a conexão.");
          const tokens = await response.json();
          localStorage.setItem("book-spotify-token", tokens.access_token);
          if (tokens.refresh_token) localStorage.setItem("book-spotify-refresh", tokens.refresh_token);
          localStorage.setItem("book-spotify-expires", String(Date.now() + tokens.expires_in * 1000));
          setSpotifyConnected(true); setSpotifyError("");
          localStorage.removeItem("book-spotify-state"); localStorage.removeItem("book-spotify-verifier");
          window.history.replaceState({}, "", redirectUri);
          await refreshSpotify();
        } catch (error) { setSpotifyError(error instanceof Error ? error.message : "Erro ao conectar ao Spotify."); }
      })();
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("book-spotify-token");
    if (!token && !localStorage.getItem("book-spotify-refresh")) return;
    setSpotifyConnected(true);
    void refreshSpotify().catch(() => setSpotifyError("Não foi possível carregar a música atual."));
    const timer = window.setInterval(() => { void refreshSpotify().catch(() => undefined); }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function connectSpotify() {
    const clientId = spotifyClientId || window.prompt("Cole o Client ID do seu aplicativo Spotify Developer. Não informe o Client Secret.")?.trim();
    if (!clientId) { setSpotifyError("Informe o Client ID do Spotify para continuar."); return; }
    if (!spotifyClientId) localStorage.setItem("book-spotify-client-id", clientId);
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
    const challenge = await spotifyChallenge(verifier);
    const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem("book-spotify-verifier", verifier); localStorage.setItem("book-spotify-state", state);
    const redirectUri = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, code_challenge_method: "S256", code_challenge: challenge, state, scope: spotifyScopes });
    window.location.assign("https://accounts.spotify.com/authorize?" + params.toString());
  }
  function disconnectSpotify() {
    ["book-spotify-token", "book-spotify-refresh", "book-spotify-expires"].forEach((key) => localStorage.removeItem(key));
    setSpotifyConnected(false); setSpotifyTrack(null); setSpotifyError("");
    if (me?.id) void supabase.from("messenger_presence").upsert({ user_id: me.id, spotify_track_name: null, spotify_artist: null, spotify_album_image: null, spotify_url: null, spotify_is_playing: false }, { onConflict: "user_id" });
  }

  useEffect(() => {
    if (!me?.id || !spotifyConnected) return;
    void supabase.from("messenger_presence").upsert({
      user_id: me.id,
      spotify_track_name: spotifyTrack?.name ?? null,
      spotify_artist: spotifyTrack?.artist ?? null,
      spotify_album_image: spotifyTrack?.image ?? null,
      spotify_url: spotifyTrack?.url ?? null,
      spotify_is_playing: spotifyTrack?.isPlaying ?? false,
    }, { onConflict: "user_id" }).then(({ error }) => {
      if (error) console.error("Não foi possível compartilhar sua música:", error);
      else void qc.invalidateQueries({ queryKey: ["messages", "presence", me.id] });
    });
  }, [me?.id, spotifyConnected, spotifyTrack, qc]);

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

  return (
    <section className="bs-messenger mx-auto max-w-[1600px] overflow-hidden rounded-[22px] border-2 border-[#c98f79] bg-[#fff4e5] text-[#981d27] shadow-[0_14px_38px_rgba(90,25,25,.13)]">
      <div className="flex items-center gap-2 bg-gradient-to-r from-[#790d19] to-[#a51b28] px-4 py-2 text-[#fff8ed]">
        <BookOpen size={25} strokeWidth={2.2} />
        <span className="text-base font-semibold tracking-tight">Book Society Messenger</span>
        <span className="ml-auto hidden text-xs text-[#ffe4d3] sm:block">● Conectado</span>
      </div>

      <div className="grid min-h-[620px] grid-cols-1 lg:grid-cols-[minmax(220px,22%)_minmax(0,1fr)_minmax(165px,15%)]">
        <aside className="border-b-2 border-[#d9b49b] bg-[#f4e5d1] lg:border-b-0 lg:border-r-2">
          <div className="flex items-center gap-3 border-b border-[#d9b49b] p-3">
            {avatar(myAvatar, displayName, "h-14 w-14", "max-h-14 max-w-14")}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{displayName} <ChevronDown className="inline" size={16} /></p>
              <p className="mt-1 text-xs text-[#258a43]">● Online</p>
              {editingPhrase ? <div className="mt-2 flex gap-1"><input value={draftPhrase} onChange={(e) => setDraftPhrase(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePhrase()} className="min-w-0 w-full rounded border border-[#d9b49b] bg-[#fffaf1] px-2 py-1 text-xs" /><button onClick={savePhrase} className="text-xs font-bold">OK</button></div> : <button onClick={() => { setDraftPhrase(phrase); setEditingPhrase(true); }} className="mt-1 text-left text-xs italic">“{phrase}” <Pencil className="inline" size={13} /></button>}
              <div className="mt-2 flex items-center gap-2">
                {spotifyTrack?.image ? <img src={spotifyTrack.image} alt="" className="h-7 w-7 rounded-md object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-[#1db954] text-base text-white">♫</span>}
                <div className="min-w-0 text-[11px] leading-tight"><p className="font-semibold">Você está ouvindo:</p>{spotifyTrack ? <a href={spotifyTrack.url ?? "#"} target="_blank" rel="noreferrer" className="block truncate underline">{spotifyTrack.name} — {spotifyTrack.artist}</a> : <p className="text-[#8c5b51]">Conecte seu Spotify</p>}</div>
                <Music2 className="ml-auto shrink-0" size={16} />
              </div>
              <button onClick={spotifyConnected ? disconnectSpotify : connectSpotify} className="mt-1 rounded-full bg-[#168b45] px-2 py-1 text-[9px] font-bold text-white">{spotifyConnected ? "Desconectar Spotify" : "Conectar Spotify"}</button>
              {spotifyError && <p className="mt-1 text-[10px] leading-tight text-[#a71925]">{spotifyError}</p>}
            </div>
          </div>

          <div className="flex items-center justify-around border-b border-[#d9b49b] py-2">
            <button className="rounded-lg p-2 hover:bg-[#ead5bd]" title="Convidar"><UserPlus size={20} /></button>
            <button className="rounded-lg p-2 hover:bg-[#ead5bd]" title="Grupos"><Users size={20} /></button>
            <button className="rounded-lg p-2 hover:bg-[#ead5bd]" title="Calendário"><CalendarDays size={20} /></button>
          </div>
          <div className="p-3">
            <div className="flex items-center gap-2 rounded-full border border-[#d9a78d] bg-[#fff8ed] px-3 py-1.5"><Search size={16} /><input placeholder="Pesquisar contatos..." className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-[#b78c79]" onChange={(e) => { const q = e.target.value.toLowerCase(); document.querySelectorAll("[data-contact-name]").forEach((el) => { (el as HTMLElement).style.display = (el.getAttribute("data-contact-name") ?? "").includes(q) ? "" : "none"; }); }} /></div>
          </div>
          <div className="px-3 pb-1 text-sm font-bold">🟢 Online ({contacts.length})</div>
          <div className="max-h-[360px] overflow-y-auto px-2 pb-2">
            {contactsQuery.isLoading && <p className="p-4 text-xs">Carregando contatos…</p>}
            {contactsQuery.isError && <p className="p-4 text-xs">Não foi possível carregar os contatos.</p>}
            {!contactsQuery.isLoading && !contacts.length && <p className="p-4 text-xs text-[#8c5b51]">Seus contatos aparecerão aqui quando você seguir alguém ou aceitar uma amizade.</p>}
            {contacts.map((c) => <button key={c.id} data-contact-name={c.name.toLowerCase()} onClick={() => setSelected(c.id)} className={`mb-1 flex w-full items-center gap-2 rounded-lg border p-1.5 text-left transition ${selected === c.id ? "border-[#9a1d29] bg-[#ead6c0]" : "border-transparent hover:bg-[#fff8ed]"}`}>
              {avatar(c.avatar, c.name, "h-9 w-9")}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{c.name}</span><span className="block truncate text-[11px] text-[#8c5b51]">{c.handle}</span></span><span className="text-xs text-[#a71925]">▮▮▮</span>
            </button>)}
          </div>
          <div className="flex items-center gap-5 border-t border-[#d9b49b] px-4 py-2"><Settings size={18} /><Shirt size={18} /><Bell size={18} /></div>
        </aside>

        <main className={`flex min-h-[620px] min-w-0 flex-col bg-[#fff8ed] ${attention ? "messenger-attention" : ""}`}>
          {contact ? <>
            <div className="flex items-center gap-3 border-b border-[#d9b49b] bg-[#fff2df] px-3 py-2">
              {avatar(contact.avatar, contact.name, "h-12 w-12")}
              <div className="min-w-0"><p className="text-base font-bold">{contact.name} <ChevronDown className="inline" size={17} /></p><p className="mt-1 text-sm text-[#258a43]">● <span className="text-[#351c17]">Online</span></p><p className="mt-0.5 text-xs italic">“{contactPresence?.status_text || "Sonhe, leia, converse..."}” <Heart className="inline" size={15} /></p></div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[#d9b49b] bg-[#f8ead7] px-2 py-1.5">
              <button className="toolbar-btn"><UserPlus size={19} />Convidar</button>
              <button className="toolbar-btn"><Folder size={19} />Enviar arquivos</button>
              <button onClick={() => { setEmojiOpen(!emojiOpen); setWinksOpen(false); }} className="toolbar-btn"><Smile size={20} />Emoticons <ChevronDown size={13} /></button>
              <button onClick={() => { setWinksOpen(!winksOpen); setEmojiOpen(false); }} className="toolbar-btn"><span className="text-lg">✦</span>Winks <ChevronDown size={13} /></button>
              <button className="toolbar-btn"><Camera size={19} />Enviar fotos</button>
              <button onClick={() => { setBackgroundOpen(!backgroundOpen); setWinksOpen(false); setEmojiOpen(false); }} className="toolbar-btn"><ImageIcon size={19} />Planos de fundo <ChevronDown size={13} /></button>
            </div>
            <div className="mx-2 mt-1.5 flex items-center gap-2 rounded-full border border-[#d9a78d] bg-[#ffefe1] px-3 py-1.5 text-xs"><span className="text-sm">ⓘ</span><span className="flex-1">Nunca compartilhe sua senha ou dados pessoais com ninguém.</span><X size={15} /></div>

            <div ref={conversationRef} className={`messenger-chat-area messenger-theme-${chatTheme} flex-1 space-y-2 overflow-y-auto px-3 py-3`}>
              {messagesQuery.isLoading && <p className="py-10 text-center text-sm">Carregando mensagens…</p>}
              {messages.map((m) => {
                const mine = m.sender_id === me?.id;
                const winkKind = winkFromContent(m.content);
                const isNudge = m.content.startsWith("[NUDGE]");
                const clean = winkKind ? (winks.find((w) => w.kind === winkKind)?.caption ?? m.content.replace(/^\[WINK[^\]]*\]/, "")) : m.content.replace(/^\[NUDGE\]/, "🔔 ");
                if (winkKind) return <div key={m.id} className={`flex items-center gap-3 py-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && avatar(contact.avatar, contact.name, "h-12 w-12")}
                  <div className="wink-message">
                    <WinkArtwork kind={winkKind} />
                    <p className="text-center text-xs font-semibold">{clean}</p>
                    <p className="mt-1 text-right text-[10px] text-[#9c6d60]">{stamp(m.created_at)}</p>
                  </div>
                  {mine && avatar(myAvatar, displayName, "h-12 w-12")}
                </div>;
                return <div key={m.id} className={`flex items-end gap-2 py-1 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && avatar(contact.avatar, contact.name, "h-10 w-10")}
                  <div className={`max-w-[80%] rounded-[20px] border border-[#d9a78d] bg-[#fff4e5] px-4 py-2 text-[#981d27] shadow-sm ${mine ? "rounded-br-md" : "rounded-bl-md"} ${isNudge ? "font-bold" : ""}`}>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{clean}</p><p className="mt-1 text-right text-[10px] text-[#9c6d60]">{stamp(m.created_at)}{mine && m.read_at ? " · lida" : ""}</p>
                  </div>
                  {mine && avatar(myAvatar, displayName, "h-12 w-12")}
                </div>;
              })}
              {!messagesQuery.isLoading && !messages.length && <p className="py-12 text-center text-sm text-[#9c6d60]">Diga oi e comece uma conversa!</p>}
            </div>

            <div className="border-t border-[#d9a78d] bg-[#fff2df] p-2">
              <div className="relative mb-2 flex flex-wrap items-center gap-1.5 border-b border-[#d9b49b] pb-1.5">
                <button className="rounded-md px-2 py-1 text-xl font-bold hover:bg-[#f0dfcb]" title="Fonte">A</button>
                <button onClick={() => { setEmojiOpen(!emojiOpen); setWinksOpen(false); }} className="rounded-md p-1.5 hover:bg-[#f0dfcb]" title="Emoticons"><Smile size={20} /></button>
                <button className="rounded-md p-1.5 hover:bg-[#f0dfcb]" title="Enviar foto"><ImageIcon size={20} /></button>
                <button className="rounded-md p-1.5 hover:bg-[#f0dfcb]" title="Presentes"><Gift size={20} /></button>
                <button onClick={() => void sendWink(winks[0])} className="rounded-md p-1.5 text-lg hover:bg-[#f0dfcb]" title="Porquinho dançante">🐷</button>
                <button onClick={() => void sendWink(winks[1])} className="rounded-md p-2 text-2xl hover:bg-[#f0dfcb]" title="Coração">❤️</button>
                <button onClick={() => void sendWink(winks[2])} className="rounded-md p-2 text-2xl hover:bg-[#f0dfcb]" title="Beijo">💋</button>
                <button onClick={() => void sendWink(winks[3])} className="rounded-md p-2 text-2xl hover:bg-[#f0dfcb]" title="Dança">♫</button>
                <button onClick={() => { setBackgroundOpen(!backgroundOpen); setWinksOpen(false); setEmojiOpen(false); }} className="ml-auto rounded-md px-2 py-1.5 text-xs font-semibold hover:bg-[#f0dfcb]"><Palette className="mr-1 inline" size={15} />Fundo da conversa <ChevronDown className="ml-2 inline" size={15} /></button>
                <button onClick={() => { const next = !soundOn; setSoundOn(next); localStorage.setItem("book-messenger-sound", next ? "on" : "off"); }} className="rounded-md p-2 hover:bg-[#f0dfcb]" title={soundOn ? "Desativar som" : "Ativar som"}>{soundOn ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
                {emojiOpen && <div className="absolute bottom-12 left-8 z-30 grid grid-cols-8 gap-1 rounded-xl border-2 border-[#9a1d29] bg-[#fffaf1] p-3 shadow-xl">{emojis.map((emoji) => <button key={emoji} onClick={() => { setDraft((v) => v + emoji); setEmojiOpen(false); }} className="rounded p-1 text-2xl hover:bg-[#f0dfcf]">{emoji}</button>)}</div>}
                {winksOpen && <div className="absolute bottom-12 left-1/3 z-30 grid grid-cols-2 gap-2 rounded-xl border-2 border-[#9a1d29] bg-[#fffaf1] p-3 shadow-xl sm:grid-cols-3">{winks.map((wink) => <button key={wink.kind} onClick={() => void sendWink(wink)} className="flex min-w-28 items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-[#f0dfcf]"><span className="text-3xl">{wink.icon}</span><span>{wink.label}</span></button>)}</div>}
                {backgroundOpen && <div className="absolute bottom-12 right-2 z-30 grid grid-cols-2 gap-2 rounded-xl border-2 border-[#9a1d29] bg-[#fffaf1] p-3 shadow-xl">
                  {[["cream","Creme","#fff8ed"],["rose","Rosa suave","#f8e5e1"],["mint","Verde menta","#e5f1e9"],["lilac","Lavanda","#eee8f7"],["night","Noite","#34252b"]].map(([id,label,color]) => <button key={id} onClick={() => chooseTheme(id)} className="flex items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-[#f0dfcf]"><span className="h-5 w-5 rounded-full border border-[#b78c79]" style={{backgroundColor:color}} />{label}</button>)}
                </div>}
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-[#d9a78d] bg-[#fffaf3] p-1.5">
                <textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} placeholder="Digite sua mensagem..." className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-xs text-[#981d27] outline-none placeholder:text-[#b78c79]" />
                <button onClick={() => void sendMessage()} disabled={!draft.trim()} className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-[#a71c29] to-[#780d19] px-4 py-2.5 text-sm font-bold text-white shadow hover:brightness-110 disabled:opacity-40"><Send size={16} />Enviar</button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button onClick={callAttention} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-[#f0dfcb]"><Bell size={18} />Chamar atenção <ChevronDown size={15} /></button>
                <span className="text-[10px] text-[#9c6d60]">Enter para enviar · Shift + Enter para pular linha</span>
              </div>
            </div>
          </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><p className="text-xl font-semibold">Seu cantinho de conversas</p><p className="mt-2 max-w-sm text-sm text-[#9c6d60]">Adicione amigos ou conecte-se com leitores para começar a conversar.</p></div></div>}
        </main>

        <aside className="border-t border-[#d9b49b] bg-[#f4e5d1] p-3 lg:border-l lg:border-t-0">
          <div className="flex flex-row items-center justify-around gap-3 lg:flex-col lg:justify-start">
            <div className="flex flex-col items-center gap-2 text-center">
              {avatar(contact?.avatar ?? null, contact?.name ?? "Contato", "h-16 w-16")}
              <p className="text-sm font-bold">{contact?.name ?? "Contato"}</p><p className="text-sm text-[#258a43]">● <span className="text-[#351c17]">Online</span></p><p className="text-xs italic">“{contactPresence?.status_text || "Sonhe, leia, converse..."}” <Heart className="inline" size={13} /></p>
            </div>
            <div className="my-3 hidden w-full border-t border-[#d9b49b] lg:block" />
            <div className="flex flex-col items-center gap-2 text-center">
              {avatar(myAvatar, displayName, "h-16 w-16")}
              <p className="text-sm font-bold">{displayName}</p><p className="text-sm text-[#258a43]">● <span className="text-[#351c17]">Online</span></p><p className="text-xs italic">“{phrase}” <Heart className="inline" size={13} /></p>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-[#d9b49b] bg-[#fff8ed] p-2 text-center">
            <p className="text-sm font-bold"><Music2 className="mr-1 inline" size={15} /> Spotify</p>
            {contactPresence?.spotify_track_name ? <div className="mt-2 flex items-center gap-2 text-left">{contactPresence.spotify_album_image && <img src={contactPresence.spotify_album_image} alt="" className="h-10 w-10 rounded object-cover" />}<div className="min-w-0"><p className="truncate text-xs font-semibold">{contactPresence.spotify_track_name}</p><p className="truncate text-[10px]">{contactPresence.spotify_artist}</p><p className="text-[9px] text-[#258a43]">{contactPresence.spotify_is_playing ? "● Ouvindo agora" : "Pausado"}</p></div></div> : <p className="mt-1 text-[10px] text-[#8c5b51]">Quando essa pessoa conectar o Spotify, a música aparecerá aqui.</p>}
          </div>
        </aside>
      </div>

      <style>{`
        .bs-messenger { font-family: Arial, Helvetica, sans-serif; }
        .bs-messenger .toolbar-btn { display:flex; align-items:center; gap:7px; border-radius:999px; border:1px solid #c98f79; background:linear-gradient(180deg,#a91d2b,#790d19); color:#fff8ed; padding:9px 13px; font-size:12px; font-weight:700; white-space:nowrap; box-shadow:0 2px 3px #7c172422; }
        .bs-messenger .toolbar-btn:hover { filter:brightness(1.12); }
        .messenger-chat-area { background-color:#fff8ed; transition:background-color .2s ease; }
        .messenger-theme-rose { background-color:#f8e5e1; }
        .messenger-theme-mint { background-color:#e5f1e9; }
        .messenger-theme-lilac { background-color:#eee8f7; }
        .messenger-theme-night { background-color:#34252b; color:#fff2e6; }
        .messenger-theme-night .rounded-\\[24px\\] { background-color:#513942; color:#fff2e6; border-color:#8d6670; }
        .wink-message { width:min(310px,65vw); padding:3px 8px; }
        .wink-stage { position:relative; display:grid; place-items:center; min-height:185px; overflow:visible; }
        .wink-main { display:block; font-size:clamp(100px,13vw,168px); line-height:1; filter:drop-shadow(0 7px 2px #7b263522); animation:wink-bounce 1.05s ease-in-out infinite alternate; }
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
        @media (max-width: 1023px) { .bs-messenger .toolbar-btn { padding:8px 10px; } .wink-main { font-size:112px; } }
      `}</style>
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens — Book Society" }] }),
  component: MessengerPage,
});
