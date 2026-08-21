-- RCA 2026-08-20 — saturação de fila por DELETEs do fanout via cron
--
-- PROBLEMA:
--   O cron rt-fanout-ttl deletava ~972 linhas/execução (a cada 5min).
--   REPLICA IDENTITY FULL fazia o WAL serializar a linha INTEIRA em cada DELETE.
--   O Realtime entregava 972 eventos DELETE/ciclo a todos os subscribers —
--   mesmo sem listener explícito (o canal Broadcast recebe todos os tipos).
--   useRealtimeMessages.ts invalidava ['conversation-messages'] em cada DELETE,
--   disparando N refetches simultâneos → fila do semáforo saturava (cap=80) →
--   SupabaseQueueSaturatedError cascateava para todas as queries do app.
--
-- FIX:
--   1. REPLICA IDENTITY DEFAULT: DELETEs no WAL carregam apenas o PK (uuid, 16 bytes)
--      em vez da linha completa (~200+ bytes); zero impacto em INSERT/UPDATE subscribers.
--   2. Coluna mirrored_at: separa "tempo de espelhamento" de "horário da mensagem original"
--      — útil para diagnóstico e TTL semântico correto.
--   3. fn_rt_fanout_insert atualizada para popular mirrored_at.
--   4. Cron rt-fanout-ttl usa mirrored_at (mais semântico; created_at já era now() mas
--      fica preservado para filtros no consumidor Realtime que filtram por tempo de msg).
--   5. Índice em mirrored_at para o DELETE ser eficiente (seq scan em 10min de dados ≈ ok,
--      mas com índice a purga é instantânea).
--
-- Idempotente via IF NOT EXISTS / OR REPLACE / CREATE INDEX IF NOT EXISTS.

-- 1. REPLICA IDENTITY DEFAULT (só PK no WAL para DELETE)
ALTER TABLE zapp.realtime_message_fanout REPLICA IDENTITY DEFAULT;

-- 2. Adicionar coluna mirrored_at (tempo de inserção no fanout)
ALTER TABLE zapp.realtime_message_fanout
  ADD COLUMN IF NOT EXISTS mirrored_at timestamptz NOT NULL DEFAULT now();

-- 3. Índice para a purga TTL ser eficiente
CREATE INDEX IF NOT EXISTS idx_rt_fanout_mirrored ON zapp.realtime_message_fanout (mirrored_at);

-- 4. Atualizar função de trigger para popular mirrored_at
CREATE OR REPLACE FUNCTION zapp.fn_rt_fanout_insert() RETURNS trigger AS $$
BEGIN
  INSERT INTO zapp.realtime_message_fanout
    (message_id, instance_name, remote_jid, content, message_type, created_at, mirrored_at)
  VALUES
    (NEW.message_id, NEW.instance_name, NEW.remote_jid, NEW.content, NEW.message_type,
     NEW.created_at,  -- preserva created_at original da mensagem para filtros no consumidor
     now()            -- mirrored_at = instante do espelhamento
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, pg_catalog;

-- 5. Atualizar cron TTL para usar mirrored_at (semântica correta)
SELECT cron.unschedule('rt-fanout-ttl');
SELECT cron.schedule('rt-fanout-ttl', '*/5 * * * *',
  $$DELETE FROM zapp.realtime_message_fanout WHERE mirrored_at < now() - interval '10 minutes'$$);
