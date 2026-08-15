-- =============================================================================
-- E43 — zapp.messages_update_trigger (Fase 3 — Isolamento I1)
-- =============================================================================
-- REWORK (2026-08-15, issue #1098): a versão original desta migration criava
-- ops.fn_update_evo_message como wrapper para `UPDATE evo.evolution_messages`,
-- chamado pelo trigger. evo.evolution_messages NÃO EXISTE em produção —
-- zapp.evolution_messages é a tabela física raiz particionada
-- (ver docs/decouple/ANALISE_FRONTEIRA_EVO_ZAPP_20260815.md).
--
-- O motivo do wrapper na versão original — "trigger BEFORE UPDATE na view
-- zapp.evolution_messages não pode escrever de volta na mesma view (recursão
-- infinita)" — não se aplica mais: zapp.evolution_messages é uma tabela física,
-- não uma view. Um trigger BEFORE UPDATE padrão que apenas atribui campos a NEW
-- e retorna NEW já persiste a mudança na própria linha sendo atualizada, sem
-- necessidade de nenhum UPDATE explícito (nem via wrapper, nem direto).
--
-- Esta migration remove o wrapper ops.fn_update_evo_message (escrevia em uma
-- relação inexistente) e reescreve o trigger para operar inteiramente via NEW,
-- eliminando a última referência a evo.evolution_messages em zapp.* — condição
-- necessária para a validação E53 (que falha com RAISE EXCEPTION ao encontrar
-- essa referência em qualquer função zapp.*) continuar passando.
-- search_path: 'zapp','evo' → zapp, pg_catalog
-- =============================================================================

DROP FUNCTION IF EXISTS ops.fn_update_evo_message(uuid, text, boolean, text, timestamptz, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION zapp.messages_update_trigger()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = zapp, pg_catalog
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
  -- PASSO 4: Persistência direta via NEW — tabela física, sem view/wrapper (invariante I1)
  NEW.is_read    := COALESCE(NEW.is_read, OLD.is_read);
  NEW.status     := v_status;
  NEW.status_at  := CASE WHEN v_status IS DISTINCT FROM OLD.status
                        THEN COALESCE(NEW.status_updated_at::timestamptz, now())
                        ELSE OLD.status_at END;
  NEW.content    := CASE WHEN NEW.content IS DISTINCT FROM OLD.content THEN NEW.content ELSE OLD.content END;
  NEW.deleted_at := v_new_deleted_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION zapp.messages_update_trigger IS
  'Trigger BEFORE UPDATE em zapp.evolution_messages (tabela física). '
  'E43 (2026-08-15, rework issue #1098): wrapper ops.fn_update_evo_message removido '
  '(escrevia em evo.evolution_messages, inexistente); persistência agora via NEW.* '
  'direto, sem UPDATE externo (invariante I1). '
  'Acesso restrito: search_path=zapp,pg_catalog.';

REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM anon;
