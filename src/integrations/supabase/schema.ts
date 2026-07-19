/**
 * schema.ts — Fonte ÚNICA e canônica do schema Supabase para a aplicação.
 *
 * ATUALIZADO 2026-07-16: types.ts agora contém blocos nativos para
 * `public`, `zapp` e `evo` (80.411 linhas). O remapeamento
 * GeneratedDatabase['public'] → zapp foi eliminado.
 *
 * A partir daqui, TODO código de aplicação deve importar tipos de schema
 * exclusivamente deste barrel:
 *
 *   import type { Database, Tables, TablesInsert, TablesUpdate, Json }
 *     from '@/integrations/supabase/schema';
 *
 * Assim `Database` = `ExtendedDatabase` em todos os pontos, e os helpers
 * `Tables<'x'>` enxergam tanto as tabelas geradas quanto as manuais.
 */
import type { ExtendedDatabase } from './types-manual';
import type { Json } from './types';

export type Database = ExtendedDatabase;

type ZappTables = Database['zapp']['Tables'];
type ZappViews = Database['zapp']['Views'];
type ZappEnums = Database['zapp']['Enums'];

/** Tables type alias. */
export type Tables<T extends keyof ZappTables> = ZappTables[T] extends { Row: infer R } ? R : never;

/** Tables Insert type alias. */
export type TablesInsert<T extends keyof ZappTables> = ZappTables[T] extends { Insert: infer I }
  ? I
  : never;

/** Tables Update type alias. */
export type TablesUpdate<T extends keyof ZappTables> = ZappTables[T] extends { Update: infer U }
  ? U
  : never;

/** Views type alias. */
export type Views<T extends keyof ZappViews> = ZappViews[T] extends { Row: infer R } ? R : never;

/** Enums type alias. */
export type Enums<T extends keyof ZappEnums> = ZappEnums[T];

// Helpers para o schema evo (Evolution API)
type EvoTables = Database['evo']['Tables'];
/** Evo Table type alias. */
export type EvoTable<T extends keyof EvoTables> = EvoTables[T] extends { Row: infer R } ? R : never;

/**
 * ContactRow — canonical row type for the `contacts` view (zapp schema).
 * Use this instead of Tables<'contacts'> since contacts is a view, not a base table.
 */
export type ContactRow = ZappViews['contacts'] extends { Row: infer R } ? R : never;

export type { Json };
