# Snapshots dos stack files da VPS (Docker Swarm / Portainer)

Cópias versionadas dos stack files corrigidos na **sessão 5 da auditoria Evolution API**
(2026-07-04). Antes desta sessão vários stacks tinham *drift* (o runtime divergia do stack
file) e credenciais em texto puro no env do Portainer. Estes arquivos são a **fonte da verdade**:
um redeploy pela UI do Portainer com estes conteúdos NÃO reverte nenhuma correção.

| Arquivo | Stack (id) | O que mudou na sessão 5 |
|---|---|---|
| `glitchtip.yml` | glitchtip (41) | + serviço `glitchtip-valkey` (Redis/fila Celery que faltava → ingestão dava HTTP 500) + `REDIS_URL` no web/worker |
| `supabase-db-mcp.yml` | supabase-db-mcp (128) | `DATABASE_URL` saiu do env em texto puro → Docker secret `supabase_db_url_v1` + wrapper de entrypoint; healthcheck em `127.0.0.1` |
| `postgres-backup-daily.yml` | postgres-backup-daily (112) | MinIO→R2 fixado no arquivo + credenciais via secrets |
| `postgres-backup-weekly.yml` | postgres-backup-weekly (84) | idem + removido o one-shot `source-backfill-exporter` (obsoleto) |
| `postgres-backup-monthly.yml` | postgres-backup-monthly (85) | idem (passphrase própria em `backup_passphrase_monthly_v1`) |

## Secrets externos referenciados (criados no host, valores nunca versionados)

- `supabase_db_url_v1` — URI Postgres do MCP
- `r2_backup_access_key_v1`, `r2_backup_secret_key_v1` — chaves R2 dos backups PG14
- `pg14_backup_pg_password_v1` — senha do Postgres nativo (evolution) para os backups
- `backup_passphrase_dw_v1` — passphrase GPG daily+weekly
- `backup_passphrase_monthly_v1` — passphrase GPG monthly (distinta — achado da sessão 4)

> Os stacks `evolution` (25), `evolution-rabbit-consumer` (113), `watchdog-baileys` (109),
> `evolution-db-purge` (126) e `zapp-health-guard` (165) estão documentados nos relatórios
> de auditoria (`docs/EVOLUTION_API_AUDIT_*`), não duplicados aqui.
