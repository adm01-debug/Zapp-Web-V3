# PLANO DE CORREÇÃO — populado durante a análise

> Documento vivo. Cada achado real da análise vira uma etapa aqui, com origem (etapa da análise), evidência (query/arquivo/log) e critério de aceite.
> **Correção é responsabilidade do próximo chat.**

Convenção de ID: `F<bloco>-<seq>` — ex. `F1-01` = primeiro achado do bloco 1 da análise.

**Total de achados até agora: 27** (14 do Bloco 1 + 13 do Bloco 2).

---

## Tema 1 — Higienização do repositório

### F1-01 — Deletar arquivo lixo `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`

- **Origem:** Etapa 1, Etapa 10.
- **Evidência:** presença do arquivo (17 B) na raiz do repo com o próprio nome `DO_NOT_MERGE`.
- **Ação:** `git rm ___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`.
- **Aceite:** arquivo ausente em `main`.

### F1-02 — Ignorar e remover `__pycache__/` do versionamento

- **Origem:** Etapa 1, Etapa 10.
- **Evidência:** pasta `__pycache__/` versionada na raiz do repo.
- **Ação:** adicionar `__pycache__/` e `*.pyc` ao `.gitignore`; `git rm -r --cached __pycache__`.
- **Aceite:** pasta ausente do próximo `git status --ignored`.

### F1-03 — Mover scripts soltos para `scripts/`

- **Origem:** Etapa 1, Etapa 10.
- **Evidência:** `ci_cost_analysis.py` e `gen_insert.cjs` na raiz.
- **Ação:** `mv` para `scripts/`. Atualizar `package.json` se houver referências.
- **Aceite:** apenas configs/README na raiz.

### F1-04 — Migrar `lgpd_deploy.sql` para `supabase/migrations/`

- **Origem:** Etapa 10.
- **Evidência:** SQL migration solta na raiz do repo.
- **Ação:** renomear para `supabase/migrations/YYYYMMDDHHMMSS_lgpd_deploy.sql`; registrar em `supabase_migrations.schema_migrations` via `supabase_db_query` (workaround `apply_migration` bugado).
- **Aceite:** migration em ordem cronológica correta.

### F1-05 — Mover relatórios `.md` da raiz para `docs/audits/history/`

- **Origem:** Etapa 10.
- **Evidência:** 8 relatórios ad-hoc na raiz.
- **Ação:** `git mv *.md docs/audits/history/` (preservando `README.md`, `CHANGELOG.md`, `SECURITY.md`).
- **Aceite:** raiz limpa de relatórios.

### F1-06 — Deletar duplicata `playwright.e2e.config.fixed.ts`

- **Origem:** Etapa 10.
- **Evidência:** duplica `playwright.e2e.config.ts` (sufixo `.fixed`).
- **Ação:** `git rm` após diff.
- **Aceite:** um único config Playwright e2e.

### F1-07 — Consolidar 5 pastas de teste em padrão único

- **Origem:** Etapa 1, Etapa 10.
- **Evidência:** `src/__tests__/`, `src/test/`, `src/tests/`, `src/pages/__tests__/`, `src/features/*/__tests__/`, `tests/`, `e2e/`.
- **Ação:** padronizar em `src/**/__tests__/` + `e2e/`. Ajustar `vitest.config.ts` e ESLint.
- **Aceite:** duas convenções vivas, documentadas em `CONTRIBUTING.md`.

### F1-08 — Deletar `supabase/functions-legacy/`

- **Origem:** Etapa 10.
- **Evidência:** nome indica dead code.
- **Ação:** grep global por imports; se limpo, `git rm -r`.
- **Aceite:** pasta removida sem CI quebrar.

### F1-09 — Mover/deletar `supabase/fatorx-migrations/`

- **Origem:** Etapa 10.
- **Evidência:** projeto errado (FATOR X é outro repo).
- **Ação:** migrar para repo correto ou `git rm -r` se já aplicado.
- **Aceite:** zapp-web-v3 sem migrations de outro projeto.

---

## Tema 2 — Gates de CI e qualidade

### F1-10 — Remover `|| true` do script `lint`

- **Origem:** Etapa 10.
- **Evidência:** `package.json` script `lint` termina em `|| true`, mascarando falhas.
- **Ação:** remover ` || true`.
- **Aceite:** `bun run lint` retorna exit code ≠ 0 quando há erros.

### F1-11 — Reduzir `--max-warnings 999` progressivamente até `0`

- **Origem:** Etapa 10.
- **Evidência:** limite 999 esconde acumulação.
- **Ação:** baseline, redução gradual em PRs; CI check `--max-warnings 0` para arquivos modificados.
- **Aceite:** ≤ 50 em 30 dias; ≤ 10 em 90 dias.

---

## Tema 3 — Segurança Supabase

### F2-01 — Revogar `EXECUTE` de `authenticated` nas 6 TRIGGER functions em `public`

- **Origem:** Etapa 11 (Bloco 2).
- **Evidência:** `pg_proc` + `aclexplode`: `fn_contacts_proxy_delete/insert/update`, `fn_messages_bridge_delete/insert/update` são todas TRIGGER functions (args=""), mas têm `EXECUTE` granted para `authenticated` — grant incorreto, permite bypass RLS se chamadas diretamente.
- **Ação:**
  ```sql
  REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_delete() FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_insert() FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_update() FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.fn_messages_bridge_delete() FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.fn_messages_bridge_insert() FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.fn_messages_bridge_update() FROM authenticated;
  ```
- **Aceite:** `supabase_get_advisors` não lista mais estas 6 no output de `secdef_exposed` para `public`.

### F2-02 — Revogar `EXECUTE` de `authenticated` nas 3 outras TRIGGER functions em `public`

- **Origem:** Etapa 11.
- **Evidência:** `handle_new_user_settings`, `on_role_change`, `trg_fn_set_transfer_ticket` — nomes e args="" indicam TRIGGER, não RPC.
- **Ação:** `REVOKE EXECUTE ... FROM authenticated;` nas 3.
- **Aceite:** advisor `secdef_exposed` com apenas 9 remanescentes em `public` (as RPCs legítimas).

### F2-03 — Revisar 9 RPCs SECDEF em `public` — garantir `auth.uid()` + tenant check no corpo

- **Origem:** Etapa 11.
- **Evidência:** `rpc_get_contact` (2 overloads), `rpc_app_bootstrap`, `rpc_dashboard_init`, `generate_transfer_ticket`, `get_companies_by_phones_batch`, `get_contact_intelligence_by_phone`, `increment_webhook_rate_limit`, `is_instance_paused`, `log_rls_denied` são RPCs legítimas com `authenticated` grant, mas cada uma precisa validar `auth.uid() IS NOT NULL` e (quando aplicável) tenant no corpo.
- **Ação:** para cada função, `\df+ public.<name>` no psql / `pg_get_functiondef(oid)`, auditar corpo, adicionar `IF auth.uid() IS NULL THEN RAISE EXCEPTION ...` no topo, e `tenant_id = current_setting('request.jwt.claim.tenant_id', true)` onde couber.
- **Aceite:** todas as 9 têm bloco de guarda no início; testes cobrem chamada sem sessão retornando erro.

### F2-04 — Auditoria CSV das 119 SECDEF+authenticated em `zapp`

- **Origem:** Etapa 11.
- **Evidência:** contagem `pg_proc` retornou 119 em `zapp` (maior schema — todo o CRM).
- **Ação:** gerar `docs/audits/secdef-zapp.csv` com `proname, args, prosecdef, grantee, definition_hash`; classificar cada em (a) TRIGGER — revogar, (b) RPC — validar guarda interna, (c) RPC utilitária — verificar necessidade real de `authenticated`.
- **Aceite:** CSV commitado; PR de correções agrupadas por categoria.

### F2-05 — Auditoria similar em `financeiro` (25), `artes` (11), `vendas` (5)

- **Origem:** Etapa 11.
- **Evidência:** contagem `pg_proc` acima.
- **Ação:** replicar processo do F2-04 para cada schema. `docs/audits/secdef-<schema>.csv`.
- **Aceite:** 4 CSVs commitados, plano de revogações e PRs por schema.

---

## Tema 4 — Performance de banco

### F2-09 — Auditar `ops.fn_regression_tests()` — 8,8 s por call em produção

- **Origem:** Etapa 14 (Bloco 2).
- **Evidência:** `pg_stat_statements`: 8 calls, 8 803 ms avg, 8 758 ms avg em query "agg" duplicada consecutiva. Total 140 s.
- **Ação:** (a) mover chamadas para janela off-peak via cron único diário; (b) cachear resultado em MV `ops.mv_regression_tests_last` refreshed 1x/dia; (c) auditar UI que puxa 2 vezes (linhas + agregado) — consolidar em uma chamada com CTE.
- **Aceite:** avg call < 100 ms na UI (leitura de MV); total_s no `pg_stat_statements` cai para < 5 s/dia.

### F2-10 — Consolidar 588 042 INSERTs unitários em `financeiro.pagamentos_diarios`

- **Origem:** Etapa 14.
- **Evidência:** `pg_stat_statements`: 588 042 calls, avg 0,08 ms, total 48 s.
- **Ação:** identificar o processo ETL que faz loop de INSERTs; substituir por `INSERT INTO ... VALUES (...), (...), ...` em blocos de 1000 linhas ou `COPY FROM STDIN`.
- **Aceite:** call count cai de 588k para < 1k; total_s < 3 s.

### F2-11 — Investigar `zapp.fn_system_health_score_cached`

- **Origem:** Etapa 14.
- **Evidência:** nome sugere cache mas roda 289 ms por call, 334 calls, total 97 s.
- **Ação:** `pg_get_functiondef` da função; verificar se lê MV ou tabela cache real; se não, adicionar MV `zapp.mv_system_health_score` refreshed a cada 5min pelo próprio cron `refresh-health-score-cache` já existente.
- **Aceite:** avg < 5 ms; total_s < 2 s.

### F2-12 — Reduzir invalidações do PostgREST schema cache OU aumentar TTL

- **Origem:** Etapa 14.
- **Evidência:** queries #1, #8, #9, #10, #11 (introspection do PostgREST) somam 203 s.
- **Ação:** verificar `db_schemas` no `postgrest.conf`; considerar `NOTIFY pgrst 'reload schema'` só em deploys, não em cada mudança de perm; aumentar `pool-max-idletime`; investigar frequência de mudança em `pg_class` que dispara auto-reload.
- **Aceite:** total das 5 queries cai para < 40 s/dia.

### F2-13 — Índice parcial em `zapp.messages` para badge "unread inbound"

- **Origem:** Etapa 15.
- **Evidência:** query `SELECT count(*) FILTER (WHERE is_read=$1 AND direction=$2) FROM zapp.messages` — 1 399 ms avg.
- **Ação:**
  ```sql
  CREATE INDEX CONCURRENTLY idx_msg_unread_inbound
    ON zapp.messages (direction, is_read)
    WHERE is_read = false AND direction = 'inbound';
  ```
  Em tabela particionada: aplicar na master ou nas partições ativas conforme estratégia (verificar).
- **Aceite:** EXPLAIN ANALYZE mostra "Index Only Scan"; avg < 20 ms.

---

## Tema 5 — Consolidação de cron jobs

### F2-06 — Consolidar 4 pares de duplicatas de cron

- **Origem:** Etapa 13.
- **Evidência:** `cron.job`:
  - `cleanup_expired_contact_ids` (190, 02:00) + `evo_cleanup_expired_contact_ids` (189, 02:00).
  - `purge-processed-webhook-events` (54, 03:30) + `purge_webhook_events_processed` (152, 04:30).
  - `purge-webhook-audit-log-90d` (209, 03:45) + `purge_webhook_audit` (61, 04:15).
  - `cleanup-cron-job-history` (99, 03:00) + `cleanup-cron-job-logs` (216, 04:00).
- **Ação:** para cada par, ler `cron.job.command`, verificar se são exatamente equivalentes; manter o mais recente/melhor, remover o outro via `SELECT cron.unschedule(<jobid>);`.
- **Aceite:** contagem de jobs cai em 4; nenhuma tarefa duplicada.

### F2-07 — Escalonar 6 VACUUMs diários em janelas > 5 min

- **Origem:** Etapa 13.
- **Evidência:** 6 vacuums entre 02:06 e 02:21 (janela de 15 min): `vacuum-alerts-daily` (02:06), `vacuum-pipeline-health-log-daily` (02:07), `vacuum-instance-credentials-daily` (02:09), `vacuum-burnin-tracker-daily` (02:12), `vacuum-bootstrap-log-daily` (02:16), `vacuum-connection-history-daily` (02:21). Risco I/O saturation.
- **Ação:** redistribuir para janela de 60 min (02:00–03:00) com gap de 10 min entre execuções. Alternativamente, consolidar em job único chamando `VACUUM ANALYZE t1, t2, ...` sequencialmente.
- **Aceite:** no mínimo 5 min entre `start_time` de vacuum consecutivos; `cache_hit_ratio` mantém > 99% em janela pós-vacuum.

### F2-08 — Reagrupar chain logflare (7 jobs, 03:00–03:45)

- **Origem:** Etapa 13.
- **Evidência:** 7 cleanups consecutivos: `logflare-cloudflare/deno/postgres/gotrue/realtime/storage/postgrest-cleanup`.
- **Ação:** consolidar em job único `logflare_cleanup_all()` que roda uma vez pela madrugada com transação por tabela.
- **Aceite:** 1 job substitui 7; total execution time similar ou menor.

---

## Tema 6 — Frontend: router, navegação, arquitetura

### F1-12 — Homônimos em `src/pages/` (padrão duplicado por page)

_(Já registrado; ver Tema 6 do Bloco 1.)_

### F1-13 — Pages órfãs (sem `<Route>`) mas lazy-carregadas

_(Já registrado — 11 pages sem rota URL: `AdminTelemetriaPage`, `AdminFailedMessagesPage`, etc.)_

### F1-14 — Consolidar padrão duplo URL canônica vs `?view=X&tab=Y`

_(Já registrado.)_

---

## Tema 7 — Frontend: auth e sessão

_(aguardando Bloco 3 — próximo chat)_

## Tema 8 — Frontend: inbox e mensageria

_(aguardando Bloco 4 — próximo chat)_

## Tema 9 — Frontend: admin e observabilidade

_(aguardando Bloco 7 — próximo chat)_

## Tema 10 — Infra, deploy e resiliência

_(aguardando Bloco 9 — próximo chat)_
