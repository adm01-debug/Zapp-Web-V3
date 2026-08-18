# MATRIZ DE COBERTURA — PLANO 100 ETAPAS (auditoria 2026-08-18)

**Método**: 10 agentes (blocos de 10 etapas) × evidência real (git log, código, banco vivo via MCP, CI via gh, stacks). Plano de referência: `docs/audit-2026-08-16/PLANO-100-ETAPAS.md` + índice `insumo/indice-100-etapas.txt`.

## Síntese por fase

| Fase | Etapas | ✅ Completa | 🟡 Parcial | ⬜ Não iniciada | ⛔ Bloqueada | Nota |
|---|---|---|---|---|---|---|
| F1 Segurança | E1-E10 | 1 (E6) | 3 | 6 | 2 (E1/E2 ação humana) | E7/E8 (RLS/SECDEF) são as maiores frentes abertas de segurança |
| F2 Testes/CI | E11-E20 | 0 | 9 | 1 (E12) | 0 | **E15 gargalo: 14 gates vermelhos no main hoje** |
| F3 Backend/Realtime | E21-E30 | 5 (E22,24,25,28,29) | 4 | 1 (E30) | 0 | E21 falta prova WS E2E; fanout é o caminho confiável |
| F4 Inbox núcleo | E31-E40 | 0 | ~4 | ~6 | 0 | Critérios de grep falham (Math.random em tópicos, getRealtimeDiscardedCount exportado) |
| F5 Inbox UI | E41-E50 | 3 (E41,43,44) | 7 | 0 | 0 | E42: "Adicionar tag" disabled no header |
| F6 Auth/Admin | E51-E60 | 0 | 5 | 5 | 0 | **E51/E52 (bypass dev, MFA fail-open) intocados — maior risco de segurança** |
| F7 Features | E61-E70 | 2 (E64,65) | 7 | 1 (E67) | 0 | TalkX sem scheduler no self-hosted; 0 linhas de campanha |
| F8 Integrações | E71-E80 | 0 | 10 | 0 | 0 | Ausência de ADRs; stubs RAISE P0001 ativos; front não religado |
| F9 Infra/evolution | E81-E90 | 1 (E82) | 9 | 0 | E83/E84 (Meta) | Janela de ensaio 23/08 agendada |
| F10 Fechamento | E91-E100 | 0 | 4 | 2 (E99,E100) | 1 (E97 aprovação) | E91 (OOM purge) PENDENTE; fase 10 essencialmente não executada |

**TOTAL**: ~12 ✅ · ~50 🟡 · ~22 ⬜ · ~4-6 ⛔ · ~10 sem classificação explícita (PENDENTE/SUPERSEDED)

## Etapas SUGERIDAS NÃO IMPLEMENTADAS (sem nenhum artefato)

| E## | Título | Por que não foi feita |
|---|---|---|
| E1 | Deletar migrate-helper cloud + rotacionar creds Lovable | ação humana (painel Lovable Cloud) |
| E2 | Rotacionar JWT_SECRET + filter-repo | janela de manutenção/dono |
| E4 | VAULT_ENC_KEY placeholder + secrets functions | parcialmente absorvido (secrets montados) — placeholder persiste |
| E5 | Privatizar buckets PII + imgproxy | não iniciada (buckets whatsapp-media 9,56GB) |
| E7 | RLS tenant-aware (eliminar USING(true)) | não iniciada — frente grande |
| E8 | SECDEF 1.131 expostas (fix search_path) | não iniciada — frente grande |
| E12 | Cobertura negativa webhookStatusPriority | não iniciada |
| E30 | 13 índices (aguarda sênior) | não iniciada |
| E31-E40 | Inbox núcleo (testes de hooks, tópicos determinísticos) | estrutura parcial, critérios falham |
| E51 | Blindar bypass dev (whitelist de ambiente) | **não iniciada — segurança** |
| E52 | MFA pós-login fail-closed | **não iniciada — segurança (catch fail-open INTACTO)** |
| E53/E58/E59 | Auth/Admin (sessões, convites, invoke) | não iniciadas |
| E67 | SLA | não iniciada |
| E91 | evolution-db-purge OOM fix | PENDENTE (P1) |
| E99/E100 | Retrospectiva/placar final | não iniciadas |

## Etapas PARCIAIS (o que falta — destaques)

- **E15**: CI do main com 14 gates vermelhos (design-system 152>130, drift, unit tests) — trava todos os merges
- **E21**: prova WS E2E do realtime documentada (fanout é o caminho; falta o teste de socket com JWT)
- **E42**: ChatHeaderMenu "Adicionar tag" disabled
- **E61**: TalkX scheduler-check não existe no self-hosted (canonical nunca aplicada)
- **E71-E80**: ADRs ausentes (E71/E72/E76/E79), stubs RAISE P0001 ativos (E76), frontend não religado (E75/E77)
- **E81/E83/E84**: cobertura do provider cloud (8+ edges importam evolutionClient direto); E83/E84 aguardam Meta (janela 23/08)
- **E92**: deploy-vps-selfhosted.yml DRAFT ATIVO (roda em todo push!) + notify-ci-failure 5/6 nomes mortos
- **E95/E96/E97/E98**: fases de encerramento parciais; E97 aguarda aprovação

## Observações transversais

1. **O CI do main está quebrado** (E15) — 14 gates vermelhos: design-system 152>130 (onda de outros agentes), drift zapp, unit tests do diagrama. Qualquer PR novo vai falhar o quality-gate até resolver.
2. **Segurança fail-closed intocada** (E51/E52) — bypass dev sem whitelist + MFA fail-open: são os maiores riscos residuais.
3. **O núcleo de decoupling (I1-I5, I8) está verde** — a coluna vertebral do plano foi implementada; o que falta é majoritariamente: testes/evidências formais, ADRs, frentes de segurança, integrações frontend e o fechamento (Meta + F10).

**Autor**: Hermes (auditoria 18/08) · Placar BOUNDARY_SCORE_T1: 6/9 PASS (I1-I5, I8; I6/I7/I9 PARCIAL)
