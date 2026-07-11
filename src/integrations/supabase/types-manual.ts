/**
 * types-manual.ts — Definições de tipo para tabelas que existem na DB de produção
 * mas NÃO foram capturadas na geração automática de types.ts pelo Supabase CLI.
 *
 * ORIGEM: geradas a partir de information_schema.columns em 2026-07-11.
 *
 * POR QUE ARQUIVO SEPARADO (não editar types.ts):
 *   - types.ts é auto-gerado por `supabase gen types typescript` — edições seriam
 *     sobrescritas na próxima regeneração.
 *   - types-manual.ts sobrevive a re-gerações e fica como fonte da verdade para
 *     estas tabelas até que elas sejam formalmente capturadas no fluxo gerado.
 *
 * COMO ATUALIZAR: ao adicionar novas tabelas à DB, executar:
 *   SELECT column_name, data_type, is_nullable FROM information_schema.columns
 *   WHERE table_schema='public' AND table_name='<nova_tabela>'
 *   ORDER BY ordinal_position;
 * e adicionar uma entrada à ManualPublicTables abaixo.
 */

import type { Database as GeneratedDatabase } from './types';
import type { Json } from './types';

// ---------------------------------------------------------------------------
// Definições das tabelas ausentes — geradas de information_schema
// ---------------------------------------------------------------------------

export interface ManualPublicTables {
  ai_providers: {
    Row: {
      id: string | null
      name: string | null
      provider_type: string | null
      description: string | null
      api_endpoint: string | null
      api_key_secret_name: string | null
      model: string | null
      system_prompt: string | null
      is_active: boolean | null
      is_default: boolean | null
      use_for: string[] | null
      config: Json | null
      created_by: string | null
      created_at: string | null
      updated_at: string | null
    }
    Insert: {
      id?: string | null
      name?: string | null
      provider_type?: string | null
      description?: string | null
      api_endpoint?: string | null
      api_key_secret_name?: string | null
      model?: string | null
      system_prompt?: string | null
      is_active?: boolean | null
      is_default?: boolean | null
      use_for?: string[] | null
      config?: Json | null
      created_by?: string | null
      created_at?: string | null
      updated_at?: string | null
    }
    Update: {
      id?: string | null
      name?: string | null
      provider_type?: string | null
      description?: string | null
      api_endpoint?: string | null
      api_key_secret_name?: string | null
      model?: string | null
      system_prompt?: string | null
      is_active?: boolean | null
      is_default?: boolean | null
      use_for?: string[] | null
      config?: Json | null
      created_by?: string | null
      created_at?: string | null
      updated_at?: string | null
    }
    Relationships: []
  }

  automation_executions: {
    Row: {
      id: string | null
      automation_id: string | null
      rule_id: string | null
      contact_id: string | null
      trigger_event: string | null
      status: string | null
      result: Json | null
      error_message: string | null
      executed_at: string | null
      created_at: string | null
      acted_at: string | null
      acted_by: string | null
      applied_tags: string[] | null
      assigned_to: string | null
      channel_id: string | null
      department_id: string | null
      error_at: string | null
      instance_name: string | null
      kb_sources: string[] | null
      reassigned_to: string | null
      recommended_tag: string | null
      remote_jid: string | null
      rule_snapshot: Json | null
      suggestion_text: string | null
      trigger_payload: Json | null
    }
    Insert: {
      id?: string | null
      automation_id?: string | null
      rule_id?: string | null
      contact_id?: string | null
      trigger_event?: string | null
      status?: string | null
      result?: Json | null
      error_message?: string | null
      executed_at?: string | null
      created_at?: string | null
      acted_at?: string | null
      acted_by?: string | null
      applied_tags?: string[] | null
      assigned_to?: string | null
      channel_id?: string | null
      department_id?: string | null
      error_at?: string | null
      instance_name?: string | null
      kb_sources?: string[] | null
      reassigned_to?: string | null
      recommended_tag?: string | null
      remote_jid?: string | null
      rule_snapshot?: Json | null
      suggestion_text?: string | null
      trigger_payload?: Json | null
    }
    Update: {
      id?: string | null
      automation_id?: string | null
      rule_id?: string | null
      status?: string | null
      result?: Json | null
      error_message?: string | null
    }
    Relationships: []
  }

  avatars: {
    Row: {
      id: string
      created_at: string | null
      updated_at: string | null
      is_default: boolean | null
      name: string | null
      url: string
      user_id: string | null
    }
    Insert: {
      id?: string
      created_at?: string | null
      updated_at?: string | null
      is_default?: boolean | null
      name?: string | null
      url: string
      user_id?: string | null
    }
    Update: {
      id?: string
      created_at?: string | null
      updated_at?: string | null
      is_default?: boolean | null
      name?: string | null
      url?: string
      user_id?: string | null
    }
    Relationships: []
  }

  business_hours: {
    Row: {
      id: string
      whatsapp_connection_id: string
      day_of_week: number
      is_open: boolean | null
      open_time: string | null
      close_time: string | null
      created_at: string | null
      updated_at: string | null
    }
    Insert: {
      id?: string
      whatsapp_connection_id: string
      day_of_week: number
      is_open?: boolean | null
      open_time?: string | null
      close_time?: string | null
      created_at?: string | null
      updated_at?: string | null
    }
    Update: {
      id?: string
      whatsapp_connection_id?: string
      day_of_week?: number
      is_open?: boolean | null
      open_time?: string | null
      close_time?: string | null
      created_at?: string | null
      updated_at?: string | null
    }
    Relationships: []
  }

  email_drafts: {
    Row: {
      id: string | null
      account_id: string | null
      thread_id: string | null
      to_addresses: string[] | null
      cc_addresses: string[] | null
      bcc_addresses: string[] | null
      subject: string | null
      body_html: string | null
      body_text: string | null
      body: string | null
      attachments: Json | null
      reply_to_id: string | null
      in_reply_to: string | null
      references_hdr: string | null
      labels: string[] | null
      metadata: Json | null
      signature_id: string | null
      user_id: string | null
      is_reply: boolean | null
      last_saved_at: string | null
      created_at: string | null
      updated_at: string | null
    }
    Insert: {
      id?: string | null
      account_id?: string | null
      thread_id?: string | null
      to_addresses?: string[] | null
      cc_addresses?: string[] | null
      bcc_addresses?: string[] | null
      subject?: string | null
      body_html?: string | null
      body_text?: string | null
      body?: string | null
      attachments?: Json | null
      reply_to_id?: string | null
      in_reply_to?: string | null
      references_hdr?: string | null
      labels?: string[] | null
      metadata?: Json | null
      signature_id?: string | null
      user_id?: string | null
      is_reply?: boolean | null
      last_saved_at?: string | null
      created_at?: string | null
      updated_at?: string | null
    }
    Update: {
      id?: string | null
      account_id?: string | null
      thread_id?: string | null
      subject?: string | null
      body_html?: string | null
      body?: string | null
      metadata?: Json | null
      last_saved_at?: string | null
      updated_at?: string | null
    }
    Relationships: []
  }

  email_revalidation_jobs: {
    Row: {
      id: string
      account_id: string
      status: string
      triggered_by: string | null
      scheduled_at: string
      started_at: string | null
      completed_at: string | null
      error_message: string | null
      result: Json | null
      retry_count: number
      created_at: string
    }
    Insert: {
      id?: string
      account_id: string
      status?: string
      triggered_by?: string | null
      scheduled_at?: string
      started_at?: string | null
      completed_at?: string | null
      error_message?: string | null
      result?: Json | null
      retry_count?: number
      created_at?: string
    }
    Update: {
      id?: string
      account_id?: string
      status?: string
      triggered_by?: string | null
      scheduled_at?: string
      started_at?: string | null
      completed_at?: string | null
      error_message?: string | null
      result?: Json | null
      retry_count?: number
    }
    Relationships: []
  }

  email_signatures: {
    Row: {
      id: string | null
      account_id: string | null
      name: string | null
      content: string | null
      content_html: string | null
      is_default: boolean | null
      user_id: string | null
      created_at: string | null
      updated_at: string | null
    }
    Insert: {
      id?: string | null
      account_id?: string | null
      name?: string | null
      content?: string | null
      content_html?: string | null
      is_default?: boolean | null
      user_id?: string | null
      created_at?: string | null
      updated_at?: string | null
    }
    Update: {
      id?: string | null
      account_id?: string | null
      name?: string | null
      content?: string | null
      content_html?: string | null
      is_default?: boolean | null
      user_id?: string | null
      updated_at?: string | null
    }
    Relationships: []
  }

  hmac_selftest_audit: {
    Row: {
      id: string
      instance: string | null
      ok: boolean
      good_accepted: boolean | null
      tampered_rejected: boolean | null
      message: string | null
      error: string | null
      executed_by: string | null
      duration_ms: number | null
      created_at: string | null
    }
    Insert: {
      id?: string
      instance?: string | null
      ok: boolean
      good_accepted?: boolean | null
      tampered_rejected?: boolean | null
      message?: string | null
      error?: string | null
      executed_by?: string | null
      duration_ms?: number | null
      created_at?: string | null
    }
    Update: {
      id?: string
      instance?: string | null
      ok?: boolean
      good_accepted?: boolean | null
      tampered_rejected?: boolean | null
      message?: string | null
      error?: string | null
      executed_by?: string | null
      duration_ms?: number | null
      created_at?: string | null
    }
    Relationships: []
  }

  provider_configs: {
    Row: {
      id: string | null
      name: string | null
      provider_type: string | null
      base_url: string | null
      auth_token: string | null
      priority: number | null
      is_active: boolean | null
      status: string | null
      last_ping_at: string | null
      last_ping_latency_ms: number | null
      last_error: string | null
      config: Json | null
      created_by: string | null
      created_at: string | null
      updated_at: string | null
    }
    Insert: {
      id?: string | null
      name?: string | null
      provider_type?: string | null
      base_url?: string | null
      auth_token?: string | null
      priority?: number | null
      is_active?: boolean | null
      status?: string | null
      last_ping_at?: string | null
      last_ping_latency_ms?: number | null
      last_error?: string | null
      config?: Json | null
      created_by?: string | null
      created_at?: string | null
      updated_at?: string | null
    }
    Update: {
      id?: string | null
      name?: string | null
      provider_type?: string | null
      base_url?: string | null
      auth_token?: string | null
      priority?: number | null
      is_active?: boolean | null
      status?: string | null
      last_ping_at?: string | null
      last_ping_latency_ms?: number | null
      last_error?: string | null
      config?: Json | null
      updated_at?: string | null
    }
    Relationships: []
  }

  queue_members: {
    Row: {
      id: string
      queue_id: string
      profile_id: string
      role: string | null
      is_active: boolean | null
      max_simultaneous: number | null
      created_at: string
    }
    Insert: {
      id?: string
      queue_id: string
      profile_id: string
      role?: string | null
      is_active?: boolean | null
      max_simultaneous?: number | null
      created_at?: string
    }
    Update: {
      id?: string
      queue_id?: string
      profile_id?: string
      role?: string | null
      is_active?: boolean | null
      max_simultaneous?: number | null
    }
    Relationships: []
  }

  queues: {
    Row: {
      id: string
      name: string
      description: string | null
      color: string | null
      icon: string | null
      is_active: boolean | null
      max_capacity: number | null
      auto_assign: boolean | null
      round_robin: boolean | null
      priority: number | null
      sla_policy_id: string | null
      business_hours: Json | null
      created_at: string
      updated_at: string
      auto_rebalance_enabled: boolean
      department_id: string | null
      distribution_algorithm: string
      last_assigned_at: string | null
      last_assigned_user_id: string | null
      max_concurrent_per_agent: number | null
      max_per_queue_per_agent: number | null
      max_queue_size: number | null
      max_wait_seconds: number | null
      max_wait_time_minutes: number | null
      overflow_queue_id: string | null
      paused_at: string | null
      paused_by: string | null
      paused_reason: string | null
      routing_weight: number
      sla_priority: string
      status: string
    }
    Insert: {
      id?: string
      name: string
      description?: string | null
      color?: string | null
      icon?: string | null
      is_active?: boolean | null
      max_capacity?: number | null
      auto_assign?: boolean | null
      round_robin?: boolean | null
      priority?: number | null
      sla_policy_id?: string | null
      business_hours?: Json | null
      created_at?: string
      updated_at?: string
      auto_rebalance_enabled?: boolean
      department_id?: string | null
      distribution_algorithm?: string
      last_assigned_at?: string | null
      last_assigned_user_id?: string | null
      max_concurrent_per_agent?: number | null
      max_per_queue_per_agent?: number | null
      max_queue_size?: number | null
      max_wait_seconds?: number | null
      max_wait_time_minutes?: number | null
      overflow_queue_id?: string | null
      paused_at?: string | null
      paused_by?: string | null
      paused_reason?: string | null
      routing_weight?: number
      sla_priority?: string
      status?: string
    }
    Update: {
      id?: string
      name?: string
      description?: string | null
      color?: string | null
      icon?: string | null
      is_active?: boolean | null
      max_capacity?: number | null
      auto_assign?: boolean | null
      round_robin?: boolean | null
      priority?: number | null
      sla_policy_id?: string | null
      business_hours?: Json | null
      updated_at?: string
      auto_rebalance_enabled?: boolean
      department_id?: string | null
      distribution_algorithm?: string
      last_assigned_at?: string | null
      last_assigned_user_id?: string | null
      max_concurrent_per_agent?: number | null
      max_per_queue_per_agent?: number | null
      max_queue_size?: number | null
      max_wait_seconds?: number | null
      max_wait_time_minutes?: number | null
      overflow_queue_id?: string | null
      paused_at?: string | null
      paused_by?: string | null
      paused_reason?: string | null
      routing_weight?: number
      sla_priority?: string
      status?: string
    }
    Relationships: []
  }

  sla_delivery_violations: {
    Row: {
      id: string
      rule_id: string | null
      contact_id: string | null
      message_id: string | null
      threshold_type: string
      detected_at: string | null
      is_resolved: boolean | null
      resolved_at: string | null
      resolved_by: string | null
      resolution_notes: string | null
      metadata: Json | null
    }
    Insert: {
      id?: string
      rule_id?: string | null
      contact_id?: string | null
      message_id?: string | null
      threshold_type: string
      detected_at?: string | null
      is_resolved?: boolean | null
      resolved_at?: string | null
      resolved_by?: string | null
      resolution_notes?: string | null
      metadata?: Json | null
    }
    Update: {
      id?: string
      rule_id?: string | null
      contact_id?: string | null
      message_id?: string | null
      threshold_type?: string
      detected_at?: string | null
      is_resolved?: boolean | null
      resolved_at?: string | null
      resolved_by?: string | null
      resolution_notes?: string | null
      metadata?: Json | null
    }
    Relationships: []
  }

  system_connections: {
    Row: {
      id: string
      name: string
      provider: string
      config: Json
      is_active: boolean
      created_by: string | null
      created_at: string
      updated_at: string
    }
    Insert: {
      id?: string
      name: string
      provider?: string
      config?: Json
      is_active?: boolean
      created_by?: string | null
      created_at?: string
      updated_at?: string
    }
    Update: {
      id?: string
      name?: string
      provider?: string
      config?: Json
      is_active?: boolean
      created_by?: string | null
      created_at?: string
      updated_at?: string
    }
    Relationships: []
  }

  talkx_campaigns: {
    Row: {
      id: string
      name: string
      message_template: string
      status: string
      whatsapp_connection_id: string | null
      scheduled_at: string | null
      started_at: string | null
      completed_at: string | null
      total_recipients: number | null
      sent_count: number | null
      delivered_count: number | null
      failed_count: number | null
      send_interval_min: number | null
      send_interval_max: number | null
      typing_delay_min: number | null
      typing_delay_max: number | null
      media_type: string | null
      media_url: string | null
      variables_config: Json | null
      created_by: string | null
      created_at: string | null
      updated_at: string | null
    }
    Insert: {
      id?: string
      name: string
      message_template: string
      status?: string
      whatsapp_connection_id?: string | null
      scheduled_at?: string | null
      started_at?: string | null
      completed_at?: string | null
      total_recipients?: number | null
      sent_count?: number | null
      delivered_count?: number | null
      failed_count?: number | null
      send_interval_min?: number | null
      send_interval_max?: number | null
      typing_delay_min?: number | null
      typing_delay_max?: number | null
      media_type?: string | null
      media_url?: string | null
      variables_config?: Json | null
      created_by?: string | null
      created_at?: string | null
      updated_at?: string | null
    }
    Update: {
      id?: string
      name?: string
      message_template?: string
      status?: string
      whatsapp_connection_id?: string | null
      scheduled_at?: string | null
      started_at?: string | null
      completed_at?: string | null
      total_recipients?: number | null
      sent_count?: number | null
      delivered_count?: number | null
      failed_count?: number | null
      send_interval_min?: number | null
      send_interval_max?: number | null
      typing_delay_min?: number | null
      typing_delay_max?: number | null
      media_type?: string | null
      media_url?: string | null
      variables_config?: Json | null
      updated_at?: string | null
    }
    Relationships: []
  }

  whisper_files: {
    Row: {
      id: string
      contact_id: string
      file_name: string
      file_url: string
      file_size: number | null
      file_type: string | null
      sender_id: string | null
      metadata: Json | null
      created_at: string | null
      updated_at: string | null
    }
    Insert: {
      id?: string
      contact_id: string
      file_name: string
      file_url: string
      file_size?: number | null
      file_type?: string | null
      sender_id?: string | null
      metadata?: Json | null
      created_at?: string | null
      updated_at?: string | null
    }
    Update: {
      id?: string
      contact_id?: string
      file_name?: string
      file_url?: string
      file_size?: number | null
      file_type?: string | null
      sender_id?: string | null
      metadata?: Json | null
      updated_at?: string | null
    }
    Relationships: []
  }
}

// ---------------------------------------------------------------------------
// MergeTables — mescla dois conjuntos de tabelas sem criar intersseção
//
// PROBLEMA com `A & B`: quando supabase-js resolve `(A & B)['profiles']`,
// TypeScript computa `A['profiles'] & B['profiles']`. Se 'profiles' não existe
// em B (ManualPublicTables), `B['profiles'] = never`, logo `A['profiles'] &
// never = never`. Isso quebra a inferência de tipos em TODAS as tabelas de A.
//
// SOLUÇÃO: usar um mapped type que resolve cada chave explicitamente.
// ---------------------------------------------------------------------------
type MergeTables<Base, Extra> = {
  [K in keyof Base | keyof Extra]: K extends keyof Extra
    ? Extra[K]
    : K extends keyof Base
    ? Base[K]
    : never
}

// Extended Database type — adiciona tabelas que existem em prod mas não no
// types.ts gerado. Usa MergeTables para evitar o problema de inferência acima.
type GeneratedPublicSchema = GeneratedDatabase['public'];

export type ExtendedDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: MergeTables<GeneratedPublicSchema['Tables'], ManualPublicTables>
    Views: GeneratedPublicSchema['Views']
    Functions: GeneratedPublicSchema['Functions']
    Enums: GeneratedPublicSchema['Enums']
    CompositeTypes: GeneratedPublicSchema['CompositeTypes']
  }
}
