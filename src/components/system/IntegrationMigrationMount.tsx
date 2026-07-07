import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeClient } from "@/integrations/supabase/safeClient";
import { invalidateWhatsAppModeCache } from "@/lib/whatsappAdapter";
import { getLogger } from "@/lib/logger";

const log = getLogger('IntegrationMigration');

/**
 * Roda `rpc_migrate_whatsapp_integration` uma vez por sessão.
 * É idempotente no servidor — re-execuções são seguras e refletem o estado atual.
 * O resultado é cacheado em sessionStorage para evitar chamada redundante a cada
 * navegação SPA.
 */
const SESSION_KEY = "whatsapp_integration_migrated";

export function IntegrationMigrationMount() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session) return; // só roda se usuário autenticado
        const { data, error: rpcError } = await safeClient.rpc('rpc_migrate_whatsapp_integration');
        if (rpcError) {
          log.warn('WhatsApp integration migration failed', rpcError.message);
          return;
        }
        sessionStorage.setItem(SESSION_KEY, "1");
        invalidateWhatsAppModeCache();
        if (import.meta.env.DEV) {
          log.debug('WhatsApp integration migration result', data);
        }
      } catch (e) {
        log.warn('WhatsApp integration migration error', e);
      }
    })();
  }, []);

  return null;
}
