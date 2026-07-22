/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * ESTRATÉGIA DE FALLBACK (sem @ts-nocheck):
 * O `types.ts` gerado no Lovable Cloud contém APENAS o schema `public`.
 * Os schemas `zapp` e `evo` só ficam completos após rodar
 * `scripts/gen-types-zapp.mjs` contra a VPS. Para permitir compilação
 * limpa em ambos os cenários, este arquivo:
 *   1. Detecta via tipo condicional se `zapp`/`evo` existem em
 *      `GeneratedDatabase`.
 *   2. Se existirem → usa o schema gerado e faz merge com
 *      `ManualZappTables`.
 *   3. Se NÃO existirem → sintetiza um schema mínimo compatível com o
 *      contrato PostgREST (`Tables`/`Views`/`Functions`/`Enums`/
 *      `CompositeTypes`) usando `ManualZappTables` como base.
 *
 * Consumidores continuam importando `ExtendedDatabase` normalmente; o
 * tipo resolvido depende apenas do `types.ts` presente no ambiente.
 */

import type { Database as GeneratedDatabase } from './types';

/** Extensões manuais de tabelas do schema zapp (adicione aqui overrides). */
export type ManualZappTables = Record<never, never>;

/** Extensões manuais de tabelas do schema evo. */
export type ManualEvoTables = Record<never, never>;

/** Shape mínimo compatível com PostgREST para um schema Supabase. */
type EmptySchema<TTables> = {
  Tables: TTables;
  Views: Record<never, never>;
  Functions: Record<never, never>;
  Enums: Record<never, never>;
  CompositeTypes: Record<never, never>;
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
 * `Extra`; caso contrário, sintetiza um schema vazio contendo `Extra`.
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
    : EmptySchema<Extra>
  : EmptySchema<Extra>;

/** Extended Database type alias com fallback automático. */
export type ExtendedDatabase = {
  public: GeneratedDatabase['public'];
  zapp: ResolveSchema<'zapp', ManualZappTables>;
  evo: ResolveSchema<'evo', ManualEvoTables>;
};
