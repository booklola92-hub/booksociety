import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/format";
import { uploadMedia } from "@/lib/media";
import { getMyId } from "@/lib/social";

export type CommunityRole = "owner" | "admin" | "member";

export interface CommunityCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  cover_url: string | null;
  avatar_url: string | null;
  is_private: boolean;
  member_count: number;
  my_role: CommunityRole | null;
  has_request: boolean;
}

export interface CommunityDetail extends CommunityCard {
  created_by: string;
  created_at: string;
}

export const isAdminRole = (r: CommunityRole | null | undefined) => r === "owner" || r === "admin";

/** Whether a reader may see the wall, members and gallery. */
export const canSeeContent = (c: Pick<CommunityCard, "is_private" | "my_role">) => !c.is_private || c.my_role !== null;

export function useCommunityList(search: string) {
  return useQuery({
    queryKey: ["communities", "list", search],
    queryFn: async (): Promise<CommunityCard[]> => {
      const { data, error } = await supabase.rpc("list_communities", { _search: search, _limit: 60 });
      if (error) throw error;
      return (data ?? []).map((c) => ({ ...c, member_count: Number(c.member_count), my_role: (c.my_role as CommunityRole | null) ?? null }));
    },
  });
}

export function useCommunityDetail(slug: string) {
  return useQuery({
    queryKey: ["communities", "detail", slug],
    queryFn: async (): Promise<CommunityDetail | null> => {
      const { data, error } = await supabase.rpc("community_detail", { _slug: slug });
      if (error) throw error;
      const c = data?.[0];
      return c ? { ...c, member_count: Number(c.member_count), my_role: (c.my_role as CommunityRole | null) ?? null } : null;
    },
  });
}

export function useCommunityMembers(communityId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["communities", "members", communityId],
    enabled: !!communityId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_members")
        .select("role, joined_at, profile:profiles!community_members_user_id_fkey(id, username, display_name, avatar_url)")
        .eq("community_id", communityId!)
        .order("joined_at");
      if (error) throw error;
      return (data ?? []).filter((m) => m.profile) as {
        role: CommunityRole;
        joined_at: string;
        profile: { id: string; username: string; display_name: string; avatar_url: string | null };
      }[];
    },
  });
}

export function useJoinRequests(communityId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["communities", "requests", communityId],
    enabled: !!communityId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_join_requests")
        .select("id, created_at, profile:profiles!community_join_requests_user_id_fkey(id, username, display_name, avatar_url)")
        .eq("community_id", communityId!)
        .eq("status", "pending")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).filter((r) => r.profile) as {
        id: string;
        created_at: string;
        profile: { id: string; username: string; display_name: string; avatar_url: string | null };
      }[];
    },
  });
}

export function useCommunityGallery(communityId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["communities", "gallery", communityId],
    enabled: !!communityId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, image_url, content, created_at")
        .eq("community_id", communityId!)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ---------------- Actions ---------------- */

const check = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export async function createCommunity(input: { name: string; description: string; isPrivate: boolean; cover?: File | null }) {
  const me = await getMyId();
  const name = input.name.trim();
  if (name.length < 3 || name.length > 80) throw new Error("O nome precisa ter entre 3 e 80 caracteres.");
  if (input.description.length > 1000) throw new Error("A descrição pode ter até 1000 caracteres.");
  const base = slugify(name).slice(0, 40) || "comunidade";
  const slug = `${base.length >= 3 ? base : `${base}-com`}-${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await supabase
    .from("communities")
    .insert({ name, slug, description: input.description.trim(), created_by: me, is_private: input.isPrivate })
    .select("id, slug")
    .single();
  check(error);
  if (input.cover && data) {
    const path = await uploadMedia(me, input.cover, `communities/${data.id}`);
    check((await supabase.from("communities").update({ cover_url: path }).eq("id", data.id)).error);
  }
  return data!;
}

export async function updateCommunity(
  id: string,
  patch: { name?: string; description?: string; is_private?: boolean; cover?: File | null; avatar?: File | null },
) {
  const me = await getMyId();
  const update: { name?: string; description?: string; is_private?: boolean; cover_url?: string; avatar_url?: string } = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n.length < 3 || n.length > 80) throw new Error("O nome precisa ter entre 3 e 80 caracteres.");
    update.name = n;
  }
  if (patch.description !== undefined) {
    if (patch.description.length > 1000) throw new Error("A descrição pode ter até 1000 caracteres.");
    update.description = patch.description.trim();
  }
  if (patch.is_private !== undefined) update.is_private = patch.is_private;
  if (patch.cover) update.cover_url = await uploadMedia(me, patch.cover, `communities/${id}`);
  if (patch.avatar) update.avatar_url = await uploadMedia(me, patch.avatar, `communities/${id}`);
  check((await supabase.from("communities").update(update).eq("id", id)).error);
}

export async function joinCommunity(c: Pick<CommunityCard, "id" | "is_private">) {
  const me = await getMyId();
  if (c.is_private) {
    check((await supabase.from("community_join_requests").insert({ community_id: c.id, user_id: me })).error);
  } else {
    check((await supabase.from("community_members").insert({ community_id: c.id, user_id: me, role: "member" })).error);
  }
}

export async function cancelJoinRequest(communityId: string) {
  const me = await getMyId();
  check((await supabase.from("community_join_requests").delete().eq("community_id", communityId).eq("user_id", me)).error);
}

export async function leaveCommunity(communityId: string) {
  const me = await getMyId();
  check((await supabase.from("community_members").delete().eq("community_id", communityId).eq("user_id", me)).error);
}

export async function decideRequest(requestId: string, approve: boolean) {
  check((await supabase.rpc("decide_join_request", { _request: requestId, _approve: approve })).error);
}

export async function setMemberRole(communityId: string, userId: string, role: "admin" | "member") {
  check((await supabase.rpc("set_community_member_role", { _community: communityId, _user: userId, _role: role })).error);
}

export async function removeMember(communityId: string, userId: string) {
  check((await supabase.rpc("remove_community_member", { _community: communityId, _user: userId })).error);
}
