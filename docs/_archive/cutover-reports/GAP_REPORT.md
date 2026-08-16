# GAP REPORT — Lovable Cloud → Self-Hosted (schema `zapp`)

**Data:** 2026-07-16
**Auditor:** Claude Opus 4.8 (Anthropic)
**Fonte Cloud:** projeto `uqysyzndkfiwfztbqvsl` (Lovable Cloud, schema `public`)
**Destino Self-hosted:** `https://supabase.atomicabr.com.br` (schemas `zapp`, `evo`, `public`)
**Método:**
- Cloud → introspecção direta via `pg_catalog` / `information_schema` (146 tabelas, 89 funções, 415 policies, 342 índices, 10 views, 5 enums, 8 extensions, 7 buckets, 2 crons).
- Self-hosted → introspecção via PostgREST OpenAPI (`GET /rest/v1/` com `Accept-Profile: zapp|public`) + Storage API. Objetos **não expostos** ao PostgREST (triggers, policies internas, cron jobs, funções sem grant EXECUTE a `authenticated`) **não podem ser verificados** por este canal e ficam marcados como ⚠️ verificação-manual.

---

## Sumário executivo

| Categoria | Cloud | Self-hosted (zapp) | Status geral |
|---|---:|---:|---|
| **Tabelas (base)** | 146 | 721 (146 do Cloud + 575 backend) | ✅ 100 % migradas |
| **Colunas críticas** | — | — | ⚠️ 1 coluna faltando (`profiles.onboarding_status`) |
| **RPCs (chamáveis)** | ~67 | 662 | ✅ superconjunto |
| **Trigger/helper functions** | 25 (não expostas) | ⚠️ verif. manual | ⚠️ requer psql |
| **Views** | 10 | ⚠️ verif. manual | ⚠️ requer psql |
| **Enums** | 5 | ⚠️ verif. manual | ⚠️ requer psql |
| **Extensions** | 8 | ⚠️ verif. manual | ⚠️ requer psql |
| **RLS policies** | 415 | ⚠️ verif. manual | ⚠️ requer psql |
| **Índices** | 342 | ⚠️ verif. manual | ⚠️ requer psql |
| **Storage buckets** | 7 | 13 (todos Cloud + 6 extras) | ✅ 100 % migrados |
| **Cron jobs** | 2 | ⚠️ verif. manual | 🔴 1 aponta p/ URL Lovable |
| **Edge functions (repo)** | — | 124 pastas versionadas | ⚠️ deploy real não introspectável via HTTP |

### 🔴 Top 3 gaps P0 (bloqueadores / silencioso em produção)

| # | Gap | Impacto | Ação |
|---|---|---|---|
| 1 | **Cron `sicoob-outbox-drain`** roda a cada minuto no Cloud chamando `https://uqysyzndkfiwfztbqvsl.supabase.co/functions/v1/sicoob-outbox-consumer` (URL do próprio Cloud sendo desligado). Se copiado 1:1 para self-hosted sem trocar host, o consumo do outbox Sicoob **parou silenciosamente**. | Filas `sicoob_reply_outbox` acumulam sem drenagem → alertas perdidos, respostas não sincronizadas com Sicoob. | Verificar `cron.job` no VPS, trocar URL para `https://supabase.atomicabr.com.br/functions/v1/sicoob-outbox-consumer`, garantir que `sicoob-outbox-consumer` está deployada. |
| 2 | **Cron `purge_query_telemetry_daily`** (`SELECT public.purge_old_query_telemetry(30)`, todo dia às 03:00 UTC). | Se ausente no VPS, tabela `query_telemetry` cresce indefinidamente (já ~alto volume). | Verificar `cron.job` no VPS; se ausente, recriar com o mesmo schedule. |
| 3 | **Coluna `profiles.onboarding_status` existe no Cloud e NÃO existe em `zapp.profiles`** (self-hosted tem `is_online`, `onboarding_completed`, mas não `onboarding_status`). | Se algum código do frontend/RPC ler essa coluna, produz `PGRST204` / undefined. | Verificar uso em `src/**` (grep `onboarding_status`); caso usado, criar migration `ALTER TABLE zapp.profiles ADD COLUMN onboarding_status TEXT`. Caso não, remover referências. |

### 🟡 Top gaps P1 (degradação / cobertura incompleta)

| # | Gap | Impacto |
|---|---|---|
| P1-1 | **Views mascaradas** (`channel_connections_safe`, `whatsapp_connections_safe`, `whatsapp_official_credentials_safe`, `gmail_accounts_safe`, `password_reset_requests_safe`, `profiles_public`, `departments_safe`, `v_pending_transfers`, `whatsapp_connections_public`, `whatsapp_connections_agent`) — não retornam no OpenAPI de `zapp`; frontend depende delas para não vazar credenciais. | Se ausente, `useConnectionsView`, `useResetRequests`, etc., quebram com erro RLS. |
| P1-2 | **Trigger functions internas** (25 funções em Cloud: `handle_new_user`, `handle_new_user_role`, `handle_new_user_settings`, `init_agent_stats`, `auto_assign_contact`, `auto_assign_to_queue_agent`, `log_assignment_change`, `normalize_contact_phone`, `notify_sicoob_on_reply`, `prevent_profile_privilege_escalation`, `prevent_role_escalation`, `on_role_change`, `audit_role_changes`, `rate_limit_reset_requests`, `sanitize_reset_request`, `mask_channel_credentials`, `clear_qr_on_connect`, `trg_fn_set_transfer_ticket`, `update_agent_level`, `update_device_last_seen`, `update_updated_at_column`, `update_global_settings_updated_at`, `ensure_single_default_ai_provider`, `ensure_single_default_filter`, `handle_updated_at`) — não são chamadas por HTTP, portanto invisíveis ao OpenAPI. Precisam existir em `zapp` como funções + triggers correspondentes. | Se um trigger falta, novos registros no self-hosted deixam de: criar perfil automático, atribuir agente por wallet, propagar XP, sincronizar sicoob_reply_outbox, mascarar credenciais, prevenir escalonamento de role. |
| P1-3 | **RLS policies (415 no Cloud)** — não introspectáveis via PostgREST. Se o self-hosted tem RLS por schema `zapp` mas policies diferentes, o comportamento diverge silenciosamente. | Vazamento cross-tenant ou "row invisível". |
| P1-4 | **`notify_sicoob_on_reply` no Cloud aponta hard-coded para a URL antiga do Lovable** (`allrjhkpuscmgbsnmjlv.supabase.co`, ver `docs/cutover/db_old_reference_sweep.md`). Se essa versão foi copiada 1:1, o trigger do self-hosted ainda tenta chamar a URL morta e, pior, pode abortar a INSERT da mensagem se `http_post` estourar. | Envio de mensagem de agente para contato Sicoob **falha**. Ver plano de correção em `db_edge_function_references.md`. |
| P1-5 | **Extensions**: Cloud usa `pg_cron 1.6.4`, `pg_net 0.20.0`, `supabase_vault 0.3.1`, `pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `uuid-ossp 1.1`. Se VPS não tiver `supabase_vault`, `decrypt_gmail_token` / `encrypt_gmail_token` quebram. Se não tiver `pg_net`, o `net.http_post` do cron sicoob **é sintaxe inválida**. | Emails/OAuth Gmail e cron sicoob não executam. |
| P1-6 | **Índices (342 no Cloud)** — não introspectáveis via OpenAPI. Índices ausentes causam degradação silenciosa (queries lentas, timeouts). O baseline em `docs/audit/cloud-indices-list.md` (a gerar) deve ser cruzado com `pg_indexes` do VPS. | Timeouts em painéis (Failed Messages, Audit Log, Transfers). |

### 🔵 Gaps P2 (cosméticos / opcional)

- **6 buckets extras no self-hosted** (`comprovantes-financeiro`, `email-attachments`, `etiquetas-remessa`, `fechamentos`, `quarantine`, `recibos-entrega`) — legítimos, do módulo financeiro/BPM. Sem ação.
- **`contacts` +24 colunas no self-hosted**, **`messages` +25 colunas**, **`whatsapp_connections` +13 colunas** — evolução legítima do modelo interno, sem impacto no que Cloud usa.

---

## 1. Tabelas — ✅ 146/146 migradas

Cross-reference completo em `docs/audit/cloud-tables.txt` vs `docs/audit/selfhosted-zapp-tables.txt`. Diff produziu 0 tabelas Cloud ausentes em `zapp` self-hosted.

### Colunas — 1 gap encontrado

Sample de 15 tabelas críticas verificadas:

| Tabela | Cloud cols | Faltando no self-hosted | Extras no self-hosted |
|---|---:|---|---:|
| `ai_usage_logs` | 13 | — | 0 |
| `audit_logs` | 9 | — | 0 |
| `contacts` | 26 | — | +24 (address, city, country, cpf, deleted_at, external_id, first_message_at, instance_name, is_blocked, is_favorite, last_message_at, last_seen_at, metadata, position…) |
| `conversation_events` | 10 | — | 0 |
| `conversation_transfers` | 34 | — | 0 |
| `failed_messages` | 8 | — | 0 |
| `instance_registry` | 43 | — | 0 |
| `messages` | 26 | — | +25 (caption, conversation_id, direction, error_code, is_from_me, latitude/longitude, media_filename/mime/size, metadata, push_name…) |
| `notifications` | 9 | — | 0 |
| **`profiles`** | 25 | **`onboarding_status`** 🔴 | +1 (`is_online`) |
| `sicoob_contact_mapping` | 7 | — | 0 |
| `sicoob_reply_outbox` | 12 | — | 0 |
| `user_roles` | 4 | — | 0 |
| `user_settings` | 35 | — | 0 |
| `whatsapp_connections` | 26 | — | +13 (api_type, evo_instance_id, instance_name, routing_mode, settings, webhook_url…) |

Para as demais 131 tabelas, o OpenAPI confirma existência mas o diff coluna-a-coluna precisa de acesso pg direto — recomendado rodar `scripts/check-schema-drift.sh` contra a VPS.

---

## 2. Funções

| Tipo | Cloud | Verificável via OpenAPI zapp | Status |
|---|---:|---:|---|
| **RPCs chamáveis** (`GRANT EXECUTE ... TO authenticated`) | 67 | 67 | ✅ presentes (self-hosted tem 662 no total) |
| **Trigger/helper functions** (sem GRANT ou não HTTP-callable) | 25 | 0 | ⚠️ requer verificação via `pg_proc` no VPS |
| **`SECURITY DEFINER` totais** | ~85 | — | ⚠️ verificar `search_path` fixo em todas |

### Funções trigger a verificar manualmente no VPS

```sql
-- Rodar no self-hosted:
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','zapp')
  AND proname IN (
    'handle_new_user','handle_new_user_role','handle_new_user_settings',
    'init_agent_stats','auto_assign_contact','auto_assign_to_queue_agent',
    'log_assignment_change','normalize_contact_phone','notify_sicoob_on_reply',
    'prevent_profile_privilege_escalation','prevent_role_escalation',
    'on_role_change','audit_role_changes','rate_limit_reset_requests',
    'sanitize_reset_request','mask_channel_credentials','clear_qr_on_connect',
    'trg_fn_set_transfer_ticket','update_agent_level','update_device_last_seen',
    'update_updated_at_column','update_global_settings_updated_at',
    'ensure_single_default_ai_provider','ensure_single_default_filter',
    'handle_updated_at'
  );
-- Esperado: 25 linhas.
```

---

## 3. Cron Jobs — 🔴 crítico

### Cloud (2 jobs)

| Job | Schedule | Comando | Status |
|---|---|---|---|
| `purge_query_telemetry_daily` | `0 3 * * *` | `SELECT public.purge_old_query_telemetry(30);` | Precisa existir no VPS. Sem ele, `query_telemetry` cresce indefinidamente. |
| `sicoob-outbox-drain` | `* * * * *` | `net.http_post(url:='https://uqysyzndkfiwfztbqvsl.supabase.co/functions/v1/sicoob-outbox-consumer', …)` | 🔴 **URL aponta para o próprio Cloud** — se copiado tal-e-qual, hoje já bate no host que será desligado. |

### Ação

```sql
-- Rodar no VPS para inventariar crons existentes:
SELECT jobname, schedule, command, active FROM cron.job;

-- Se sicoob-outbox-drain ausente ou apontando p/ URL antiga:
SELECT cron.schedule(
  'sicoob-outbox-drain',
  '* * * * *',
  $$SELECT net.http_post(
      url := 'https://supabase.atomicabr.com.br/functions/v1/sicoob-outbox-consumer',
      headers := jsonb_build_object('Content-Type','application/json',
                                    'Authorization','Bearer '||current_setting('app.settings.service_role_key', true)),
      body := jsonb_build_object('trigger','cron')
    );$$
);

-- Se purge_query_telemetry_daily ausente:
SELECT cron.schedule(
  'purge_query_telemetry_daily','0 3 * * *',
  $$SELECT zapp.purge_old_query_telemetry(30);$$
);
```

Referência: `docs/cutover/db_edge_function_references.md` já sinalizou esse ponto em 2026-06-30.

---

## 4. Storage Buckets — ✅ 100 %

| Bucket | Cloud | Self-hosted |
|---|:-:|:-:|
| audio-memes | ✅ | ✅ |
| audio-messages | ✅ | ✅ |
| avatars | ✅ | ✅ |
| custom-emojis | ✅ | ✅ |
| stickers | ✅ | ✅ |
| team-chat-files | ✅ | ✅ |
| whatsapp-media | ✅ | ✅ |
| _(6 extras VPS)_ | — | `comprovantes-financeiro`, `email-attachments`, `etiquetas-remessa`, `fechamentos`, `quarantine`, `recibos-entrega` |

⚠️ **Objetos (arquivos) dentro dos buckets não foram migrados** — apenas metadata. Ver `supabase/migrations-from-lovable/README.md`.

---

## 5. Enums (5) — ⚠️ verificação manual

| Enum | Valores |
|---|---|
| `ai_provider_type` | lovable_ai, openai_compatible, google_gemini, custom_webhook, custom_agent |
| `app_role` | admin, supervisor, agent, special_agent, dev, manager |
| `channel_type` | whatsapp, instagram, telegram, messenger, webchat, email |
| `service_account_type` | google_sheets, google_docs, google_calendar, google_drive, dropbox |
| `warroom_alert_type` | info, warning, critical, sla_breach |

```sql
-- Verificar no VPS:
SELECT n.nspname, t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
FROM pg_type t
JOIN pg_namespace n ON n.oid=t.typnamespace
JOIN pg_enum e ON e.enumtypid=t.oid
WHERE t.typname IN ('ai_provider_type','app_role','channel_type','service_account_type','warroom_alert_type')
GROUP BY 1,2;
```

---

## 6. Extensions (8) — ⚠️ verificar

```
pg_cron 1.6.4
pg_net 0.20.0
pg_stat_statements 1.11
pg_trgm 1.6
pgcrypto 1.3
plpgsql 1.0
supabase_vault 0.3.1
uuid-ossp 1.1
```

**Crítico**: `pg_net` e `supabase_vault` são os dois com maior risco de ausência em Postgres self-hosted padrão. Se `supabase_vault` faltar → `pgp_sym_decrypt(current_setting('app.encryption_key', true))` do `decrypt_gmail_token` falha.

---

## 7. Views (10) — ⚠️ verificar

```
channel_connections_safe
departments_safe
gmail_accounts_safe
password_reset_requests_safe
profiles_public
v_pending_transfers
whatsapp_connections_agent
whatsapp_connections_public
whatsapp_connections_safe
whatsapp_official_credentials_safe
```

Todas mascaram credenciais/dados sensíveis. Se ausentes, o frontend pega dados brutos (potencial vazamento) OU o RLS bloqueia (query volta vazia).

---

## 8. RLS Policies (415) — ⚠️ verificação manual obrigatória

Não introspectáveis via OpenAPI. Snapshot completo em `docs/audit/cloud-policies-full.json` deveria ser gerado via psql direto ao Cloud. Ação recomendada:

```sql
-- Rodar no VPS e no Cloud, comparar diff:
SELECT schemaname, tablename, policyname, permissive, cmd, roles::text, qual, with_check
FROM pg_policies WHERE schemaname IN ('public','zapp')
ORDER BY 1,2,3;
```

---

## 9. Índices (342) — ⚠️ verificação manual

Já existe `scripts/check-schema-drift.sh` no repo. Ação: rodar com `DATABASE_URL` do VPS.

---

## 10. Edge Functions

**124 funções versionadas** em `supabase/functions/` (ver `docs/audit/repo-edge-functions.txt`). Não há endpoint público para listar funções deployadas no self-hosted, portanto o status real de deploy exige:

```bash
# No servidor da VPS
docker exec supabase-functions ls /home/deno/functions
# ou
supabase functions list --project-ref self
```

**Funções com dependência crítica de secret / URL externa** (verificar em `env` do runtime self-hosted):

| Função | Secret esperado | Referência |
|---|---|---|
| `sicoob-outbox-consumer` | `SICOOB_BRIDGE_URL`, `SICOOB_TOKEN` | Chamada pelo cron |
| `sicoob-bridge-reply` | Vault `app.settings.service_role_key` | Chamada por trigger `notify_sicoob_on_reply` |
| `evolution-webhook`, `evolution-sender` | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | 100 % do fluxo WhatsApp |
| `gmail-oauth`, `gmail-send`, `gmail-sync` | Google OAuth secrets + `app.encryption_key` | Integração Gmail |
| `elevenlabs-*` (7 funções) | `ELEVENLABS_API_KEY` | Voz/IA |
| `whatsapp-cloud-*` (4 funções) | `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_APP_SECRET` | WhatsApp Cloud API |
| `bitrix-api`, `evolution-bitrix-sync` | `BITRIX_WEBHOOK_URL` | CRM Bitrix |
| `sla-alert-forward` | `SLA_ALERT_ENDPOINT` | Alertas SLA |
| `client-observability` | (sem secret) | Telemetria já corrigida circuit-breaker |

---

## 11. Auth config — ⚠️ verificar manual

- Providers habilitados (email, Google, etc.)
- Redirect URLs allowlist (deve conter `https://zapp.atomicabr.com.br/*` e `https://whats-your-line.lovable.app/*`)
- Templates de e-mail (reset senha, convite, etc.)
- `supabase_vault` deve estar habilitado para `app.encryption_key` funcionar

---

## Próximos passos ordenados

1. **[P0] Rodar no VPS**: `SELECT * FROM cron.job` — confirmar existência dos 2 crons + URLs corretas.
2. **[P0] Verificar deploy** de `sicoob-outbox-consumer` e `sicoob-bridge-reply` no self-hosted (`supabase functions list` na VPS).
3. **[P0] Grep** `onboarding_status` no `src/` — se usado, migration para adicionar coluna em `zapp.profiles`.
4. **[P1] Rodar no VPS** o bloco SQL da §2 para confirmar as 25 trigger functions. Faltas → recriar via `supabase/migrations-from-lovable/03_functions.sql` (só as delta).
5. **[P1] Rodar no VPS**: `\dx` para confirmar `pg_net`, `supabase_vault`, `pgcrypto`, `pg_cron`.
6. **[P1] Rodar** `scripts/check-schema-drift.sh` com `DATABASE_URL` do VPS para diff completo de tabelas/índices.
7. **[P1] Rodar no Cloud**: dump completo de `pg_policies` → cross-check com self-hosted.
8. **[P1] Verificar `notify_sicoob_on_reply`** no VPS — corpo deve apontar para `supabase.atomicabr.com.br` **e** ter `BEGIN…EXCEPTION WHEN OTHERS…END`. Ver `docs/cutover/db_old_reference_sweep.md`.
9. **[P2] Dump dos objetos de storage** (arquivos dentro dos 7 buckets Cloud) → mirror para VPS via Storage API.
10. **[P2] Consolidar RLS policies e índices** em `docs/audit/policies-diff.md` e `docs/audit/indices-diff.md` após acesso psql ao VPS.

---

## Anexos (artefatos brutos)

- `docs/audit/cloud-tables.txt` — 146 tabelas Cloud (baseline).
- `docs/audit/cloud-functions.txt` — 89 funções Cloud.
- `docs/audit/selfhosted-zapp-tables.txt` — 721 tabelas `zapp` self-hosted.
- `docs/audit/selfhosted-zapp-rpcs.txt` — 662 RPCs `zapp` self-hosted.
- `docs/audit/selfhosted-buckets.txt` — 13 buckets self-hosted.
- `docs/audit/repo-edge-functions.txt` — 124 pastas em `supabase/functions/`.
- `docs/cutover/db_edge_function_references.md` — sweep de referências a URLs antigas (2026-06-30).
- `docs/cutover/db_old_reference_sweep.md` — landmines identificadas antes do cutover.
