import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { useMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export function UserAvatar({
  profile,
  className,
}: {
  profile: { display_name: string; username: string; avatar_url: string | null };
  className?: string;
}) {
  const url = useMediaUrl(profile.avatar_url);
  return (
    <Avatar className={cn("h-10 w-10 border border-border", className)}>
      {url ? <AvatarImage src={url} alt="" className="object-cover" /> : null}
      <AvatarFallback className="bg-secondary font-medium text-secondary-foreground">
        {initials(profile.display_name || profile.username)}
      </AvatarFallback>
    </Avatar>
  );
}
