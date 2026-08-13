# Pre-flight Checklist — SET SCHEMA evo → zapp

**Seguir na ordem. Cada item deve resultar 0 antes de prosseguir.**
**Baseado no ensaio sintético de 2026-08-13 (ver SIMULATION_REPORT.md).**

## Para qualquer tabela TABELA_ALVO

### P1 — Verificar colisão de nome
```sql
SELECT EXISTS(
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='zapp' AND c.relname='TABELA_ALVO' AND c.relkind='r'
) AS colisao_existe;
-- Deve retornar false. Se true: resolver colisão primeiro.
```

### P2 — Verificar funções com referência literal
```sql
SELECT p.proname, n.nspname AS schema_fn
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosrc ILIKE '%evo.TABELA_ALVO%';
-- Deve retornar 0 linhas. Se não: qualificar com schema novo antes.
```

### P3 — Verificar crons com referência literal
```sql
SELECT jobname, schedule FROM cron.job
WHERE command ILIKE '%evo.TABELA_ALVO%';
-- Deve retornar 0 linhas. Se não: atualizar command do cron.
```

### P4 — Verificar locks ativos
```sql
SELECT pid, state, query_start, left(query,80) q
FROM pg_stat_activity
WHERE state='active' AND query NOT ILIKE '%pg_stat%'
  AND query ILIKE '%TABELA_ALVO%';
-- Deve retornar 0 linhas ou apenas a própria sessão de verificação.
```

### P5 — Snapshot de contagem antes
```sql
SELECT count(*) AS rows_antes FROM evo.TABELA_ALVO;
-- Guardar número para validação pós-move.
```

### P6 — SET SCHEMA (executar)
```sql
ALTER TABLE evo.TABELA_ALVO SET SCHEMA zapp;
```

### P7 — Validação imediata pós-move (todos devem ser true/igual)
```sql
SELECT
  EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='zapp' AND c.relname='TABELA_ALVO') AS tabela_em_zapp,
  NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='evo' AND c.relname='TABELA_ALVO') AS tabela_saiu_evo,
  (SELECT count(*) FROM zapp.TABELA_ALVO) AS rows_apos,
  -- rows_apos deve ser igual a rows_antes
  (SELECT count(*) FROM public.TABELA_ALVO) AS rows_via_public_view;
  -- Se 0 e tinha dados: view public quebrou (improvável mas verificar)
```

### P8 — Monitorar crons por 10 minutos
```sql
-- Rodar a cada 3 minutos por 10 minutos
SELECT jobname, last_run_status, last_run_time
FROM (
  SELECT j.jobname,
    (SELECT status FROM cron.job_run_details d WHERE d.jobid=j.jobid
     ORDER BY start_time DESC LIMIT 1) AS last_run_status,
    (SELECT start_time FROM cron.job_run_details d WHERE d.jobid=j.jobid
     ORDER BY start_time DESC LIMIT 1) AS last_run_time
  FROM cron.job j WHERE j.command ILIKE '%TABELA_ALVO%'
     OR j.command ILIKE '%fn_%'
) x
WHERE last_run_status IS DISTINCT FROM 'succeeded';
-- Deve retornar 0 linhas. Se não: função com literal ainda existe → qualificar.
```

## Bloqueadores conhecidos (resolver antes de qualquer migração)

| Bloqueador | Status | Ação |
|---|---|---|
| `evo.contact_id_graveyard` 125 linhas ≠ `zapp.contact_id_graveyard` 644 linhas | ⚠️ Dados divergentes | Auditar, merge ou deprecar duplicata em evo |
| `evo._snapshot_version_state` ≅ `zapp._snapshot_version_state` | ⚠️ Colisão de nome | Verificar se são a mesma coisa; dropar evo se redundante |
| `anon` tem `search_path=evo, public` | ⚠️ evo na frente | Corrigir para `search_path=public, extensions` antes de dropar qualquer view-alias |
| 139 funções `evo.*` com literal `evo.tablename` | 🔧 Trabalho mecânico | Script de qualificação por tabela |
| 100 crons com `evo.fn_*` no comando | 🔧 Trabalho mecânico | Atualizar command se função mudar de schema |

---

## Registro de execuções

### Lote 1 — 2026-08-13 (5 tabelas de baixo risco)

**Simulação de cenários executada antes:**
- Ensaio sintético SET SCHEMA confirmou: views OID-based sobrevivem, funções com literal quebram, RLS segue tabela
- G7 confirmou: funções referenciando essas 5 tabelas usam referência NÃO qualificada → resolvem por search_path após move
- `cleanup_evolution_fallback_events` já usava `zapp.evolution_fallback_events` (via VIEW alias) → após move usa TABLE diretamente

**Bloqueador identificado e resolvido:**
- Todas as 5 tabelas tinham VIEW alias em `zapp` → bloqueavam SET SCHEMA
- Sequência: `DROP VIEW zapp.tabela` → `ALTER TABLE evo.tabela SET SCHEMA zapp`
- View em `public` sobreviveu por OID (dados legíveis via `public.tabela` antes e depois)

**Validação pós-execução:**
| Tabela | Em zapp? | Fora de evo? | RLS? | Dados via public? |
|---|---|---|---|---|
| evolution_spam_keywords | ✅ | ✅ | 2 policies | ✅ 5 linhas |
| evolution_source_schema_map | ✅ | ✅ | 2 policies | ✅ 0 linhas |
| evolution_mirror_runs | ✅ | ✅ | 2 policies | ✅ 0 linhas |
| evolution_status_reactions | ✅ | ✅ | 2 policies | ✅ 0 linhas |
| evolution_fallback_events | ✅ | ✅ | 2 policies | ✅ 0 linhas |

**Gate pós-move:** `38 pendentes + 1 migrado + 0 críticos` ✅

---

## Nota sobre contact_id_graveyard — NÃO é um bloqueador

`evo.contact_id_graveyard` e `zapp.contact_id_graveyard` são **tabelas intencionalmente diferentes**:

| | evo.contact_id_graveyard | zapp.contact_id_graveyard |
|---|---|---|
| Colunas | 10 (inclui `original_remote_jid`, `lid_jid`, `merge_strategy`, `pre_merge_snapshot`) | 5 (inclui `original_workspace_id`) |
| Linhas | ~125 | ~644 |
| Propósito | Gerenciamento de IDs LID/Baileys (merges de dedup) | Rastreamento de contatos deletados no Workspace Zapp |
| Dono | Evolution-stack (Grupo A) | Zapp (Grupo B, já no schema correto) |
| Interseção | 125 IDs em ambas; 1 só em evo; 521 só em zapp | — |

**Não fazer SET SCHEMA nem merge.** Cada uma serve ao seu dono.
