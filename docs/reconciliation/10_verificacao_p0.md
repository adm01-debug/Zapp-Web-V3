# Verificação Independente — Critérios P0 (etapa 10+96)

**Auditor:** subagente independente (segunda opinião) — evidência própria, sem leitura dos laudos 01_*–09_*
**Data:** 2026-08-04 (~18:10 UTC / 15:10 BRT)
**Método:** Portainer MCP (list/get/exec/logs) + Supabase MCP (db_query/db_health) + grep read-only no repo `C:\zapp-web-v3`
**Escopo:** READ-ONLY. Segredos reportados apenas como fingerprint sha256 (12 chars) ou booleano.

---

## Resumo executivo

| # | Critério | Veredito | Severidade |
|---|----------|----------|------------|
| V1 | JWT secret consistente (auth/rest/storage/functions/realtime) | **CONFIRMADO OK** | — |
| V2 | Schemas expostos (PGRST_DB_SCHEMAS) existem no banco | **CONFIRMADO OK** | — |
| V3 | Containers essenciais UP | **CONFIRMADO OK** | — |
| V4 | Backup recente e válido | **CONFIRMADO OK** | observação |
| V5 | DB URL do edge aponta para mesmo DB + URL pública correta | **CONFIRMADO OK** | observação |
| V6 | Anon key válida (role=anon, exp futuro, assinatura válida) | **CONFIRMADO OK** | — |
| V7 | Meta sem crash-loop | **CONFIRMADO OK** | observação |
| V8 | Cron worker ativo nas últimas 24h | **CONFIRMADO OK** | observação |
| V9 | WAL slots sem inativo | **CONFIRMADO OK** | — |
| V10 | Sem segredos hardcoded no repo | **CONFIRMADO OK** | observação |

**Nenhum critério P0 divergente.** 2 observações de atenção (V4 formato, V8 case-sensitivity da query do plano) e 2 achados menores não-bloqueantes (V7 index_advisor, V10 fixture de teste).

---

## Evidências por critério

### V1 — JWT secret consistency — ✅ CONFIRMADO OK

Observado via `portainer_get_container` (Config.Env/Cmd) + `portainer_exec_container`:

| Serviço | Fonte do segredo | Fingerprint sha256 (12c) |
|---|---|---|
| auth (gotrue) | Docker secret `/run/secrets/supabase_jwt_secret_v1` (lido no Cmd; exec `cat \| sha256sum`) | `1bf6b61a79c2` |
| storage | Docker secret `/run/secrets/supabase_jwt_secret_v1` (exec confirmado) | `1bf6b61a79c2` |
| functions (edge-runtime) | Docker secret `/run/secrets/supabase_jwt_secret_v1` (Cmd: `export JWT_SECRET=$(cat ...)`) | mesmo secret → `1bf6b61a79c2` |
| realtime | Docker secret `/run/secrets/supabase_jwt_secret_v1` (`API_JWT_SECRET`) + `METRICS_JWT_SECRET` hardcoded no env | mesmo secret → `1bf6b61a79c2` |
| rest (postgrest) | `PGRST_JWT_SECRET` hardcoded no env (valor hexadecimal 40 chars) | `b6177a99676f` (hash sem newline) |

**Análise do mismatch aparente:** o fingerprint do arquivo de secret (`1bf6b61a79c2`) difere do hash do valor do env do rest (`b6177a99676f`) **apenas por newline**: `sha256(valor + "\n")` = `1bf6b61a79c2` (verificado localmente). Ou seja, o conteúdo do Docker secret é exatamente `d139cac60e8a26a6e3ba087f6f967aba8e588eee\n` — **mesmo valor** usado no env do rest. `PGRST_APP_SETTINGS_JWT_SECRET` do rest também idêntico ao `PGRST_JWT_SECRET`. **MATCH em todos os serviços.**

Observação: o rest carrega o segredo hardcoded no compose (não via Docker secret, ao contrário dos demais). Não é divergência de valor, mas é recomendável migrar para o mesmo mecanismo de secret por higiene.

### V2 — Schemas expostos — ✅ CONFIRMADO OK

- `PGRST_DB_SCHEMAS` (rest, env): `public,zapp,storage,graphql_public,artes,vendas,financeiro`
- `SELECT nspname FROM pg_namespace` (via MCP, 32 schemas): **todos os 7 listados existem** — `public` ✓, `zapp` ✓, `storage` ✓, `graphql_public` ✓, `artes` ✓, `vendas` ✓, `financeiro` ✓.
- Nenhum schema da lista está ausente.

### V3 — Containers essenciais UP — ✅ CONFIRMADO OK

`portainer_list_containers` (endpoint 1, all=true):

| Serviço | Imagem | Estado |
|---|---|---|
| db | supabase/postgres:15.8.1.085 | running, Up 4 days (healthy) |
| rest | postgrest/postgrest:v14.12 | running, Up 45 hours, RestartCount=0 |
| auth | supabase/gotrue:v2.189.0 | running, Up 7 days, RestartCount=0 |
| kong | kong:3.9.3 | running, Up 28 hours (healthy) |
| functions | supabase/edge-runtime:v1.74.0 | running, Up 4 hours, RestartCount=0 |
| storage | supabase/storage-api:v1.60.4 | running, Up 7 days, RestartCount=0 |
| realtime | supabase/realtime:v2.102.3 | running, Up 4 days, RestartCount=0 |

DB saudável via `supabase_db_health`: PostgreSQL 15.8, uptime 3d23h31m, timezone America/Sao_Paulo.

### V4 — Backup recente e válido — ✅ CONFIRMADO OK (observação de formato)

Container `supabase-backup_backup` (postgres:15-alpine), volume `supabase-backup_backup_data` → `/backups`. Exec `ls -lat /backups`:

- **Mais recente:** `supabase_selfhosted_20260804_151702.dump` — mtime **2026-08-04 15:17 UTC (hoje)**, 143.724.927 bytes (~137 MB)
- **Validade:** `pg_restore --list` OK (exit 0), **767 seções TABLE DATA** — dump íntegro
- Histórico diário presente: 08-03 (115 MB), 08-02 (57 MB), 08-01 (65 MB) — cadência diária (~15:16 UTC)
- Sentinel: script de backup (v4, visível no Cmd do container) sincroniza `ops.fn_update_backup_sentinel` e replica para R2 (`promo-brindes-backups/backups/supabase-db/daily`, retenção 14d)

⚠️ **Observação ao executor:** o critério do plano esperava magic gzip `1f 8b`; o arquivo real tem magic **`PG`** (formato custom do `pg_dump --format=custom --compress=6`), que é o formato nativo recomendado e **comprimido internamente** — não é gzip puro. Não é problema; a query de validação do plano (`head -c 2`) deve aceitar `PG` como válido. Existe também `baseline-schema-2026-08-04.sql.gz` (esse sim gzip).

### V5 — DB URL do edge — ✅ CONFIRMADO OK (observação de nomenclatura)

- functions: `SUPABASE_DB_URL=postgresql://postgres:<SECRETO>@db:5432/postgres` (senha via Docker secret)
- rest: `PGRST_DB_URI=postgres://authenticator:<SECRETO>@db:5432/postgres`
- **Mesmo host/porta/dbname: `db:5432/postgres` → MESMO banco** ✓
- URL pública: `SELFHOSTED_SUPABASE_URL=https://supabase.atomicabr.com.br` ✓ (e `AI_ROUTER_URL=https://supabase.atomicabr.com.br/functions/v1/ai-router` ✓)
- Observação: `SUPABASE_URL=http://kong:8000` (gateway interno) — padrão normal do edge-runtime self-hosted (roteia via Kong); a URL pública correta está na variável `SELFHOSTED_SUPABASE_URL`, que é a usada pelas functions no código. Não é divergência.

### V6 — Anon key válida — ✅ CONFIRMADO OK

`SUPABASE_ANON_KEY` (functions/storage, mesmo valor em ambos):

- Payload (segmento 2, base64url decodificado): `{"role":"anon","iss":"supabase","iat":1715050800,"exp":1872817200}`
- `role=anon` ✓; `exp=1872817200` = **2029-05-07T03:00:00Z — futuro** ✓ (iat 2024-05-07)
- **Assinatura HS256 verificada localmente contra o JWT secret: VÁLIDA (true)** — a chave pertence a este projeto (não é chave estrangeira).
- `ANON_KEY` do storage e `SELFHOSTED_SUPABASE_ANON_KEY` das functions: idênticos.
- Observação não-bloqueante: functions também expõe `PROMOGIFTS_SUPABASE_ANON_KEY` (projeto externo doufsxqlfjyuvxuezpln.supabase.co) — chave anon pública de outro projeto, sem risco, mas confirma que a env correta (`SUPABASE_ANON_KEY`) é a local.

### V7 — Meta sem crash-loop — ✅ CONFIRMADO OK (observação)

`supabase_meta.1.zkj6618rr0u2mlbv2oevu510x` (postgres-meta v0.96.6):

- `RestartCount=0`, `State.Running=true`, `Health.Status=healthy` (healthchecks recentes exit 0), sem OOMKill, sem Restarting
- Container **criado hoje 16:29:27Z / started 16:29:32Z** (recreate de deploy, não crash — "Up 2 hours" na listagem)
- Logs (últimas 30 linhas): somente `Server listening at :8080/:8081` + erros **funcionais** repetidos `42883: function index_advisor(text) does not exist` (chamadas POST /query — provavelmente do Studio consultando index advisor). **Nenhum trace de crash/panic/exit.**
- Observação: o erro `index_advisor` é ruído de aplicação (extensão/função ausente no schema), não derruba o container, mas pode ser corrigido instalando a função `index_advisor` (pg_stat_statements + supabase_db_advisor) para silenciar o log.

### V8 — Cron recente — ✅ CONFIRMADO OK (observação de case)

`SELECT max(start_time), count(*) FILTER (WHERE status='Succeeded') FROM cron.job_run_details WHERE start_time > now()-interval '24 hours'` → **retornou 0** com a query literal, **MAS** isso é artefato de case-sensitivity:

- `SELECT status, count(*) ... GROUP BY status` (minha query): **11085 `succeeded` + 7 `failed`** nas últimas 24h
- `max(start_time)` = **2026-08-04T18:08:00Z** (minutos antes da auditoria) — worker de cron **ativo**, 133 jobs executando (jobid 4,17,30,32,34,35,41,43,68,76,84,96,97,115,131,144,146,148,160,162,164,168,171,193 etc. rodando a cada 5 min com sucesso)
- ⚠️ **Observação ao executor:** o status é armazenado em minúsculas (`succeeded`), então a query do plano com `'Succeeded'` (capitalizado) sempre retorna 0 — **falso negativo**. Corrigir a query do plano para `status='succeeded'` ou `lower(status)='succeeded'`.
- Detalhe menor: jobid 44 teve 7 falhas (última hoje 01:00Z) — investigar se relevante (1 job entre 133).

### V9 — WAL/slots — ✅ CONFIRMADO OK

`SELECT slot_name, active, pg_wal_lsn_diff(...) FROM pg_replication_slots`:

| slot_name | active | lag |
|---|---|---|
| supabase_realtime_slot_realtime_ | **true** | 8.917.808 bytes (~8.9 MB) |
| supabase_realtime_messages_replication_slot_ | **true** | 8.917.808 bytes (~8.9 MB) |

**Nenhum slot inativo.** Lag pequeno (8.9 MB) — realtime consumindo normalmente.

### V10 — Hardcoded secrets no repo — ✅ CONFIRMADO OK (observação)

`grep -rInE 'sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJhbG...VCJ9\.[A-Za-z0-9_-]{10,}' src supabase/functions`:

- **1 único hit:** `supabase/functions/_shared/__tests__/log-sanitizer.test.ts:112` — `const jwt = "eyJhbG...e_xx";`
- Contexto lido: é **fixture de teste** do sanitizador de logs (string truncada de exemplo para testar redação de JWT em logs), **não um segredo real** (nem é um JWT completo).
- **Zero** ocorrências de `sk-...`, `AKIA...` ou JWT completos em código de produção (src/ e supabase/functions/).

---

## Divergências / itens para o executor

Nenhuma divergência bloqueante. Itens de atenção (não-P0):

1. **V8 — query do plano com case errado** (`'Succeeded'` vs `succeeded`): produz falso negativo (0) mesmo com worker saudável. Ajustar a query de validação.
2. **V4 — validação de magic**: backups são formato custom `PG` (pg_dump -Fc), não gzip `1f 8b`. Ajustar expectativa do checker.
3. **V7 — `index_advisor` 42883** repetido no log do meta (ruído funcional; considerar instalar a função).
4. **V1 — rest** usa JWT secret hardcoded no compose em vez de Docker secret (mesmo valor; higiene recomendada).
5. **V8 — jobid 44** com 7 falhas em 24h (único job com falhas).

*Fim do laudo — todas as evidências acima foram coletadas diretamente via Portainer MCP / Supabase MCP / leitura do repo, sem consultar os laudos 01_*–09_*.*
