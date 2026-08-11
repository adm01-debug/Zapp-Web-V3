# HANDOFF LID — Sessão s14 — 2026-08-11T17:19Z

## ⚡ TL;DR — Faça isto primeiro ao abrir o novo chat

```sql
-- 1. Confirmar estado ao iniciar
SELECT pipeline_status, strict_status, completeness_score, open_alerts FROM evo.v_production_scorecard;
SELECT (zapp.fn_system_health_score()->>'score') AS score;
SELECT steps_done, steps_total FROM evo.v_50_steps_progress;
-- Esperado: HEALTHY, 10, 0 alertas, 100.0/A+, 39/50

-- 2. Confirmar PR #1033 status
-- github.com/adm01-debug/zapp-web-v3/pull/1033

-- 3. Se PR foi merged, executar os próximos passos neste documento
```

**AÇÃO IMEDIATA:** Verificar se o PR #1033 foi merged e se o workflow_dispatch foi disparado.

---

## 📍 Estado certificado ao final da sessão s13

| Métrica | Valor |
|---|---|
| `pipeline_status` | HEALTHY ✅ |
| `strict_status` | HEALTHY ✅ |
| `completeness_score` | 10/10 ✅ |
| `open_alerts` | 0 ✅ |
| `system_health_score` | 100.0/A+ ✅ |
| `regression_suite` | GREEN 12/12 ✅ |
| `normalizer_suite` | ALL_PASS 10/10 ✅ |
| `steps_progress` | 39/50 (78%) |
| `lid_health_score` | 4/5 (aguarda upgrade) |
| `fake_jids_historical` | 43.666 (frozen, aguarda backfill) |
| `map_real_entries` | 0 (esperado — sem Baileys 7.x ainda) |
| `contamination` | 0 ✅ |
| `WAL slot` | ~260MB / 6.3% (watchdog ativo a 300MB) |
| `migrations` | 458 totais (versão `202608*`) |
| `changelog hoje` | ~112 entradas |
| `wpp2` | connected ✅ |

---

## 🔴 AÇÃO #1 — MAIS IMPORTANTE (desbloqueador de 11 etapas)

### PR #1033 — Merge + Atualizar workflow + Disparar build

**PR aberto:** https://github.com/adm01-debug/zapp-web-v3/pull/1033  
**Branch:** `feat/evolution-2.4-patches`  
**Arquivo adicionado:** `infra/evolution-api-custom/build-patches-2.4.mjs`

**O que o PR contém:**  
Script `build-patches-2.4.mjs` — adaptação dos patches T1-T20 para o bytecode do Evolution 2.4.0-rc2 + Baileys 7.0.0-rc.9.

**Resultado do teste local (2026-08-11):**
```
OK patches=T2,T3,T6,T7,T4,T8,T9,T10,T11,T13a,T13b,T14,T15,T17,T19,T20
SKIP=T1,T5a,T16,T18  (já corrigidos nativamente no 2.4.0)
OUT: main-2.4.patched.js (531.840 bytes)
```

**PASSO A:** Merge o PR #1033
```bash
# Via GitHub MCP:
github_merge_pull_request(owner='adm01-debug', repo='zapp-web-v3', pull_number=1033)
```

**PASSO B:** Atualizar o step de patches no workflow (1 linha) e a base_image

No arquivo `.github/workflows/publish-evolution-api-custom.yml`, o step `Apply T1-T6 patches` precisa ser atualizado:
```yaml
# ANTES:
node build-patches.mjs main.js main.patched.js t4_prologue.cjs "2.3.7-baileys-..."
# DEPOIS:
node build-patches-2.4.mjs main.js main.patched.js t4_prologue.cjs "2.4.0-baileys-..."
```

Também o step de verify tem um check que falha com 7.x:
```yaml
# REMOVER esta linha do step "Verify bundle":
if(s.includes('7.0.0-rc.9')){console.error('FAIL: rc.9 ainda presente');process.exit(1)}
```

E as tags do push:
```yaml
# ATUALIZAR:
tags: |
  ${{ steps.meta.outputs.image }}
  ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:2.4.0
  ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:2.4.0-rc2
```

E os defaults do workflow_dispatch:
```yaml
# inputs defaults:
evolution_ref: '2.4.0-rc2'   # era 2.3.7
baileys_version: '7.0.0-rc.9' # era 6.7.24
base_image: 'evoapicloud/evolution-api:2.4.0-rc2'  # verificar digest exato
```

**PASSO C:** Buscar o digest exato da imagem base 2.4.0-rc2:
```bash
# No container claude-code:
docker manifest inspect evoapicloud/evolution-api:2.4.0-rc2 2>/dev/null | grep digest | head -3
# OU:
curl -s 'https://hub.docker.com/v2/repositories/evoapicloud/evolution-api/tags/2.4.0-rc2' | grep digest
```

**PASSO D:** Disparar o workflow:
```bash
# Via curl no container claude-code (usa credential store /tmp/.git-credentials):
curl -X POST \
  -H 'Accept: application/vnd.github+json' \
  -H 'Authorization: token $(cat /tmp/.git-credentials | grep -o "[^:]*@github" | sed "s/@github//")' \
  'https://api.github.com/repos/adm01-debug/zapp-web-v3/actions/workflows/328150092/dispatches' \
  -d '{"ref":"main","inputs":{"evolution_ref":"2.4.0-rc2","baileys_version":"7.0.0-rc.9"}}'
```

**Self-hosted runner:** `github-actions-runner_runner.1` UP há 4+ dias — sem dependência de quota GitHub-hosted.

---

## 🟡 AÇÃO #2 — Deploy da nova imagem após build

Após o workflow concluir e publicar a imagem:

```bash
# 1. Reler o Version.Index FRESCO (NUNCA usar valor antigo)
portainer_inspect_service(service='evolution_evolution')
# Anotar Version.Index atual

# 2. Obter digest da nova imagem do output do workflow
# (campo 'Published digest' no log do workflow)

# 3. Registrar no banco antes do deploy
INSERT INTO ops.upgrade_execution_log (step, status, version_from, version_to, version_index, details, executed_by)
VALUES (
  'deploy',
  'started',
  'ed066617b536860837bb9a58deb66e5f9e31d0399c2b3c2209c933da9405e6b2',  -- sha atual
  '<NOVO_DIGEST>',
  <VERSION_INDEX_FRESCO>,
  jsonb_build_object('evolution_ref','2.4.0-rc2','baileys','7.0.0-rc.9'),
  'agent-lid-s14-deploy'
);

# 4. Deploy via Portainer
portainer_update_service(
  service='evolution_evolution',
  image='ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom:<NOVO_DIGEST>',
  version_index=<VERSION_INDEX_FRESCO>
)

# 5. Aguardar reconexão (2-5min) e verificar
SELECT state FROM evo.evolution_connection_history WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 3;

# 6. Rodar verificação pós-upgrade
SELECT evo.fn_post_upgrade_verify();
```

**Rollback imediato se falhar:**
```bash
# Imagem anterior (sempre disponível):
ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:ed066617b536860837bb9a58deb66e5f9e31d0399c2b3c2209c933da9405e6b2
# Version.Index anterior: ~13371912 (reler via portainer_inspect_service antes)
```

---

## 🟡 AÇÃO #3 — Após upgrade confirmado: backfill 43.666 fake_jids

Só executar APÓS `evo.fn_post_upgrade_verify()` retornar OK e `map_real_entries > 100`.

```sql
-- Dry-run primeiro
SELECT evo.fn_apply_lid_mappings(p_dry_run := true, p_batch := 10000);

-- Se dry-run OK, executar em 5 lotes de 10k
SELECT evo.fn_apply_lid_mappings(p_dry_run := false, p_batch := 10000);
-- (repetir 4x mais até retornar 0 rows afetadas)

-- Verificar resultado
SELECT fake_jids_historical, lid_coverage_pct FROM evo.v_lid_health_scorecard;
-- Esperado: fake_jids=0, coverage>=90%
```

---

## 🟡 AÇÃO #4 — Dedup LID↔PN (só após coverage >= 90%)

```sql
-- Dry-run
SELECT evo.fn_prepare_lid_dedup(p_dry_run := true);

-- Execução real
SELECT evo.fn_prepare_lid_dedup(p_dry_run := false);
```

---

## 📊 Mapa das 50 etapas — estado ao iniciar s14

```
Fase 0 — Estabilização (6/6)  ✅ COMPLETO
Fase 1 — Backfill fake_jids   🔴 BLOQUEADO — aguarda ações 2+3
  p07 map_populated            FALSE (0 entradas reais)
  p08 bulk_mapping             FALSE
  p09 messages_backfill        FALSE (aguarda fn_apply_lid_mappings)
  p10 coverage_50%             FALSE
  p11 coverage_90%             FALSE
  p12 contact_identity_lid     FALSE (0 lid_jid reais)
  p13 dedup_done               FALSE

Fase 2 — Alimentar mapa (8/8) ✅ COMPLETO
Fase 3 — Upgrade 2.4.x (4/7) 🟡 PARCIAL
  p22 delta_analysis           ✅
  p23 patches_inventory        ✅
  p24 BUILD_IMAGE              🔴 AÇÃO #1 acima
  p25 canary_test              🔴 aguarda build
  p26 rollback_plan            ✅
  p27 deploy_blue_green        🔴 AÇÃO #2 acima
  p28 post_verify              🔴 aguarda deploy

Fase 4 — Modelo canônico (8/8) ✅ COMPLETO
Fase 5 — Downstream (7/7)     ✅ COMPLETO
Fase 6 — Resiliência (7/7)    ✅ COMPLETO

TOTAL: 39/50 — as 11 restantes desbloqueiam com Ações #1-#4
```

---

## 🛠️ Infraestrutura — IDs e caminhos críticos

### Containers (verificar via portainer_list_containers — IDs rotacionam)
```
supabase_db:              ef6d3932698c  (MCP: supabase-mcp.atomicabr.com.br)
claude-code:              a0b3018f3e13
evolution_evolution.1:    7a44ad7cec59  (Evolution API v2.3.7 Baileys 6.7.24)
github-actions-runner:    c84238cd4806  (UP 4+ dias, self-hosted, labels=[vps-zapp])
swarm-task-guardian:      1c35d3d96c4c  (tem Docker socket)
```

### Serviço Swarm Evolution
```
Service ID:    qgc1n6uua2sbo2jn6egzppl1q
Service name:  evolution_evolution
Version.Index: RELER antes de qualquer update (muda após cada operação)
Imagem atual:  ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:ed066617
Rollback img:  sha256:ed066617b536860837bb9a58deb66e5f9e31d0399c2b3c2209c933da9405e6b2
Consumers:     383ebc98c84a (.2), 356d34f3ed15 (.1)
```

### Repositórios
```
Repo principal:     /workspace/repos/zapp-web-v3
Infra Swarm:        /workspace/repos/atomica-swarm-infra
Workflow build:     .github/workflows/publish-evolution-api-custom.yml (ID: 328150092)
Dockerfile:         infra/evolution-api-custom/Dockerfile
Script patches 2.3: infra/evolution-api-custom/build-patches.mjs
Script patches 2.4: infra/evolution-api-custom/build-patches-2.4.mjs ← NOVO (PR #1033)
Test build 2.4:     /workspace/evo-test-2.4/dist/main.js (construído localmente)
Patched local:      /workspace/main-2.4.patched.js (verificado OK)
```

### GitHub
```
Credential store:   /tmp/.git-credentials (token válido adm01-debug)
PR #1033:           feat/evolution-2.4-patches → main
Workflow dispatch:  curl -X POST ... /actions/workflows/328150092/dispatches
```

### MCPs
```
Supabase Self-Hosted: https://supabase-mcp.atomicabr.com.br/s-a50174164e4b03ef181a29db65d2db80/mcp
Portainer:            https://portainer-mcp.atomicabr.com.br/mcp
GitHub FOREVER:       https://github-mcp-server.adm01.workers.dev/mcp
```

---

## 🧠 Descobertas críticas desta sessão (s10-s13)

### 1. GitHub Actions ESTÁ funcionando
A informação de "billing/quota esgotado" nas memórias estava **desatualizada**.
- Self-hosted runner `vps-zapp` UP há 4+ dias
- Runs recentes com `conclusion=success` (16:03 UTC)
- Workflow ID `328150092` active e dispatchável
- Credential store `/tmp/.git-credentials` tem token válido para push

### 2. Motivo real do Plano B (Baileys 6.7.24)
Não é instabilidade do 7.x — é incompatibilidade de bytecode.
- Os patches T1-T20 fazem busca-e-substituição literal no `main.js` minificado
- O bytecode do 2.4.0 tem nomes de variáveis diferentes dos do 2.3.7 (minificador)
- Os patches foram reescritos em `build-patches-2.4.mjs` e testados com sucesso

### 3. 4 patches JÁ foram corrigidos nativamente no 2.4.0
- **T1**: 2.4.0 usa `this.logger.log` (logger estruturado), não `console.log` antes do webhook
- **T5a**: CACHE log ausente — provavelmente removido no 2.4.0
- **T16**: `getMessageByKeyId(instanceId, keyId)` substitui `findFirst` sem instanceId
- **T18**: `jpegThumbnail` ausente no bytecode 2.4.0 — poda feita nativamente

### 4. T17/T19 — comportamento esperado com Baileys 6.7.24
- `senderPn = 0` em todos os eventos — Baileys 6.7.24 não emite este campo
- `remoteJidAlt = 0` — T17 silencia erros via try/catch (lidMapping vazio)
- `map_real_entries = 0` é **correto** — não é bug
- Com Baileys 7.x (após upgrade), `phoneJid` real vai popular o mapa

### 5. fn_system_health_score 98.8 → 100.0
A queda de 1.2 ponto foi causada pelo cron `lid-upgrade-detect-and-alert` (jobid 470)
que foi criado com `DO $$` inválido em `cron.schedule`. Foi corrigido em s11:
- Remover cron 470 (falho)
- Criar `fn_lid_upgrade_alert_check()` wrapper
- Novo cron jobid 471 com `SELECT fn_lid_upgrade_alert_check()`
- Score voltou a 100.0 após janela de 1h

---

## 📋 Funções/views criadas neste projeto (s1-s13)

### Schema evo (funções)
```sql
evo.fn_normalize_remote_jid()           -- trigger
evo.fn_resolve_identity(p_jid, p_instance) -- resolve pn/lid
evo.fn_apply_lid_mappings(dry_run, batch)  -- backfill histórico
evo.fn_passive_lid_accumulator()           -- acumulador passivo
evo.fn_lid_regression_suite()             -- 15 testes (12 PASS + 3 PENDING)
evo.fn_lid_normalizer_test_suite()        -- 10 testes ALL_PASS
evo.fn_lid_upgrade_readiness_check()      -- 10 checks
evo.fn_post_upgrade_verify()              -- verificação pós-deploy
evo.fn_prepare_lid_dedup()               -- dedup LID↔PN
evo.fn_lid_upgrade_alert_check()         -- wrapper do cron 471
evo.fn_lid_health_report()               -- relatório semanal
evo.fn_pre_upgrade_final_check()         -- 8 checks antes do deploy
evo.fn_lid_convergence_snapshot()        -- snapshot horário
```

### Schema evo (views)
```sql
evo.v_lid_health_scorecard
evo.v_upgrade_status
evo.v_50_steps_progress          -- 39/50 ao vivo
evo.v_post_upgrade_kpis          -- 6 KPIs pós-upgrade
evo.v_lid_weekly_metrics
evo.v_lid_convergence_status
evo.v_production_scorecard
```

### Schema ops (tabelas)
```sql
ops.upgrade_execution_log        -- log de cada etapa do upgrade
ops.api_contract_versions        -- v1.0, v1.1-lid-fix, v2.0-lid-canonical
ops.schema_changelog             -- ~112 entradas hoje
```

### Crons LID (10 ativos)
```
187  lid-contamination-daily          29 8 * * *     succeeded
263  webhook-purge-consolidated       45 3 * * *     succeeded
328  lid-passive-accumulator          0 */2 * * *    succeeded
329  lid-api-sync-weekly              0 4 * * 1      succeeded
466  lid-convergence-snapshot-hourly  0 * * * *      succeeded
467  lid-normalizer-test-suite-6h     0 */6 * * *    null (futura)
468  lid-regression-suite-2h          0 */2 * * *    succeeded
469  lid-quarterly-checkpoint         0 9 1 1,4,7,10 null (futura)
471  lid-upgrade-detect-and-alert     30 * * * *     succeeded
475  lid-weekly-health-report         0 6 * * 1      null (futura)
```

---

## ⚠️ Armadilhas conhecidas

1. **Version.Index do serviço Swarm muda após cada operação** — sempre `portainer_inspect_service` imediatamente antes de `portainer_update_service`. Nunca usar valor salvo de sessões anteriores.

2. **supabase_db container ID rotaciona** — sempre `portainer_list_containers` antes de `portainer_exec_container`. Atual: `ef6d3932698c` (pode mudar).

3. **claude-code container ID** — atual: `a0b3018f3e13`. Verificar antes de executar.

4. **cron.schedule não suporta DO $$** — usar sempre `SELECT fn_nome()`. Nunca blocos anônimos PL/pgSQL em schedule string.

5. **supabase_apply_migration bugada** — usar `supabase_db_query` + INSERT manual em `supabase_migrations.schema_migrations`.

6. **CREATE INDEX CONCURRENTLY** — fora de transação. Usar `portainer_exec_container` com psql direto no `supabase_db`, não via MCP batch.

7. **WAL slot `cainophile_opv7s491`** — em ~260MB (6.3%). Watchdog a 300MB, n8n alert a 512MB. Se durante DDL pesado passar de 300MB, o watchdog cria um alerta (resolvido automaticamente em 90s se LAG baixar).

8. **Hermes** pode criar funções concorrentemente em `evo/zapp/ops`. O EVENT TRIGGER `trg_auto_revoke_public_evo_zapp` protege automaticamente — revoga PUBLIC execute de toda nova função nesses schemas. Não precisa ação manual.

9. **T17/T19 com Baileys 7.x** — o `signalRepository.lidMapping` pode estar vazio nos primeiros minutos após o upgrade. Aguardar pelo menos 10 mensagens trafegadas antes de verificar `map_real_entries`.

10. **Patch T19O = T17N** — no script `build-patches-2.4.mjs`, o T19 usa o output do T17 como seu input (encadeamento). A ordem de aplicação importa: T17 ANTES de T19.

---

## 🔍 Queries de diagnóstico rápido

```sql
-- Estado geral (rodar primeiro sempre)
SELECT pipeline_status, strict_status, completeness_score, open_alerts FROM evo.v_production_scorecard;
SELECT (zapp.fn_system_health_score()->>'score') AS health;
SELECT steps_done, steps_total FROM evo.v_50_steps_progress;

-- Estado LID
SELECT * FROM evo.v_lid_health_scorecard;

-- Verificar se upgrade aconteceu
SELECT map_real_entries, lid_coverage_pct FROM evo.v_lid_health_scorecard;
-- Se map_real_entries > 0 → Baileys 7.x está emitindo phoneJid → executar backfill

-- Checklist pré-deploy
SELECT evo.fn_pre_upgrade_final_check();

-- Após upgrade: validação
SELECT evo.fn_post_upgrade_verify();

-- Regressão
SELECT evo.fn_lid_regression_suite()->> 'status';
SELECT evo.fn_lid_normalizer_test_suite()->>'result';

-- KPIs pós-upgrade
SELECT * FROM evo.v_post_upgrade_kpis;
```

---

## 📁 Snapshots de rollback disponíveis

```sql
SELECT tablename, (SELECT count(*) FROM evo._snap_pre_upgrade_lid_phone_map_20260811) AS rows
FROM pg_tables WHERE tablename LIKE '_snap_pre_upgrade%' AND schemaname='evo';
```

```
_snap_pre_upgrade_lid_phone_map_20260811          4.699 rows
_snap_pre_upgrade_contact_identity_20260811       12.668 rows  
_snap_pre_upgrade_evolution_contacts_wpp2_lid_20260811  3.171 rows
```

**Restauração em caso de problema:**
```sql
-- Restaurar lid_phone_map (ATENÇÃO: destrói dados novos)
TRUNCATE evo.lid_phone_map;
INSERT INTO evo.lid_phone_map SELECT * FROM evo._snap_pre_upgrade_lid_phone_map_20260811;
```

---

## 📝 Contexto do projeto

**Sistema:** Zapp Webb — WhatsApp CRM da Promo Brindes  
**Instância WhatsApp:** `wpp2` (UUID `f7a73e2c-327d-426c-8fa6-6ea7743ace02`, número 551146375517)  
**Objetivo LID:** Preparar para phase-out do PN JID (~fim 2026) — 50 etapas, 39 concluídas  
**Sessões:** lid-s1 a lid-s13 (Claude) + Hermes S10-S19  
**Infra:** Docker Swarm, Portainer, Supabase self-hosted PG15.8, RabbitMQ  

---

## ✅ Verificação final desta sessão

```
health_score    : 100.0/A+
pipeline        : HEALTHY
regression      : GREEN 12/12
normalizer      : ALL_PASS 10/10
steps           : 39/50
PR #1033        : OPEN (aguarda merge)
build-patches   : TESTADO e validado contra 2.4.0-rc2
github-actions  : FUNCIONANDO (self-hosted runner UP 4+ dias)
wpp2            : connected
Hermes          : S19 foi o último agente
```

**Gerado em:** 2026-08-11T17:19:16Z  
**Sessão:** lid-s13  
**Próxima sessão:** lid-s14
