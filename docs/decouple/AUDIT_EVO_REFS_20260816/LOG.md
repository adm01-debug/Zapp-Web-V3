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
