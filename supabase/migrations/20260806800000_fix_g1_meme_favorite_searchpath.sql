-- ============================================================================
-- FIX G1-B — search_path corrompido em fn_toggle_user_meme_favorite(uuid, uuid)
-- ============================================================================
-- Tipo: FIX DE SEGURANÇA (search_path mal configurado — mesma classe que G1)
--
-- PROBLEMA:
--   A migration 20260806300000_fix_idor_toggle_meme_favorite.sql usou
--   SET search_path = 'zapp, auth, extensions' com aspas simples envolvendo
--   todos os schemas de uma vez. PostgreSQL armazena como schema ÚNICO chamado
--   "zapp, auth, extensions" em vez de 3 schemas separados.
--
--   Confirmado via auditoria Agente 3 (2026-08-06):
--     proconfig: ["search_path=\"zapp, auth, extensions\""]  ← ERRADO
--
--   Impacto: auth.uid() e extensões ficam inacessíveis por nome não-qualificado.
--   Na prática a função opera corretamente apenas porque todas as refs ao schema
--   auth já são plenamente qualificadas (auth.uid()), mas viola o padrão obrigatório
--   SECURITY DEFINER + search_path explícito.
--
-- CORREÇÃO:
--   ALTER FUNCTION com vírgula separando cada schema individualmente — sem aspas
--   envolvendo múltiplos schemas juntos. Equivalente a:
--     SET search_path TO 'zapp', 'auth', 'extensions'
--
-- AUDITORIA QUE DETECTOU:
--   Agente 3 — Scan completo de search_path em 865 funções SECURITY DEFINER
--   Executado em: 2026-08-06 (auditoria exaustiva pós-PR #892)
-- ============================================================================

ALTER FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid)
  SET search_path TO 'zapp', 'auth', 'extensions';

COMMENT ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) IS
'FIX P1 (2026-08-06, GAP-IDOR-01): guard auth.uid() adicionado — chamador só pode '
'operar sobre seus próprios favoritos. IDOR eliminado: qualquer divergência entre '
'p_user_id e auth.uid() lança ERRCODE 42501 (insufficient_privilege). '
'NOTA: se ambos p_user_id e auth.uid() forem NULL, IS DISTINCT FROM retorna FALSE '
'(guard não dispara) — proteção real para usuários não autenticados vem da NOT NULL '
'constraint em audio_meme_favorites.user_id e da ausência de GRANT a anon. '
'FIX G1-B (2026-08-06): search_path corrigido — aspas individuais por schema em '
'vez de aspas únicas envolvendo todos (20260806300000 introduziu o bug G1-B).';
