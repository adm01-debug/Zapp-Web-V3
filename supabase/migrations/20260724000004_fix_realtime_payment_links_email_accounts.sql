-- No-op: superseded by 20260724000006_fix_realtime_payment_links_correct_schema.sql
--
-- This migration had two bugs that caused it to fail on fresh installs:
--   1. Tried to publish zapp.payment_links (VIEW proxy) instead of the physical
--      table financeiro.payment_links — views cannot emit WAL events.
--   2. Verification block declared `t TEXT` (scalar) but used `FOREACH t SLICE 1`
--      which requires TEXT[]; this caused a rollback of the entire transaction.
--
-- The real fix (financeiro.payment_links + email_app.email_accounts) is in 000006.
SELECT 1;
