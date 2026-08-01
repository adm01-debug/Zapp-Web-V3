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

/**
 * Manual Zapp Tables type definition.
 *
 * IMPORTANT: Keep as Record<never, never> when GeneratedDatabase['zapp']
 * does not exist in types.ts (Lovable Cloud generation). Adding entries
 * here breaks MergeTables and causes cascade of 'never' type errors across
 * 20+ files. Use gen-types-zapp.mjs with VPS credentials to properly
 * generate the zapp schema in types.ts first.
 *
 * For type overrides, export standalone types (see ManualUserSettings, etc.)
 * and use them directly where needed.
 */
export type ManualZappTables = Record<never, never>;

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
