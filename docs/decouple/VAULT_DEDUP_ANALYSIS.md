# VAULT DEDUP ANALYSIS (F6) — Consumidores dos secrets duplicados

> **Onda:** Fase 3 · **Artefato:** F6-ANALISE · **Data:** 2026-08-15 · **Modo:** SOMENTE ANÁLISE (grep read-only no repo; **nenhuma execução em banco** — DROP/INSERT/UPDATE proibidos nesta onda, ver `.hermes/fase3/worker-rules.md`).
> **Objetivo:** provar, com evidência fresca de repo, quais dos 4 secrets duplicados do vault têm consumidores reais, e entregar ao maestro o plano de execução do dedup aprovado no SCORECARD_V4 (§7, etapas 63–70 do PLANO_DESACOPLOPAMENTO_V4_FINAL).
> **Pares:** PAR 1 `evolution_api_key` × `evolution_api_key_v2` · PAR 2 `evolution_webhook_secret` × `webhook_secret_evolution` (fonte: `VAULT_SECRETS_V4.md`, snapshot `.hermes/fase3/dados-reais.json` → `secrets_duplicados`).

---

## 1. Contagens de grep (VERIFICAÇÃO — rodadas em 2026-08-15, worktree `chat-fase3`)

`grep -rn "<secret>" supabase src infra docs` (sem node_modules/.git):

| secret | supabase/ | src/ | infra/ | docs/ | **total** | fora de docs (código/infra) |
|---|---:|---:|---:|---:|---:|---:|
| `evolution_api_key` (excl. `_v2`) | 8 | 0 | 9 | 114 | **131** | **17** |
| `evolution_api_key_v2` | **0** | **0** | **0** | 11 | **11** | **0** |
| `webhook_secret_evolution` | 2 | 0 | 0 | 18 | **20** | **2** |
| `evolution_webhook_secret` | 0 | 0 | 6 | 25 | **31** | 6 (todos = substring do **swarm secret** `supabase_evolution_webhook_secret_v1`, não leitura do vault) |

> **Nota de medição:** as contagens de `docs/` acima (11 e 18/25) foram medidas **antes** da criação deste artefato; o próprio `VAULT_DEDUP_ANALYSIS.md` adiciona hits de documentação (14× `_v2`, etc.). Re-rodando após esta onda, considere `docs/decouple/VAULT_DEDUP_ANALYSIS.md` como referência (não-consumo). As contagens de **código** (supabase/src/infra) não são afetadas.

Varredura full-repo (excluindo docs/node_modules/.git) para os duplicados:
- `evolution_api_key_v2` → **0 arquivos** (único hit fora de docs: `.hermes/fase3/dados-reais.json:24` = snapshot de inventário que *lista* o nome; não é consumidor).
- `webhook_secret_evolution` → 3 arquivos: 2 migrations (função `zapp.fn_system_health_score`) + snapshot.
- `evolution_webhook_secret` → 4 arquivos: snapshot + 3 infra (compose/runbooks/inventory, todos referindo `supabase_evolution_webhook_secret_v1`).

---

## 2. Tabela de consumidores por secret (arquivo:linha)

### 2.1 `evolution_api_key` — CANÔNICO (131 hits; 17 em código/infra)

| Tipo | Consumidor (arquivo:linha) | Evidência |
|---|---|---|
| **Resolver SQL (vivo)** | `ops.fn_evo_key()` (prod DB, não versionado; deprecado via COMMENT E17) | `WHERE name = 'evolution_api_key'` (documentado em `VAULT_SECRETS_V4.md:33`; deprecação em `20260815030000_decouple_e17_fn_evo_v2.sql:89-91`) |
| **Resolver SQL (v2, vivo)** | `ops.fn_evo_key_v2()` — criado em E17, corrigido em I4 | `supabase/migrations/20260815030000_decouple_e17_fn_evo_v2.sql:52-55` e `supabase/migrations/20260815200009_decouple_i4_evo_v2.sql:59-62`: `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'evolution_api_key'` |
| Leitor SQL direto | `zapp.fn_edge_get_evolution_credentials` | `supabase/migrations/20260804190316_restore_orphaned_rpcs.sql:50` |
| Leitor SQL direto | `ops.fn_notify_critical_alerts` | `supabase/migrations/20260813230000_fix_notify_and_analyze_cron.sql:38` |
| Leitor SQL (alerta) | `evo.fn_detect_401_bursts` | `supabase/migrations/20260814150000_fix_fn_detect_401_bursts_dedup.sql:67,93` (md5 da chave do vault em mensagem de alerta) |
| Gateway canônico | `ops.fn_health_preflight` (CHECK 4) | `supabase/migrations/20260815020000_decouple_e10_preflight_checklist.sql:128-152` via `ops.fn_evo_key()`; `20260814130000_fn_health_preflight_check9_vault_key.sql:67` |
| Consumidor indireto | `ops.fn_notify_critical_alerts`, `evo.fn_sync_lid_from_api`, `zapp.fn_outbound_dispatch`, `zapp.fn_reconcile_dispatch`, `zapp.fn_validate_whatsapp_connection_url`, `zapp.fn_health_preflight` | chamam `ops.fn_evo_key()`/`fn_evo_key_v2()` (linhagem `20260814050000:51`, `20260815070000:21,68`, `20260815140000:29`, `20260815150000:20`, `20260814220000:24`) |
| Edge — env | `supabase/functions/evolution-api/index.ts:36` | `Deno.env.get('EVOLUTION_API_KEY')` |
| Edge — env | `supabase/functions/_shared/providers/evolution/client.ts:37-38` | `Deno.env.get('EVOLUTION_API_KEY')` (gateway único) |
| Edge — env | `supabase/functions/connection-test/index.ts:77,90`; `connection-health-check/index.ts:194,198` | env |
| Edge — env (validação) | `supabase/functions/_shared/validation.ts:30,565` | allowlist env / regex |
| Edge — vault direto | `supabase/functions/evolution-notification-dispatcher/index.ts:259` | `getSecret('evolution_api_key')` (fallback; `_shared/vault.ts:8` — 1º env, 2º vault) |
| Edge — vault via RPC | `supabase/functions/evolution-templates/index.ts:54` | `rpc("fn_get_vault_secret", { p_name: "evolution_api_key" })` |
| Infra — runtime | `infra/supabase/docker-compose.supabase.yml:87,96-97,556` | env `EVOLUTION_API_KEY` ← swarm secret `evolution_api_key_v4_20260704` (source `evolution_api_key_v5_20260805`) |
| Infra — runbooks | `infra/runbooks/AUDITORIA_MENSAL.md:224`; `POLITICA_ANTI_RESIDUOS.md:62,121`; `infra/stack35/SECRETS_INVENTORY.md:4-5` | política de rotação `evolution_api_key_v<N>_YYYYMMDD` |
| Env template | `supabase/functions/.env.required:100` | `EVOLUTION_API_KEY` |
| Frontend (env, comentário) | `src/features/integrations/hooks/useEvolutionApiIntegration.ts:125` | "EVOLUTION_API_KEY server-side (secret v5)" — não lê vault |

### 2.2 `evolution_api_key_v2` — DUPLICADO (0 consumidores)

| Tipo | Consumidor | Evidência |
|---|---|---|
| Resolver SQL | **nenhum** | 0 hits em `pg_proc.prosrc` (VAULT_SECRETS_V4 §2) e 0 greps em migrations com leitura desse nome |
| Edge functions | **nenhum** | 0 hits `getSecret('evolution_api_key_v2')` / env |
| Infra/compose | **nenhum** | 0 hits em infra/ |
| src/ | **nenhum** | 0 hits |
| docs/ | 11 hits | todos de planejamento/auditoria citando o nome como órfão (PLANO_V4:363,395; RUNBOOK:78; SCORECARD_V3:58; SCORECARD_V4:66; VALIDACAO_V3:51; VAULT_SECRETS_V4:13,24,49,66,77) — **não são consumo** |

### 2.3 `webhook_secret_evolution` — canônico do PAR 2 (2 hits de código)

| Tipo | Consumidor (arquivo:linha) | Evidência |
|---|---|---|
| **Função SQL viva (única leitora do vault no par)** | `zapp.fn_system_health_score` | `supabase/migrations/20260804000000_canonical_schema_squash_133_migrations.sql:13551` e `supabase/migrations/20260812170000_health_filter_snap_staging.sql:162`: `SELECT COUNT(*) INTO v FROM vault.secrets WHERE name='webhook_secret_evolution'` (+10 pts no health score) |
| docs/ | 18 hits | linhagem/auditorias (VAULT_SECRETS_V4:40,57,67; DATABASE_SCHEMA_RULES.md:486; reconciliation) |

### 2.4 `evolution_webhook_secret` — DUPLICADO do PAR 2 (0 leitores do vault)

| Tipo | Consumidor | Evidência |
|---|---|---|
| Leitor SQL do vault com esse nome | **nenhum** | 0 hits `vault.secrets`/`decrypted_secrets` + `evolution_webhook_secret` em migrations; 0 functions (VAULT_SECRETS_V4:56) |
| Edge — vault direto | **nenhum** | 0 hits `getSecret('evolution_webhook_secret')` |
| Edge — env `EVOLUTION_WEBHOOK_SECRET(S)` | caminho real de runtime | `evolution-webhook/index.ts`, `recheck-webhook-signature/index.ts:78`, `webhook-hmac-selftest/index.ts:296-315`, `connection-test/index.ts:80`, `_shared/validation.ts:24` — **porém** a origem é o **swarm secret** `supabase_evolution_webhook_secret_v1` (`infra/supabase/docker-compose.supabase.yml:87,94,552`), **não o vault** |
| infra/ (6 hits) | substring do swarm secret | `docker-compose.supabase.yml:87,94,552`; `POLITICA_ANTI_RESIDUOS.md:63,121`; `SECRETS_INVENTORY.md:18` — camada Swarm, não vault |
| Evidência de valor idêntico | `docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6_webhook-eventos-glitchtip.md:39` | swarm secret `supabase_evolution_webhook_secret_v1` byte-a-byte idêntico ao header `x-webhook-secret` **e** às duas entradas do vault (`evolution_webhook_secret` e `webhook_secret_evolution`); caminho real de validação lê `Deno.env`, não vault → "candidatas a limpeza futura" |

---

## 3. Verificação dos resolvers de produção (documentados)

| Resolver | Lê do vault (nome exato) | Evidência (migration) |
|---|---|---|
| `ops.fn_evo_key()` | **`evolution_api_key`** ✅ canônico | documentado em `VAULT_SECRETS_V4.md:33`; deprecado (COMMENT) em `20260815030000_decouple_e17_fn_evo_v2.sql:89-91` |
| `ops.fn_evo_key_v2()` (E17, 2026-08-15) | **`evolution_api_key`** ✅ canônico | `20260815030000_decouple_e17_fn_evo_v2.sql:52-55` — `WHERE name = 'evolution_api_key'` |
| `ops.fn_evo_key_v2()` (I4, correção rtrim) | **`evolution_api_key`** ✅ canônico | `20260815200009_decouple_i4_evo_v2.sql:59-62` — `WHERE name = 'evolution_api_key'` |

**Conclusão:** **nenhum resolver SQL referencia `evolution_api_key_v2`** — nem o original nem a versão v2 dos resolvers. O dedup do PAR 1 não exige tocar em nenhuma função.

---

## 4. Vereditos por par

### PAR 1 — `evolution_api_key` × `evolution_api_key_v2` → **DEDUP SEGURO**
- `evolution_api_key_v2`: **0 consumidores** (repo: supabase/src/infra = 0; SQL: 0 functions; snapshot do vault é inventário, não consumo).
- `evolution_api_key`: canônico confirmado por 2 resolvers vivos (`fn_evo_key`, `fn_evo_key_v2`), 2 leitores SQL diretos, 2 leitores edge (vault direto/RPC), cadeia env ← swarm secret `evolution_api_key_v4_20260704` (docker-compose:87).
- Ação: **DROP `evolution_api_key_v2`** (não há nada a migrar).

### PAR 2 — `evolution_webhook_secret` × `webhook_secret_evolution` → **DEDUP SEGURO (condicionado a 1 preflight)**
- Único leitor vivo do par: `zapp.fn_system_health_score` lê `webhook_secret_evolution` → canônico deve ser **`webhook_secret_evolution`** (alinha com SCORECARD_V4/VAULT_SECRETS_V4 §3).
- `evolution_webhook_secret` (vault): **0 leitores** (SQL + edge + repo). O runtime de webhook usa `Deno.env` ← swarm secret `supabase_evolution_webhook_secret_v1`, fora do vault.
- ⚠️ **Condição (preflight F6-A3):** confirmar que nenhuma sincronização vault→swarm alimenta `supabase_evolution_webhook_secret_v1` a partir do *nome* `evolution_webhook_secret`. Se existir, repontar a fonte para `webhook_secret_evolution` antes do DROP (sincronização fora do escopo read-only; não verificável aqui).
- ⚠️ **Divergência de nomenclatura:** o PLANO_DESACOPLAMENTO_V4_FINAL (etapa 60) cita `evolution_webhook_secret` como nome canônico do par. Manter `webhook_secret_evolution` = **zero mudança de código** (o leitor vivo já usa esse nome); adotar o nome do plano exigiria migrar `zapp.fn_system_health_score` → veredito seria **REQUER MIGRAÇÃO**. **Recomendação: seguir o leitor vivo (DEDUP SEGURO)** e registrar a divergência.
- Ação: **DROP `evolution_webhook_secret`** (vault), manter `webhook_secret_evolution`.

### Resumo
| Par | Duplicado a remover | Veredito | Condição |
|---|---|---|---|
| PAR 1 | `evolution_api_key_v2` | **DEDUP SEGURO** | nenhuma |
| PAR 2 | `evolution_webhook_secret` | **DEDUP SEGURO** | preflight da fonte do swarm secret (F6-A3) |

---

## 5. PLANO DE EXECUÇÃO (para o maestro — executar DEPOIS, fora desta onda)

> Regras: DDL/registro via MCP SQL versionado + `schema_migrations` (DB-as-source); nunca DDL solto; janela de 48h verdes entre fases (per SCORECARD_V4/PLANO_V4 etapas 63–70).

### Fase A — Preflight (dia 0, read-only)
1. **A1.** Reconfirmar inventário: `SELECT name, created_at, updated_at FROM vault.decrypted_secrets WHERE name ILIKE '%evolution%' ORDER BY name` → esperado **10 rows**, 2 pares (evidência: `.hermes/fase3/dados-reais.json`).
2. **A2.** Reconfirmar **0 consumidores dos duplicados** (evidência fresca na véspera):
   - Greps (como §1): `evolution_api_key_v2` → 0 em supabase/src/infra; `evolution_webhook_secret` → 0 leitores SQL/edge.
   - `SELECT p.proname, p.prosrc FROM pg_proc p WHERE p.prosrc ILIKE '%evolution_api_key_v2%' OR p.prosrc ILIKE '%evolution_webhook_secret%'` → **0 rows**.
   - Confirmar resolvers canônicos: `SELECT prosrc FROM pg_proc WHERE proname IN ('fn_evo_key','fn_evo_key_v2')` → ambos `WHERE name = 'evolution_api_key'`.
3. **A3.** Confirmar a fonte do swarm secret `supabase_evolution_webhook_secret_v1` (vault→swarm?): se sincronizado a partir do nome `evolution_webhook_secret`, **repointar sync para `webhook_secret_evolution` antes do DROP** (passo C2). *(Não verificável em modo read-only de repo — requer acesso à stack Swarm/VPS.)*

### Fase B — Rotação (somente se necessário)
4. **B1.** Rotação **não é pré-requisito** do dedup: `evolution_api_key_v2` nunca foi servido a ninguém e `evolution_webhook_secret` tem valor idêntico ao canônico (auditoria 05/07, byte-a-byte). Rotacionar `evolution_api_key` (Evolution API + vault `evolution_api_key`) **apenas** se houver suspeita de exposição; após rotação, aguardar **48h verdes** (health checks, sql-gate, `ops.fn_evo_key()`/`fn_evo_key_v2()` OK — CHECK 4 do preflight E10).

### Fase C — Expand/Contract no vault
5. **C1 (expand).** Confirmar que todos os consumidores leem o canônico — já é o estado atual (§2): 0 consumidores dos duplicados → sem mudança de código.
6. **C2 (contract 1).** `DELETE FROM vault.secrets WHERE name = 'evolution_api_key_v2';` → **48h verdes** (watchdogs: health-score, dispatcher, alertas 401, edge health checks).
7. **C3 (contract 2).** `DELETE FROM vault.secrets WHERE name = 'evolution_webhook_secret';` (após A3 OK) → **48h verdes**.

### Fase D — Registro e validação
8. **D1.** Registrar: migration versionada (14 dígitos) com o registro da decisão/execução (no-op se nada restar no DB — aplicar e registrar em `supabase_migrations.schema_migrations` quando houver efeito; caso contrário, arquivar + registrar decisão, conforme regra da casa). Atualizar `SCORECARD_V4.md` §7 (pendência → executado), `VAULT_SECRETS_V4.md`, `POLITICA_ANTI_RESIDUOS.md`.
9. **D2.** Validação pós-dedup: `SELECT count(*) FROM vault.decrypted_secrets WHERE name ILIKE '%evolution%'` → **8**; `zapp.fn_system_health_score` mantém +10; `ops.fn_evo_key()`/`fn_evo_key_v2()` retornam valor; `node scripts/decouple/sql-gate.mjs` 0 violações; edge health checks verdes.

### Rollback
- **Janela:** 48h após cada contract (C2/C3).
- **Restaurar duplicado (idempotente, sem expor valor):** `SELECT vault.create_secret(<valor>, '<nome>', '<descrição>')` — os valores são **idênticos** ao canônico (evidência: `docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6_webhook-eventos-glitchtip.md:39`), portanto a recriação usa o valor do canônico ou, em último caso, rotação nova.
- **Gatilhos de rollback:** health-score ZAPP < baseline, alertas 401/dispatcher com falha nova, edge health checks vermelhos, sql-gate com violação nova.
- **Irreversibilidade:** nenhuma — DROP de secret no vault é recriável via `vault.create_secret`; nenhum dado de negócio é afetado (secrets nunca servidos).

---

## 6. Não verificável (limites desta análise)

- **Origem do swarm secret** `supabase_evolution_webhook_secret_v1` / `evolution_api_key_v5_20260805` (se alimentados pelo vault e por qual nome) — requer acesso à stack Swarm/VPS (Portainer), fora do escopo read-only desta onda. → coberto pelo preflight A3.
- **Consumo em repositório externo** `adm01-debug/evolution-stack` (servidor Evolution) dos nomes duplicados — os 4 nomes analisados são do vault do Supabase (repo atual); consumo lá seria de secrets do servidor Evolution, não do vault.
- **Valores/decrypt** — propositalmente não lidos (regra da auditoria).

## 7. Referências

- `docs/decouple/VAULT_SECRETS_V4.md` (inventário + mapa de consumidores original, 2026-08-14)
- `docs/decouple/SCORECARD_V4.md` §7 (dedup APROVADO, execução F6)
- `docs/decouple/PLANO_DESACOPLAMENTO_V4_FINAL_100_ETAPAS_20260814.md` (etapas 63–70)
- `.hermes/fase3/dados-reais.json` (`secrets_duplicados` — snapshot do vault)
- `supabase/migrations/20260815030000_decouple_e17_fn_evo_v2.sql` / `20260815200009_decouple_i4_evo_v2.sql` (resolvers v2)
- `docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6_webhook-eventos-glitchtip.md:39` (paridade byte-a-byte do webhook secret)
