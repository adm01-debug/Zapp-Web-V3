/**
 * Feature flags system for ZAPP WEB.
 *
 * Supports:
 * 1. Simple boolean toggles.
 * 2. Percentage-based rollout (value: 0-100).
 * 3. Targeting specific agent IDs / roles.
 *
 * Fonte canônica (SEGURANCA-14): zapp.feature_flags (RLS authenticated SELECT
 * USING(true) desde 20260804160000; anon vê apenas is_public=true — nenhuma
 * flag pública hoje). Fallback legado: app_settings com chaves `feature_%`
 * (única fonte legível no período em que feature_flags era restrita a anon,
 * cf. migration 20260801040006).
 */

import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

type FeatureFlag =
  | 'ai_agents'
  | 'sla_siren'
  | 'semantic_search'
  | 'voip_sip'
  | 'email_channel'
  | 'instagram_channel'
  | 'telegram_channel'
  | 'csat_surveys'
  | 'media_library'
  | 'talk_x'
  | 'optimistic_messages'
  | 'auto_retry_failed'
  | 'whisper_mode'
  | 'dark_mode'
  | 'v2_audio_recorder'
  | 'advanced_transcription'
  | 'message_queue_retry';

interface FeatureConfig {
  enabled: boolean;
  percentage?: number; // 0-100
  segments?: string[]; // user IDs or tenant IDs
  killSwitch?: boolean;
  /** Roles permitidos (coluna allowed_roles de zapp.feature_flags). */
  roles?: string[];
  /** User IDs bloqueados (coluna blocked_user_ids). */
  blockedUsers?: string[];
  /** Expiração (coluna expires_at). */
  expiresAt?: string;
}

export interface FeatureFlagContext {
  userId?: string;
  tenantId?: string;
  roles?: string[];
}

const DEFAULTS: Record<FeatureFlag, FeatureConfig> = {
  ai_agents: { enabled: true },
  sla_siren: { enabled: true },
  semantic_search: { enabled: true },
  voip_sip: { enabled: true },
  email_channel: { enabled: true },
  instagram_channel: { enabled: true },
  telegram_channel: { enabled: true },
  csat_surveys: { enabled: true },
  media_library: { enabled: true },
  talk_x: { enabled: true },
  optimistic_messages: { enabled: true },
  auto_retry_failed: { enabled: true },
  whisper_mode: { enabled: true },
  dark_mode: { enabled: true },
  v2_audio_recorder: { enabled: false, percentage: 0 },
  advanced_transcription: { enabled: false },
  message_queue_retry: { enabled: true },
};

let flagCache: Record<string, FeatureConfig> | null = null;

// ---------------------------------------------------------------------------
// Cooldown/single-flight do loadFeatureFlags.
//
// loadFeatureFlags() era chamado no mount do AppProviders + em cada
// SIGNED_IN/SIGNED_OUT — e repetia o GET feature_flags?select=... a cada
// disparo/remount (tempestade vista em produção). Agora:
//  - Single-flight: chamadas concorrentes aguardam a MESMA promise;
//  - Cooldown de 5min: só re-busca após o último load BEM-SUCEDIDO da fonte
//    canônica (zapp.feature_flags sem erro). Se o último load falhou na fonte
//    canônica (ex.: anon sem RLS), NÃO entra em cooldown — o próximo
//    SIGNED_IN re-tenta imediatamente e carrega as flags autenticadas.
// ---------------------------------------------------------------------------
const FLAG_LOAD_COOLDOWN_MS = 5 * 60 * 1000;

let lastCanonicalLoadAt = 0; // 0 = nunca leu feature_flags com sucesso
let flagLoadInflight: Promise<void> | null = null;

/** load Feature Flags function. */
export async function loadFeatureFlags(): Promise<void> {
  // Guard de sessão: feature_flags/app_settings têm RLS authenticated-only —
  // sem sessão (pré-login), as queries retornam 42501 e geram 2 WARNs por
  // load no console de produção (evidência 2026-08-07). Resetar para
  // DEFAULTS no logout evita vazar flags do usuário anterior na mesma aba.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    flagCache = { ...DEFAULTS };
    lastCanonicalLoadAt = 0; // Força reload autenticado no próximo login
    return;
  }
  if (flagCache && Date.now() - lastCanonicalLoadAt < FLAG_LOAD_COOLDOWN_MS) {
    return;
  }
  if (flagLoadInflight) return flagLoadInflight;

  flagLoadInflight = (async () => {
    try {
      const flags: Record<string, FeatureConfig> = { ...DEFAULTS };
      let loaded = 0;
      let canonicalRead = false;
      const canonicalKeys = new Set<string>();

      // ── Fonte canônica: zapp.feature_flags ─────────────────────────────────
      // Colunas: key, enabled, allowed_roles, allowed_user_ids, blocked_user_ids,
      // rollout_percentage, expires_at, metadata.
      const { data: rows, error } = await supabase
        .from('feature_flags')
        .select(
          'key, enabled, allowed_roles, allowed_user_ids, blocked_user_ids, rollout_percentage, expires_at, metadata'
        );

      if (error) {
        // anon (pré-login) sem permissão ou tabela indisponível: cai no fallback.
        log.warn('[FeatureFlags] zapp.feature_flags indisponível, tentando app_settings', error);
      } else if (rows) {
        canonicalRead = true;
        for (const row of rows) {
          const flagName = row.key as FeatureFlag;
          if (!row.key || !(flagName in DEFAULTS)) continue;
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          flags[flagName] = {
            ...flags[flagName],
            enabled: row.enabled ?? flags[flagName].enabled,
            percentage: row.rollout_percentage ?? flags[flagName].percentage,
            segments: row.allowed_user_ids ?? flags[flagName].segments,
            roles: row.allowed_roles ?? flags[flagName].roles,
            blockedUsers: row.blocked_user_ids ?? flags[flagName].blockedUsers,
            expiresAt: row.expires_at ?? flags[flagName].expiresAt,
            killSwitch:
              typeof meta.killSwitch === 'boolean'
                ? meta.killSwitch
                : flags[flagName].killSwitch,
          };
          canonicalKeys.add(flagName);
          loaded += 1;
        }
      }

      // ── Fallback legado: app_settings (chaves feature_%) ───────────────────
      // Mantido para ambientes onde feature_flags não foi populada. Merge —
      // feature_flags (canônica) vence quando ambas existirem.
      const { data: settingsData, error: settingsError } = await supabase
        .from('app_settings')
        .select('key, value')
        .like('key', 'feature_%');

      if (settingsError) {
        log.warn('[FeatureFlags] app_settings indisponível', settingsError);
      } else if (settingsData) {
        for (const row of settingsData) {
          const flagName = row.key.replace('feature_', '') as FeatureFlag;
          if (!(flagName in DEFAULTS)) continue;
          if (canonicalKeys.has(flagName)) continue; // feature_flags (canônica) vence
          try {
            // Parse value if it's JSON string, or use as boolean if it's simple
            const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;

            if (typeof parsed === 'boolean') {
              flags[flagName] = { ...flags[flagName], enabled: parsed };
            } else if (typeof parsed === 'object' && parsed !== null) {
              flags[flagName] = { ...flags[flagName], ...parsed };
            }
          } catch {
            // Fallback to boolean if JSON parse fails
            flags[flagName] = {
              ...flags[flagName],
              enabled: row.value === 'true' || row.value === true,
            };
          }
        }
      }

      flagCache = flags;
      // Cooldown só quando a fonte canônica foi legível (authenticated):
      // um load anon (RLS bloqueou) não pode suprimir o reload pós-login.
      if (canonicalRead) lastCanonicalLoadAt = Date.now();
      log.info('[FeatureFlags] Sync complete', Object.keys(flags).length, 'flags active', loaded, 'from feature_flags');
    } catch (err) {
      log.warn('[FeatureFlags] Load failed, using safety defaults', err);
    }
  })().finally(() => {
    flagLoadInflight = null;
  });
  return flagLoadInflight;
}
export function isFeatureEnabled(
  flag: FeatureFlag,
  context?: FeatureFlagContext
): boolean {
  const config = flagCache?.[flag] || DEFAULTS[flag];

  if (config.killSwitch) return false;
  if (!config.enabled) return false;

  // Expiração (zapp.feature_flags.expires_at)
  if (config.expiresAt && Date.parse(config.expiresAt) <= Date.now()) return false;

  // Bloqueio explícito de usuário (zapp.feature_flags.blocked_user_ids)
  if (
    config.blockedUsers &&
    config.blockedUsers.length > 0 &&
    context?.userId &&
    config.blockedUsers.includes(context.userId)
  ) {
    return false;
  }

  // Restrição por role (zapp.feature_flags.allowed_roles)
  if (config.roles && config.roles.length > 0) {
    if (
      !context?.roles ||
      !context.roles.some((r) => config.roles?.includes(r))
    ) {
      return false;
    }
  }

  // Segment-based check
  if (config.segments && config.segments.length > 0) {
    if (context?.userId && config.segments.includes(context.userId)) return true;
    if (context?.tenantId && config.segments.includes(context.tenantId)) return true;
    // If segments are defined and user/tenant doesn't match, it's disabled for them
    return false;
  }

  // Percentage-based check
  if (typeof config.percentage === 'number') {
    if (!context?.userId) return false;
    const hash = context.userId.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return Math.imul(a, 1);
    }, 0);
    return (hash >>> 0) % 100 < config.percentage;
  }

  return true;
}

/** get All Flags function. */
export function getAllFlags(): Record<string, FeatureConfig> {
  const source = flagCache || DEFAULTS;
  return Object.fromEntries(Object.entries(source).map(([k, v]) => [k, { ...v }]));
}
