# ZAPP-WEB — Contexto para Claude Code

## Idioma

**SEMPRE comunicar em Português do Brasil** — toda resposta, comentário de código, mensagem de commit, descrição de PR e qualquer saída de texto deve estar em pt-BR. Nunca alternar para inglês, independentemente do idioma usado na pergunta.

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
| **Schema public** | 1 tabela interna Supabase + 511 views proxy |

### Schemas e Tabelas (auditado 2026-08-06 — contagens do DB de produção)

| Schema | Base Tables | Views | RLS | Descrição |
|--------|-------------|-------|-----|-----------|
| **`zapp`** | **323** | **380** | 100% | Todas as tabelas da aplicação |
| **`evo`** | **143** | — | 100% | Tabelas da Evolution API (WhatsApp) |
| `auth` | 21 | — | — | Auth GoTrue do Supabase |
| `bpm` | 41 | — | — | BPM/workflows |
| `email_app` | 33 | — | — | Integração Gmail |
| `ai` | 31 | — | — | IA e embeddings |
| `archive` | 25 | — | — | Dados arquivados |
| `financeiro` | 16 | — | — | Módulo financeiro |
| `vendas` | 13 | — | — | Módulo vendas |
| `ops` | 20 | — | — | Operações internas |
| `artes` | 2 | 1 | — | Artes gráficas e design |
| `graveyard` | 0 | — | — | Schema arquivado (dados legados) |
| `logistica` | 3 | — | — | Logística e expedição |
| `monitoring` | 1 | 13 | — | Monitoramento e métricas do sistema |
| `parity_audit` | 2 | — | — | Auditoria de paridade de dados entre schemas |
| `public` | 1¹ | 511² | — | NÃO usar diretamente |

> ¹ `public._wal_slot_guard_events` — tabela interna do Supabase (WAL slot guard), não é tabela de aplicação.
> ² As 511 views em `public` são proxies/aliases para tabelas em outros schemas (zapp, evo, email_app, etc.).

### Regras Críticas de Schema

1. **SEMPRE usar `schema: 'zapp'`** — o cliente Supabase já está configurado com isso em `src/integrations/supabase/client.ts`. Não trocar para `public`.

2. **Para dados Evolution (mensagens/contatos/conversas)**: usar o cliente padrão (`supabase.from('evolution_messages')` etc.) porque as tabelas `evolution_*` existem como **views auto-updatable** no schema `zapp` com `security_invoker=on`. **NÃO usar `.schema('evo').from(...)` para objetos que existem como views em `zapp`** — isso causa `PGRST205` se o objeto não existir no schema `evo`. Use `.schema('evo')` apenas para tabelas que existem SOMENTE no schema `evo` e não têm view correspondente em `zapp`.

3. **PostgREST**: sem o header `Accept-Profile: zapp`, queries falham com `PGRST205`.

4. **Realtime — IMPORTANTE**: a publicação `supabase_realtime` tem `publish_via_partition_root = true`. Isso significa que eventos CDC são publicados pela **tabela raiz particionada**, nunca pela partição. Use a tabela raiz nos listeners:
   - Mensagens do WhatsApp → `schema: 'evo'`, tabela **`evolution_messages`** (raiz), NÃO `evolution_messages_wpp2`
   - Conversas → `schema: 'evo'`, tabela **`evolution_conversations`** (raiz), NÃO `evolution_conversations_wpp2`
   - Perfis/notificações → `schema: 'zapp'`
   - **`failed_messages`** → `schema: 'zapp'` (tabela física; `public.failed_messages` é VIEW, não entra na publication — subscription com `schema: 'public'` é no-op silencioso)
   - **`dispatch_error_logs`** → `schema: 'zapp'` (adicionada à publication `supabase_realtime` em `20260721_fix_cursor_rpcs_and_search_path.sql`)
   - **Subscriptions na partição ficam silenciosas** (zero eventos) com `publish_via_partition_root=true`.
   - **Regra geral**: Realtime usa o WAL físico — apenas relations físicas na publication emitem eventos. Views nunca emitem, independentemente do schema.

5. **Tipos TypeScript**: importar SEMPRE de `@/integrations/supabase/schema` (barrel canônico), nunca de `types.ts` diretamente.

### Tabelas Principais do Schema `zapp`

| Tabela | Função |
|--------|--------|
| `profiles` | Usuários da plataforma (19 registros) |
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
| `evolution_conversations` | Raiz particionada de conversas (13 partições — auditado 2026-08-06) |
| `evolution_webhook_events_v2_*` | Webhooks particionados por mês (2026-03 a 2027-06 + default) |
| `evolution_media` | Mídias (23.366, 10 MB) |
| `evolution_whatsapp_status` | Status WA (14.789, 10 MB) |

**Partições de `evolution_messages` (14 partições — confirmado via `pg_inherits` em 2026-08-06):**
`wpp2`, `comercial_01`–`comercial_08`, `compras`, `default`, `financeiro`, `logistica`, `marketing`

**Partições de `evolution_conversations` (13 partições — confirmado via `pg_inherits` em 2026-08-06):**
`wpp2`, `comercial_01`–`comercial_07`, `compras`, `default`, `financeiro`, `logistica`, `marketing`

> **Nota:** `evo.evolution_messages_wpp2_archive` é uma **tabela standalone regular** (`relkind='r'`), NÃO uma partição — não aparece em `pg_inherits`. Não confundir com as partições acima.

> `evolution_messages` e `evolution_conversations` são **tabelas raiz particionadas** (relkind='p' no evo schema).
> Os dados ficam nas partições listadas acima. No schema `zapp`, `evolution_messages` existe como
> **view auto-updatable** (security_invoker=on) que aponta para a raiz no schema `evo`.
> Para queries SELECT, tanto a raiz quanto as partições funcionam.
> Para **Realtime**, sempre use a raiz (regra 4 acima).

### Storage Buckets (13 buckets em produção)

| Bucket | Público | Limite | Notas |
|--------|---------|--------|---------|
| `audio-memes` | não | 5 MB | |
| `audio-messages` | **sim** | — | **LEITURA pública** via `/storage/v1/object/public/` — UPLOAD requer autenticação. `allowed_mime_types: [ogg,webm,mpeg,mp3,aac,mp4]`. |
| `avatars` | sim | 5 MB | |
| `comprovantes-financeiro` | não | 20 MB | |
| `custom-emojis` | sim | 512 KB | |
| `email-attachments` | não | — | |
| `etiquetas-remessa` | não | 10 MB | |
| `fechamentos` | não | 20 MB | |
| `quarantine` | não | — | |
| `recibos-entrega` | sim | 10 MB | |
| `stickers` | sim | 512 KB | |
| `team-chat-files` | não | — | |
| `whatsapp-media` | não | — | |

> **Cron jobs ativos:** 151 jobs em `cron.job` (pg_cron — auditado 2026-08-06)

---

## Bugs Abertos

| ID | Componente | Problema | Severidade | Próximo Passo |
|----|-----------|----------|-----------|---------------|
| BUG-C | n8n | FK constraint violada em `workflow_history` | 🟠 Alto | Investigar DB n8n + FK cascades |
| BUG-D | Edge Function | `POST /rest/v1/contacts` retorna 404 | 🟠 Alto | Verificar handler da edge function |

> Histórico completo de bugs resolvidos em `docs/CHANGELOG_SESSIONS.md`.

---

## Stubs Ativos (RPCs sem implementação real)

Estas funções existem como stubs em `supabase/migrations/20260717000002_create_missing_rpcs_stubs.sql`.
Todas fazem `RAISE EXCEPTION P0001` exceto onde indicado. **Não implementar como tabelas** — requerem Edge Functions.

| RPC | Comportamento do Stub | Implementação Real |
|-----|-----------------------|--------------------|
| `initiate_gmail_oauth` | RAISE P0001 | Edge Function OAuth Google |
| `complete_gmail_oauth` | RAISE P0001 | Edge Function OAuth callback |
| `sync_to_crm` | RAISE P0001 | Edge Function + API CRM |
| `export_user_data` | Retorna perfil básico (JSON) | Edge Function export completo |
| `import_user_data` | RAISE P0001 | Edge Function com validação |
| `enrich_contact` | Retorna `{enriched: false}` | Integração API enriquecimento |
| `get_latest_analysis` | Retorna avg engagement_score | Analytics completo |

> `check_download_permission` — **NÃO é stub**: função intencionalmente ausente, frontend fail-open via SQLSTATE 42883.
> Detalhes completos em `docs/RPC_STUBS_STATUS.md`.

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
curl -s "http://supabase_meta:8080/generators/typescript?included_schemas=public,zapp&detect_one_to_one_relationships=true" > src/integrations/supabase/types.ts
```

---

## Knowledge Graph (Graphify)

O repositório possui um **grafo de conhecimento** em `graphify-out/` (Apache 2.0, on-device).

- **17.146 nós, 40.507 arestas, 1.765 comunidades**
- **Top god nodes:** `cn()` (790°), `Button` (495°), `supabase` (371°)
- **MCP server:** 8 tools (`graphify_query`, `graphify_path`, `graphify_db_crossref`, etc.)

**Sempre consultar o grafo antes de `search_files`/grep.** Regenerar: `bash scripts/regenerate-graph.sh`

---

## Documentação de Referência

| Doc | Conteúdo |
|-----|----------|
| `docs/SCHEMA_REFERENCE.md` | **Documento canônico** de schemas e tabelas |
| `docs/SCHEMA_SNAPSHOT.md` | Snapshot de contagens do DB (2026-08-04) |
| `docs/RPC_STUBS_STATUS.md` | Status dos stubs de RPC ativos |
| `docs/CHANGELOG_SESSIONS.md` | Histórico de sessões e bugs resolvidos |
| `docs/AUDIT_MIGRATION_VS_DB_50_STEPS.md` | Plano de auditoria migration vs DB (50 etapas) |
| `docs/ER_DIAGRAM.md` | Diagrama de entidade-relacionamento |
| `docs/ARCHITECTURE_AND_FLOW.md` | Arquitetura e fluxo de dados |
| `docs/API_CONTRACT.md` | Contratos de API |
| `docs/EVOLUTION_API_REFERENCE.md` | API Evolution (WhatsApp) |
| `docs/RUNBOOK_OBSERVABILITY.md` | Observabilidade e alertas |
| `SECURITY.md` | Políticas de segurança |
| `infra/runbooks/OPERATIONS.md` | Runbook de operações |
| `infra/backup/README.md` | Backup & restore procedure |
| `infra/evolution/SETTINGS.md` | Configs Evolution wpp2 |
| `docs/QA_REPORT_2026-07-22.md` | QA Report completo (22/07) |
| `docs/audit-2026-08-06/EXECUTIVE_SUMMARY.md` | Sumário executivo da auditoria container × Supabase (2026-08-06) |
| `docs/audit-2026-08-06/RECONCILIATION_MATRIX.md` | Matriz completa de reconciliação (40 checks, 8 dimensões) |
| `docs/audit-2026-08-06/reconciliation.json` | Achados da auditoria em formato estruturado |
| `docs/audit-2026-08-06/VALIDATION_PLAN_100_STEPS.md` | Plano de validação — 100 etapas da auditoria |

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
└── migrations/              # 130+ migrações SQL

infra/                       # Infraestrutura
├── runbooks/                # Procedimentos operacionais
│   └── OPERATIONS.md        # Runbook (lean)
├── backup/                  # Documentação de backup
│   └── README.md            # Procedimento de restore
└── evolution/               # Configurações Evolution
    └── SETTINGS.md          # Settings atuais da wpp2
```
