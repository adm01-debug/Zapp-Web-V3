-- =============================================================================
-- MIGRATION: 20260703155000_bugfix_missing_columns_lovable.sql
--
-- Propósito: Sincronizar o schema do projeto cloud Lovable (uqysyzndkfiwfztbqvsl)
-- com o schema de produção self-hosted.
--
-- Problemas corrigidos:
--   1. whatsapp_connections: faltavam colunas de saúde/reconexão → 400 em
--      queries que filtram por health_status, last_health_check, etc.
--   2. evolution_send_idempotency: tabela inexistente no cloud → 404.
--   3. sla_alert_preferences: defaults nas colunas (já existe mas pode estar
--      vazia ou com NULLs).
--   4. fn_log_reconnection_attempt: RPC ausente → erro em useEvolutionAutoReconnect.
--
-- Todas as DDL são IDEMPOTENTES (IF NOT EXISTS / DO NOTHING).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. whatsapp_connections — adicionar colunas de saúde e reconexão ausentes
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- health_status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'health_status'
  ) THEN
    ALTER TABLE public.whatsapp_connections
      ADD COLUMN health_status TEXT DEFAULT 'healthy';
    COMMENT ON COLUMN public.whatsapp_connections.health_status IS
      'Estado de saúde da conexão: healthy | degraded | down';
  END IF;

  -- health_reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'health_reason'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN health_reason TEXT;
  END IF;

  -- health_response_ms
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'health_response_ms'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN health_response_ms INTEGER;
  END IF;

  -- last_health_check
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'last_health_check'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN last_health_check TIMESTAMPTZ;
  END IF;

  -- degraded_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'degraded_at'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN degraded_at TIMESTAMPTZ;
  END IF;

  -- auto_reconnect_enabled
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'auto_reconnect_enabled'
  ) THEN
    ALTER TABLE public.whatsapp_connections
      ADD COLUMN auto_reconnect_enabled BOOLEAN DEFAULT TRUE;
  END IF;

  -- loop_protection_active
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'loop_protection_active'
  ) THEN
    ALTER TABLE public.whatsapp_connections
      ADD COLUMN loop_protection_active BOOLEAN DEFAULT FALSE;
  END IF;

  -- max_reconnect_attempts
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'max_reconnect_attempts'
  ) THEN
    ALTER TABLE public.whatsapp_connections
      ADD COLUMN max_reconnect_attempts INTEGER DEFAULT 5;
  END IF;

  -- reconnect_interval_seconds
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'reconnect_interval_seconds'
  ) THEN
    ALTER TABLE public.whatsapp_connections
      ADD COLUMN reconnect_interval_seconds INTEGER DEFAULT 30;
  END IF;

  -- retry_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;

  -- max_retries
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'max_retries'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN max_retries INTEGER DEFAULT 5;
  END IF;

  -- routing_mode
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'routing_mode'
  ) THEN
    ALTER TABLE public.whatsapp_connections
      ADD COLUMN routing_mode TEXT DEFAULT 'all';
  END IF;

  -- owner_jid
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'owner_jid'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN owner_jid TEXT;
  END IF;

  -- battery_level
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'battery_level'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN battery_level INTEGER;
  END IF;

  -- is_plugged
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'is_plugged'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN is_plugged BOOLEAN;
  END IF;

  -- api_type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'api_type'
  ) THEN
    ALTER TABLE public.whatsapp_connections
      ADD COLUMN api_type TEXT DEFAULT 'evolution';
  END IF;

  -- farewell_enabled
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'farewell_enabled'
  ) THEN
    ALTER TABLE public.whatsapp_connections
      ADD COLUMN farewell_enabled BOOLEAN DEFAULT FALSE;
  END IF;

  -- farewell_message
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'farewell_message'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN farewell_message TEXT;
  END IF;

  -- connected_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'connected_at'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN connected_at TIMESTAMPTZ;
  END IF;

  -- disconnected_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'disconnected_at'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN disconnected_at TIMESTAMPTZ;
  END IF;

  -- created_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connections'
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.whatsapp_connections
      ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Índice para queries de saúde (health_status=eq.degraded&last_health_check=gte.xxx)
CREATE INDEX IF NOT EXISTS idx_wc_health_status_check
  ON public.whatsapp_connections (health_status, last_health_check)
  WHERE health_status IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. evolution_send_idempotency — tabela de deduplicação de envios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evolution_send_idempotency (
  id               BIGSERIAL PRIMARY KEY,
  idempotency_key  TEXT        NOT NULL,
  instance_name    TEXT        NOT NULL,
  contact_id       TEXT,
  message_row_id   UUID,
  status           TEXT        NOT NULL DEFAULT 'pending',
  response_body    JSONB,
  error_message    TEXT,
  attempt          INTEGER     NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  CONSTRAINT uq_evo_idempotency_key UNIQUE (idempotency_key)
);

COMMENT ON TABLE public.evolution_send_idempotency IS
  'Deduplicação cross-tab de envios Evolution. Cada (idempotency_key) representa
   um envio lógico único; retentativas verificam esta tabela antes de chamar a API.';

-- Índice para lookup rápido
CREATE INDEX IF NOT EXISTS idx_evo_idempotency_key
  ON public.evolution_send_idempotency (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_evo_idempotency_created
  ON public.evolution_send_idempotency (created_at DESC);

-- RLS
ALTER TABLE public.evolution_send_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access" ON public.evolution_send_idempotency;
CREATE POLICY "authenticated full access"
  ON public.evolution_send_idempotency
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. sla_alert_preferences — garantir defaults onde colunas são NULL
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sla_alert_preferences'
  ) THEN
    -- Adicionar coluna user_id se não existir (tabela pode ser mais antiga)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sla_alert_preferences'
      AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.sla_alert_preferences
        ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    -- Garantir defaults nas colunas booleanas
    ALTER TABLE public.sla_alert_preferences
      ALTER COLUMN enabled              SET DEFAULT TRUE,
      ALTER COLUMN alert_first_response SET DEFAULT TRUE,
      ALTER COLUMN alert_resolution     SET DEFAULT TRUE,
      ALTER COLUMN severity_warning     SET DEFAULT TRUE,
      ALTER COLUMN severity_breached    SET DEFAULT TRUE;

    -- Criar índice UNIQUE em user_id para o upsert funcionar
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'sla_alert_preferences'
      AND indexname = 'uq_sla_alert_prefs_user_id'
    ) THEN
      CREATE UNIQUE INDEX uq_sla_alert_prefs_user_id
        ON public.sla_alert_preferences (user_id);
    END IF;

    -- RLS
    ALTER TABLE public.sla_alert_preferences ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "users own their preferences" ON public.sla_alert_preferences;
    CREATE POLICY "users own their preferences"
      ON public.sla_alert_preferences
      FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. fn_log_reconnection_attempt — RPC chamada em useEvolutionAutoReconnect.ts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_log_reconnection_attempt(
  p_connection_id   UUID,
  p_attempt         INTEGER,
  p_status_before   TEXT,
  p_reason_before   TEXT    DEFAULT NULL,
  p_result          TEXT    DEFAULT 'success',
  p_error           TEXT    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Registrar na tabela de histórico se existir
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'reconnection_attempts'
  ) THEN
    INSERT INTO public.reconnection_attempts (
      connection_id, attempt_number, status_before, reason_before, result, error_message
    ) VALUES (
      p_connection_id, p_attempt, p_status_before, p_reason_before, p_result, p_error
    );
  END IF;

  -- Atualizar contador na própria conexão
  UPDATE public.whatsapp_connections
  SET
    retry_count = COALESCE(retry_count, 0) + 1,
    updated_at  = NOW()
  WHERE id = p_connection_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_log_reconnection_attempt(
  UUID, INTEGER, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. email_accounts — garantir colunas esperadas pelo frontend
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_accounts'
  ) THEN
    -- Alias 'email' → pode existir como 'email_address' no projeto mais antigo
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_accounts'
      AND column_name = 'email'
    ) THEN
      -- Adiciona coluna email como alias ou nova coluna
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'email_accounts'
        AND column_name = 'email_address'
      ) THEN
        -- Cria coluna gerada para compatibilidade
        ALTER TABLE public.email_accounts
          ADD COLUMN email TEXT GENERATED ALWAYS AS (email_address) STORED;
      ELSE
        ALTER TABLE public.email_accounts ADD COLUMN email TEXT;
      END IF;
    END IF;

    -- display_name
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_accounts'
      AND column_name = 'display_name'
    ) THEN
      ALTER TABLE public.email_accounts ADD COLUMN display_name TEXT;
    END IF;

    -- token_expiry (alias para token_expires_at se existir)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_accounts'
      AND column_name = 'token_expiry'
    ) THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'email_accounts'
        AND column_name = 'token_expires_at'
      ) THEN
        ALTER TABLE public.email_accounts
          ADD COLUMN token_expiry TIMESTAMPTZ
          GENERATED ALWAYS AS (token_expires_at) STORED;
      ELSE
        ALTER TABLE public.email_accounts ADD COLUMN token_expiry TIMESTAMPTZ;
      END IF;
    END IF;

    -- watch_expiry
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_accounts'
      AND column_name = 'watch_expiry'
    ) THEN
      ALTER TABLE public.email_accounts ADD COLUMN watch_expiry TIMESTAMPTZ;
    END IF;

    -- is_active
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_accounts'
      AND column_name = 'is_active'
    ) THEN
      ALTER TABLE public.email_accounts
        ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;

    -- last_sync_at
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_accounts'
      AND column_name = 'last_sync_at'
    ) THEN
      ALTER TABLE public.email_accounts ADD COLUMN last_sync_at TIMESTAMPTZ;
    END IF;

    -- sync_error
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_accounts'
      AND column_name = 'sync_error'
    ) THEN
      ALTER TABLE public.email_accounts ADD COLUMN sync_error TEXT;
    END IF;
  END IF;
END;
$$;

-- =============================================================================
-- Fim da migration
-- =============================================================================
