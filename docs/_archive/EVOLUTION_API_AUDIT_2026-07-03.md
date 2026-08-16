# 🔬 Auditoria Exaustiva — Evolution API + Banco de Dados (VPS AtomicaBR)

> **Data:** 2026-07-03
> **Escopo:** Instalação Evolution API (VPS/Portainer Swarm), PostgreSQL do Evolution (PG14),
> PostgreSQL do Supabase self-hosted (PG15 — schemas `evo` e `zapp`), pipeline de integração e segurança.
> **Método:** Recon direto via MCP (Portainer, Evolution, Supabase self-hosted) + auditoria multi-agente
> com verificação adversarial independente de cada achado crítico. Severidades abaixo já refletem a verificação.
> **Perfil:** Revisão como Dev Sênior / DBA.

---

## 0. TL;DR — o que está certo, o que está quebrado

**Está correto / atualizado (boas notícias):**

- ✅ **Versão está na última estável.** A API responde `version: 2.3.7` (confirmado em `GET /`), que é **a última release estável** do upstream `EvolutionAPI/evolution-api`. As `2.4.0-rc1/rc2` são _pré-releases_ (branch `develop`, não recomendadas para produção). Baileys `7.0.0-rc.9`, Node `24.11.1`. **Não há update estável pendente.**
- ✅ Container `evolution` **healthy**; `init=true` (tini), healthcheck, `update_config` com rollback, DLQ vazia, consumer RabbitMQ com 1 réplica saudável (14/14 filas, 0 erros).
- ✅ Mídia por referência (URL no R2), não `bytea` inline. Backups diário/semanal/mensal existem.

**Está quebrado / em risco (ação necessária):**

| # | Severidade | Problema | Impacto |
|---|-----------|----------|---------|
| 1 | 🔴 CRÍTICO (operacional) | **`wpp2` (linha principal Promo Brindes) offline** — sessão Baileys perdida (`loggedOut/401`), sem credencial no Redis nem no Postgres | Ingestão de mensagens parada há ~2 meses; só reconecta com **novo QR** |
| 2 | 🔴 CRÍTICO (segurança) | **`AUTHENTICATION_API_KEY` = chave DEFAULT pública** da doc do Evolution, em texto puro, com a API exposta na internet | Controle total da API por quem conhece a chave default |
| 3 | 🔴 ALTO (segurança) | **CORS reflete qualquer Origin** com `Allow-Credentials: true` | Roubo de credencial cross-origin |
| 4 | 🔴 ALTO | **Webhook 401 em loop** — Edge Function exige HMAC; produtores mandam segredo em texto puro | Eventos WhatsApp não chegam ao app; flood de erro |
| 5 | 🔴 ALTO (segurança) | **RLS permissivo universal** no schema `zapp` — `authenticated` com `USING(true)` em 122 tabelas | Qualquer agente lê/escreve todo o CRM (sem isolamento multi-tenant) — LGPD |
| 6 | 🟠 ALTO | **Espelho `evo` sem retenção** — `evolution_messages_wpp2` = 2 GB / 1,84M linhas (12 meses) | 61% do banco; cresce sem limite |
| 7 | 🟠 ALTO | **Drift de deploy** — stack no Portainer diz MinIO; runtime usa R2 | Redeploy pela UI quebra mídia |
| 8 | 🟠 ALTO | **Redis é o único store das sessões** (`SAVE_INSTANCES=true`), com **AOF off** e `noeviction`, compartilhado com filas do n8n | Crash do Redis = re-QR em massa |

> **Este PR** corrige em código o item **#4** (raiz do 401, na Edge Function `evolution-webhook`) e entrega o
> kit de remediação (`db/remediation/…`) + o compose reconciliado para os demais itens. Itens que exigem
> ação em produção (novo QR, rotação de chave, restart de DB) estão documentados como runbook e **não** foram
> executados automaticamente.

---

## 1. Topologia real (mapeada)

```
                          Internet (Traefik :443, Let's Encrypt)
                                        │
        ┌───────────────────────────────┼──────────────────────────────────┐
        │ evolution.atomicabr.com.br     │ supabase.atomicabr.com.br         │
        ▼                                ▼                                    │
  ┌───────────────┐   RabbitMQ    ┌──────────────┐   consumer(py)     ┌──────────────────────┐
  │ Evolution API │ ───exchange──▶│  rabbitmq    │ ──────POST────────▶│ Edge Fn              │
  │  (Baileys)    │   "evolution" │  (14 filas)  │  x-webhook-secret  │ evolution-webhook    │
  │  v2.3.7       │               └──────────────┘                    │ (HMAC strict) ──401  │
  │  wpp2 / pink  │ ───webhook nativo (x-webhook-secret) ───────────▶ │                      │
  └──────┬────────┘                                                   └─────────┬────────────┘
         │ Prisma                                                               │ service_role
         ▼                                                                      ▼
  ┌────────────────────┐                                          ┌──────────────────────────────┐
  │ PostgreSQL 14.22   │  (stack "postgres", db=evolution)        │ Supabase PostgreSQL 15.8     │
  │ Message ~178k (90d │  ← purgado por evolution-db-purge        │ schema evo  (172 tab, espelho)│
  │ retention)         │                                          │ schema zapp (148 tab, app)   │
  │ 930 MB             │                                          │ 3.4 GB, cache hit 83%        │
  └────────────────────┘                                          └──────────────────────────────┘
         ▲                                                                      ▲
   Redis db8 (sessões Baileys, SAVE_INSTANCES=true)     Redis compartilhado com n8n (bull:jobs db2)
```

Dois bancos distintos: **PG14 `evolution`** é o store operacional do Evolution (Prisma, purgado a 90 dias);
**Supabase PG15** guarda o **espelho analítico** (`evo`) e o **app de atendimento** (`zapp`), alimentados pelo
pipeline RabbitMQ→consumer→Edge Function. Há também um **webhook nativo** do Evolution apontando para a
mesma Edge Function — caminho redundante e hoje quebrado (ver §4).

---

## 2. Instalação Evolution API — correção do deploy

**Versão (resposta à pergunta "está atualizada?"): SIM.**
`GET https://evolution.atomicabr.com.br/` → `{"version":"2.3.7","clientName":"evolution","whatsappWebVersion":"2.3000.1042618720"}`.
`2.3.7` é a última _estável_ do upstream. `package.json` no container: `"version":"2.3.7"`, `"baileys":"7.0.0-rc.9"`.
Imagem `evoapicloud/evolution-api` pinada por digest (`sha256:6b19…6fb1`, build 2025-12-05, rev `cd800f2`).

**Achados:**

- **EVO-CFG-01 · 🔴 CRÍTICO (operacional) — `wpp2` sem estado de sessão.**
  `redis-cli -n 8 EXISTS evolution:instance:d8e07e44-…` → `0` (a chave viva **não existe**; sobrou só
  `…:zombie-backup-20260427-1500`). Tabela Prisma `Session` = **0 linhas**. Como `CACHE_REDIS_SAVE_INSTANCES=true`,
  o Redis é o **único** store das credenciais Baileys — e a chave foi renomeada para `zombie-backup` em 2026-04-27.
  Sem credencial, **nenhum restart reconecta**: exige **novo QR**. `Message_24h=306` (quase tudo do `wpp_pink_test`),
  confirmando ingestão praticamente parada. → **Runbook R1**.

- **EVO-CFG-02 · 🔴 CRÍTICO (segurança) — API key default pública.**
  Runtime `AUTHENTICATION_API_KEY=429683C4C977415CAAFCCE10F7D57E11` — valor idêntico ao `.env.example`
  público do Evolution. O secret **`evolution_api_key_v1` existe e está montado, mas o entrypoint não o usa**
  (só exporta db/s3/rmq). Traefik expõe a API na internet. → **Runbook R2**.

- **EVO-SEC-CORS · 🔴 ALTO (segurança) — CORS reflete qualquer origem.**
  `curl -H 'Origin: https://evil.example.com'` → `Access-Control-Allow-Origin: https://evil.example.com` +
  `Access-Control-Allow-Credentials: true`. Reflexão de Origin arbitrário com credenciais habilitadas.
  Corrigir no reverse proxy/patch (allowlist de origins). → **Runbook R2**.

- **EVO-CFG-03 · 🟠 ALTO — Drift stack ↔ runtime (MinIO vs R2).**
  Stack Portainer (id 25): `S3_ENDPOINT=minio`, bucket `evolution`, secrets `minio_*`, `mem 2G`.
  Runtime real: `S3_ENDPOINT=…r2.cloudflarestorage.com`, bucket `zapp-whatsapp-media`, secrets `r2_*`,
  `S3_SAVE_VIDEO=true`, `mem 3G`. Um "update the stack" pela UI **reverteria para MinIO** (credenciais
  possivelmente inexistentes → falha de upload de mídia) e reduziria memória. → compose reconciliado no §8.

- **EVO-CFG-05 · 🟠 ALTO — Redis como store crítico sem durabilidade.**
  `appendonly=no` (AOF desligado), só RDB (`save 3600/300/60`), `maxmemory 3G`, `maxmemory-policy=noeviction`,
  `used_memory=1.71G`, **compartilhado** com `bull:jobs` do n8n (db2 = 7.297 chaves). Um crash entre snapshots
  perde a sessão de **todas** as instâncias → re-QR em massa (exatamente o padrão do `wpp2`). → **Runbook R4**.

- **EVO-CFG-06 · 🟡 MÉDIO — `CONFIG_SESSION_PHONE_VERSION` hardcoded.**
  Env fixa `2.3000.1038179882`, mas o runtime reporta `whatsappWebVersion=2.3000.1042618720` (divergente).
  Existe `wa-version-monitor` gravando `public._wa_web_version_history` — sinal de que a versão muda e força
  logout quando obsoleta. Automatizar a injeção da versão corrente ou remover o override.

- **EVO-CFG-07 · 🟡 MÉDIO — `main.js/main.mjs` sobrescritos por Docker configs (fork não versionado).**
  `main.js` = 486.001 bytes (md5 `c484c9f3`), montado via configs `evolution_main_v2_*`. Patches não-stock:
  retry configurável (`RETRY_NON_RETRYABLE_STATUS_CODES` default `[400,401,403,404,422]`, daí a mensagem
  "Erro não recuperável") + endpoint de métricas com Basic-auth. **Watchtower usa opt-in por label** e a stack
  evolution não tem o label + é digest-pinned → **risco de auto-update mitigado**, mas o patch não tem fonte
  versionada. Versionar o gerador do config em git.

- **EVO-CFG-08 · 🟡 MÉDIO — `connection-update` sempre descartado (422).**
  Consumer: `WARNING [DROP 422] connection-update … INVALID_WEBHOOK_PAYLOAD`. 108 drops = 108 eventos Sentry em ~5h.
  Alinhar o contrato do `connection.update` na Edge Function ou desligar o evento se o status não é consumido.

- **EVO-CFG-10/11 · INFO — pontos corretos.** `DATABASE_SAVE_DATA_CHATS/HISTORIC=false` (coerente: a fonte de
  chats/histórico é o Supabase), `TELEMETRY=false`, `DEL_INSTANCE=false`, `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false`.

---

## 3. Banco `evo` (espelho, PG15) — 172 tabelas

**Sumário:** 89% do schema (153/172 tabelas) está **vazio** — sintoma do anti-pattern "tabela por instância".
Toda a massa está em `evo.evolution_messages_wpp2`: **2.084 MB** (heap 1.175 MB + TOAST 47 MB + **862 MB de índices**),
**1.843.497 linhas**, 61% do banco inteiro.

- **EVO-03 · 🟠 ALTO — Espelho sem retenção.** Retém desde 2025-07 (12 meses) enquanto a fonte PG14 mantém 90 dias.
  92% das linhas têm >90 dias. Sem política, o único freio hoje é a ingestão estar quebrada. → SQL §7 (retenção/partição).

- **EVO-05 · 🟠 ALTO — Ingestão colapsou pós-abril/2026.** Linhas/mês: jan 299.833 · fev 284.292 · mar 280.199 ·
  **abr 141.137 · mai 12.026 · jun 4.760** — queda de ~95%, coincidente com o `loggedOut/401` do `wpp2`. Não é
  retenção: é **perda de captura** por falha de pipeline. Resolve com R1 (reconectar) + §4 (fix do 401).

- **EVO-04 · 🟡 MÉDIO — 862 MB de índices (73% do heap); 3 índices redundantes** cobrindo `(remote_jid, created_at DESC)`
  (~208 MB) + 2 índices só de `created_at` (~77 MB). Consolidar → ganho estimado ~250–300 MB. → SQL §7.

- **EVO-02 · 🟡 MÉDIO — Anti-pattern tabela-por-instância.** 25× `evolution_messages_<inst>` + 42× `evolution_webhook_events_<inst>`,
  **745 índices** no schema, ~54 MB presos em tabelas vazias. Existe `fn_create_monthly_partition` mas `wpp2` **não é
  particionada** (`relkind='r'`). Modelo correto: tabela única particionada por `LIST(instance_name)` ou `RANGE(created_at)`.

- **EVO-06/07/08/09/10 · 🟡/🟢** — `instance_name` constante ('wpp2') redundante na PK/índices · coluna `raw_data` 100% NULL
  (morta) e `payload` jsonb ~3,3 KB/linha · ~600 índices em tabelas vazias + índices `idx_scan=0` · `UNIQUE(message_id,…)`
  com `message_id` nullable (34 NULLs) · `VACUUM` completo nunca rodou (dead 2,2%, ok por ora). → SQL §7.

> ⚠️ **Correção de severidade (verificação adversarial):** o achado inicial "policy `anon_read USING(true)` expõe 1,8M
> mensagens ao `anon`" foi **REFUTADO**. A policy existe mas é **inerte**: o role `anon` **não tem `USAGE`/`SELECT`**
> efetivo no schema `evo` via PostgREST. Rebaixado para 🟢 LOW (higiene: remover policy morta). **Não há vazamento a anônimo aqui.**

---

## 4. Integração & o incidente 401 — causa-raiz (corrigida neste PR)

**Root cause (confirmado por código + runtime):** a Edge Function `evolution-webhook` valida autenticidade por
**HMAC-SHA256 em modo estrito** (`createWebhookValidator(WEBHOOK_SECRETS, strict=true)`), lendo apenas os headers de
assinatura (`x-webhook-signature`, `x-evolution-signature`, …). Mas **os dois produtores** — o **webhook nativo** do
Evolution *e* o **consumer RabbitMQ** — enviam o segredo em **texto puro** no header `x-webhook-secret`, que o
validador **não lê**. Resultado: `signatureFound=false` → `401 "Missing webhook signature"` para todo evento.

- Não vem do Kong (`route functions-v1` só tem plugin `cors`, `VERIFY_JWT=false`) — vem da própria função.
- `public.webhook_audit_log` (6h): **410 rejected** ("Missing webhook signature") vs **9 processed**. Os 9 provam que o
  pipeline funciona **ponta-a-ponta quando a autenticação passa**.
- O consumer, ao receber 401, classifica como `4xx → DROP` (ack sem requeue) → **perda silenciosa** de eventos (INT401-2).
- Há **entrega dupla** (webhook nativo + consumer no mesmo endpoint) e **2 linhas `Webhook` habilitadas** (INT401-3).

**Correção aplicada neste PR (código):** o validador HMAC (`_shared/hmac-validation.ts`) passa a aceitar **também**
um **shared-secret bearer** via `x-webhook-secret`, comparado em **tempo constante** contra os mesmos segredos
configurados — de forma **aditiva** (HMAC continua preferido e checado primeiro; modo estrito continua rejeitando quem
não apresenta nem assinatura válida nem segredo válido). Isso destrava **os dois produtores** com o segredo forte que
eles **já enviam**, sem afrouxar o modelo (o stopgap `EVOLUTION_WEBHOOK_STRICT=false` — que removeria toda a auth — foi
**evitado**). Gate: `EVOLUTION_WEBHOOK_ALLOW_SHARED_SECRET` (default `true`; `false` volta a exigir HMAC).

Arquivos: `supabase/functions/_shared/hmac-validation.ts`, `supabase/functions/evolution-webhook/index.ts`,
testes em `supabase/functions/_shared/__tests__/hmac-multi-secret.test.ts` (6 novos casos, incl. segredo errado
rejeitado e precedência do HMAC).

**Recomendação de longo prazo (fora deste repo):** migrar o **consumer RabbitMQ** para assinar HMAC-SHA256 do corpo
exato (header `x-webhook-signature`) e rotear 401/403 para DLQ em vez de DROP; então consolidar num **único** caminho de
entrega e cobrir `wpp_pink_test` (`INSTANCE_PREFIX`). Patch de referência em `db/remediation/consumer-hmac-patch.md`.

- **INT401-5 · 🟡 MÉDIO — o 401 do socket Baileys (`loggedOut`) é SEPARADO do 401 do webhook.** O loop de reconexão do
  `wpp2` gera `CONNECTION_UPDATE` constante, que alimenta o flood. Reconectar (R1) reduz o volume; não resolve o 401 do
  webhook (causas independentes). Ambos precisam de ação.

---

## 5. Banco `zapp` (app de atendimento, PG15) — 148 tabelas

**Sumário:** 148 tabelas, todas com PK; RLS **habilitado em 100%** — porém as **policies são permissivas**.

- **ZAPP-01 · 🔴 ALTO (segurança/LGPD) — RLS permissivo universal.** Padrão `auth_full_access` `USING(true) WITH CHECK(true)`
  para o role `authenticated` em **122 tabelas** (`cmd=ALL`) + 25 tabelas `SELECT true`; grants amplos em ~149 tabelas.
  Só ~19 policies usam `is_admin_or_supervisor(auth.uid())` e 2 usam `user_id=auth.uid()`. **Qualquer JWT de agente lê e
  escreve TODOS os contatos/conversas de TODAS as empresas** — sem isolamento multi-tenant.
  > _Verificação:_ o role **`anon` NÃO tem `USAGE`** em `zapp` (bom — não é exposição anônima); o risco é
  > **`authenticated`-para-tudo**. Severidade final **ALTO** (era CRÍTICO na hipótese de exposição anônima, refutada). → SQL §7 (modelo de tenancy).

- **ZAPP-02 · 🟡 MÉDIO — Views sem `security_invoker` executam como `postgres` e ignoram RLS.** `zapp.messages`,
  `zapp.whatsapp_connections`, `zapp.whatsapp_connections_safe` sem `security_invoker`; a não-`safe` expõe `api_key`,
  `qr_code_base64`. Ativar `security_invoker=on` e revogar a view não-safe de `authenticated`. → SQL §7.

- **ZAPP-03 · 🟡 MÉDIO — Estatísticas obsoletas sistêmicas.** 146/148 tabelas **nunca** sofreram ANALYZE/VACUUM. Ex.:
  `webhook_events_processed` tem `n_live_tup=7` mas `count(*)=42.248` real → planner subestima cardinalidade e escolhe
  planos ruins. → SQL §7 (ANALYZE imediato).

- **ZAPP-04 · INFO — `webhook_events_processed` (10MB/7 rows) NÃO é bloat.** São 42.248 linhas reais, `n_dead_tup=0`; os
  "7 rows" são estatística desatualizada (tabela nunca analisada). Definir retenção (TTL 30–90d) ou particionar se crescer.

- **ZAPP-05 · 🟡 MÉDIO — 12/68 FKs sem índice de cobertura** (`conversation_events.*_id`, `*_executions`, `followup_steps`,
  `talkx_*`) → seq scan na filha em cada delete/update do pai. → SQL §7.

- **ZAPP-06/07/08/09 · 🟡/🟢** — 182/240 colunas `*_id` sem FK · 138/148 tabelas vazias (super-provisionamento) · índices
  prematuros nunca usados · `contatos` com `email` como `json`, `telefone` sem `UNIQUE`, PK `bigint` (inconsistente com `uuid`).

---

## 6. Performance & tuning (Supabase PG15, host 24 GB / 12 vCPU)

- **PERF-01 · 🟡 MÉDIO — Realtime domina o tempo do banco.** `realtime.list_changes` = **~87,5%** de todo o exec time
  (170k+ calls). O slot lógico `cainophile_1benh40s` está com **~1 GB de WAL retido / flush lag**. O decoding lógico
  processa **todo** o WAL global. Ação: (1) verificar se o slot é ativo ou órfão (dropar se órfão); (2) remover tabelas
  vazias/volumosas da publication `supabase_realtime`; (3) **nunca** publicar `evolution_messages_*`. → SQL §7 (inspeção primeiro).

- **PERF-02 · 🟡 MÉDIO — `shared_buffers=1GB` num host de 24 GB.** A tabela quente (2 GB) não cabe. `effective_cache_size=3GB`
  subestima os ~12–16 GB reais em page cache. Cache hit agregado 83% (puxado por scans one-off de auditoria).
  Elevar `shared_buffers→6GB`, `effective_cache_size→16GB` (requer restart, com janela). → SQL §7.
  > _Verificação rebaixou de ALTO para ~MÉDIO:_ o cache hit está inflado negativamente por queries de introspecção/auditoria
  > pontuais; ainda assim o dimensionamento é conservador demais para o host.

- **PERF-03 · 🟡 MÉDIO — Pressão de conexões.** 64/100 usadas, das quais ~54 são infraestrutura Supabase ociosa
  (25 `supavisor_meta` + 15 `supabase_admin` + ~15 realtime). Folga de ~33 para bursts. Garantir apps via Supavisor
  (transaction mode :6543); avaliar `max_connections→150–200` no host de 24 GB; `idle_session_timeout`.

- **PERF-05 · 🟡 MÉDIO — Autovacuum destunado na tabela grande.** `evolution_messages_wpp2` (1,84M) nunca sofreu autovacuum
  (gatilho ~369k dead; há 41k). Baixar `scale_factor` por tabela e elevar `cost_limit` global. → SQL §7.

- **PERF-06/07/08 · 🟢 LOW** — `timescaledb` em `shared_preload_libraries` mas **não criado** (memória desperdiçada) ·
  48 cron jobs (vários a cada 1–2 min) geram churn/WAL que alimenta PERF-01 · ajustar `work_mem→32MB`,
  `maintenance_work_mem→512MB`, `max_wal_size→4GB`, `max_worker_processes→12`.

- **PERF-09 · INFO** — **Sem risco de wraparound** (idade máx de xid 47,3M vs 200M).

---

## 7. Kit de remediação (SQL)

Arquivo: [`db/remediation/evolution_supabase_remediation.sql`](../db/remediation/evolution_supabase_remediation.sql) —
idempotente, dividido em **tiers por risco**. Nada roda sozinho; execute por seção, em janela apropriada:

- **Tier 1 (seguro, sem lock relevante):** `ANALYZE` do schema `zapp`, tuning de autovacuum por tabela, remoção da policy
  morta `anon_read` no `evo`.
- **Tier 2 (revisar + `CONCURRENTLY`):** consolidação de índices redundantes em `evolution_messages_wpp2`, índices de FK
  faltantes no `zapp`, `security_invoker` nas 3 views + revoke da view sensível.
- **Tier 3 (janela / design):** `ALTER SYSTEM` de memória/WAL (+restart), retenção do espelho `evo`, plano de
  particionamento, modelo de tenancy do RLS `zapp`.

---

## 8. Runbook de produção (ações que exigem coordenação — NÃO executadas automaticamente)

- **R1 — Reconectar `wpp2`:** `GET /instance/connect/wpp2` (ou MCP `evo_instance_connect`), escanear o QR no WhatsApp
  do `551146375517`. Depois: `redis-cli -n 8 DEL 'evolution:instance:d8e07e44-…:zombie-backup-20260427-1500'`. Investigar
  quem renomeou a chave em 27/04 (watchdog-baileys/baileys-backup).
- **R2 — Rotacionar API key + CORS:** `openssl rand -hex 24` → novo valor no secret `evolution_api_key_v1`; adicionar ao
  entrypoint `export AUTHENTICATION_API_KEY=$(cat /run/secrets/evolution_api_key_v1)` e **remover** o valor plaintext do
  `environment`; atualizar consumidores (consumer, MCP, n8n). Restringir CORS a uma allowlist de origins.
- **R3 — Reconciliar o stack:** aplicar `docs/infra/evolution-stack.reconciled.yml` (R2 + secret-based key) como fonte da
  verdade; versionar em git; parar de fazer `docker service update` out-of-band.
- **R4 — Durabilidade do Redis:** `CONFIG SET appendonly yes; CONFIG SET appendfsync everysec; CONFIG REWRITE`; monitorar
  `used_memory` vs 3G; avaliar Redis dedicado para o Evolution (separado das filas do n8n).
- **R5 — Deploy do fix do webhook (este PR):** após merge, deploy da Edge Function `evolution-webhook` com o segredo em
  `EVOLUTION_WEBHOOK_SECRET(S)`; validar `webhook_audit_log` (processed↑, rejected→0). Depois, desabilitar o webhook
  nativo duplicado e consolidar num caminho único.

---

## 9. Verificação

- **Edge Function (código):** lógica do validador (HMAC + shared-secret + precedência + modo estrito + retrocompat)
  validada por simulação determinística de 9 casos — todos passam, incluindo "segredo errado rejeitado", "HMAC vence
  quando ambos presentes" e "HMAC legado intacto". Testes Deno adicionados em `hmac-multi-secret.test.ts`.
- **Achados de infra/DB:** cada achado CRÍTICO/ALTO foi re-verificado por um agente independente que rodou as próprias
  queries/exec (não confiou no texto). Severidades acima já refletem as correções da verificação (ex.: exposição anônima
  do `evo` **refutada**; 401 do webhook confirmado; drift MinIO/R2 confirmado; chave default confirmada).

---

---

## 10. Execução aplicada (2026-07-03) — melhorias seguras já em produção

Aplicado via MCP (Supabase self-hosted + Portainer/psql), **uma etapa por vez, com simulação prévia e
verificação pós-cada-passo**, em janela sem locks nem transações longas. Script idempotente completo com
reversões: [`db/remediation/APPLIED_2026-07-03.sql`](../db/remediation/APPLIED_2026-07-03.sql).

| Etapa | Ação | Resultado verificado |
|-------|------|----------------------|
| Tuning (escopo DB) | `effective_cache_size=16GB`, `work_mem=32MB`, `maintenance_work_mem=512MB` via `ALTER DATABASE` | aplicado a novas conexões (reversível) |
| Autovacuum | scale_factor/cost por tabela em `evolution_messages_wpp2` e `webhook_events_processed` | aplicado |
| Estatísticas | `ANALYZE` das 148 tabelas `zapp` + `VACUUM ANALYZE` da partição de 2GB | sem-ANALYZE 146→**0**; dead tuples 41k→**0**; `webhook_events_processed` 7→**42.248** |
| Índices FK | 12 índices de cobertura CONCURRENTLY no `zapp` | **12 VALID** |
| Consolidação | −3 índices standalone duplicados em `evolution_messages_wpp2` | 15→**12**, índices 862MB→**707MB**, banco −154MB, EXPLAIN sem seq scan |
| Hardening | remoção de 7 policies `anon` inertes no `evo` | **0** restantes |

**Duas correções que a execução revelou (vs. a hipótese inicial da auditoria):**

1. **`evo.evolution_messages_wpp2` É uma partição** de `evo.evolution_messages` (LIST partitioning) — não é
   uma tabela solta. Existem **índices particionados** (no pai, que propagam para novas partições) além de
   índices standalone criados direto na partição. A consolidação preservou os particionados e removeu só os
   standalone duplicados. Isso também significa que a **retenção** do espelho deve ser feita por
   `DROP PARTITION` por período (design), não por `DELETE`.
2. **O schema `zapp` é single-tenant** — não há coluna `company_id`/`tenant_id`. O achado ZAPP-01 ("RLS
   permissivo sem isolamento multi-tenant") portanto **não se resolve** com policies por empresa; o risco real
   é a emissão de tokens `authenticated` e a ausência de escopo por-usuário. Reclassificado como
   "restringir emissão de token / policies por-usuário", não "isolamento multi-tenant".

**Deliberadamente NÃO executado autonomamente** (requer janela/superuser/infra/ação física — ver §8 Runbook e o
rodapé de `APPLIED_2026-07-03.sql`): params globais com restart (`shared_buffers` etc.), `security_invoker` nas
views (cadeia cross-schema para `public.*`), `DROP COLUMN raw_data`, re-QR do `wpp2`, rotação da API key, CORS,
Redis AOF, reconciliação do stack e deploy da edge function. Fazer qualquer um deles "às cegas" em produção seria
o oposto de excelência.

---

_Gerado em 2026-07-03. Ferramentas: Portainer MCP, Evolution MCP, Supabase self-hosted MCP._

> **Follow-up (sessão 2, 2026-07-04):** ver [`EVOLUTION_API_AUDIT_2026-07-04_followup.md`](./EVOLUTION_API_AUDIT_2026-07-04_followup.md) —
> corrige a regressão 422/`contract_violation` que este fix de autenticação expôs (apikey `null` × Zod `.optional()`),
> reduz o `log_statement` do PG14 e verifica em produção o estado de todos os itens acima.
