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

## Gaps Resolvidos (faxina 2026-08-05)

### 1. Imagens Docker órfãs — RESOLVIDO
Imagens sem tag foram removidas na faxina Portainer de 2026-08-05 (~1,19 GB recuperados).
- **NÃO usar** `infra/scripts/housekeeping.sh` para limpeza de imagens tagged — o script
  (`docker image prune -f`, sem `-a`) só remove dangling agora.
- Para limpeza abrangente de tagged images: usar o stack `docker-housekeeping v2.3`
  (`docs/infra/docker-housekeeping-v2.3.yml`) que protege `ghcr.io/.../zapp-web`.
- Ver footprint canônico: `docs/PORTAINER_ZAPP_FOOTPRINT.md`

## Rollback do zapp-web

> **Aviso — janela de rollback automático:** `failure_action: rollback` só dispara dentro de `monitor: 60s`.
> Como `start_period(30s) + retries(3) × interval(30s) = 120s`, um container que sobe mas fica
> unhealthy lentamente **não** aciona o rollback automático. Nesses casos, execute o rollback manual abaixo.
> O `zapp-health-guard` (stack 165) cobre falhas pós-start.

```bash
# Rollback manual com ref tag@digest (funciona offline — satisfaz pull por digest local)
# Obter digest da imagem de rollback pré-pullada:
DIGEST=$(docker images --digests --no-trunc --format '{{.Repository}}:{{.Tag}} {{.Digest}}' \
  | awk '/production-<sha-anterior>/ {print $2; exit}')

docker service update --detach=false \
  --image "ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-anterior>@${DIGEST}" \
  zapp-web-prod_web

# Validar
docker service ps zapp-web-prod_web --no-trunc
docker service inspect zapp-web-prod_web --format '{{.UpdateStatus.State}} — {{.UpdateStatus.Message}}'
curl -s -o /dev/null -w '%{http_code}' https://zapp.atomicabr.com.br/healthz   # esperado 200
```

> **Pré-requisito:** imagem de rollback deve estar pré-pullada no host (ver §4 de `docs/PORTAINER_ZAPP_FOOTPRINT.md`).
> Para rollback somente por tag (sem digest) — funciona apenas se GHCR estiver online.

## Gaps Identificados (não corrigidos)

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
