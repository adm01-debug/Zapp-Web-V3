-- Migration: Fix missing SELECT grant on public.whatsapp_connections for authenticated role
--
-- Root cause (2026-07-05):
--   public.whatsapp_connections (BASE TABLE) had INSERT/UPDATE/DELETE grants
--   for the `authenticated` role but SELECT was inadvertently omitted.
--   PostgREST requires SELECT privilege on the table in addition to RLS
--   policies to serve GET/HEAD requests. Without it every read returned 403.
--
--   RLS policies were already correct (wconn_select_auth with qual=true).
--   This migration adds only the missing grant.
--
-- Applied directly to production at: 2026-07-05T11:35 UTC.
-- This migration ensures the fix is version-controlled and survives
-- future migrations from scratch.

GRANT SELECT ON public.whatsapp_connections TO authenticated;
