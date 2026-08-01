-- ═══════════════════════════════════════════════════════════════════════════════
-- INFRA-01-v2: Correções no corpo de messages_update_trigger + hardening
-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEMAS CORRIGIDOS (descobertos via validação exaustiva 367 casos 2026-08-01):
--
-- H-1 — read→played bloqueado indevidamente
--        Arm OLD.status='read': NOT IN ('deleted','failed') não incluía 'played'
--        → transição válida (abrir chat depois de ouvir) revertia para 'read'
--        FIX: NOT IN ('deleted','failed','played')
--
-- H-2 — NULL/empty status propaga silenciosamente como OLD.status
--        WHEN IS NOT DISTINCT FROM OLD.status vem ANTES do NULL guard
--        → WHEN NULL IS NOT DISTINCT FROM 'delivered' = false (não captura)
--        → mas 'IS NOT DISTINCT FROM NULL' com OLD.status=NULL seria true e
--          retornaria NULL como v_status quando deveria retornar OLD.status
--        FIX: NULL guard é o PRIMEIRO WHEN na CASE expression
--
-- C-1/C-2/C-3/DG-2 — is_deleted=false apaga deleted_at sem guard
--        WHEN NEW.is_deleted = false THEN NULL disparava em QUALQUER update
--        que enviasse is_deleted=false, mesmo:
--          · quando OLD.is_deleted já era false (no-op semântico)
--          · quando v_status='deleted' (contradição entre flag e status)
--          · quando o campo nem mudou (updates inocentes)
--        FIX: guard completo no CASE consolidado de PASSO 3
--
-- H-4 — NEW.deleted_at nunca propagado para RETURNING / triggers subsequentes
--        PASSO 5 só setava NEW.status; caller via RETURNING deleted_at
--        recebia o valor antigo do NEW (pré-trigger), não o calculado
--        FIX: NEW.deleted_at := v_new_deleted_at adicionado em PASSO 5
--
-- H-6 — zapp.trg_fn_set_transfer_ticket() sem SET search_path
--        Função SECURITY DEFINER sem search_path fixo; qualquer caller com
--        permissão SET pode injetar search_path antes do trigger disparar
--        FIX: ALTER FUNCTION com SET search_path = zapp, pg_catalog
--
-- BACKFILLS:
--   C-4: ~129 mensagens com status='deleted' mas deleted_at IS NULL
--        (view filtra WHERE deleted_at IS NULL → apareciam como não-deletadas)
--   H-5: ~15 mensagens com deleted_at NOT NULL mas status ≠ 'deleted'
--        (view as escondia mas status indica que não deveriam ser ocultas)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1: Trigger body corrigido (messages_update_trigger v4)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.messages_update_trigger()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'zapp', 'evo'
AS $function$
DECLARE
  v_status         text;
  v_new_deleted_at timestamptz;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- messages_update_trigger v4 — INFRA-01-v2 (H-1, H-2, C-1/2/3, DG-2, H-4)
  -- ═══════════════════════════════════════════════════════════════════════

  -- PASSO 1: Normalização de status
  -- NULL guard PRIMEIRO (H-2): evita que NEW.status=NULL propague via IS NOT DISTINCT FROM
  v_status := CASE
    WHEN NEW.status IS NULL OR NEW.status = ''
      THEN OLD.status
    WHEN NEW.status IS NOT DISTINCT FROM OLD.status
      THEN OLD.status
    WHEN NEW.status IN ('sending', 'retrying', 'queued', 'processing', 'scheduled')
      THEN 'pending'
    WHEN NEW.status IN ('failed_auth', 'failed_retries', 'error')
      THEN 'failed'
    WHEN NEW.status NOT IN ('received','sent','delivered','read','deleted','pending','played','failed')
      THEN 'pending'
    ELSE NEW.status
  END;

  -- PASSO 2: Progression guard
  IF v_status IS DISTINCT FROM OLD.status THEN
    IF    OLD.status = 'deleted' THEN
      v_status := OLD.status;                                      -- terminal: nada muda
    ELSIF OLD.status = 'read' AND v_status NOT IN ('deleted','failed','played') THEN
      v_status := OLD.status;                                      -- H-1: read avança para deleted/failed/played
    ELSIF OLD.status = 'played' AND v_status IN ('received','pending','sent','delivered') THEN
      v_status := OLD.status;                                      -- played não regride para estados anteriores
    ELSIF OLD.status = 'delivered' AND v_status IN ('received','pending','sent') THEN
      v_status := OLD.status;                                      -- delivered não regride
    ELSIF OLD.status = 'sent' AND v_status IN ('received','pending') THEN
      v_status := OLD.status;                                      -- sent não regride
    END IF;
  END IF;

  -- PASSO 3: Calcular novo deleted_at de forma consolidada (C-1/C-2/C-3/DG-2)
  -- ELSE OLD.deleted_at preserva o valor existente; antes era ELSE NULL (apagava tudo)
  v_new_deleted_at := CASE
    WHEN v_status = 'deleted' AND (OLD.status IS NULL OR OLD.status <> 'deleted')
      THEN now()
    WHEN NEW.is_deleted = true AND (OLD.is_deleted IS NULL OR OLD.is_deleted = false)
      THEN COALESCE(NEW.whatsapp_timestamp::timestamptz, now())
    WHEN NEW.is_deleted = false
         AND (OLD.is_deleted IS DISTINCT FROM false)
         AND v_status IS DISTINCT FROM 'deleted'
      THEN NULL
    ELSE OLD.deleted_at
  END;

  -- PASSO 4: Persistência com partition pruning via instance_name
  UPDATE evo.evolution_messages SET
    is_read    = COALESCE(NEW.is_read, OLD.is_read),
    status     = v_status,
    status_at  = CASE
                   WHEN v_status IS DISTINCT FROM OLD.status
                   THEN COALESCE(NEW.status_updated_at::timestamptz, now())
                   ELSE status_at
                 END,
    content    = CASE WHEN NEW.content IS DISTINCT FROM OLD.content THEN NEW.content ELSE content END,
    deleted_at = v_new_deleted_at,
    updated_at = now()
  WHERE id = OLD.id AND instance_name = OLD.instance_name;

  -- PASSO 5: Propagar valores normalizados para RETURNING e triggers subsequentes (H-4)
  NEW.status     := v_status;
  NEW.deleted_at := v_new_deleted_at;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2: H-6 — Fix search_path em trg_fn_set_transfer_ticket (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER FUNCTION zapp.trg_fn_set_transfer_ticket()
  SET search_path = zapp, pg_catalog;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 3: Backfill de inconsistências de dados
-- ─────────────────────────────────────────────────────────────────────────────

-- C-4: mensagens com status='deleted' mas deleted_at IS NULL
-- A view zapp.messages filtra WHERE deleted_at IS NULL, portanto essas mensagens
-- apareciam para usuários mesmo estando marcadas como deletadas.
-- Usa updated_at como proxy temporal (melhor estimativa disponível).
UPDATE evo.evolution_messages
SET
  deleted_at = updated_at,
  updated_at = now()
WHERE status = 'deleted'
  AND deleted_at IS NULL;

-- H-5: mensagens com deleted_at NOT NULL mas status ≠ 'deleted'
-- Campo deleted_at órfão; a view as ocultava indevidamente.
-- O status é o campo de verdade; limpar deleted_at restaura a visibilidade correta.
UPDATE evo.evolution_messages
SET
  deleted_at = NULL,
  updated_at = now()
WHERE deleted_at IS NOT NULL
  AND status <> 'deleted';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO — estado final esperado após esta migração:
--
--   Bug   | Antes                                  | Depois
--   ──────┼────────────────────────────────────────┼──────────────────────────
--   H-1   | read→played bloqueado                  | 'played' em NOT IN ✅
--   H-2   | NULL propaga via IS NOT DISTINCT        | NULL guard é o 1º WHEN ✅
--   C-1/2 | is_deleted=false apaga deleted_at      | Guard completo PASSO 3 ✅
--   C-3   | v_status='deleted' mas del_at zerado   | Branch ordenado por prio ✅
--   DG-2  | Updates inocentes apagam del_at        | ELSE OLD.deleted_at ✅
--   H-4   | NEW.deleted_at nunca propagado         | PASSO 5 seta ambos ✅
--   H-6   | trg_fn_set_transfer_ticket INVOKER     | SET search_path fixo ✅
--   C-4   | ~129 deleted sem deleted_at            | Backfill updated_at ✅
--   H-5   | ~15 deleted_at órfãos                  | Backfill → NULL ✅
-- ─────────────────────────────────────────────────────────────────────────────
