import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import { useSLAAlertPreferences } from './useSLAAlertPreferences';

type SLAStatus = 'ok' | 'warning' | 'breached' | 'na';
type SLAScope = 'current' | 'queue' | 'agent' | 'none';
type AlertKind = 'first_response' | 'resolution' | 'delivery_delay';
type AlertSeverity = 'warning' | 'breached';

interface SLAAlertParams {
  contactId: string | null;
  contactName: string;
  scope: SLAScope;
  firstResponseStatus: SLAStatus;
  resolutionStatus: SLAStatus;
  ruleName: string | null;
  awaitingMs: number | null;
  resolutionDurationMs: number | null;
  /** Optional delivery delay context */
  deliveryDelayStatus?: SLAStatus | null;
  deliveryDelayMs?: number | null;
  customMessage?: string | null;
  /** Optional callback wired to the toast's "Abrir conversa" action button. */
  onOpenConversation?: () => void;
}

function formatDurationMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

const dedupeKey = (contactId: string, kind: AlertKind, severity: AlertSeverity) =>
  `${contactId}:${kind}:${severity}`;

// localStorage layer — survives page refreshes and tab reloads. Same-origin only,
// and TTL keeps the store from growing unbounded for stale conversations.
const LOCAL_STORAGE_KEY = 'zappweb:sla-alert-dedupe:v1';
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type DedupeStore = Record<string, number>; // key -> firedAtMs

function readDedupeStore(): DedupeStore {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    const cleaned: DedupeStore = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && now - v < LOCAL_TTL_MS) {
        cleaned[k] = v;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeDedupeStore(store: DedupeStore): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage quota / private mode — accept that dedupe falls back to network layer */
  }
}

/** Retorna o `firedAt` (ms) armazenado para `key`, ou `null` se não disparou
 *  localmente dentro do TTL. Preservar o timestamp real (em vez de apenas
 *  um boolean) permite ao chamador hidratar `firedRef` sem resetar o relógio
 *  do TTL para agora — o mesmo motivo pelo qual a hidratação via DB preserva
 *  `persistedAt` em vez de usar `Date.now()`. */
function alreadyFiredLocal(key: string): number | null {
  const store = readDedupeStore();
  return key in store ? store[key] : null;
}

/** `firedAt` opcional: usado na hidratação a partir do banco, para preservar
 *  o horário REAL do disparo em vez de resetar o relógio do TTL para agora
 *  (sem isso, um alerta descoberto perto do fim da janela de 24h ganhava
 *  mais 24h completas de supressão local — quase 48h no total). */
function markFiredLocal(key: string, firedAt: number = Date.now()): void {
  const store = readDedupeStore();
  store[key] = firedAt;
  writeDedupeStore(store);
}

/**
 * Persistent dedupe: checks `conversation_events` (event_type='sla_alert') for a previous
 * record with same kind+severity dentro da janela de TTL. Retorna o `created_at` (ms) do
 * registro encontrado, ou `null` se não disparou nessa janela (ou em caso de erro —
 * fail-open, não bloqueia o alerta).
 */
async function alreadyFiredPersistent(
  contactId: string,
  kind: AlertKind,
  severity: AlertSeverity
): Promise<number | null> {
  try {
    // Mesma janela do layer de localStorage (LOCAL_TTL_MS): sem este filtro,
    // um alerta que já disparou uma vez para este contato nunca mais dispararia,
    // mesmo semanas depois numa conversa/ciclo de SLA totalmente novo.
    const since = new Date(Date.now() - LOCAL_TTL_MS).toISOString();
    const { data, error } = await supabase
      .from('conversation_events')
      .select('created_at')
      .eq('contact_id', contactId)
      .eq('event_type', 'sla_alert')
      .contains('metadata', { kind, severity })
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return new Date(data.created_at).getTime();
  } catch {
    return null;
  }
}

/**
 * Dispara notificações in-app + auditoria quando o SLA da conversa atual entra
 * em risco ou é violado.
 *
 * Anti-spam em três camadas:
 *  1. In-memory (`firedRef`/`inflightRef`) — evita loops e re-disparo dentro da mesma sessão.
 *  2. localStorage (`zappweb:sla-alert-dedupe:v1`, TTL 24h) — sobrevive ao refresh do navegador
 *     sem custo de rede. Verificado de forma síncrona antes de qualquer chamada.
 *  3. `conversation_events` (banco) — fonte de verdade entre dispositivos/abas. Hidrata o
 *     localStorage quando detecta que o alerta já foi disparado em outro lugar.
 *
 * Respeita escopo `'none'` — não dispara.
 */
export function useSLAAlerts(params: SLAAlertParams) {
  // Map (não Set): guarda o horário do disparo para expirar após LOCAL_TTL_MS,
  // igual ao layer de localStorage. Um Set nunca expira — numa aba de inbox
  // aberta por dias, um alerta ficaria suprimido para sempre após o 1º disparo,
  // mesmo que o SLA violasse de novo num ciclo totalmente novo.
  const firedRef = useRef<Map<string, number>>(new Map());
  const inflightRef = useRef<Set<string>>(new Set());
  const { preferences } = useSLAAlertPreferences();
  const queryClient = useQueryClient();
  // Removed redundant assignment using direct params access

  useEffect(() => {
    if (params.scope === 'none' || !params.contactId) return;
    // Master switch: when disabled, skip toasts AND audit inserts AND webhook forward entirely.
    if (!preferences.enabled) return;
    const contactId = params.contactId;

    const fire = async (kind: AlertKind, severity: AlertSeverity, durationMs: number | null) => {
      // Respect per-user preferences. Defaults are all-on, so users without a row keep current behavior.
      const kindEnabled =
        kind === 'first_response'
          ? preferences.alert_first_response
          : kind === 'delivery_delay'
            ? true
            : preferences.alert_resolution;
      const severityEnabled =
        severity === 'breached' ? preferences.severity_breached : preferences.severity_warning;
      if (!kindEnabled || !severityEnabled) return;

      const key = dedupeKey(contactId, kind, severity);
      const firedAt = firedRef.current.get(key);
      const inMemoryFresh = firedAt !== undefined && Date.now() - firedAt < LOCAL_TTL_MS;

      // Layer 1: in-memory (sync) — prevents re-entry from rapid effect runs. Expira
      // após LOCAL_TTL_MS, senão uma aba de inbox aberta há dias suprime para sempre.
      if (inMemoryFresh || inflightRef.current.has(key)) return;

      // Layer 2: localStorage (sync, survives refresh) — instant skip without network round-trip.
      // Preserva o horário REAL armazenado (não Date.now()) — mesma razão da
      // hidratação via DB abaixo: resetar o relógio aqui estenderia a supressão
      // local por +24h completas a cada re-render/remontagem do componente.
      const localFiredAt = alreadyFiredLocal(key);
      if (localFiredAt !== null) {
        firedRef.current.set(key, localFiredAt);
        return;
      }

      inflightRef.current.add(key);

      try {
        // Layer 3: persistent (DB) — handles cross-device/cross-tab and recovers if localStorage was wiped.
        const persistedAt = await alreadyFiredPersistent(contactId, kind, severity);
        if (persistedAt !== null) {
          // Preserva o horário REAL do disparo (não Date.now()) — hidratar com o
          // relógio zerado agora estenderia a supressão local por +24h completas.
          firedRef.current.set(key, persistedAt);
          markFiredLocal(key, persistedAt);
          return;
        }

        firedRef.current.set(key, Date.now());
        markFiredLocal(key);

        const isBreach = severity === 'breached';
        const kindLabel =
          kind === 'first_response'
            ? '1ª resposta'
            : kind === 'delivery_delay'
              ? 'Atraso na leitura'
              : 'Resolução';

        const customMsg = params.customMessage;
        const title =
          kind === 'delivery_delay'
            ? `Mensagem não lida — ${params.contactName}`
            : `SLA ${isBreach ? 'violado' : 'em risco'} — ${params.contactName}`;

        const description =
          customMsg ||
          `${kindLabel} · ${formatDurationMs(durationMs)} · ${params.ruleName ?? 'regra padrão'}`;

        const action = params.onOpenConversation
          ? { label: 'Abrir conversa', onClick: () => params.onOpenConversation?.() }
          : undefined;

        if (isBreach) {
          toast.error(title, { description, duration: 10_000, action });
        } else {
          toast.warning(title, { description, duration: 6_000, action });
        }

        // Audit (best-effort, fire-and-forget). Also serves as the persistent dedupe record.
        // If the insert fails (typically RLS/permission), forward the failure to a service-role
        // edge function so we still capture diagnostic info in `conversation_events`.
        const auditMetadata = {
          kind,
          severity,
          scope: params.scope,
          rule_name: params.ruleName,
          duration_ms: durationMs,
        };
        void supabase
          .from('conversation_events')
          .insert({
            contact_id: contactId,
            event_type: 'sla_alert',
            metadata: auditMetadata,
          })
          .then(
            ({ error: insertError }) => {
              if (!insertError) {
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.conversationHistory.events(contactId),
                });
                return;
              }
              // Don't disrupt the user — just record the failure for ops debugging.
              void supabase.functions
                .invoke('sla-alert-log-failure', {
                  body: {
                    contact_id: contactId,
                    attempted_event_type: 'sla_alert',
                    error_code: insertError.code ?? null,
                    error_message: insertError.message ?? null,
                    error_details: insertError.details ?? null,
                    original_metadata: auditMetadata,
                  },
                })
                .then(
                  () => undefined,
                  () => undefined
                );
            },
            () => undefined
          );

        // External webhook forwarding (best-effort, fire-and-forget).
        void supabase.functions
          .invoke('sla-alert-forward', {
            body: {
              contact_id: contactId,
              contact_name: params.contactName,
              kind,
              severity,
              scope: params.scope,
              rule_name: params.ruleName,
              duration_ms: durationMs,
              occurred_at: new Date().toISOString(),
            },
          })
          .then(
            () => undefined,
            () => undefined
          );
      } finally {
        inflightRef.current.delete(key);
      }
    };

    if (params.firstResponseStatus === 'warning' || params.firstResponseStatus === 'breached') {
      void fire('first_response', params.firstResponseStatus, params.awaitingMs);
    }
    if (params.resolutionStatus === 'warning' || params.resolutionStatus === 'breached') {
      void fire('resolution', params.resolutionStatus, params.resolutionDurationMs);
    }
    const dStatus = params.deliveryDelayStatus;
    if (dStatus === 'warning' || dStatus === 'breached') {
      void fire('delivery_delay', dStatus, params.deliveryDelayMs ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.contactId,
    params.scope,
    params.firstResponseStatus,
    params.resolutionStatus,
    params.awaitingMs,
    params.resolutionDurationMs,
    params.deliveryDelayStatus,
    params.deliveryDelayMs,
    params.ruleName,
    params.contactName,
    params.customMessage,
    params.onOpenConversation,
    preferences,
    queryClient,
  ]);
}
