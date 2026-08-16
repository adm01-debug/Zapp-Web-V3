# LOG — Auditoria de Referências à Evolution API no zapp-web-v3
## AUDIT_EVO_REFS_20260816 · 100 etapas · 2026-08-16

Branch de trabalho: `claude/audit-evo-refs-sweep-20260816`
Repos: `adm01-debug/zapp-web-v3` (main) · `adm01-debug/evolution-stack` (main)

---

## Fase 0 — Preparo e Baseline (E01–E08)

| Etapa | Status | Observação |
|---|---|---|
| E01 | ✅ ADAPTADA | Branch criada via worktree isolado LOCAL (C:/Users/Joaquim/hermes-workspaces/audit-evo-refs-20260816) a partir de origin/main @ 9fc1064ba. **Desvio documentado**: o container claude-code na VPS está com working tree sujo de outra campanha em andamento (ADR-I4-ROTA-A, BOUNDARY_SCORE_T1, score-ratchet.yml não commitados) — criar branch lá contaminaria trabalho alheio. Fallback validado na skill hermes-orchestration (PR #1064). Working tree do worktree: LIMPA. |
| E02 | ⚠️ PARCIAL | graphify-out/GRAPH_REPORT.md presente no repo; frescura do grafo não validada (graphify update é caro em repo de 20k commits). Greps diretos servem de fonte primária nas Fases 4–5; grafo só como apoio. |
| E03 | ✅ | Inventário A (path com `evo`): **242** (plano estimava 244). baseline.json com sha1+tamanho+último commit por arquivo. |
| E04 | ✅ | Inventário B (conteúdo, sem evo no path): **1036** (plano estimava ~1010). Dedup contra A. |
| E05 | ✅ | Inventário C (reverso, evolution-stack → refs a zapp): **37** (plano dizia 18 conhecidos — repo evolution-stack cresceu; Fase 8B cobre). |
| E06 | ✅ | Diretório `docs/decouple/AUDIT_EVO_REFS_20260816/` com baseline.json, triagem.csv (gerado em E11), triagem-reversa.csv, consumidores.json, gates-snapshot.json, LOG.md. |
| E07 | ✅ | consumidores.json: mapa de imports TS evo em src/ e supabase/functions/ (sem evo no nome do path), links markdown em docs/, refs em .github/workflows/. |
| E08 | ✅ | gates-snapshot.json: sha1 de `evo-ddl-gate.yml`, `evo-ddl-allowlist.txt`, `.deno-lint-rules/no-direct-evo-url.ts` no HEAD. Nada nesta auditoria pode enfraquecê-los. |

**Universo consolidado: 1278 arquivos** (242 A + 1036 B, dedup).

**Decisão de execução (registrada)**: validação de vida das edge functions (Fase 4) e cruzamento banco vivo (Fase 6) usam MCP supabase/portainer a partir do maestro; workers classificam em read-only sobre o worktree.

---

## Fase 1 — Critérios e Automação da Triagem (E09–E12)

| Etapa | Status | Observação |
|---|---|---|
| E09 | ✅ | `scripts/decouple/audit-evo-refs-triage.mjs` (Node) criado. |
| E10 | ✅ | Matriz de decisão por evidência (ver abaixo). |
| E11 | ✅ | Triagem automática rodada; assert linhas==universo OK. |
| E12 | ✅ | triagem-reversa.csv com 37 arquivos do evolution-stack → classe definida na Fase 8B. |

### Matriz de decisão (E10)

Para cada arquivo, responder em ordem:
1. **(a) Tem consumidor vivo?** (import TS, link markdown, workflow, rota montada) → FICA.
2. **(b) Descreve infra que hoje mora no evolution-stack?** (API server, RabbitMQ consumer, stacks, DR da Evo) → MIGRA (com reescrita de links).
3. **(c) Tem sucessor identificado?** (duplicado de doc canônico, superseded por plano concluído, replicado no evolution-stack) → EXCLUI/ARQUIVA.
4. **(d) É histórico de auditoria/incidente com valor de registro?** → ARQUIVA.

Combinações: (a)→FICA; (b)∧¬(a)→MIGRA; (c)→EXCLUI (duplicado com canônico identificado); (d)→ARQUIVA; incerto→FICA+REVISAR (R3).

Contagens iniciais da 1ª passada (heurística): ver seção Fase 1 do triagem.csv — números finais saem do CSV após as Fases 2–7.

---

## Fase 4 — Supabase/Functions (E41–E55)

**Pre-facts coletados pelo maestro (MCP supabase/portainer, 2026-08-16):**

| Fato | Evidência |
|---|---|
| 10/10 functions `evolution-*` deployadas no edge-runtime | `ls /home/deno/functions` (container supabase_functions) |
| evolution-webhook: ingestão VIVA | 548 eventos em `evo.evolution_webhook_events_v2` nas últimas 24h (último 19:45Z) |
| evolution-api: proxy principal | front em produção usa (chat operante) |
| evolution-consumer-stats: CONSUMIDA mas com BUG bilateral | logs do container evolution-rabbit-consumer: `WARNING [STATS-HTTP] falha persistir stats via HTTP (err acumulado=560)`, retry_by `4xx:404`:1, a cada ~30s; via Postgres `pg_stats_ok=652` funciona |
| evolution-sync / evolution-group-sync: jobs pg_cron ativos | `evo-sync-messages-to-v2` (5min), `sync-groups-daily` (04:10) |
| evolution-notification-dispatcher: crons ativos | `notif-dispatcher` (5min), `process-evolution-notifications` (2min) |
| Reconciler ativo via pg_net→edge | `ops.pgnet_egress_log`: 43 chamadas/7d de `fn_reconcile_dispatch`, última 19:45Z |
| **Versão Evolution API em produção: 2.4.0** | `/evolution/package.json` no container evolution (não 2.3.7!) |
| evolution-proxy: JÁ aposentado na main | commit 9fc1064ba — E44 N/A (fora do universo) |
| registry de deploy (ops.edge_function_registry) | 7 evolution-* ativas (snapshot 08-07; 3 das 10 não rastreadas lá — registry defasado, não é fonte de tráfego) |

**Impacto da versão 2.4.0:**
- E63: `src/hooks/evolution/v237Fallbacks.ts` → FICA + **REVISAR** (produção > 2.3.7; rede de segurança, não excluir agora)
- E21: `docs/EVOLUTION_API_REFERENCE.md` cita 2.3.7 → divergente da produção
- E51: `_shared/providers/evolution/contract.zod.ts` → verificar compatibilidade com 2.4.0

**Achado E48**: bug bilateral consumer-stats (POST HTTP 404) — FICA (contrato consumido) + investigar na Fase 8B (o consumer mora no evolution-stack).

---

## Fase 6 — Migrations e DB (E71–E76)

- **E71** ✅: 57 migrations `*evo*` no repo com propósito documentado (tabela gerada por script).
- **E72** ⚠️: banco tem 654 registros em `supabase_migrations.schema_migrations`; repo tem 334 arquivos (modelo DB-as-source explica o excedente). Das 58 migrations evo do repo (57 supabase/migrations + 1 db/migrations), **17 sem registro com o próprio version**:
  - `20260805104000` — duplicada da 04043 (registrada)
  - `20260808` (db/migrations/evo) — pré-histórica, aplicada ad-hoc no PG14 (não Supabase)
  - `20260808230200`/`20260808230300` — registradas com versions renumeradas (20260807195552/195847)
  - `20260808280000`, `20260813180000` — sem registro equivalente identificado → **verificar aplicação real** (pendência relatório)
  - `20260811150100/150200/150400/160000/170000` — "ESPELHO do estado aplicado em produção" (aplicadas via outras rotas)
  - `20260815030000`–`15080000` (decouple_e17/e26–e30) — consolidados no replay convergente (versions 15200001–15200013)
  - Nenhuma ação corretiva nesta auditoria (R1 documental).
- **E73** ✅: `db/migrations/evo/20260808_auditoria_onda4.sql` (PG14 evolution) e `db/migrations/supabase/20260808_auditoria_onda4_evo_schema.sql` (Supabase) = registros pré-históricos do split, aplicados via MCP/Portainer. FICA (R1) + nota: conteúdo operacional coberto pela baseline E41 do evolution-stack.
- **E74** ⏳: baseline e41 do evolution-stack tem **143 refs a `zapp.*`** (UPDATEs em `zapp.evolution_*` + `zapp.rpc_boundary_raise_alert`) — classificação bridge/contrato/stale por worker (w17).
- **E75** ✅: allowlist com 17 arquivos, todos existentes no repo; exceções = migrations de regularização do desacoplamento (replay convergente), não DDL novo. Sem arquivo inflado além do justificado.

---

## Fase 7 — CI/lint/e2e/infra (E77–E84) — parciais do maestro

- **E77** ✅: `evo-ddl-gate.yml` último run **success** (2026-08-16T17:03Z, PR feat(I9)).
- **E78** ⚠️ **GAP**: `.deno-lint-rules/no-direct-evo-url.ts` existe mas **não está plugada** em nenhum `deno.json`/workflow ("rule não plugada = teatro"). Medição manual (deno runner): **0 violações atuais** em supabase/functions → plugagem é segura. Fix proposto para a Fase 9: plugar via lint.plugins + gate existente.
- **E79** ✅: 3 specs e2e evolution presentes; `run-e2e-evolution-vps.sh` aponta `https://zapp.atomicabr.com.br` (correto pós-split).
- **E80–E83** ⏳: workers w18 (stacks), w19 (workflows/scripts), w20 (docs lote).

---

## Fase 8 — Validação Cruzada e Gate (E85–E90)

- **E84** ✅: CSV 100% preenchido — 1278/1278 linhas com classe final. Contagens: FICA 1191, FICA;REVISAR 12, ARQUIVA 13, ARQUIVA;REVISAR 34, EXCLUI 8, EXCLUI;REVISAR 11, MIGRA 2, MIGRA;REVISAR 7.
- **E85** ✅: verificação R2 automatizada (`git grep -F` path+basename em zapp+evostack, com filtros de auto-referência da auditoria e de docs históricos). 11 reclassificados para `;REVISAR` com consumidores reais identificados (BOUNDARY-evolution.md, dead-code-allowlist, SETTINGS.md, ADR-011, etc.) — cada um com pré-requisito de acompanhamento registrado no CSV.
- **E86** ✅: destinos MIGRA sem colisão no evolution-stack (worker w4/w5 + simulação s5).
- **E87** ✅: links de entrada dos ARQUIVA mapeados no CSV (coluna consumidores) — reescrita no mesmo commit da Fase 9.
- **E88** ✅: resíduos evolution-stack identificados: (1) labels OCI `org.opencontainers.image.source` dos 2 Dockerfiles apontam `zapp-web-v3/tree/main/infra/evolution-api-custom` (path morto — fix no PR-3); (2) drift consumer: runtime roda digest `9b1a5b967...`, stack file do repo diz `0f4b07cfb...` (registrar, não tocar sem o dono); (3) E74 aplicado à baseline (ver Fase 6).
- **E89** ✅: changesets montados — PR-1 zapp (ARQUIVA+EXCLUI, 2 commits), PR-2 evostack (MIGRA), PR-3 evostack (labels OCI + comentários).
- **E90** ✅ **GATE HUMANO: APROVADO** pelo Joaquim (16/08 ~17:15 BRT), com exigência adicional: **simulação de cenários prévia** (10 agentes read-only, deleg_ce43d3c9) antes de qualquer escrita destrutiva.
- **Validação Claude Code**: CLI local deslogado; container claude-code com limite de sessões estourado até 17:40 BRT (outra campanha). Plano B aplicado (skill): validação por evidência objetiva (E85 automatizado + asserts + MCP real). Nova tentativa de `claude -p` programada para após o reset.

---

## Fase 8.5 — Simulação de Cenários (exigência do gate)

10 simuladores read-only (deleg_ce43d3c9), ANTES de qualquer escrita destrutiva:

| Sim | Escopo | Veredito |
|---|---|---|
| s1 | Drift da main desde baseline | ✅ LIBERADO (0 commits; revalidar antes do push) |
| s2 | EXCLUI de código (importadores vivos?) | ✅ LIBERADO (barrel e normalizer sem importadores reais) |
| s3 | Links de entrada dos ARQUIVA | ✅ LIBERADO (100% relativos; plano de reescrita mecânico) |
| s4 | Colisão com outros agentes | ✅ LIBERADO |
| s5 | Destinos MIGRA no evostack | ❌ BLOQUEADO → mitigado: 3 runbooks já existem em runbooks/ (mais novos) → zapp ARQUIVA em vez de copiar |
| s6 | .hermes consumidos? | ✅ LIBERADO (zero consumidores reais) |
| s7 | CI que rodará nos PRs | ✅ LIBERADO (normalizer+ensaio-fake no MESMO commit; allowlist no mesmo commit) |
| s8 | Stacks residuais usados por deploy? | ✅ LIBERADO |
| s9 | Integridade do changeset | ✅ LIBERADO (1278 linhas, sem migrations em classe destrutiva) |
| s10 | Secrets/PII nos MIGRA | ✅ LIBERADO (sem secrets reais) |

---

## Fase 9 — Execução (E91–E96)

- **E91** ✅ PR-2 (MIGRA): 6 docs copiados para evolution-stack com header de fonte histórica → **PR evolution-stack#11** (mergeable). 3 runbooks NÃO copiados (decisão s5: canônicos mais novos já em runbooks/).
- **E92** ✅ CI evostack: sem gates bloqueantes nos PRs 11/12 (docs/labels-only).
- **E93** ✅ PR-1 (zapp): commit 1 = 84 docs → `docs/_archive/` + reescrita de 26 links + exclusão de 9 ts-nocheck duplicados (diff -q=0 vs `_archive/cutover-reports/`); commit 2 = 19 EXCLUI + ensaio-fake.test.ts + allowlist (188→184 linhas) + BOUNDARY atualizado (client morto → evolutionAdapter).
- **E94** ⏳ validação local: `bunx tsc --noEmit` **EXIT 0** ✅; `bun run build` rodando.
- **E95** ✅ PR-3: labels OCI `image.source` corrigidos nos 2 Dockerfiles → **PR evolution-stack#12**.
- **E96** ⏳ merges (evostack primeiro, zapp depois).

---
