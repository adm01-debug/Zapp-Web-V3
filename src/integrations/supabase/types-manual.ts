/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * Em Lovable Cloud, `types.ts` expõe apenas o schema `public`. No self-hosted,
 * a regeneração inclui blocos nativos para `zapp` e `evo`. Este arquivo
 * abstrai a diferença: se o schema existir em `GeneratedDatabase`, usamos ele;
 * caso contrário, fazemos fallback para `public` (que é o proxy runtime).
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

type SchemaOrPublic<K extends string> = K extends keyof GeneratedDatabase
  ? GeneratedDatabase[K]
  : GeneratedDatabase['public'];

type BaseZappSchema = SchemaOrPublic<'zapp'>;

type SchemaShape = {
  Tables: Record<string, unknown>;
  Views: Record<string, unknown>;
  Functions: Record<string, unknown>;
  Enums: Record<string, unknown>;
  CompositeTypes: Record<string, unknown>;
};

type EnsureShape<T> = T extends SchemaShape ? T : SchemaShape;

type ZappSchema = EnsureShape<BaseZappSchema>;
type EvoSchema = EnsureShape<SchemaOrPublic<'evo'>>;

/** Extended Database type alias. */
export type ExtendedDatabase = {
  public: GeneratedDatabase['public'];
  zapp: {
    Tables: MergeTables<ZappSchema['Tables'], ManualZappTables>;
    Views: ZappSchema['Views'];
    Functions: ZappSchema['Functions'];
    Enums: ZappSchema['Enums'];
    CompositeTypes: ZappSchema['CompositeTypes'];
  };
  evo: EvoSchema;
};
