-- ============================================================================
-- FIX G1 + GAPS P2/P3 — search_path, trigger check_type, views, comentários
-- ============================================================================
-- Tipo: FIX DE CONSISTÊNCIA / SEGURANÇA PREVENTIVA
--
-- G1 — BUG INTRODUZIDO EM 20260806400000 (search_path corrompido):
--   fn_retry_stuck_messages foi recriada com SET search_path = 'zapp, evo, public'
--   (aspas simples envolvendo os 3 schemas de uma vez). PostgreSQL armazena como
--   schema ÚNICO chamado "zapp, evo, public" em vez de 3 schemas separados.
--   Confirmado via proconfig: ["search_path=\"zapp, evo, public\""].
--   Não quebra queries atualmente (todas refs são fully-qualified), mas viola a
--   prática obrigatória de SECURITY DEFINER + search_path explícito.
--
-- GAP-LOG-INCOMPLETO:
--   Migration 20260806500000 adicionou coluna check_type e fez backfill histórico
--   mas as guardrails fn_check_reference_integrity e check_infrastructure NÃO
--   foram modificadas para inserir check_type em novos registros. Solução: trigger
--   BEFORE INSERT que auto-classifica via presença da chave 'n_fn_obj' no JSONB.
--   Também faz backfill dos 4 NULLs pós-migration.
--
-- GAP-SECURITY-INVOKER-7VIEWS:
--   7 views no schema zapp têm reloption security_invoker=true enquanto a
--   convenção padrão é security_invoker=on. Sinônimos booleanos em PostgreSQL
--   mas inconsistência cosmética detectada na auditoria.
--
-- G7 — COMENTÁRIO DESATUALIZADO:
--   COMMENT ON FUNCTION fn_retry_stuck_messages descreve 2 fases mas a função
--   implementada tem 3 (auto-fail, verificar fn_enqueue_message_dispatch, retry).
--
-- GAP-06 — POLICY RLS DUPLICADA:
--   audio_meme_favorites tem 2 policies idênticas (cmd=ALL, mesma qualificação):
--   auth_own_or_admin e auth_secure_29. A auth_secure_29 é duplicata de migração
--   anterior. DROP elimina redundância sem impacto funcional.
--
-- GAP-04 — COMENTÁRIO IMPRECISO (fn_toggle_user_meme_favorite):
--   Comentário afirma "auth.uid() IS NULL também é bloqueado pelo IS DISTINCT FROM"
--   — tecnicamente impreciso: NULL IS DISTINCT FROM NULL = FALSE (guard não
--   dispara). Na prática é inócuo (NOT NULL constraint na tabela + sem GRANT a
--   anon), mas o comentário pode induzir manutenção incorreta futura.
--
-- Detectados em: auditoria exaustiva 5 agentes — 2026-08-06
-- ============================================================================

-- ─── G1: Corrigir search_path de fn_retry_stuck_messages ─────────────────────
-- Sem aspas envolvendo os schemas → PostgreSQL interpreta como 3 schemas separados
ALTER FUNCTION zapp.fn_retry_stuck_messages()
  SET search_path = zapp, evo, public;

-- ─── GAP-LOG: Trigger BEFORE INSERT para auto-classificar check_type ─────────
CREATE OR REPLACE FUNCTION ops.fn_auto_classify_check_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
BEGIN
  IF NEW.check_type IS NULL THEN
    NEW.check_type := CASE
      WHEN NEW.detail ? 'n_fn_obj' THEN 'reference_integrity'
      ELSE                               'infrastructure'
    END;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ops.fn_auto_classify_check_type() IS
'Trigger BEFORE INSERT em ops._infra_check_log: preenche check_type automaticamente '
'via presença da chave n_fn_obj no JSONB (exclusiva de fn_check_reference_integrity). '
'Adicionado 2026-08-06 (GAP-LOG-DISCRIMINATOR-COMPLETO).';

DROP TRIGGER IF EXISTS trg_auto_classify_check_type ON ops._infra_check_log;

CREATE TRIGGER trg_auto_classify_check_type
  BEFORE INSERT ON ops._infra_check_log
  FOR EACH ROW
  EXECUTE FUNCTION ops.fn_auto_classify_check_type();

-- Backfill dos 4 NULLs pós-migration 20260806500000
UPDATE ops._infra_check_log
SET check_type = CASE
  WHEN detail ? 'n_fn_obj' THEN 'reference_integrity'
  ELSE                           'infrastructure'
END
WHERE check_type IS NULL;

-- ─── GAP-SECURITY-INVOKER: padronizar 7 views para security_invoker=on ────────
-- 'true' e 'on' são sinônimos booleanos em PostgreSQL, mas mantemos consistência
-- com a convenção das demais views evolution_* (security_invoker=on).
ALTER VIEW zapp.contacts                   SET (security_invoker = on);
ALTER VIEW zapp.evolution_logpatch_audit   SET (security_invoker = on);
ALTER VIEW zapp.evolution_webhook_dlq      SET (security_invoker = on);
ALTER VIEW zapp.messages                   SET (security_invoker = on);
ALTER VIEW zapp.v_improvements_status      SET (security_invoker = on);
ALTER VIEW zapp.v_perf_dashboard           SET (security_invoker = on);
ALTER VIEW zapp.v_rls_impact_preview       SET (security_invoker = on);

-- ─── G7: Atualizar comentário de fn_retry_stuck_messages (3 fases) ────────────
COMMENT ON FUNCTION zapp.fn_retry_stuck_messages() IS
'Cron a cada 10min. '
'Fase 1: marca como failed mensagens pending com retry_attempt>=3 (estado terminal). '
'Fase 2: verifica existência de zapp.fn_enqueue_message_dispatch via pg_proc. '
'Fase 3: retenta mensagens ainda elegíveis (retry_attempt<3), chamando '
'fn_enqueue_message_dispatch se disponível. '
'FIX P2 (2026-08-06, GAP-OPERACIONAL): fase de auto-fail adicionada. '
'FIX G1 (2026-08-06): search_path corrigido (sem aspas simples envolvendo schemas).';

-- ─── GAP-06: Remover policy RLS duplicada em audio_meme_favorites ────────────
-- auth_own_or_admin e auth_secure_29 são idênticas (cmd=ALL, mesma qualificação).
-- auth_secure_29 é remanescente de migração anterior redundante.
DROP POLICY IF EXISTS auth_secure_29 ON zapp.audio_meme_favorites;

-- ─── GAP-04: Corrigir comentário impreciso em fn_toggle_user_meme_favorite ────
-- NULL IS DISTINCT FROM NULL = FALSE (não bloqueia). Proteção real vem da
-- NOT NULL constraint na tabela + ausência de GRANT a anon.
COMMENT ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) IS
'FIX P1 (2026-08-06, GAP-IDOR-01): guard auth.uid() adicionado — chamador só pode '
'operar sobre seus próprios favoritos. IDOR eliminado: qualquer divergência entre '
'p_user_id e auth.uid() lança ERRCODE 42501 (insufficient_privilege). '
'NOTA: se ambos p_user_id e auth.uid() forem NULL, IS DISTINCT FROM retorna FALSE '
'(guard não dispara) — proteção real para usuários não autenticados vem da NOT NULL '
'constraint em audio_meme_favorites.user_id e da ausência de GRANT a anon.';
