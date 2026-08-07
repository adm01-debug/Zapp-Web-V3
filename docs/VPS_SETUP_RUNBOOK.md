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

## Descobertas da Auditoria Exaustiva — 07/08/2026

### CRÍTICO: supautils bloqueia ALTER SYSTEM para archive settings
O `supautils` (Supabase) bloqueia `ALTER SYSTEM` para `archive_timeout` e `archive_command`
mesmo para superusers via PostgREST/Kong. O único path para alterar é sed direto no arquivo:
```bash
CTR=$(docker ps -qf name=supabase_db)
docker exec -u root $CTR sed -i 's/^archive_timeout = .*/archive_timeout = 600/' /var/lib/postgresql/data/postgresql.auto.conf
docker exec -u root $CTR sed -i 's/mmin +480/mmin +1440/g' /var/lib/postgresql/data/postgresql.auto.conf
docker exec $CTR psql -U postgres -d postgres -c "SELECT pg_reload_conf();"
```

### Guardian de drift instalado
pg_cron job #314 `archive-drift-guard` (*/5) monitora archive settings e insere
warroom_alert crítico se archive_timeout != 600 ou archive_command não tem mmin+1440.

### supabase-db-mcp-server (pid 56) — comportamento esperado
Gera "WARNING: no transaction in progress" e erros pg_get_expr(text,oid). São bugs do
pacote externo, não causam perda de dados. Monitorar mas não tratar como incidente.

### fn_link_orphan_messages — backlog de 227K zerado 07/08/2026
Batch aumentado de 5000 para 10000. Índice `idx_wpp2_conv_null` criado na partição wpp2.
Índice pai `idx_evo_msgs_conv_null` criado em evo.evolution_messages (sem ONLY).

### Constraints instance_registry — auto-resolvido
Constraint `instance_registry_connection_status_check` já inclui 'connecting'.
Erros de 16:08 eram de container anterior pré-migration.
