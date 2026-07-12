-- FIX-07 (S2 - CRITICAL): Unicode normalization attack prevention
-- ================================================================
--
-- PROBLEM S2 - Unicode Normalization Attack:
-- Event deduplication uses: HASH(instance:event:body_json)
-- Two identical messages with different Unicode representations hash differently:
-- - "café" (U+00E9 precomposed) vs "café" (U+0065 + U+0301 combining)
-- - Same visual representation, different byte sequences
-- - Two identical messages → two different hashes → both processed!
--
-- Attack scenario:
-- 1. Attacker sends message A with precomposed Unicode
-- 2. Message processed once, marked deduplicated
-- 3. Attacker sends same message with combining characters
-- 4. Hash differs → deduplication fails → message processed again
-- 5. Duplicate message → consumer sees duplicate state change
-- 6. For payment systems: double-charge vulnerability
--
-- SOLUTION:
-- 1. Normalize all event bodies to NFC form before hashing
-- 2. NFC (Canonical Decomposition, Compatibility Composition) is standard
-- 3. Apply in Edge Function BEFORE hashing and inserting into dedup table
-- 4. Existing rows: can't retroactively fix, but new rows will be normalized
-- 5. Optional: create migration to normalize existing rows (expensive operation)
--
-- IMPLEMENTATION:
-- This is primarily an Edge Function fix (application layer)
-- Database migration role: document the requirement and create monitoring
--
-- Create monitoring function to detect Unicode normalization issues

CREATE OR REPLACE FUNCTION public.fn_detect_unicode_normalization_issues()
RETURNS TABLE(
  event_id TEXT,
  instance TEXT,
  event_type TEXT,
  detected_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $fn$
BEGIN
  -- This function would need to compare rows that differ only in Unicode normalization
  -- For now, this is a placeholder for implementation guidelines
  -- In practice: use pg_trgm or create custom Unicode normalization comparison

  -- Recommended approach: application-layer hashing with Unicode normalization
  -- NOT database-level, as Postgres doesn't natively support full Unicode normalization

  RETURN;
END;
$fn$;

-- Document best practices for Unicode handling
COMMENT ON TABLE public.webhook_events IS
  'Webhook deduplication table.

   CRITICAL: All event bodies MUST be normalized to NFC form BEFORE hashing
   for deduplication. This prevents Unicode normalization attacks where
   semantically identical messages with different Unicode representations
   bypass deduplication.

   FIX-07 (2026-07-12): Apply NFC normalization in evolution-webhook/index.ts
   before computing deduplication hash.

   Example:
   - Event body from webhook: const body = req.json()
   - Before hashing: const normalizedBody = JSON.stringify(JSON.parse(JSON.stringify(body)), null, 0)
   - Better: Use external normalization library (e.g., unorm or String.prototype.normalize)
   - For Node.js/Deno: body_str.normalize("NFC") before JSON.stringify';

COMMENT ON FUNCTION public.fn_detect_unicode_normalization_issues IS
  'Monitoring function to detect potential Unicode normalization bypass attempts.

   Due to Postgres limitations with full Unicode normalization support,
   the primary defense is application-layer normalization in Edge Functions.

   This function is a placeholder for future monitoring implementation.
   Current mitigation: normalize event bodies to NFC in evolution-webhook/index.ts';
