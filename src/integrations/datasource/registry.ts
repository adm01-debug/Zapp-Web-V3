/**
 * Datasource Registry — fonte única da verdade para roteamento de entidades.
 *
 * O ZAPP Web agora usa UM ÚNICO Supabase (self-hosted em supabase.atomicabr.com.br):
 *  - `lovable`  → Supabase Self-Hosted (auth + dados + realtime + tudo)
 *                 Após consolidação, todas as tabelas estão no mesmo BD.
 *  - `external` → DEPRECATED (mantido por compatibilidade, aponta pro mesmo BD).
 *
 * Toda chamada a `messages`, `contacts`, `conversations`, `audit_log`, `calls`
 * DEVE passar pelos helpers em `./db.ts` para acertar automaticamente o cliente
 * e a tabela física correta.
 *
 * Para adicionar uma nova entidade:
 *  1. Adicione o nome em `LogicalEntity`.
 *  2. Mapeie em `ENTITY_MAP` para `{ client, table }`.
 *  3. Use `dbFrom('nova-entidade')` no código — nunca `supabase.from(...)` direto.
 *
 * Quando usar cada caminho:
 *  - `dbFrom` / `dbChannel` / `dbTable` (este arquivo + db.ts)
 *      → entidades **lovable** (profiles, queues, whatsapp_connections)
 *      → realtime (postgres_changes) em qualquer entidade, inclusive evolution_*
 *
 *  - `dbRpc` / `dbList` / `dbGet` / `dbInsert` (db.ts + rpcCatalog.ts)
 *      → TODA leitura/escrita de domínio em FATOR X (contacts, messages,
 *        conversations, calls, audit_log). RLS bloqueia SELECT direto, então
 *        a única forma correta é via RPC SECURITY DEFINER.
 */

export type LogicalEntity =
  | 'messages'
  | 'contacts'
  | 'conversations'
  | 'audit_log'
  | 'calls'
  | 'deleted_contacts'
  | 'imap_smtp_accounts'
  | 'profiles'
  | 'user_roles'
  | 'queues'
  | 'queue_positions'
  | 'whatsapp_connections'
  | 'team_conversations'
  | 'evolution_contacts'
  | 'evolution_messages'
  | 'whisper_messages'
  | 'provider_configs'
  | 'automation_executions';

export type DatasourceClient = 'lovable' | 'external';

export interface EntityMapping {
  client: DatasourceClient;
  table: string;
}

export const ENTITY_MAP = {
  // ── Tudo unificado no Self-Hosted (supabase.atomicabr.com.br) ───────────
  // Após consolidação, todas as entidades usam o client principal (lovable)
  // que tem auth session. As tabelas sem prefixo evolution_* têm o schema
  // Lovable (name, phone, etc) — as evolution_* são raw Evolution API format.
  messages:             { client: 'lovable', table: 'messages' },
  contacts:             { client: 'lovable', table: 'contacts' },
  conversations:        { client: 'lovable', table: 'conversations' },
  audit_log:            { client: 'lovable', table: 'audit_log' },
  calls:                { client: 'lovable', table: 'calls' },
  deleted_contacts:     { client: 'lovable', table: 'v_deleted_contacts' },
  profiles:             { client: 'lovable', table: 'profiles' },
  user_roles:           { client: 'lovable', table: 'user_roles' },
  queues:               { client: 'lovable', table: 'queues' },
  queue_positions:      { client: 'lovable', table: 'queue_positions' },
  whatsapp_connections: { client: 'lovable', table: 'whatsapp_connections' },
  team_conversations:   { client: 'lovable', table: 'team_conversations' },
  evolution_contacts:   { client: 'lovable', table: 'evolution_contacts' },
  evolution_messages:   { client: 'lovable', table: 'evolution_messages' },
  whisper_messages:     { client: 'lovable', table: 'whisper_messages' },
  imap_smtp_accounts:   { client: 'lovable', table: 'imap_smtp_accounts' },
  provider_configs:        { client: 'lovable', table: 'provider_configs' },
  automation_executions:   { client: 'lovable', table: 'automation_executions' },
} as const satisfies Record<LogicalEntity, EntityMapping>;

export function getEntityMapping(entity: LogicalEntity): EntityMapping {
  return ENTITY_MAP[entity];
}
