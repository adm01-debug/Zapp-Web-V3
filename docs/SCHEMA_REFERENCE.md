# 📐 Schema Reference — ZAPP WEB

> **Documento canônico** sobre a arquitetura de schemas do Supabase.
> Última atualização: 2026-07-16. Auditado e corrigido: 2026-07-16. Qualquer doc que contradiga este está desatualizado.

## Arquitetura Atual (pós-consolidação)

O ZAPP Web usa **um único Supabase Self-Hosted** (`supabase.atomicabr.com.br`) com **múltiplos schemas PostgreSQL**:

| Schema | Conteúdo | Quem acessa | Exemplos |
|--------|----------|-------------|----------|
| **`zapp`** | Todas as tabelas do app (**312** base tables + **405** views), RPCs | Frontend (client.ts), Edge Functions, n8n | `profiles`, `queues`, `contatos`, `whatsapp_connections`, `empresas`, `webhook_audit_log` |
| **`evo`** | Tabelas-fonte da Evolution API (**193 tabelas**); tabelas raiz particionadas (`evolution_messages`, `evolution_conversations`) com **23 partições** cada | Realtime subscriptions, Edge Functions que fazem `.schema('evo')` | `evolution_messages` (raiz), `evolution_contacts`, `evolution_webhook_events_v2` |
| **`public`** | **1 tabela interna Supabase** (`_wal_slot_guard_events`) + **535 views** proxy para zapp/evo/email_app | Não usar diretamente | views proxy |
| **`auth`** | Auth do Supabase (GoTrue) | `supabase.auth.*` | `auth.users` |

### Regras de Ouro

1. **`schema: 'zapp'`** é obrigatório em todo `createClient()` que faça `.from()` ou `.rpc()`.
   O `client.ts` do frontend já tem `db: { schema: 'zapp' }` configurado.
   Edge Functions devem usar `createZappAdminClient()` de `_shared/db-client.ts`.

2. **Realtime** subscriptions devem usar o schema da **tabela base** (não views):
   - Tabelas `zapp.*` → `schema: 'zapp'`
   - Tabelas `evo.*` → `schema: 'evo'`
   - Views **nunca emitem** WAL events — não usar em Realtime.
   - **CRÍTICO (`publish_via_partition_root=true`)**: para tabelas particionadas no schema `evo` (`evolution_messages`, `evolution_conversations`), o evento CDC é publicado pela **tabela raiz**, NUNCA pela partição. Usar `table: 'evolution_messages'` (raiz), não `table: 'evolution_messages_wpp2'` (partição). Assinar a partição resulta em silêncio total — zero eventos.

3. **Imports de tipos**: sempre via barrel `@/integrations/supabase/schema`, nunca de `types.ts` direto.

4. **PostgREST**: expõe `public` e `zapp`. Sem o header `Accept-Profile: zapp`, queries a tabelas `zapp` falham com `PGRST205`.

## Estrutura de Arquivos

```
src/integrations/supabase/
├── types.ts          # Auto-gerado (38K linhas). NÃO editar. Regenerar com:
│                     #   curl -s "http://supabase_meta:8080/generators/typescript
│                     #     ?included_schemas=public,zapp
│                     #     &detect_one_to_one_relationships=true"
│                     #     > src/integrations/supabase/types.ts
├── types-manual.ts   # Extensões manuais (vazio desde 2026-07-14)
├── schema.ts         # BARREL CANÔNICO — importar tipos daqui
├── client.ts         # createClient com schema: 'zapp'
├── safe-queries.ts   # Queries RLS-safe
├── safeClient.ts     # Safe client wrapper
└── db-client.ts      # (Edge Functions) Factory: createZappAdminClient()

supabase/functions/_shared/
├── db-client.ts      # createZappAdminClient() / createZappClient(req)
├── auth.ts           # requireUser() / requireAdminOrSupervisor()
└── validation.ts     # requireAuth() com schema: 'zapp'
```

## Contagem de Tabelas por Schema (auditado 2026-07-16 via MCP — valores definitivos)

| Schema | Base Tables | Views | RLS ativo |
|--------|-------------|-------|-----------|
| `zapp` | **312** | **405** | 100% |
| `evo` | **193** | — | 100% |
| `auth` | 21 | — | — |
| `bpm` | 41 | — | — |
| `email_app` | 33 | — | — |
| `ai` | 31 | — | — |
| `archive` | 25 | — | — |
| `financeiro` | 16 | — | — |
| `vendas` | 14 | — | — |
| `ops` | 20 | — | — |
| `public` | 1¹ | 535² | — |

> ¹ `_wal_slot_guard_events` — tabela interna do Supabase, não é dado de aplicação.
> ² Views em `public` são proxies que redirecionam para tabelas em `zapp`, `evo`, `email_app`, etc.

### Tabelas `zapp` com mais dados (>1k linhas)
| Tabela | Linhas estimadas | Tamanho |
|--------|-----------------|---------|
| `empresas` | 51.688 | 14 MB |
| `webhook_audit_log` | 58.232 | 19 MB |
| `webhook_events_processed` | 58.076 | 31 MB |
| `app_notifications` | 14.283 | 10 MB |
| `audit_logs` | 4.356 | 1,9 MB |
| `warroom_alerts` | 1.675 | 872 kB |
| `vault_healthcheck_log` | 2.961 | 1,3 MB |
| `query_telemetry` | 767 | 272 kB |

### Tabelas `evo` com mais dados (>1k linhas)
| Tabela | Linhas estimadas | Tamanho |
|--------|-----------------|---------|
| `evolution_messages_wpp2` | 41.045 | 51 MB |
| `evolution_webhook_events_v2_2026_07` | 24.368 | 14 MB |
| `evolution_contacts` | 20.563 | 18 MB |
| `evolution_whatsapp_status` | 14.789 | 10 MB |
| `evolution_media` | 23.366 | 10 MB |
| `evolution_conversations_wpp2` | 12.525 | 8,9 MB |
| `evolution_connection_history` | 5.223 | 2,0 MB |
| `evolution_reconcile_jobs` | 1.311 | 768 kB |

## Histórico

| Data | Evento |
|------|--------|
| 2026-07-14 | types.ts regenerado (9K→38K linhas, 57%→100% cobertura) |
| 2026-07-14 | DefaultSchema corrigido `"public"` → `"zapp"` |
| 2026-07-14 | 24 imports frontend migrados types.ts → schema.ts |
| 2026-07-15 | 105 edge functions migradas para `schema: 'zapp'` |
| 2026-07-15 | `_shared/db-client.ts` factory criada |
| 2026-07-15 | 17 syntax issues (}} malformado) corrigidos |
| 2026-07-15 | **Auditoria MCP**: contagem corrigida 294→315 (zapp), 193 confirmados (evo) |
| 2026-07-16 | **Auditoria exaustiva**: contagem definitiva 315→312 (zapp), public = 1+535 (não zero), 23 partições confirmadas (não 25), 12 RPCs ausentes identificados, Realtime corrigido para usar raiz particionada |

---

## Como escrever queries corretas (2026-07-15)

### Regra de ouro
- Cliente `supabase` importado de `@/integrations/supabase/client` **já está fixado em `zapp`**.
- Para tabelas fora de `zapp`, use `.schema('<schema>')` explicitamente.

### Frontend — leituras `zapp.*` (default)
```ts
import { supabase } from '@/integrations/supabase/client';

const { data } = await supabase
  .from('contacts')                // ← zapp.contacts (implícito)
  .select('id, name, phone')
  .eq('assigned_to', userId);
```

### Frontend — leituras `evo.*` (Evolution API)
```ts
const { data } = await supabase
  .schema('evo')                   // ← obrigatório
  .from('evolution_messages_wpp2')
  .select('id, remote_jid, content, timestamp')
  .order('timestamp', { ascending: false });
```

### Realtime — sempre com `schema` explícito e tabela **raiz**
```ts
supabase
  .channel('inbox-messages')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'evo', table: 'evolution_messages' },  // ← raiz, NÃO a partição
      handler)
  .subscribe();
```

Realtime **não segue o default** do cliente — o `schema` precisa aparecer no config.

> **ATENÇÃO**: a publicação `supabase_realtime` tem `publish_via_partition_root = true`.
> Isso significa que o evento CDC é publicado pela **tabela raiz** (`evolution_messages`),
> **nunca pela partição** (`evolution_messages_wpp2`). Assinar a partição resulta em silêncio
> total — zero eventos recebidos.

### Edge Functions — factories obrigatórias
```ts
// ✅ correto
import { createZappAdminClient } from '../_shared/db-client.ts';
const admin = createZappAdminClient();

// ❌ evitar (sem schema explícito)
const admin = createClient(url, key);

// ✅ alternativa válida (schema inline)
const admin = createClient(url, key, { db: { schema: 'zapp' } });
```

### Anti-patterns proibidos
| Padrão | Motivo |
|--------|--------|
| `.schema('public')` | schema `public` tem apenas 1 tabela interna Supabase (`_wal_slot_guard_events`) + 535 views proxy — não é schema de aplicação |
| `createClient` sem `db:{schema}` fora de factories | rota para o schema errado |
| URL `*.supabase.co` em código | projeto usa self-hosted `supabase.atomicabr.com.br` |
| Realtime sem `schema:` no config | canal sobe mas não recebe eventos |

Guardrail: `scripts/check-schema-usage.mjs` (bloqueante no CI) barra todos os itens acima.

## Checklist — Consultando tabelas `evo` no frontend

O cliente principal (`src/integrations/supabase/client.ts`) está fixado em
`db: { schema: 'zapp' }`. Para tocar em tabelas do schema `evo` (mensagens,
conversas, contatos da Evolution API):

1. **Use `.schema('evo')` explicitamente** antes de `.from()`.
2. **Para SELECT**: prefira a partição real (`evolution_messages_wpp2`,
   `evolution_conversations_wpp2`) para performance. O guardrail
   `check-schema-usage.mjs` falha o CI se detectar `evolution_messages` sem
   sufixo de partição em queries `src/`.
3. **Realtime**: no `channel.on('postgres_changes', ...)` passe
   `schema: 'evo'` e a **tabela raiz** (`evolution_messages`,
   `evolution_conversations`) — **NUNCA a partição**. A publicação
   `supabase_realtime` tem `publish_via_partition_root = true`, então eventos
   chegam pela raiz; assinar a partição resulta em zero eventos.
4. **Bridges em `zapp`** já existem para: `evolution_health_logs`,
   `evolution_instance_credentials`, `evolution_retry_metrics`,
   `evolution_instances`, `evolution_contacts`. Essas podem ser lidas via
   client `zapp` normal (sem `.schema('evo')`).

Exemplo canônico:

```ts
const { data } = await supabase
  .schema('evo')
  .from('evolution_messages_wpp2')
  .select('id, remote_jid, content, created_at')
  .eq('instance_name', 'wpp2')
  .order('created_at', { ascending: false })
  .limit(50);
```
