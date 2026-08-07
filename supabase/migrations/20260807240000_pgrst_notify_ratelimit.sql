-- Migration: pgrst_notify_ratelimit
-- Objetivo: Reduzir reloads do PostgREST de ~21/hora para no máximo 1 a cada 10s.
-- Root cause: cada CREATE/ALTER FUNCTION nas migrations Lovable disparava NOTIFY pgrst
-- individualmente, causando 1.36s de introspecção por reload (1168 relações).
-- Solução: rate-limit de 10s nas funções pgrst_ddl_watch e pgrst_drop_watch.
-- Ganho estimado: de 473+ NOTIFYs/dia para ≤144 (1 a cada 10s máximo).

-- 1. Tabela de controle do rate-limit
CREATE TABLE IF NOT EXISTS extensions.pgrst_notify_ratelimit (
  id             INT PRIMARY KEY DEFAULT 1,
  last_notified  TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01'::timestamptz,
  notify_count   BIGINT NOT NULL DEFAULT 0,
  suppress_count BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO extensions.pgrst_notify_ratelimit (id) VALUES (1) ON CONFLICT DO NOTHING;

COMMENT ON TABLE extensions.pgrst_notify_ratelimit IS
  'Rate-limit para NOTIFY pgrst. Max 1 reload PostgREST a cada 10s. '
  'notify_count/suppress_count permitem observar eficácia.';

-- 2. pgrst_ddl_watch com rate-limit de 10s
CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch()
RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE
  cmd             record;
  v_should_notify BOOLEAN := false;
  v_claimed       INT;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA','ALTER SCHEMA',
      'CREATE TABLE','CREATE TABLE AS','SELECT INTO','ALTER TABLE',
      'CREATE FOREIGN TABLE','ALTER FOREIGN TABLE',
      'CREATE VIEW','ALTER VIEW',
      'CREATE MATERIALIZED VIEW','ALTER MATERIALIZED VIEW',
      'CREATE FUNCTION','ALTER FUNCTION',
      'CREATE TRIGGER',
      'CREATE TYPE','ALTER TYPE',
      'CREATE RULE',
      'COMMENT'
    ) AND cmd.schema_name IS DISTINCT FROM 'pg_temp' THEN
      v_should_notify := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_should_notify THEN RETURN; END IF;

  -- Atômica: só envia se ≥10s desde o último NOTIFY
  UPDATE extensions.pgrst_notify_ratelimit
  SET last_notified = now(), notify_count = notify_count + 1
  WHERE id = 1 AND last_notified < now() - interval '10 seconds'
  RETURNING id INTO v_claimed;

  IF v_claimed IS NOT NULL THEN
    NOTIFY pgrst, 'reload schema';
  ELSE
    UPDATE extensions.pgrst_notify_ratelimit
    SET suppress_count = suppress_count + 1 WHERE id = 1;
  END IF;
END;
$$;

-- 3. pgrst_drop_watch com o mesmo rate-limit
CREATE OR REPLACE FUNCTION extensions.pgrst_drop_watch()
RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE
  obj             record;
  v_should_notify BOOLEAN := false;
  v_claimed       INT;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects() LOOP
    IF obj.object_type IN (
      'schema','table','foreign table','view','materialized view',
      'function','trigger','type','rule'
    ) AND obj.is_temporary IS false THEN
      v_should_notify := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_should_notify THEN RETURN; END IF;

  UPDATE extensions.pgrst_notify_ratelimit
  SET last_notified = now(), notify_count = notify_count + 1
  WHERE id = 1 AND last_notified < now() - interval '10 seconds'
  RETURNING id INTO v_claimed;

  IF v_claimed IS NOT NULL THEN
    NOTIFY pgrst, 'reload schema';
  ELSE
    UPDATE extensions.pgrst_notify_ratelimit
    SET suppress_count = suppress_count + 1 WHERE id = 1;
  END IF;
END;
$$;

-- 4. Helper idempotente para CREATE POLICY (elimina DROP+CREATE churn)
-- Uso nas migrations: SELECT ops.safe_create_policy('schema','table','name','FOR SELECT...');
CREATE OR REPLACE FUNCTION ops.safe_create_policy(
  p_schema     TEXT,
  p_table      TEXT,
  p_name       TEXT,
  p_definition TEXT    -- tudo depois do nome: "FOR SELECT TO authenticated USING (...)"
)
RETURNS TEXT   -- 'created' | 'already_exists'
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' AS $$
DECLARE v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policy pc
    JOIN pg_class c ON c.oid = pc.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = p_schema AND c.relname = p_table AND pc.polname = p_name
  ) INTO v_exists;

  IF NOT v_exists THEN
    EXECUTE format('CREATE POLICY %I ON %I.%I %s', p_name, p_schema, p_table, p_definition);
    RETURN 'created';
  ELSE
    RETURN 'already_exists';  -- NOP: zero DDL, zero NOTIFY pgrst
  END IF;
END;
$$;

COMMENT ON FUNCTION ops.safe_create_policy IS
  'Idempotent CREATE POLICY. Já existe → NOP (sem NOTIFY pgrst). '
  'Padrão obrigatório para migrations que criam policies. '
  'Substitui: DROP POLICY IF EXISTS x; CREATE POLICY x ON y ...';
