# Backup & Recovery — AtomicaBR

## Stack de Backups

### evolution DB → Cloudflare R2

| Frequência | Schedule | Retenção | Bucket |
|---|---|---|---|
| Daily | 0 2 * * 1-6 | 14 dias | `promo-brindes-backups/backups/evolution-db/daily/` |
| Weekly | 0 3 * * 0 | 35 dias | `promo-brindes-backups/backups/evolution-db/weekly/` |
| Monthly | 0 4 1 * * | 365 dias | `promo-brindes-backups/backups/evolution-db/monthly/` |

### Credenciais (Docker Secrets)
| Secret | Mapeamento |
|---|---|
| `r2_backup_access_key_v1` | `S3_ACCESS_KEY_ID` |
| `r2_backup_secret_key_v1` | `S3_SECRET_ACCESS_KEY` |
| `pg14_backup_pg_password_v1` | `POSTGRES_PASSWORD` |
| `backup_passphrase_dw_v1` | `PASSPHRASE` (daily/weekly) |
| `backup_passphrase_monthly_v1` | `PASSPHRASE` (monthly) |

### S3 Endpoint
```
URL: https://cd0f4eee542191c4957567814e1f8ca1.r2.cloudflarestorage.com
Bucket: promo-brindes-backups
Region: auto
```

## Como Verificar

```bash
# Listar backups no R2
docker exec -it $(docker ps -q -f name=postgres-backup-daily) sh
source /env.sh
aws s3 ls s3://promo-brindes-backups/backups/evolution-db/daily/ \
  --endpoint-url $S3_ENDPOINT
```

## Como Restaurar

```bash
# 1. Baixar backup
docker exec -it $(docker ps -q -f name=postgres-backup-daily) sh
aws s3 cp s3://promo-brindes-backups/backups/evolution-db/daily/evolution_*.dump.gpg \
  ./restore.dump.gpg --endpoint-url $S3_ENDPOINT

# 2. Descriptografar
gpg --decrypt --batch --passphrase "$PASSPHRASE" restore.dump.gpg > restore.dump

# 3. Restaurar
pg_restore --format=custom \
  -h postgres -p 5432 -U postgres -d evolution \
  -j 4 --clean --if-exists restore.dump

# 4. Validar
psql -U postgres -d evolution -c "SELECT count(*) FROM evo.evolution_messages_wpp2;"
```

## Histórico de Correções

- **04/07/2026**: Migrado de MinIO para Cloudflare R2
- **22/07/2026**: Limpeza de BACKUP_FAILED obsoletos (245MB liberados)
