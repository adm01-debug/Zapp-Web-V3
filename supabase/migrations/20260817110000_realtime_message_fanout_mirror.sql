-- realtime chat ao vivo: espelho fanout (realtime v2.124.2 não entrega eventos de tabelas particionadas)
-- 2026-08-17 | aplicado via MCP (DB-as-source); espelho versionado
-- | idempotente

-- 1. espelho heap regular (NUNCA particionar — limitação do realtime)
CREATE TABLE IF NOT EXISTS zapp.realtime_message_fanout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL,
  instance_name text NOT NULL,
  remote_jid text,
  content text,
  message_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rt_fanout_created ON zapp.realtime_message_fanout (created_at);
ALTER TABLE zapp.realtime_message_fanout REPLICA IDENTITY FULL;

-- 2. trigger nas partições de mensagens (espelha INSERT para o fanout)
CREATE OR REPLACE FUNCTION zapp.fn_rt_fanout_insert() RETURNS trigger AS $$
BEGIN
  INSERT INTO zapp.realtime_message_fanout (message_id, instance_name, remote_jid, content, message_type, created_at)
  VALUES (NEW.message_id, NEW.instance_name, NEW.remote_jid, NEW.content, NEW.message_type, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, pg_catalog;

DROP TRIGGER IF EXISTS trg_rt_fanout_wpp2 ON evo.evolution_messages_wpp2;
CREATE TRIGGER trg_rt_fanout_wpp2 AFTER INSERT ON evo.evolution_messages_wpp2
FOR EACH ROW EXECUTE FUNCTION zapp.fn_rt_fanout_insert();
DROP TRIGGER IF EXISTS trg_rt_fanout_default ON evo.evolution_messages_default;
CREATE TRIGGER trg_rt_fanout_default AFTER INSERT ON evo.evolution_messages_default
FOR EACH ROW EXECUTE FUNCTION zapp.fn_rt_fanout_insert();

-- 3. publication (owner postgres — rodar com RESET ROLE se a sessão aplicar SET ROLE authenticated)
ALTER PUBLICATION supabase_realtime ADD TABLE zapp.realtime_message_fanout;

-- 4. RLS: mesma lógica de visibilidade do chat
ALTER TABLE zapp.realtime_message_fanout ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rt_fanout_select ON zapp.realtime_message_fanout;
CREATE POLICY rt_fanout_select ON zapp.realtime_message_fanout FOR SELECT TO authenticated
USING (is_admin_or_supervisor(auth.uid()) OR EXISTS (
  SELECT 1 FROM evo.evolution_contacts c
  WHERE c.instance_name = zapp.realtime_message_fanout.instance_name
    AND c.remote_jid = zapp.realtime_message_fanout.remote_jid
    AND is_contact_visible_to_user(c.id, auth.uid())
));

-- 5. limpeza TTL: cron 5min apaga linhas > 10min
SELECT cron.schedule('rt-fanout-ttl', '*/5 * * * *',
  $$DELETE FROM zapp.realtime_message_fanout WHERE created_at < now() - interval '10 minutes'$$);

-- NOTA OPERACIONAL: após ALTER PUBLICATION, reiniciar o service supabase_realtime
-- (docker service update --force supabase_realtime) para o catálogo ser re-lido.
