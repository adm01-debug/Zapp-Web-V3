-- ═══════════════════════════════════════════════════════════════════════════════
-- INFRA-01: Consolidação de triggers INSTEAD OF na view zapp.messages
-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEMA:
--   messages_update_trigger (ativa, wired ao INSTEAD OF UPDATE em zapp.messages)
--   não tinha SECURITY DEFINER nem SET search_path — qualquer caller podia
--   injetar search_path via SET antes do UPDATE para substituir evo.evolution_messages
--   por uma tabela maliciosa. Vulnerabilidade CVE-class: privilege escalation via
--   search_path injection em trigger SECURITY INVOKER.
--
-- SOLUÇÃO:
--   1. Recriar messages_update_trigger com SECURITY DEFINER + search_path fixo.
--   2. DROP das 4 funções órfãs (não wired a nenhum trigger):
--      - messages_instead_of_update  (SECDEF mas lógica incompleta — sem progression guard)
--      - fn_normalize_message_status  (search_path=public incorreto)
--      - fn_normalize_message_direction (sem search_path)
--      - fn_preserve_message_content  (search_path=public incorreto)
--
-- FUNÇÕES NÃO ALTERADAS (já corretas):
--   - zapp.messages_instead_of_delete   → SECDEF ✅ search_path=zapp,evo ✅
--   - zapp.fn_messages_instead_of_insert → SECDEF ✅ search_path=zapp,evo ✅
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1: Corrigir messages_update_trigger (mesma lógica + SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.messages_update_trigger()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'zapp', 'evo'
AS $function$
DECLARE
  v_status     text;
  v_deleted_at timestamptz;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- messages_update_trigger v3 — INFRA-01 (+ FIX #6-DB-A + GAP-1 + BUG-1 + GAP-2)
  -- ═══════════════════════════════════════════════════════════════════════

  -- PASSO 1: Normalização de status (FIX #6-DB-A original)
  -- Converte aliases inválidos do frontend para valores canônicos
  v_status := CASE
    WHEN NEW.status IS NOT DISTINCT FROM OLD.status                                        THEN OLD.status
    WHEN NEW.status IN ('sending', 'retrying', 'queued', 'processing', 'scheduled')        THEN 'pending'
    WHEN NEW.status IN ('failed_auth', 'failed_retries', 'error')                          THEN 'failed'
    WHEN NEW.status IS NULL OR NEW.status = ''                                             THEN OLD.status
    WHEN NEW.status NOT IN ('received','sent','delivered','read','deleted','pending','played','failed')
                                                                                            THEN 'pending'
    ELSE NEW.status
  END;

  -- PASSO 2: Progression guard (GAP-1)
  -- Impede regressão de status via UPDATE direto na VIEW (ex: read→delivered, deleted→received)
  IF v_status IS DISTINCT FROM OLD.status THEN
    IF    OLD.status = 'deleted' THEN
      v_status := OLD.status;                                                    -- terminal: nada muda
    ELSIF OLD.status = 'read'      AND v_status NOT IN ('deleted','failed') THEN
      v_status := OLD.status;                                                    -- read só avança para deleted/failed
    ELSIF OLD.status = 'played'    AND v_status IN ('received','pending','sent','delivered') THEN
      v_status := OLD.status;                                                    -- played não regride para estados anteriores
    ELSIF OLD.status = 'delivered' AND v_status IN ('received','pending','sent') THEN
      v_status := OLD.status;                                                    -- delivered não regride
    ELSIF OLD.status = 'sent'      AND v_status IN ('received','pending') THEN
      v_status := OLD.status;                                                    -- sent não regride
    END IF;
  END IF;

  -- PASSO 3: deleted_at automático (GAP-2)
  -- Garante que status='deleted' sempre esconde a mensagem da view (WHERE deleted_at IS NULL)
  v_deleted_at := CASE
    WHEN v_status = 'deleted' AND (OLD.status IS NULL OR OLD.status <> 'deleted') THEN now()
    ELSE NULL
  END;

  -- PASSO 4: Persistência com partition pruning via instance_name
  UPDATE evo.evolution_messages SET
    is_read    = COALESCE(NEW.is_read, OLD.is_read),
    status     = v_status,
    status_at  = CASE
                   WHEN v_status IS DISTINCT FROM OLD.status THEN COALESCE(NEW.status_updated_at::timestamptz, now())
                   ELSE status_at
                 END,
    content    = CASE WHEN NEW.content IS DISTINCT FROM OLD.content THEN NEW.content ELSE content END,
    deleted_at = CASE
                   WHEN v_deleted_at IS NOT NULL                                                          THEN v_deleted_at
                   WHEN NEW.is_deleted = true AND (OLD.is_deleted IS NULL OR OLD.is_deleted = false)      THEN COALESCE(NEW.whatsapp_timestamp, now())
                   WHEN NEW.is_deleted = false                                                             THEN NULL
                   ELSE deleted_at
                 END,
    updated_at = now()
  WHERE id = OLD.id AND instance_name = OLD.instance_name;

  -- PASSO 5: BUG-1 fix — propagar v_status normalizado + guardado para RETURNING e trigger seguinte
  -- Sem isso: UPDATE ... RETURNING status mostra 'retrying' mas DB tem 'pending'
  NEW.status := v_status;
  RETURN NEW;
END;
$function$;

-- Trigger functions são chamadas pelo engine do trigger, não por usuários diretamente.
-- REVOKE EXECUTE de PUBLIC/authenticated é boa prática para funções SECURITY DEFINER.
REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 2: DROP das funções órfãs (não wired a nenhum trigger — confirmado via
--          pg_trigger + pg_proc antes de escrever esta migration)
-- ─────────────────────────────────────────────────────────────────────────────

-- Órfã 1: messages_instead_of_update
-- Tinha SECDEF mas lógica incompleta (sem status normalization, progression guard,
-- deleted_at, instance_name WHERE clause). Nunca foi wired ao trigger messages_instead_of_update
-- (esse trigger chama messages_update_trigger, não esta função).
DROP FUNCTION IF EXISTS zapp.messages_instead_of_update();

-- Órfã 2: fn_normalize_message_status
-- search_path=public (errado — tabelas de mensagens estão em evo).
-- Não está wired a nenhum trigger.
DROP FUNCTION IF EXISTS zapp.fn_normalize_message_status();

-- Órfã 3: fn_normalize_message_direction
-- Sem SECDEF e sem search_path. Não está wired a nenhum trigger.
DROP FUNCTION IF EXISTS zapp.fn_normalize_message_direction();

-- Órfã 4: fn_preserve_message_content
-- search_path=public (errado). Não está wired a nenhum trigger.
DROP FUNCTION IF EXISTS zapp.fn_preserve_message_content();

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO — estado final esperado para zapp.messages (INSTEAD OF triggers):
--
--   trigger                      | function                    | SECDEF | search_path
--   ─────────────────────────────┼─────────────────────────────┼────────┼─────────────
--   messages_instead_of_delete_tg| messages_instead_of_delete  |  ✅    | zapp,evo ✅
--   messages_instead_of_update   | messages_update_trigger     |  ✅    | zapp,evo ✅  ← CORRIGIDO
--   trg_messages_instead_of_insert| fn_messages_instead_of_insert| ✅   | zapp,evo ✅
-- ─────────────────────────────────────────────────────────────────────────────
