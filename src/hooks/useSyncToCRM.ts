/**
 * useSyncToCRM — contrato completo consumido por CRMAutoSync/CRMSyncButton.
 *
 * Expõe:
 *   - syncConversation (fire-and-forget)
 *   - syncConversationAsync (retorna resultado)
 *   - isSyncing / isConfigured / lastResult / lastSyncAt
 *
 * A chamada real vai para a Edge Function `zapp-crm-sync` (CRM plugável,
 * Etapa 66) — NÃO usa mais a RPC fantasma `sync_conversation_to_crm`
 * (PGRST202/42883 → not_configured FALSO). isConfigured deixou de ser
 * otimista: vira estado derivado (null = desconhecido → configured |
 * not_configured), atualizado no mount via rpc_get_crm_sync_config() e na
 * 1ª resposta da edge. Reasons preservados: duplicate/contact_not_found/error
 * + novos do contrato: provider_not_configured/not_implemented/dry_run.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useSyncToCRM');

/** Input payload for syncing a conversation to the CRM via the zapp-crm-sync edge. */
export interface SyncConversationInput {
  phone: string;
  channel: 'whatsapp' | 'email' | 'sms' | string;
  direction: 'inbound' | 'outbound';
  assunto?: string;
  resumo?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | string;
  messageCount?: number;
  agentName?: string;
  zappConversationId?: string;
}

/** Sync Conversation Result — reason é enum fechado do contrato (SIM-CRM (e)). */
export interface SyncConversationResult {
  synced: boolean;
  reason?:
    | 'duplicate'
    | 'contact_not_found'
    | 'not_configured'
    | 'provider_not_configured'
    | 'not_implemented'
    | 'invalid_config'
    | 'dry_run'
    | 'error';
  new_relationship_score?: number | null;
  provider?: string;
  provider_error?: string;
  [key: string]: unknown;
}

export interface UseSyncToCRMReturn {
  isSyncing: boolean;
  /** null = desconhecido (ainda não verificado) — NUNCA otimista. */
  isConfigured: boolean | null;
  lastResult: SyncConversationResult | null;
  lastSyncAt: Date | null;
  syncConversation: (input: SyncConversationInput) => void;
  syncConversationAsync: (input: SyncConversationInput) => Promise<SyncConversationResult>;
}

// Cache module-level de rpc_get_crm_sync_config.
// Sem cache, cada componente montado chama a RPC no mount. Em uma tela com
// 10+ conversas, cada uma monta useSyncToCRM, disparando 10+ RPCs identicas
// no mesmo microtask (N+1 storm). O cache persiste por 5min (dados quasi-
// estaticos: config de integracao raramente muda).
// Inflight dedup: multiplas montagens simultaneas compartilham a MESMA
// promise em voo — apenas 1 RPC dispara no intervalo do cache.
let _crmConfigCache: { value: boolean | null; fetchedAt: number } | null = null;
let _crmConfigInflight: Promise<boolean | null> | null = null;
const CRM_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/** Le a config de CRM via RPC versionada — estado honesto ja no mount. */
async function fetchCrmConfigured(): Promise<boolean | null> {
  // Cache hit: dados frescos (< 5min) — nao dispara RPC.
  if (_crmConfigCache && Date.now() - _crmConfigCache.fetchedAt < CRM_CONFIG_CACHE_TTL_MS) {
    return _crmConfigCache.value;
  }
  // Inflight dedup: se ja ha uma RPC em voo, aguarda a mesma promise.
  if (_crmConfigInflight) return _crmConfigInflight;

  const run = (async (): Promise<boolean | null> => {
    try {
      const { data, error } = await (
        supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: unknown }>
      )('rpc_get_crm_sync_config');
      if (error) {
        log.warn('rpc_get_crm_sync_config failed', error as { message?: string });
        return null;
      }
      const rows = Array.isArray(data) ? (data as Array<{ enabled?: boolean }>) : [];
      const value = rows.some((r) => r?.enabled === true);
      _crmConfigCache = { value, fetchedAt: Date.now() };
      return value;
    } finally {
      _crmConfigInflight = null;
    }
  })();

  _crmConfigInflight = run;
  return run;
}

/** Extrai o reason do body de erro da edge (4xx/5xx ainda carregam o contrato). */
function parseErrorContext(error: unknown): SyncConversationResult | null {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx == null) return null;
  try {
    const parsed: unknown = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
    if (parsed && typeof parsed === 'object' && 'reason' in parsed) {
      return parsed as SyncConversationResult;
    }
  } catch {
    // body não-JSON: cai no reason error genérico
  }
  return null;
}

/** Invoca a edge zapp-crm-sync com o contrato ZappCrmSyncV1Schema (snake_case). */
async function callSyncEdge(input: SyncConversationInput): Promise<SyncConversationResult> {
  const body: Record<string, unknown> = {
    entity_data: {
      phone: input.phone,
      channel: input.channel,
      direction: input.direction,
      assunto: input.assunto ?? null,
      resumo: input.resumo ?? null,
      sentiment: input.sentiment ?? 'neutral',
      message_count: input.messageCount ?? 0,
      agent_name: input.agentName ?? null,
      zapp_conversation_id: input.zappConversationId ?? null,
    },
  };
  if (input.zappConversationId) body.entity_id = input.zappConversationId;

  const { data, error } = await supabase.functions.invoke('zapp-crm-sync', { body });

  if (error) {
    const fromContext = parseErrorContext(error);
    if (fromContext) return { ...fromContext, synced: !!fromContext.synced };
    log.error('zapp-crm-sync invoke error', error);
    return { synced: false, reason: 'error' };
  }

  const result = (
    data && typeof data === 'object' ? data : { synced: false }
  ) as SyncConversationResult;
  return { ...result, synced: !!result.synced };
}

export function useSyncToCRM(): UseSyncToCRMReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null); // desconhecido até verificar
  const [lastResult, setLastResult] = useState<SyncConversationResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void fetchCrmConfigured().then((configured) => {
      if (mountedRef.current && configured !== null) setIsConfigured(configured);
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const syncConversationAsync = useCallback(async (input: SyncConversationInput) => {
    setIsSyncing(true);
    try {
      const result = await callSyncEdge(input);
      if (!mountedRef.current) return result;
      setLastResult(result);
      if (result.reason === 'not_configured') {
        setIsConfigured(false);
      } else if (result.synced) {
        setIsConfigured(true);
        setLastSyncAt(new Date());
      }
      return result;
    } finally {
      if (mountedRef.current) setIsSyncing(false);
    }
  }, []);

  const syncConversation = useCallback(
    (input: SyncConversationInput) => {
      void syncConversationAsync(input).catch((err) => log.error('syncConversation failed', err));
    },
    [syncConversationAsync]
  );

  return {
    isSyncing,
    isConfigured,
    lastResult,
    lastSyncAt,
    syncConversation,
    syncConversationAsync,
  };
}
