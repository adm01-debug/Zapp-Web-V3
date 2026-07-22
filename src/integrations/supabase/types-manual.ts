/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * Em Lovable Cloud, `types.ts` expõe apenas o schema `public`. O runtime do
 * cliente Supabase está configurado com `db: { schema: 'zapp' }`, então o
 * PostgREST recebe `Accept-Profile: zapp`, mas os TIPOS aqui apenas replicam
 * `public` para `zapp` e `evo` — as tabelas físicas existem no self-hosted e
 * o proxy Lovable Cloud espelha-as em `public`.
 */

import type { Database as GeneratedDatabase } from './types';

/** Manual Zapp Tables — adicione aqui tabelas ainda não capturadas na geração. */
export type ManualZappTables = Record<never, never>;

type MergeTables<Base, Extra> = {
  [K in keyof Base | keyof Extra]: K extends keyof Extra
    ? Extra[K]
    : K extends keyof Base
      ? Base[K]
      : never;
};

type PublicSchema = GeneratedDatabase['public'];

/** Extended Database type alias. */
export type ExtendedDatabase = {
  public: PublicSchema;
  zapp: {
    Tables: MergeTables<PublicSchema['Tables'], ManualZappTables>;
    Views: PublicSchema['Views'];
    Functions: PublicSchema['Functions'];
    Enums: PublicSchema['Enums'];
    CompositeTypes: PublicSchema['CompositeTypes'];
  };
  evo: PublicSchema;
};
