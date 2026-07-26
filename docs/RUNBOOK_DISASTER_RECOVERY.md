# Runbook de Disaster Recovery - ZAPP WEB

## Visão Geral

Procedimentos de recuperação de desastres para o ZAPP WEB em produção (VPS AtomicaBR).

## Cenários de Desastre

### Cenário 1: Banco de Dados Corrompido

**Sintomas:**
- Queries retornam erros 500
- RLS policies não aplicadas
- Dados inconsistentes

**Detecção:**
- Health check retorna `unhealthy` para Supabase
- Sentry captura exception rate > 50/min
- Usuários relatam erro ao carregar inbox

**Resolução:**

```bash
# 1. Verificar status do PostgreSQL
docker exec zapp-postgres pg_isready -U postgres

# 2. Verificar replicação
docker exec zapp-postgres psql -U postgres -c "SELECT * FROM pg_stat_replication;"

# 3. Se necessário, restaurar backup
docker exec zapp-postgres bash -c "
  psql -U postgres -d postgres -c '
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE datname = '\''zapp'\'' AND pid <> pg_backend_pid();
  '
"

# 4. Drop e recriar database
docker exec zapp-postgres dropdb -U postgres zapp --if-exists
docker exec zapp-postgres createdb -U postgres zapp

# 5. Restore do backup mais recente
docker exec -i zapp-postgres psql -U postgres zapp < /backups/zapp-2026-07-24.sql

# 6. Aplicar migrations pendentes (se houver)
cd /opt/zapp/supabase
for migration in migrations/2026*.sql; do
  docker exec -i zapp-postgres psql -U postgres zapp < "$migration"
done
```

**Tempo estimado:** 30-60 minutos
**RPO (Recovery Point Objective):** 24 horas (backup diário)
**RTO (Recovery Time Objective):** 1 hora

---

### Cenário 2: Edge Function Crash Loop

**Sintomas:**
- Logs mostram `BOOT_ERROR 500` repetido
- Funções retornam 503
- Workers reiniciando continuamente

**Detecção:**
- Sentry recebe múltiplas exceções
- Health check da função retorna unhealthy

**Resolução:**

```bash
# 1. Identificar função com problema
docker logs zapp-edge-functions 2>&1 | grep -i "error\|crash" | tail -50

# 2. Verificar env vars
docker exec zapp-edge-functions printenv | grep -i "supabase\|api\|key"

# 3. Se env vars faltando, restaurar
docker exec zapp-edge-functions bash -c "
  export SELFHOSTED_SUPABASE_URL='https://supabase.atomicabr.com.br'
  export SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY='<service-role-key>'
  export EVOLUTION_API_URL='https://evolution.atomicabr.com.br'
  export EVOLUTION_API_KEY='<evolution-key>'
"

# 4. Restart container
docker restart zapp-edge-functions

# 5. Verificar logs pós-restart
docker logs zapp-edge-functions --since 1m
```

**Tempo estimado:** 5-15 minutos

---

### Cenário 3: Disk Full

**Sintomas:**
- Logs: `No space left on device`
- Container crashes
- Writes falham

**Detecção:**
- Disk usage > 90%
- WAL slot lag crescendo
- Backup jobs falhando

**Resolução:**

```bash
# 1. Verificar uso de disco
df -h
du -sh /var/lib/docker/containers/*/  | sort -hr | head -20

# 2. Limpar logs antigos
docker system prune -a --volumes --filter "until=168h"

# 3. Compactar WAL files
docker exec zapp-postgres bash -c "
  psql -U postgres -c 'VACUUM FULL;'
  psql -U postgres -c 'REINDEX DATABASE zapp;'
"

# 4. Limpar backups antigos (manter últimos 7 dias)
find /backups -name "*.sql.gz" -mtime +7 -delete

# 5. Limpar audit logs antigos
docker exec zapp-postgres psql -U postgres zapp -c "
  DELETE FROM zapp.audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
"

# 6. Limpar webhook events antigos
docker exec zapp-postgres psql -U postgres zapp -c "
  DELETE FROM zapp.webhook_events_processed WHERE created_at < NOW() - INTERVAL '30 days';
"
```

**Tempo estimado:** 15-30 minutos

---

### Cenário 4: Evolution API Offline

**Sintomas:**
- Mensagens não são enviadas
- Webhook events param de chegar
- Instâncias aparecem "disconnected"

**Detecção:**
- Health check Evolution = unhealthy
- Circuit breaker ativado
- DLQ crescendo

**Resolução:**

```bash
# 1. Verificar status da Evolution
curl -s "https://evolution.atomicabr.com.br/instance/connectionState/wpp2" \
  -H "apikey: $EVOLUTION_API_KEY"

# 2. Restart Evolution se necessário
docker restart zapp-evolution-api

# 3. Reconectar instâncias
curl -X POST "https://evolution.atomicabr.com.br/instance/restart/wpp2" \
  -H "apikey: $EVOLUTION_API_KEY"

# 4. Se webhook parado, reenviar eventos do DLQ
docker exec zapp-postgres psql -U postgres zapp -c "
  SELECT id, event_type, instance_name, created_at 
  FROM zapp.dlq_events 
  WHERE status = 'pending' 
  ORDER BY created_at 
  LIMIT 100;
"

# 5. Reenviar manualmente se necessário (script)
node scripts/replay-dlq-events.js --limit=100
```

**Tempo estimado:** 10-20 minutos

---

### Cenário 5: DDoS / Spike de Tráfego

**Sintomas:**
- CPU > 90% sustained
- Latência > 5s
- Rate limits ativados

**Detecção:**
- Grafana alerts
- Sentry spike de erros 429

**Resolução:**

```bash
# 1. Ativar fail-open em rate limit
docker exec zapp-postgres psql -U postgres zapp -c "
  UPDATE zapp.global_settings 
  SET value = 'fail-open' 
  WHERE key = 'rate_limit_mode';
"

# 2. Escalar horizontalmente
docker service scale zapp_edge-functions=10
docker service scale zapp_postgres=1

# 3. Habilitar CloudFlare under attack mode
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -d '{"security_level":"under_attack"}'

# 4. Bloquear IPs maliciosos
iptables -A INPUT -s $MALICIOUS_IP -j DROP

# 5. Após estabilização, restaurar rate limit normal
docker exec zapp-postgres psql -U postgres zapp -c "
  UPDATE zapp.global_settings 
  SET value = 'enforce' 
  WHERE key = 'rate_limit_mode';
"
```

**Tempo estimado:** 5-10 minutos

---

### Cenário 6: Secrets Comprometidos

**Sintomas:**
- Logs mostram acessos não autorizados
- Sentry recebe auth errors de IPs desconhecidos
- Dados modificados sem justificativa

**Detecção:**
- Alert de Sentry sobre auth failure spike
- Audit logs mostram acessos anômalos

**Resolução:**

```bash
# 1. Rotacionar IMMEDIATAMENTE todos os secrets
# Service Role Key
docker exec zapp-postgres bash -c "
  psql -U postgres -c \"
    ALTER ROLE service_role NOLOGIN;
  \"
"
# Gerar novo service_role key via Supabase dashboard

# Anon Key
# Regenerar via Supabase dashboard → Settings → API

# JWT Secret
# Atualizar via Supabase dashboard → Settings → API

# Evolution API Key
docker exec zapp-evolution-api bash -c "
  psql -U postgres evolution -c \"
    UPDATE \\\"Setting\\\" SET value = '<new-key>' WHERE key = 'jwt_secret';
  \"
"

# 2. Atualizar env vars em todos os containers
for container in zapp-edge-functions zapp-app; do
  docker exec $container bash -c "kill -HUP 1"
done

# 3. Invalidar todas as sessões
docker exec zapp-postgres psql -U postgres zapp -c "
  DELETE FROM auth.sessions WHERE created_at < NOW() - INTERVAL '1 hour';
"

# 4. Forçar re-login de todos os usuários
# Adicionar flag "force_reauth": true em user_settings

# 5. Investigar logs de auditoria
docker exec zapp-postgres psql -U postgres zapp -c "
  SELECT * FROM zapp.audit_logs 
  WHERE created_at > NOW() - INTERVAL '24 hours'
  AND action LIKE '%login%'
  ORDER BY created_at DESC;
"
```

**Tempo estimado:** 1-2 horas (incluindo comunicação)

---

## Procedimentos de Prevenção

### Backup Automático

```bash
# Cron job (executar diariamente às 03:00)
0 3 * * * /opt/zapp/scripts/backup-database.sh >> /var/log/zapp-backup.log 2>&1
```

### Script de Backup

```bash
#!/bin/bash
# /opt/zapp/scripts/backup-database.sh

BACKUP_DIR="/backups/zapp"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/zapp-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump completo
docker exec zapp-postgres pg_dump -U postgres zapp | gzip > "$BACKUP_FILE"

# Upload para R2
rclone copy "$BACKUP_FILE" r2:zapp-backups/database/

# Cleanup local (manter últimos 7 dias)
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

echo "Backup complete: $BACKUP_FILE"
```

### Monitoramento Contínuo

```yaml
# prometheus/alerts.yml
groups:
- name: zapp-critical
  rules:
  - alert: DiskSpaceHigh
    expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
    for: 5m
    annotations:
      severity: critical
      summary: "Disk space < 10%"

  - alert: PostgresDown
    expr: pg_up == 0
    for: 1m
    annotations:
      severity: critical
      summary: "PostgreSQL is down"

  - alert: HighErrorRate
    expr: rate(sentry_errors_total[5m]) > 10
    for: 5m
    annotations:
      severity: high
      summary: "Error rate spike"
```

## Contatos de Emergência

| Role | Pessoa | Contato |
|------|--------|---------|
| DevOps Lead | (definir) | (definir) |
| DBA | (definir) | (definir) |
| Product Owner | (definir) | (definir) |
| C-Level | (definir) | (definir) |

## Escalation Matrix

| Severidade | Tempo de Resposta | Quem Notifica |
|------------|-------------------|---------------|
| **P0** (Total outage) | < 15 min | C-Level |
| **P1** (Degraded) | < 1 hora | DevOps Lead |
| **P2** (Bug menor) | < 4 horas | Tech Lead |
| **P3** (Cosmético) | < 24 horas | Próximo sprint |

## Post-Mortem Template

Após cada incidente, preencher:

```markdown
# Post-Mortem: [Incidente]

## Resumo
- Data/Hora:
- Duração:
- Severidade:
- Impacto (usuários afetados, dados perdidos):

## Timeline
- HH:MM - Evento 1
- HH:MM - Evento 2
- HH:MM - Resolução

## Root Cause
- Causa raiz (5 Whys):
  1. Por quê?
  2. Por quê?
  3. ...

## Resolução
- O que foi feito:

## Lições Aprendidas
- O que funcionou bem:
- O que pode melhorar:

## Action Items
- [ ] Ação 1 (responsável, deadline)
- [ ] Ação 2 (responsável, deadline)
```

## Checklist Pós-Recovery

- [ ] Sistema 100% operacional
- [ ] Todos os health checks passando
- [ ] Métricas de latência normalizadas
- [ ] Audit log verificado
- [ ] Backup validado
- [ ] Stakeholders notificados
- [ ] Post-mortem agendado
- [ ] Action items documentados

---

**Última atualização:** 2026-07-24
**Próxima revisão:** 2026-10-24 (3 meses)
