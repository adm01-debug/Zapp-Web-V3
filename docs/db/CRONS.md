# CRONS — Job Scheduling Reference

> Registro de todos os cron jobs ativos no banco — expandido em Step 32.

---

## Registro Canônico

O registro completo está em `ops.cron_canonical_register`.

Ver em tempo real:
```sql
SELECT * FROM ops.v_cron_status;
```

---

## Monitoramento

```sql
-- Status de todos os jobs
SELECT * FROM ops.v_cron_status;

-- Falhas consecutivas
SELECT * FROM ops.v_cron_consecutive_failures;

-- Jobs por minuto (thundering herd)
SELECT * FROM ops.v_crons_by_minute;

-- Histórico de execuções
SELECT * FROM ops.cron_execution_history ORDER BY run_at DESC LIMIT 50;
```

---

## Standards (from Step 33)

- **Nome**: `<schema>-<action>-<target>-<frequency>` (hífen como separador)
- **Exemplos**: `ops-email-cleanup-weekly`, `zapp-matview-refresh-5min`
- **Proibido**: underscore, espaços, maiúsculas
- **Idempotência**: Todos os jobs devem ser idempotentes
- **Max runtime**: 3600s default, ajustar por job

---

## Health Checks

```sql
-- Função de health check
SELECT ops.fn_health_check();
```
