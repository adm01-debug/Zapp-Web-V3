# Runbook de Operações — AtomicaBR

## Correções Aplicadas (22/07/2026)

### Evolution API (wpp2)
- Webhook desabilitado
- alwaysOnline=true, readMessages=true, readStatus=true

### Banco de Dados (Supabase PostgreSQL 15.8)
- VACUUM ANALYZE: evolution_messages_wpp2 + evolution_contacts
- WAL Slot `cainophile_s7fgrb36` removido (278MB lag)
- Supabase DB restart (slot drop)
- Supabase Realtime restart
- Glitchtip web+worker restart
- CrowdSec Bouncer restart

### Monitoramento
- Cron: WAL Lag Monitor (a cada 15 min)
- Cron: Backup Health Check (diário 6h)

## Procedimentos de Emergência

### WAL Slot Congelado
```sql
SELECT slot_name, database, active,
  pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)/1048576 AS lag_mb
FROM pg_replication_slots;
-- Solução: docker service update --force supabase_db
```

### CrowdSec Bouncer Parado
```bash
cscli bouncers list
# Se Last API pull > 1h: restart container
```

## Gaps Identificados (não corrigidos)

### 1. Imagens Docker órfãs (~20 GB)
30 imagens sem tag ocupando espaço.
Solução: Executar `infra/scripts/housekeeping.sh` no VPS.

### 2. Volumes hash órfãos (13 unidades)
Volumes com nomes hash não identificáveis.
Solução: `docker volume ls -qf dangling=true | xargs -r docker volume rm`

### 3. Memory limits ausentes (80% dos containers)
Risco de OOM em picos de carga.
Solução: Adicionar `deploy.resources.limits.memory` nos stacks.
Ver `infra/scripts/memory-limits.sh` para valores recomendados.

### 4. n8n FK constraint bug
Erro em workflow_history pruning.
Solução: ALTER TABLE workflow_published_version ADD CONSTRAINT ... ON DELETE CASCADE

### 5. Edge Function 404
POST /rest/v1/contacts retorna 404.
Solução: Ajustar schema na query para zapp.contacts.
