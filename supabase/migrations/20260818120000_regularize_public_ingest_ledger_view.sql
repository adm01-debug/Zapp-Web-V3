-- [PG14-HARDENING 2026-08-18] Regularização da view public.ingest_ledger
-- A view foi criada manualmente (sem fonte no repo) como espelho da evo.ingest_ledger.
-- A edge (evolution-webhook) insere VIA ela com client schema 'public' (PRs #1220/#1222)
-- — único caminho PostgREST para o ledger (o schema evo não é exposto no PostgREST).
-- security_invoker=false (owner-executed, comportamento atual): o INSERT verifica como
-- o owner (postgres) — os grants abaixo são para o PostgREST (service_role) e leitores.
-- Idempotente: CREATE OR REPLACE VIEW + GRANTs.
CREATE OR REPLACE VIEW public.ingest_ledger AS
SELECT id, received_at, instance_name, event_type, message_id, remote_jid,
       message_type, from_me, outcome, reject_reason, media_key_seen,
       payload_sha256, latency_ms
FROM evo.ingest_ledger;

GRANT INSERT ON public.ingest_ledger TO service_role;
GRANT SELECT ON public.ingest_ledger TO authenticated, evo_reconciler, metabase_reader, om_reader;
GRANT USAGE ON SEQUENCE evo.ingest_ledger_id_seq TO service_role;

COMMENT ON VIEW public.ingest_ledger IS
'Espelho da evo.ingest_ledger (updatable). Único caminho PostgREST para o ledger — a edge insere via ela com client schema public (PRs #1220/#1222, PG14-HARDENING 23/28). NÃO dropar sem migração substituta: o fluxo processed/rejected do ledger depende desta view.';
