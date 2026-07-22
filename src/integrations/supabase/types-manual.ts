/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * ESTRATÉGIA DE FALLBACK (sem @ts-nocheck):
 * O `types.ts` gerado no Lovable Cloud contém APENAS o schema `public`.
 * Os schemas `zapp` e `evo` só ficam completos após rodar
 * `scripts/gen-types-zapp.mjs` contra a VPS. Para permitir compilação
 * limpa em ambos os cenários, este arquivo detecta via tipo condicional
 * se `zapp`/`evo` existem em `GeneratedDatabase`:
 *
 *   • existem  → usa o schema gerado e faz merge com `ManualZappTables`
 *                / `ManualEvoTables` (overrides manuais)
 *   • ausentes → cai em `FallbackSchema`, estruturalmente compatível com
 *                `GenericSchema` do supabase-js, mas com Row/Insert/
 *                Update/Relationships abertos (`any`) — evita cascatas
 *                de TS2339 nos consumidores.
 *
 * Consumidores importam `ExtendedDatabase` normalmente; o tipo resolvido
 * depende apenas do `types.ts` presente no ambiente.
 */

import type { Database as GeneratedDatabase } from './types';

// biome-ignore lint/suspicious/noExplicitAny: fallback permissivo consciente
type AnyRow = any;

/** Extensões manuais de tabelas do schema zapp (adicione aqui overrides). */
export type ManualZappTables = Record<never, never>;

/** Extensões manuais de tabelas do schema evo. */
export type ManualEvoTables = Record<never, never>;

/** Tabela fallback compatível com o contrato PostgREST do supabase-js. */
type FallbackTable = {
  Row: AnyRow;
  Insert: AnyRow;
  Update: AnyRow;
  Relationships: AnyRow;
};

/** Schema fallback permissivo (usado quando o schema real não existe). */
type FallbackSchema<Extra> = {
  Tables: Extra & { [key: string]: FallbackTable };
  Views: { [key: string]: { Row: AnyRow; Relationships: AnyRow } };
  Functions: { [key: string]: { Args: AnyRow; Returns: AnyRow } };
  Enums: { [key: string]: string };
  CompositeTypes: { [key: string]: AnyRow };
};

type MergeTables<Base, Extra> = {
  [K in keyof Base | keyof Extra]: K extends keyof Extra
    ? Extra[K]
    : K extends keyof Base
      ? Base[K]
      : never;
};

/**
 * Resolve um schema: se `K` existe em `GeneratedDatabase`, faz merge com
 * `Extra`; caso contrário, cai no `FallbackSchema` permissivo.
 */
type ResolveSchema<K extends string, Extra> = K extends keyof GeneratedDatabase
  ? GeneratedDatabase[K] extends {
      Tables: infer T;
      Views: infer V;
      Functions: infer F;
      Enums: infer E;
      CompositeTypes: infer C;
    }
    ? {
        Tables: MergeTables<T, Extra>;
        Views: V;
        Functions: F;
        Enums: E;
        CompositeTypes: C;
      }
    : FallbackSchema<Extra>
  : FallbackSchema<Extra>;

/** Extended Database type alias com fallback automático. */
export type ExtendedDatabase = {
  public: GeneratedDatabase['public'];
  zapp: ResolveSchema<'zapp', ManualZappTables>;
  evo: ResolveSchema<'evo', ManualEvoTables>;
};
