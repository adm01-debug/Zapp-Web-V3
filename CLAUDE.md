# ZAPP-WEB — Contexto para Claude Code
---

## OBRIGATORIO: leia antes de qualquer acao

> **Regra de commits (multi-agente):** Commits de codigo, docs ou config vao pelo container VPS (stack 122, claude-code). Sessao de chat nunca faz git push direto no main - causa rebases competitivos com a sessao VPS. Use portainer_exec_container para delegar. Politica canonica: HERMES.md.
> Para agentes Hermes: leia tambem [`HERMES.md`](./HERMES.md) para regras especificas de execucao paralela e estado do framework.

**1. Leia ESTADO.md (raiz do repo) antes de qualquer mudanca.**

Ele responde as perguntas essenciais:
- Qual edge function esta ligada em producao e quem a chama?
- O que foi auditado, arquivado e quais pendencias estao abertas?

Sem ler ESTADO.md voce corre risco de recriar algo que ja existe,
ou de ligar algo intencionalmente desligado.

**2. Pronto = ligado em producao com trafego real. Codigo existir nao e pronto.**

**3. Nova edge function: declare o chamador no mesmo commit. Sem chamador, nao entra.**

---


## Idioma

**SEMPRE comunicar em Português do Brasil** — toda resposta, comentário de código, mensagem de commit, descrição de PR e qualquer saída de texto deve estar em pt-BR. Nunca alternar para inglês, independentemente do idioma usado na pergunta.

## Projeto

**ZAPP-WEB (Pronto Talk Suite)** — plataforma omnichannel de atendimento ao cliente com WhatsApp, IA integrada, CRM e automações.

- **Produção**: https://zapp.atomicabr.com.br
- **Stack**: React 18 + TypeScript 5 + Vite + TailwindCSS + shadcn/ui + Supabase

---

## Evolution API — REGRA DE ACESSO (pós-desacoplamento 2026-08-12)

> ⚠️ **A infraestrutura da Evolution API foi extraída para [adm01-debug/evolution-stack](https://github.com/adm01-debug/evolution-stack).**
> Edge functions, hooks e migrations do zapp **permanecem aqui**.

**Regra de acesso obrigatória:**
- TODA saída HTTP para a Evolution API deve passar pelo gateway único:
  `supabase/functions/_shared/providers/evolution/client.ts` (12 verbos, 0 bypasses)
- **Nunca** use `EVOLUTION_API_URL` diretamente em edge functions ou frontend
- `callEvolutionApi` = @deprecated (removido de runtime em 2026-08-13, F3 decoupling)
  — presente apenas em mocks de teste legado; não reutilizar
- CI guard ativo: `decouple-guard.yml` bloqueia recriação de infra evolution neste repo

**Fronteira de propriedade:**
- `evo.*` → propriedade da Evolution / consumer (leitura via 12 views de contrato)
- `zapp.*` → propriedade do app (evo acessa só para monitoria — ADR-DB-002)


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
| **`evo`** | **136** | — | 100% | Tabelas da Evolution API (WhatsApp) |
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

2. **Para dados Evolution (mensagens/contatos/conversas)**: usar o cliente padrão (`supabase.from('evolution_messages')` etc.). **TOPOLOGIA ATUAL (revalidada AO VIVO em 2026-08-20 via `pg_class`/`pg_publication_tables` — ver `docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md`):** as tabelas **físicas** vivem no schema **`evo`** — `evo.evolution_messages` (raiz particionada, `relkind='p'`), `evo.evolution_conversations` (raiz particionada, `relkind='p'`) e `evo.evolution_contacts` (`relkind='r'`, 14 MB / 22.351 linhas). No schema `zapp`, `evolution_messages`/`evolution_conversations`/`evolution_contacts` são **views auto-updatable** (`security_invoker=on`) apontando para `evo` — por isso o cliente padrão (schema `zapp`) funciona para SELECT/INSERT/UPDATE. A afirmação anterior deste arquivo ("físicas em zapp; evo.evolution_messages NÃO EXISTE") estava **invertida** em relação ao banco de produção. NÃO usar `.schema('evo')` para REST: `evo` não está exposto no PostgREST (retorna `PGRST205`). **Exceção: Realtime** — subscriptions leem o WAL direto e DEVEM usar `schema: 'evo'` para as tabelas evolution_* (regra 4 abaixo).

3. **PostgREST**: sem o header `Accept-Profile: zapp`, queries falham com `PGRST205`.

4. **Realtime — IMPORTANTE**: a publicação `supabase_realtime` tem `publish_via_partition_root = true`. Eventos CDC saem pela **tabela raiz física** — nunca pela partição, nunca por view. Conteúdo da publication **verificado ao vivo em 2026-08-20** (`pg_publication_tables`): `evo.evolution_messages`, `evo.evolution_conversations`, `evo.evolution_contacts`, `zapp.profiles`, `zapp.app_notifications` (+ `zapp.failed_messages` e `zapp.dispatch_error_logs` reincorporadas pela migration `20260821001000`). Use nos listeners:
   - Mensagens do WhatsApp → `schema: 'evo'`, tabela **`evolution_messages`** (raiz física em `evo`), NÃO `evolution_messages_wpp2`. **Subscription em `schema: 'zapp'` recebe ZERO eventos** — `zapp.evolution_messages` é view, e view nunca emite CDC. (O código de produção já faz isso: `useZappMessages.ts`, `useZappConversations.ts`, `useRealtimeContacts.ts` assinam `schema: 'evo'`.)
   - Conversas → `schema: 'evo'`, tabela **`evolution_conversations`**; Contatos → `schema: 'evo'`, **`evolution_contacts`**.
   - Perfis/notificações → `schema: 'zapp'` (`profiles`, `app_notifications` — físicas em `zapp` e presentes na publication).
   - **`failed_messages`** → `schema: 'zapp'` (tabela física). Estava **fora** da publication em 2026-08-20 (canal silencioso p/ `useFailedMessageAlerts`) — corrigido pela migration `20260821001000_realtime_pub_failed_messages_dispatch_error_logs.sql`.
   - **`dispatch_error_logs`** → `schema: 'zapp'` — idem (reincorporada pela mesma migration; a adição original de `20260721` havia se perdido).
   - **Subscriptions na partição ficam silenciosas** (zero eventos) com `publish_via_partition_root=true`.
   - **Regra geral**: Realtime usa o WAL físico — apenas relations físicas na publication emitem eventos. Views nunca emitem, independentemente do schema. Antes de assinar uma tabela nova, confira `pg_publication_tables`.

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
| `evolution_messages` | **Raiz particionada FÍSICA em `evo`** (`relkind='p'`; revalidado ao vivo 2026-08-20 via `pg_class`) — `zapp.evolution_messages` é view auto-updatable sobre ela |
| `evolution_contacts` | **TABELA FÍSICA** em `evo` (14 MB, 22.351 linhas; auditado 2026-08-20 via `pg_class`) — `zapp.evolution_contacts` é VIEW auto-updatable (security_invoker=on) que aponta para cá |
| `evolution_conversations` | **Raiz particionada FÍSICA em `evo`** (`relkind='p'`) — `zapp.evolution_conversations` é view auto-updatable sobre ela |
| `evolution_webhook_events_v2_*` | Webhooks particionados por mês (2026-03 a 2027-06 + default) |
| `evolution_media` | Mídias (23.366, 10 MB) |
| `evolution_whatsapp_status` | Status WA (14.789, 10 MB) |

**Partições de `evo.evolution_messages` (raiz física em `evo`; revalidado via `pg_class` em 2026-08-20):**
`wpp2`, `comercial_01`–`comercial_08`, `compras`, `default`, `financeiro`, `logistica`, `marketing`

**Partições de `evolution_conversations` (13 partições — confirmado via `pg_inherits` em 2026-08-06):**
`wpp2`, `comercial_01`–`comercial_07`, `compras`, `default`, `financeiro`, `logistica`, `marketing`

> **Nota:** `evo.evolution_messages_wpp2_archive` é uma **tabela standalone regular** (`relkind='r'`), NÃO uma partição — não aparece em `pg_inherits`. Não confundir com as partições acima.

> `evolution_messages` e `evolution_conversations` são **tabelas raiz particionadas** (relkind='p' no schema `evo`).
> Os dados ficam nas partições listadas acima. No schema `zapp`, `evolution_messages`/`evolution_conversations`/
> `evolution_contacts` existem como **views auto-updatable** (security_invoker=on) que apontam para as raízes em `evo`.
> Para queries SELECT, tanto a raiz quanto as partições funcionam.
> Para **Realtime**, sempre use a raiz física em `evo` (regra 4 acima).
> Revalidado ao vivo em 2026-08-20 (`pg_class`) — este bloco é a descrição correta; ignorar qualquer texto antigo que afirme "físicas em zapp".

### Storage Buckets (13 buckets em produção)

| Bucket | Público | Limite | Notas |
|--------|---------|--------|---------|
| `audio-memes` | **sim** | 5 MB | Público por decisão explícita do dono (migrations 20260806194000 e 20260806195000). Áudios de memes internos. |
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
| `whatsapp-media` | **sim** | 50 MB | Público desde BUG-MEDIA-20260806. LEITURA pública via `/object/public/`. UPLOAD requer autenticação. 18.494 objetos. |

> **Cron jobs ativos:** 239 jobs em `cron.job` (pg_cron — auditado ao vivo 2026-08-20; anteriores: 218 em 2026-08-15, 151 em 2026-08-06)
> **Vault:** 37 secrets em `vault.secrets` (faxina concluída — zero `minio_*`/DEPRECATED; inventário canônico em `docs/SECRETS_INVENTORY.md`)

---

## Bugs Abertos

| ID | Componente | Problema | Severidade | Próximo Passo |
|----|-----------|----------|-----------|---------------|
| BUG-C | n8n | FK constraint violada em `workflow_history` | 🟠 Alto | Investigar DB n8n + FK cascades |

> Histórico completo de bugs resolvidos em `docs/CHANGELOG_SESSIONS.md`.

---

## Incidentes fechados — NÃO REABRIR

| Data | Incidente | Causa raiz | Fix + trava |
|------|-----------|-----------|-------------|
| 2026-08-20 | Bundle público dos 3 hosts embutia **anon key inválida** → 401 em auth e dados (`PGRST301`, `Unauthorized` no Kong) | Secret GitHub `VITE_SUPABASE_PUBLISHABLE_KEY` continha anon key de **outro ambiente** (assinada com JWT_SECRET diferente; Kong e PostgREST recusavam). `client.ts` já era defensivo — a falha foi de **config de env**, que teste de código não pega | Secret corrigido via `gh secret set` + redeploy (run 32421024974). Guard reforçado (commit 3fcc3223): `bundle-secret-guard.yml` agora, além de barrar `service_role`, **valida que a anon key é ACEITA pelo Kong** e falha em 401 (`ANON_KEY_REJECTED`). Roda pós-deploy + diário |

> **Domínio ZAPP:** `www.zappweb.app.br` migrado da Vercel → **VPS** (DNS A `<IP-VPS>`; Traefik router `zappweb-www` inline no stack 157). Vercel **aposentada** para o ZAPP; verificado ao vivo em 2026-08-20 que o team `juca1` não tem mais NENHUM projeto zapp. **Fonte única = VPS.** Não recriar deploy na Vercel para este app.
> **Domínio canônico:** `zapp.atomicabr.com.br` (é o `rel=canonical` do index.html); `zappweb.app.br` e `www.zappweb.app.br` são aliases servindo o MESMO bundle (verificado byte-a-byte em 2026-08-20). Detalhes: `docs/ARQUITETURA_CANONICA.md`.

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

- **29.150 nós, 54.653 arestas, 2.013 comunidades** (rebuild 2026-08-20, commit 3fcc3223)
- Extração: 99% EXTRACTED · 1% INFERRED · inclui as 220 migrations SQL (graphifyy[sql])
- **Top god nodes (rebuild 2026-08-20):** `cn()` (982°), `Button` (504°), `supabase` (412°), `Badge` (366°), `Card` (329°), `CardContent` (316°), `CardHeader` (257°), `getLogger()` (257°), `CardTitle` (255°), `err()` (213°)
- **Limitação conhecida do parser (NÃO é bug):** 31 arquivos `.tsx` saem como "partially extracted" — todos por **`&` literal em texto JSX** (ex.: `VoIP & Chamadas`, `Conexões & Integrações`, `Privacidade & LGPD`). O tree-sitter do graphify aborta no `&` cru; esbuild/tsc/React aceitam (build de prod passa). Consultas a esses componentes podem faltar nós/arestas a partir da 1ª linha com `&`. **Não** trocar por `&amp;` — é churn por falso positivo de ferramenta.
- **MCP server:** 8 tools (`graphify_query`, `graphify_path`, `graphify_db_crossref`, etc.)

**Sempre consultar o grafo antes de `search_files`/grep.**

Regenerar (via container claude-code, ~2,5 min, sem custo de API):
```sh
. /workspace/.local/env.sh && cd /workspace/repos/zapp-web-v3 && graphify update . --force
```
Consultar: `graphify explain "<no>"` · `graphify path "A" "B"`

`graph.json` (35 MB) e `graph.html` **não** são versionados — só `GRAPH_REPORT.md` e `manifest.json`.

---

## Documentação de Referência

| Doc | Conteúdo |
|-----|----------|
| `docs/ARQUITETURA_CANONICA.md` | **Arquitetura canônica pós-auditoria** (hosting, DB, edge, secrets, deploy) — 2026-08-20 |
| `docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md` | Validação exaustiva das 100 etapas do plano de melhorias (status + evidências) |
| `docs/SECRETS_INVENTORY.md` | Inventário único de chaves/secrets (onde vive, rotação) |
| `docs/SCHEMA_REFERENCE.md` | **Documento canônico** de schemas e tabelas |
| `docs/SCHEMA_SNAPSHOT.md` | Snapshot de contagens do DB (2026-08-04) |
| `docs/RPC_STUBS_STATUS.md` | Status dos stubs de RPC ativos |
| `docs/CHANGELOG_SESSIONS.md` | Histórico de sessões e bugs resolvidos |
| `docs/AUDIT_MIGRATION_VS_DB_50_STEPS.md` | Plano de auditoria migration vs DB (50 etapas) — **CONSOLIDADO** em [`supabase/migrations/README.md`](./supabase/migrations/README.md) |
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
