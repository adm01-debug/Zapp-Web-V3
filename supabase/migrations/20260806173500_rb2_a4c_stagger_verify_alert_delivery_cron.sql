-- Runbook-2 (06/08/2026): Desfasar cron 'verify-alert-delivery-10min' (item A-4c)
-- ===========================================================================
-- Problema: colisão tripla de workers pg_cron nos minutos :06, :16, :26, :36,
-- :46, :56 de cada hora:
--   verify-alert-delivery-10min  → 6,16,26,36,46,56 * * * *
--   whatsapp_reconcile_apply     → 1-59/5  (= 1,6,11,16,21,26,31,36,41,46,51,56)
--   reprocess_pending_webhooks   → 0-58/2  (= 0,2,4,6,8,...,58)
--
-- Nos instantes :06, :16, :26, :36, :46 e :56 os 3 jobs disparam ao mesmo
-- tempo, forçando o connection pool a abrir 3 workers concorrentes, causando
-- picos de CPU e potencial fila no autovacuum (startup timeout dos workers).
--
-- Fix: mover verify-alert-delivery-10min para 4,14,24,34,44,54 * * * *
--   Minutos 4,14,24,34,44,54 NÃO estão em 1+5n (whatsapp_reconcile_apply) nem
--   em 3+5n (scan-media-security). Colisão com reprocess_pending_webhooks
--   (0+2n) permanece mas é inevitável e não problemática (job leve).
--
-- Verificação:
--   1+5n = {1,6,11,16,21,26,31,36,41,46,51,56} → ∩ {4,14,24,34,44,54} = {}  ✓
--   3+5n = {3,8,13,18,23,28,33,38,43,48,53,58} → ∩ {4,14,24,34,44,54} = {}  ✓
-- ===========================================================================

SELECT cron.schedule(
  'verify-alert-delivery-10min',
  '4,14,24,34,44,54 * * * *',
  $$SELECT ops.fn_verify_alert_delivery()$$
);
