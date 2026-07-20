import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { toast } from 'sonner';
import { ticketStore, type TicketState, type TicketStatus } from '@/lib/inbox/ticketStore';

/**
 * Hook reativo para o estado de ticket de um contato. Lê do overlay
 * local (stub enquanto o FATOR X não expõe RPCs próprias) e expõe ações
 * que escrevem nele + integram com o `ticket-router` (Lovable Cloud)
 * para a atribuição automática sticky+round-robin.
 */
export function useTicketStatus(contactId: string | null | undefined) {
  const { profile } = useAuth();

  const subscribe = useCallback((cb: () => void) => ticketStore.subscribe(cb), []);
  const snapshot = useCallback(() => (contactId ? ticketStore.get(contactId) : null), [contactId]);

  // SSR-safe snapshot (sempre null fora do browser)
  const state = useSyncExternalStore<TicketState | null>(subscribe, snapshot, () => null);

  // Bootstrap "open" na primeira vez que o contato é aberto
  useEffect(() => {
    if (contactId) ticketStore.bootstrap(contactId);
  }, [contactId]);

  const performedBy = profile?.id ?? null;

  const setStatus = useCallback((next: TicketStatus) => {
    if (!contactId) return;
    ticketStore.setStatus(contactId, next, performedBy);
  }, [contactId, performedBy]);

  const assumir = useCallback(() => {
    if (!contactId || !performedBy) return;
    ticketStore.assign(contactId, performedBy, performedBy);
  }, [contactId, performedBy]);

  const transferir = useCallback((agentId: string) => {
    if (!contactId) return;
    ticketStore.assign(contactId, agentId, performedBy);
  }, [contactId, performedBy]);

  const devolverFila = useCallback(() => {
    if (!contactId) return;
    ticketStore.assign(contactId, null, performedBy);
  }, [contactId, performedBy]);

  /**
   * Chama o edge `ticket-router` (sticky + round-robin) e aplica o
   * agente resolvido no overlay. Quando a RPC FATOR X estiver pronta,
   * basta trocar o `apply: true` para persistir do lado de lá também.
   */
  const atribuirAuto = useCallback(async () => {
    if (!contactId) return;
    try {
      const { data, error } = await supabase.functions.invoke('ticket-router', {
        body: { contact_id: contactId, apply: false },
      });
      if (error) throw error;
      const payload = data as { agent_profile_id?: string | null; queue_id?: string | null; strategy?: string } | null;
      if (payload?.agent_profile_id) {
        ticketStore.assign(contactId, payload.agent_profile_id, performedBy, {
          queueId: payload.queue_id ?? null,
          auto: true,
        });
        toast.success(`Atribuído via ${payload.strategy ?? 'router'}`);
      } else {
        toast.warning('Nenhum agente disponível agora');
      }
    } catch (err) {
      toast.error(`Falha ao atribuir: ${err instanceof Error ? err.message : 'erro'}`);
    }
  }, [contactId, performedBy]);

  return useMemo(() => ({
    state,
    status: state?.status ?? 'open',
    assignedTo: state?.assignedTo ?? null,
    events: state?.events ?? [],
    setStatus,
    assumir,
    transferir,
    devolverFila,
    atribuirAuto,
  }), [state, setStatus, assumir, transferir, devolverFila, atribuirAuto]);
}

/** Returns a snapshot of all active ticket states keyed by ticket ID; used for KPI dashboards and inbox list filters without per-ticket subscriptions. */
export function useAllTicketStates(): Record<string, TicketState> {
  const subscribe = useCallback((cb: () => void) => ticketStore.subscribe(cb), []);
  const snapshot = useCallback(() => ticketStore.snapshot(), []);
  return useSyncExternalStore(subscribe, snapshot, () => ({}));
}
