# ZAPP-WEB — Contexto para Claude Code

## Projeto

**ZAPP-WEB (Pronto Talk Suite)** — plataforma omnichannel de atendimento ao cliente com WhatsApp, IA integrada, CRM e automações.

- **Produção**: https://zapp.atomicabr.com.br
- **Stack**: React 18 + TypeScript 5 + Vite + TailwindCSS + shadcn/ui + Supabase

---

## Banco de Dados — OBRIGATÓRIO LER

### Instância Supabase

| Atributo | Valor |
|----------|-------|
| **Tipo** | Self-Hosted (VPS AtomicaBR) |
| **URL** | `https://supabase.atomicabr.com.br` |
| **Schema principal** | `zapp` |
| **Schema Evolution API** | `evo` |
| **Schema public** | 1 tabela interna Supabase + 532 views proxy |

### Schemas e Tabelas (auditado 2026-07-16 — regras verificadas contra DB de produção)

| Schema | Base Tables | Views | RLS | Descrição |
|--------|-------------|-------|-----|-----------|
| **`zapp`** | **312** | **404** | 100% | Todas as tabelas da aplicação |
| **`evo`** | **193** | — | 100% | Tabelas da Evolution API (WhatsApp) |
| `auth` | 21 | — | — | Auth GoTrue do Supabase |
| `bpm` | 41 | — | — | BPM/workflows |
| `email_app` | 33 | — | — | Integração Gmail |
| `ai` | 31 | — | — | IA e embeddings |
| `archive` | 25 | — | — | Dados arquivados |
| `financeiro` | 16 | — | — | Módulo financeiro |
| `vendas` | 13 | — | — | Módulo vendas |
| `ops` | 20 | — | — | Operações internas |
| `public` | 1¹ | 532² | — | NÃO usar diretamente |

> ¹ `public._wal_slot_guard_events` — tabela interna do Supabase (WAL slot guard), não é tabela de aplicação.
> ² As 532 views em `public` são proxies/aliases para tabelas em outros schemas (zapp, evo, email_app, etc.).

### Regras Críticas de Schema

1. **SEMPRE usar `schema: 'zapp'`** — o cliente Supabase já está configurado com isso em `src/integrations/supabase/client.ts`. Não trocar para `public`.

2. **Para dados Evolution (mensagens/contatos/conversas)**: usar o cliente padrão (`supabase.from('evolution_messages')` etc.) porque as tabelas `evolution_*` existem como **views auto-updatable** no schema `zapp` com `security_invoker=on`. **NÃO usar `.schema('evo').from(...)` para objetos que existem como views em `zapp`** — isso causa `PGRST205` se o objeto não existir no schema `evo`. Use `.schema('evo')` apenas para tabelas que existem SOMENTE no schema `evo` e não têm view correspondente em `zapp`.

3. **PostgREST**: sem o header `Accept-Profile: zapp`, queries falham com `PGRST205`.

4. **Realtime — IMPORTANTE**: a publicação `supabase_realtime` tem `publish_via_partition_root = true`. Isso significa que eventos CDC são publicados pela **tabela raiz particionada**, nunca pela partição. Use a tabela raiz nos listeners:
   - Mensagens do WhatsApp → `schema: 'evo'`, tabela **`evolution_messages`** (raiz), NÃO `evolution_messages_wpp2`
   - Conversas → `schema: 'evo'`, tabela **`evolution_conversations`** (raiz), NÃO `evolution_conversations_wpp2`
   - Perfis/notificações → `schema: 'zapp'`
   - **Subscriptions na partição ficam silenciosas** (zero eventos) com `publish_via_partition_root=true`.

5. **Tipos TypeScript**: importar SEMPRE de `@/integrations/supabase/schema` (barrel canônico), nunca de `types.ts` diretamente.

### Tabelas Principais do Schema `zapp`

| Tabela | Função |
|--------|--------|
| `profiles` | Usuários da plataforma (17 registros) |
| `workspaces` | Workspaces/tenants |
| `workspace_members` | Membros por workspace (15) |
| `whatsapp_connections` | Conexões WA (3 ativas) |
| `instance_registry` | Registro de instâncias (23) |
| `empresas` | Empresas/clientes (51.688) |
| `contatos` | Contatos/leads |
| `departments` | Departamentos |
| `queues` | Filas de atendimento |
| `webhook_audit_log` | Log de webhooks (58.232 linhas, 19 MB) |
| `webhook_events_processed` | Eventos processados (58.076, 31 MB) |
| `app_notifications` | Notificações (14.283) |
| `audit_logs` | Logs de auditoria (4.356) |
| `user_roles` | Permissões (14) |

### Tabelas Principais do Schema `evo`

| Tabela | Função |
|--------|--------|
| `evolution_messages` | Raiz particionada de mensagens (25 partições por instância) |
| `evolution_contacts` | Contatos da Evolution API (20.563, 18 MB) |
| `evolution_conversations` | Raiz particionada de conversas (25 partições) |
| `evolution_webhook_events_v2_*` | Webhooks particionados por mês (2026-03 a 2027-06 + default) |
| `evolution_media` | Mídias (23.366, 10 MB) |
| `evolution_whatsapp_status` | Status WA (14.789, 10 MB) |

**Partições de `evolution_messages` (25 partições por instância):**
`wpp2`, `wpp2_archive`, `artes`, `comercial_01`–`comercial_15`, `compras`, `default`, `financeiro`, `gravacao`, `logistica`, `marketing`

> `evolution_messages` e `evolution_conversations` são **tabelas raiz particionadas** (relkind='p' no evo schema).
> Os dados ficam nas partições por instância. No schema `zapp`, `evolution_messages` existe como
> **view auto-updatable** (security_invoker=on) que aponta para a raiz no schema `evo`.
> Para queries SELECT, tanto a raiz quanto as partições funcionam.
> Para **Realtime**, sempre use a raiz (regra 4 acima).

### Storage Buckets (13 buckets em produção)

| Bucket | Público | Limite |
|--------|---------|--------|
| `audio-memes` | não | 5 MB |
| `audio-messages` | não | — |
| `avatars` | sim | 5 MB |
| `comprovantes-financeiro` | não | 20 MB |
| `custom-emojis` | sim | 512 KB |
| `email-attachments` | não | — |
| `etiquetas-remessa` | não | 10 MB |
| `fechamentos` | não | 20 MB |
| `quarantine` | não | — |
| `recibos-entrega` | sim | 10 MB |
| `stickers` | sim | 512 KB |
| `team-chat-files` | não | — |
| `whatsapp-media` | não | — |

> **BUG ATIVO**: `src/features/inbox/components/chat/useAudioVoiceChange.ts` usa o bucket `chat-media`
> que **não existe**. Uploads de voz irão falhar com 404. Bucket correto: `audio-messages`.

### Bugs Conhecidos e Gaps de Implementação

| ID | Arquivo | Problema | Impacto |
|----|---------|----------|---------|
| BUG-1 | `src/features/admin/hooks/useAdminManagement.ts:552` | `.from('queue_skills')` — tabela não existe; correto é `queue_skill_requirements` | Erro 404 em runtime |
| BUG-2 | `src/features/inbox/components/chat/useAudioVoiceChange.ts:13` | `supabase.storage.from('chat-media')` — bucket não existe; correto é `audio-messages` | Upload de voz falha |
| GAP-1 | `src/hooks/useCampaigns.ts:100` | `rpc('add_contacts_to_campaign')` — função não existe no DB | Runtime error |
| GAP-2 | `src/hooks/useIntegrationManagement.ts:54,69` | `rpc('initiate_gmail_oauth')`, `rpc('complete_gmail_oauth')` — não existem | OAuth Gmail quebrado |
| GAP-3 | `src/hooks/useIntegrationManagement.ts:156` | `rpc('sync_to_crm')` — não existe | Sync CRM quebrado |
| GAP-4 | `src/hooks/useMediaManagement.ts:93,128,156` | `rpc('export_user_data')`, `rpc('import_user_data')`, `rpc('check_download_permission')` — não existem | Export/Import quebrado |
| GAP-5 | `src/hooks/useCRMManagement.ts:146` | `rpc('enrich_contact')` — não existe | Enriquecimento de contato quebrado |
| GAP-6 | `src/hooks/useAnalyticsManagement.ts:168` | `rpc('get_latest_analysis')` — não existe | Analytics quebrado |
| GAP-7 | `src/features/admin/hooks/monitoring/useFailedMessages.ts:78` | `rpc('rpc_list_failed_messages_cursor')` — não existe | Painel de mensagens falhas quebrado |
| GAP-8 | `src/features/admin/hooks/monitoring/useDispatchErrorLogs.ts:61` | `rpc('rpc_list_dispatch_error_logs_cursor')` — não existe | Painel de erros de despacho quebrado |
| GAP-9 | `src/features/admin/hooks/monitoring/useDlqAuditLog.ts:51` | `rpc('rpc_dlq_list_audit_cursor')` — não existe | Painel DLQ audit quebrado |

---

## Configuração do Cliente Supabase

```typescript
// src/integrations/supabase/client.ts (NÃO ALTERAR)
export const supabase = createClient<ExtendedDatabase>(url, key, {
  db: { schema: 'zapp' },  // ← schema canônico
  auth: { ... },
  realtime: { ... },
});
```

Para Edge Functions, usar `createZappAdminClient()` de `supabase/functions/_shared/db-client.ts`.

---

## Comandos Úteis

```bash
# Dev
bun run dev

# Testes
bun run test
bun run test:e2e

# Regenerar tipos TypeScript do banco
# (requer acesso à instância self-hosted)
curl -s "http://supabase_meta:8080/generators/typescript\
  ?included_schemas=public,zapp\
  &detect_one_to_one_relationships=true" \
  > src/integrations/supabase/types.ts
```

---

## Documentação de Referência

| Doc | Conteúdo |
|-----|----------|
| `docs/SCHEMA_REFERENCE.md` | **Documento canônico** de schemas e tabelas |
| `docs/ER_DIAGRAM.md` | Diagrama de entidade-relacionamento |
| `docs/ARCHITECTURE_AND_FLOW.md` | Arquitetura e fluxo de dados |
| `docs/API_CONTRACT.md` | Contratos de API |
| `docs/EVOLUTION_API_REFERENCE.md` | API Evolution (WhatsApp) |
| `docs/RUNBOOK_OBSERVABILITY.md` | Observabilidade e alertas |
| `SECURITY.md` | Políticas de segurança |

---

## Estrutura de Pastas Relevante

```
src/
├── integrations/supabase/   # Cliente Supabase, tipos, helpers
│   ├── client.ts            # createClient com schema: 'zapp'
│   ├── types.ts             # Auto-gerado (38K linhas, NÃO editar)
│   └── schema.ts            # Barrel canônico de tipos
├── hooks/                   # React hooks (useInbox, useMessages, etc.)
├── components/              # Componentes UI
└── lib/                     # Utilitários

supabase/
├── functions/               # 123 Edge Functions (Deno)
│   └── _shared/
│       └── db-client.ts     # createZappAdminClient()
└── migrations/              # 800+ migrações SQL
```
