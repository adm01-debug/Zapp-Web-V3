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

/**
 * Shape genérico de uma tabela desconhecida quando o schema real (`zapp`
 * ou `evo`) não está presente no `types.ts` gerado. Mantém compatibilidade
 * estrutural com o contrato PostgREST do supabase-js, mas com Row/Insert/
 * Update abertos — evita cascatas de TS2339 sem recorrer a `@ts-nocheck`.
 */
// biome-ignore lint/suspicious/noExplicitAny: fallback permissivo consciente
type UnknownRow = Record<string, any>;
type FallbackTable = {
  Row: UnknownRow;
  Insert: UnknownRow;
  Update: UnknownRow;
  Relationships: [];
};

/** Extensões manuais de tabelas do schema zapp (adicione aqui overrides). */
export type ManualZappTables = Record<never, never>;

/** Extensões manuais de tabelas do schema evo. */
export type ManualEvoTables = Record<never, never>;

/**
 * Índice de tabelas permissivo: qualquer chave string resolve para
 * `FallbackTable`, ficando ao mesmo tempo mesclável com overrides manuais.
 */
type FallbackTables<Extra> = Extra & {
  [key: string]: FallbackTable;
};

/** Shape mínimo compatível com PostgREST para um schema Supabase. */
type EmptySchema<TTables> = {
  Tables: TTables;
  // biome-ignore lint/suspicious/noExplicitAny: fallback permissivo
  Views: { [key: string]: { Row: UnknownRow; Relationships: [] } };
  // biome-ignore lint/suspicious/noExplicitAny: fallback permissivo
  Functions: { [key: string]: { Args: Record<string, any>; Returns: any } };
  Enums: Record<string, string>;
  CompositeTypes: Record<string, UnknownRow>;
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
    : EmptySchema<FallbackTables<Extra>>
  : EmptySchema<FallbackTables<Extra>>;

/** Extended Database type alias com fallback automático. */
export type ExtendedDatabase = {
  public: GeneratedDatabase['public'];
  zapp: ResolveSchema<'zapp', ManualZappTables>;
  evo: ResolveSchema<'evo', ManualEvoTables>;
};
