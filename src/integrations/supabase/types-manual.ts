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

import type { Database as GeneratedDatabase } from './types';

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
