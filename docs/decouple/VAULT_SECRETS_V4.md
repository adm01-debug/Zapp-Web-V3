# VAULT SECRETS V4 — Inventário Evolution (read-only)

> **Escopo:** V4-FINAL #63-64 · **Data:** 2026-08-14 · **Modo:** SOMENTE SELECT (MCP `supabase_db_query`) + grep read-only no repo (sem git).
> **Regra:** nenhum valor de secret foi selecionado/lido — apenas `name`, `created_at`, `updated_at` e referências de consumo (prosrc/env/compose).

## 1. Inventário — vault.decrypted_secrets (names %evolution%)

Fonte: `SELECT name, created_at, updated_at FROM vault.decrypted_secrets WHERE name ILIKE '%evolution%' ORDER BY name` → **10 rows** (rowCount=10, 6ms).

| # | name | created_at | updated_at | observação |
|---|---|---|---|---|
| 1 | `evolution_api_key` | 2026-05-03T21:24:47.896Z | **2026-08-09T23:40:18.532Z** | atualizado ~18min APÓS criação do `_v2` |
| 2 | `evolution_api_key_v2` | 2026-08-09T23:22:24.267Z | 2026-08-09T23:22:24.267Z | **DELETADO 2026-08-15 (dedup F6)** |
| 3 | `evolution_api_url` | 2026-05-03T21:24:47.898Z | 2026-05-03T21:24:47.898Z | estável |
| 4 | `evolution_foundation_license_key` | 2026-08-11T19:11:41.352Z | 2026-08-11T19:11:41.352Z | novo (11/08) |
| 5 | `evolution_instance_name` | 2026-05-03T21:24:47.899Z | 2026-05-03T21:24:47.899Z | estável |
| 6 | `evolution_instance_token_wpp2` | 2026-08-11T14:49:07.685Z | 2026-08-11T14:49:07.685Z | novo (11/08) |
| 7 | `evolution_pg_password` | 2026-07-11T17:14:27.239Z | 2026-07-11T17:14:27.239Z | 11/07 |
| 8 | `evolution_postgres_dsn` | 2026-05-03T21:24:47.901Z | 2026-05-03T21:24:47.901Z | estável |
| 9 | `evolution_webhook_secret` | 2026-05-03T21:24:47.904Z | 2026-05-03T21:24:47.904Z | **DELETADO 2026-08-15 (dedup F6)** |
| 10 | `webhook_secret_evolution` | 2026-06-13T14:32:55.891Z | 2026-06-13T14:32:55.891Z | nunca atualizado |

**Pares duplicados confirmados (2):**
- **PAR 1:** `evolution_api_key` ↔ `evolution_api_key_v2`
- **PAR 2:** `evolution_webhook_secret` ↔ `webhook_secret_evolution`

## 2. Mapa de consumidores — secret × consumidor (evidência)

### SQL functions vivas que leem o vault (MCP `pg_proc.prosrc ILIKE`)

| secret | função (schema) | evidência (ctx prosrc) |
|---|---|---|
| `evolution_api_key` | `ops.fn_evo_key` | `decrypted_secrets WHERE name='evolution_api_key'` |
| `evolution_api_key` | `evo.fn_detect_401_bursts` | alerta/log: "Chave atual: vault evolution_api_key" |
| `evolution_api_url` | `ops.fn_evo_url` | `decrypted_secrets WHERE name='evolution_api_url'` |
| `evolution_api_url` | `evo.fn_sync_lid_from_api` | chama `ops.fn_evo_url()` |
| `evolution_api_url` | `zapp.fn_validate_whatsapp_connection_url` | trigger: "evolution_api_url ausente no vault" |
| `evolution_pg_password` | `evo.fn_sync_guardian_heartbeat` | `name='evolution_pg_password'` (prioridade 2; fallback `_secure_config`) |
| `evolution_pg_password` | `evo.fn_cleanup_evolution_guardian_events` | mesma linhagem guardian |
| `webhook_secret_evolution` | `zapp.fn_system_health_score` | `vault.secrets WHERE name='webhook_secret_evolution'` (+10pts score) |

**Consumidores indiretos** (chamam `ops.fn_evo_key()`/`ops.fn_evo_url()` → leem `evolution_api_key`/`evolution_api_url`): `evo.fn_sync_lid_from_api`, `ops.fn_notify_critical_alerts`, `zapp.fn_health_preflight`, `zapp.fn_outbound_dispatch`, `zapp.fn_reconcile_dispatch`, `zapp.fn_validate_whatsapp_connection_url`.

### Edge functions / infra (grep repo)

| secret | consumidores (arquivo:evidência) |
|---|---|
| `evolution_api_key` | `supabase/functions/evolution-api/index.ts:36` (env `EVOLUTION_API_KEY`); `_shared/providers/evolution/client.ts:37`; `_shared/validation.ts:30,565`; `connection-test/index.ts:77`; `connection-health-check/index.ts`; `evolution-templates/index.ts`; `evolution-notification-dispatcher/index.ts:259` (fallback `getSecret('evolution_api_key')`); testes (`evolution-api/__tests__/connect-auth-errors.test.ts`, `public-api/__tests__/e2e-send.test.ts`); `.env.required:100`; `infra/supabase/docker-compose.supabase.yml:87` (env ← swarm secret `evolution_api_key_v5_20260805`); `infra/stack35/SECRETS_INVENTORY.md`; `infra/runbooks/AUDITORIA_MENSAL.md:224`; migrations `20260804190316_restore_orphaned_rpcs.sql:50`, `20260813230000_fix_notify_and_analyze_cron.sql:38`, `20260814150000_fix_fn_detect_401_bursts_dedup.sql:67,93` |
| `evolution_api_key_v2` | **nenhum consumidor no repo** (0 hits em supabase/functions, infra, scripts, db, migrations) e **0 functions SQL** |
| `evolution_api_url` | `_shared/providers/evolution/client.ts:31` (env `EVOLUTION_API_URL`); `connection-test/index.ts:90`; `connection-health-check/index.ts`; `evolution-api/index.ts:247`; `evolution-templates/index.ts`; `evolution-notification-dispatcher/index.ts:257` (`getSecret('evolution_api_url')` — lê o VAULT direto); `evolution-group-sync/index.ts:24`; `reprocess-failed-messages/__tests__/contract.test.ts`; `public-api/__tests__/e2e-send.test.ts`; `.env.required:99`; `docker-compose.supabase.yml:109` (env fixo `https://evolution.atomicabr.com.br`); `scripts/decouple/sql-gate.mjs`, `inventory.mjs`, fixtures; migrations `20260805000000_delta_724_orphaned_objects.sql:175`, `20260813230000:37`, `20260814220000_mirror_fn_validate_whatsapp_connection.sql:24` |
| `evolution_foundation_license_key` | **nenhum consumidor neste repo** (0 hits) e **0 functions SQL** → provável consumo no servidor Evolution (evolution-stack) — **NÃO VERIFICÁVEL aqui** |
| `evolution_instance_name` | `evolution-notification-dispatcher/index.ts:260` (`getSecret('evolution_instance_name')` — vault direto); `evolution-templates/index.ts`; `health/index.ts:88` (env `EVOLUTION_INSTANCE_NAME`); `.env.required:102`; `infra/stack35/SECRETS_INVENTORY.md` |
| `evolution_instance_token_wpp2` | `evolution-notification-dispatcher/index.ts:258` (`getSecret('evolution_instance_token_wpp2')` — vault direto); `evolution-group-sync/index.ts:369` (`getSecret(...) ?? env EVOLUTION_INSTANCE_TOKEN_WPP2`); `.env.required:118` |
| `evolution_pg_password` | **0 hits no repo**; 2 functions SQL vivas (guardian, acima) |
| `evolution_postgres_dsn` | **nenhum consumidor neste repo** (0 hits) e **0 functions SQL** → provável consumo no evolution-stack — **NÃO VERIFICÁVEL aqui** |
| `evolution_webhook_secret` | env `EVOLUTION_WEBHOOK_SECRET` consumido por `evolution-webhook/index.ts`, `recheck-webhook-signature/index.ts:78`, `webhook-hmac-selftest/index.ts:296-315`, `connection-test/index.ts:80`, `_shared/validation.ts:24`, `_shared/__tests__/log-sanitizer.test.ts`, `bitrix-api/SECURITY.md:14`; `.env.required:23` — **mas** a origem do env no runtime é o **swarm secret** `supabase_evolution_webhook_secret_v1` (`docker-compose.supabase.yml:87,94,552`), NÃO o vault. **0 functions SQL** leem o vault com esse nome. |
| `webhook_secret_evolution` | `zapp.fn_system_health_score` (viva, lê `vault.secrets`); linhagem em migrations `20260804000000_canonical_schema_squash_133_migrations.sql:13551` e `20260812170000_health_filter_snap_staging.sql:162` |

### Mecanismo de leitura edge→vault
`supabase/functions/_shared/vault.ts:8` — `getSecret(name)`: 1º env `NAME.toUpperCase()`, 2º vault via service-role (RPC no schema `zapp`). Ou seja, edge functions leem o vault direto quando o env não está setado (caso de `evolution_api_url`, `evolution_instance_token_wpp2`, `evolution_instance_name`, fallback `evolution_api_key`).

## 3. Recomendação de canônico (por evidência de uso real)

| Par | Canônico recomendado | Evidência |
|---|---|---|
| PAR 1: `evolution_api_key` ↔ `evolution_api_key_v2` | **`evolution_api_key`** | (1) `updated_at` mais recente (09/08 23:40 — rotação APÓS a criação do v2 às 23:22); (2) ~20 consumidores no repo (env edge, compose/swarm secret `evolution_api_key_v5_20260805`, migrations, docs); (3) functions SQL vivas: `ops.fn_evo_key` lê exatamente `name='evolution_api_key'` + 6 consumidores indiretos. `evolution_api_key_v2` tem **0 consumidores** (repo + SQL) → **órfão, candidato a remoção/arquivamento**. |
| PAR 2: `evolution_webhook_secret` ↔ `webhook_secret_evolution` | **`webhook_secret_evolution`** | (1) único do par com **consumidor vivo verificável**: `zapp.fn_system_health_score` lê `vault.secrets name='webhook_secret_evolution'` (linhagem em 2 migrations); (2) `created_at` mais recente (13/06 vs 03/05); (3) `evolution_webhook_secret` (vault) **não tem leitor direto verificado** — os consumidores `EVOLUTION_WEBHOOK_SECRET` (edge) recebem o valor do **swarm secret** `supabase_evolution_webhook_secret_v1`, não do vault. **Ressalva:** não foi possível verificar se `evolution_webhook_secret` (vault) é a fonte que alimenta o swarm secret (sincronização vault→swarm fora do escopo read-only desta auditoria) — se for, o nome do vault canônico deve seguir o leitor vivo (`webhook_secret_evolution`) e o outro pode ser arquivado após migrar a fonte. |

## 4. NÃO VERIFICÁVEL (nesta auditoria)

- **`evolution_foundation_license_key`** e **`evolution_postgres_dsn`**: 0 consumidores neste repo e 0 functions SQL → consumo provável no repositório externo `adm01-debug/evolution-stack` (fora do workspace). **NÃO VERIFICÁVEL aqui.**
- **Origem do swarm secret** `supabase_evolution_webhook_secret_v1` / `evolution_api_key_v5_20260805` (se alimentados pelo vault) — requer acesso à stack Swarm/VPS, fora do escopo read-only de repo+DB.
- **Valores/decrypt** dos secrets — propositalmente não lidos (regra da auditoria).

## 5. Desvios / ações sugeridas (V4-FINAL #63-64)

1. **`evolution_api_key_v2` órfão** → remover/arquivar (0 consumidores; canônico `evolution_api_key`).
2. **`evolution_webhook_secret` (vault) sem leitor direto** → decidir: arquivar no vault (manter só `webhook_secret_evolution`) OU documentar como fonte do swarm secret; não manter duplicidade sem consumidor.
3. **Duplicidade de nomes em camadas distintas** (vault × swarm × env) — documentar a cadeia de origem por secret para evitar drift futuro.
