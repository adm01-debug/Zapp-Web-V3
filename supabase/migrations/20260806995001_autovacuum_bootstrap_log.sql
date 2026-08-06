-- Item 65 da auditoria infra (AG-EX-01): autovacuum per-table (substitui cron vacuum-bootstrap-log-daily job 135)
ALTER TABLE evo.evolution_bootstrap_log SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_vacuum_threshold=100, autovacuum_analyze_scale_factor=0.02, autovacuum_analyze_threshold=50);
