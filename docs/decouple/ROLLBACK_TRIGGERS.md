# Gatilhos de Rollback — Desacoplamento ZAPP×Evolution

**Versão:** 1.0  
**Data:** 2026-08-15  
**Tipo:** Documento de Controle de Risco  
**Relacionado:** ADR-009, ADR-010, ADR-011, ADR-012

---

## Princípio

O desacoplamento é um processo incremental e irreversível **por design** —
cada invariante aprovado não deve ser revertido. Porém, durante a transição,
certas condições exigem **pausa ou rollback parcial** de etapas específicas
para proteger a produção.

> **Rollback total** (restaurar acoplamento original) é proibido.
> Apenas rollback **por invariante** é permitido.

---

## Tabela de Gatilhos de Rollback

| ID | Gatilho | Severidade | Ação | Invariante Afetado |
|----|---------|-----------|------|-------------------|
| RT-01 | Taxa de erro de webhook > 5% em 5min | CRÍTICA | Parar deploy, rollback migration | I4 |
| RT-02 | Lag de mensagens > 10min (consumer parado) | CRÍTICA | Reverter mudança em cron/pg_net | I4 |
| RT-03 | FK violation `evo→zapp` causando falha de INSERT | CRÍTICA | Reverter DROP de FK | I9 |
| RT-04 | `ops.fn_evo_url()` retorna NULL/erro em prod | CRÍTICA | Verificar vault + rollback função | I4 |
| RT-05 | Score de invariantes regride (Nota cai) | ALTA | Investigar e corrigir antes de continuar | Geral |
| RT-06 | Função zapp referencia `evo.*` após refatoração | ALTA | Reverter migration + reescrever função | I1 |
| RT-07 | Função evo referencia `zapp.*` após refatoração | ALTA | Reverter migration + reescrever função | I2 |
| RT-08 | CI decouple-guard.yml falha em main | ALTA | Bloquear merge, investigar | I5 |
| RT-09 | Edge function `evolution-webhook` com error rate > 1% | MÉDIA | Reverter versão da edge function | Geral |
| RT-10 | Mensagens duplicadas após mudança de gateway | MÉDIA | Rollback version da edge function | I4 |
| RT-11 | `boundary-audit.mjs` errored em > 2 invariantes | MÉDIA | Pausar trabalho, investigar offline | Geral |
| RT-12 | sql-gate CI falha com false positives | BAIXA | Ajustar WHITELIST, não regredir | I8 |
| RT-13 | inventory.mjs reporta bypass > 0 em main | BAIXA | Identificar novo bypass + corrigir | I7 |

---

## Procedimentos de Rollback por Invariante

### I4 — Rollback de Egresso HTTP

**Sintomas:** cron jobs falham em acessar Evolution API, mensagens param de chegar.

```sql
-- 1. Verificar último job executado com sucesso
SELECT jobid, jobname, last_run, last_error
FROM cron.job_run_details
WHERE jobid IN (261, 427, 476, 477, 478)  -- I4 violation jobs
ORDER BY last_run DESC
LIMIT 10;

-- 2. Reverter job para versão anterior (se migration alterou o job)
-- [executar SQL do rollback específico da migration]

-- 3. Verificar que jobs voltam a executar
SELECT cron.job_run_details(jobid, 1) FROM cron.job WHERE jobid = <ID>;
```

**Decisão de rollback:** Se erro persiste por > 5 min, reverter migration e abrir issue.

---

### I9 — Rollback de FKs Cross-Schema

**Sintomas:** INSERTs em `evo.*` falham com FK violation (se FKs foram alteradas incorretamente).

```sql
-- 1. Verificar FKs atuais entre schemas
SELECT
  tc.constraint_name,
  tc.table_schema || '.' || tc.table_name AS tabela_origem,
  ccu.table_schema || '.' || ccu.table_name AS tabela_referenciada,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
WHERE (tc.table_schema = 'evo' AND ccu.table_schema = 'zapp')
   OR (tc.table_schema = 'zapp' AND ccu.table_schema = 'evo');

-- 2. Se FK foi removida prematuramente e causou inconsistência:
-- Re-adicionar FK temporariamente (enquanto investiga)
ALTER TABLE evo.<tabela_afetada>
  ADD CONSTRAINT <nome_original>
  FOREIGN KEY (<coluna>) REFERENCES zapp.<tabela_zapp>(<coluna>)
  ON DELETE SET NULL;  -- Nunca CASCADE ao restaurar

-- 3. Verificar integridade dos dados
SELECT COUNT(*) as orfaos
FROM evo.<tabela_afetada> t
WHERE t.<coluna_fk> IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM zapp.<tabela_zapp> z WHERE z.id = t.<coluna_fk>
  );
```

---

### I1/I2 — Rollback de Refs Cross-Schema em SQL

**Sintomas:** Função que antes funcionava passa a retornar erro após refatoração.

```sql
-- 1. Identificar função com problema
SELECT proname, prosrc
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'zapp'  -- ou 'evo'
  AND proname = '<nome_da_funcao>';

-- 2. Comparar com versão do baseline
-- Consultar: docs/decouple/baseline/20260815/zapp_evo_refs.json

-- 3. Rollback via migration reversal
-- [executar SQL de DROP e recreate da versão anterior]
```

---

## Decisão de Rollback — Árvore de Decisão

```
Problema detectado em produção?
├── Sim: Taxa de erro > 5%?
│   ├── Sim → ROLLBACK IMEDIATO (RT-01/RT-02)
│   └── Não: Dados inconsistentes?
│       ├── Sim → PAUSA + INVESTIGAÇÃO (RT-03/RT-06/RT-07)
│       └── Não: Score de invariante regrediu?
│           ├── Sim → INVESTIGAR antes de continuar (RT-05)
│           └── Não → Monitorar / baixa prioridade
└── Não: Verificar via boundary-audit.mjs (modo offline)
```

---

## Sinais de Alerta (Monitoramento Contínuo)

### Queries de Monitoramento

```sql
-- Taxa de erro de webhook (últimas 5 minutos)
SELECT
  COUNT(*) FILTER (WHERE status_code >= 400) AS erros,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status_code >= 400) / NULLIF(COUNT(*), 0), 2) AS taxa_erro_pct
FROM zapp.webhook_audit_log
WHERE created_at > NOW() - INTERVAL '5 minutes';
-- Alerta se taxa_erro_pct > 5

-- Lag de mensagens (última mensagem recebida)
SELECT
  NOW() - MAX(created_at) AS lag_mensagens
FROM evo.evolution_messages;
-- Alerta se lag > 10 minutos

-- Cron jobs com erros recentes
SELECT jobid, jobname, last_error, last_run
FROM cron.job
WHERE last_error IS NOT NULL
  AND last_run > NOW() - INTERVAL '30 minutes'
ORDER BY last_run DESC;
```

---

## Registro de Rollbacks

| Data | ID do Gatilho | Invariante | Ação Executada | Resolução | Duração |
|------|--------------|-----------|----------------|-----------|---------|
| (nenhum registro ainda) | | | | | |

---

## Comunicação Durante Rollback

### Template de Incidente

```
[ROLLBACK] Gatilho: <ID>
Invariante afetado: <I1-I9>
Detectado: <timestamp UTC>
Operador: <nome>
Ação: <descrição>
Impacto estimado: <usuários/funcionalidades>
ETA de resolução: <estimativa>
Canal de acompanhamento: #ops-incidents
```

---

## Referências

- `docs/decouple/PAUSE_INGEST.md` — Procedimento de pausa de ingestão
- `docs/decouple/CREDENTIAL_BOUNDARY.md` — Fronteira de credenciais
- `docs/decouple/BOUNDARY_SCORE_T0.json` — Score T0 de referência (3/9)
- `docs/decouple/ADR-012-T0-MEASUREMENT.md` — Baseline formal
- `scripts/decouple/boundary-audit.mjs` — Tool de rerun dos invariantes
