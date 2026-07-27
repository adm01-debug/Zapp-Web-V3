-- ============================================================
-- Migration: 20260727000010_zapp_evo_curated_contract
-- Objetivo: Documentar views zapp→evo e racionalizar 254 views
-- Status: DOCUMENTAÇÃO — análise em andamento
--参阅: ADR-DB-002
-- ============================================================

-- Views zapp que leem de evo (contrato de leitura):
-- Total: ~254 views (todas via public.evolution_* → evo.*)

-- Views canonicas (DEVEM ser mantidas):
COMMENT ON SCHEMA zapp IS
$EOT$
Schema principal da aplicação zapp-web-v3.

Contrato com evo (Evolution API):
- zapp pode ler de evo via views contratadas em public (PostgREST)
- zapp pode fazer INSERT/UPDATE em evo via functions de pipeline (SEGURANÇA DEFINER)
- evo NUNCA pode criar objetos em zapp
- FKs evo→zapp são PROIBIDAS (ver ops.fn_ci_check_forbidden_fks)

Views contratadas (public.evolution_* → evo.*):
- evolution_messages
- evolution_contacts
- evolution_conversations
- evolution_media
- evolution_whatsapp_status
- contact_id_graveyard
$EOT$;

-- Pipeline functions em zapp que escrevem em evo:
-- (DEVEM manter SET search_path = 'evo' fixed)
-- Exemplo: zapp.evolution_webhook_handler() → evo.evolution_messages

-- Views a remover (não usadas, verificar antes):
-- SELECT schemaname, viewname, viewowner
-- FROM pg_views
-- WHERE schemaname = 'public'
--   AND viewname LIKE 'evolution_%'
--   AND NOT EXISTS (
--       SELECT 1 FROM pg_catalog.pg_lateral_drives
--       WHERE ... -- verificar uso real
--   );
