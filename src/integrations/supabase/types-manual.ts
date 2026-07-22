/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * NOTA: `types.ts` (gerado por `scripts/gen-types-zapp.mjs`) já contém blocos
 * nativos para `public`, `zapp` e `evo`. Este módulo apenas permite mesclar
 * tipos manuais adicionais (via `ManualZappTables`) sem regenerar o arquivo.
 * Enquanto `ManualZappTables` estiver vazio, `ExtendedDatabase` é
 * estruturalmente equivalente ao `Database` gerado.
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
