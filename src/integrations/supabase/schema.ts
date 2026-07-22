/**
 * schema.ts — Fonte ÚNICA e canônica do schema Supabase para a aplicação.
 *
 * Camada de fallback (sem `@ts-nocheck`):
 * Quando `types.ts` não contém os schemas `zapp`/`evo` (ambiente Lovable
 * Cloud, antes de rodar `gen-types-zapp.mjs`), os helpers abaixo degradam
 * para `any` — mantendo os hooks/componentes compilando. Assim que o
 * `types.ts` for regenerado contra a VPS AtomicaBR e os schemas estiverem
 * presentes, os helpers passam automaticamente a inferir os tipos reais.
 *
 *   import type { Database, Tables, TablesInsert, TablesUpdate, Json }
 *     from '@/integrations/supabase/schema';
 */
import type { ExtendedDatabase } from './types-manual';
import type { Database as GeneratedDatabase, Json } from './types';

/** Canonical application database type alias re-exported from ExtendedDatabase. */
export type Database = ExtendedDatabase;

/**
 * `true` quando o schema real está presente no `types.ts` gerado; caso
 * contrário `false` e os helpers degradam para `any`.
 */
type HasZapp = 'zapp' extends keyof GeneratedDatabase ? true : false;
type HasEvo = 'evo' extends keyof GeneratedDatabase ? true : false;

type ZappTables = Database['zapp']['Tables'];
type ZappViews = Database['zapp']['Views'];
type ZappEnums = Database['zapp']['Enums'];
type EvoTables = Database['evo']['Tables'];

// biome-ignore lint/suspicious/noExplicitAny: fallback consciente quando schema ausente
type AnyFallback = any;

/** Tables type alias. */
export type Tables<T extends keyof ZappTables | string> = HasZapp extends true
  ? T extends keyof ZappTables
    ? ZappTables[T] extends { Row: infer R }
      ? R
      : never
    : never
  : AnyFallback;

/** Tables Insert type alias. */
export type TablesInsert<T extends keyof ZappTables | string> = HasZapp extends true
  ? T extends keyof ZappTables
    ? ZappTables[T] extends { Insert: infer I }
      ? I
      : never
    : never
  : AnyFallback;

/** Tables Update type alias. */
export type TablesUpdate<T extends keyof ZappTables | string> = HasZapp extends true
  ? T extends keyof ZappTables
    ? ZappTables[T] extends { Update: infer U }
      ? U
      : never
    : never
  : AnyFallback;

/** Views type alias. */
export type Views<T extends keyof ZappViews | string> = HasZapp extends true
  ? T extends keyof ZappViews
    ? ZappViews[T] extends { Row: infer R }
      ? R
      : never
    : never
  : AnyFallback;

/** Enums type alias. */
export type Enums<T extends keyof ZappEnums | string> = HasZapp extends true
  ? T extends keyof ZappEnums
    ? ZappEnums[T]
    : never
  : AnyFallback;

/** Evo Table type alias. */
export type EvoTable<T extends keyof EvoTables | string> = HasEvo extends true
  ? T extends keyof EvoTables
    ? EvoTables[T] extends { Row: infer R }
      ? R
      : never
    : never
  : AnyFallback;

/**
 * ContactRow — canonical row type for the `contacts` view (zapp schema).
 * Use this instead of Tables<'contacts'> since contacts is a view.
 */
export type ContactRow = HasZapp extends true
  ? ZappViews extends { contacts: { Row: infer R } }
    ? R
    : AnyFallback
  : AnyFallback;

export type { Json };
