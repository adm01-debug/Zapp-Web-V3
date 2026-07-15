> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [../SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# DB -> Edge Function references (self-hosted) - cutover audit 2026-06-30

Audit of how the self-hosted Postgres invokes edge functions, to catch
references pointing at the OLD Lovable project before decommission.

## Method / baseline
- `cron.job`: 40 jobs, **0** call `/functions/v1/`, **0** use `net.http`, no
  external hosts referenced -> no cron landmine pointing at old infra.
- `supabase_functions.hooks`: **0** -> no native Database Webhooks configured.
- Extensions: `pg_cron` 1.6, `pg_net` 0.14.0 (no `http`/`wrappers`).
- 6 functions in source reference `net.http` or `/functions/v1/`.

## Findings

### LANDMINE - repoint required at cutover (GATED)
`public.notify_sicoob_on_reply` calls:
```
https://allrjhkpuscmgbsnmjlv.supabase.co/functions/v1/sicoob-bridge-reply
```
(the OLD Lovable project), with auth from
`current_setting('app.settings.service_role_key')`.

Problems for cutover:
1. URL points at the Lovable project being decommissioned.
2. GUC `app.settings.service_role_key` is **not set** (pg_settings `app.*`
   is empty) -> the call likely already fails today.
3. The `sicoob-bridge-reply` edge function must exist on the self-hosted
   runtime.

**Action (in this order - do NOT repoint before deploy, or you swap one 404
for another):**
1. Deploy `sicoob-bridge-reply` on the self-hosted edge runtime.
2. Provision the service_role for the DB call - either set the GUC
   (`ALTER DATABASE ... SET app.settings.service_role_key = '<service_role>'`)
   or refactor the function to read it from Vault. Keep it server-side only.
3. `CREATE OR REPLACE` the function repointing the host to
   `https://supabase.atomicabr.com.br/functions/v1/sicoob-bridge-reply`.

### Dynamic URL (verify separately, no literal Lovable host)
`fn_send_bitrix_alert`, `fn_escalate_critical_alerts`, `fn_reconcile_dispatch`
build the target URL at runtime (no literal http host in source). Likely
Bitrix / internal notifications rather than Lovable edge functions - confirm
the runtime value if any of them is suspected to hit old infra.

### OK
`fn_collect_restore_logs` -> `portainer.atomicabr.com.br` (self-hosted infra).

## Edge functions still needing DEPLOY VERIFICATION on self-hosted
The Deno runtime is not inspectable from Postgres. The functions invoked by
the app + this DB reference must be confirmed deployed on the self-hosted
edge runtime (via Portainer or `supabase functions list`):
- `whatsapp-webhook`, `ai-*`, `gmail-oauth/send/sync/webhook`,
  `email-oauth/send/sync/token-refresh/webhook`, `elevenlabs-voice`,
  `speech-to-text`, `fetch-whatsapp-avatar`, **`sicoob-bridge-reply`**.
