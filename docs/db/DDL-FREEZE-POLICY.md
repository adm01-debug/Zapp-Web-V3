# Política de Freeze de DDL

**Vigente durante o Plano DB de 50 Etapas (ondas 0–5).**

---

## Regra geral

> **Uma única mudança estrutural coordenada por vez.**  
> Nenhuma DDL simultânea de agentes, devs ou crons fora do fluxo normal.

---

## O que é DDL estrutural

- `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE ... ADD/DROP COLUMN`
- `CREATE VIEW`, `DROP VIEW`, `CREATE OR REPLACE VIEW`
- `CREATE FUNCTION`, `DROP FUNCTION`, `CREATE OR REPLACE FUNCTION`
- `CREATE INDEX`, `DROP INDEX`
- `ALTER TYPE`, `CREATE DOMAIN`
- Qualquer mudança em schemas de negócio (`zapp`, `evo`, `bpm`, `email_app`, `ai`, `financeiro`, `vendas`, `logistica`, `artes`, `ops`, `archive`)

## O que NÃO é bloqueado pelo freeze

- `INSERT`, `UPDATE`, `DELETE` (DML normal)
- `VACUUM`, `ANALYZE` (utilitário)
- Criação de partições pelo cron `auto-create-monthly-partitions` (operação declarada)
- Views recriadas pelo cron `ensure-evolution-backcompat-views` (operação declarada — mas etapa 11 tornará isso controlado)

---

## Durante o freeze

| Ação | Quem pode | Processo |
|---|---|---|
| DDL na onda corrente | Dev/agente designado | Migration versionada → staging → aprovação → prod |
| DDL urgente (incidente) | DBA sênior ou service_role | Documentar em `ops.ddl_audit` + criar migration retroativa em <24h |
| DDL de outra onda | ❌ Bloqueado | Aguardar conclusão da onda corrente |
| DDL manual sem migration | ❌ Bloqueado | Gera alerta P1 (etapa 3) |

---

## Onda em andamento

| Campo | Valor |
|---|---|
| Onda atual | 0 — Salvaguardas |
| Data início | 27/07/2026 |
| Responsável | time de plataforma |
| Próxima onda | 1 (Fronteiras de Schema) — aguardar staging |

---

## Verificação rápida antes de qualquer DDL

```sql
-- Há DDL pendente não coberto por migration?
SELECT schema_name, object_name, object_type, detected_at, age
FROM ops.v_ddl_violations_unresolved
ORDER BY detected_at DESC;

-- Última migration aplicada
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
ORDER BY inserted_at DESC LIMIT 5;

-- Estado do cron de guardrail
SELECT jobname, last_run_status, last_end_time
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
WHERE j.jobname = 'ops-guardrails-deadman'
ORDER BY jrd.end_time DESC LIMIT 1;
```

---

## Histórico de ondas

| Onda | Etapas | Início | Fim | Status |
|---|---|---|---|---|
| 0 — Salvaguardas | 1–4 | 27/07/2026 | — | ▶ Em andamento |
| 1 — Fronteiras | 5–15 | — | — | ⏳ Aguarda staging |
| 2 — Tabelas/Tipos/RLS | 16–24 | — | — | ⏳ Aguarda onda 1 |
| 3 — Índices | 25–31 | — | — | ⏳ Pode sobrepor onda 2 |
| 4 — Crons | 32–38 | — | — | ⏳ Aguarda onda 2 |
| 5 — Documentação | 39–50 | 27/07/2026 | — | ▶ Em andamento (paralelo) |
