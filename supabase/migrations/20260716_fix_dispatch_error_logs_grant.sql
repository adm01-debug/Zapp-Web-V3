-- Fix: GRANT on rpc_list_dispatch_error_logs_cursor had wrong param count (7 vs 8).
-- The previous migration (20260712001500_cursor_pagination_optimization.sql:145) issued:
--   GRANT EXECUTE ON FUNCTION public.rpc_list_dispatch_error_logs_cursor
--     (timestamptz, timestamptz, text, text, text, integer, uuid)   ← 7 params, missing p_search text
-- PostgreSQL resolves function identity by full param type list, so that GRANT targeted a
-- non-existent signature and was effectively a no-op.  Authenticated users therefore had NO
-- EXECUTE permission on the function and every RPC call returned permission-denied.
--
-- This migration re-issues the GRANT with the correct 8-param signature.

GRANT EXECUTE ON FUNCTION public.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, text, text, text, text, integer, uuid
) TO authenticated;
