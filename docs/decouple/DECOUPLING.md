# DECOUPLING.md — Plano Mestre de Desacoplamento ZAPP×Evolution

> **Documento canônico de entrada** para o processo de separação dos sistemas.
> Atualizado em: 2026-08-15 · Score T0: 3/9 (33%) — Nota D | Score T1: 4/9 (44%) — Nota D
> Fase 1 concluída em 2026-08-15 · Próxima medição: T2 (após Fase 2 — E25–E36)

---

## Contexto

Durante o desenvolvimento inicial, ZAPP web v3 e Evolution API compartilhavam repositório, banco de dados e container Docker. Em 2026-08-12/13, realizou-se uma separação cirúrgica em 2 dias que estabeleceu a fronteira física (repos distintos, schemas distintos). Este plano formaliza a separação lógica e contratual restante.

### Arquitetura-alvo

```
┌─────────────────────────────────────┐   HTTP egress   ┌──────────────────────────┐
│         ZAPP web v3                 │ ───────────────▶ │   Evolution API          │
│  repo: adm01-debug/zapp-web-v3      │  gateway único   │  repo: evolution-stack   │
│  schema: zapp (canônico)            │                  │  schema: evo (canônico)  │
│  docker: zapp-*                     │ ◀─────────────── │  docker: evolution-*     │
└─────────────────────────────────────┘  webhooks HTTP   └──────────────────────────┘
            │ lê                                                   │ escreve
            ▼                                                       ▼
     12 views de contrato                                  schema evo (raw)
     (evo.v_messages, etc.)
```

**Regra de ouro:**
- `evo.*` → escrito APENAS pela Evolution API
- `zapp.*` → escrito APENAS pelo ZAPP web
- ZAPP lê `evo.*` via 12 views de contrato
- Egresso HTTP: exclusivamente via `supabase/functions/_shared/providers/evolution/client.ts`

---

## Score dos 9 Invariantes

| # | Invariante | T0 (2026-08-15) | T1 (2026-08-15) | Meta |
|---|-----------|-----------------|-----------------|------|
| I1 | Zero funções zapp.* referenciam `evo.*` | 🔴 FAIL (20 funções, 82 refs) | 🔴 FAIL | PASS |
| I2 | Zero funções evo.* referenciam `zapp.*` | 🔴 FAIL (96 funções) | 🔴 FAIL | PASS |
| I3 | `supabase.yml` ausente do repo zapp | 🔴 FAIL (e2e-evolution-vps.yml presente) | 🔴 FAIL | PASS |
| I4 | Todo egresso HTTP via gateway único | 🔴 FAIL (5 cron + 16 pg_net) | 🔴 FAIL | PASS |
| I5 | CI guard bloqueia recriação de infra evo | 🟢 PASS | 🟢 PASS | PASS |
| I6 | Zero INSERT morto em consumer.py | 🟢 PASS (arquivo ausente) | 🟢 PASS | PASS |
| I7 | inventory.mjs cobre todos evolution-* | 🟢 PASS | 🟢 PASS | PASS |
| I8 | Fixture sql-gate sincronizado com prod | 🔴 FAIL (12 vs 25 entradas) | 🟢 PASS (E18–E22) | PASS |
| I9 | Zero FKs cross-schema não documentadas | 🔴 FAIL (6 grupos, 24 linhas evo→zapp) | 🔴 FAIL | PASS |

**Score T0: 3/9 = 33% — Nota D**
**Score T1: 4/9 = 44% — Nota D** (I8 corrigido pela Fase 1 — 2026-08-15)

### Histórico de Scores

| Medição | Data | Score | Nota | Mudanças em relação à medição anterior |
|---------|------|-------|------|----------------------------------------|
| T0 | 2026-08-15 | 3/9 (33%) | D | Baseline inicial — Fase 0 concluída |
| T1 | 2026-08-15 | 4/9 (44%) | D | I8 PASS (fixture sql-gate sincronizado, E18–E22) — Fase 1 concluída |

---

## Fases do Plano (100 etapas)

### Fase 0 — Medição e Baseline (E1–E12) ✅ CONCLUÍDA
- E1: Auditoria dos 9 invariantes
- E2: Contagem real de cron jobs (218 jobs)
- E3: Mapeamento cross-schema refs I1/I2
- E4: Inventário FKs cross-schema (I9)
- E5: Inventário pg_net / I4 violations
- E6: Snapshot cron jobs em JSON
- E7: Script boundary-audit.mjs
- E8: Migration instrumentação pg_net (ops.pgnet_egress_log)
- E9: Documentação ADR-012 T0
- E10: Migration preflight checklist (ops.fn_decouple_preflight)
- E11: Atualizar ESTADO.md com métricas T0
- E12: Tag git `decouple-t0-20260815`

### Fase 1 — Fundação e Documentação (E13–E24) ✅ CONCLUÍDA
- E13: ✅ CLAUDE.md cron count atualizado (151→218)
- E14: ✅ DECOUPLING.md (este documento)
- E15: ✅ SCHEMA_REFERENCE.md com status de desacoplamento
- E16: ✅ ADR-013 — Plano Fase 1 formalizado
- E17: ops.fn_evo_url / ops.fn_evo_key com assinatura _v2
- E18: ✅ Regenerar sql-gate.mjs WHITELIST (12→25 entradas)
- E19: ✅ Freshness check no sql-gate
- E20: ✅ Role live-DB CI para medição de invariantes
- E21: ✅ Expandir inventory.mjs com métricas I1/I2
- E22: ✅ Fixture sql-gate sincronizado (I8 pass)
- E23: ✅ CI job que mede score a cada PR
- E24: ✅ Marcar I8 como PASS; medir T1

### Fase 2 — Separação de Egresso HTTP (E25–E36)
- E25–E28: Refatorar funções evo.* com pg_net direto → via gateway (I4)
- E29–E32: Refatorar funções zapp.* com pg_net direto → via gateway (I4)
- E33: Remover cron jobs em bypass HTTP (5 jobs: 261,427,476,477,478)
- E34: Mover cron cross-schema para schema neutro (ops.*)
- E35: Validar I4 com boundary-audit.mjs
- E36: Tag T2

### Fase 3 — Separação de Cross-Schema SQL (E37–E52)
- E37–E42: Criar views de indireção para refs I1 (zapp→evo)
- E43–E48: Substituir refs diretas em funções I2 (evo→zapp)
- E49: Remover FKs CASCADE DELETE evo→zapp (I9) — converter para SET NULL
- E50: Documentar FKs remanescentes em ADR-014
- E51: Validar I1, I2, I9
- E52: Tag T3

### Fase 4 — CI Guards e Ratchet (E53–E64)
- E53: CI job que conta refs cruzadas (bloqueia regressão I1/I2)
- E54: CI job que verifica FKs cross-schema (I9)
- E55: CI job que audita GRANT EXECUTE (ML-008)
- E56: Ratchet: score nunca pode diminuir entre PRs
- E57: ADR-015 — Contrato de egresso HTTP
- E58: ADR-016 — Contrato de leitura evo via views
- E59–E64: Hardening dos 6 CI guards

### Fase 5 — Schema Registry e Roles (E65–E76)
- E65: Criar role `evo_reader` no Postgres (somente SELECT em evo.*)
- E66: Revogar acesso direto de `authenticated` a tabelas `evo.*`
- E67: Criar role `evo_writer` para a Evolution API
- E68: Schema registry JSON (quem escreve/lê cada schema)
- E69–E72: Aplicar roles e testar com boundary-audit
- E73: ADR-017 — Schema Registry
- E74–E76: Documentar exceções aprovadas

### Fase 6 — Substituibilidade do Provider (E77–E88)
- E77: Interface abstrata de provider WhatsApp
- E78: Adapter Evolution implementa interface
- E79: Teste de substituição: mock provider substitui Evolution sem alterar código ZAPP
- E80–E83: Refatorar `whatsappAdapter.ts` para usar apenas interface
- E84: `RUNBOOK_TROCA_PROVIDER.md` atualizado com procedimento testado
- E85–E88: CI test: provider mock passa todos os testes de integração

### Fase 7 — Limpeza e Deprecações (E89–E96)
- E89: Remover arquivo `.github/workflows/e2e-evolution-vps.yml` (I3 fix)
- E90: Deprecar `callEvolutionApi` (já @deprecated — validar ausência de chamadas)
- E91–E94: Remover código morto identificado nas auditorias
- E95: Audit final de todos os 9 invariantes
- E96: Score T_final esperado: 9/9 (100%) — Nota A

### Fase 8 — Monitoramento Contínuo (E97–E100)
- E97: Dashboard de score no ESTADO.md (atualizado automaticamente via CI)
- E98: Alerta Sentry se score cair
- E99: Runbook de resposta a regressão de invariante
- E100: Retrospectiva e freeze do processo — ADR-018

---

## Arquivos de Referência

| Arquivo | Conteúdo |
|---------|---------|
| `docs/decouple/ADR-012-T0-MEASUREMENT.md` | Medição formal T0 |
| `docs/decouple/BOUNDARY_SCORE_T0.json` | Score JSON estruturado |
| `docs/decouple/CREDENTIAL_BOUNDARY.md` | Fronteira de credenciais |
| `docs/decouple/PAUSE_INGEST.md` | Procedimento de pausa de ingestão |
| `docs/decouple/ROLLBACK_TRIGGERS.md` | Gatilhos de rollback |
| `docs/decouple/baseline/20260815/` | Snapshots de baseline (5 arquivos JSON) |
| `scripts/decouple/boundary-audit.mjs` | Script de medição dos 9 invariantes |

---

## Glossário

| Termo | Definição |
|-------|-----------|
| **Gateway único** | `supabase/functions/_shared/providers/evolution/client.ts` |
| **I1–I9** | Os 9 invariantes de independência |
| **T0** | Baseline de medição em 2026-08-15 |
| **T1** | Próxima medição após Fase 1 completa |
| **pg_net bypass** | Chamada HTTP direta sem passar pelo gateway |
| **Cross-schema FK** | FK entre tabelas de schemas diferentes (evo→zapp) |
| **Ratchet** | Mecanismo que impede o score de regredir |
