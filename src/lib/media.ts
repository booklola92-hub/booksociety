import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const BUCKET = "media";

/** Stored values are either full URLs (e.g. Google avatars) or paths inside the private media bucket. */
export function useMediaUrl(value: string | null | undefined) {
  const isPath = !!value && !/^https?:\/\//.test(value);
  const { data } = useQuery({
    queryKey: ["media-url", value],
    enabled: isPath,
    staleTime: 5 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(value!, 10);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  if (!value) return null;
  return isPath ? (data ?? null) : value;
}

export async function uploadMedia(userId: string, file: File, folder: string) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > 10 * 1024 * 1024) throw new Error("A imagem precisa ter até 10 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}
