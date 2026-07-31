// Throttled last_seen touch com debounce global de módulo.
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('touchLastSeen');
const DEBOUNCE_MS = 120_000; // 2 min entre writes
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let lastWriteAt = 0;
let inflight: Promise<void> | null = null;

/** Atualiza profiles.last_seen do usuário logado, no máximo 1x a cada 2min (global). */
export function touchLastSeen(): void {
  const now = Date.now();
  if (pendingTimer || inflight) return; // já agendado ou write em andamento
  const remaining = lastWriteAt + DEBOUNCE_MS - now;
  const delay = Math.max(remaining > 0 ? remaining : 0, 0);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    lastWriteAt = Date.now();
    inflight = (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        // auth.uid() == profiles.user_id (verificado no banco: id ≠ user_id)
        // supabase-js nao lanca em erro HTTP: o PATCH rejeitado (RLS etc.)
        // volta no campo `error` -- checar para nao falhar em silencio.
        const { error } = await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('user_id', user.id);
        if (error) log.error('touchLastSeen update rejected:', error.message);
      } catch (err) {
        log.error('touchLastSeen failed:', err);
      } finally {
        inflight = null;
      }
    })();
  }, delay);
}
