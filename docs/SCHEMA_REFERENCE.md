# 📐 Schema Reference — ZAPP WEB

> **Documento canônico** sobre a arquitetura de schemas do Supabase.
> Última atualização: 2026-07-15. Auditado e corrigido: 2026-07-15. Qualquer doc que contradiga este está desatualizado.

## Arquitetura Atual (pós-consolidação)

O ZAPP Web usa **um único Supabase Self-Hosted** (`supabase.atomicabr.com.br`) com **múltiplos schemas PostgreSQL**:

| Schema | Conteúdo | Quem acessa | Exemplos |
|--------|----------|-------------|----------|
| **`zapp`** | Todas as tabelas do app (**315**), views, RPCs | Frontend (client.ts), Edge Functions, n8n | `profiles`, `queues`, `contatos`, `whatsapp_connections`, `empresas`, `webhook_audit_log` |
| **`evo`** | Tabelas-fonte da Evolution API (**193 tabelas**) | Realtime subscriptions, Edge Functions que fazem `.schema('evo')` | `evolution_messages_wpp2`, `evolution_contacts`, `evolution_webhook_events_v2`, `evolution_conversations_wpp2` |
| **`public`** | **Zero tabelas** — apenas views materializadas e proxies | Não usar diretamente | `mv_conversations_summary` |
| **`auth`** | Auth do Supabase (GoTrue) | `supabase.auth.*` | `auth.users` |

### Regras de Ouro

1. **`schema: 'zapp'`** é obrigatório em todo `createClient()` que faça `.from()` ou `.rpc()`.
   O `client.ts` do frontend já tem `db: { schema: 'zapp' }` configurado.
   Edge Functions devem usar `createZappAdminClient()` de `_shared/db-client.ts`.

2. **Realtime** subscriptions devem usar o schema da **tabela base** (não views):
   - Tabelas `zapp.*` → `schema: 'zapp'`
   - Tabelas `evo.*` → `schema: 'evo'`
   - Views **nunca emitem** WAL events — não usar em Realtime.

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

## Contagem de Tabelas por Schema (auditado 2026-07-15 via MCP)

| Schema | Tabelas reais | RLS ativo |
|--------|--------------|-----------|
| `zapp` | **315** | 100% |
| `evo` | **193** | 100% |
| `auth` | 21 | — |
| `bpm` | 41 | — |
| `email_app` | 33 | — |
| `ai` | 31 | — |
| `archive` | 25 | — |
| `financeiro` | 16 | — |
| `vendas` | 13 | — |
| `ops` | 20 | — |
| `public` | **0** | — |

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
