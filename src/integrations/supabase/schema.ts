/**
 * schema.ts — Fonte ÚNICA e canônica do schema Supabase para a aplicação.
 *
 * Motivação: `types.ts` é auto-gerado e não inclui todas as tabelas que
 * realmente existem em produção (ver `types-manual.ts`). Historicamente o app
 * misturava imports de `types.ts` (Database gerado) com `ExtendedDatabase`
 * (types-manual), gerando incompatibilidades (`never`) e forçando
 * @ts-nocheck em dezenas de arquivos.
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

type PublicTables = Database['public']['Tables'];
type PublicEnums = Database['public']['Enums'];

export type Tables<T extends keyof PublicTables> = PublicTables[T] extends { Row: infer R }
  ? R
  : never;

export type TablesInsert<T extends keyof PublicTables> = PublicTables[T] extends { Insert: infer I }
  ? I
  : never;

export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T] extends { Update: infer U }
  ? U
  : never;

export type Enums<T extends keyof PublicEnums> = PublicEnums[T];

export type { Json };
