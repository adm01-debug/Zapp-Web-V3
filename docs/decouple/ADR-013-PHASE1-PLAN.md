# ADR-013 — Plano da Fase 1: Fundação e Documentação

> **Status**: APROVADO · CONCLUÍDA em 2026-08-15 · Autores: Time de Engenharia ZAPP
> **Fase**: 1 de 8 do Plano de Desacoplamento ZAPP×Evolution
> **Etapas**: E13–E24 (12 etapas)
> **Referência mestre**: [`docs/decouple/DECOUPLING.md`](./DECOUPLING.md)

---

## Contexto

A Fase 0 (E1–E12) estabeleceu o baseline de medição T0: score 3/9 = 33% (Nota D).
As falhas identificadas são:

- **I1**: 20 funções `zapp.*` referenciam `evo.*` (82 referências)
- **I2**: 96 funções `evo.*` referenciam `zapp.*`
- **I3**: `.github/workflows/e2e-evolution-vps.yml` ainda presente
- **I4**: 5 cron jobs + 16 funções pg_net fazem bypass do gateway HTTP
- **I8**: sql-gate fixture desatualizado (12 vs 25 entradas na whitelist)
- **I9**: 24 FK rows cross-schema (6 grupos, todos `evo→zapp`)

A Fase 1 não corrige as violações (isso é Fases 2–4), mas estabelece a fundação
documental, ferramental e contratual necessária para que as correções possam ser
executadas com segurança e medidas objetivamente.

---

## Decisão

Executar as etapas E13–E24 na seguinte ordem, com as seguintes entregas:

### E13 — CLAUDE.md: contagem de cron jobs atualizada ✅ CONCLUÍDA

**Entrega**: `CLAUDE.md` atualizado com `151 → 218` cron jobs (contagem real do prod).
**Rationale**: O CLAUDE.md tinha dado desatualizado (151); a contagem real via `SELECT COUNT(*) FROM cron.job` retornou 218. Documentação correta é pré-requisito para todas as análises subsequentes.

### E14 — DECOUPLING.md (documento mestre) ✅ CONCLUÍDA

**Entrega**: `docs/decouple/DECOUPLING.md` criado com:
- Contexto da separação cirúrgica (2026-08-12/13)
- Arquitetura-alvo (diagrama ASCII)
- Score dos 9 invariantes T0
- Plano de 8 fases (E1–E100)
- Glossário
- Links para todos os documentos de referência

### E15 — SCHEMA_REFERENCE.md: status de desacoplamento ✅ CONCLUÍDA

**Entrega**: `docs/SCHEMA_REFERENCE.md` atualizado com:
- Data de atualização (→ 2026-08-15)
- Nova seção "Status de Desacoplamento T0"
- Regras de propriedade de schema
- Score dos 9 invariantes com referências às etapas de correção
- As 12 views de contrato documentadas
- Tabela de infraestrutura de observabilidade (ops.*)
- Entrada no histórico para 2026-08-15

### E16 — ADR-013: Plano da Fase 1 formalizado ← ESTE DOCUMENTO

**Entrega**: `docs/decouple/ADR-013-PHASE1-PLAN.md` (este arquivo).
**Rationale**: ADRs são a memória arquitetural do projeto. Formalizar o plano da Fase 1
como ADR garante rastreabilidade das decisões e critérios de aceitação claros.

### E17 — ops.fn_evo_url_v2 / ops.fn_evo_key_v2

**Entrega**: Migration SQL criando variantes `_v2` das funções de acesso ao vault:
- `ops.fn_evo_url_v2()` — retorna URL da Evolution API lida do vault
- `ops.fn_evo_key_v2()` — retorna API key da Evolution API lida do vault

**Rationale**: As funções atuais `ops.fn_evo_url()` / `ops.fn_evo_key()` serão deprecadas
quando o gateway único for o único ponto de acesso. As versões `_v2` terão assinatura
versionada explícita para que o gateway possa referenciar uma versão estável enquanto
as funções antigas são gradualmente removidas.

**Critério de aceite**: Migration aplicada; `SELECT ops.fn_evo_url_v2()` retorna URL válida;
linter ML-008 não dispara (sem `GRANT EXECUTE TO authenticated` em SECURITY DEFINER).

### E18 — Regenerar sql-gate.mjs WHITELIST (12 → 25 entradas) ✅ CONCLUÍDA

**Entrega**: `scripts/decouple/sql-gate.mjs` com WHITELIST expandida para cobrir as 25
tabelas/views confirmadas em produção.

**Rationale**: O sql-gate atual tem apenas 12 entradas na whitelist — o I8 falha porque
há 25 objetos documentados em prod. Sem essa correção, qualquer PR que adicione uma
referência SQL válida é falsamente bloqueado.

### E19 — Freshness check no sql-gate ✅ CONCLUÍDA

**Entrega**: `scripts/decouple/sql-gate.mjs` com verificação de freshness:
- Se a WHITELIST não foi atualizada nos últimos 30 dias, emitir WARN
- Se a WHITELIST foi gerada contra uma versão de schema diferente, emitir FAIL

**Critério de aceite**: `bun run scripts/decouple/sql-gate.mjs --check-freshness` passa.

### E20 — Role CI para medição de invariantes em DB vivo ✅ CONCLUÍDA

**Entrega**: Workflow `.github/workflows/measure-invariants.yml` que:
- Conecta ao DB de prod (via `SUPABASE_DB_URL` secret) em read-only
- Executa queries de medição para I1, I2, I4, I8, I9
- Publica o score como artifact e como PR comment
- **Não bloqueia**: modo informativo (advisory)

**Rationale**: Sem medição automática, o score T0 envelhece. O CI deve medir a cada PR.

### E21 — inventory.mjs: métricas I1/I2 ✅ CONCLUÍDA

**Entrega**: `scripts/decouple/inventory.mjs` expandido com:
- Contagem de funções `zapp.*` que referenciam `evo.*` (I1)
- Contagem de funções `evo.*` que referenciam `zapp.*` (I2)
- Output em JSON estruturado com delta vs baseline

### E22 — Fixture sql-gate sincronizado (I8 pass) ✅ CONCLUÍDA

**Entrega**: Arquivo de fixture `scripts/decouple/sql-gate-fixture.json` sincronizado com
as 25 entradas reais de produção.

**Critério de aceite**: `bun run scripts/decouple/sql-gate.mjs --validate-fixture` retorna PASS;
invariante I8 muda de FAIL para PASS.

### E23 — CI job que mede score a cada PR ✅ CONCLUÍDA

**Entrega**: `.github/workflows/measure-invariants.yml` produzindo score consolidado (I1–I9)
como PR comment via `github-script`.

**Formato do comment**:
```
### Score de Desacoplamento ZAPP×Evolution
| # | Invariante | Status | Detalhe |
|---|-----------|--------|---------|
| I1 | zapp.* → evo.* | 🔴 FAIL | 20 funções, 82 refs |
...
**Score: 3/9 (33%) — Nota D**
```

### E24 — Marcar I8 como PASS; medir T1 ✅ CONCLUÍDA

**Entrega**: I8 marcado como PASS após E22 confirmar sincronização.
Score T1 medido e documentado: **4/9 (44%) — Nota D** (I8 corrigido).
Entrada no histórico do DECOUPLING.md com score T1 e data (2026-08-15).

---

## Critérios de Aceite da Fase 1 (global)

- [x] Todos os E13–E24 commitados e no branch de produção
- [x] Score T1 ≥ 4/9 (I8 corrigido) — T1 = 4/9 confirmado em 2026-08-15
- [x] CI job de medição de invariantes ativo em todo PR (E23 concluída)
- [x] SCHEMA_REFERENCE.md, DECOUPLING.md e este ADR-013 em sync (E15, E24)
- [x] Zero regressões nos invariantes I5, I6, I7 (que já eram PASS)

---

## Alternativas Consideradas

**Alternativa A**: Corrigir diretamente as violações (pular Fase 1 e ir para Fase 2).
- **Rejeitada**: Sem instrumentação e documentação adequadas, as correções não têm
  critérios de aceitação mensuráveis. Risco de introduzir novas violações sem perceber.

**Alternativa B**: Usar um script one-shot para medir tudo e corrigir em batch.
- **Rejeitada**: Correções em batch têm alto risco de conflito e difícil rollback.
  A abordagem incremental (uma etapa por vez) permite validação em cada passo.

---

## Consequências

**Positivas**:
- Fundação documental sólida para as Fases 2–8
- Medição automática impede regressão de score
- ADRs criam memória arquitetural rastreável

**Negativas/Trade-offs**:
- A Fase 1 não resolve nenhuma violação — o score pode não mudar (exceto I8)
- Custo de manutenção dos scripts de medição

---

## Referências

- [DECOUPLING.md](./DECOUPLING.md) — Plano mestre de 100 etapas
- [ADR-012-T0-MEASUREMENT.md](./ADR-012-T0-MEASUREMENT.md) — Medição formal T0
- [BOUNDARY_SCORE_T0.json](./BOUNDARY_SCORE_T0.json) — Score JSON estruturado
- [SCHEMA_REFERENCE.md](../SCHEMA_REFERENCE.md) — Status dos invariantes
