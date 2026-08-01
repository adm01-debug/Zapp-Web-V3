# Auditoria Exaustiva — ZAPP · Lovable Cloud → Supabase Self-Hosted

**Data:** 01/08/2026
**Escopo:** Supabase self-hosted (`supabase.atomicabr.com.br`, schema `zapp` + schemas de domínio) vs Lovable Cloud (`uqysyzndkfiwfztbqvsl` / projeto `22c0b518-7895-4f4f-9ea0-978457a2c37a`)
**Repositório:** `adm01-debug/zapp-web-v3` (branch `main`)
**Infra:** AtomicaBR VPS · Docker Swarm · Portainer endpoint 1
**Método:** 40 etapas de auditoria via MCP (Supabase self-hosted, Lovable, GitHub FOREVER, Portainer, Evolution)

---

## Sumário Executivo

A migração **estrutural** está essencialmente completa: 147/147 tabelas, 92/92 funções, 11/11 views e 1 única coluna divergente em ~2.000 verificadas. A arquitetura foi inclusive melhorada — o monólito `public` do Lovable foi decomposto em schemas de domínio (`zapp`, `evo`, `ai`, `email_app`, `financeiro`, `vendas`) com views de compatibilidade `security_invoker` no schema `zapp`.

**O problema não é a migração de dados. É a camada de execução e de segurança.**

Cinco achados de severidade P0 impedem que o sistema seja considerado íntegro em produção:

| # | Achado | Impacto |
|---|---|---|
| P0-1 | `VERIFY_JWT="false"` (com aspas) no edge-runtime + `JWT_SECRET` ausente | **As 120 Edge Functions estão publicamente acessíveis sem autenticação.** O `config.toml` com `verify_jwt = true` é ignorado pelo runtime self-hosted |
| P0-2 | 70 de 78 variáveis de ambiente exigidas pelo código não existem no container | Gmail, Outlook, Bitrix, SICOOB, WhatsApp Cloud, Resend, VirusTotal, Sentry, OpenAI/Anthropic e todo `service_role` quebrados em runtime |
| P0-3 | 464 policies `USING (true)` para `authenticated` (Lovable tinha 43) | **Isolamento por agente/departamento inexistente.** 85 tabelas regrediram de policy restritiva para acesso total |
| P0-4 | Buckets `whatsapp-media` e `audio-messages` públicos (eram privados no Lovable) | Mídia de clientes (áudios, documentos, imagens) legível por URL sem autenticação — exposição LGPD |
| P0-5 | Fluxo SICOOB quebrado ponta a ponta: cron `sicoob-outbox-drain` ausente + função `sicoob-outbox-consumer` não deployada | Outbox nunca é drenado; respostas SICOOB não saem |

Adicionalmente, a perda do `UNIQUE` em `contacts.phone` **já produziu 503 telefones duplicados** em `evo.evolution_contacts`.

---

# PARTE I — AUDITORIA (40 ETAPAS)

## Bloco A — Disponibilidade e Infraestrutura (etapas 1–5)

### Etapa 1 — Disponibilidade do MCP self-hosted
**Status inicial: FALHA. Corrigido durante a auditoria.**

As stacks `supabase-db-mcp` (128), `supabase-pttz-mcp` (183) e `supabase-artes-mcp` (143) estavam com 0 réplicas ativas há ~9h. `docker service ps` mostrou estado `Complete` (exit code 0).

Causa raiz: `restart_policy: condition: on-failure` **não reagenda task que termina com código 0**. Traefik removeu as rotas → HTTP 404 em `supabase-mcp.atomicabr.com.br`.

Correlação temporal: janela de pause/resume em massa de 31/07 19:54–21:19, coincidente com criação das stacks `disk-metrics-collector` (201), `disk-deep-clean` (203) e `disk-actioner` (204). Disco em 71% (137 GB / 193 GB).

Ação executada: `docker service update --force` nas três stacks. `/health` retornou `{"status":"healthy","version":"3.3.0","database":{"ok":true}}`.

### Etapa 2 — Estado do cluster Swarm
115 containers, 74 stacks ativas. Serviços críticos do ZAPP saudáveis: `supabase_db` (up 9h, healthy), `supabase_kong` (3d, healthy), `supabase_rest` (7h), `supabase_functions` (6h), `supabase_auth` (3d), `supabase_realtime` (9h), `zapp-web-prod` (6h, healthy), `evolution` (healthy).

### Etapa 3 — Versões
PostgreSQL 15.8 (`supabase/postgres:15.8.1.085`) · GoTrue v2.189.0 · PostgREST v14.12 · Realtime v2.102.3 · Edge Runtime v1.74.0 · Storage v1.60.4 · Kong 3.9.1 · Supavisor 2.9.5 · Studio 2026.06.29. `max_connections=150`, timezone `America/Sao_Paulo`.

### Etapa 4 — Inventário de schemas
28 schemas. Distribuição relevante: `zapp` (323 tabelas / 1.054 funções), `evo` (189/69), `email_app` (33), `ai` (31), `ops` (29/61), `archive` (25), `bpm` (41), `financeiro` (16/45), `vendas` (14/21), `public` (2/147).

### Etapa 5 — Extensões
Self-hosted tem superconjunto: `amcheck, btree_gin, dblink, hypopg, index_advisor, pg_buffercache, pg_cron, pg_graphql, pg_net, pg_stat_statements, pg_trgm, pgcrypto, pgjwt, pgmq, pgsodium, plpgsql, supabase_vault, unaccent, uuid-ossp, vector, wrappers`.
Lovable: `pg_cron, pg_net, pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp`. **Nenhuma extensão faltando.**

---

## Bloco B — Estrutura de Dados (etapas 6–15)

### Etapa 6 — Contagem comparativa

| Objeto | Lovable `public` | Self-hosted `zapp` |
|---|---|---|
| Tabelas | 147 | 323 |
| Views | 10 | 407 |
| Matviews | 0 | 6 |
| Functions | 98 (92 nomes distintos) | 1.054 |
| Triggers | 75 | 216 |
| Índices | 342 | 840 |
| Policies RLS | 415 | 705 |
| Enums | 5 | 17 |
| Sequences | 1 | 45 |
| Cron jobs | 2 | 148 |

### Etapa 7 — Diff de tabelas
**147/147 presentes. Zero ausentes.**

### Etapa 8 — Fingerprint de colunas (md5 do conjunto ordenado de nomes)
38 tabelas com hash divergente. 37 por **acréscimo** de colunas no self-hosted (evolução legítima). 1 caso de mesma contagem com hash diferente: `profiles`.

### Etapa 9 — Colunas ausentes (diff exaustivo de ~2.000 colunas)
**1 única ausência:**

| Coluna | Definição no Lovable | Situação no zapp |
|---|---|---|
| `profiles.onboarding_status` | `text NOT NULL DEFAULT 'active'` | **AUSENTE** |

`zapp.profiles` possui `is_online (boolean)` no lugar. Se o front-end referencia `onboarding_status`, o `select` retorna erro de coluna inexistente ou `undefined` silencioso.

### Etapa 10 — Diff de functions
**92/92 presentes.** Zero ausentes.

### Etapa 11 — Diff de views e sequences
11/11 presentes: `channel_connections_safe`, `departments_safe`, `gmail_accounts_safe`, `password_reset_requests_safe`, `profiles_public`, `v_pending_transfers`, `whatsapp_connections_agent`, `whatsapp_connections_public`, `whatsapp_connections_safe`, `whatsapp_official_credentials_safe`, `transfer_ticket_seq`.

### Etapa 12 — Descoberta arquitetural: 20 "tabelas" são VIEWS

| View `zapp` | Tabela-base | RLS base | Policies |
|---|---|---|---|
| `contacts` | `evo.evolution_contacts` | ✓ | 4 |
| `messages` | `evo.evolution_messages` + `zapp.whatsapp_connections` | ✓ | 5 |
| `email_accounts`, `email_labels`, `email_messages`, `email_threads`, `gmail_accounts`, `meta_capi_events`, `nps_surveys` | `email_app.*` | ✓ | 2–5 |
| `ai_providers`, `ai_usage_logs`, `knowledge_base_articles`, `knowledge_base_files`, `playbooks`, `training_sessions` | `ai.*` | ✓ | 2 |
| `evolution_health_logs`, `evolution_instance_credentials`, `evolution_retry_metrics` | `evo.*` | ✓ | 1–3 |
| `payment_links` | `financeiro.payment_links` | ✓ | 2 |
| `products` | `vendas.products` | ✓ | 2 |

**Validado:** todas com `security_invoker=on/true` (RLS da base se aplica), dono `postgres`, grants apenas para `authenticated` e `service_role` (**zero grant para `anon`**), e todas graváveis — 18 auto-updatable (`pg_relation_is_updatable=28`), `contacts` e `messages` com 3 `INSTEAD OF` triggers cada.

Este é o achado arquitetural mais importante para documentação: o `zapp` funciona como *façade layer* sobre schemas canônicos.

### Etapa 13 — Enums
4 dos 5 enums do Lovable existem em `zapp` com labels idênticos.

**Ausente:** `warroom_alert_type` (`info, warning, critical, sla_breach`). A coluna `zapp.warroom_alerts.alert_type` é `text` sem CHECK — perda total de validação de domínio em 3.802 linhas.

**Divergência de ordenação:** `app_role` — Lovable `admin,supervisor,agent,special_agent,dev,manager` vs zapp `admin,manager,supervisor,agent,special_agent,dev`. Labels iguais, `enumsortorder` diferente. Afeta `ORDER BY` e comparações `<`/`>` sobre o enum.

### Etapa 14 — Constraints UNIQUE
50 UNIQUEs verificados (resolvendo views para tabelas-base). **5 ausentes:**

| Tabela | UNIQUE esperado | Alvo | Duplicatas hoje |
|---|---|---|---|
| `contacts` | `phone` | `evo.evolution_contacts.phone_number` | **503** |
| `conversation_memory` | `contact_id` | `zapp.conversation_memory` | 0 |
| `permissions` | `name` | `zapp.permissions` | 0 |
| `tags` | `name` | `zapp.tags` | 0 |
| `talkx_blacklist` | `contact_id` | `zapp.talkx_blacklist` | 0 |

`evo.evolution_contacts` tem UNIQUE apenas em `id` e `remote_jid`. Como `remote_jid` varia por instância, o mesmo telefone existe múltiplas vezes → contatos fragmentados, histórico dividido, atribuição de fila incoerente.

**Positivo:** `login_attempts.email` UNIQUE **está presente** — a correção histórica de brute-force se manteve na migração.

### Etapa 15 — PK e FK
Todas as PKs presentes. FKs preservadas nas tabelas nativas; nas tabelas-base de domínio as FKs foram remodeladas para os novos nomes de schema (comportamento esperado, sem órfãos detectados).

---

## Bloco C — Triggers e Lógica de Negócio (etapas 16–20)

### Etapa 16 — Diff de triggers por nome
19 triggers do Lovable sem correspondência por nome em `zapp`.

### Etapa 17 — Reconciliação (17 falso-positivos)
Os triggers foram reimplantados nas tabelas-base:

- `evo.evolution_contacts` — 24 triggers, incluindo `on_contact_created_auto_assign`, `on_contact_queue_auto_assign`, `trg_log_assignment_change`, `trg_normalize_contact_phone`, `update_contacts_updated_at` ✓
- `evo.evolution_messages` — 5 triggers, incluindo `trg_sicoob_reply → fn_notify_sicoob_on_reply` e `update_messages_updated_at` ✓
- `ai.ai_providers` — `ensure_single_default_ai_provider` + `update_ai_providers_updated_at` ✓
- `email_app.*`, `financeiro.payment_links`, `vendas.products`, `ai.playbooks`, `ai.knowledge_base_articles` — `updated_at` presentes ✓
- `zapp.sicoob_reply_outbox` — renomeado para `trg_sicoob_reply_outbox_updated_at` ✓
- `agent_stats|on_agent_stats_update_level` e `user_devices|on_device_update_last_seen` eram **duplicatas** no Lovable (mesma função, dois triggers). Self-hosted mantém um de cada ✓

### Etapa 18 — Gaps reais de trigger
Duas funções de trigger **órfãs** (existem mas não estão anexadas a nada):

| Função | Usos como trigger | Consequência |
|---|---|---|
| `zapp.prevent_profile_privilege_escalation()` | **0** | Camada dupla de proteção contra escalonamento de privilégio em `profiles` perdida. `prevent_role_escalation()` continua ativa via trigger `prevent_privilege_escalation` (mitigação parcial) |
| `zapp.handle_new_user_role()` | **0** | Já era órfã no Lovable — não é regressão |

### Etapa 19 — Triggers sem cobertura de `updated_at`
`ai.ai_usage_logs`, `ai.knowledge_base_files`, `ai.training_sessions`, `email_app.meta_capi_events`, `email_app.nps_surveys`, `evo.evolution_health_logs`, `evo.evolution_retry_metrics` — sem triggers. Aceitável para tabelas append-only, mas `training_sessions` e `nps_surveys` têm semântica mutável.

### Etapa 20 — Triggers em `auth.users` (acoplamento multi-tenant)
Self-hosted dispara **4 triggers** onde o Lovable não tinha nenhum:

```
on_auth_user_created            → zapp.handle_new_user
on_auth_user_created_painel     → zapp.handle_new_auth_user_painel
trg_handle_new_auth_user        → artes.handle_new_auth_user
trg_garantir_auth_tokens_nao_null → artes.garantir_auth_tokens_nao_null
```

**Risco:** um erro em qualquer trigger do schema `artes` (aplicação diferente) aborta a transação de signup do ZAPP. Acoplamento entre aplicações no ponto mais crítico do sistema de autenticação.

---

## Bloco D — Segurança e RLS (etapas 21–27)

### Etapa 21 — Cobertura de RLS
**0 tabelas sem RLS** em `zapp`, `ai`, `email_app`, `evo`, `financeiro`, `vendas`. Nenhuma tabela do Lovable perdeu policies.

### Etapa 22 — Regressão de policies permissivas

| Métrica | Lovable | Self-hosted |
|---|---|---|
| Policies `USING (true)` | 43 / 415 (10,4%) | **464** |
| Tabelas afetadas | 41 | **414** |
| `USING(true)` para `anon` | 0 | 1 |

### Etapa 23 — As 85 tabelas que regrediram
Tabelas que tinham policy restritiva no Lovable e ganharam `auth_full_access [ALL] USING(true)` para `authenticated` no self-hosted. Amostra crítica:

`audit_logs` · `login_attempts` · `password_reset_requests` · `passkey_credentials` · `webauthn_challenges` · `user_sessions` · `user_devices` · `security_alerts` · `blocked_ips` · `ip_whitelist` · `rate_limit_logs` · `rate_limit_configs` · `query_telemetry` · `department_invitations` · `departments` · `conversation_analyses` · `conversation_closures` · `conversation_events` · `conversation_memory` · `conversation_sla` · `conversation_tasks` · `conversation_transfers` · `contact_custom_fields` · `contact_notes` · `contact_purchases` · `contact_tags` · `team_conversations` · `team_conversation_members` · `team_messages` · `whisper_messages` · `saved_filters` · `user_settings` · `notifications` · `sicoob_reply_outbox` · `talkx_*` · `scheduled_*` · `sla_rules` · `campaigns` · `campaign_contacts` · `agent_*` · `queue_*` · `whatsapp_connections`

Padrão identificado: os nomes `auth_full_access`, `auth_access`, `auth_rls`, `auth_rw`, `svc_rls` indicam aplicação em lote durante o cutover ("migrar primeiro, endurecer depois"). O endurecimento nunca aconteceu.

**Nota:** policies `service_full_access` para `service_role` são inócuas (`service_role` faz BYPASSRLS). O problema é exclusivamente o role `authenticated`.

### Etapa 24 — Exposição a `anon`
Varredura completa de policies com `roles ~ anon` ou `{public}`: **apenas 1 exposição real** no escopo ZAPP — `zapp.feature_flags / "Anon can read flags" [SELECT] USING(true)`. Baixo risco, mas revisável.

Existem policies `deny_anon_*` com `USING(false)` corretamente aplicadas em `email_watch_history`, `migration_audit`, `sicoob_reply_outbox`, `storage_cleanup_logs`, `sts_telemetry`, `webauthn_challenges`, `webhook_idempotency`, `webhook_reprocess_queue`.

**Fora do escopo ZAPP (registrado para triagem):** `financeiro.pedido_kits/anon_delete_pedido_kits`, `financeiro.destinatarios/anon_select`, `vendas.ordens_compra/p_ordens_anon_select`, `vendas.usuarios/p_usuarios_anon_select` — todas `USING(true)`.

### Etapa 25 — RLS ativo sem policy (bloqueio total silencioso)
2 tabelas: `zapp._grant_backup_20260730`, `zapp._rls_backup_20260731`. São tabelas de backup do próprio cutover — comportamento aceitável, mas devem ser movidas para `archive` ou removidas.

### Etapa 26 — SECURITY DEFINER exposto
O advisor retornou 1.668 findings de severidade `warn` no conjunto de schemas auditados, dominados por `secdef_exposed` (funções `SECURITY DEFINER` executáveis por `authenticated`). Concentração maior em `financeiro` e `evo`. Requer triagem função a função — não é possível revogar em bloco sem quebrar RPCs legítimas.

### Etapa 27 — Storage buckets

| Bucket | Lovable | Self-hosted | Veredito |
|---|---|---|---|
| `audio-memes` | público | público | OK |
| `avatars` | público | público | OK |
| `custom-emojis` | público | público | OK |
| `stickers` | público | público | OK |
| `team-chat-files` | privado | privado | OK |
| **`audio-messages`** | **privado** | **PÚBLICO** | **REGRESSÃO** |
| **`whatsapp-media`** | **privado** | **PÚBLICO** | **REGRESSÃO** |

Existe um trigger `storage.trg_enforce_whatsapp_media_public → fn_enforce_public_buckets` que **força** `whatsapp-media` a público — decisão deliberada, provavelmente para servir mídia sem signed URLs. Consequência: áudios e documentos de clientes acessíveis por URL direta, sem autenticação. Exposição LGPD relevante dado o volume (`media_scan_log` com 11.314 registros, `media_download_queue` com 9.580).

---

## Bloco E — Edge Functions e Deploy (etapas 28–35)

### Etapa 28 — Inventário de Edge Functions
- Repositório `supabase/functions/`: **121 diretórios** (+ `deno.json`, `gmail-tests.test.ts`)
- Deployadas em `/home/deno/functions` no container `supabase_functions`: **120 funções** + `_shared`

### Etapa 29 — Funções no repositório mas NÃO deployadas

| Função | Criticidade | Impacto |
|---|---|---|
| **`sicoob-outbox-consumer`** | **P0** | Consumidor do outbox SICOOB. Sem ele, `zapp.sicoob_reply_outbox` nunca é drenado |
| `nps-scheduler` | P1 | Disparo automático de pesquisas NPS não ocorre |
| `talkx-control` | P1 | Controle de campanhas TalkX indisponível |
| `talkx-add-recipients` | P1 | Adição de destinatários em campanhas indisponível |
| `metrics` | P2 | Endpoint de métricas ausente |
| `mcp` | P2 | Servidor MCP do projeto (há `mcp-server` deployado) |
| `health` | P2 | Há `health-check` e `status` deployados |
| `migrate-helper` | P3 | Utilitário de migração |
| `_test`, `tests` | — | Diretórios de teste (não devem ser deployados) |

Nenhuma função deployada está ausente do repositório — não há código órfão em produção.

### Etapa 30 — P0-1: VERIFY_JWT globalmente desativado

```
Container: supabase_functions.1
VERIFY_JWT="false"        ← literal COM ASPAS
JWT_SECRET                ← AUSENTE
```

`/home/deno/functions/main/index.ts`:
```ts
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true'
```

O valor `"false"` (aspas incluídas) nunca é igual a `'true'` → **`VERIFY_JWT` é `false`**. Ainda que fosse `true`, `JWT_SECRET` não existe e `jose.jwtVerify` falharia com 401 em tudo.

**Resultado: as 120 Edge Functions são invocáveis por qualquer pessoa na internet, sem nenhum token.**

Funções que deveriam exigir JWT e não exigem: `evolution-credentials` (retorna credenciais da Evolution API), `create-user`, `approve-password-reset`, `get-sip-password`, `seed-teams-users`, `external-db-proxy`, `analyze-external-db`, `secure-upload`, `contacts-import`, todas as `ai-*` e `elevenlabs-*` (custo direto de API), `public-api`.

### Etapa 31 — P0-1b: `config.toml` é decorativo no self-hosted
O arquivo declara `verify_jwt` para **35 funções** (20 com `true`). O runtime self-hosted **não lê `config.toml`** — ele usa apenas a env global `VERIFY_JWT` + roteamento em `main/index.ts`.

Existe portanto uma **falsa sensação de segurança documentada no repositório**. O comentário no topo do arquivo ainda afirma:
```
# BANCO CANONICO: supabase.atomicabr.com.br (self-hosted VPS)
# O projeto Lovable Cloud allrjhkpuscmgbsnmjlv foi DESCONTINUADO em 30/06/2026.
```
Note que o ref citado (`allrjhkpuscmgbsnmjlv`) **não é** o ref ativo auditado (`uqysyzndkfiwfztbqvsl`).

### Etapa 32 — P0-2: 70 de 78 variáveis de ambiente ausentes

Presentes (15): `AI_BASE_URL`, `AI_ROUTER_URL`, `DEEPSEEK_API_KEY`, `EVOLUTION_API_KEY`, `EVOLUTION_API_URL`, `PROMOGIFTS_SUPABASE_ANON_KEY`, `PROMOGIFTS_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`, `VERIFY_JWT`, + 5 do sistema.

**Ausentes e requeridas pelo código deployado (70):**

*Autenticação e acesso ao banco (P0)*
`SUPABASE_SERVICE_ROLE_KEY` · `JWT_SECRET` · `SUPABASE_PUBLISHABLE_KEY` · `SELFHOSTED_SUPABASE_URL` · `SELFHOSTED_SUPABASE_ANON_KEY` · `SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY`

*Segurança de webhook (P0)*
`EVOLUTION_WEBHOOK_SECRET` · `EVOLUTION_WEBHOOK_SECRETS` · `EVOLUTION_WEBHOOK_STRICT` · `WEBHOOK_SECRET` · `WHATSAPP_CLOUD_APP_SECRET` · `WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN` · `WHATSAPP_CLOUD_WEBHOOK_STRICT` · `WHATSAPP_VERIFY_TOKEN` · `ELEVENLABS_WEBHOOK_SECRET` · `SLA_ALERT_WEBHOOK_SECRET` · `CRON_SECRET`

*Integrações externas (P1)*
`GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GMAIL_REDIRECT_URI` · `GMAIL_PUBSUB_TOPIC` · `MICROSOFT_CLIENT_ID` · `MICROSOFT_CLIENT_SECRET` · `MICROSOFT_REDIRECT_URI` · `BITRIX_WEBHOOK_URL` · `BITRIX_PORTAL` · `BITRIX_ALLOW_NO_ORIGIN` · `SICOOB_GIFTS_URL` · `SICOOB_GIFTS_BRIDGE_SECRET` · `RESEND_API_KEY` · `VIRUSTOTAL_API_KEY` · `WHATSAPP_CLOUD_ACCESS_TOKEN` · `WHATSAPP_CLOUD_PHONE_NUMBER_ID`

*IA (P1)*
`OPENAI_API_KEY` · `ANTHROPIC_API_KEY` · `LOVABLE_API_KEY`

*Observabilidade (P1)*
`SENTRY_DSN` · `SENTRY_RELEASE` · `DEBUG_SENTRY` · `PROXY_METRICS_TOKEN` · `QR_ALERT_WEBHOOK_URL` · `QR_ALERT_WEBHOOK_TOKEN`

*Tuning e operação (P2)*
`EVOLUTION_INSTANCE` · `EVOLUTION_INSTANCE_NAME` · `EVOLUTION_DEFAULT_INSTANCE` · `EVOLUTION_SEND_RATE_PER_INSTANCE` · `BACKFILL_CONNECTION_ID` · `BACKFILL_INSTANCE_NAME` · `FUNCTION_NAME` · `PROXY_*` (8 vars de threshold) · `WEBHOOK_AUTH_*` (3 vars) · `EXTERNAL_SUPABASE_*` (3) · `FATOR_X_URL` · `FATOR_X_SERVICE_ROLE_KEY` · `VITE_SUPABASE_URL` · `VITE_SUPABASE_PUBLISHABLE_KEY` · `TEST_BASE*_SECRET*` (4)

### Etapa 33 — Consequências operacionais confirmadas
Sem `SUPABASE_SERVICE_ROLE_KEY`, qualquer função que precise gravar contornando RLS falha. Sem `EVOLUTION_WEBHOOK_SECRET`, a validação HMAC do webhook Evolution não roda — combinada com `VERIFY_JWT=false`, o endpoint `evolution-webhook` aceita payload de qualquer origem. Sem `GOOGLE_CLIENT_*`, todo o módulo Gmail (7 funções) está inoperante.

### Etapa 34 — Secrets do Lovable
Apenas 4 secrets no projeto Lovable, todos de bridge: `LOVABLE_API_KEY`, `SELFHOSTED_SUPABASE_URL`, `SELFHOSTED_SUPABASE_ANON_KEY`, `SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY`.

Isso confirma que o Lovable já **não é** a fonte de verdade da aplicação — mas os secrets de produção nunca foram transferidos para o edge-runtime self-hosted.

### Etapa 35 — Base Lovable Cloud ainda ativa
O projeto `uqysyzndkfiwfztbqvsl` continua **operacional** com 147 tabelas, 415 policies, 98 funções e 2 cron jobs ativos — incluindo `sicoob-outbox-drain` apontando para `https://uqysyzndkfiwfztbqvsl.supabase.co/functions/v1/sicoob-outbox-consumer`.

Ou seja: **o cron do SICOOB continua rodando na nuvem, contra a base antiga**, enquanto o `config.toml` declara que o projeto cloud foi descontinuado. Base paralela viva = risco de escrita dupla, divergência de dados e custo.

---

## Bloco F — Agendamento, Realtime e Performance (etapas 36–40)

### Etapa 36 — Cron jobs

| Job | Lovable | Self-hosted |
|---|---|---|
| `purge_query_telemetry_daily` (`0 3 * * *`) | ativo | **ativo ✓** |
| `sicoob-outbox-drain` (`* * * * *`) | **ativo** (aponta p/ `*.supabase.co`) | **AUSENTE** |

Self-hosted tem 148 cron jobs ativos (superconjunto amplo, cobrindo `evo`, `ops`, backups). **Zero jobs apontando para `*.supabase.co`** — bom, não há resíduo de cloud no self-hosted.

### Etapa 37 — Fluxo SICOOB (análise ponta a ponta)
```
evo.evolution_messages
  └─ trg_sicoob_reply → fn_notify_sicoob_on_reply     ✓ presente
      └─ INSERT em zapp.sicoob_reply_outbox           ✓ presente (12 colunas, UNIQUE message_id ✓)
          └─ cron sicoob-outbox-drain                 ✗ AUSENTE
              └─ edge fn sicoob-outbox-consumer       ✗ NÃO DEPLOYADA
                  └─ SICOOB_GIFTS_URL / _BRIDGE_SECRET ✗ AUSENTES
```
**Três elos consecutivos quebrados.** O outbox enche e nunca esvazia.

### Etapa 38 — Realtime
Publicação `supabase_realtime` no self-hosted cobre as 3 tabelas do Lovable (`conversation_transfers`, `message_reactions`, `transfer_comments`) **mais** `evo.evolution_messages` e `evo.evolution_contacts` — necessário porque `zapp.messages`/`zapp.contacts` são views (views não emitem eventos de replicação). Configuração correta.

### Etapa 39 — Índices
840 índices no `zapp` vs 342 no Lovable. Não há déficit de cobertura. O advisor reporta ocorrências de `unused_index` e `fk_no_index` que merecem uma passada de otimização, mas nenhuma é bloqueante.

### Etapa 40 — Volumetria e saúde de dados
Tabelas de maior volume: `zapp.webhook_audit_log` (245.152), `zapp.webhook_events_processed` (229.663), `zapp.empresas` (51.688), `zapp.contact_intelligence` (20.875), `zapp.media_scan_log` (11.314), `zapp.app_notifications` (11.151), `zapp.media_download_queue` (9.580), `zapp.warroom_alerts` (3.802), `zapp.contatos` (3.236), `zapp.vault_healthcheck_log` (2.823).

`webhook_audit_log` e `webhook_events_processed` somam ~475k linhas sem política de retenção declarada — crescimento não gerenciado com disco em 71%.

---

# PARTE II — PLANO DE CORREÇÃO E MELHORIAS (50 ETAPAS)

## FASE 1 — P0: Contenção imediata (etapas 1–10) · janela: 24h

### 1. Congelar escrita na base Lovable Cloud
Desativar o cron `sicoob-outbox-drain` no projeto `uqysyzndkfiwfztbqvsl` (`SELECT cron.unschedule('sicoob-outbox-drain')`). Impede escrita dupla enquanto o fluxo é reconstruído no self-hosted.

### 2. Gerar e injetar `JWT_SECRET` no edge-runtime
Extrair o `JWT_SECRET` do stack Supabase (mesmo usado por GoTrue/PostgREST) e criar como Docker secret externo `supabase_jwt_secret_v1`.

### 3. Corrigir `VERIFY_JWT`
Alterar de `"false"` (com aspas) para `true` (sem aspas) no compose da stack 35. **Não fazer antes da etapa 4** — ativar sem exceções derruba todos os webhooks.

### 4. Implementar allowlist de funções públicas em `main/index.ts`
O runtime self-hosted não lê `config.toml`. Portar a lista para código:
```ts
const PUBLIC_FNS = new Set([
  'evolution-webhook','whatsapp-webhook','whatsapp-cloud-webhook',
  'whatsapp-cloud-webhook-verify','elevenlabs-webhook','gmail-webhook',
  'email-track-pixel','email-track-link','login-attempts','get-mapbox-token',
  'sentiment-alert','connection-health-check','evolution-health','evolution-sender',
  'bitrix-api','send-rate-limit-alert','cleanup-rate-limit-logs','evolution-sync',
  'classify-audio-meme','classify-emoji','classify-sticker','health-check','status'
]);
// verificar JWT quando fnName NÃO estiver na allowlist
```

### 5. Deploy conjunto das etapas 2–4 e validação
Testar: (a) `curl` sem token em `evolution-credentials` → **401**; (b) `curl` sem token em `evolution-webhook` → **200**; (c) login no front → funcional.

### 6. Restringir buckets `whatsapp-media` e `audio-messages`
Remover ou condicionar o trigger `storage.trg_enforce_whatsapp_media_public`, tornar os buckets privados e migrar o front para signed URLs (TTL 1h). **Testar renderização de mídia antes de aplicar em produção.**

### 7. Revogar `USING(true)` nas 15 tabelas de segurança
Prioridade máxima: `audit_logs`, `security_audit_logs`, `security_alerts`, `login_attempts`, `password_reset_requests`, `passkey_credentials`, `webauthn_challenges`, `mfa_sessions`, `user_sessions`, `user_devices`, `blocked_ips`, `ip_whitelist`, `rate_limit_logs`, `rate_limit_configs`, `query_telemetry`. Substituir por `USING (user_id = auth.uid())` ou restrição a `admin`/`dev` via `has_role()`.

### 8. Reanexar `prevent_profile_privilege_escalation`
```sql
CREATE TRIGGER on_profile_update_prevent_escalation
BEFORE UPDATE ON zapp.profiles
FOR EACH ROW EXECUTE FUNCTION zapp.prevent_profile_privilege_escalation();
```

### 9. Corrigir `restart_policy` das stacks de MCP
Trocar `condition: on-failure` por `condition: any` nas stacks 128, 143, 183 e em qualquer serviço long-running que possa sair com exit 0.

### 10. Adicionar healthcheck de MCP ao `mcp-health-monitor`
Incluir os três endpoints Supabase MCP no monitor da stack 195, com alerta para queda > 5 min.

---

## FASE 2 — Restaurar funcionalidade quebrada (etapas 11–22) · janela: 72h

### 11. Inventariar valores reais dos 70 secrets ausentes
Levantar de: Lovable (4), Bitrix24, Google Cloud Console, Meta Business, ElevenLabs, Resend, VirusTotal, GlitchTip/Sentry, Evolution API, SICOOB.

### 12. Criar Docker secrets para os secrets P0
`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `SUPABASE_PUBLISHABLE_KEY`, `SELFHOSTED_SUPABASE_*` (3).

### 13. Criar Docker secrets de webhook
`EVOLUTION_WEBHOOK_SECRET(S)`, `WEBHOOK_SECRET`, `WHATSAPP_CLOUD_APP_SECRET`, `WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `ELEVENLABS_WEBHOOK_SECRET`, `SLA_ALERT_WEBHOOK_SECRET`, `CRON_SECRET`.

### 14. Criar Docker secrets de integração
`GOOGLE_CLIENT_ID/SECRET`, `GMAIL_REDIRECT_URI`, `GMAIL_PUBSUB_TOPIC`, `MICROSOFT_CLIENT_ID/SECRET/REDIRECT_URI`, `BITRIX_WEBHOOK_URL`, `BITRIX_PORTAL`, `SICOOB_GIFTS_URL`, `SICOOB_GIFTS_BRIDGE_SECRET`, `RESEND_API_KEY`, `VIRUSTOTAL_API_KEY`, `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`.

### 15. Criar Docker secrets de IA e observabilidade
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LOVABLE_API_KEY`, `SENTRY_DSN`, `SENTRY_RELEASE`, `PROXY_METRICS_TOKEN`, `QR_ALERT_WEBHOOK_URL/TOKEN`.

### 16. Definir variáveis de tuning como env comuns
`EVOLUTION_*` (4), `PROXY_*` (8), `WEBHOOK_AUTH_*` (3), `BACKFILL_*` (2), `*_STRICT` (3) — valores de configuração, não secrets.

### 17. Redeploy da stack 35 com o conjunto completo
Validar com o mesmo script de diff usado na auditoria: `grep Deno.env.get` vs `env` deve retornar **zero** ausentes.

### 18. Deploy de `sicoob-outbox-consumer`
Copiar do repositório para `/home/deno/functions/` e reiniciar o edge-runtime.

### 19. Recriar o cron `sicoob-outbox-drain` no self-hosted
```sql
SELECT cron.schedule('sicoob-outbox-drain','* * * * *', $$
  SELECT net.http_post(
    url := 'https://supabase.atomicabr.com.br/functions/v1/sicoob-outbox-consumer',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'x-cron-secret', current_setting('app.cron_secret', true))
  )$$);
```

### 20. Validar o fluxo SICOOB ponta a ponta
Inserir mensagem de teste → confirmar trigger → confirmar linha no outbox → confirmar drenagem → confirmar entrega. Medir backlog acumulado antes de ligar.

### 21. Deploy das funções P1 ausentes
`nps-scheduler`, `talkx-control`, `talkx-add-recipients`, `metrics`.

### 22. Decidir e documentar as funções P2/P3
`mcp` vs `mcp-server`, `health` vs `health-check`/`status`, `migrate-helper`. Remover do repositório o que for redundante; garantir que `_test` e `tests` estejam no `.deployignore`.

---

## FASE 3 — Integridade de dados (etapas 23–32) · janela: 1 semana

### 23. Adicionar `profiles.onboarding_status`
```sql
ALTER TABLE zapp.profiles ADD COLUMN onboarding_status text NOT NULL DEFAULT 'active';
```
Antes: `grep -r "onboarding_status" src/` para confirmar uso no front. Se não houver uso, documentar a remoção deliberada.

### 24. Criar o enum `warroom_alert_type`
```sql
CREATE TYPE zapp.warroom_alert_type AS ENUM ('info','warning','critical','sla_breach');
```
Validar os valores distintos em `warroom_alerts.alert_type` (3.802 linhas) antes da conversão da coluna.

### 25. Converter `warroom_alerts.alert_type` para o enum
Ou, se houver valores fora do domínio, aplicar `CHECK` como passo intermediário.

### 26. Normalizar a ordenação de `app_role`
Avaliar impacto de `ORDER BY role` e comparações. Se houver dependência, recriar o enum com a ordem do Lovable (`admin,supervisor,agent,special_agent,dev,manager`).

### 27. Adicionar os 4 UNIQUEs sem duplicatas
```sql
ALTER TABLE zapp.conversation_memory ADD CONSTRAINT uq_conversation_memory_contact UNIQUE (contact_id);
ALTER TABLE zapp.permissions        ADD CONSTRAINT uq_permissions_name          UNIQUE (name);
ALTER TABLE zapp.tags               ADD CONSTRAINT uq_tags_name                 UNIQUE (name);
ALTER TABLE zapp.talkx_blacklist    ADD CONSTRAINT uq_talkx_blacklist_contact   UNIQUE (contact_id);
```

### 28. Investigar os 503 telefones duplicados
`evo.evolution_contacts` tem 503 `phone_number` repetidos. Classificar: (a) mesmo cliente em instâncias diferentes — legítimo; (b) duplicata real por perda do UNIQUE — merge necessário.

### 29. Definir a chave de unicidade correta para contatos
Provavelmente `UNIQUE (phone_number, instance_name)` em vez de `UNIQUE (phone_number)` global, dado o modelo multi-instância. Decidir com base na etapa 28.

### 30. Executar merge de contatos duplicados
Consolidar mensagens, tags, notas, atribuições e `contact_intelligence`. Usar `zapp.contact_id_graveyard` (já existente) para rastrear IDs mesclados.

### 31. Aplicar o UNIQUE definido na etapa 29
Somente após o merge da etapa 30.

### 32. Arquivar as tabelas de backup do cutover
Mover `zapp._grant_backup_20260730` e `zapp._rls_backup_20260731` para o schema `archive` ou remover após confirmação de que o cutover está estável.

---

## FASE 4 — Endurecimento de RLS (etapas 33–40) · janela: 2–3 semanas

### 33. Mapear o modelo de autorização pretendido
Documentar formalmente: quem enxerga qual conversa, contato, fila, departamento. Base: `has_role()`, `is_admin_or_supervisor()`, `is_contact_visible_to_user()`, `is_queue_member_of_contact()`, `get_visible_agent_ids()` — todas já existem e estão migradas.

### 34. Extrair as policies restritivas originais do Lovable
A base cloud ainda está viva (ver Etapa 35 da auditoria). Usar `pg_get_expr` para exportar os 372 `qual`/`with_check` restritivos como referência antes de qualquer desligamento.

### 35. Corrigir as tabelas de conversa (lote 1)
`conversation_analyses`, `conversation_closures`, `conversation_events`, `conversation_memory`, `conversation_sla`, `conversation_snoozes`, `conversation_tasks`, `conversation_transfers`, `transfer_comments`, `whisper_messages`.

### 36. Corrigir as tabelas de contato (lote 2)
`contact_custom_fields`, `contact_notes`, `contact_purchases`, `contact_tags`, `favorite_contacts`, `pinned_conversations`, `sicoob_contact_mapping`.

### 37. Corrigir as tabelas de time e usuário (lote 3)
`team_conversations`, `team_conversation_members`, `team_messages`, `team_message_receipts`, `user_settings`, `saved_filters`, `notifications`, `user_roles`.

### 38. Corrigir as tabelas de campanha e agendamento (lote 4)
`campaigns`, `campaign_contacts`, `campaign_ab_variants`, `talkx_campaigns`, `talkx_recipients`, `talkx_blacklist`, `scheduled_messages`, `scheduled_reports`, `scheduled_report_configs`, `followup_*`.

### 39. Corrigir as tabelas de configuração e fila (lote 5)
`queues`, `queue_members`, `queue_goals`, `queue_positions`, `whatsapp_connections`, `departments`, `department_invitations`, `sla_rules`, `global_settings`.

### 40. Revisar `zapp.feature_flags / "Anon can read flags"`
Confirmar se leitura anônima de flags é intencional. Se sim, restringir a um subconjunto explícito de flags públicas via coluna `is_public`.

---

## FASE 5 — Arquitetura e governança (etapas 41–46) · janela: 1 mês

### 41. Desacoplar os triggers de `auth.users`
Envolver `artes.handle_new_auth_user` e `artes.garantir_auth_tokens_nao_null` em blocos `EXCEPTION WHEN OTHERS THEN` com log, ou movê-los para processamento assíncrono via `pgmq` (extensão já instalada). Um erro em `artes` não pode derrubar o signup do ZAPP.

### 42. Triar os `SECURITY DEFINER` expostos
1.668 warnings. Priorizar `financeiro` e `evo`. Para cada função: é uma RPC legítima chamada pelo front? Se não, `REVOKE EXECUTE ... FROM authenticated`.

### 43. Documentar a camada de views `zapp`
Criar `docs/arquitetura/zapp-facade-layer.md` mapeando as 20 views → tabelas-base, com nota explícita de que triggers, constraints e índices vivem na base, não na view. Isso evita futuras auditorias reportarem falso-positivo.

### 44. Corrigir o cabeçalho do `config.toml`
O ref citado (`allrjhkpuscmgbsnmjlv`) diverge do ref ativo (`uqysyzndkfiwfztbqvsl`). Corrigir e adicionar aviso de que `verify_jwt` **não é honrado** pelo runtime self-hosted, referenciando a allowlist em `main/index.ts` como fonte de verdade.

### 45. Definir o destino da base Lovable Cloud
Opções: (a) snapshot + pausar o projeto; (b) manter como réplica read-only de contingência com todos os crons desligados; (c) excluir. Considerando a exaustão de slots Supabase já mapeada, a opção (a) libera recurso.

### 46. Adicionar retenção às tabelas de webhook
`webhook_audit_log` (245k) e `webhook_events_processed` (230k) sem política. Criar cron de purga análogo a `purge_query_telemetry_daily`, com janela de 30–90 dias. Relevante com o disco em 71%.

---

## FASE 6 — Prevenção de regressão (etapas 47–50) · contínuo

### 47. Criar teste de paridade em CI
Job que executa o mesmo diff desta auditoria (tabelas, colunas, functions, triggers, UNIQUEs, enums) contra um schema de referência versionado. Falha o build em divergência.

### 48. Criar teste de completude de env
Job que roda `grep -rhoE "Deno\.env\.get\(['\"][A-Z0-9_]+['\"]\)" supabase/functions/` e compara com uma lista declarada em `supabase/functions/.env.required`. Falha se houver variável usada e não declarada.

### 49. Criar smoke test de autenticação de Edge Functions
Para cada função **fora** da allowlist pública: `curl` sem `Authorization` deve retornar 401. Para cada função **na** allowlist: deve retornar != 401. Roda a cada deploy.

### 50. Ativar branch protection em `zapp-web-v3`
Requisito para que qualquer melhoria acima seja durável. Exigir PR + status checks (47, 48, 49) verdes antes de merge em `main`. Sem isso, o padrão histórico já observado — correção aplicada, regressão silenciosa em seguida — se repete.

---

## Anexo A — Comandos de verificação rápida

```bash
# Paridade de colunas (executar no MCP self-hosted vs Lovable)
# → ver Etapas 8–9 do relatório

# Completude de env no edge-runtime
docker exec <supabase_functions> sh -c \
  'cd /home/deno/functions && grep -rhoE "Deno\.env\.get\(['"'"'\"][A-Z0-9_]+['"'"'\"]\)" . \
   | grep -oE "[A-Z0-9_]{3,}" | sort -u > /tmp/req.txt; \
   env | cut -d= -f1 | sort -u > /tmp/have.txt; comm -23 /tmp/req.txt /tmp/have.txt'

# Policies permissivas restantes
SELECT count(*) FROM pg_policies
WHERE schemaname IN ('zapp','ai','email_app','evo')
  AND qual='true' AND roles::text LIKE '%authenticated%';
-- meta: 0

# Funções deployadas vs repositório
diff <(ls -1 supabase/functions) <(docker exec <fn> ls -1 /home/deno/functions)
```

## Anexo B — Placar

| Dimensão | Resultado |
|---|---|
| Tabelas migradas | 147/147 ✓ |
| Colunas migradas | ~1.999/2.000 (1 ausente) |
| Functions migradas | 92/92 ✓ |
| Views migradas | 11/11 ✓ |
| Triggers migrados | 73/75 (2 órfãos) |
| UNIQUEs migrados | 45/50 |
| Enums migrados | 4/5 |
| Buckets migrados | 7/7 (2 com visibilidade regredida) |
| Cron jobs migrados | 1/2 |
| Edge Functions deployadas | 112/120 do repositório |
| Env vars presentes | 8/78 |
| Policies não permissivas | 241/705 |
| Cobertura de RLS | 100% ✓ |
| Realtime | 5/3 ✓ |
| Extensões | 21/8 ✓ |
