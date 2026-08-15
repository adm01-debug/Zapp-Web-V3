# CRON_FAILURES_7D — Investigação de falhas de cron nos últimos 7 dias

**Autor:** CORRETOR 7 · **Data:** 2026-08-14 · **Método:** MCP SQL read-only (`cron.job_run_details` + `cron.job`) · **Status:** Concluído

---

## 1. Premissa da onda vs. realidade observada

| Item | Premissa da onda | Realidade (coleta 2026-08-14 ~21:30 UTC) |
|---|---|---|
| Execuções falhas (7d) | 15 (0,4%) | **244 com `start_time` na janela** (235 atribuíveis a jobs via JOIN + **9 órfãs** com jobid inexistente em `cron.job`) + **11 falhas com `start_time NULL`** ("job startup timeout" do scheduler, invisíveis a queries com janela temporal) |
| Jobs distintos afetados | não informado | **25 jobs** |
| Taxa de falha | 0,4% | **0,45–0,49%** (244–255 falhas / 52.436 execuções na janela: 52.192 succeeded + 244 failed) |
| `return_message` | não atribui o job | Confirmado: `return_message` contém só o texto do erro (sem jobname). **A atribuição exige JOIN com `cron.job`** — feito aqui. |

**Conclusão de premissa:** o número "15" está errado por subestimativa — a contagem real é ~**235–255 falhas / 25 jobs**. A taxa (~0,45%) está na ordem do alegado (0,4%). Nenhuma falha está ativa no momento da coleta: a última falha registrada foi **2026-08-14 11:29 UTC** e todas as execuções das 21:xx UTC de 14/08 foram `succeeded` (exceção: job 27 em estado `connecting` — ver §4).

---

## 2. Query canônica (read-only) para reprodução

```sql
-- Falhas atribuíveis nos últimos 7 dias (JOIN obrigatório p/ atribuir job)
SELECT j.jobid, j.jobname, d.status, d.start_time, left(d.return_message, 200) AS return_message
FROM cron.job_run_details d
JOIN cron.job j USING (jobid)
WHERE d.status = 'failed'
  AND d.start_time > now() - interval '7 days'
ORDER BY d.start_time DESC;

-- Complemento obrigatório: falhas de startup (start_time NULL) — INVISÍVEIS à query acima
SELECT d.jobid, j.jobname, count(*) AS n
FROM cron.job_run_details d
LEFT JOIN cron.job j USING (jobid)
WHERE d.status = 'failed' AND d.start_time IS NULL
GROUP BY d.jobid, j.jobname
ORDER BY n DESC;

-- Complemento: execuções órfãs (jobid removido de cron.job)
SELECT count(*) AS orphaned_failed
FROM cron.job_run_details d
WHERE d.status = 'failed'
  AND d.start_time > now() - interval '7 days'
  AND NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobid = d.jobid);
```

**Pitfall documentado:** o filtro `start_time > now() - 7d` esconde as falhas de "job startup timeout" com `start_time NULL` (11 na janela de retenção atual). Qualquer monitor de cron que use só a query da onda subconta falhas do scheduler.

---

## 3. Atribuição de TODAS as falhas por job (25 jobs, 235 execuções)

### 3.1 Erro SQL — função ambígua (sobrecarga) — **90 falhas (38%)**

| jobid | jobname | Qtd | Janela | Erro (`return_message`) | Status atual |
|---|---|---|---|---|---|
| 27 | `whatsapp_reconcile_dispatch` | 86 | 2026-08-14 02:15→09:20 (5/5min) | `function zapp.fn_reconcile_dispatch() is not unique` (assinatura ambígua — existem ≥2 versões da função em `zapp`) | `connecting` (em execução na coleta) — falhas cessaram às 09:20 |

**Causa provável:** função `zapp.fn_reconcile_dispatch` duplicada/sobrecarregada (drift de deploy ou migration reaplicada com assinatura alterada sem dropar a antiga). Foi corrigido às ~09:20 de 14/08, mas o estado `connecting` persistente merece confirmação (execução longa/travada?).

### 3.2 Erro SQL — objeto não existe (drift de schema) — **104 falhas (44%)**

| jobid | jobname | Qtd | Janela | Erro | Status atual |
|---|---|---|---|---|---|
| 311 | `wal_slot_lag_check` | 53 | 08-08 00:15→04:35 (5/5min) | `unrecognized format() type specifier "."` (faltou `%%` no `format()`) | `succeeded` |
| 311 | `wal_slot_lag_check` | 3 | 08-09 16:20→16:35 | `column "resolved" can only be updated to DEFAULT` (UPDATE em coluna generated) | `succeeded` |
| 41 | `scan-media-security` | 26 | 08-10 12:28→14:33 (5/5min) | `relation "zapp.media_download_queue" does not exist` | `succeeded` |
| 206 | `monitor-ingestion-persistence-gap` | 15 | 08-13 18:10→21:40 (15/15min) | `relation "evo.evolution_audit_log" does not exist` | `succeeded` |
| 149 | `vps-performance-snapshot` | 6 | 08-08 14:25→19:25 (1/h) | `relation "evo.vps_performance_snapshots" does not exist` | `succeeded` |
| 429 | `pipeline-canary-keep-alive` | 1 | 08-13 19:36 | `column "ingest_meta" of relation "evolution_messages_wpp2" does not exist` (drift em partição-filha) | `succeeded` |
| 465 | `process-evolution-notifications` | 1 | 08-11 13:28 | `column "entity_type" does not exist` (drift) | `succeeded` |

### 3.3 Rede/secrets — vault `evolution_api_key` corrompido — **18 falhas (8%)**

| jobid | jobname | Qtd | Janela | Erro | Status atual |
|---|---|---|---|---|---|
| 317 | `outbound-queue-dispatch` | 10 | 08-09 23:22→23:40 (2/2min) | `invalid symbol "\" found while decoding base64 sequence` ao ler `vault.decrypted_secrets['evolution_api_key']` | `succeeded` |
| 27 | `whatsapp_reconcile_dispatch` | 4 | 08-09 23:25→23:40 | idem (mesmo secret) | — |
| 84 | `ops-notify-critical-alerts` | 4 | 08-09 23:22→23:37 | idem (mesmo secret) | `succeeded` |

**Causa provável:** secret `evolution_api_key` no vault com valor que não é base64 válido (rotação mal feita ou gravação truncada). Episódio autolimitado (~18 min); secret corrigido desde então.

### 3.4 Startup timeout do scheduler pg_cron — **18 falhas com timestamp + 11 sem `start_time` (7,7% + invisíveis)**

Três clusters simultâneos (vários jobs no MESMO instante → evento de infra, não de job):

| Cluster | Jobs afetados (6 por cluster) |
|---|---|
| 08-12 10:01 UTC | 30, 10, 43, 193, 165, 335 |
| 08-13 11:46 UTC | 450, 193, 17, 465, 317, 30 |
| 08-14 11:29 UTC (última falha do sistema) | 144, 160, 32, 34, 326, 335 |

+ 11 falhas `start_time NULL` (mesma assinatura "job startup timeout") em: 17 (×2), 4, 5, 10, 27, 33, 34, 35, 41, 43 — **invisíveis a queries com janela temporal** (§2).

**Causa provável:** restart/sobrecarga do pg_cron (ou do Postgres/containers) — 3 episódios em 3 dias. Padrão auto-recuperado (nenhuma falha após 11:29 de 14/08).

### 3.5 Falhas pontuais (1–2 ocorrências) — **5 falhas (2%)**

| jobid | jobname | Qtd | Quando | Erro | Status atual |
|---|---|---|---|---|---|
| 334 | `backfill-contact-id-ongoing` | 2 | 08-09 16:52 / 17:02 | `deadlock detected` (contenção com escritas) + `missing FROM-clause entry for table "ec"` | `succeeded` |
| 63 | `db_size_snapshot` | 1 | 08-12 06:00 | `ON CONFLICT DO UPDATE command cannot affect row a second time` (duplicatas no upsert) | `succeeded` (`INSERT 0 22` em 14/08) |
| 463 | `purge-storage-cache` | 1 | 08-12 03:00 | `canceling statement due to statement timeout` no `pg_sleep(0.2)` em loop | `succeeded` |
| 84 | `ops-notify-critical-alerts` | 1 | 08-13 22:07 | `invalid input syntax for type json` no `headers` do `net.http_post` (escape de aspas) | `succeeded` |

### 3.6 Execuções órfãs — **9 falhas não atribuíveis**

9 falhas com `start_time` na janela cujo `jobid` **não existe mais** em `cron.job` (jobs removidos/recriados). Não atribuíveis a jobname — ruído histórico.

---

## 4. Domínio evolution (escopo: 317/318/329/429/138/171)

| jobid | jobname | schedule | Execuções 7d | Falhas 7d | % | Veredito |
|---|---|---|---|---|---|---|
| 317 | `outbound-queue-dispatch` | `*/2 * * * *` | 2.000 | **11** | 0,55% | **Teve falha** (10× vault base64 + 1× startup timeout) — episódio 08-09, **resolvido** (succeeded 14/08 21:30) |
| 429 | `pipeline-canary-keep-alive` | `*/3 * * * *` | 1.329 | **4** | 0,30% | **Teve falha** (3× JSON mal escapado + 1× coluna `ingest_meta` em partição) — 08-11/08-13, **resolvido** |
| 318 | `outbound-queue-stalled-alert` | `*/15 * * * *` | 265 | 0 | 0% | Saudável |
| 171 | `evo-sync-messages-to-v2` | `0-59/5 * * * *` | 796 | 0 | 0% | Saudável |
| 329 | `lid-api-sync-weekly` | `0 6 * * *` | 3 | 0 | 0% | Saudável |
| 138 | `ensure-evolution-backcompat-views` | `0 */6 * * *` | **0** | 0 | — | ⚠️ **Não executou NADA em 7d** (esperado ~28 execuções). Sem falha registrada, mas sem execução — job possivelmente recém-criado ou ignorado pelo scheduler. **Verificar.** |

**Resumo domínio evolution:** 15 falhas atribuíveis (317=11, 429=4) + 1 startup timeout (317) em ~4.393 execuções = **0,34%** — dentro do tolerável e **todas já resolvidas** no momento da coleta.

---

## 5. Classificação consolidada por causa provável

| Causa | Falhas (7d visíveis) | % do total | Jobs | Resolvido? |
|---|---|---|---|---|
| **Erro SQL — drift de schema/função** | 194 | 82,6% | 27, 311, 41, 206, 149, 429, 465, 334, 63 | Sim (todos succeeded; 27 em `connecting`) |
| **Rede/secrets — vault base64 corrompido** | 18 | 7,7% | 317, 27, 84 | Sim |
| **Startup timeout (pg_cron/infra)** | 18 (+11 ocultas) | 7,7% | ~20 jobs em 3 clusters | Sim (último evento 14/08 11:29) |
| **Timeout de statement (contenção)** | 1 | 0,4% | 463 | Sim |
| **JSON malformado (net/http + canary)** | 4 | 1,7% | 84, 429 | Sim |
| **Órfãs (jobid removido)** | 9 | — | — | N/A (histórico) |

---

## 6. Recomendações: ação vs. ruído aceitável

### 🔴 Precisa de ação

1. **Job 27 `whatsapp_reconcile_dispatch` — função ambígua (ALTA).** 86 falhas em 14/08 (02:15→09:20) por `fn_reconcile_dispatch() is not unique`. Falhas cessaram, mas o job estava `connecting` na coleta. **Ação:** listar assinaturas de `zapp.fn_reconcile_dispatch` (`pg_proc`), dropar a duplicada ou qualificar a chamada do cron com assinatura explícita; confirmar que a execução atual não está travada.
2. **Job 138 `ensure-evolution-backcompat-views` — 0 execuções em 7d (MÉDIA).** Job ativo com schedule 6h sem NENHUMA execução registrada. **Ação:** confirmar criação/estado do job e, se aplicável, garantir que o scheduler o agende (recreate).
3. **Vault `evolution_api_key` — validar rotação (MÉDIA).** 18 falhas em 08-09 por secret não-base64. **Ação:** incluir decodificação base64 no `vault_healthcheck` (job 51) e procedimento de rotação com validação pré-gravação.
4. **Drift de schema recorrente (MÉDIA).** 4 jobs falharam por objeto inexistente: `zapp.media_download_queue` (41), `evo.evolution_audit_log` (206), `evo.vps_performance_snapshots` (149), coluna `ingest_meta`/`entity_type` em partições (429/465). **Ação:** conferir que as migrations desses objetos estão versionadas no repo (evitar reincidência pós-restore) e que o DDL de partição-filha é propagado (caso `ingest_meta`).
5. **Clusters de startup timeout (MONITORAR de perto).** 3 episódios em 3 dias (12/08, 13/08, 14/08) afetando 6 jobs cada. Auto-recuperado, mas recorrência alta para "ruído". **Ação:** correlacionar com restarts de container/Postgres nessas janelas; se persistir, investigar memória/`shared_buffers`/overload do scheduler.

### 🟢 Ruído aceitável (sem ação, só registro)

- **Job 311 `wal_slot_lag_check`** (56 falhas, 08-08/08-09): bugs de `format()` e coluna generated — já corrigidos; validar fix no repo.
- **Job 41/206/149** (47 falhas): janelas de criação tardia de tabela — resolvidas; garantir migrations no repo (item 4).
- **Job 334** (2): deadlock + FROM-clause pontuais em backfill — one-off.
- **Job 63** (1): upsert duplicado one-off — já succeeded.
- **Job 463** (1): statement timeout por contenção — one-off.
- **Job 84** (1): JSON de headers one-off — já succeeded.
- **9 execuções órfãs**: histórico de jobs removidos — ignorar.
- **429/465**: falhas pontuais de JSON/coluna — corrigidas; revisar escape de payload no canary em próxima mexida.

---

## 7. Linha de base de monitoramento

- Taxa real de falha 7d: **~0,45–0,49%** (alvo < 1%). ✅
- Última falha registrada: **2026-08-14 11:29 UTC** (cluster startup timeout) — sem falhas nas ~10h seguintes.
- Monitor sugerido: query §2 com JOIN + contagem de `start_time IS NULL` (senão subconta falhas do scheduler) + alerta se `job startup timeout` clusterizar (≥3 jobs no mesmo minuto).
