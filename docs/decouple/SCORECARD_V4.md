# SCORECARD V4 — Rascunho do Scorecard Final do Desacoplamento Evolution × ZAPP

> **Repo alvo:** zapp-web-v3 (branch `adm01-debug`; remote `https://github.com/adm01-debug/zapp-web-v3.git`)
> **Destino no repo:** `docs/decouple/SCORECARD_V4.md`
> **Data de medição:** 2026-08-14 (tarde — onda V4-FINAL, tarefa #43)
> **Base:** `SCORECARD_V3.md` (rodada 2, atualizado pelo PR #1082) + `BASELINE_V4.md` (medição da manhã, 10 agentes) + medições frescas deste rascunho
> **Escopo:** scorecard final do desacoplamento entre o ecossistema Evolution (VPS/Swarm) e o ZAPP Web (Supabase self-hosted), no formato do V3 (10 dimensões × nota × evidência).
> **Status do documento:** ⚠️ **RASCUNHO — notas finais após F5/F6/F7** (ver rodapé).

## Resumo executivo

| # | Dimensão | V3 | V4 (rascunho) | Status |
|---|----------|:--:|:--:|--------|
| 1 | Separação de repositórios/infra | 9 | **10** | Concluída |
| 2 | Migração física de tabelas evo→zapp | 9 | **9** | Concluída (congelamento pendente — F7) |
| 3 | Saúde operacional (health/pipeline/DLQ) | 10 | **10** | Saudável |
| 4 | Egresso front via adapter | 10 | **10** | Concluído (zero bypass confirmado hoje) |
| 5 | Gateway edge (client.ts + allowlist) | 10 | **10** | Concluído (ADR-011 formal pendente) |
| 6 | Porta de ingestão (ingest-port/RPCs) | 9 | **9** | Concluído |
| 7 | Egresso SQL (resolvers vault) | 9,5 | **9** | Concluído (dedup de secrets APROVADO, execução pendente — F6) |
| 8 | Modelo canônico + normalizers | 9 | **10** | Concluído (contract.zod executável) |
| 9 | Prova de troca de provider (fake/runbook/ensaio) | 6 | **8** | **Parcial** (ensaio cronometrado operacional F5 pendente) |
| 10 | Governança e gates CI | 8,5 | **9** | Concluído (PRs #1083/#1084 pendentes de merge na main) |
| | **Média geral** | **9,0** | **9,4** | |

> **Convenção de evidência:** `[HOJE]` = medido/verificado neste rascunho (2026-08-14 tarde, worktree `chat-h713641`) · `[ONTEM]` = medido na manhã (BASELINE_V4, onda 10 agentes) · `[PENDENTE]` = não executado ainda. Links: paths relativos ao repo e PRs em `https://github.com/adm01-debug/zapp-web-v3/pull/NNNN`.

## Detalhamento por dimensão

### 1. Separação de repositórios/infra — Nota: 10/10 (era 9)
- **[ONTEM]** Digests distintos em produção — evolution `6f9f1d35`, consumer `75210b9f`, web `production-ccdb663ba68d` ([BASELINE_V4 §4.1](./BASELINE_V4.md)); infra Evolution vive em `adm01-debug/evolution-stack` (AGENTS.md do repo); stacks 25/113/238/240/262/264/265.
- **[HOJE]** Guard de regressão no CI: `decouple-guard.yml` bloqueia recriação de `infra/evolution*` e workflows `publish-evolution*` no zapp-web-v3 (E22) — a separação agora é **mantida por gate**, não por convenção ([.github/workflows/decouple-guard.yml](../../.github/workflows/decouple-guard.yml)).
- **[PENDENTE]** Registrar formalmente o mapa repo→imagem→digest dentro do `RUNBOOK_TROCA_PROVIDER.md` (ação do V3; digests já constam no BASELINE_V4).
- **Ação para manter:** nada bloqueante; registrar o mapa no runbook no fechamento.

### 2. Migração física de tabelas evo→zapp — Nota: 9/10
- **[ONTEM]** 99 objetos `zapp.evolution_*` vs 29 tabelas `evo.*` (16 operacionais + 13 partições); **grants de escrita para `authenticated`/`anon` em `evo.*` = 0** (congelamento efetivo — nenhuma escrita via API no schema legado) ([BASELINE_V4 §3.1–3.3](./BASELINE_V4.md)).
- **[PENDENTE]** Congelamento **formal** das tabelas `evo` remanescentes (drop após janela de observação ou congelamento declarado) — onda **F7** (etapas 71–80 do [PLANO_DESACOPLAMENTO_V4_FINAL](./PLANO_DESACOPLAMENTO_V4_FINAL_100_ETAPAS_20260814.md)).
- **Ação para 10/10:** executar F7 e atualizar ADR-008/ADR-DB-002 com o estado final.

### 3. Saúde operacional (health/pipeline/DLQ) — Nota: 10/10
- **[ONTEM]** Pipeline **3.358 msgs/24h**; **DLQ principal = 0** (`zapp.dispatch_error_logs` = 1 registro); instância `wpp2` **open / isHealthy** com 322.430 mensagens; **5 watchdogs com RestartCount = 0**; functions health no stack 265 ([BASELINE_V4 §3.9–3.10, §4.3–4.6](./BASELINE_V4.md)); health check **100.0 (A+)** na rodada 1 do V3.
- **[PENDENTE]** Nenhuma bloqueante.
- **Ação para manter:** monitoramento contínuo já existente (nota máxima mantida).

### 4. Egresso front via adapter — Nota: 10/10 (zero bypass confirmado HOJE)
- **[HOJE]** `node scripts/decouple/inventory.mjs` (v4) executado neste rascunho: **TOTAL = 0** — `front invoke bypass: 0 · backend URL bypass: 0 · front evo writes: 0 · front direct evo http: 0` (baseline antigo 17 → delta **-17**) ([scripts/decouple/inventory.mjs](../../scripts/decouple/inventory.mjs)).
- **[ONTEM]** Fix do falso-positivo Windows (normalização de path) aplicado na onda ([BASELINE_V4 §6.1](./BASELINE_V4.md)); ESLint decouple em `error` (3 selectors: invoke `evolution-api`, import `evolutionExternal`, `VITE_EVOLUTION_API_URL`).
- **[PENDENTE]** Nenhuma. Front consome exclusivamente via adapter (zero bypass estrutural + gate).
- **Ação para manter:** cobrir o adapter com teste de contrato Zod (já coberto parcialmente pelos contract tests — ver D8).

### 5. Gateway edge (client.ts + allowlist) — Nota: 10/10 (era 9)
- **[HOJE]** **Allowlist documentada**: `EGRESS_SURFACE_V4.md` §3 lista as **41 actions** da `evolution-api` (porta edge canônica) e formaliza a decisão "Browser → Evolution: só `evolution-api`; qualquer nova necessidade vira action nova (com contrato) na allowlist" ([EGRESS_SURFACE_V4.md](./EGRESS_SURFACE_V4.md)); `evolution-proxy` (6 paths) marcado como candidato a aposentar.
- **[HOJE]** **verb-contract-gate verde** executado neste rascunho: "12 verbos — contrato de 12 íntegro" ([scripts/decouple/verb-contract-gate.mjs](../../scripts/decouple/verb-contract-gate.mjs)); egresso edge 100% via `evolutionFetch()`/client.ts (inventory m2 = 0, D4).
- **[ONTEM]** Instância `wpp2` open/isHealthy ([BASELINE_V4 §4.6](./BASELINE_V4.md)).
- **[PENDENTE]** **ADR-011 formal** (`ADR-011-egress-gateway.md`) **não criado** — etapa 33 do [PLANO_DESACOPLAMENTO_V4_FINAL](./PLANO_DESACOPLAMENTO_V4_FINAL_100_ETAPAS_20260814.md) ainda `[ ]`; a decisão está documentada de forma equivalente no EGRESS_SURFACE_V4.md, mas o ADR versionado segue pendente para o fechamento.
- **Ação para 10/10 sustentado:** criar ADR-011 a partir do EGRESS_SURFACE_V4.md (registrar decisão datada) e deprecar formalmente o `evolution-proxy`.

### 6. Porta de ingestão (ingest-port/RPCs) — Nota: 9/10
- **[ONTEM]** `rpc_upsert_contact` com **1 overload** ativo (risco de overload múltiplo não se materializou) ([BASELINE_V4 §3.7](./BASELINE_V4.md)); ingestão flui pela porta única (RPCs + ingest-port) sem bypass; normalizer casa com o contrato `IngestMessage` (12 campos) — ver D9.
- **[PENDENTE]** Auditar os demais RPCs de ingestão quanto a overloads ausentes (pendência herdada do V3).
- **Ação para 10/10:** garantir overload em todos os RPCs de escrita + teste de contrato para cada um.

### 7. Egresso SQL (resolvers vault) — Nota: 9/10 (era 9,5)
- **[HOJE]** **sql-gate verde** executado neste rascunho com fixture commitado: "SQL gate OK: 0 violações (8 funções analisadas, 4 no whitelist)" — `node scripts/decouple/sql-gate.mjs scripts/decouple/fixtures/sql_report_snapshot.json` (fixture **[HOJE]** presente em [scripts/decouple/fixtures/sql_report_snapshot.json](../../scripts/decouple/fixtures/sql_report_snapshot.json)); egresso das fns via `ops.fn_evo_url()`/`ops.fn_evo_key()` (ADR-010).
- **[PENDENTE]** Dedup dos **2 pares de secrets duplicados** no vault (10 secrets: `evolution_api_key`×`evolution_api_key_v2`, `evolution_webhook_secret`×`webhook_secret_evolution`) — **APROVADO** (decisão registrada), execução pendente na onda **F6** (etapas 63–70 do plano; expand/contract + evidência fresca de que nenhum resolver referencia os duplicados).
- **Ação para 10/10:** executar F6 (dedup com validação) e re-medir vault.

### 8. Modelo canônico + normalizers — Nota: 10/10 (era 9)
- **[HOJE]** **Contrato Zod executável e versionado**: `providers/evolution/contract.zod.ts` define `evolutionGatewayContract` (request/response dos **12 verbos** do gateway — sendText, sendMedia, sendSticker, getConnectionState, getQrCode, restartInstance, listInstances, listGroups, checkWhatsApp, getProfilePicture + get/post; request estrito com `.passthrough()`, response permissivo — regra do incidente 2026-07-03: 422 indevido causa perda de dados) ([supabase/functions/_shared/providers/evolution/contract.zod.ts](../../supabase/functions/_shared/providers/evolution/contract.zod.ts)).
- **[HOJE]** Validação executável do contrato: **verb-contract-gate** (conjunto exato de 12 verbos, verde hoje) + **deno-contract-tests.yml** (contract tests rodam em push/PR/varredura diária) + suite `supabase/functions/_shared/__tests__/contract-*.test.ts` (registry integrity, versioning, cobertura).
- **[ONTEM]** ADR-008 completo (6,7 KB, Status: Aceito) + `CANONICAL_COLUMN_MAP.md` (9 KB) ([BASELINE_V4 §5.2–5.3](./BASELINE_V4.md)).
- **[PENDENTE]** Nenhuma bloqueante. Nota: contrato de client não participa do fluxo `parseOrReject` (documentado no próprio arquivo) — cobertura direta dos schemas do contract.zod fica como melhoria opcional.
- **Ação para manter:** congelamento já efetivo via contrato versionado.

### 9. Prova de troca de provider (fake/runbook/ensaio) — Nota: 8/10 (era 6)
- **[HOJE]** **Fake 12/12 verbos**: `providers/fake/index.ts` implementa os 12 verbos do contrato (incluindo `getProfilePicture` — gap 11/12 do BASELINE_V4 **fechado**) ([supabase/functions/_shared/providers/fake/index.ts](../../supabase/functions/_shared/providers/fake/index.ts)).
- **[HOJE]** **PROVIDER_UNDER_TEST + guard absoluto**: `registry.ts` — fora de `DENO_ENV=test` a flag é **ignorada** (resolução sempre segue o provider pedido, default `evolution`); pedido explícito de `fake` fora de test lança erro ([supabase/functions/_shared/providers/registry.ts](../../supabase/functions/_shared/providers/registry.ts)).
- **[HOJE]** **Guard testado**: `registry.test.ts` cobre produção+flag→evolution, test→fake, assertTestEnv, `cloud` not-implemented (roda no CI deno-contract-tests).
- **[HOJE]** **Ensaio de mesa (PR #1082)**: `ensaio-fake.test.ts` — **5 passed | 0 failed (216ms)**: E1 registry resolve fake em test; E2 shapes canônicos (sendText→{ok}, getConnectionState→{state:'open'}, listInstances→[wpp2]); E2b envelope default + 0 verbos do evolutionClient sem par; **E3 casamento com normalizer** (canônico 1:1 → `IngestMessage` 12 campos, sem throw); **E4 benchmark de mesa** — 12 verbos × 200 iters, todos sub-milissegundo (pior: sendAudio 0.0986ms). Findings documentados no rodapé do arquivo ([supabase/functions/_shared/__tests__/ensaio-fake.test.ts](../../supabase/functions/_shared/__tests__/ensaio-fake.test.ts)).
- **[HOJE]** **e2e spec de substituibilidade**: `e2e/decouple-fake-provider.spec.ts` — inbox/envio/recebimento/degradação 100% fake via `page.route` (sem rede: sentinela aborta e `escaped` derruba o teste; gate `E2E_FAKE=1`) ([e2e/decouple-fake-provider.spec.ts](../../e2e/decouple-fake-provider.spec.ts)).
- **[PENDENTE]** **Ensaio cronometrado OPERACIONAL (F5)** — etapas 53–62 do plano: executar troca fake↔evolution com rollback validado e cronometrado; inclui piloto de adoção do registry (etapa 34: hoje **0 functions consomem o registry** — sem consumidor, o ensaio prova um mecanismo sem uso em runtime) + decisão datada sobre ensaio Cloud real (Meta, etapa 62).
- **Ação para 10/10:** concluir F5 (piloto registry + ensaio operacional cronometrado) e registrar tempo/evidência aqui. Nota 8 é o teto honesto até lá.

### 10. Governança e gates CI — Nota: 9/10 (era 8,5)
- **[HOJE]** **Threshold 0**: `decouple-guard.yml` endurecido — `TOTAL > 0` falha o CI (era `> 15`); wiring do **sql-gate via fixture commitado** (ADR-010, sem secrets no CI) e do **verb-contract-gate** (12 verbos) no mesmo workflow ([.github/workflows/decouple-guard.yml](../../.github/workflows/decouple-guard.yml)) — estado do **PR #1084** (presente no worktree; pendente de merge na main).
- **[HOJE]** **Inventory v4 Windows-safe**: `INVENTORY_ROOT` override + strip de comentário preservando `//` em strings (`https://`, `wss://`) — roda verde hoje (TOTAL 0, ver D4) ([scripts/decouple/inventory.mjs](../../scripts/decouple/inventory.mjs)).
- **[HOJE]** **Typecheck zerado**: commit `44947a3bf` (PR **#1083**) "fix(types): zera typecheck app-wide" — erroMsg??undefined (RPC DEFAULT NULL), import setWebhookConfig (bug runtime real), dead-code allowlist arquivados V3 (branch `fix/hermes-h713641-baseline-typecheck-deadcode`).
- **[HOJE]** Os 3 gates rodados verdes neste rascunho (inventory 0/0/0/0 · sql-gate 0 violações · verb-contract 12 verbos) — evidência fresca, não só leitura de arquivo.
- **[ONTEM]** ESLint decouple em `error` (3 selectors, fundido em bloco único); ADR-008 e ADR-010 completos ([BASELINE_V4 §5.1](./BASELINE_V4.md)).
- **[PENDENTE]** Merge dos PRs **#1083/#1084** na main (hoje no worktree/branch); teste de contrato Zod exigido nos PRs que toquem resolvers/gateway (parcialmente coberto pelos contract tests existentes — formalizar como exigência de PR).
- **Ação para 10/10:** mergear #1083/#1084, exigir contrato Zod em PRs de resolvers/gateway e re-medir após merge.

## Plano de fechamento (para 10/10 em todas as dimensões — F5/F6/F7)

| Prioridade | Ação | Dimensão | Onda |
|:---:|---|---|:---:|
| P0 | Ensaio cronometrado operacional fake↔evolution (piloto registry + rollback validado) | 9 | **F5** |
| P0 | Dedup dos 2 pares de secrets no vault (APROVADO — expand/contract + evidência) | 7 | **F6** |
| P0 | Congelamento formal das tabelas `evo` remanescentes | 2 | **F7** |
| P1 | Merge dos PRs #1083 (typecheck zerado) e #1084 (threshold 0 + sql-gate/verb-gate wiring) na main | 10 | — |
| P1 | Criar ADR-011 (etapa 33) a partir do EGRESS_SURFACE_V4.md | 5 | F5 |
| P1 | Exigir teste de contrato Zod nos PRs que toquem resolvers/gateway | 10 | — |
| P2 | Registrar mapa repo→imagem→digest no RUNBOOK_TROCA_PROVIDER.md | 1 | F5 |
| P2 | Auditar overloads dos demais RPCs de ingestão | 6 | F7 |

---
*Rascunho — notas finais após F5/F6/F7. Documento gerado em 2026-08-14 (tarde) pelo Agente 9 da onda V4-FINAL (tarefa #43). Evidências `[HOJE]` medidas no worktree `chat-h713641` (inventory/sql-gate/verb-gate executados; arquivos lidos na árvore atual); evidências `[ONTEM]` herdadas de [BASELINE_V4.md](./BASELINE_V4.md) (medição da manhã, onda 10 agentes). Nenhuma medição de produção foi refeita neste rascunho — valores de runtime citados vêm do BASELINE_V4/V3. Notas podem subir (D1/D5/D10) ou ajustar após o merge dos PRs #1083/#1084 e execução de F5/F6/F7.*
