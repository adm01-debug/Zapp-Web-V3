# Consertos — Auditoria zapp-web-v3 (2026-08-18)

Resumo factual das rodadas de conserto executadas em 2026-08-18 sobre a auditoria de 14 ondas (`auditorias/zapp-web/2026-08-18-auditoria-14-ondas.md`). Repo: `adm01-debug/Zapp-Web-V3`.

## Rodadas de conserto

| Rodada | Escopo | Resultado | Evidência |
|---|---|---|---|
| R0 | Lint: import morto + 47 violações design (138→91) | Lint EXIT=0 (91 violações, teto 130) | `bun run lint` |
| R0.5 | Typecheck produção: 21 erros → 0 | `tsc -p tsconfig.app.json` 0 erros | `tsc` |
| R0.6 | Typecheck testes: 58 erros → 0 | 0 erros (total 79→0) | `tsc` |
| R4 | 29 tautologias de aprovação falsa → `it.todo`/remoção | Tautologias eliminadas | suíte vitest |

## PRs

| PR | Rodada | Estado |
|---|---|---|
| #1234 | R0 lint | ✅ merged |
| #1235 | R0.5 typecheck produção | ✅ merged |
| #1236 | R0.6 typecheck testes | ✅ merged |
| #1237 | R4 tautologias | ⏳ aberto |

## Baseline (depois dos fixes)

| Gate | Estado |
|---|---|
| `tsc -p tsconfig.app.json` (gate real) | 0 erros |
| `bun run lint` | EXIT=0 |
| Suíte vitest | 7915 passed · 35 failed (8 arquivos) · 11 skipped · 22 todo |
| CI GitHub | bloqueado por BILLING (validação 100% local) |

As 35 falhas restantes são **pré-existentes** (provadas na main pura) — 15 em team-chat-comprehensive, 6 RED por contrato da Etapa 65 (mensagens agendadas), demais não tocadas.

## O que falta (backlog)

| Item | Descrição |
|---|---|
| R1 | Auth fail-open: `get-media-base64` baixa mídia de qualquer chat — tenant/role check |
| R2 | Fachada `mcp-server` — construir real ou ADR de remoção |
| R3 | RLS: triagem de 71 policies `USING(true)` sem DROP (443 policies) |
| R5 | Etapa 65: mensagens agendadas (RLS + dispatcher + migration; testes RED definem contrato) |
| R6 | Dead code: `_archive/healthCheck.archived.ts` + órfãos |
| Cron | Inventário 136 hits pg_cron (onda 12) — revisar |
| Webhooks | Stubs/zumbis em edge functions (onda 6) — triagem |
| CI | Desbloquear GitHub Actions (billing) |
