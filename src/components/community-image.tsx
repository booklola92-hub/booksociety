import { Users } from "lucide-react";

import { useMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export function CommunityCover({ path, className }: { path: string | null; className?: string }) {
  const url = useMediaUrl(path);
  return url ? (
    <img src={url} alt="" className={cn("h-full w-full object-cover", className)} />
  ) : (
    <div className={cn("h-full w-full bg-gradient-to-br from-secondary via-accent to-muted", className)} />
  );
}

export function CommunityAvatar({ path, name, className }: { path: string | null; name: string; className?: string }) {
  const url = useMediaUrl(path);
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-secondary text-primary shadow-soft", className)}>
      {url ? <img src={url} alt={`Foto de ${name}`} className="h-full w-full object-cover" /> : <Users className="h-1/2 w-1/2" />}
    </div>
  );
}
