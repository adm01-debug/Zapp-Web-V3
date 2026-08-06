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

### evolution-db-purge — OOM Killed (137) e Command Not Found (127)

**Sintomas:** Containers `evolution-db-purge*` encerram com código 137 (OOM killed) ou 127 (command not found).

**Diagnóstico via Portainer:** Filtrar containers por nome `evolution-db-purge`, verificar ExitCode e Status em cada instância.

**Exit 137 — OOM Killed:**
- Causa: Limite de memória insuficiente para a operação de purge das tabelas `evo.*`
- Correção: Aumentar `deploy.resources.limits.memory` no stack Portainer
  ```yaml
  deploy:
    resources:
      limits:
        memory: 512M  # Aumentar (ex: 256M → 512M ou 1G conforme necessário)
  ```
- Após ajuste: atualizar o serviço via Portainer (stack update) ou `docker service update --force <nome-do-servico>`

**Exit 127 — Command Not Found:**
- Causa: Entrypoint/CMD inválido na imagem — script de purge não encontrado no container
- Verificar imagem e entrypoint via Portainer: inspecionar o serviço → ver "Command" e "Image"
- Confirmar que o script de purge existe na imagem antes de redesployar

**Impacto se não corrigido:** Tabelas do schema `evo` (ex: `evolution_messages_*`, `evolution_webhook_events_*`) crescem sem limpeza automática — risco de degradação de performance e esgotamento de disco.

**Referência:** DADO-03/SAUDE-03 na RECONCILIATION_MATRIX.md — P1 DRIFT (pendente desde 2026-08-06).

## Gaps Resolvidos (faxina 2026-08-05)

### 1. Imagens Docker órfãs — RESOLVIDO
Imagens sem tag foram removidas na faxina Portainer de 2026-08-05 (~1,19 GB recuperados).
- **NÃO usar** `infra/scripts/housekeeping.sh` para limpeza de imagens tagged — o script
  (`docker image prune -f`, sem `-a`) só remove dangling agora.
- Para limpeza abrangente de tagged images: usar o stack `docker-housekeeping v2.4`
  (`docs/infra/docker-housekeeping-v2.4.yml`) que protege `ghcr.io/.../zapp-web`.
- Ver footprint canônico: `docs/PORTAINER_ZAPP_FOOTPRINT.md`

## Rollback do zapp-web

> **Aviso — janela de rollback automático:** `failure_action: rollback` só dispara dentro de `monitor: 60s`.
> Como `start_period(30s) + retries(3) × interval(30s) = 120s`, um container que sobe mas fica
> unhealthy lentamente **não** aciona o rollback automático. Nesses casos, execute o rollback manual abaixo.
> O `zapp-health-guard` (stack 165) cobre falhas pós-start.

> **Runbook completo em `docs/PORTAINER_ZAPP_FOOTPRINT.md §4`** (inclui PASSO 0 — salvar ref atual,
> PASSO 1 — flip com digest, PASSO 2 — validação por UpdateStatus, PASSO 3 — restaurar).
> Use o procedimento abaixo apenas como referência rápida.

```bash
# PRÉ-REQUISITO: garantir imagem de rollback disponível localmente
docker pull ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-anterior>

# Salvar ref atual ANTES de flipar (o ATUAL pode estar <none> local — puxado por digest)
REF_ATUAL=$(docker service inspect zapp-web-prod_web --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')
echo "$REF_ATUAL" > /tmp/ref_atual.txt

# Flipar serviço para imagem de rollback (usar tag@digest — funciona offline)
DIGEST=$(docker images --digests --no-trunc --format '{{.Repository}}:{{.Tag}} {{.Digest}}' \
  | awk '$1 ~ /:production-<sha-anterior>$/ {print $2; exit}')
timeout 600s docker service update --detach=false \
  --image "ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-<sha-anterior>@${DIGEST}" \
  zapp-web-prod_web

# Validar — gate REAL = UpdateStatus + healthz
docker service ps zapp-web-prod_web --no-trunc
docker service inspect zapp-web-prod_web --format '{{.UpdateStatus.State}} — {{.UpdateStatus.Message}}'
for i in $(seq 1 6); do
  CODE=$(curl -s -m 10 -o /dev/null -w '%{http_code}' https://zapp.atomicabr.com.br/healthz)
  [ "$CODE" = "200" ] && break; sleep 10
done
[ "$CODE" = "200" ] || { echo "healthz FALHOU: $CODE"; exit 1; }
echo "healthz: $CODE — rollback OK"

# Para restaurar para o estado anterior: usar ref salva no passo 0
timeout 600s docker service update --detach=false --image "$(cat /tmp/ref_atual.txt)" zapp-web-prod_web
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
