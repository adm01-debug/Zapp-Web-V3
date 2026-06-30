# DB old-reference sweep (self-hosted) - cutover readiness 2026-06-30

Full scan of DB code objects for references to the OLD Lovable project
(`allrjhkpuscmgbsnmjlv`), old anon project (`uqysyzndkfiwfztbqvsl`), any
`*.supabase.co` URL, or `lovable` tokens.

## Function URL landmines (repoint required - GATED on target being ready)
1. `public.notify_sicoob_on_reply`
   -> `https://allrjhkpuscmgbsnmjlv.supabase.co/functions/v1/sicoob-bridge-reply`
   Calls edge function `sicoob-bridge-reply`; auth via GUC
   `app.settings.service_role_key` which is currently UNSET.
   Fix order: deploy function on self-hosted -> provision service_role ->
   repoint URL. (See docs/cutover/db_edge_function_references.md)

2. `public.fn_media_public_url`
   -> `https://allrjhkpuscmgbsnmjlv.supabase.co` (builds PUBLIC MEDIA URLs)
   On self-hosted, media is served by MinIO/R2 (vault: `minio_endpoint_public`
   / `minio_media_bucket` / `r2_endpoint` / `r2_bucket_media`). This MUST be
   repointed to the self-hosted public media endpoint, AND the media objects
   must exist there. Do NOT repoint blind - confirm media migration + the exact
   public-URL shape first. Impacts every image/audio rendered from WhatsApp.

(`public.fn_constraints_reference_pipeline` matched the scan but exposes no
URL - benign mention; glance only.)

## Data / config decision (not a URL repoint)
- `ai.ai_providers.provider_type` DEFAULT `'lovable_ai'` -> the default AI
  provider is Lovable's AI gateway. Confirm AI routing still works off-Lovable,
  or change the default to a directly-configured provider. Needs a product
  decision + an alternative provider configured.

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

## Bottom line
The DB side is cutover-ready EXCEPT: the 2 gated function repoints
(`sicoob-bridge-reply` URL + media public-URL) and the AI-provider default
decision. No other Lovable references remain in DB code or views.
