-- Habilita atualizações em tempo real para a tabela de alertas do war-room.
-- Necessário para que o painel de Histórico de Alertas receba INSERT/UPDATE/DELETE
-- via Supabase Realtime sem depender de polling.
ALTER TABLE public.warroom_alerts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'warroom_alerts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.warroom_alerts';
  END IF;
END $$;