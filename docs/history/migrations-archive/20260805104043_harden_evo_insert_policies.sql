-- ============================================================================
-- Migration: harden_evo_insert_policies
-- Data:      2026-08-05
-- Objetivo:  Fechar policies INSERT abertas (WITH CHECK = true) em evo.
--
-- GAP ENCONTRADO NA AUDITORIA 10 AGENTES (2026-08-05, PhD PostgreSQL #3):
--   media_insert_auth (evo.evolution_media) e authenticated_insert_messages
--   (evo.evolution_messages_wpp2) tinham WITH CHECK = true → QUALQUER usuário
--   autenticado podia inserir mídia/mensagens arbitrárias via views public
--   (security_invoker) — falsificação de mensagens possível via REST.
--
-- FIX: escopar ao MESMO padrão das irmãs (messages_insert_scoped):
--   current_user_is_privileged() (admin/supervisor) OU contato atribuído ao
--   usuário (ou não atribuído). Service_role continua bypass (webhook intacto).
--
-- Aplicada em produção como 20260805104043 (transactional).
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
-- ============================================================================

-- ── evo.evolution_media ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS media_insert_auth ON evo.evolution_media;
CREATE POLICY media_insert_auth ON evo.evolution_media
  FOR INSERT TO authenticated
  WITH CHECK (
    zapp.current_user_is_privileged()
    OR EXISTS (
      SELECT 1 FROM evo.evolution_contacts c
      WHERE c.remote_jid::text = evolution_media.remote_jid::text
        AND (c.assigned_to::text = auth.uid()::text OR c.assigned_to IS NULL)
    )
  );

-- ── evo.evolution_messages_wpp2 ─────────────────────────────────────────────
DROP POLICY IF EXISTS authenticated_insert_messages ON evo.evolution_messages_wpp2;
CREATE POLICY authenticated_insert_messages ON evo.evolution_messages_wpp2
  FOR INSERT TO authenticated
  WITH CHECK (
    zapp.current_user_is_privileged()
    OR EXISTS (
      SELECT 1 FROM evo.evolution_contacts c
      WHERE c.remote_jid::text = evolution_messages_wpp2.remote_jid::text
        AND c.instance_name::text = evolution_messages_wpp2.instance_name::text
        AND (c.assigned_to::text = auth.uid()::text OR c.assigned_to IS NULL)
    )
  );

-- ============================================================================
-- FIM — INSERT policies de evo escopadas (2026-08-05).
-- Nota: contacts_insert e messages_insert_scoped JÁ tinham WITH CHECK escopado
-- (o relatório do agente olhou polqual=NULL — INSERT policies não têm USING).
-- ============================================================================
