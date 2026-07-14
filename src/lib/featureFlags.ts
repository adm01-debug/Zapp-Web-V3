// @ts-nocheck
/**
 * Feature flags system for ZAPP WEB.
 *
 * Supports:
 * 1. Simple boolean toggles.
 * 2. Percentage-based rollout (value: 0-100).
 * 3. Targeting specific agent IDs.
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

export function isFeatureEnabled(
  flag: FeatureFlag,
  context?: { userId?: string; tenantId?: string }
): boolean {
  const config = flagCache?.[flag] || DEFAULTS[flag];

  if (config.killSwitch) return false;
  if (!config.enabled) return false;

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
      return a & a;
    }, 0);
    return Math.abs(hash % 100) < config.percentage;
  }

  return true;
}

export async function loadFeatureFlags(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .like('key', 'feature_%');

    if (error) throw error;

    const flags: Record<string, FeatureConfig> = { ...DEFAULTS };
    if (data) {
      for (const row of data) {
        const flagName = row.key.replace('feature_', '') as FeatureFlag;
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
    log.info('[FeatureFlags] Sync complete', Object.keys(flags).length, 'flags active');
  } catch (err) {
    log.warn('[FeatureFlags] Load failed, using safety defaults', err);
  }
}

export function getAllFlags(): Record<string, FeatureConfig> {
  return flagCache || DEFAULTS;
}
