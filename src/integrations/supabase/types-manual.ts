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
type AnyFallback = any;

/** Extensões manuais de tabelas do schema zapp (adicione aqui overrides). */
export type ManualZappTables = Record<never, never>;

/** Extensões manuais de tabelas do schema evo. */
export type ManualEvoTables = Record<never, never>;

type MergeTables<Base, Extra> = {
  [K in keyof Base | keyof Extra]: K extends keyof Extra
    ? Extra[K]
    : K extends keyof Base
      ? Base[K]
      : never;
};

/**
 * Resolve um schema: se `K` existe em `GeneratedDatabase`, faz merge com
 * `Extra` sobre Tables. Caso contrário, o schema inteiro degrada para
 * `any` — deliberadamente permissivo — para evitar cascatas de TS2339 e
 * `SelectQueryError` em consumidores enquanto o `types.ts` não é
 * regenerado com os schemas `zapp`/`evo` (via `gen-types-zapp.mjs`).
 * O gate em `scripts/check-types-schemas.mjs` avisa quando o fallback
 * está ativo.
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
    : AnyFallback
  : AnyFallback;

/** Extended Database type alias com fallback automático. */
export type ExtendedDatabase = {
  public: GeneratedDatabase['public'];
  zapp: ResolveSchema<'zapp', ManualZappTables>;
  evo: ResolveSchema<'evo', ManualEvoTables>;
};
