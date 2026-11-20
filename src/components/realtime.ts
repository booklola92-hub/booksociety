import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { MILESTONE_LABEL, type Milestone } from "@/lib/goals";

export function useRealtimeInbox(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const suffix = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`inbox-${userId}-${suffix}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["unread"] });
          qc.invalidateQueries({ queryKey: ["notifications"] });
          const row = payload.new as { type?: string; milestone?: number | null };
          if (row.type === "goal" && row.milestone) {
            qc.invalidateQueries({ queryKey: ["goals"] });
            const label = MILESTONE_LABEL[row.milestone as Milestone];
            toast.success(row.milestone === 100 ? "Meta de leitura concluída! 🎉" : `Você chegou a ${label} da sua meta! 📚`);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["unread"] });
          qc.invalidateQueries({ queryKey: ["messages"] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}
