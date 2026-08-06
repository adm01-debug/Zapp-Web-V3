-- Item 65 da auditoria infra (AG-EX-01): autovacuum per-table (substitui cron disk-tables-vacuum-weekly job 231)
ALTER TABLE ops.disk_actions_queue SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_vacuum_threshold=100, autovacuum_analyze_scale_factor=0.02);
