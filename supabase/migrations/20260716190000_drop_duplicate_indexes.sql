-- Migracao: remocao de indices duplicados que sao cobertos por UNIQUE equivalente
-- Data: 2026-07-16
-- Contexto: audit DBA-level pos-consolidacao single-DB
--
-- Cada indice removido tem uma UNIQUE constraint identica nas mesmas colunas,
-- tornando o indice btree regular 100% redundante.
-- O UNIQUE serve tanto como constraint quanto como indice de busca.

-- webhook_idempotency: idx coberto por webhook_idempotency_source_id_key UNIQUE(source, webhook_id)
DROP INDEX IF EXISTS zapp.idx_webhook_idemp_source;

-- workspace_settings: idx coberto por workspace_settings_workspace_id_key UNIQUE(workspace_id)
DROP INDEX IF EXISTS zapp.idx_workspace_settings_ws;

-- contact_assignments: idx coberto por uq_contact_assignments_contact UNIQUE(contact_id)
DROP INDEX IF EXISTS zapp.idx_contact_assignments_contact;

-- contact_intelligence: idx coberto por contact_intelligence_contact_id_key UNIQUE(contact_id)
DROP INDEX IF EXISTS zapp.idx_contact_intelligence_contact;
