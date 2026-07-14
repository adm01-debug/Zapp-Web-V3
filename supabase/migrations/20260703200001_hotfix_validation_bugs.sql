-- =============================================================================
-- HOTFIX: 20260703200000_hotfix_validation_bugs.sql
-- Bugs encontrados na validação exaustiva pós-deploy (2026-07-03).
-- Aplicados manualmente via MCP; esta migration garante idempotência
-- quando reaplicada pelo Supabase CLI ou num ambiente novo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- BUG 1: RLS em zapp.sla_alert_preferences
-- A tabela base é em zapp.*, exposta como VIEW em public.* (repoint layer).
-- O RLS deve ser habilitado NA TABELA BASE.
-- ---------------------------------------------------------------------------
ALTER TABLE zapp.sla_alert_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='zapp'
    AND tablename='sla_alert_preferences'
    AND policyname='users_own_preferences'
  ) THEN
    EXECUTE '
      CREATE POLICY users_own_preferences
        ON zapp.sla_alert_preferences
        FOR ALL TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
    ';
  END IF;
END;
$$;

-- UNIQUE INDEX em user_id para o upsert ({onConflict: ''user_id''})
-- funcionarar corretamente (evita ERROR 42P10).
CREATE UNIQUE INDEX IF NOT EXISTS uq_zapp_sla_alert_prefs_user_id
  ON zapp.sla_alert_preferences (user_id);

-- Defaults corretos nas colunas booleanas (zapp.sla_alert_preferences
-- tinha DEFAULT false; o hook espera DEFAULT true)
ALTER TABLE zapp.sla_alert_preferences
  ALTER COLUMN enabled              SET DEFAULT true,
  ALTER COLUMN alert_first_response SET DEFAULT true,
  ALTER COLUMN alert_resolution     SET DEFAULT true,
  ALTER COLUMN severity_warning     SET DEFAULT true,
  ALTER COLUMN severity_breached    SET DEFAULT true;

-- ---------------------------------------------------------------------------
-- BUG 2: REPLICA IDENTITY em evo.evolution_messages
-- DELETE com REPLICA IDENTITY DEFAULT emite apenas PK no payload.old.
-- useRealtimeMessages.handleMessageDelete faz guard em contact_id,
-- que não vinha no payload → todos os DELETEs eram ignorados na UI.
-- ---------------------------------------------------------------------------
ALTER TABLE evo.evolution_messages REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- BUG 3: Índice (health_status, last_health_check) em whatsapp_connections
-- Migration PR#122 declarou mas o self-hosted não tinha o índice.
-- Queries de monitoramento fazem seq-scan.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wc_health_status_check
  ON public.whatsapp_connections (health_status, last_health_check)
  WHERE health_status IS NOT NULL;

-- ---------------------------------------------------------------------------
-- NOTA: evo.evolution_send_idempotency já tem RLS habilitado no self-hosted
-- com policies auth_full_access e service_full_access.
-- A migration PR#122 tentava criar a tabela do zero no cloud Lovable;
-- no self-hosted a tabela existe no schema evo.* com schema diferente.
-- Não há conflito; idempotente aqui.
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Verificação pós-aplicação
-- =============================================================================
DO $$
DECLARE
  v_rls_sla     boolean;
  v_uq_sla      boolean;
  v_replica     char;
  v_idx_health  boolean;
BEGIN
  SELECT c.relrowsecurity INTO v_rls_sla
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='zapp' AND c.relname='sla_alert_preferences';

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='zapp' AND tablename='sla_alert_preferences'
    AND indexname='uq_zapp_sla_alert_prefs_user_id'
  ) INTO v_uq_sla;

  SELECT c.relreplident INTO v_replica
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='evo' AND c.relname='evolution_messages';

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='whatsapp_connections'
    AND indexname='idx_wc_health_status_check'
  ) INTO v_idx_health;

  RAISE NOTICE 'POST-HOTFIX CHECKS:';
  RAISE NOTICE '  zapp.sla_alert_preferences RLS=%         (esperado: true)', v_rls_sla;
  RAISE NOTICE '  UNIQUE(user_id) em sla_alert_preferences=%  (esperado: true)', v_uq_sla;
  RAISE NOTICE '  evolution_messages replica_identity=%      (esperado: f=FULL)', v_replica;
  RAISE NOTICE '  idx_wc_health_status_check=%              (esperado: true)', v_idx_health;

  IF NOT (v_rls_sla AND v_uq_sla AND v_replica='f' AND v_idx_health) THEN
    RAISE WARNING 'Um ou mais checks falharam!';
  ELSE
    RAISE NOTICE 'Todos os 4 hotfixes validados com sucesso';
  END IF;
END;
$$;
