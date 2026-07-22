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
