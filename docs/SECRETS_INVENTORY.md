# Inventário único de chaves e secrets — ZAPP (plano-100 etapa 15)

> **Canônico desde 2026-08-20.** Consolida os inventários parciais que coexistiam
> (`infra/stack35/SECRETS_INVENTORY.md`, `docs/CREDENTIAL_INVENTORY.md`,
> `docs/CREDENTIAL-MAP.md` e runbooks fragmentados). Os runbooks de **processo**
> continuam válidos e são referenciados na última coluna — este arquivo responde
> "**qual chave, onde vive, quando rotacionou**"; nunca contém valores.
>
> Contagens verificadas **ao vivo** em 2026-08-20 (vault via SQL; Swarm via stack
> files; GitHub via workflows).

## 1) Vault do Postgres (`vault.secrets`) — 37 secrets

Estado auditado 2026-08-20: **37 secrets, zero `DEPRECATED`, zero `minio_*`**
(a faxina da etapa 12 do plano já havia sido executada — o snapshot da auditoria
de 2026-08-20 registrava 44 com mortos).

| Grupo | Secrets (nomes) | Última atualização relevante |
|---|---|---|
| Evolution | `evolution_api_key` (**sincronizado 2026-08-20** via snapshot de `zapp.evolution_instance_credentials`), `evolution_api_url`, `evolution_instance_name`, `evolution_instance_token_wpp2`, `evolution_pg_password`, `evolution_postgres_dsn`, `evolution_foundation_license_key`, `webhook_secret_evolution` | 2026-08-20 |
| Supabase | `supabase_api_url`, `supabase_service_role_key` (v3, assinada pelo JWT secret rotacionado) | 2026-08-10 |
| R2 (Cloudflare) | `r2_access_key`, `r2_secret_key`, `r2_endpoint`, `r2_bucket_media` (rotação automatizada: stack 261 `r2-rotation`) | Onda 2 |
| SMTP/E-mail | `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `smtp_from_name`, `resend_api_key`, `resend_api_url`, `email_sender_secret` | 2026-08-11 |
| IA/voz | `deepseek_api_key`, `elevenlabs_api_key` | 2026-08-10 |
| Integrações | `leadcontact_api_url`, `leadcontact_bearer_token`, `linkedin_api_url`, `lusha_api_key_v3`, `lusha_v2_api_url`, `lusha_v3_api_url`, `gmail_pubsub_token` | 2026-08-15 |
| Infra/alertas | `portainer_api_key`, `portainer_api_url`, `n8n_bootstrap_alert_webhook`, `n8n_warroom_alert_webhook`, `health_secret`, `sicoob_bridge_edge_url` | 2026-08-15 |

Acesso em runtime: edge functions → `_shared/vault.ts` → RPC `zapp.fn_get_vault_secret`
(SECURITY DEFINER, EXECUTE só para `service_role`; materializada no repo pela
migration `20260821001500`).

## 2) Docker Swarm secrets (VPS)

| Secret | Consumidor | Observação |
|---|---|---|
| `supabase_jwt_secret_v1` | GoTrue/PostgREST/edge-runtime (stack 35) | **JWT secret próprio de 40c (`d139ca…`)** — o secret demo foi aposentado; anon v2 e service v3 assinadas por ele (reconciliação 2026-08-20) |
| `supabase_service_key_v3` / `supabase_anon_key_v2` | edge-runtime (stack 35) | rotacionadas junto com o JWT secret |
| `supabase_evolution_webhook_secret_v1` | edge-runtime (`EVOLUTION_WEBHOOK_SECRETS`, multi-versão) | rotação suportada por lista |
| `gh_runner_pat_v2` | stack 210 (6 runners) | **PAT saiu do compose em texto claro** (v4.7, 2026-08-18) — etapas 10/11 do plano resolvidas |
| `evolution_api_key_v5_20260805` (target `_v4_20260704`) | edge-runtime | padrão de rotação por alias |
| `r2_backup_access_key_v1` / `r2_backup_secret_key_v1` | stacks de backup (84/85/112/215/219) | credencial R2 de backup |
| `pg14_backup_pg_password_v1`, `backup_passphrase_dw_v1`, `backup_passphrase_monthly_v1` | backups pg14 | GPG das cópias offsite |
| `postgres_superadmin_password_v1`, `redis_password_v2` (+`redis_pw_probe_v1`), `rabbitmq_user/pass_watchdog_v1`, `pg_evolution_url_n8n_app_v1` | watchdogs ag6 (stack 232) | somente leitura/probe |

Processo de rotação: `docs/SECRETS-ROTATION-RUNBOOK.md` (padrão `_vN` + target de
alias; deploy reaplica).

## 3) GitHub Secrets (repo `adm01-debug/Zapp_Web_V3`)

| Secret | Usado por | Validação automática |
|---|---|---|
| `VITE_SUPABASE_URL` | deploy-vps.yml (build) | `check-deploy-secrets.mjs` bloqueia `*.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | deploy-vps.yml (vira anon do bundle) | preflight decodifica o JWT (barra `service_role`) **e valida aceitação no Kong (200)**; gate pré-PUT extrai a anon do bundle buildado e revalida; `bundle-secret-guard` revalida pós-deploy + diário (`ANON_KEY_REJECTED`) — blindagem tripla criada após o incidente de 2026-08-20 |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` | workflows de DB/E2E | preflight (presença) |
| `VITE_SENTRY_DSN` | deploy (bundle) | presença verificada indiretamente (DSN presente nos 3 hosts — auditado 2026-08-20) |
| `PORTAINER_API_TOKEN`, `PORTAINER_URL` | deploy (PUT stack 157) | step "Verify required secrets" |
| `ALERT_WEBHOOK_URL`, `GH_TOKEN_ACTIONS`, `META_TOKEN` (`ZAPP_META_TOKEN`) | alertas / gen-types | ⚠️ sem validação automática de presença |
| `BRANCH_PROT_PAT` | branch-protection-sentinel | sem ele o check diário degrada para warning |

## 4) Chaves públicas embutidas no bundle (não são segredo, mas são rastreadas)

| Item | Estado 2026-08-20 |
|---|---|
| Anon key (JWT `role=anon`, `exp` 2029-05-07) | idêntica nos 3 hosts (`sha256 4a1e6ff1…`), **não** assinada pelo secret demo, aceita pelo Kong (200) |
| Sentry DSN | presente nos 3 hosts; tunelado via `/sentry-tunnel` |

## 5) Regras

1. **Nunca** versionar valor de secret — apenas nomes/aliases.
2. Rotação de Swarm secret = criar `_vN+1`, apontar target, redeploy (runbook).
3. Chave nova entra **neste arquivo no mesmo PR** que a introduz.
4. `gitleaks` roda em push/PR/cron (`security.yml`) com histórico completo
   (`fetch-depth: 0`); pendências registradas no `.gitleaks.toml` (remover
   allowlists após `git filter-repo` — TODO aberto).
