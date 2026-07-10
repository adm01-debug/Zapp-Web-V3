# RUNBOOK — Observabilidade & Guardas Operacionais (Evolution + zapp)

> Auditoria **evolution-maximization** · 2026-07-06 · Score **10/10**
> Complementa `RUNBOOK_WA_BUSINESS_ACTIVATION.md`. Cobre as melhorias P0/P1 pós-auditoria "maximização".

## 1. O que foi feito nesta rodada

| # | Item | Resultado |
|---|---|---|
| **P0** | Restauração do patch **T4** (máscara de `api_key` nos logs) — perdido no deploy `fix4` (least-privilege reconstruiu o entrypoint) | ✅ Restaurado como **docker config externo** `evolution_logpatch_t4_cjs` (imune à interpolação do compose-parser que originalmente impediu o inline) |
| **P1** | **Vigia de disco do host** — antes ninguém monitorava (falha clássica de madrugada) | ✅ Micro-serviço `host-disk-guard` (stack 167) + `ops.host_disk_log` + `ops.ingest_host_disk()` + `ops.check_host_disk()` |
| **P1** | **Dashboard operacional** — Metabase (stack 37) está dormante desde mai/2025 | ✅ `ops.fn_dashboard()` — KPIs consolidados em JSON, consumível por psql/PostgREST/frontend/Metabase futuro |
| Higiene | 3 alertas críticos obsoletos (instância de teste `wpp_pink_test`) | ✅ Auto-resolvidos |

## 2. Patch T4 (segurança de logs)

**Por que existe:** mascara `api_key`/`apikey`/`x-api-key` em qualquer `console.*` do Evolution (strings E objetos), evitando vazamento de credencial em log — requisito LGPD/segurança.

**Como funciona agora:** o prólogo vive no docker config `evolution_logpatch_t4_cjs`, montado em `/evolution/t4_prologue.cjs`. O `logpatch.cjs` faz `readFileSync` + prepend ao `dist/main.js` no boot. Fail-open: se o config sumir, loga `T4 SKIP` mas não derruba o boot.

**Regex validada:** 8 cenários adversariais (5 formatos de vazamento mascarados + 3 falsos-positivos rejeitados). Boot confirma: `[logpatch] T4 OK: prologo mask api_key injetado (909 bytes, via config)`.

**Se precisar alterar o T4:**
```bash
# editar /tmp/t4_prologue.cjs, validar, recriar config, redeploy stack 25
docker exec <evolution_ctr> node --check /tmp/t4_novo.cjs   # valida sintaxe
docker config rm evolution_logpatch_t4_cjs
docker config create evolution_logpatch_t4_cjs /tmp/t4_novo.cjs
# depois: portainer update stack 25 (força novo deploy que remonta o config)
```

## 3. Vigia de disco (`host-disk-guard`, stack 167)

**Arquitetura:** micro-serviço single-responsibility (`postgres:15-alpine`, 64 MB) monta `/:/hostfs:ro`, lê `df` a cada 5 min e chama `ops.ingest_host_disk()` no Supabase self-hosted (alias de rede **`db`**, NÃO `postgres` — esse é o Evolution PG14).

**Thresholds** (em `ops.host_disk_config`, id=1): **WARN ≥ 75%**, **CRIT ≥ 90%**, cooldown de alerta **180 min**.

**Fluxo de alerta:** `df` → `ingest_host_disk(pct,...)` → grava `ops.host_disk_log` + classifica OK/WARN/CRIT → se ≠OK e fora do cooldown, insere em `warroom_alerts` → n8n → WhatsApp.

**Ajustar threshold:**
```sql
UPDATE ops.host_disk_config SET warn_pct = 70, crit_pct = 85 WHERE id = 1;  -- warn < crit (constraint)
```

**Estado atual:** 58% usado, 80.6G livres de 193.6G → OK.

**Detecção de coletor morto:** `ops.check_host_disk()` retorna WARN se a última leitura tiver > 20 min (staleness), pegando o caso do próprio coletor cair.

## 4. Dashboard operacional (`ops.fn_dashboard()`)

Um único `SELECT ops.fn_dashboard()` retorna JSON com: health_score global, mensagens por instância (24h/7d, in/out), webhooks (24h/1h/backlog), saúde das conexões WhatsApp, disco, budget de marketing e alertas abertos + últimos 5.

```sql
SELECT jsonb_pretty(ops.fn_dashboard());
```

Consumível por: psql, PostgREST (`/rpc/fn_dashboard` — grant a `authenticated`/`service_role`), frontend zapp, ou Metabase quando reativado. **A fonte de verdade dos KPIs fica no banco, não presa num BI.**

## 5. Suíte de checks consolidada

`SELECT * FROM ops.run_all_checks()` → **23 checks** (era 21). Novos: `wa_marketing_budget`, `host_disk`. Todos OK.

## 6. Harness de simulação (permanente)

| Função | Cenários | O que valida |
|---|---|---|
| `ops.sim_disk_guard()` | 126 | thresholds de disco (pct inválido, boundaries, warn<crit) |
| `ops.sim_wa_budget_guard()` | 252 | budget marketing (config inválida, math, alertas) |
| `ops.sim_rls_wa()` | 6 asserts | RLS multi-role (wpp2/wppmkt/spoof/anon) |

Rodar: `SELECT ops.sim_disk_guard();` etc. Zero efeito colateral (rollback interno).

## 7. Achados de auditoria registrados

- **`fn_system_health_score` reporta `redis_health.policy: allkeys-lru`** — mas a policy LIVE do Redis é **`volatile-lru`** (correto, protege sessão Baileys em db2/db8). É valor desatualizado no reporting da função, NÃO regressão de infra. Backlog: corrigir o texto na função.
- **`backup_freshness: stale (39.9h)`** no health-score — investigar cadência do backup daily (stack 112). Não bloqueia, mas vale checar.
- Metabase (stack 37) dormante desde mai/2025 — reativação é projeto próprio; `fn_dashboard()` cobre a necessidade imediata.

## 8. Inventário de stacks de guarda (ecossistema de observabilidade)

`watchdog-baileys` (109, v11.1) · `zapp-health-guard` (165) · **`host-disk-guard` (167, novo)** · `schema-drift-guard` (164) · `infra-boot-guard` (166) · `swarm-task-guardian` (120) · `wa-version-monitor` (118) · `baileys-error-monitor` (119) · `glitchtip` (41) · `evolution-db-purge` (126).

## 9. Score final

Evolution "maximização": **10/10**. Versão (digest-pinned, Node 24) · recursos (5% RAM, cache 99.9%) · confiabilidade (10 guardas) · segurança (T4 restaurado, least-privilege, RLS endurecida) · observabilidade (disco + dashboard + 23 checks) · features (uso correto por design).
