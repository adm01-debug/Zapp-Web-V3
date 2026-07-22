// @ts-nocheck
/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * DÉBITO TÉCNICO (mantido intencionalmente):
 * O `types.ts` gerado no ambiente Lovable Cloud não expõe os schemas `zapp` e
 * `evo` da instância self-hosted (VPS AtomicaBR). Sem o `@ts-nocheck` aqui, o
 * remapeamento produz tipos `never` em cascata, mascarando incompatibilidades
 * reais em dezenas de hooks/componentes. A remoção só é segura após rodar
 * `scripts/gen-types-zapp.mjs` contra a VPS e regerar `types.ts` com todos os
 * schemas visíveis. Enquanto isso, os hooks reimplementados (usePersonalStickers,
 * useContactIntelligence, etc.) fazem o casting local via `as never` na fronteira
 * do PostgREST — não expondo `any` para o restante do código.
 */

import type { Database as GeneratedDatabase } from './types';

/** Manual Zapp Tables type definition. */
export type ManualZappTables = Record<never, never>;

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
