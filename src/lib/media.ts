import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

const BUCKET = "media";

/**
 * Private files are never turned into shareable signed links. Each read goes to the
 * authenticated storage endpoint with the reader's session, so the access rules are
 * checked at the moment of access, and the browser is told not to keep a copy.
 */
export async function fetchPrivateObject(bucket: string, path: string): Promise<Blob | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  const base = import.meta.env["VITE_SUPABASE_URL"] as string;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${base}/storage/v1/object/authenticated/${bucket}/${encoded}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: key },
    cache: "no-store",
  });
  // Revoked, removed or never allowed: show nothing instead of keeping an older copy.
  if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error("Não foi possível carregar o arquivo.");
  return res.blob();
}

/** Stored values are either full URLs (e.g. Google avatars) or paths inside the private media bucket. */
export function useMediaUrl(value: string | null | undefined) {
  const isPath = !!value && !/^https?:\/\//.test(value);
  const { data: blob } = useQuery({
    queryKey: ["media-blob", value],
    enabled: isPath,
    staleTime: 0,
    gcTime: 30 * 1000,
    refetchOnWindowFocus: "always",
    queryFn: () => fetchPrivateObject(BUCKET, value!),
  });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isPath || !blob) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob, isPath]);
  if (!value) return null;
  return isPath ? objectUrl : value;
}

export async function uploadMedia(userId: string, file: File, folder: string) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > 10 * 1024 * 1024) throw new Error("A imagem precisa ter até 10 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "0" });
  if (error) throw error;
  return path;
}
