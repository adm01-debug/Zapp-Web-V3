# ADR-012 — Medição Formal T0: Score de Independência ZAPP×EVO

**Status:** ACCEPTED  
**Data:** 2026-08-15  
**Autores:** Equipe Arquitetura + Análise automatizada boundary-audit v1  
**Supersede:** nada (primeiro ADR de medição formal de fronteira)  
**Relacionado:** ADR-009, ADR-010, ADR-011

---

## Contexto

Em 2026-08-15 foi realizada a primeira medição formal do grau de independência
entre os sistemas ZAPP web v3 e Evolution API após dois dias de separação cirúrgica
iniciada em 2026-08-12/13.

O objetivo de longo prazo é que os dois sistemas sejam **individualmente independentes
e autônomos**, interconectados apenas por:
1. Egresso HTTP do ZAPP→EVO via gateway único (`_shared/providers/evolution/client.ts`)
2. Ingestão HTTP do EVO→ZAPP via webhooks (sem acoplamento de DB direto)
3. Views de contrato (12 views de leitura no schema `zapp` que espelham tabelas `evo`)

Este ADR documenta o estado inicial (T0) e os 9 invariantes que definem "independência
completa" (score 9/9 = Nota A).

---

## Decisão: 9 Invariantes de Independência

Os seguintes invariantes foram definidos como critérios de aceitação formal.
**Todos os 9 devem estar satisfeitos para declarar independência completa.**

| ID | Nome | Critério de Aceitação |
|----|------|-----------------------|
| I1 | Zero refs zapp→evo em funções SQL | `zapp.*` não referencia `evo.*` em nenhuma função PL/pgSQL |
| I2 | Zero refs evo→zapp em funções SQL | `evo.*` não referencia `zapp.*` em nenhuma função PL/pgSQL |
| I3 | supabase.yml não em zapp-web-v3 | Nenhum workflow de *infra* Evolution no repo ZAPP |
| I4 | Egresso HTTP via gateway único | Zero bypass: sem `net.http_*` ou `extensions.http_*` direto (exceto whitelist ops.) |
| I5 | CI guard ativo | `decouple-guard.yml` presente e funcional |
| I6 | consumer.py sem INSERT morto | Arquivo não pertence ao repo ZAPP |
| I7 | inventory.mjs cobre todos evolution-* | Script mede todos os 4 eixos de acoplamento frontend |
| I8 | sql-gate fixture sincronizado | Número de entradas no fixture == número de funções SQL no prod |
| I9 | Zero FKs cross-schema | Nenhuma FK de `evo.*` apontando para `zapp.*` (ou vice-versa) |

---

## Medição T0 (2026-08-15)

**Score: 3/9 (33%) — Nota D**

```
Passou  (3): I5, I6, I7
Falhou  (6): I1, I2, I3, I4, I8, I9
Parcial (0): —
Erro    (0): —
```

### Detalhamento por Invariante

#### I1 — FALHOU (0%)
- **Violações:** 82 referências cruzadas em 20 funções distintas do schema `zapp`
- **Top violadores:** `fn_upsert_lid_identity` (20 refs), `fn_register_instance` (5 refs), `fn_reconcile_apply` (5 refs)
- **Baseline:** `docs/decouple/baseline/20260815/zapp_evo_refs.json`

#### I2 — FALHOU (0%)
- **Violações:** 96 funções distintas no schema `evo` que referenciam `zapp.*`
- **Top violadores:** `fn_test_normalizer_deep` (24 refs), `fn_repontar_filhas_graveyard` (17 refs), `fn_upsert_group_participants` (14 refs)
- **Baseline:** `docs/decouple/baseline/20260815/evo_zapp_refs.json`

#### I3 — FALHOU (0%)
- **Violação:** `.github/workflows/e2e-evolution-vps.yml` — workflow de E2E que invoca Evolution API diretamente na VPS
- **Nota:** Este workflow é diferente do `decouple-guard.yml` (que É a guarda). O e2e-evolution-vps.yml é infra de teste que pode ser considerado legítimo, mas tecnicamente viola I3 por conectar ao stack Evolution.

#### I4 — FALHOU (0%)
- **Cron violations (14 total):**
  - 9 jobs com queries cross-schema bidirecional (`cross_schema_bidirectional`)
  - 2 jobs com `net.http_*` (`I4_net_http`: jobids 427, 476)
  - 3 jobs com `extensions.http_*` (`I4_extensions_http`: jobids 261, 477, 478)
- **pg_net functions (18 total):**
  - 16 funções de aplicação acessando `evo.*` ou `zapp.*` via pg_net sem usar o gateway
  - 2 infra (aceitas)
- **Baseline:** `docs/decouple/baseline/20260815/cron_jobs.json` + `pg_net_functions.json`

#### I5 — PASSOU (100%)
- `decouple-guard.yml` presente em `.github/workflows/`
- Contém verificações de evolution/inventory/sql-gate

#### I6 — PASSOU (100%)
- `consumer.py` não existe em zapp-web-v3 (correto — pertence ao evolution-stack)

#### I7 — PASSOU (100%)
- `scripts/decouple/inventory.mjs` v4 presente e cobre todos os 4 eixos:
  - `frontEvoBypass`, `backendUrlBypass`, `frontEvoWrites`, `frontDirectEvoHttp`

#### I8 — FALHOU (0%)
- **Fixture:** 12 entradas em `WHITELIST` + `WHITELIST_SHORT` do sql-gate
- **Prod:** 25 funções SQL com egresso evolution (via `pg_proc`)
- **Gap:** 13 funções não mapeadas
- Baseline: sql-gate `WHITELIST` contém apenas `ops.fn_evo_url`, `ops.fn_evo_key`, `zapp.fn_check_license_heartbeat`, `evo.fn_detect_instance_recreate`

#### I9 — FALHOU (0%)
- **Violações:** 24 linhas de FK, 6 grupos de constraints distintos
- **Direção:** todos `evo.*` → `zapp.*` (evo depende de zapp — inversão da dependência ideal)
- **Risco:** FKs com `CASCADE DELETE` em `media_download_queue` podem propagar deleções cross-schema
- **Baseline:** `docs/decouple/baseline/20260815/cross_schema_fks.json`

---

## Ferramenta de Medição

Script canônico para rerun: `scripts/decouple/boundary-audit.mjs`

```bash
# Modo online (contra DB de prod)
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/decouple/boundary-audit.mjs

# Modo offline (usa baselines T0)
DB_OFFLINE=1 node scripts/decouple/boundary-audit.mjs

# Com output customizado
node scripts/decouple/boundary-audit.mjs --out docs/decouple/BOUNDARY_SCORE_Tn.json
```

Saída em: `docs/decouple/BOUNDARY_SCORE_T0.json`

---

## Consequências

### O que este ADR estabelece

1. **Baseline formal T0**: Score 3/9 é o ponto de partida quantificado. Todas as
   melhorias futuras serão medidas contra este score.

2. **Priorização de correções**: I4 (egresso HTTP) e I9 (FKs cascade) são os
   de maior risco de runtime; I1/I2 (refs cross-schema) são os de maior volume
   de trabalho.

3. **Meta final**: Score 9/9 (Nota A) — nenhum ADR pode declarar independência
   completa antes disso.

4. **Cadência de rerun**: O boundary-audit deve ser executado em todo CI que
   mexer em migrations SQL, edge functions ou cron jobs.

### O que este ADR NÃO decide

- Como corrigir cada violação (cada invariante terá seu próprio ADR ou etapa no plano)
- Prazo para atingir 9/9

### Evolução esperada

| Marco | Score Alvo | Nota |
|-------|------------|------|
| T0 (2026-08-15) | 3/9 | D |
| T1 (após Phase 0-1) | 5/9 | C |
| T2 (após Phase 2-3) | 7/9 | B |
| T3 (independência) | 9/9 | A |

---

## Artefatos

| Artefato | Localização | Commit |
|----------|-------------|--------|
| Baselines DB (5 JSONs) | `docs/decouple/baseline/20260815/` | 5424039 |
| boundary-audit.mjs | `scripts/decouple/boundary-audit.mjs` | 1508a5d |
| BOUNDARY_SCORE_T0.json | `docs/decouple/BOUNDARY_SCORE_T0.json` | b4eea10 |
| Este ADR | `docs/decouple/ADR-012-T0-MEASUREMENT.md` | (este commit) |
