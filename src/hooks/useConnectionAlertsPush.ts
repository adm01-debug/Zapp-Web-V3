import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Escuta novas notificações de conexão (type='connection_alert') via realtime
 * e dispara uma notificação push do navegador.
 */
export function useConnectionAlertsPush() {
  useEffect(() => {
    if (typeof Notification === "undefined") return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data: auth , error } = await supabase.auth.getUser();
      if (cancelled || !auth.user) return;

      channel = supabase
        .channel(`connection-alerts-${auth.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "zapp",
            table: "notifications",
            filter: `user_id=eq.${auth.user.id}`,
          },
          (payload) => {
            const n = payload.new as {
              type?: string;
              title?: string;
              message?: string;
              metadata?: { connection_id?: string; reason?: string; [key: string]: unknown };
            };
            if (n?.type !== "connection_alert") return;
            if (Notification.permission !== "granted") return;
            try {
              new Notification(n.title ?? "Alerta de conexão", {
                body: n.message ?? "",
                icon: "/favicon.ico",
                tag: `conn-${n.metadata?.connection_id ?? "unknown"}`,
                requireInteraction: n.metadata?.reason === "disconnected",
              });
            } catch {
              /* ignore */
            }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}
