-- 20260821000000_fix_fanout_insert_contact_id
--
-- REGRESSÃO INTRODUZIDA EM 20260820230000:
--   A função fn_rt_fanout_insert foi reescrita para adicionar mirrored_at, mas
--   omitiu contact_id E o campo id do INSERT. Resultado:
--     • contact_id = null em todo payload Realtime
--     • scheduleConversationCacheInvalidation(null) retorna imediatamente (no-op)
--     • o debounce de invalidação de cache — proteção central contra re-saturação
--       — nunca dispara
--     • cada trigger fire gera uma linha nova com UUID aleatório (id gerado por DEFAULT)
--       em vez de usar NEW.id; ON CONFLICT para update de status é impossível
--
-- FIX:
--   Restaura id (de NEW.id) e contact_id no INSERT, mantém mirrored_at de
--   20260820230000, e mantém ON CONFLICT (id) DO UPDATE de 20260817125500 para
--   cobrir UPDATE de status/read/delete. Idempotente.

CREATE OR REPLACE FUNCTION zapp.fn_rt_fanout_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'zapp', 'evo', 'pg_catalog'
AS $$
BEGIN
  INSERT INTO zapp.realtime_message_fanout
    (id,
     message_id, instance_name, remote_jid,
     contact_id,
     content, message_type,
     status, status_at, error_code, error_reason,
     media_url, from_me, deleted_at, is_read, updated_at,
     created_at, mirrored_at)
  VALUES
    (NEW.id,
     NEW.message_id, NEW.instance_name, NEW.remote_jid,
     COALESCE(
       NEW.contact_id,
       evo.rpc_boundary_lookup_contact_id(NEW.remote_jid, NEW.instance_name)
     ),
     NEW.content, NEW.message_type,
     NEW.status, NEW.status_at, NEW.error_code, NEW.error_reason,
     NEW.media_url, NEW.from_me, NEW.deleted_at, NEW.is_read, NEW.updated_at,
     NEW.created_at,
     now()
    )
  ON CONFLICT (id) DO UPDATE SET
    status       = EXCLUDED.status,
    status_at    = EXCLUDED.status_at,
    error_code   = EXCLUDED.error_code,
    error_reason = EXCLUDED.error_reason,
    media_url    = EXCLUDED.media_url,
    from_me      = EXCLUDED.from_me,
    deleted_at   = EXCLUDED.deleted_at,
    is_read      = EXCLUDED.is_read,
    updated_at   = EXCLUDED.updated_at,
    content      = EXCLUDED.content,
    message_type = EXCLUDED.message_type,
    contact_id   = COALESCE(EXCLUDED.contact_id, zapp.realtime_message_fanout.contact_id),
    mirrored_at  = EXCLUDED.mirrored_at;
  RETURN NEW;
END;
$$;

-- Garantir trigger no pai particionado físico (zapp.evolution_messages é a raiz
-- desde a migração evo→zapp; publish_via_partition_root=true garante que eventos
-- Realtime saem da raiz, não das partições filhas).
DROP TRIGGER IF EXISTS trg_rt_fanout ON zapp.evolution_messages;
CREATE TRIGGER trg_rt_fanout
  AFTER INSERT OR UPDATE OF
    status, status_at, error_code, error_reason,
    media_url, from_me, deleted_at, is_read,
    contact_id, content, message_type
  ON zapp.evolution_messages
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_rt_fanout_insert();

-- Remover trigger orfão se ainda existir na localização antiga (DROP IF EXISTS é seguro)
DROP TRIGGER IF EXISTS trg_rt_fanout ON evo.evolution_messages;
