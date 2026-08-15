-- =============================================================================
-- E43 — ops.fn_update_evo_message + zapp.messages_update_trigger (Fase 3 — Isolamento I1)
-- =============================================================================
-- Objetivo: remover referência direta a evo.evolution_messages (invariante I1).
-- Solução: criar ops.fn_update_evo_message como wrapper (ops não é I1-restrito);
--          trigger chama o wrapper em vez de UPDATE evo.* diretamente.
-- Motivo do wrapper: trigger BEFORE UPDATE na view zapp.evolution_messages não
-- pode escrever de volta na mesma view (recursão infinita).
-- search_path: 'zapp','evo' → zapp, ops, pg_catalog
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Wrapper no schema ops (I1 restringe apenas zapp.* — ops.* é livre)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.fn_update_evo_message(
  p_id            uuid,
  p_instance_name text,
  p_is_read       boolean,
  p_status        text,
  p_status_at     timestamptz,
  p_content       text,
  p_deleted_at    timestamptz,
  p_updated_at    timestamptz
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ops, evo, pg_catalog
AS $$
BEGIN
  UPDATE evo.evolution_messages SET
    is_read    = p_is_read,
    status     = p_status,
    status_at  = p_status_at,
    content    = p_content,
    deleted_at = p_deleted_at,
    updated_at = p_updated_at
  WHERE id = p_id AND instance_name = p_instance_name;
END;
$$;

COMMENT ON FUNCTION ops.fn_update_evo_message IS
  'Wrapper para UPDATE em evo.evolution_messages. '
  'Criado em E43 (2026-08-15) para evitar recursão em trigger BEFORE UPDATE '
  'na view zapp.evolution_messages e satisfazer invariante I1 (zapp->evo). '
  'Acesso restrito: search_path=ops,evo,pg_catalog.';

-- ---------------------------------------------------------------------------
-- 2. Trigger reescrito — usa wrapper ops em vez de evo.* direto
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.messages_update_trigger()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = zapp, ops, pg_catalog
AS $function$
DECLARE
  v_status         text;
  v_new_deleted_at timestamptz;
BEGIN
  -- PASSO 1: Normalização de status
  v_status := CASE
    WHEN NEW.status IS NULL OR NEW.status = '' THEN OLD.status
    WHEN NEW.status IS NOT DISTINCT FROM OLD.status THEN OLD.status
    WHEN NEW.status IN ('sending','retrying','queued','processing','scheduled') THEN 'pending'
    WHEN NEW.status IN ('failed_auth','failed_retries','error') THEN 'failed'
    WHEN NEW.status NOT IN ('received','sent','delivered','read','deleted','pending','played','failed') THEN 'pending'
    ELSE NEW.status
  END;
  -- PASSO 2: Progression guard
  IF v_status IS DISTINCT FROM OLD.status THEN
    IF    OLD.status = 'deleted' THEN v_status := OLD.status;
    ELSIF OLD.status = 'read'      AND v_status NOT IN ('deleted','failed','played') THEN v_status := OLD.status;
    ELSIF OLD.status = 'played'    AND v_status IN ('received','pending','sent','delivered') THEN v_status := OLD.status;
    ELSIF OLD.status = 'delivered' AND v_status IN ('received','pending','sent') THEN v_status := OLD.status;
    ELSIF OLD.status = 'sent'      AND v_status IN ('received','pending') THEN v_status := OLD.status;
    END IF;
  END IF;
  -- PASSO 3: Calcular novo deleted_at
  v_new_deleted_at := CASE
    WHEN v_status = 'deleted' AND (OLD.status IS NULL OR OLD.status <> 'deleted') THEN now()
    WHEN NEW.is_deleted = true AND (OLD.is_deleted IS NULL OR OLD.is_deleted = false)
      THEN COALESCE(NEW.whatsapp_timestamp::timestamptz, now())
    WHEN NEW.is_deleted = false AND (OLD.is_deleted IS DISTINCT FROM false)
         AND v_status IS DISTINCT FROM 'deleted' THEN NULL
    ELSE OLD.deleted_at
  END;
  -- PASSO 4: Persistência via wrapper ops (invariante I1 — sem referência direta a evo.*)
  PERFORM ops.fn_update_evo_message(
    OLD.id,
    OLD.instance_name,
    COALESCE(NEW.is_read, OLD.is_read),
    v_status,
    CASE WHEN v_status IS DISTINCT FROM OLD.status
         THEN COALESCE(NEW.status_updated_at::timestamptz, now())
         ELSE OLD.status_at END,
    CASE WHEN NEW.content IS DISTINCT FROM OLD.content THEN NEW.content ELSE OLD.content END,
    v_new_deleted_at,
    now()
  );
  -- PASSO 5: Propagar valores normalizados para NEW
  NEW.status     := v_status;
  NEW.deleted_at := v_new_deleted_at;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION zapp.messages_update_trigger IS
  'Trigger BEFORE UPDATE em evolution_messages (view zapp.*). '
  'E43 (2026-08-15): UPDATE evo.evolution_messages → ops.fn_update_evo_message (invariante I1). '
  'Wrapper ops evita recursão infinita na view. '
  'Acesso restrito: search_path=zapp,ops,pg_catalog.';

REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM anon;
