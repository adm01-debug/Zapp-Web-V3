// @ts-nocheck
/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * DÉBITO TÉCNICO (mantido intencionalmente):
 * O `types.ts` gerado via Supabase type generation contém APENAS o schema
 * `public`. Os schemas `zapp` e `evo` da instância self-hosted (VPS
 * AtomicaBR) só aparecem depois de rodar `scripts/gen-types-zapp.mjs` com
 * `META_URL` e `META_TOKEN` apontando para a VPS. Sem esses schemas, o
 * remapeamento `GeneratedDatabase['zapp' | 'evo']` produz erros TS2339 em
 * cascata neste arquivo e em dezenas de hooks/componentes que dependem
 * dele. Portanto o `@ts-nocheck` aqui é *load-bearing*, não decorativo —
 * removê-lo exige regerar `types.ts` via Supabase type generation
 * apontando para a VPS (fora do ambiente Lovable).
 */

import type { Database as GeneratedDatabase, Json } from './types';

/**
 * Manual Zapp Tables type definition.
 *
 * IMPORTANT: Keep as Record<never, never> when GeneratedDatabase['zapp']
 * does not exist in types.ts (Supabase type generation). Adding entries
 * here breaks MergeTables and causes cascade of 'never' type errors across
 * 20+ files. Use gen-types-zapp.mjs with VPS credentials to properly
 * generate the zapp schema in types.ts first.
 *
 * For type overrides, export standalone types (see ManualUserSettings, etc.)
 * and use them directly where needed.
 */
export type ManualZappTables = Record<never, never>;

/**
 * Manual Zapp Functions — RPCs da migration F-06 (rpc_schema_tables /
 * rpc_schema_columns, SECURITY DEFINER com whitelist zapp/evo/public).
 *
 * INTERINO: estas assinaturas entram em types.ts automaticamente quando
 * gen-types-zapp.mjs rodar com META_URL/META_TOKEN apontando para a VPS.
 * Até lá, ficam aqui para o frontend chamar os RPCs sem cast `as never`.
 * Se a assinatura gerada divergir, a entrada manual VENCE (MergeFunctions
 * prioriza Extra) — manter em sincronia com a migration F-06.
 */
export type ManualZappFunctions = {
  rpc_schema_tables: {
    Args: { p_schema?: string };
    Returns: { table_name: string; table_type: string }[];
  };
  rpc_schema_columns: {
    Args: { p_schema?: string };
    Returns: {
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }[];
  };
  /**
   * GAP-6 / Etapa 66 — análise real da última análise do contato.
   * Migration 20260817230000_etapa66_latest_analysis_rpc.sql.
   * SECURITY DEFINER; retorna envelope jsonb { analysis, tags, events, sla }
   * ou NULL quando o contato não tem dados (vazio honesto).
   */
  rpc_latest_contact_analysis: {
    Args: { p_contact_id: string };
    Returns: Json;
  };
  // Etapa 66 (migration 20260817190000) — métricas reais de dashboard.
  // Assinaturas espelham o RETURNS TABLE das RPCs; entram no types.ts gerado
  // quando gen-types-zapp.mjs rodar com META_URL/META_TOKEN apontando para a VPS.
  fn_dashboard_heatmap: {
    Args: { p_metric?: string; p_days?: number };
    Returns: {
      day: number;
      hour: number;
      value: number;
      sample_count: number;
      total_rows: number;
    }[];
  };
  rpc_queue_goal_metrics: {
    Args: never;
    Returns: {
      queue_id: string;
      waiting_contacts: number;
      avg_wait_minutes: number;
      assignment_rate: number | null;
      messages_pending: number | null;
      coverage: string;
    }[];
  };
  fn_demand_forecast: {
    Args: { p_days?: number; p_forecast_days?: number };
    Returns: { d: string; kind: string; dow: number; value: number }[];
  };
  // Etapa 70 (migration 20260818190000) — gamificação real: XP transacional.
  // rpc_grant_xp: ledger xp_transactions + upsert atômico em agent_stats
  // (soma do delta), nível recalculado (FLOOR(SQRT(xp/50))+1). SECURITY
  // DEFINER com guard auth.uid() + perfil do próprio usuário.
  rpc_grant_xp: {
    Args: { p_profile_id: string; p_amount: number; p_reason?: string };
    Returns: {
      new_xp: number;
      new_level: number;
      leveled_up: boolean;
      previous_level: number;
    };
  };
  // rpc_unlock_achievement: dedupe transacional via ON CONFLICT
  // (profile_id, achievement_type) DO NOTHING — desbloqueia 1x; tipos
  // repetíveis (daily_goal/streak/message_milestone) seguem permitidos;
  // XP creditado via rpc_grant_xp quando desbloqueio é novo.
  rpc_unlock_achievement: {
    Args: {
      p_profile_id: string;
      p_type: string;
      p_name: string;
      p_description?: string | null;
      p_xp_reward?: number;
    };
    Returns: {
      already_unlocked: boolean;
      new_xp: number | null;
      new_level: number | null;
      leveled_up: boolean;
      previous_level: number | null;
    };
  };
};

/**
 * ContactIntelligenceRow — espelho EXATO de zapp.contact_intelligence,
 * verificado via information_schema em 2026-07-31 (15 colunas reais).
 *
 * ATENÇÃO: a tabela NÃO possui as colunas `total_interactions` nem
 * `last_contact_at` — os nomes reais são `total_messages` e
 * `days_since_contact`. O hook useContactIntelligence leu os nomes errados
 * por meses (o cast `as never` escondia o erro de coluna no typecheck).
 * Usar este tipo no lugar de `as never` faz o TS pegar coluna inexistente.
 *
 * Colunas (nome | tipo | nullable | default):
 *   id uuid NO gen_random_uuid(); contact_id uuid NO;
 *   sentiment text YES; engagement_score numeric YES;
 *   predicted_value numeric YES; risk_level text YES;
 *   created_at timestamptz NO now(); updated_at timestamptz NO now();
 *   phone text YES; contact_name text YES; lead_status text YES;
 *   total_messages integer YES DEFAULT 0;
 *   days_since_contact integer YES;
 *   disc_profile text YES DEFAULT 'C'; inbound_ratio numeric YES DEFAULT 0.
 */
export type ContactIntelligenceRow = {
  id: string;
  contact_id: string;
  sentiment: string | null;
  engagement_score: number | null;
  predicted_value: number | null;
  risk_level: string | null;
  created_at: string;
  updated_at: string;
  phone: string | null;
  contact_name: string | null;
  lead_status: string | null;
  total_messages: number | null;
  days_since_contact: number | null;
  disc_profile: string | null;
  inbound_ratio: number | null;
};

/** Standalone manual types — use directly, not through MergeTables. */
export type ManualUserSettings = {
  Row: {
    id: string;
    user_id: string;
    theme?: string | null;
    language?: string | null;
    sound_enabled?: boolean | null;
    browser_notifications_enabled?: boolean | null;
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
    browser_notifications_enabled?: boolean | null;
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
    browser_notifications_enabled?: boolean | null;
    onboarding_completed?: boolean;
    created_at?: string;
    updated_at?: string;
  };
};

export type ManualWorkspaceSettings = {
  Row: {
    id: string;
    workspace_id: string;
    name: string;
    description?: string | null;
    logo_url?: string | null;
    timezone?: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    workspace_id: string;
    name: string;
    description?: string | null;
    logo_url?: string | null;
    timezone?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    workspace_id?: string;
    name?: string;
    description?: string | null;
    logo_url?: string | null;
    timezone?: string | null;
    created_at?: string;
    updated_at?: string;
  };
};

type MergeTables<Base, Extra> = {
  [K in keyof Base | keyof Extra]: K extends keyof Extra
    ? Extra[K]
    : K extends keyof Base
      ? Base[K]
      : never;
};

type MergeFunctions<Base, Extra> = {
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
    Functions: MergeFunctions<GeneratedZappSchema['Functions'], ManualZappFunctions>;
    Enums: GeneratedZappSchema['Enums'];
    CompositeTypes: GeneratedZappSchema['CompositeTypes'];
  };
  evo: GeneratedDatabase['evo'];
};
