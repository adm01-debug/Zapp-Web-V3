# 📐 Schema Reference — ZAPP WEB

> **Documento canônico** sobre a arquitetura de schemas do Supabase.
> Última atualização: 2026-07-15. Qualquer doc que contradiga este está desatualizado.

## Arquitetura Atual (pós-consolidação)

O ZAPP Web usa **um único Supabase Self-Hosted** (`supabase.atomicabr.com.br`) com **múltiplos schemas PostgreSQL**:

| Schema | Conteúdo | Quem acessa | Exemplos |
|--------|----------|-------------|----------|
| **`zapp`** | Todas as tabelas do app (294), views (400), RPCs (664) | Frontend (client.ts), Edge Functions, n8n | `profiles`, `queues`, `contacts`, `whatsapp_connections` |
| **`evo`** | Tabelas-fonte da Evolution API (mensagens, contatos raw) | Realtime subscriptions, Edge Functions que fazem `.schema('evo')` | `evolution_messages`, `evolution_contacts`, `evolution_webhook_events` |
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

## Histórico

| Data | Evento |
|------|--------|
| 2026-07-14 | types.ts regenerado (9K→38K linhas, 57%→100% cobertura) |
| 2026-07-14 | DefaultSchema corrigido `"public"` → `"zapp"` |
| 2026-07-14 | 24 imports frontend migrados types.ts → schema.ts |
| 2026-07-15 | 105 edge functions migradas para `schema: 'zapp'` |
| 2026-07-15 | `_shared/db-client.ts` factory criada |
| 2026-07-15 | 17 syntax issues (}} malformado) corrigidos |
