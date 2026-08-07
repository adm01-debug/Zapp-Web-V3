# VPS AtomicaBR — Setup Runbook
Gerado: 07/08/2026 (auditoria + cleanup completa)

## Ordem obrigatória após rebuild do servidor

### 1. WAL Archive (postgresql archive_command)
Após subir o supabase_db, executar:
```bash
CTR=$(docker ps -qf name=supabase_db.1)
docker exec $CTR psql -U postgres -d postgres -c "ALTER SYSTEM SET archive_mode = 'on';"
docker exec $CTR psql -U postgres -d postgres -c "ALTER SYSTEM SET archive_command = '(test ! -f /opt/pg_wal_archive/%f && cp %p /opt/pg_wal_archive/%f); test -f /opt/pg_wal_archive/%f; CP_EXIT=\$?; find /opt/pg_wal_archive -type f -mmin +1440 -delete || true; exit \$CP_EXIT';"
docker exec $CTR psql -U postgres -d postgres -c "ALTER SYSTEM SET archive_timeout = '600s';"
docker exec $CTR psql -U postgres -d postgres -c "SELECT pg_reload_conf();"
```
Alternativa: settings também em /etc/postgresql-custom/wal-g.conf
(volume supabase_db_config — persiste INDEPENDENTE do PGDATA)

### 2. Storage Symlink
```bash
cd /root/supabase/docker/volumes/storage
ln -sfn undefined/stub stub
```
Motivo: supabase storage-api v1.x criou arquivos em undefined/stub/ (TENANT_ID não setado).
28 GB de mídia WhatsApp em undefined/stub/whatsapp-media/ — NÃO MIGRAR com sistema rodando.

### 3. Host Cron (docker image prune diário)
Criar /etc/cron.d/docker-image-prune:
```
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 2 * * * root /usr/bin/docker image prune -f >> /var/log/docker-prune.log 2>&1
```

### 4. GitHub CI workflow
Já no repo: .github/workflows/deploy-vps.yml
Step 'Prune dangling images pós-deploy' — comprometido em 5e7dcfd32.

## Estado atual do supabase.yaml vs Portainer

| Item | supabase.yaml (disco) | Portainer (real) |
|------|----------------------|------------------|
| Image db | 15.8.1.085 ✅ | 15.8.1.085 |
| wal_archive mount | ✅ adicionado 07/08 | bind ativo |
| Command format | lista yaml (desatualizado) | /bin/sh -c com JWT_SECRET |
| archive settings | NÃO (apenas auto.conf) | NÃO (apenas auto.conf) |

Para o command real: `docker service inspect supabase_db | grep Args`

## Verificação rápida de saúde (pós-setup)
```bash
# WAL archive funcionando?
docker exec $(docker ps -qf name=supabase_db.1) psql -U postgres -d postgres \
  -c "SELECT archived_count, failed_count FROM pg_stat_archiver;"

# Symlink ok?
ls -la /root/supabase/docker/volumes/storage/stub

# Cron instalado?
cat /etc/cron.d/docker-image-prune

# Disco ok?
df -h / | tail -1
```
