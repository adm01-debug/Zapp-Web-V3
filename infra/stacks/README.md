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

## Stack de Housekeeping Docker (faxina 2026-08-05)

O stack **`docker-housekeeping v2.4`** (Portainer id 199) não fica nesta pasta por ser de
infraestrutura transversal (não específico do zapp-web). O arquivo canônico está em:

**`docs/infra/docker-housekeeping-v2.4.yml`**

Funcionalidades críticas do v2.4:
- **`ensure_ref_tags`**: re-taga Spec+PreviousSpec de todos os serviços Swarm antes de qualquer prune — garante que a imagem de rollback do zapp-web nunca seja varrida pelo dangling prune.
- **`prune_zapp_old`**: retenção HOST — mantém `ZAPP_KEEP_TAGS=6` imagens mais recentes do zapp + Spec/PreviousSpec/latest; poda tagged antigas (proteção contra crescimento ilimitado de ~116 MB/deploy).
- **`PROTECTED_REPOS_REGEX`**: regex que protege `ghcr.io/adm01-debug/zapp-web-v3/zapp-web` do prune de tagged images. **NUNCA** usar `docker image prune -a/-af` — use este stack para limpeza abrangente.

> Stack file do zapp-web em produção: `infra/stacks/zapp-web-prod.yml` (Portainer id 157).
> Runbook de rollback canônico: `docs/PORTAINER_ZAPP_FOOTPRINT.md §4`.
