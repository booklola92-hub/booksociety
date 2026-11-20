import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
export type Book = Tables<"books">;
export type ShelfItem = Tables<"shelf_items">;
export type ReadingGoal = Tables<"reading_goals">;
export type Community = Tables<"communities">;

export type MiniProfile = Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
export type MiniBook = Pick<Book, "id" | "title" | "author" | "cover_url">;

export async function getMyId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Você precisa entrar na sua conta.");
  return id;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const id = await getMyId();
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
}

/* ---------------- Posts ---------------- */

export type FeedFilter =
  | { kind: "following" }
  | { kind: "all" }
  | { kind: "user"; userId: string }
  | { kind: "saved" }
  | { kind: "single"; postId: string }
  | { kind: "search"; q: string }
  | { kind: "community"; communityId: string };

export interface PollView {
  options: { id: string; label: string; votes: number }[];
  total: number;
  myOptionId: string | null;
}

export interface PostView {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  edited: boolean;
  author: MiniProfile;
  book: MiniBook | null;
  community: Pick<Community, "id" | "slug" | "name"> | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  poll: PollView | null;
}

interface RawPost {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  author: MiniProfile | null;
  book: MiniBook | null;
  community: Pick<Community, "id" | "slug" | "name"> | null;
  poll_options: { id: string; label: string; position: number }[];
  likes: { count: number }[];
  comments: { count: number }[];
}

const POST_SELECT = `id, content, image_url, created_at, updated_at,
  author:profiles!posts_user_id_fkey(id, username, display_name, avatar_url),
  book:books(id, title, author, cover_url),
  community:communities(id, slug, name),
  poll_options(id, label, position),
  likes(count), comments(count)`;

export async function fetchPosts(filter: FeedFilter): Promise<PostView[]> {
  const me = await getMyId();
  let query = supabase.from("posts").select(POST_SELECT).order("created_at", { ascending: false }).limit(50);

  if (filter.kind === "following") {
    const { data: f, error } = await supabase.from("follows").select("following_id").eq("follower_id", me);
    if (error) throw error;
    query = query.in("user_id", [me, ...(f ?? []).map((r) => r.following_id)]);
  } else if (filter.kind === "user") {
    query = query.eq("user_id", filter.userId);
  } else if (filter.kind === "single") {
    query = query.eq("id", filter.postId);
  } else if (filter.kind === "search") {
    query = query.ilike("content", `%${filter.q.replace(/[%_]/g, "")}%`);
  } else if (filter.kind === "community") {
    query = query.eq("community_id", filter.communityId);
  } else if (filter.kind === "saved") {
    const { data: s, error } = await supabase
      .from("saves")
      .select("post_id")
      .eq("user_id", me)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const ids = (s ?? []).map((r) => r.post_id);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) throw error;
  const raw = (data ?? []) as unknown as RawPost[];
  if (raw.length === 0) return [];
  const ids = raw.map((p) => p.id);

  const [likesRes, savesRes, votesRes] = await Promise.all([
    supabase.from("likes").select("post_id").eq("user_id", me).in("post_id", ids),
    supabase.from("saves").select("post_id").eq("user_id", me).in("post_id", ids),
    supabase.from("poll_votes").select("post_id, option_id, user_id").in("post_id", ids),
  ]);
  const liked = new Set((likesRes.data ?? []).map((r) => r.post_id));
  const saved = new Set((savesRes.data ?? []).map((r) => r.post_id));
  const votes = votesRes.data ?? [];

  return raw
    .filter((p) => p.author)
    .map((p) => {
      let poll: PollView | null = null;
      if (p.poll_options.length > 0) {
        const postVotes = votes.filter((v) => v.post_id === p.id);
        poll = {
          options: [...p.poll_options]
            .sort((a, b) => a.position - b.position)
            .map((o) => ({ id: o.id, label: o.label, votes: postVotes.filter((v) => v.option_id === o.id).length })),
          total: postVotes.length,
          myOptionId: postVotes.find((v) => v.user_id === me)?.option_id ?? null,
        };
      }
      return {
        id: p.id,
        content: p.content,
        image_url: p.image_url,
        created_at: p.created_at,
        edited: new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 60_000,
        author: p.author!,
        book: p.book,
        community: p.community,
        likeCount: p.likes[0]?.count ?? 0,
        commentCount: p.comments[0]?.count ?? 0,
        likedByMe: liked.has(p.id),
        savedByMe: saved.has(p.id),
        poll,
      };
    });
}

export function postsKey(filter: FeedFilter) {
  return ["posts", filter] as const;
}

export function usePosts(filter: FeedFilter, enabled = true) {
  return useQuery({ queryKey: postsKey(filter), queryFn: () => fetchPosts(filter), enabled });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export async function createPost(input: {
  content: string;
  imagePath?: string | null;
  bookId?: string | null;
  pollOptions?: string[];
  communityId?: string | null;
}) {
  const me = await getMyId();
  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: me,
      content: input.content,
      image_url: input.imagePath ?? null,
      book_id: input.bookId ?? null,
      community_id: input.communityId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const options = (input.pollOptions ?? []).map((o) => o.trim()).filter(Boolean);
  if (options.length >= 2) {
    const { error: pollError } = await supabase
      .from("poll_options")
      .insert(options.map((label, position) => ({ post_id: data.id, label, position })));
    if (pollError) throw pollError;
  }
  return data.id;
}

export async function toggleLike(postId: string, liked: boolean) {
  const me = await getMyId();
  const { error } = liked
    ? await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", me)
    : await supabase.from("likes").insert({ post_id: postId, user_id: me });
  if (error) throw error;
}

export async function toggleSave(postId: string, saved: boolean) {
  const me = await getMyId();
  const { error } = saved
    ? await supabase.from("saves").delete().eq("post_id", postId).eq("user_id", me)
    : await supabase.from("saves").insert({ post_id: postId, user_id: me });
  if (error) throw error;
}

export async function votePoll(postId: string, optionId: string) {
  const me = await getMyId();
  const { error } = await supabase
    .from("poll_votes")
    .upsert({ post_id: postId, option_id: optionId, user_id: me }, { onConflict: "post_id,user_id" });
  if (error) throw error;
}

/* ---------------- Comments ---------------- */

export interface CommentView {
  id: string;
  content: string;
  created_at: string;
  author: MiniProfile;
}

export function useComments(postId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["comments", postId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, content, created_at, author:profiles!comments_user_id_fkey(id, username, display_name, avatar_url)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CommentView[];
    },
  });
}

/* ---------------- Follows ---------------- */

export function useFollowStats(userId: string | undefined) {
  return useQuery({
    queryKey: ["follow-stats", userId],
    enabled: !!userId,
    queryFn: async () => {
      const me = await getMyId();
      const [followers, following, mine] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId!),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId!),
        supabase.from("follows").select("follower_id").eq("follower_id", me).eq("following_id", userId!),
      ]);
      return {
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        iFollow: (mine.data ?? []).length > 0,
      };
    },
  });
}

export async function setFollow(targetId: string, follow: boolean) {
  const me = await getMyId();
  const { error } = follow
    ? await supabase.from("follows").insert({ follower_id: me, following_id: targetId })
    : await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", targetId);
  if (error) throw error;
}

export function useMyFollowingIds() {
  return useQuery({
    queryKey: ["follow-stats", "my-following"],
    queryFn: async () => {
      const me = await getMyId();
      const { data, error } = await supabase.from("follows").select("following_id").eq("follower_id", me);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.following_id));
    },
  });
}

export function useSuggestedReaders(limit = 5) {
  return useQuery({
    queryKey: ["follow-stats", "suggested", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("suggested_readers", { _limit: limit });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTrendingBooks(limit = 5) {
  return useQuery({
    queryKey: ["books", "trending", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("trending_books", { _limit: limit });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ---------------- Shelf ---------------- */

export type ShelfStatus = "want" | "reading" | "read";
export const SHELF_LABEL: Record<ShelfStatus, string> = {
  want: "Quero ler",
  reading: "Lendo",
  read: "Lido",
};

export type ShelfEntry = ShelfItem & { book: Book };

export function useShelf(userId: string | undefined) {
  return useQuery({
    queryKey: ["shelf", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shelf_items")
        .select("*, book:books(*)")
        .eq("user_id", userId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShelfEntry[];
    },
  });
}

export async function addToShelf(bookId: string, status: ShelfStatus) {
  const me = await getMyId();
  const { error } = await supabase
    .from("shelf_items")
    .upsert({ user_id: me, book_id: bookId, status }, { onConflict: "user_id,book_id" });
  if (error) throw error;
}

/* ---------------- Notifications & messages ---------------- */

export function useUnreadCounts() {
  return useQuery({
    queryKey: ["unread"],
    queryFn: async () => {
      const me = await getMyId();
      const [n, m] = await Promise.all([
        supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", me).eq("read", false),
        supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("recipient_id", me)
          .is("read_at", null),
      ]);
      return { notifications: n.count ?? 0, messages: m.count ?? 0 };
    },
  });
}
