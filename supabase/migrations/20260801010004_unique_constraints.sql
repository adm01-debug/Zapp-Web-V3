-- 20260801010004 — Integridade: 4 constraints UNIQUE (auditoria etapa 27)
-- Aplicado em produção: 2026-08-01
-- Duplicatas verificadas antes da aplicação: 0 em todas as 4 tabelas
-- NOTA: CREATE UNIQUE INDEX CONCURRENTLY não roda dentro de transação — executar fora de BEGIN/COMMIT.
-- Rollback:
--   ALTER TABLE zapp.conversation_memory DROP CONSTRAINT IF EXISTS uq_conversation_memory_contact;
--   ALTER TABLE zapp.permissions        DROP CONSTRAINT IF EXISTS uq_permissions_name;
--   ALTER TABLE zapp.tags               DROP CONSTRAINT IF EXISTS uq_tags_name;
--   ALTER TABLE zapp.talkx_blacklist    DROP CONSTRAINT IF EXISTS uq_talkx_blacklist_contact;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_conversation_memory_contact ON zapp.conversation_memory (contact_id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_permissions_name ON zapp.permissions (name);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_tags_name ON zapp.tags (name);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_talkx_blacklist_contact ON zapp.talkx_blacklist (contact_id);

ALTER TABLE zapp.conversation_memory ADD CONSTRAINT uq_conversation_memory_contact UNIQUE USING INDEX uq_conversation_memory_contact;
ALTER TABLE zapp.permissions        ADD CONSTRAINT uq_permissions_name          UNIQUE USING INDEX uq_permissions_name;
ALTER TABLE zapp.tags               ADD CONSTRAINT uq_tags_name                 UNIQUE USING INDEX uq_tags_name;
ALTER TABLE zapp.talkx_blacklist    ADD CONSTRAINT uq_talkx_blacklist_contact   UNIQUE USING INDEX uq_talkx_blacklist_contact;
