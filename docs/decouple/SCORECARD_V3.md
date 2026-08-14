# SCORECARD V3 — Validação Final do Desacoplamento Evolution × ZAPP

> **Repo alvo:** zapp-web-v3 (branch `adm01-debug`)
> **Destino no repo:** `docs/decouple/SCORECARD_V3.md`
> **Data de medição:** 2026-08-14
> **Escopo:** validação final do desacoplamento entre o ecossistema Evolution (VPS/Swarm) e o ZAPP Web (Supabase self-hosted), após a migração física `evo → zapp` das tabelas de mensagens.

## Resumo executivo

| # | Dimensão | Nota | Status |
|---|----------|:----:|--------|
| 1 | Separação de repositórios/infra | 9 | Concluída |
| 2 | Migração física de tabelas evo→zapp | 9 | Concluída |
| 3 | Saúde operacional (health/pipeline/DLQ) | 10 | Saudável |
| 4 | Egresso front via adapter | 10 | Concluído |
| 5 | Gateway edge (client.ts) | 9 | Concluído |
| 6 | Porta de ingestão (ingest-port/RPCs) | 9 | Concluído |
| 7 | Egresso SQL (resolvers vault) | 9 | Concluído |
| 8 | Modelo canônico + normalizers | 9 | Concluído |
| 9 | Prova de troca de provider (fake/runbook/ensaio) | 5 | **Pendente** |
| 10 | Governança e gates CI | 6 | **Em correção** |
| | **Média geral** | **8,5** | |

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

### 5. Gateway edge (client.ts) — Nota: 9/10
- **Evidência:** instância `wpp2` **open** e **isHealthy**; egresso edge passa pelo gateway `client.ts`.
- **Pendência:** nenhuma bloqueante.
- **Ação para 10/10:** adicionar smoke test de egresso edge no CI (chamada real ao gateway com fixture).

### 6. Porta de ingestão (ingest-port/RPCs) — Nota: 9/10
- **Evidência:** `rpc_upsert_contact` com **1 overload** ativo e estável; ingestão flui pela porta única (RPCs) sem bypass.
- **Pendência:** auditar demais RPCs de ingestão quanto a overloads ausentes.
- **Ação para 10/10:** garantir overload em todos os RPCs de escrita e teste de contrato para cada um.

### 7. Egresso SQL (resolvers vault) — Nota: 9/10
- **Evidência:** vault com **10 secrets**, sendo **2 pares duplicados** identificados; resolvers de egresso SQL centralizados no vault.
- **Pendência:** remover os 2 pares de secrets duplicados.
- **Ação para 10/10:** deduplicar secrets no vault e validar que nenhum resolver referencia os duplicados.

### 8. Modelo canônico + normalizers — Nota: 9/10
- **Evidência:** modelo canônico implementado; normalizers convertendo payloads Evolution→canônico→zapp sem resquício de schema `evo` nos resolvers.
- **Pendência:** nenhuma bloqueante.
- **Ação para 10/10:** congelar o modelo canônico via contrato versionado (schema JSON + testes).

### 9. Prova de troca de provider (fake/runbook/ensaio) — Nota: 5/10
- **Evidência:** existência de fake de provider validada parcialmente; porém **runbook de troca de provider em criação** e **ensaio de troca pendente** — a prova de substituibilidade do Evolution ainda não foi executada de ponta a ponta.
- **Pendência:** concluir runbook de troca de provider; executar ensaio real (fake em produção/staging) com rollback validado.
- **Ação para 10/10:** (1) finalizar runbook com passos de rollback; (2) executar ensaio de troca em staging; (3) registrar evidência do ensaio neste scorecard.

### 10. Governança e gates CI — Nota: 6/10
- **Evidência:** gate `decouple-guard` com **threshold 15 (frouxo, em correção)**; ESLint decouple em nível **warn** (não bloqueia); **ADR-008 em estado stub (em correção)**.
- **Pendência:** endurecer threshold do decouple-guard; promover ESLint decouple de `warn` para `error`; completar ADR-008.
- **Ação para 10/10:** (1) reduzir threshold para valor estrito (ex.: 0–5) e travar no CI; (2) ESLint decouple como `error` bloqueante em PR; (3) preencher ADR-008 (decisão, migração, rollback); (4) exigir teste de contrato Zod nos PRs que toquem resolvers/gateway.

## Plano de fechamento (para 10/10 em todas as dimensões)

| Prioridade | Ação | Dimensão |
|:---:|---|---|
| P0 | Finalizar runbook de troca de provider e executar ensaio com rollback | 9 |
| P0 | Endurecer threshold do decouple-guard + ESLint decouple como `error` | 10 |
| P1 | Completar ADR-008 (decisão/migração/rollback) | 10 |
| P1 | Deduplicar 2 pares de secrets no vault | 7 |
| P2 | Aposentar tabelas `evo` órfãs após janela de observação | 2 |

---
*Documento gerado em 2026-08-14 — medições reais coletadas no ambiente de produção (VPS/Swarm + Supabase self-hosted).*
