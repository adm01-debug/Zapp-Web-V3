# SCORECARD V3 — Validação Final do Desacoplamento Evolution × ZAPP

> **Repo alvo:** zapp-web-v3 (branch `adm01-debug`)
> **Destino no repo:** `docs/decouple/SCORECARD_V3.md`
> **Data de medição:** 2026-08-14 (atualizado na rodada 2 da validação — tarde)
> **Escopo:** validação final do desacoplamento entre o ecossistema Evolution (VPS/Swarm) e o ZAPP Web (Supabase self-hosted), após a migração física `evo → zapp` das tabelas de mensagens.

## Resumo executivo

| # | Dimensão | Nota | Status |
|---|----------|:----:|--------|
| 1 | Separação de repositórios/infra | 9 | Concluída |
| 2 | Migração física de tabelas evo→zapp | 9 | Concluída |
| 3 | Saúde operacional (health/pipeline/DLQ) | 10 | Saudável |
| 4 | Egresso front via adapter | 10 | Concluído |
| 5 | Gateway edge (client.ts) | 10 | Concluído |
| 6 | Porta de ingestão (ingest-port/RPCs) | 9 | Concluído |
| 7 | Egresso SQL (resolvers vault) | 9,5 | Concluído |
| 8 | Modelo canônico + normalizers | 9 | Concluído |
| 9 | Prova de troca de provider (fake/runbook/ensaio) | 6 | **Pendente** (ensaio em preparação) |
| 10 | Governança e gates CI | 8,5 | Concluído |
| | **Média geral** | **9,0** | |

## Detalhamento por dimensão

### 1. Separação de repositórios/infra — Nota: 9/10
- **Evidência:** digests distintos em produção — `evolution-api 6f9f1d35`, `consumer 75210b9f`, `web production-b87b4e97`; cada serviço com imagem própria, sem acoplamento de build entre si.
- **Pendência:** nenhuma bloqueante.
- **Ação para 10/10:** manter digests versionados e registrar o mapa repo→imagem→digest no runbook de troca de provider (dimensão 9).

### 2. Migração física de tabelas evo→zapp — Nota: 9/10
- **Evidência:** 74 tabelas no schema `zapp` vs 27 tabelas remanescentes no schema `evo`; `grant` de escrita para `authenticated` em `evo` = **0** (nenhuma escrita via API no schema legado).
- **Pendência:** validar aposentadoria definitiva das 27 tabelas `evo` órfãs (drop ou congelamento formal).
- **Ação para 10/10:** rodar `drop` das tabelas `evo` após janela de observação e atualizar ADR-008.

### 3. Saúde operacional (health/pipeline/DLQ) — Nota: 10/10
- **Evidência:** health check **100.0 (A+)**; pipeline processou **5.077 msgs/24h**; **DLQ = 0**; inventory **0/0/0** (sem órfãos, sem duplicados, sem gaps).
- **Pendência:** nenhuma.
- **Ação para 10/10:** manter monitoramento contínuo (já atingiu a nota máxima).

### 4. Egresso front via adapter — Nota: 10/10
- **Evidência:** front consome dados exclusivamente via adapter de egresso; nenhum acesso direto ao schema `evo` no runtime do front.
- **Pendência:** nenhuma.
- **Ação para 10/10:** manter; cobrir o adapter com teste de contrato Zod (dimensão 10).

### 5. Gateway edge (client.ts) — Nota: 10/10
- **Evidência:** **evolution-proxy v2 (2026-08-14)** — eliminado o último bypass de `Deno.env.get` direto; todo egresso edge passa por `evolutionFetch()` via `client.ts`. Instância `wpp2` **open** e **isHealthy**; egresso edge 100% pelo gateway.
- **Pendência:** nenhuma bloqueante.
- **Ação para manter:** smoke test de egresso edge no CI (chamada real ao gateway com fixture).

### 6. Porta de ingestão (ingest-port/RPCs) — Nota: 9/10
- **Evidência:** `rpc_upsert_contact` com **1 overload** ativo e estável; ingestão flui pela porta única (RPCs) sem bypass.
- **Pendência:** auditar demais RPCs de ingestão quanto a overloads ausentes.
- **Ação para 10/10:** garantir overload em todos os RPCs de escrita e teste de contrato para cada um.

### 7. Egresso SQL (resolvers vault) — Nota: 9,5/10
- **Evidência:** **sql-gate testado** — 5/5 cenários de regressão verdes (`node --test scripts/decouple/__tests__/sql-gate.test.mjs`: egresso hardcoded real → violação; fn compliant → sem violação; falsos positivos legítimos; entry null sem crash; report malformado → exit 2); 5 fns de egresso 100% via `ops.fn_evo_url()`/`ops.fn_evo_key()`; gate roda sobre fixture snapshot no CI (ADR-010).
- **Pendência:** remover os 2 pares de secrets duplicados no vault (10 secrets, 2 pares: `evolution_api_key`×`evolution_api_key_v2`, `evolution_webhook_secret`×`webhook_secret_evolution`); commitar o fixture `sql_report_snapshot.json` + wiring do sql-gate no CI.
- **Ação para 10/10:** deduplicar secrets no vault e validar que nenhum resolver referencia os duplicados; regenerar/commitar fixture do sql-gate.

### 8. Modelo canônico + normalizers — Nota: 9/10
- **Evidência:** modelo canônico implementado; normalizers convertendo payloads Evolution→canônico→zapp sem resquício de schema `evo` nos resolvers.
- **Pendência:** nenhuma bloqueante.
- **Ação para 10/10:** congelar o modelo canônico via contrato versionado (schema JSON + testes).

### 9. Prova de troca de provider (fake/runbook/ensaio) — Nota: 6/10
- **Evidência:** fake de provider com **guard anti-vazamento por verbo** (`DENO_ENV=test`, commit da onda de validação); **runbook de troca de provider concluído** (`RUNBOOK_TROCA_PROVIDER.md` — contrato de planejamento, não executado); **ensaio fake↔evolution em preparação** (simulação de cenários PRÉ-EXECUÇÃO em `SIMULATION_SCENARIOS_20260814.md`) — a prova de substituibilidade do Evolution ainda não foi executada de ponta a ponta.
- **Pendência:** executar ensaio real (fake↔evolution) com rollback validado e cronometrado (etapa 57 do V3).
- **Ação para 10/10:** (1) executar ensaio de troca (fake↔evolution) e registrar tempo/evidência; (2) registrar evidência do ensaio neste scorecard.

### 10. Governança e gates CI — Nota: 8,5/10
- **Evidência:** **ESLint decouple ATIVAS** — 6 selectors `no-restricted-syntax` em nível `error` num bloco único fundido (flat config corrigido: 3 selectors decouple — invoke evolution-api, import de valor de evolutionExternal, VITE_EVOLUTION_API_URL — + 3 selectors schema contract); **inventory com 4 métricas** (baseline **0/0/0/0**, métrica 4 `frontDirectEvoHttp`, fix do falso-zero no Windows); **ADR-008 completo** (modelo canônico final); gate `decouple-guard` presente no CI.
- **Pendência:** threshold do `decouple-guard` segue **15 (frouxo)** — endurecer para 0; wiring do sql-gate (fixture) no workflow; teste de contrato Zod nos PRs que toquem resolvers/gateway.
- **Ação para 10/10:** (1) travar `decouple-guard` em TOTAL=0 no CI; (2) wiring do sql-gate com fixture commitado; (3) exigir teste de contrato Zod nos PRs que toquem resolvers/gateway.

## Plano de fechamento (para 10/10 em todas as dimensões)

| Prioridade | Ação | Dimensão |
|:---:|---|---|
| P0 | Executar ensaio fake↔evolution (etapa 57) com rollback validado e cronometrado | 9 |
| P0 | Endurecer threshold do decouple-guard (15 → 0) + wiring do sql-gate (fixture) no CI | 10 |
| P1 | Teste de contrato Zod nos PRs que toquem resolvers/gateway | 10 |
| P1 | Deduplicar 2 pares de secrets no vault | 7 |
| P2 | Aposentar tabelas `evo` órfãs após janela de observação | 2 |

---
*Documento gerado em 2026-08-14 — medições reais coletadas no ambiente de produção (VPS/Swarm + Supabase self-hosted). Atualizado na rodada 2 da validação (2026-08-14, tarde): dimensões 5, 7, 9 e 10 refletem as correções mergeadas (PRs #1077/#1078/#1080/#1081).*
