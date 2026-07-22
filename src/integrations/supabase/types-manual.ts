// @ts-nocheck
/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * DÉBITO TÉCNICO ATIVO: `types.ts` no ambiente Lovable Cloud expõe apenas
 * `public`; acessar `zapp`/`evo` cascateia `never` em ~2000 usos e derruba
 * dezenas de hooks/telas. Manter `@ts-nocheck` até regenerar `types.ts`
 * a partir da instância self-hosted (docs/GEN_TYPES.md).
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
