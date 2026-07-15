/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * AGORA: Com a regeneração completa de types.ts (2026-07-14) incluindo o 
 * schema `zapp` com 294 tabelas, 400 views e 664 functions, não há mais
 * tabelas manuais necessárias. Este arquivo mantém apenas o mecanismo
 * de merge para futuras extensões.
 *
 * ÚLTIMA REGENERAÇÃO: 2026-07-14 via postgres-meta API
 * TABELAS REMOVIDAS DO MANUAL (agora no types.ts gerado):
 *   ai_providers, automation_executions, avatars, business_hours,
 *   email_drafts, email_revalidation_jobs, email_signatures,
 *   hmac_selftest_audit, provider_configs, queue_members, queues,
 *   sla_delivery_violations, system_connections, talkx_campaigns,
 *   whisper_files, app_settings
 */

import type { Database as GeneratedDatabase } from './types';

// ---------------------------------------------------------------------------
// ManualZappTables — adicione aqui tabelas que não foram capturadas na geração.
// Após regenerar types.ts, mova-as para cá SOMENTE se a CLI não as incluir.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ManualZappTables {
  // Vazio após regeneração 2026-07-14 — todas as tabelas estão em types.ts
}

// ---------------------------------------------------------------------------
// MergeTables — mescla dois conjuntos de tabelas sem criar intersseção
// ---------------------------------------------------------------------------
type MergeTables<Base, Extra> = {
  [K in keyof Base | keyof Extra]: K extends keyof Extra
    ? Extra[K]
    : K extends keyof Base
      ? Base[K]
      : never;
};

type GeneratedZappSchema = GeneratedDatabase['zapp'];

export type ExtendedDatabase = {
  public: GeneratedDatabase['public'];
  zapp: {
    Tables: MergeTables<GeneratedZappSchema['Tables'], ManualZappTables>;
    Views: GeneratedZappSchema['Views'];
    Functions: GeneratedZappSchema['Functions'];
    Enums: GeneratedZappSchema['Enums'];
    CompositeTypes: GeneratedZappSchema['CompositeTypes'];
  };
};