/**
 * schema.ts — Fonte ÚNICA e canônica do schema Supabase para a aplicação.
 *
 * Motivação: `types.ts` é auto-gerado e contém os schemas `public` e `zapp`.
 * Todas as tabelas vivem no schema `zapp`; o schema `public` só tem views
 * materializadas. A `ExtendedDatabase` de `types-manual.ts` mescla tabelas
 * manuais sobre as geradas, criando o tipo canônico.
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
type ZappEnums = Database['zapp']['Enums'];

export type Tables<T extends keyof ZappTables> = ZappTables[T] extends { Row: infer R }
  ? R
  : never;

export type TablesInsert<T extends keyof ZappTables> = ZappTables[T] extends { Insert: infer I }
  ? I
  : never;

export type TablesUpdate<T extends keyof ZappTables> = ZappTables[T] extends { Update: infer U }
  ? U
  : never;

export type Enums<T extends keyof ZappEnums> = ZappEnums[T];

export type { Json };
