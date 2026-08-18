-- 20260817125500_decouple_fanout_v2_columns_trigger_parent
-- Espelho DB-as-source (reconstruido do estado vivo em 2026-08-18; aplicado
-- originalmente via MCP em 2026-08-17). Fanout v2:
--  * 10 colunas novas em zapp.realtime_message_fanout (espelha updates de
--    status/read/delete alem do INSERT)
--  * trigger movido das particoes filhas para o PAI particionado
--    evo.evolution_messages (AFTER INSERT OR UPDATE OF <cols>) - PG15 clona
--    automaticamente nas particoes
--  * fn upsert ON CONFLICT (id) com fallback de contact_id via
--    evo.rpc_boundary_lookup_contact_id (criada em 20260817120000)
--  * policy rt_fanout_select reescrita (admin/supervisor OU contato visivel)
-- Idempotente.

ALTER TABLE zapp.realtime_message_fanout
  ADD COLUMN IF NOT EXISTS contact_id uuid,
  ADD COLUMN IF NOT EXISTS status varchar(20),
  ADD COLUMN IF NOT EXISTS status_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_reason text,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS from_me boolean,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_read boolean,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_rt_fanout_contact_id
  ON zapp.realtime_message_fanout (contact_id);

CREATE OR REPLACE FUNCTION zapp.fn_rt_fanout_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
BEGIN
  INSERT INTO zapp.realtime_message_fanout
    (id, message_id, instance_name, remote_jid, contact_id, content, message_type,
     status, status_at, error_code, error_reason, media_url, from_me, deleted_at,
     is_read, updated_at, created_at)
  VALUES
    (NEW.id, NEW.message_id, NEW.instance_name, NEW.remote_jid,
     COALESCE(NEW.contact_id, evo.rpc_boundary_lookup_contact_id(NEW.remote_jid, NEW.instance_name)),
     NEW.content, NEW.message_type, NEW.status, NEW.status_at, NEW.error_code,
     NEW.error_reason, NEW.media_url, NEW.from_me, NEW.deleted_at,
     NEW.is_read, NEW.updated_at, NEW.created_at)
  ON CONFLICT (id) DO UPDATE SET
     status = EXCLUDED.status, status_at = EXCLUDED.status_at,
     error_code = EXCLUDED.error_code, error_reason = EXCLUDED.error_reason,
     media_url = EXCLUDED.media_url, from_me = EXCLUDED.from_me,
     deleted_at = EXCLUDED.deleted_at, is_read = EXCLUDED.is_read,
     updated_at = EXCLUDED.updated_at, content = EXCLUDED.content,
     message_type = EXCLUDED.message_type;
  RETURN NEW;
END $function$;

-- triggers por-particao da v1 saem; trigger unico no pai entra
DROP TRIGGER IF EXISTS trg_rt_fanout_wpp2 ON evo.evolution_messages_wpp2;
DROP TRIGGER IF EXISTS trg_rt_fanout_default ON evo.evolution_messages_default;
DROP TRIGGER IF EXISTS trg_rt_fanout ON evo.evolution_messages;
CREATE TRIGGER trg_rt_fanout
  AFTER INSERT OR UPDATE OF status, status_at, error_code, error_reason,
    media_url, from_me, deleted_at, is_read, contact_id, content, message_type
  ON evo.evolution_messages
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_rt_fanout_insert();

DROP POLICY IF EXISTS rt_fanout_select ON zapp.realtime_message_fanout;
CREATE POLICY rt_fanout_select ON zapp.realtime_message_fanout
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_admin_or_supervisor(auth.uid())
      OR EXISTS (
        SELECT 1 FROM evo.evolution_contacts c
        WHERE c.instance_name::text = realtime_message_fanout.instance_name
          AND c.remote_jid::text = realtime_message_fanout.remote_jid
          AND is_contact_visible_to_user(c.id, auth.uid())
      )
    )
  );
