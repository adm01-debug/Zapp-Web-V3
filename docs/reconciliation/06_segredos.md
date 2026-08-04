# FASE 5 — Reconciliação de Segredos/Env (etapas 65–74)

**Data:** 2026-08-04 · **Escopo:** containers da stack Supabase self-hosted (VPS AtomicaBR, via Portainer MCP) + repo `C:\zapp-web-v3` · **Modo:** READ-ONLY · **Regra:** nenhum valor de segredo em claro — apenas nomes de envs, fingerprints sha256[:16] e tamanhos de arquivo.

**Método:** envs lidas de `/proc/1/environ` (PID 1) e `Config.Env` (inspect) via `portainer_exec_container`/`portainer_get_container`; fingerprints computados DENTRO dos containers (nunca exibidos em claro); vault consultado via Supabase MCP (somente contagem e nomes); repo varrido com grep/python (read-only).

---

## 65. Matriz de presença de envs por serviço

| Serviço (container) | Envs presentes (nomes) | Secrets montados (/run/secrets) | Esperados ausentes |
|---|---|---|---|
| **db** (`supabase_db`) | POSTGRES_* via entrypoint (env não legível — permissão; secrets montados) | `supabase_db_password_v1`, `supabase_jwt_secret_v1` | — (mecanismo via secret) |
| **auth** (`supabase_auth`) | GOTRUE_*: API_HOST/PORT, DB_DATABASE_URL, DB_DRIVER, DB_MIGRATIONS_PATH, JWT_SECRET, JWT_ISSUER/AUD/EXP/ADMIN_ROLES, SITE_URL, URI_ALLOW_LIST, EXTERNAL_* (EMAIL/PHONE/ANONYMOUS), MAILER_*, SECURITY_*, SESSIONS_*, SMS_*, SMTP_* (HOST/PORT/USER/PASS/ADMIN_EMAIL/SENDER_NAME), API_EXTERNAL_URL, DB_PASS | `gmail_smtp_password_v1`, `supabase_db_password_v1`, `supabase_jwt_secret_v1` | — |
| **rest** (`supabase_rest`) | PGRST_JWT_SECRET, PGRST_APP_SETTINGS_JWT_SECRET, PGRST_APP_SETTINGS_JWT_EXP, PGRST_DB_URI, PGRST_DB_ANON_ROLE, PGRST_DB_SCHEMAS, PGRST_DB_USE_LEGACY_GUCS | **nenhum** (valores estáticos no env) | — (ver achado R-01) |
| **storage** (`supabase_storage`) | ANON_KEY, SERVICE_KEY, PGRST_JWT_SECRET, DATABASE_URL, DB_PASS, STORAGE_BACKEND, FILE_STORAGE_BACKEND_PATH, IMGPROXY_URL, POSTGREST_URL, TENANT_ID, REGION, ENABLE_IMAGE_TRANSFORMATION, FILE_SIZE_LIMIT | `supabase_db_password_v1`, `supabase_jwt_secret_v1`, `supabase_service_key_v1` | — |
| **functions** (`supabase_functions`) | SELFHOSTED_SUPABASE_URL, SUPABASE_URL, SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE_KEY, SELFHOSTED_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY, SUPABASE_DB_URL, DB_PASS, JWT_SECRET, EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_WEBHOOK_SECRETS, AI_ROUTER_URL, AI_BASE_URL, DEEPSEEK_API_KEY, PROMOGIFTS_SUPABASE_URL, PROMOGIFTS_SUPABASE_ANON_KEY, SENTRY_DSN, VERIFY_JWT | `supabase_db_password_v1`, `supabase_jwt_secret_v1`, `supabase_service_key_v1`, `supabase_evolution_webhook_secret_v1`, `evolution_api_key_v4_20260704`, `deepseek_api_key_v2` | **~28 nomes exigidos pelo código** (etapa 66) |
| **realtime** (`supabase_realtime`) | SECRET_KEY_BASE, DB_ENC_KEY, METRICS_JWT_SECRET, DB_USER/HOST/PORT/NAME, DB_AFTER_CONNECT_QUERY, SLOT_NAME_SUFFIX, SEED_SELF_HOST, DNS_NODES | `supabase_db_password_v1`, `supabase_jwt_secret_v1` | — (DB_PASS vazio no PID1 — ver R-05) |
| **meta** (`supabase_meta`) | PG_META_DB_HOST/USER/PASSWORD/PORT/NAME, PG_META_CRYPTO_KEY, CRYPTO_KEY | `supabase_db_password_v1` | — |
| **kong** (`supabase_kong`) | KONG_DATABASE, KONG_DECLARATIVE_CONFIG, KONG_DNS_ORDER, KONG_PLUGINS, KONG_NGINX_PROXY_*, SUPABASE_ANON_KEY, DASHBOARD_USERNAME | `supabase_jwt_secret_v1`, `supabase_service_key_v1`, `kong_dashboard_password_v1` | — |
| **pooler** (`supabase_supavisor`) | SECRET_KEY_BASE, VAULT_ENC_KEY, POSTGRES_HOST/PORT/DB, CLUSTER_POSTGRES, POOLER_* (POOL_MODE/TENANT_ID/DEFAULT_POOL_SIZE/MAX_CLIENT_CONN), REGION, PORT | `supabase_db_password_v1`, `supabase_jwt_secret_v1` | — |
| **web** (`zapp-web-prod`) | sem env runtime relevante (nginx; `/proc/1/environ` = apenas CMD) — `VITE_*` são build-time (Dockerfile: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_EXTERNAL_SUPABASE_URL, VITE_EXTERNAL_SUPABASE_ANON_KEY, VITE_SENTRY_DSN, VITE_SENTRY_ENVIRONMENT, VITE_APP_ENV) | — | — |

**Leitura:** infraestrutura core (auth/rest/storage/functions/realtime/meta/kong/pooler/db) com envs coerentes e secrets centralizados em docker secrets. O único serviço com déficit de segredos é **functions** (lista na etapa 66).

---

## 66. Segredos que as edges leem × env do container functions (P1)

Conjunto requerido (grep `Deno.env.get('...')` em `supabase/functions/`, 125 funções, excluindo node_modules) confrontado com `/proc/1/environ` do `supabase_functions`:

### ✅ Presentes (20)
`SELFHOSTED_SUPABASE_URL` (32×), `SUPABASE_URL` (25×), `SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY` (22×), `SUPABASE_SERVICE_ROLE_KEY` (17×), `EVOLUTION_API_URL` (16×), `EVOLUTION_API_KEY` (16×), `SELFHOSTED_SUPABASE_ANON_KEY` (13×), `SUPABASE_ANON_KEY` (7×), `AI_ROUTER_URL` (8×), `AI_BASE_URL`, `DEEPSEEK_API_KEY`, `EVOLUTION_WEBHOOK_SECRETS` (4×), `SENTRY_DSN`, `ENVIRONMENT`, `PROMOGIFTS_SUPABASE_URL` (2×), `PROMOGIFTS_SUPABASE_ANON_KEY` (2×), `VERIFY_JWT`, `SUPABASE_DB_URL`, `DB_PASS`, `JWT_SECRET` (com \n — ver R-01).

### ❌ AUSENTES no env do functions (requeridos pelo código) — 30 nomes
`AI_GATEWAY_KEY` (8), `LOVABLE_API_KEY` (8), `WEBHOOK_SECRET` (7), `GOOGLE_CLIENT_ID` (5), `GOOGLE_CLIENT_SECRET` (5), `EXTERNAL_SUPABASE_URL` (6), `EXTERNAL_SUPABASE_ANON_KEY` (6), `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` (4), `RESEND_API_KEY` (4), `WHATSAPP_CLOUD_APP_SECRET` (2), `WHATSAPP_CLOUD_ACCESS_TOKEN` (2), `WHATSAPP_CLOUD_PHONE_NUMBER_ID` (2), `CRON_SECRET` (2), `GMAIL_PUBSUB_TOPIC` (2), `GMAIL_PUBSUB_TOKEN` (2), `SICOOB_GIFTS_URL` (2), `SICOOB_GIFTS_BRIDGE_SECRET` (2), `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `BITRIX_WEBHOOK_URL`, `BITRIX_PORTAL` (validation.ts), `VIRUSTOTAL_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET`, `IMAP_ENCRYPTION_KEY`, `QR_ALERT_WEBHOOK_URL`, `QR_ALERT_WEBHOOK_TOKEN`, `SUPABASE_PUBLISHABLE_KEY`, `HEALTH_SECRET`, `METRICS_SCRAPE_TOKEN`, `TALKX_INTERNAL_SECRET`, `SLA_ALERT_WEBHOOK_SECRET`, `JWT_SECRET_FILE`, `GMAIL_REDIRECT_URI` (gmail-oauth), `APP_URL`, `EVOLUTION_WEBHOOK_SECRET` (singular; fallback OK para o plural), `EVOLUTION_WEBHOOK_STRICT` (default `true` no código — seguro).

> Obs.: `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`HF_API_TOKEN` não são lidos via env — vêm do **vault** via `getSecret()` (etapa 69).

---

## 67. Feature → segredo ausente (features quebradas por segredo ausente)

| Feature | Segredo(s) ausente(s) | Onde quebra (evidência) | Status |
|---|---|---|---|
| **Gmail (5 edges)** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_PUBSUB_TOPIC`, `GMAIL_REDIRECT_URI` (+ `GMAIL_PUBSUB_TOKEN` no env; **presente no vault** mas insuficiente) | gmail-oauth, gmail-send, gmail-sync, gmail-token-refresh, gmail-webhook | 🔴 QUEBRADO |
| **IA fallback/gateway (8+ edges)** | `AI_GATEWAY_KEY`, `LOVABLE_API_KEY`; vault sem `openai_api_key`/`anthropic_api_key` | ai-proxy, ai-router, automation-suggest-reply, chatbot-l1, evolution-chatbot, evolution-sentiment (+4) | 🟡 PARCIAL — DeepSeek ✅ (`DEEPSEEK_API_KEY` fp `e985402158faeb7e`) e `AI_ROUTER_URL` ✅ funcionam; fallback OpenAI/Anthropic e gateway/LOVABLE quebrados |
| **WhatsApp Cloud API** | `WHATSAPP_CLOUD_APP_SECRET`, `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | whatsapp-cloud-webhook, whatsapp-cloud-send, connection-test | 🔴 QUEBRADO |
| **WhatsApp legado** | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | whatsapp-webhook (validação assinatura Meta) | 🟡 DEGRADADO — aceita sem verificação confiável |
| **E-mail transacional** | `RESEND_API_KEY` | send-email, send-scheduled-report, sentiment-alert, detect-new-device | 🔴 QUEBRADO |
| **CRM Bitrix24** | `BITRIX_WEBHOOK_URL`, `BITRIX_PORTAL`; vault sem `bitrix_webhook_url` | bitrix-api, evolution-bitrix-sync | 🔴 QUEBRADO |
| **Fluxo SICOOB gifts (P0-5)** | `SICOOB_GIFTS_URL`, `SICOOB_GIFTS_BRIDGE_SECRET` | sicoob-bridge-reply, sicoob-outbox-consumer | 🔴 QUEBRADO |
| **Transcrição de áudio (HF)** | vault sem `hf_api_token` | audio-transcribe | 🟡 PARCIAL |
| **Scan de mídia** | `VIRUSTOTAL_API_KEY` | secure-upload | 🟡 DEGRADADO — upload sem scan |
| **Voz ElevenLabs** | `ELEVENLABS_WEBHOOK_SECRET` | elevenlabs-webhook | 🟡 DEGRADADO — webhook sem validação HMAC |
| **IMAP bridge** | `IMAP_ENCRYPTION_KEY` | email-imap-bridge | 🔴 QUEBRADO |
| **Outlook OAuth** | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` | outlook-oauth | 🔴 QUEBRADO |
| **Segurança endpoints internos** | `HEALTH_SECRET`, `METRICS_SCRAPE_TOKEN`, `TALKX_INTERNAL_SECRET` | health, metrics, talkx-control | 🟠 EXPOSIÇÃO — endpoints sem auth de segredo (health/metrics) |
| **Crons externos** | `CRON_SECRET` | `_shared/auth.ts` (requireServiceRoleOrCron) | 🟡 PARCIAL — só service-role bearer funciona |
| **Alerta SLA / QR** | `SLA_ALERT_WEBHOOK_SECRET`, `QR_ALERT_WEBHOOK_URL`, `QR_ALERT_WEBHOOK_TOKEN` | sla-alert-forward, evolution-webhook | 🟡 DEGRADADO — sem assinatura/não notifica |
| **Integração Supabase externo** | `EXTERNAL_SUPABASE_URL`, `EXTERNAL_SUPABASE_ANON_KEY`, `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` | _shared/evolution-webhook-handlers, connection-health-check, recheck-webhook-signature, whatsapp-cloud-api, log-idempotency-miss | 🟡 PARCIAL — `auth.ts` faz fallback p/ SELFHOSTED_* |
| **MCP/outros** | `SUPABASE_PUBLISHABLE_KEY` | mcp/index.ts | 🟡 PARCIAL |

**Top 3 features quebradas:** 1) Gmail (5 edges), 2) IA fallback + gateway + Lovable (8+ edges, parcial), 3) WhatsApp Cloud + legado (4 edges). Somam-se e-mail transacional, Bitrix e SICOOB como quebras totais.

---

## 68. Consistência cross-container (fingerprints sha256[:16], computados in-container)

| Segredo | db (arquivo) | auth | functions | rest | storage | realtime | meta | kong | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **JWT secret** | `1bf6b61a79c2fff5` (arquivo c/ \n) | `1bf6b61a79c2fff5` (GOTRUE_JWT) | `1bf6b61a79c2fff5` (JWT_SECRET) | `b6177a99676f5b78` (PGRST_JWT_SECRET, **sem** \n) | `1bf6b61a79c2fff5` (PGRST_JWT_SECRET) | `1bf6b61a79c2fff5` (METRICS_JWT) | — | template `{{JWT_SECRET}}` ← mesmo arquivo | ✅ **MESMO VALOR** (diferença de fp = newline; conteúdo idêntico) |
| **Senha do DB** | `68e9cc05b736c478` (arquivo c/ \n) | `b0e6e79fbc9dd276` (URL, sem \n) | `b0e6e79fbc9dd276` (URL) / `68e9cc05b736c478` (DB_PASS) | `b0e6e79fbc9dd276` (PGRST_DB_URI) | `b0e6e79fbc9dd276` (URL) / `68e9cc05b736c478` (DB_PASS) | arquivo montado | `68e9cc05b736c478` (PG_META_DB_PASSWORD) | — | ✅ **MESMO VALOR** (teste psql: ambas variantes autenticam `select 1` → postgres role aceita a senha; diferença = newline) |
| **Service role key** | — | — | `54bad86b4d1edd7a` (env = arquivo) | — | `54bad86b4d1edd7a` | — | — | template `{{SUPABASE_SERVICE_KEY}}` ← mesmo arquivo | ✅ consistente |
| **Anon key** | — | — | `4a1e6ff19f60497d` | — | `4a1e6ff19f60497d` | — | — | `4a1e6ff19f60497d` (SUPABASE_ANON_KEY) | ✅ consistente |
| **SMTP/Gmail app password** | — | `da8707c74ca7073f` (GOTRUE_SMTP_PASS = arquivo) | — | — | — | — | — | — | ✅ consistente |
| **EVOLUTION_API_KEY** | — | — | env `66b7dd131ac869ab` ≠ arquivo `94ffabbaf641ee47` (32B, sem \n) | — | — | — | — | — | ⚠️ **DIVERGÊNCIA env↔secret a investigar** (R-02) |
| **EVOLUTION_WEBHOOK_SECRETS** | — | — | env `caa97aabbe968c4f` (88B) ≠ arquivo `d0a3d0c8b35c9343` (88B, sem \n) | — | — | — | — | — | ⚠️ **DIVERGÊNCIA env↔arquivo** (R-02) — HMAC usa env c/ `.trim()` |

**Resultado:** NÃO há mismatch real de JWT secret nem de senha do DB — o "mismatch" aparente era artefato de **newline final nos arquivos de secret** (ver R-01). O JWT secret do rest (`b6177a99676f5b78` = mesmo conteúdo sem \n) confere com todos os demais. PostgREST valida corretamente os tokens do GoTrue. 🟢

### R-01 (P1 higiene): arquivos de secret com trailing newline (`0a`)
| Arquivo | Bytes | Último byte | |
|---|---|---|---|
| `supabase_db_password_v1` | 33 | `0a` | ❌ |
| `supabase_jwt_secret_v1` | 41 | `0a` | ❌ |
| `supabase_service_key_v1` | 204 | `0a` | ❌ |
| `deepseek_api_key_v2` | 35 | `38` ('8') | ✅ |
| `evolution_api_key_v4_20260704` | 32 | `37` ('7') | ✅ |
| `supabase_evolution_webhook_secret_v1` | 88 | `38` ('8') | ✅ |

O entrypoint do functions exporta envs **com o \n incluso** (verificado: `SUPABASE_SERVICE_ROLE_KEY`, `SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SELFHOSTED_SUPABASE_ANON_KEY`, `JWT_SECRET` — todos terminam em `0a` no `/proc/1/environ`). Mitigação parcial no código: `.trim()` em `_shared/auth.ts` (readSecret, linhas 53/64), `hmac-validation.ts` (linha 361) e `main/index.ts` (linha 81). **Consumidores SEM trim** (risco de 401/header inválido em chamadas via Kong): `db-client.ts`, `vault.ts`, `ai-usage.ts`, `evolution-webhook-messages.ts` (linha 303), `log-idempotency-miss.ts`, `enqueue-failed-message.ts`, `log-retry-metric.ts`.
**Ação:** recriar os 3 secrets com `printf '%s'` (sem \n) e padronizar leitura com trim.

### R-02 (P2): divergência env ↔ secret montado
`EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_SECRETS` no env do functions têm fingerprints diferentes dos arquivos de secret montados (o entrypoint usa env fixo do compose p/ EVOLUTION_API_KEY, segundo `infra/stack35/SECRETS_INVENTORY.md`). Se o secret `evolution_api_key_v4_20260704` (rotacionado em 04/07/2026) for o valor vigente na instância Evolution, as edges podem estar autenticando com chave antiga. **Validar qual valor a instância Evolution aceita e alinhar.**

---

## 69. Vault (Supabase)

- `SELECT count(*) FROM vault.secrets` → **30** secrets (schemas `vault` e `pgsodium` presentes).
- Nomes (somente nomes): `deepseek_api_key`, `email_sender_secret`, `evolution_api_key`, `evolution_api_url`, `evolution_instance_name`, `evolution_pg_password`, `evolution_postgres_dsn`, `evolution_postgres_password`, `evolution_webhook_secret`, `gmail_pubsub_token`, `leadcontact_bearer_token`, `lusha_api_key_v3`, `minio_access_key`, `minio_endpoint_internal`, `minio_endpoint_public`, `minio_media_bucket`, `minio_root_password`, `minio_root_user`, `minio_s3_api_endpoint`, `portainer_api_key`, `r2_access_key`, `r2_bucket_media`, `r2_endpoint`, `r2_secret_key`, `smtp_from_name`, `smtp_host`, `smtp_password`, `smtp_port`, `smtp_user`, `webhook_secret_evolution`.
- Função `fn_get_vault_secret` (schema zapp) **existe** ✅ — usada por `_shared/vault.ts` (getSecret com cache 60s e fallback env).
- **Uso no código** (`getSecret('...')`): `gmail_pubsub_token` (gmail-webhook), `openai_api_key` (evolution-chatbot, evolution-sentiment), `anthropic_api_key` (evolution-chatbot), `hf_api_token` (audio-transcribe), `bitrix_webhook_url` (evolution-bitrix-sync).
- **Cruzamento:** apenas `gmail_pubsub_token` existe no vault ✅. **AUSENTES do vault:** `openai_api_key`, `anthropic_api_key`, `hf_api_token`, `bitrix_webhook_url` → fallback de IA (chatbot/sentiment), transcrição HF e sync Bitrix sem credencial.
- Os 25 nomes restantes do vault são consumidos fora das edges (infra: minio/r2/smtp/evolution/portainer) — não há referência `getSecret` no repo para eles (usados por outros serviços da VPS).

---

## 70. Hardcoded (P0 higiene)

Varredura `src/` + `supabase/functions/` (*.ts/*.js) com padrões `sk-[A-Za-z0-9]{20,}`, `AKIA[0-9A-Z]{16}`, JWT `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\....\....`:

- **1 hit, FALSO POSITIVO (teste):** `supabase/functions/_shared/__tests__/log-sanitizer.test.ts:112` — fixture fake `eyJhbG...` (prefixo 12 chars: `eyJhbGciOiJIU`) usado em teste de sanitização de logs. **Nenhum segredo real hardcoded encontrado.** ✅
- `.gitleaks.toml` presente na raiz (gate adicional) ✅.

---

## 71. Rotação / idade

| Item | Evidência | Status |
|---|---|---|
| Anon key (kong/functions) | payload: `role=anon, iss=supabase, iat=1715050800, exp=1872817200` → **expira 2029-05-07** | ✅ válida (não expirada) |
| Sessões JWT | `GOTRUE_JWT_EXP=28800` (8h), `GOTRUE_JWT_AUD=authenticated`, issuer `https://supabase.atomicabr.com.br/auth/v1` | ✅ normal |
| Secrets versionados | `evolution_api_key_v4_20260704` (v4, datado 04/07/2026 — boa prática), `deepseek_api_key_v2` | ✅ rotação ativa para Evolution/DeepSeek |
| Secrets em `v1` sem data | `supabase_db_password_v1`, `supabase_jwt_secret_v1`, `supabase_service_key_v1`, `gmail_smtp_password_v1`, `kong_dashboard_password_v1` | ⏳ **agendar rotação v2** (especialmente após corrigir R-01) |
| `.env.example` | placeholders apenas (`META_TOKEN=` vazio, sem valor real) | ✅ OK |

**Nenhum token expirado encontrado.** Runbook `infra/runbooks/SECURITY-INCIDENT-CREDENTIAL-ROTATION.md` existe (procedimento documentado).

---

## 72. Webhook / HMAC

| Segredo | Env functions | Código que usa | Status |
|---|---|---|---|
| `EVOLUTION_WEBHOOK_SECRETS` | ✅ presente (88B) | evolution-webhook (HMAC, `STRICT_MODE` default **true** — linha 40; validação com `.trim()`), connection-test | 🟢 HMAC Evolution ATIVO |
| `EVOLUTION_WEBHOOK_SECRET` (singular) | ❌ ausente | fallback → `EVOLUTION_WEBHOOK_SECRETS` (funcional) | 🟡 compat |
| `WEBHOOK_SECRET` | ❌ ausente | evolution-webhook (fallback final), recheck-webhook-signature (NÃO lê o plural → degrade), webhook-secret-status, hmac-validation | 🟡 recheck degradado |
| `ELEVENLABS_WEBHOOK_SECRET` | ❌ ausente | elevenlabs-webhook (expectedToken vazio → validação inócua) | 🔴 fail-open |
| `SLA_ALERT_WEBHOOK_SECRET` | ❌ ausente | sla-alert-forward | 🔴 sem assinatura |
| `WHATSAPP_CLOUD_APP_SECRET` | ❌ ausente | whatsapp-cloud-webhook (x-hub-signature-256; header já permitido no CORS) | 🔴 sem validação Meta |
| `GMAIL_PUBSUB_TOKEN` | ❌ env | gmail-webhook → via vault `gmail_pubsub_token` ✅ | 🟢 via vault (Gmail ainda quebrado por GOOGLE_CLIENT_*) |
| Kong | — | kong.yml: key-auth + acl (consumers `anon`, `service_role`, `DASHBOARD`/`AtomicaBR`); **sem segredo HMAC de webhook no kong** (não aplicável) | ✅ |

**Coerência:** o mecanismo HMAC do Evolution está íntegro (segredo presente + strict on + trim). Webhooks de terceiros (ElevenLabs, SLA, Meta Cloud) ficam sem verificação de assinatura pela ausência dos respectivos segredos.

---

## 73. CORS

- **Edges** (`_shared/cors.ts`): allowlist estática + patterns — inclui `https://zapp.atomicabr.com.br`, `atomicabr.com.br`, `promobrindes.com.br` (+ subdomínios), `lovable.dev` (+ previews), `supabase.com`, localhost/127.0.0.1, e o preview Vercel `zapp-web-v3-git-*-juca1.vercel.app` ✅. ACAO nunca refletido para origens fora da lista; `Vary: Origin`; headers permitidos incluem `x-hub-signature-256` (Meta).
- **GoTrue** (`GOTRUE_URI_ALLOW_LIST`): `https://whats-your-line.lovable.app`, `https://zapp.atomicabr.com.br`, `https://supabase.atomicabr.com.br`, `https://zapp-web-v3.vercel.app` — **domínio do front `zapp.atomicabr.com.br` incluído** ✅.
- **Kong** (kong.yml renderizado): plugin `cors` nas rotas auth-v1/rest-v1/graphql-v1/realtime sem `config.origins` explícito → **default `*`** (permissivo no gateway). A proteção efetiva está no allowlist das edges + key-auth/acl. Recomendação: fixar origens no kong.yml para defesa em profundidade.
- **Conclusão:** CORS do front → edges e auth OK. Nenhum domínio do front ausente.

---

## 74. Tabela consolidada SEGREDOS (esperado / encontrado / status)

| # | Segredo (nome) | Esperado em | Encontrado em | Status | Sev | Impacto (feature) | Ação |
|---|---|---|---|---|---|---|---|
| 1 | `SUPABASE_JWT_SECRET` (docker secret) | db, auth, functions, storage, realtime, kong, pooler | ✅ todos (fp `1bf6b61a…`; rest idem sem \n) | 🟢 OK | — | — | recriar sem \n (R-01) |
| 2 | Senha DB (docker secret) | db, auth, rest, storage, functions, meta, realtime, pooler | ✅ todos (mesmo valor; fp `68e9cc05…`/`b0e6e79f…` = newline) | 🟢 OK | — | — | recriar sem \n (R-01) |
| 3 | Service role key | functions, storage, kong | ✅ (fp `54bad86b…`) | 🟢 OK | — | — | recriar sem \n (R-01) |
| 4 | Anon key | functions, kong, web (build) | ✅ (fp `4a1e6ff1…`; exp 2029) | 🟢 OK | — | — | — |
| 5 | `GOTRUE_SMTP_PASS` / `gmail_smtp_password_v1` | auth | ✅ (fp `da8707c7…`) | 🟢 OK | — | e-mail transacional auth | — |
| 6 | `DEEPSEEK_API_KEY` | functions | ✅ (fp `e9854021…`) | 🟢 OK | — | IA principal | — |
| 7 | `EVOLUTION_API_KEY` | functions | ⚠️ env ≠ secret montado | 🟡 ALERTA | P2 | chamadas Evolution (16 edges) | validar/alinhar (R-02) |
| 8 | `EVOLUTION_WEBHOOK_SECRETS` | functions | ⚠️ env ≠ arquivo (HMAC ok c/ trim) | 🟡 ALERTA | P2 | HMAC webhook Evolution | validar/alinhar (R-02) |
| 9 | `AI_GATEWAY_KEY` | functions | ❌ ausente | 🔴 | P1 | ai-proxy/ai-router/gateway (8 edges) | gerar + injetar |
| 10 | `LOVABLE_API_KEY` | functions | ❌ ausente | 🔴 | P1 | bridge Lovable/IA (8 edges) | credencial 3º |
| 11 | `GOOGLE_CLIENT_ID`/`_SECRET` | functions | ❌ ausente | 🔴 | P1 | Gmail (5 edges) | credencial 3º |
| 12 | `GMAIL_PUBSUB_TOPIC`/`_TOKEN` | functions (token no vault ✅) | ❌ env | 🔴 | P1 | Gmail push | configurar topic + env |
| 13 | `MICROSOFT_CLIENT_ID`/`_SECRET`/`_REDIRECT_URI` | functions | ❌ ausente | 🔴 | P1 | Outlook OAuth | credencial 3º |
| 14 | `WHATSAPP_CLOUD_*` (3) | functions | ❌ ausente | 🔴 | P1 | WhatsApp Cloud (3 edges) | credencial Meta |
| 15 | `WHATSAPP_VERIFY_TOKEN`/`APP_SECRET` | functions | ❌ ausente | 🔴 | P1 | WhatsApp legado | credencial Meta |
| 16 | `RESEND_API_KEY` | functions | ❌ ausente | 🔴 | P1 | e-mail transacional (4 edges) | credencial 3º |
| 17 | `BITRIX_WEBHOOK_URL`/`BITRIX_PORTAL` | functions (vault ❌) | ❌ ausente | 🔴 | P1 | CRM Bitrix (2 edges) | credencial 3º |
| 18 | `SICOOB_GIFTS_URL`/`_BRIDGE_SECRET` | functions | ❌ ausente | 🔴 | P1 | fluxo SICOOB (P0-5) | credencial 3º |
| 19 | `VIRUSTOTAL_API_KEY` | functions | ❌ ausente | 🟡 | P2 | scan de mídia | credencial 3º |
| 20 | `ELEVENLABS_WEBHOOK_SECRET` | functions | ❌ ausente | 🟡 | P2 | validação webhook voz | gerar |
| 21 | `IMAP_ENCRYPTION_KEY` | functions | ❌ ausente | 🔴 | P1 | email-imap-bridge | gerar |
| 22 | `CRON_SECRET` | functions | ❌ ausente | 🟡 | P2 | crons externos (auth) | gerar |
| 23 | `HEALTH_SECRET` / `METRICS_SCRAPE_TOKEN` | functions | ❌ ausente | 🟠 | P1 | health/metrics expostos sem auth | gerar |
| 24 | `TALKX_INTERNAL_SECRET` | functions | ❌ ausente | 🟡 | P2 | talkx-control | gerar |
| 25 | `QR_ALERT_WEBHOOK_URL`/`_TOKEN` | functions | ❌ ausente | 🟡 | P2 | alerta QR | gerar |
| 26 | `SLA_ALERT_WEBHOOK_SECRET` | functions | ❌ ausente | 🟡 | P2 | sla-alert-forward | gerar |
| 27 | `EXTERNAL_SUPABASE_*` (3) | functions | ❌ ausente | 🟡 | P2 | integração Supabase externo (fallback parcial) | configurar |
| 28 | `SUPABASE_PUBLISHABLE_KEY` | functions | ❌ ausente | 🟡 | P3 | mcp edge | configurar |
| 29 | Vault secrets | vault.secrets (30) | ✅ 30 nomes; código usa 5; **4 ausentes** (openai/anthropic/hf/bitrix) | 🟡 | P2 | IA fallback, transcrição, Bitrix | popular vault |
| 30 | Hardcoded | repo | ✅ 0 real (1 fixture de teste) | 🟢 OK | — | — | — |
| 31 | Kong dashboard | kong | ✅ `kong_dashboard_password_v1` (template `{{DASHBOARD_PASSWORD}}`) | 🟢 OK | — | — | — |
| 32 | CORS | edges/auth/kong | ✅ front incluso; kong `*` | 🟡 | P3 | defesa em profundidade | fixar origens no kong.yml |

---

## Resumo executivo

1. **Núcleo consistente:** JWT secret, senha do DB, service key e anon key são os MESMOS valores em todos os serviços (verificado por fingerprints in-container + teste psql `select 1`). O "mismatch" aparente do rest era artefato de newline.
2. **R-01 (P1):** entrypoint injeta secrets com `\n` final (3 arquivos de secret com `0a`); código mitiga parcialmente com `.trim()`; consumidores sem trim podem falhar em chamadas via Kong. **Corrigir arquivos + padronizar trim.**
3. **R-02 (P2):** `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_SECRETS` no env diferem dos secrets montados — validar valor vigente na instância Evolution.
4. **~28 envs ausentes no functions** → Gmail (5 edges), WhatsApp Cloud/legado (4), e-mail transacional (4), Bitrix (2), SICOOB (2), IMAP (1), Outlook (1) **quebrados**; IA principal OK via DeepSeek (fallback OpenAI/Anthropic/gateway quebrado); health/metrics sem auth (exposição).
5. **Vault:** 30 secrets; 4 nomes usados pelo código ausentes (`openai_api_key`, `anthropic_api_key`, `hf_api_token`, `bitrix_webhook_url`).
6. **Sem hardcoded real, sem token expirado** (anon expira 2029-05-07); rotação ativa para Evolution/DeepSeek; agendar v2 para db/jwt/service keys após corrigir R-01.
7. **CORS OK** (front `zapp.atomicabr.com.br` presente em edges, GoTrue e kong routes).

---

## Evidências e limitações

- Evidência: outputs de `portainer_exec_container` (`/proc/1/environ`, `ls /run/secrets`, `sha256sum`, `wc -c`, `od`, `psql -tAc 'select 1'`), `portainer_get_container` (Config.Env/Args do rest e kong), `supabase_db_query` (vault), greps do repo.
- Limitação: container `supabase_db` não permitiu leitura de `/proc/1/environ` (permission denied) — coberto via secrets montados e teste de autenticação. Container `zapp-web-prod` sem env runtime (nginx); `VITE_*` são build-time. Envs do entrypoint não aparecem em `docker exec` (apenas PID1) — por isso a leitura foi via `/proc/1/environ`.
- Nenhuma escrita fora de `docs/reconciliation/06_segredos.md` (scripts temporários de varredura removidos).
