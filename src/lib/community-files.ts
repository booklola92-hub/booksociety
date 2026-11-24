import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { fetchPrivateObject } from "@/lib/media";
import { getMyId } from "@/lib/social";

export const COMMUNITY_FILES_BUCKET = "community-files";
export const MAX_COMMUNITY_FILE_BYTES = 20 * 1024 * 1024;

/** Accepted file types (extension → MIME). Mirrors the storage bucket's allow-list. */
export const ALLOWED_COMMUNITY_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export const COMMUNITY_FILE_ACCEPT = Object.keys(ALLOWED_COMMUNITY_FILE_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export function fileExtension(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** Returns the MIME type to store, or throws a message in Portuguese explaining why the file is refused. */
export function validateCommunityFile(file: { name: string; size: number }): string {
  const mime = ALLOWED_COMMUNITY_FILE_TYPES[fileExtension(file.name)];
  if (!mime) throw new Error("Tipo de arquivo não permitido. Envie PDF, EPUB, documentos, planilhas, apresentações, texto ou imagens.");
  if (file.size <= 0) throw new Error("O arquivo está vazio.");
  if (file.size > MAX_COMMUNITY_FILE_BYTES) throw new Error("O arquivo precisa ter até 20 MB.");
  return mime;
}

/** Keeps letters, numbers, dots, dashes and underscores so storage paths are always safe. */
export function safeFileName(name: string) {
  const ext = fileExtension(name);
  const base = (ext ? name.slice(0, -(ext.length + 1)) : name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "arquivo"}${ext ? `.${ext}` : ""}`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function fileTypeLabel(name: string) {
  const ext = fileExtension(name);
  return ext ? ext.toUpperCase() : "Arquivo";
}

export interface CommunityFile {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  uploader_id: string;
  uploader: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

export function useCommunityFiles(communityId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["communities", "files", communityId],
    enabled: !!communityId && enabled,
    queryFn: async (): Promise<CommunityFile[]> => {
      const { data, error } = await supabase
        .from("community_files")
        .select(
          "id, name, storage_path, mime_type, size_bytes, created_at, uploader_id, uploader:profiles!community_files_uploader_id_fkey(id, username, display_name, avatar_url)",
        )
        .eq("community_id", communityId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CommunityFile[];
    },
  });
}

export async function uploadCommunityFile(communityId: string, file: File) {
  const mime = validateCommunityFile(file);
  const me = await getMyId();
  const path = `${communityId}/${me}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const up = await supabase.storage.from(COMMUNITY_FILES_BUCKET).upload(path, file, { contentType: mime, cacheControl: "0" });
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase.from("community_files").insert({
    community_id: communityId,
    uploader_id: me,
    name: file.name.slice(0, 200),
    storage_path: path,
    mime_type: mime,
    size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from(COMMUNITY_FILES_BUCKET).remove([path]);
    throw new Error(error.message);
  }
}

/**
 * Opens or downloads a community file. Access is checked by the database at the moment
 * of the request (no shareable signed link), and the copy only lives in this browser tab.
 */
export async function openCommunityFile(f: Pick<CommunityFile, "storage_path" | "name">, download: boolean) {
  const blob = await fetchPrivateObject(COMMUNITY_FILES_BUCKET, f.storage_path);
  if (!blob) throw new Error("Você não tem acesso a este arquivo ou ele não existe mais.");
  const url = URL.createObjectURL(blob);
  try {
    if (download) {
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      window.open(url, "_blank", "noopener");
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  }
}

export async function deleteCommunityFile(f: Pick<CommunityFile, "id" | "storage_path">) {
  const { data, error } = await supabase.from("community_files").delete().eq("id", f.id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Você não pode excluir este arquivo.");
  await supabase.storage.from(COMMUNITY_FILES_BUCKET).remove([f.storage_path]);
}
