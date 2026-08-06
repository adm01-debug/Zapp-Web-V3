-- Item 56 da auditoria infra (AG-EX-01): indices GIN to_tsvector sem uso
-- idx_messages_content_search e o indice PAI dos evolution_messages_*_to_tsvector_idx (14 filhos, incl. wpp2 ~2MB).
-- Verificacao previa: 0 idx_scan em pai e filhos; nenhum tsquery/to_tsvector no repo (grep) nem em funcoes do banco (pg_proc).
DROP INDEX IF EXISTS evo.idx_messages_content_search;
-- webhook_events_processed_event_id_uq (38MB): NAO dropado — o dedup da edge fn evolution-webhook depende do
-- INSERT + erro 23505 (evolution-helpers.ts markEventProcessed). Sem o UNIQUE o dedup silenciosamente quebra.
