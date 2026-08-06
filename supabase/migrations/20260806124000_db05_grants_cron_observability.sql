-- db05: Observabilidade de cron para o role de auditoria
-- Concede SELECT nas tabelas de metadados/execução do pg_cron ao
-- supabase_read_only_user (role de auditoria), permitindo inspecionar
-- jobs e job_run_details sem escrita. Aplicada manualmente via MCP
-- (fluxo self-hosted) e registrada em supabase_migrations.schema_migrations.

GRANT SELECT ON cron.job, cron.job_run_details TO supabase_read_only_user;
