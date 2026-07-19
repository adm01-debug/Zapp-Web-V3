> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [../SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# DB old-reference sweep (self-hosted) - cutover readiness 2026-06-30

Full scan of DB code objects for references to the OLD Lovable project
(`allrjhkpuscmgbsnmjlv`), old anon project (`uqysyzndkfiwfztbqvsl`), any
`*.supabase.co` URL, or `lovable` tokens. **Function bodies were then read to
confirm true positives vs. benign mentions.**

## Function URL landmines

### REAL - `public.notify_sicoob_on_reply` (GATED cutover fix)
Trigger (SECURITY DEFINER) on agent replies to `sicoob_gifts` contacts. It does
a **synchronous** `extensions.http_post` to
`https://allrjhkpuscmgbsnmjlv.supabase.co/functions/v1/sicoob-bridge-reply`
with `Authorization: Bearer <current_setting('app.settings.service_role_key',
true)>`.

Issues:
1. URL points at the Lovable project being decommissioned (swap host to
   `https://supabase.atomicabr.com.br`).
2. GUC `app.settings.service_role_key` is UNSET -> empty bearer -> the edge
   function will reject the call. Provision the service_role (GUC via
   `ALTER DATABASE ... SET`, or move to Vault) - do NOT hardcode the key in the
   function body.
3. **Risk:** synchronous `http_post` that errors (404/401/timeout) can raise and
   ABORT the agent message INSERT. Wrap the call in a `BEGIN ... EXCEPTION WHEN
   OTHERS THEN ... END` block so a failed notification never blocks the reply.

Fix order at cutover: deploy `sicoob-bridge-reply` on self-hosted -> provision
service_role -> CREATE OR REPLACE with (host swapped + exception-wrapped).
Decision/owner: Pink. Safe to stage on self-hosted (DB not in prod until flip).

### NOT A LANDMINE - `public.fn_media_public_url` (verified benign)
Reading the body: it maps media URLs to the **R2 worker proxy**
`https://zapp-media-proxy.adm01.workers.dev` (your own infra). The
`allrjhkpuscmgbsnmjlv.supabase.co` branch only **passes legacy URLs through
unchanged** ('manter como esta por enquanto') - it does NOT generate Lovable
URLs. No action needed; do NOT 'fix' it (would break the R2 mapping).

(`public.fn_constraints_reference_pipeline` matched the scan but exposes no URL
- benign mention.)

## Data / config decision (not a URL repoint)
- `ai.ai_providers.provider_type` DEFAULT `'lovable_ai'` -> the default AI
  provider is Lovable's AI gateway. Confirm AI routing still works off-Lovable,
  or change the default to a directly-configured provider. Product decision.

## Views
- No old references in any view definition. View layer is clean.

## Realtime publication `supabase_realtime` - VERIFIED (28 tables)
All frontend realtime sources are published, so the realtime repoint will
deliver events:
- evo: evolution_messages, evolution_conversations, evolution_contacts,
  evolution_reactions, evolution_labels, evolution_label_associations,
  evolution_alerts, evolution_realtime_events, evolution_whatsapp_status,
  evolution_status_reactions
- zapp: queues, queue_members, queue_goals, agent_presence,
  channel_connections, conversation_transfers, transfer_comments,
  outbound_message_queue, voice_conversion_queue, qr_attempts, sales_deals
- public: profiles, app_notifications, team_messages, whatsapp_connections,
  system_health_incidents, email_health_summary, email_revalidation_jobs

## Bottom line (corrected after reading function bodies)
The DB side is cutover-ready EXCEPT ONE gated item: `notify_sicoob_on_reply`
(deploy function -> provision service_role -> repoint+exception-wrap). The media
function is fine, views are clean, realtime is verified, anon is fully locked.
