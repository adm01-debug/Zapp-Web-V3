-- =============================================================================
-- HOTFIX: 20260703200000_hotfix_validation_bugs.sql
--
-- Bugs encontrados na validação exaustiva pós-deploy (2026-07-03):
--
-- BUG 1: evolution_send_idempotency sem RLS habilitado
--   O PR #122 criou a tabela no cloud Lovable com RLS, mas o self-hosted
--   já tinha a tabela com schema diferente (idem_key/path/response) e sem RLS.
--   Qualquer authenticated pode ler/escrever dados de outros tenants.
--
-- BUG 2: sla_alert_preferences sem UNIQUE INDEX em user_id
--   O hook useSLAAlertPreferences.ts chama .upsert({onConflict: 'user_id'})
--   Sem UNIQUE INDEX, PostgreSQL retorna ERROR 42P10
--   "there is no unique or exclusion constraint matching the ON CONFLICT"
--   Resultado: todo .save() de preferências SLA quebra silenciosamente.
--
-- BUG 3: evolution_messages.replica_identity = DEFAULT
--   DELETE realtime só envia PK no payload.old, não contact_id.
--   useRealtimeMessages.handleMessageDelete guarda: if (!contact_id) return
--   Resultado: DELETE realtime é IGNORADO pela UI se contact_id não vier no payload.
--   Fix: REPLICA IDENTITY FULL para evolution_messages.
--
-- BUG 4: whatsapp_connections sem índice em (health_status, last_health_check)
--   Queries de monitoramento de saúde fazem seq scan na tabela inteira.
--   O índice foi declarado na migration PR#122 mas não chegou ao self-hosted.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- BUG 1: Habilitar RLS em evolution_send_idempotency (self-hosted)
-- ---------------------------------------------------------------------------
ALTER TABLE public.evolution_send_idempotency ENABLE ROW LEVEL SECURITY;

-- Criar policy apenas se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
    AND tablename='evolution_send_idempotency'
    AND policyname='authenticated_access'
  ) THEN
    EXECUTE '
      CREATE POLICY authenticated_access
        ON public.evolution_send_idempotency
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true)
    ';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- BUG 2: UNIQUE INDEX em sla_alert_preferences.user_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Adicionar coluna user_id se não existir (já existe, mas idempotente)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sla_alert_preferences'
    AND column_name='user_id'
  ) THEN
    ALTER TABLE public.sla_alert_preferences
      ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Criar UNIQUE INDEX idempotente
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
    AND tablename='sla_alert_preferences'
    AND indexname='uq_sla_alert_prefs_user_id'
  ) THEN
    CREATE UNIQUE INDEX uq_sla_alert_prefs_user_id
      ON public.sla_alert_preferences (user_id);
  END IF;
END;
$$;

-- Habilitar RLS (idempotente)
ALTER TABLE public.sla_alert_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
    AND tablename='sla_alert_preferences'
    AND policyname='users_own_preferences'
  ) THEN
    EXECUTE '
      CREATE POLICY users_own_preferences
        ON public.sla_alert_preferences
        FOR ALL TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
    ';
  END IF;
END;
$$;

-- Adicionar defaults nas colunas booleanas (idempotente)
DO $$
BEGIN
  -- enabled
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sla_alert_preferences'
    AND column_name='enabled' AND column_default IS NULL
  ) THEN
    ALTER TABLE public.sla_alert_preferences
      ALTER COLUMN enabled SET DEFAULT true;
  END IF;
  -- alert_first_response
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sla_alert_preferences'
    AND column_name='alert_first_response' AND column_default IS NULL
  ) THEN
    ALTER TABLE public.sla_alert_preferences
      ALTER COLUMN alert_first_response SET DEFAULT true;
  END IF;
  -- alert_resolution
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sla_alert_preferences'
    AND column_name='alert_resolution' AND column_default IS NULL
  ) THEN
    ALTER TABLE public.sla_alert_preferences
      ALTER COLUMN alert_resolution SET DEFAULT true;
  END IF;
  -- severity_warning
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sla_alert_preferences'
    AND column_name='severity_warning' AND column_default IS NULL
  ) THEN
    ALTER TABLE public.sla_alert_preferences
      ALTER COLUMN severity_warning SET DEFAULT true;
  END IF;
  -- severity_breached
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sla_alert_preferences'
    AND column_name='severity_breached' AND column_default IS NULL
  ) THEN
    ALTER TABLE public.sla_alert_preferences
      ALTER COLUMN severity_breached SET DEFAULT true;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- BUG 3: REPLICA IDENTITY FULL em evo.evolution_messages
-- Para que DELETE emita contact_id no payload.old do Realtime
-- ANTES: REPLICA IDENTITY DEFAULT (só PK no payload.old)
-- DEPOIS: FULL (todas as colunas no payload.old)
-- ---------------------------------------------------------------------------
ALTER TABLE evo.evolution_messages REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- BUG 4: Índice em whatsapp_connections (health_status, last_health_check)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wc_health_status_check
  ON public.whatsapp_connections (health_status, last_health_check)
  WHERE health_status IS NOT NULL;

-- =============================================================================
-- Verificação pós-aplicação (informativa, não bloqueia)
-- =============================================================================
DO $$
DECLARE
  v_rls_evo  boolean;
  v_rls_sla  boolean;
  v_uq_sla   boolean;
  v_replica  char;
BEGIN
  SELECT c.relrowsecurity INTO v_rls_evo
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='evolution_send_idempotency';

  SELECT c.relrowsecurity INTO v_rls_sla
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='sla_alert_preferences';

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='sla_alert_preferences'
    AND indexname='uq_sla_alert_prefs_user_id'
  ) INTO v_uq_sla;

  SELECT c.relreplident INTO v_replica
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='evo' AND c.relname='evolution_messages';

  RAISE NOTICE 'POST-MIGRATION CHECK:';
  RAISE NOTICE '  evolution_send_idempotency RLS=%', v_rls_evo;
  RAISE NOTICE '  sla_alert_preferences RLS=%', v_rls_sla;
  RAISE NOTICE '  sla_alert_preferences UNIQUE(user_id)=%', v_uq_sla;
  RAISE NOTICE '  evolution_messages replica_identity=%  (esperado: f=FULL)', v_replica;

  IF NOT (v_rls_evo AND v_rls_sla AND v_uq_sla AND v_replica='f') THEN
    RAISE WARNING 'Um ou mais checks falharam - verifique acima';
  ELSE
    RAISE NOTICE 'Todos os checks passaram';
  END IF;
END;
$$;
