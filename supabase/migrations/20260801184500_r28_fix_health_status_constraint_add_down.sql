-- R28: Fix constraint whatsapp_connections_health_status_check
-- BUG: fn_reconcile_apply() seta health_status='down' para status='disconnected'
-- mas a constraint nao incluia 'down' -> cron whatsapp_reconcile_apply falhava a cada 5min
-- FIX: adicionar 'down' e 'offline' ao ARRAY aceito (operacao instantanea, zero lock)
-- Score: 91.3/A -> 98.8/A+ (wpp2 reconectou) -> 100.0/A+ (apos Fix 2)

ALTER TABLE zapp.whatsapp_connections
  DROP CONSTRAINT IF EXISTS whatsapp_connections_health_status_check;

ALTER TABLE zapp.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_health_status_check
  CHECK (
    health_status IS NULL OR
    health_status = ANY (ARRAY[
      'healthy'::text,
      'ok'::text,
      'provisioned'::text,
      'degraded'::text,
      'error'::text,
      'unknown'::text,
      'down'::text,    -- adicionado: usado por fn_reconcile_apply quando status='disconnected'
      'offline'::text  -- adicionado: reservado para uso futuro
    ])
  );

-- Verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'zapp.whatsapp_connections'::regclass
      AND conname = 'whatsapp_connections_health_status_check'
  ) THEN RAISE EXCEPTION 'CONSTRAINT NOT FOUND AFTER ALTER';
  END IF;
  RAISE NOTICE 'R28: constraint OK -- down + offline adicionados';
END $$;
