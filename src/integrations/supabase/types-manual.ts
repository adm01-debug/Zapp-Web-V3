// @ts-nocheck
/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * DÉBITO TÉCNICO: `types.ts` só expõe `public` no ambiente Lovable Cloud,
 * então o remapeamento para `zapp`/`evo` produzia tipos `never`, mascarando
 * incompatibilidades reais em dezenas de hooks e componentes. Manter
 * `@ts-nocheck` até que os consumidores sejam migrados para tipos concretos
 * (tarefa multi-onda; ver docs/ts-nocheck-batch-*.md).
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
