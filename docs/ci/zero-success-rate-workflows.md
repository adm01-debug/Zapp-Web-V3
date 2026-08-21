# 💀 Zero-Success-Rate Workflows

**Repositório:** adm01-debug/Zapp_Web_V3
**Levantamento original:** 2026-07-30 (39 workflows, 8 zero-success)
**Revisão:** 2026-08-20 (plano-100 etapa 67) — 49 workflows no HEAD naquele momento;
placar da triagem abaixo. A consolidação da etapa 68 (remoção de
`post-deploy-check.yml`, ver nota abaixo) trouxe a contagem para **48**, que é o
número reportado em `docs/ARQUITETURA_CANONICA.md` e na `VALIDACAO_PLANO_100` —
ambos medidos *depois* dessa remoção.

> Este arquivo morava na raiz do repo; movido para `docs/ci/` na higiene de 2026-08-20.

---

## Placar da triagem (2026-08-20)

Dos 8 workflows zero-success identificados em 2026-07-30:

| # | Workflow | Situação em 2026-08-20 |
|---|---|---|
| 1 | `cleanup-e2e-data.yml` | ✅ **REESCRITO** — virou `Cleanup E2E data (REST)` com `schedule` diário 07:00 e `rpc_e2e_cleanup` |
| 2 | `commitlint.yml` | ✅ **REMOVIDO** |
| 3 | `gen-types-zapp.yml` | 🟡 **MITIGADO** — schedule semanal removido; hoje é `workflow_dispatch` puro |
| 4 | `e2e-evolution-vps.yml` | ✅ **REMOVIDO** (também exigido pelo desacoplamento — invariante I3) |
| 5 | `merge-bot.yml` | ✅ **REMOVIDO** |
| 6 | `migration-smoke-test.yml` | 🟡 **MITIGADO** (2026-08-21, plano-100) — causa raiz do 0% histórico (Python 3.8 do host runner sem wheel `pglast` p/ cp38) corrigida rodando o gate de sintaxe `[BLOQUEANTE]` num container `python:3.12-slim`; confirmado passando pela primeira vez (run `32477745568`). Limitação que permanece: o step seguinte ("Collect and apply migrations", delta-only) tem `continue-on-error: true` e aplicou 4/6 migrations nesse mesmo run — falha em `20260821003000_materializa_policies_team_messages_dml.sql` porque o apply delta não repõe `zapp.team_messages` (criada só no squash canônico, fora do delta). Isso é uma limitação conhecida da otimização "aplica só o delta do PR" (comentário no próprio workflow), não uma migration quebrada — mas o job ainda não é um from-scratch real. |
| 7 | `migration-uniqueness-check.yml` | ✅ **REMOVIDO** (superseded por `migration-uniqueness.yml`, que passa) |
| 8 | `pr-size-check.yml` | ✅ **REMOVIDO** (superseded por `pr-size-gate.yml`, que passa) |

**Resultado: 5 removidos · 3 mitigados/reescritos · 0 pendentes.**

Consolidações adicionais feitas em 2026-08-20 (etapa 68):
- `post-deploy-check.yml` **removido** — duplicava integralmente o job `post-deploy-health`
  do `deploy-vps.yml` (mesmos 3 checks TTM/PostgREST/edge rodavam 2× por deploy).

Sobreposições que permanecem mapeadas (candidatas a consolidação futura — ver
`docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md`, etapa 68):
- `edge-parse-gate.yml` × primeiro job do `edge-deploy.yml` (mesmo parse gate 2×);
- blocos idênticos de extração de `PUBLIC_FNS` em `edge-auth-smoke.yml` × `edge-schema-parity.yml`;
- `schema-drift.yml` × `zapp-schema-drift-gate.yml` (dois gates de drift com triggers sobrepostos em PR de migrations).

---

## Levantamento original (2026-07-30) — mantido como histórico

Todos os 8 abaixo tinham **0% de sucesso em todos os runs da história**.

| Workflow | Runs | Falhas | Avaliação da época |
|---|---|---|---|
| Cleanup E2E data (VPS) | 7 | 7 | cleanup dependia de infra quebrada |
| commitlint | 2 | 2 | superseded / fora da main |
| Generate Supabase Types (zapp) | 17 | 16 (+1 inconclusivo) | schedule semanal queimando runner sem nunca passar |
| E2E Evolution (VPS) | 1 | 1 | nunca passou |
| merge-bot | 2 | 2 | superseded |
| Migration Smoke Test | 96 | 94 (+2 cancel.) | **maior desperdício** — aplicar migrations do zero nunca passou |
| migration-uniqueness-check | 1 | 1 | redundante (gate bom: `migration-uniqueness.yml`) |
| pr-size-check | 2 | 2 | redundante (gate bom: `pr-size-gate.yml`) |

### Metodologia (original)
1. Listagem via `GET /repos/{owner}/{repo}/actions/workflows`
2. Runs paginados (100/página) por workflow
3. `success rate = successes / total_completed_runs`
4. Zero-success = 0 sucessos em toda a história
