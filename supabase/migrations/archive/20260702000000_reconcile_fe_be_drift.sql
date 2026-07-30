-- ============================================================
-- Reconciliacao FE<->BE (drift Lovable->canonico) - 2026-07-02
-- Versiona correcoes JA APLICADAS no banco canonico (idempotente)
-- + guard de FKs criticas que o frontend precisa (embeds PostgREST).
-- Origem: varredura estatica de 762 pontos de contato do frontend.
-- ============================================================

-- FIX 1: FK que habilita o embed role_permissions -> permissions (PostgREST 400)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='role_permissions_permission_id_fkey') THEN
    ALTER TABLE public.role_permissions
      ADD CONSTRAINT role_permissions_permission_id_fkey
      FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- FIX 2: coluna consultada pelo frontend (onboarding)
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- FIX 3: colunas faltantes em tabela REAL (whatsapp_connections)
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS auto_reconnect_enabled     boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS loop_protection_active     boolean NOT NULL DEFAULT false;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS max_reconnect_attempts     integer NOT NULL DEFAULT 5;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS reconnect_interval_seconds integer NOT NULL DEFAULT 30;

-- Recarrega o schema cache do PostgREST (necessario apos FK/coluna)
-- OBS: se NOTIFY nao surtir efeito, reiniciar o servico `rest` (visto em prod).
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- GUARD DE FKs CRITICAS (evolucao do ops.check_schema_drift)
-- Verifica FKs que o frontend usa em embeds; grava em ops.schema_drift_log.
-- ============================================================
CREATE OR REPLACE FUNCTION ops.check_critical_fks(p_raise boolean DEFAULT false)
RETURNS ops.schema_drift_log
LANGUAGE plpgsql AS $fn$
DECLARE
  v_missing text[];
  v_row ops.schema_drift_log;
BEGIN
  WITH esperadas(base,child) AS (VALUES
    ('role_permissions','permissions'),('contact_tags','contacts'),('contact_tags','tags'),
    ('sales_deals','contacts'),('sales_deals','profiles'),('conversation_events','profiles'),
    ('conversation_events','queues'),('followup_executions','followup_sequences'),
    ('followup_sequences','followup_steps'),('chatbot_executions','chatbot_flows'),
    ('automation_executions','automation_rules'),('team_conversation_members','profiles'),
    ('team_messages','profiles'),('user_roles','profiles'),('conversation_sla','contacts')
  )
  SELECT array_agg(base||' -> '||child ORDER BY base,child) INTO v_missing
  FROM esperadas e
  WHERE EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=e.base)
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint k JOIN pg_class bc ON bc.oid=k.conrelid JOIN pg_class cc ON cc.oid=k.confrelid
      WHERE k.contype='f' AND ((bc.relname=e.base AND cc.relname=e.child) OR (bc.relname=e.child AND cc.relname=e.base))
    );

  INSERT INTO ops.schema_drift_log(status, missing_tables, missing_columns, detail)
  VALUES (
    CASE WHEN COALESCE(array_length(v_missing,1),0)>0 THEN 'DRIFT' ELSE 'OK' END,
    0, COALESCE(array_length(v_missing,1),0),
    jsonb_build_object('missing_fks', to_jsonb(COALESCE(v_missing, ARRAY[]::text[])))
  ) RETURNING * INTO v_row;

  IF p_raise AND v_row.status='DRIFT' THEN
    RAISE EXCEPTION 'FKs criticas ausentes: %', v_row.detail;
  END IF;
  RETURN v_row;
END; $fn$;

COMMENT ON FUNCTION ops.check_critical_fks(boolean) IS 'Guard de FKs que o frontend usa em embeds PostgREST. Complementa ops.check_schema_drift.';
