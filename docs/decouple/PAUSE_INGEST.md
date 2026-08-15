# Runbook: Pausa Segura da Ingestão Evolution→ZAPP

**Versão:** 1.0  
**Data:** 2026-08-15  
**Tipo:** Runbook Operacional  
**Aplica-se a:** Administradores do sistema ZAPP web v3

---

## Objetivo

Este runbook define o procedimento seguro para **pausar temporariamente** o fluxo de ingestão
de dados da Evolution API para o banco de dados ZAPP, sem perda de mensagens e com rollback
garantido.

---

## Quando Usar Este Runbook

| Cenário | Usar Pausa? |
|---------|-------------|
| Manutenção planejada de migrations `evo.*` | **Sim** |
| Debugging de violações de invariante I1/I2 | **Sim** |
| Teste de substituição de provider HTTP | **Sim** |
| Rotação de credenciais Evolution API | **Não** — vault update é suficiente |
| Deploy de edge functions ZAPP | **Não** — ingestão é independente |
| Incidente de produção crítico (trafego malicioso) | **Sim** |

---

## Arquitetura do Fluxo de Ingestão

```
Evolution API (VPS)
  ↓ POST /functions/v1/evolution-webhook
Supabase Edge Function: evolution-webhook
  ↓ INSERT / UPSERT
Schema evo.* (tabelas físicas no pg14 compartilhado)
  ↓ views de contrato (12 views read-only)
Schema zapp.* (leitura via SELECT)
```

**Pontos de pausa possíveis:**
1. **Nível webhook** — desabilitar entrega do webhook na Evolution API
2. **Nível edge function** — desabilitar a edge function `evolution-webhook`
3. **Nível cron** — desabilitar jobs de sincronização que ler de `evo.*`

---

## Pré-condições (Verificar Antes de Pausar)

```sql
-- 1. Confirmar volume de mensagens nas últimas 5 minutos
SELECT COUNT(*) as msgs_5min
FROM evo.evolution_messages
WHERE created_at > NOW() - INTERVAL '5 minutes';

-- 2. Confirmar jobs ativos de ingestão
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname ILIKE '%evolution%' OR jobname ILIKE '%evo%' OR jobname ILIKE '%ingest%'
ORDER BY jobid;

-- 3. Verificar se há backlog pendente
SELECT COUNT(*) as pending_webhooks
FROM zapp.webhook_audit_log
WHERE processed_at IS NULL
  AND created_at > NOW() - INTERVAL '10 minutes';

-- 4. Confirmar última mensagem recebida
SELECT MAX(created_at) as ultima_msg
FROM evo.evolution_messages;
```

---

## Procedimento de Pausa

### Fase 1 — Avisar a equipe

```
Notificar no canal de operações:
"[MANUTENÇÃO] Iniciando pausa de ingestão Evolution→ZAPP.
Duração estimada: ____ minutos.
Operador: ____
Motivo: ____"
```

### Fase 2 — Pausar webhook na Evolution API

1. Acessar painel da Evolution API (via portainer ou acesso direto à VPS)
2. Navegar em: **Instance → wpp2 → Webhook Settings**
3. Desabilitar o webhook endpoint do ZAPP:
   ```
   URL: https://supabase.atomicabr.com.br/functions/v1/evolution-webhook
   ```
4. **Não deletar** — apenas desabilitar (toggle off)
5. Anotar o horário exato da pausa: `____:____ UTC`

### Fase 3 — Pausar cron jobs de sincronização (se aplicável)

```sql
-- Listar jobs relacionados à ingestão evo
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE active = true
  AND (jobname ILIKE '%evolution%' OR jobname ILIKE '%ingest%' OR jobname ILIKE '%sync%');

-- Pausar jobs identificados (substituir IDs reais)
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = '<nome>';
-- OU via pg_cron:
UPDATE cron.job SET active = false
WHERE jobname IN ('<lista_de_jobs_identificados>');
```

### Fase 4 — Confirmar pausa

```sql
-- Aguardar 2 minutos e verificar que COUNT para de crescer
SELECT COUNT(*) as msgs_apos_pausa
FROM evo.evolution_messages
WHERE created_at > NOW() - INTERVAL '1 minute';
-- Resultado esperado: 0 (ou número baixo de mensagens antigas)

-- Verificar que edge function não recebe chamadas
-- (monitor nos logs da edge function)
```

---

## Executar Manutenção

Execute o trabalho planejado neste intervalo.

**Tempo máximo recomendado de pausa:** 30 minutos  
**Se ultrapassar 30 min:** reavaliar e comunicar stakeholders

---

## Procedimento de Retomada

### Fase A — Verificar estado pré-retomada

```sql
-- Confirmar que manutenção foi concluída com sucesso
-- Verificar que não há locks bloqueando inserção
SELECT pid, state, query, wait_event_type, wait_event
FROM pg_stat_activity
WHERE state != 'idle'
  AND query ILIKE '%evo.%'
ORDER BY duration DESC
LIMIT 20;
```

### Fase B — Reabilitar cron jobs (se pausados)

```sql
-- Reabilitar jobs pausados na Fase 3
UPDATE cron.job SET active = true
WHERE jobname IN ('<lista_de_jobs_pausados>');
```

### Fase C — Reabilitar webhook na Evolution API

1. Retornar ao painel da Evolution API
2. Reabilitar o webhook do ZAPP (toggle on)
3. Anotar horário de retomada: `____:____ UTC`

### Fase D — Verificar retomada

```sql
-- Aguardar 2 minutos após reabilitar
SELECT COUNT(*) as msgs_pos_retomada
FROM evo.evolution_messages
WHERE created_at > NOW() - INTERVAL '2 minutes';
-- Resultado esperado: > 0 (mensagens chegando novamente)

-- Verificar webhook_audit_log recebendo eventos
SELECT COUNT(*) as webhooks_2min
FROM zapp.webhook_audit_log
WHERE created_at > NOW() - INTERVAL '2 minutes';
```

### Fase E — Notificar retomada

```
Notificar no canal de operações:
"[MANUTENÇÃO CONCLUÍDA] Ingestão Evolution→ZAPP retomada.
Horário de pausa: ____:____ UTC
Horário de retomada: ____:____ UTC
Duração total: ____ minutos
Status: OK / PARCIAL / INCIDENTE"
```

---

## Rollback de Emergência

Se a manutenção falhar ou causar estado inválido:

### Rollback SQL Rápido

```sql
-- 1. Desfazer migration (se foi o alvo da manutenção)
-- [executar script de rollback específico da migration]

-- 2. Verificar integridade referencial
SELECT
  tc.table_schema,
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (tc.table_schema = 'evo' OR ccu.table_schema = 'evo')
  AND (tc.table_schema = 'zapp' OR ccu.table_schema = 'zapp');
```

### Sinalizar Incidente

Se o rollback não resolver:
1. Manter webhook pausado
2. Abrir incidente: `INCIDENT-<YYYYMMDD>-INGEST-PAUSE`
3. Escalar para o responsável técnico
4. Não reabilitar webhook até estado ser validado

---

## Métricas de SLA Durante Pausa

| Métrica | Limite Aceitável |
|---------|-----------------|
| Duração máxima de pausa | 30 minutos |
| Mensagens perdidas (buffer Evolution) | 0 (Evolution faz retry) |
| Latência máxima pós-retomada | < 5 minutos para normalizar |

> **Nota:** A Evolution API tem buffer de retry interno. Mensagens enviadas durante a pausa
> serão entregues automaticamente quando o webhook for reabilitado, **desde que a pausa
> não ultrapasse o TTL do buffer da Evolution** (tipicamente 24h).

---

## Registros de Uso Deste Runbook

| Data | Operador | Motivo | Duração | Status |
|------|----------|--------|---------|--------|
| (nenhum registro ainda) | | | | |

---

## Referências

- `docs/decouple/ROLLBACK_TRIGGERS.md` — Condições que disparam rollback
- `docs/decouple/CREDENTIAL_BOUNDARY.md` — Mapa de credenciais
- `infra/runbooks/OPERATIONS.md` — Runbook geral de operações
- ADR-009: Gateway Pattern
- ADR-010: SQL Gateway
- ADR-011: Egress Gateway
