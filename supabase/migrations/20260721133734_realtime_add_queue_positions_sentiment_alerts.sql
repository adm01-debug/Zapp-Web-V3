-- Fix: o frontend assina Realtime em zapp.queue_positions e zapp.sentiment_alerts
-- (postgres_changes), mas essas tabelas NÃO estavam na publication supabase_realtime.
-- Resultado: as subscriptions eram no-op silencioso (nunca chegavam eventos).
--
-- Ambas são tabelas físicas (relkind='r'), então podem ser publicadas.
-- REPLICA IDENTITY FULL: garante que eventos UPDATE/DELETE carreguem a linha antiga
-- e permitam filtros por colunas não-PK (recomendação do Supabase Realtime).
--
-- Reversível:
--   ALTER PUBLICATION supabase_realtime DROP TABLE zapp.queue_positions, zapp.sentiment_alerts;

ALTER TABLE zapp.queue_positions  REPLICA IDENTITY FULL;
ALTER TABLE zapp.sentiment_alerts REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE zapp.queue_positions;
ALTER PUBLICATION supabase_realtime ADD TABLE zapp.sentiment_alerts;
