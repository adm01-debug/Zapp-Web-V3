-- Migration: Create zapp VIEW proxies for _shared module tables (BUG-40)
--
-- Problem: Four tables accessed by edge-function _shared modules via clients
-- configured with db: { schema: "zapp" } have no corresponding view or table
-- in the zapp schema. PostgREST returns PGRST205 at runtime.
--
-- Affected shared modules and severity:
--
--   HIGH   _shared/send-idempotency.ts
--          lookupSendCache() / storeSendCache() → evolution_send_idempotency
--          Failure = no dedup guard → potential duplicate WhatsApp messages.
--          Source: public.evolution_send_idempotency (migration 20260423191202)
--
--   MEDIUM _shared/evolution-helpers.ts → routeToDeadLetter()
--          evolution_webhook_dlq — fail-safe (errors logged, not thrown) but
--          failed webhook events are silently lost when PGRST205 fires.
--          Source: evo.evolution_webhook_dlq (created by Evolution API)
--
--   LOW    _shared/log-idempotency-miss.ts → logIdempotencyMiss()
--          evolution_audit_log — fully try/catch swallowed; observability only.
--          Source: evo.evolution_audit_log (migration 20260703183408)
--
--   LOW    _shared/evolution-fallback-telemetry.ts → logFallbackEvent()
--          evolution_fallback_events — fully try/catch swallowed; telemetry only.
--          Source: public.evolution_fallback_events (migration 20260425200954)
--
-- All views use security_invoker=on so underlying table RLS still applies.
-- All DO blocks are idempotent: skip if target already exists as table or view.

-- ── 1. evolution_send_idempotency (HIGH) ─────────────────────────────────────
-- Source: public.evolution_send_idempotency
-- Used by: _shared/send-idempotency.ts (lookupSendCache / storeSendCache)
-- Without this view, the idempotency dedup cache silently fails → duplicate
-- WhatsApp messages can be delivered on retry.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_send_idempotency' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.evolution_send_idempotency already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_send_idempotency' AND n.nspname = 'public'
      AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.evolution_send_idempotency not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.evolution_send_idempotency
        WITH (security_invoker = on)
      AS SELECT * FROM public.evolution_send_idempotency
    $ddl$;
    RAISE NOTICE 'created zapp.evolution_send_idempotency → public.evolution_send_idempotency';
  END IF;
END;
$$;

REVOKE ALL ON zapp.evolution_send_idempotency FROM PUBLIC, anon;
GRANT ALL   ON zapp.evolution_send_idempotency TO service_role;
GRANT SELECT, INSERT ON zapp.evolution_send_idempotency TO authenticated;

-- ── 2. evolution_webhook_dlq (MEDIUM) ────────────────────────────────────────
-- Source: evo.evolution_webhook_dlq
-- Used by: _shared/evolution-helpers.ts → routeToDeadLetter()
-- Without this view, failed webhook events are silently lost instead of
-- being queued for retry in the DLQ.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_webhook_dlq' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.evolution_webhook_dlq already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_webhook_dlq' AND n.nspname = 'evo'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'source evo.evolution_webhook_dlq not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.evolution_webhook_dlq
        WITH (security_invoker = on)
      AS SELECT * FROM evo.evolution_webhook_dlq
    $ddl$;
    RAISE NOTICE 'created zapp.evolution_webhook_dlq → evo.evolution_webhook_dlq';
  END IF;
END;
$$;

REVOKE ALL ON zapp.evolution_webhook_dlq FROM PUBLIC, anon;
GRANT ALL   ON zapp.evolution_webhook_dlq TO service_role;
GRANT SELECT ON zapp.evolution_webhook_dlq TO authenticated;

-- ── 3. evolution_audit_log (LOW) ─────────────────────────────────────────────
-- Source: evo.evolution_audit_log
-- Used by: _shared/log-idempotency-miss.ts → logIdempotencyMiss()
-- Failure is fully swallowed; this is observability-only.
-- Note: public.audit_log (view created by migration 20260702190000) is a
-- different, filtered alias for the same underlying table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_audit_log' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.evolution_audit_log already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_audit_log' AND n.nspname = 'evo'
      AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source evo.evolution_audit_log not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.evolution_audit_log
        WITH (security_invoker = on)
      AS SELECT * FROM evo.evolution_audit_log
    $ddl$;
    RAISE NOTICE 'created zapp.evolution_audit_log → evo.evolution_audit_log';
  END IF;
END;
$$;

REVOKE ALL ON zapp.evolution_audit_log FROM PUBLIC, anon;
GRANT ALL    ON zapp.evolution_audit_log TO service_role;
GRANT SELECT ON zapp.evolution_audit_log TO authenticated;

-- ── 4. evolution_fallback_events (LOW) ───────────────────────────────────────
-- Source: public.evolution_fallback_events
-- Used by: _shared/evolution-fallback-telemetry.ts → logFallbackEvent()
-- Failure is fully swallowed; this is telemetry-only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_fallback_events' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.evolution_fallback_events already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_fallback_events' AND n.nspname = 'public'
      AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.evolution_fallback_events not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.evolution_fallback_events
        WITH (security_invoker = on)
      AS SELECT * FROM public.evolution_fallback_events
    $ddl$;
    RAISE NOTICE 'created zapp.evolution_fallback_events → public.evolution_fallback_events';
  END IF;
END;
$$;

REVOKE ALL ON zapp.evolution_fallback_events FROM PUBLIC, anon;
GRANT ALL    ON zapp.evolution_fallback_events TO service_role;
GRANT SELECT ON zapp.evolution_fallback_events TO authenticated;
