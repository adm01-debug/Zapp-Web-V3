-- ============================================================================
-- Evolution DB hardening — Auditoria 2026-07-10 (execução pós-auditoria)
-- Autor: auditoria de prontidão de produção (senior DB engineering)
-- Todas as instruções são IDEMPOTENTES (IF EXISTS / IF NOT EXISTS / ALTER).
--
-- Seções A e B foram APLICADAS AO VIVO via MCP e verificadas (2026-07-10),
--   usando CONCURRENTLY para zero bloqueio de escrita. Aqui reproduzidas
--   sem CONCURRENTLY para compatibilidade com o runner transacional de
--   migrations (o IF NOT EXISTS as torna no-op onde já aplicadas).
-- Seção C NÃO foi aplicada ao vivo: remoção de índice é destrutiva e foi
--   corretamente barrada pelo classificador de segurança para aplicação
--   ad-hoc. Vai pelo canal correto (migration revisada em PR).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Hardening de segurança: SECURITY DEFINER sem search_path
--    Fecha o último gap de search_path no schema evo (as outras 51 funções
--    secdef já tinham). Ambas as funções qualificam objetos como evo.* no
--    corpo, então evo,public,pg_temp é seguro e alinhado à convenção do projeto.
-- ----------------------------------------------------------------------------
ALTER FUNCTION evo.fn_bootstrap_wpp2_instance(text, text) SET search_path = evo, public, pg_temp;
ALTER FUNCTION evo.fn_check_guardian_alive()             SET search_path = evo, public, pg_temp;

-- ----------------------------------------------------------------------------
-- B. Índices de cobertura para foreign keys sem índice
--    Evita seq-scan em cascata e escalonamento de lock em UPDATE/DELETE do pai.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_evolution_health_logs_connection_id
  ON evo.evolution_health_logs (connection_id);
CREATE INDEX IF NOT EXISTS idx_evolution_contacts_queue_id
  ON evo.evolution_contacts (queue_id);

-- ----------------------------------------------------------------------------
-- C. Remoção de índices genuinamente redundantes (revisar antes de aplicar)
--    NB: a maioria dos 58 "grupos duplicados" reportados NÃO são redundantes —
--    são pares full-vs-partial (WHERE deleted_at IS NULL) que servem query
--    shapes distintos e ambos têm idx_scan>0. NÃO removê-los.
--
--    Os itens abaixo são os únicos comprovadamente redundantes:
--    C.1 idx_pipeline_health_log_checked_at — duplicata byte-idêntica de
--        evolution_pipeline_health_log_checked_at_idx (mesma def, checked_at DESC).
--    C.2 idx_msg_{compras,financeiro,logistica,marketing}_contact — índice de
--        coluna única (contact_id) estritamente coberto pelo composto
--        (contact_id, created_at DESC) já presente em cada tabela (prefix rule).
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS evo.idx_pipeline_health_log_checked_at;
DROP INDEX IF EXISTS evo.idx_msg_compras_contact;
DROP INDEX IF EXISTS evo.idx_msg_financeiro_contact;
DROP INDEX IF EXISTS evo.idx_msg_logistica_contact;
DROP INDEX IF EXISTS evo.idx_msg_marketing_contact;
