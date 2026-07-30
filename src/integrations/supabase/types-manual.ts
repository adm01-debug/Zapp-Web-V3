// @ts-nocheck
/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * DÉBITO TÉCNICO (mantido intencionalmente):
 * O `types.ts` gerado no ambiente Lovable Cloud contém APENAS o schema
 * `public`. Os schemas `zapp` e `evo` da instância self-hosted (VPS
 * AtomicaBR) só aparecem depois de rodar `scripts/gen-types-zapp.mjs` com
 * `META_URL` e `META_TOKEN` apontando para a VPS. Sem esses schemas, o
 * remapeamento `GeneratedDatabase['zapp' | 'evo']` produz erros TS2339 em
 * cascata neste arquivo e em dezenas de hooks/componentes que dependem
 * dele. Portanto o `@ts-nocheck` aqui é *load-bearing*, não decorativo —
 * removê-lo exige regerar `types.ts` fora do sandbox Lovable Cloud.
 */

import type { Database as GeneratedDatabase } from './types';

/** Manual Zapp Tables type definition. */
export type ManualZappTables = {
  user_settings: {
    Row: {
      id: string;
      user_id: string;
      theme?: string | null;
      language?: string | null;
      sound_enabled?: boolean | null;
      message_sound_type?: string | null;
      mention_sound_type?: string | null;
      goal_sound_type?: string | null;
      sla_sound_type?: string | null;
      transcription_sound_type?: string | null;
      tts_voice_id?: string | null;
      tts_speed?: number | null;
      compact_mode?: boolean | null;
      inbox_filters?: Record<string, unknown> | null;
      browser_notifications_enabled?: boolean | null;
      auto_assignment_enabled?: boolean | null;
      auto_assignment_method?: string | null;
      auto_transcription_enabled?: boolean | null;
      transcription_notification_enabled?: boolean | null;
      sentiment_alert_enabled?: boolean | null;
      sentiment_alert_threshold?: number | null;
      sentiment_consecutive_count?: number | null;
      business_hours_enabled?: boolean | null;
      business_hours_start?: string | null;
      business_hours_end?: string | null;
      quiet_hours_enabled?: boolean | null;
      quiet_hours_start?: string | null;
      quiet_hours_end?: string | null;
      inactivity_timeout?: number | null;
      away_message?: string | null;
      welcome_message?: string | null;
      closing_message?: string | null;
      work_days?: string[] | null;
      onboarding_completed: boolean;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      user_id: string;
      theme?: string | null;
      language?: string | null;
      sound_enabled?: boolean | null;
      message_sound_type?: string | null;
      mention_sound_type?: string | null;
      goal_sound_type?: string | null;
      sla_sound_type?: string | null;
      transcription_sound_type?: string | null;
      tts_voice_id?: string | null;
      tts_speed?: number | null;
      compact_mode?: boolean | null;
      inbox_filters?: Record<string, unknown> | null;
      browser_notifications_enabled?: boolean | null;
      auto_assignment_enabled?: boolean | null;
      auto_assignment_method?: string | null;
      auto_transcription_enabled?: boolean | null;
      transcription_notification_enabled?: boolean | null;
      sentiment_alert_enabled?: boolean | null;
      sentiment_alert_threshold?: number | null;
      sentiment_consecutive_count?: number | null;
      business_hours_enabled?: boolean | null;
      business_hours_start?: string | null;
      business_hours_end?: string | null;
      quiet_hours_enabled?: boolean | null;
      quiet_hours_start?: string | null;
      quiet_hours_end?: string | null;
      inactivity_timeout?: number | null;
      away_message?: string | null;
      welcome_message?: string | null;
      closing_message?: string | null;
      work_days?: string[] | null;
      onboarding_completed?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      user_id?: string;
      theme?: string | null;
      language?: string | null;
      sound_enabled?: boolean | null;
      message_sound_type?: string | null;
      mention_sound_type?: string | null;
      goal_sound_type?: string | null;
      sla_sound_type?: string | null;
      transcription_sound_type?: string | null;
      tts_voice_id?: string | null;
      tts_speed?: number | null;
      compact_mode?: boolean | null;
      inbox_filters?: Record<string, unknown> | null;
      browser_notifications_enabled?: boolean | null;
      auto_assignment_enabled?: boolean | null;
      auto_assignment_method?: string | null;
      auto_transcription_enabled?: boolean | null;
      transcription_notification_enabled?: boolean | null;
      sentiment_alert_enabled?: boolean | null;
      sentiment_alert_threshold?: number | null;
      sentiment_consecutive_count?: number | null;
      business_hours_enabled?: boolean | null;
      business_hours_start?: string | null;
      business_hours_end?: string | null;
      quiet_hours_enabled?: boolean | null;
      quiet_hours_start?: string | null;
      quiet_hours_end?: string | null;
      inactivity_timeout?: number | null;
      away_message?: string | null;
      welcome_message?: string | null;
      closing_message?: string | null;
      work_days?: string[] | null;
      onboarding_completed?: boolean;
      created_at?: string;
      updated_at?: string;
    };
  };
  workspace_settings: {
    Row: {
      id: string;
      workspace_id: string;
      name: string;
      description?: string | null;
      logo_url?: string | null;
      default_queue?: string | null;
      working_hours_start?: string | null;
      working_hours_end?: string | null;
      timezone?: string | null;
      settings?: Record<string, unknown> | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      workspace_id: string;
      name: string;
      description?: string | null;
      logo_url?: string | null;
      default_queue?: string | null;
      working_hours_start?: string | null;
      working_hours_end?: string | null;
      timezone?: string | null;
      settings?: Record<string, unknown> | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      workspace_id?: string;
      name?: string;
      description?: string | null;
      logo_url?: string | null;
      default_queue?: string | null;
      working_hours_start?: string | null;
      working_hours_end?: string | null;
      timezone?: string | null;
      settings?: Record<string, unknown> | null;
      created_at?: string;
      updated_at?: string;
    };
  };
};

type MergeTables<Base, Extra> = {
  [K in keyof Base | keyof Extra]: K extends keyof Extra
    ? Extra[K]
    : K extends keyof Base
      ? Base[K]
      : never;
};

type GeneratedZappSchema = GeneratedDatabase['zapp'];

/** Extended Database type alias. */
export type ExtendedDatabase = {
  public: GeneratedDatabase['public'];
  zapp: {
    Tables: MergeTables<GeneratedZappSchema['Tables'], ManualZappTables>;
    Views: GeneratedZappSchema['Views'];
    Functions: GeneratedZappSchema['Functions'];
    Enums: GeneratedZappSchema['Enums'];
    CompositeTypes: GeneratedZappSchema['CompositeTypes'];
  };
  evo: GeneratedDatabase['evo'];
};
