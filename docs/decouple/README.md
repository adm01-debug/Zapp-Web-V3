# docs/decouple — Índice canônico da pasta

> **Status:** VIVO · **Data:** 2026-08-14 · Este README é o índice oficial da pasta `docs/decouple/` (desacoplamento Zapp ↔ Evolution API).
> **Legenda:** 🟢 VIVO (referência atual) · 🟡 HISTÓRICO (superseded; manter como registro) · 🔴 LIXO-typo (stub com nome errado — **marcado para o orquestrador avaliar remoção**).

## Índice (nome — status — o que é)

| Arquivo | Status | O que é |
|---|---|---|
| `README.md` | 🟢 VIVO | Este índice canônico da pasta. |
| `EGRESS_SURFACE_V4.md` | 🟢 VIVO | Inventário formal das 10 edge functions `evolution-*`: papel, chamadores, classificação, allowlist de actions da porta canônica `evolution-api` e destino de cada função. |
| `PLANO_DESACOPLAMENTO_V4_FINAL_100_ETAPAS_20260814.md` | 🟢 VIVO | Plano V4-FINAL (2026-08-14): o plano vigente de 100 etapas — fonte de verdade da execução atual. |
| `BASELINE.md` | 🟢 VIVO | Baseline do desacoplamento (2026-08-13): digests de produção, ponto de rollback `pre-decouple-v0` e procedimento de reversão. Complementado pelo `BASELINE_V4.md`. |
| `BASELINE_V4.md` | 🟢 VIVO | Baseline V4 (2026-08-14, Agente 8 da onda): retrato factual medido do desacoplamento (fatos, vereditos, fixes aplicados) — substitui `SCORECARD_V3.md` como leitura de estado. |
| `CENARIOS_V4_LOG.md` | 🟢 VIVO | Log de cenários de risco E1–E30 com vereditos (Mitigado/Aceito/Ação), 2026-08-14 (Agente 8 da onda) — consolida a simulação pré-F1/F2 (etapa 89 do V4-FINAL). |
| `ADR-008-canonical-domain-model.md` | 🟢 VIVO | ADR-008: modelo de domínio canônico (schemas `evo`/`zapp`/`public` como camada de API). |
| `ADR-009-gateway-pattern.md` | 🟢 VIVO | ADR-009: padrão de gateway (fronteira app ↔ provider Evolution). |
| `ADR-010-sql-gateway.md` | 🟢 VIVO | ADR-010: gateway SQL (views `security_invoker` + RPCs como única ponte de dados). |
| `RUNBOOK_TROCA_PROVIDER.md` | 🟢 VIVO | Runbook operacional para troca de provider de mensageria (Evolution ↔ Meta) com gates de aceite. |
| `CANONICAL_COLUMN_MAP.md` | 🟢 VIVO | Mapa canônico de colunas (mapeamento `evo`/`zapp` e contratos de coluna). |
| `CLASSIFICATION_A_B.md` | 🟢 VIVO | Classificação A/B de tabelas/objetos (Grupo A/B) para o desacoplamento. |
| `PREFLIGHT_CHECKLIST.md` | 🟢 VIVO | Checklist pré-voo (567 linhas) para execução de ondas de mudança do desacoplamento. |
| `HANDOFF.md` | 🟡 HISTÓRICO | Handoff mestre (670 linhas) do estado pré-V4 — superseded pelo V4-FINAL; manter como registro. |
| `HANDOFF_EXAUSTIVO_20260813.md` | 🟡 HISTÓRICO | Handoff exaustivo de 13/08 (291 linhas) — registro da fase V3. |
| `HANDOFF_FINAL_20260813.md` | 🟡 HISTÓRICO | Handoff final de 13/08 — fechamento da fase V3. |
| `HANDOFF_POS_DESACOPLAMENTO_20260813.md` | 🟡 HISTÓRICO | Handoff pós-desacoplamento de 13/08 (456 linhas) — registro da execução dos lotes 1-2. |
| `PLANO_DESACOPLAMENTO_100_ETAPAS.md` | 🟡 HISTÓRICO | Plano V1 (100 etapas) — superseded pelo V2+. |
| `PLANO_DESACOPLAMENTO_V2_100_ETAPAS.md` | 🟡 HISTÓRICO | Plano V2 (100 etapas) — superseded pelo V3. |
| `PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md` | 🟡 HISTÓRICO | Plano V3 (100 etapas) — superseded pelo V4-FINAL. |
| `PLANO_DESACOPLAMENTO_V4_100_ETAPAS_20260814.md` | 🟡 HISTÓRICO | Plano V4-A (14/08) — superseded pelo V4-Claude e V4-FINAL. |
| `PLANO_DESACOPLAMENTO_V4_CLAUDE_100_ETAPAS_20260814.md` | 🟡 HISTÓRICO | Plano V4-Claude (14/08) — superseded pelo V4-FINAL. |
| `DOC_UPDATE_ORCHESTRATION_20260814.md` | 🟡 HISTÓRICO | Registro da orquestração de atualização de docs de 14/08 (concluída — BOUNDARY-zapp.md criado). |
| `SCORECARD_V3.md` | 🟡 HISTÓRICO | Scorecard da fase V3 — superseded; manter como registro de métricas. |
| `VALIDACAO_V3.md` | 🟡 HISTÓRICO | Validação da fase V3 — superseded; registro de gaps/vereditos V3. |
| `RETRO_V2.md` | 🟡 HISTÓRICO | Retrospectiva da fase V2 — registro histórico. |
| `SIMULATION_REPORT.md` | 🟡 HISTÓRICO | Relatório da simulação (cenários E1-E5/E19-E21) — matéria-prima; vereditos consolidados em `CENARIOS_V4_LOG.md` (VIVO). |
| `SIMULATION_SCENARIOS_20260814.md` | 🟡 HISTÓRICO | Cenários da simulação V4 (14/08, 241 linhas) — matéria-prima; idem acima. |
| `HANDOFF_POS_DESACOPLOMENTO_20260813.md` | 🔴 LIXO-typo | Stub de 240B com **typo no nome** ("DESACOPLOMENTO"); duplicata do `HANDOFF_POS_DESACOPLAMENTO_20260813.md` — avaliar remoção. |
| `PLANO_DESACOPLOMENTO_100_ETAPAS.md` | 🔴 LIXO-typo | Stub de 240B com **typo no nome**; duplicata do `PLANO_DESACOPLAMENTO_100_ETAPAS.md` — avaliar remoção. |
| `PLANO_DESACOPLOMENTO_V2_100_ETAPAS.md` | 🔴 LIXO-typo | Stub de 240B com **typo no nome**; duplicata do `PLANO_DESACOPLAMENTO_V2_100_ETAPAS.md` — avaliar remoção. |

## Notas de fronteira (itens referenciados, ausentes da pasta)

- **BOUNDARY refs:** `docs/BOUNDARY-evolution.md` e `docs/BOUNDARY-zapp.md` **não ficam nesta pasta** — vivem em `docs/` (fronteira física) e no repo `evolution-stack` (BOUNDARY-zapp, agente A3). Referenciados pelos planos V3/V4 como artefatos vivos de fronteira.
- **`CENARIOS_V4_LOG.md`:** 🟢 VIVO (criado nesta onda, 2026-08-14 — Agente 8) — log E1–E30 com vereditos; substitui `SIMULATION_REPORT.md`/`SIMULATION_SCENARIOS_20260814.md` como fonte de vereditos (etapa 89 do V4-FINAL executada).
- **Stubs 🔴 (240B):** os 3 arquivos com typo são apenas um NOTE de "HISTÓRICO — SUPERSEDED pelo V3" com nome errado — sem conteúdo próprio; remoção não perde informação (o conteúdo real vive nos arquivos sem typo).

## Convenção de manutenção

- Só arquivos 🟢 VIVO devem ser editados como referência atual.
- Arquivo novo entra no índice no mesmo commit em que é criado.
- Ao superseder um documento: mover a linha para 🟡 HISTÓRICO (nunca apagar) e apontar o sucessor no campo "o que é".
- Remoção de arquivo 🔴 LIXO-typo: decisão do orquestrador (este índice marca, não executa).
