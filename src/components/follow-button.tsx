import { useState } from "react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { setFollow, useInvalidate } from "@/lib/social";

export function FollowButton({
  userId,
  following,
  size = "sm",
}: {
  userId: string;
  following: boolean;
  size?: ButtonProps["size"];
}) {
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  return (
    <Button
      size={size}
      variant={following ? "outline" : "default"}
      className="rounded-full px-4"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await setFollow(userId, !following);
          await invalidate("follow-stats", "posts");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não foi possível atualizar.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {following ? "Seguindo" : "Seguir"}
    </Button>
  );
}
