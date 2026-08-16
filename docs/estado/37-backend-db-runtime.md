# Estado: banco — migrations, RPCs, triggers, views, RLS, cron (Fases 2B/2C + 4A)

> Runtime: **VERIFICADO ao vivo em 2026-08-16** (somente leitura — `SELECT`/`pg_catalog`/`cron.*`; zero DDL/DML) | Objetos cobertos: **524 declarados** cruzados contra **~2.600 objetos vivos**
> Agente: E7 · Branch: `claude/validar-levantamento-sistema-uxonxc` · Instância: `https://supabase.atomicabr.com.br`
> Fonte estática: `supabase/migrations/` — 325 arquivos, 51.730 linhas (lidos em altitude de objeto via `rg`, não linha a linha).

---

## 1. Visão Geral

### 1.1 Volume estático (repo) × runtime (produção)

| Dimensão | Declarado no repo | Vivo em produção | Cobertura |
|---|---:|---:|---|
| Funções/RPCs (nomes distintos) | **375** | **1.162** (zapp 930 · evo 94 · ops 95 · public 43) | 340 declaradas estão vivas; **~822 vivas sem declaração** |
| Triggers (não-internos) | **26** | **421** | 23 declarados vivos; **~398 vivos sem declaração** |
| Views (+ matviews) | **69** | **770** (zapp 261 · public 443 · evo 34 · ops 11 · outros) | 65 declaradas vivas |
| Tabelas base | **36** | **616** (zapp 386 · evo 70 · ops 51 · archive 36 · bpm 41 · email_app 33) | 28 declaradas vivas |
| Policies RLS | **486** `CREATE POLICY` | **866** só em `zapp` | — |
| Cron jobs | **18** `cron.schedule` | **222** (`cron.job`) | 15 declarados vivos; **207 vivos sem declaração** |
| Migrations | **325 arquivos** | **648 registros** em `supabase_migrations.schema_migrations` | ver §3 |

**Leitura:** o repositório declara aproximadamente **um quinto** do que existe em produção. O banco é a fonte de verdade de fato; `supabase/migrations/` é um registro parcial.

### 1.2 Contagens de schema medidas hoje

Query: `pg_class` × `pg_namespace`, `relkind` em `('r','p','v','m')`.

| Schema | Tabelas (`r`) | Particionadas (`p`) | Views | Matviews |
|---|---:|---:|---:|---:|
| `zapp` | 386 | **0** | 256 | 5 |
| `evo` | 67 | **3** | 31 | 3 |
| `ops` | 51 | 0 | 10 | 1 |
| `bpm` | 41 | 0 | 0 | 0 |
| `archive` | 36 | 0 | 0 | 0 |
| `email_app` | 33 | 0 | 0 | 0 |
| `ai` | 30 | 0 | 0 | 0 |
| `financeiro` | 17 | 0 | 11 | 0 |
| `vendas` | 14 | 0 | 5 | 0 |
| `public` | **0** | 0 | **443** | 0 |
| `monitoring` | 1 | 0 | 13 | 0 |
| `logistica` | 3 | 0 | 0 | 0 |
| `parity_audit` | 2 | 0 | 0 | 0 |
| `artes` | 2 | 0 | 1 | 0 |

---

## 2. Inventário de objetos declarados × vivos

### 2.1 Funções — agregado por schema

| Schema | Declaradas no repo | Vivas | Veredito |
|---|---:|---:|---|
| `zapp` | 255 | 253 | DECLARADO_E_VIVO (2 exceções abaixo) |
| `evo` | 67 | 37 | **30 DECLARADO_SEM_RUNTIME** — consequência do desacoplamento evo→zapp |
| `ops` | 25 | 23 | 2 ausentes |
| `public` | 20 | 19 | 1 ausente |
| `extensions` | 3 | 3 | DECLARADO_E_VIVO |
| `financeiro` | 2 | 2 | DECLARADO_E_VIVO |
| `artes` | 2 | 2 | DECLARADO_E_VIVO |
| `storage` | 1 | 1 | DECLARADO_E_VIVO |

### 2.2 DECLARADO_SEM_RUNTIME — lista completa (35 funções)

| Objeto | Tipo | Schema | Declarado em | Vivo? | Veredito |
|---|---|---|---|---|---|
| `fn_auto_assign_contact` | function | evo | `supabase/migrations/` (lote decouple) | não | DECLARADO_SEM_RUNTIME |
| `fn_canonical_route_check_daily` | function | evo | idem | não | DECLARADO_SEM_RUNTIME |
| `fn_canonical_route_decision` | function | evo | idem | não | DECLARADO_SEM_RUNTIME |
| `fn_checar_inbound_zerado` | function | evo | idem | não | movida p/ `zapp` (viva lá) |
| `fn_check_401_rate` | function | evo | idem | não | movida p/ `zapp` |
| `fn_check_ack_stall` | function | evo | idem | não | movida p/ `zapp` |
| `fn_check_whatsapp_numbers` | function | evo | idem | não | DECLARADO_SEM_RUNTIME |
| `fn_delete_test_contacts` | function | evo | idem | não | DECLARADO_SEM_RUNTIME |
| `fn_detect_401_bursts` | function | evo | idem | não | movida p/ `zapp` |
| `fn_detect_spurious_closes` | function | evo | idem | não | movida p/ `zapp` |
| `fn_download_wa_status_media` | function | evo | `20260815050000_decouple_e27_*` | não | movida p/ `zapp` |
| `fn_log_assignment_change` | function | evo | idem | não | movida p/ `zapp` |
| `fn_mark_status_viewed` | function | evo | idem | não | → `zapp.zapp_mark_status_viewed` |
| `fn_monitor_lid_contamination` | function | evo | idem | não | movida p/ `zapp` |
| `fn_notify_sicoob_on_reply` | function | evo | `20260815060000_decouple_e28_*` | não | movida p/ `zapp` |
| `fn_peak_hours_sla_check` | function | evo | idem | não | DECLARADO_SEM_RUNTIME |
| `fn_pipeline_health_probe` | function | evo | idem | não | → `evo.rpc_boundary_pipeline_health_probe` |
| `fn_resolve_contact_id_by_jid` | function | evo | idem | não | DECLARADO_SEM_RUNTIME |
| `fn_set_updated_at` | function | evo | idem | não | movida p/ `zapp` |
| `fn_shadow_snapshot_daily` | function | evo | idem | não | movida p/ `zapp` |
| `fn_sync_groups_from_api` | function | evo | idem | não | DECLARADO_SEM_RUNTIME (cron `sync-groups-daily` declarado) |
| `fn_touch_contact_presence` | function | evo | idem | não | → `zapp.zapp_touch_contact_presence` |
| `fn_trigger_audio_transcription` | function | evo | `20260815080000_decouple_e30_*` | não | movida p/ `zapp` |
| `fn_update_instance_health` | function | evo | idem | não | movida p/ `zapp` |
| `fn_upsert_group_from_event` | function | evo | idem | não | → `zapp.zapp_upsert_group_from_event` |
| `fn_upsert_group_participants` | function | evo | idem | não | → `zapp.zapp_upsert_group_participants` |
| `fn_wpp2_uptime_kpi` | function | evo | idem | não | movida p/ `zapp` |
| `rpc_boundary_mirror_event` | function | evo | idem | não | DECLARADO_SEM_RUNTIME |
| `search_contacts_gin` | function | evo | `20260807250000_search_contacts_gin` | não | DECLARADO_SEM_RUNTIME |
| `sync_contact_intelligence` | function | evo | idem | não | movida p/ `zapp` |
| `pg_net_get` | function | ops | `20260815035000_decouple_ops_pgnet_wrappers` | **não** | DECLARADO_SEM_RUNTIME — arquivo **não aplicado** (§3) |
| `pg_net_post` | function | ops | idem | **não** | DECLARADO_SEM_RUNTIME — arquivo **não aplicado** |
| `fn_reconcile_apply` | function | public | migrations decouple | não | existe só como `zapp.fn_reconcile_apply` |
| `fn_backfill_contact_id` | function | zapp | migrations | não | existe só como `evo.fn_backfill_contact_id` |
| `fn_evict_media_cache` | function | zapp | migrations | não | existe só como `evo.fn_evict_media_cache` |

> As 22 movidas `evo`→`zapp` são **esperadas** (desacoplamento F3/F4). As 13 restantes são resíduo de declaração.

### 2.3 Views declaradas × vivas (69 → 65)

| Objeto | Tipo | Schema | Vivo? | Veredito |
|---|---|---|---|---|
| `v_health_unified` | view | evo | não | DECLARADO_SEM_RUNTIME |
| `proxy_alerts` | view | zapp | não | DECLARADO_SEM_RUNTIME |
| `proxy_metrics` | view | zapp | não | DECLARADO_SEM_RUNTIME |
| `v_security_audit` | view | zapp | não | DECLARADO_SEM_RUNTIME |
| (outras 65) | view/matview | evo·ops·public·zapp | sim | DECLARADO_E_VIVO |

### 2.4 Tabelas declaradas × vivas (36 → 28)

| Objeto | Tipo | Schema | Vivo? | Veredito |
|---|---|---|---|---|
| `_evolution_contacts_backup_20260801` | table | evo | não | dropada (backup expirado) — OK |
| `evolution_groups` | table | evo | não | movida p/ `zapp.evolution_groups` (hoje view em zapp) |
| `evolution_notification_outbox` | table | evo | não | DECLARADO_SEM_RUNTIME — declarada em `20260811150400_evo_notification_outbox_dispatcher` |
| `_backup_fn_guards_20260802` | table | financeiro | não | backup expirado — OK |
| `warroom_critical_mirror` | table | ops | não | DECLARADO_SEM_RUNTIME — declarada em `20260807092000_item84_warroom_critical_mirror` |
| `_backup_avatar_urls_20260803` | table | zapp | não | backup expirado — OK |
| `_contact_merge_map_20260801` | table | zapp | não | backup expirado — OK |
| `_warroom_alerts_backup_20260801` | table | zapp | não | backup expirado — OK |
| (outras 28) | table | vários | sim | DECLARADO_E_VIVO |

### 2.5 Triggers declarados × vivos (26 → 23)

| Objeto | Tipo | Vivo? | Veredito |
|---|---|---|---|
| `trigger_snapshot_version_delete` | trigger | não | DECLARADO_SEM_RUNTIME |
| `trigger_snapshot_version_insert` | trigger | não | DECLARADO_SEM_RUNTIME |
| `trigger_snapshot_version_update` | trigger | não | DECLARADO_SEM_RUNTIME |
| (outros 23) | trigger | sim | DECLARADO_E_VIVO |

> Contrapartida: **421 triggers não-internos vivos** (`pg_trigger` com `NOT tgisinternal`) — `zapp` 234 · `evo` 59 · `bpm` 32 · `email_app` 23 · `financeiro` 19 · `ai` 14 · `vendas` 12 · `public` 10 · demais 18. Ou seja **~398 triggers VIVO_SEM_DECLARACAO**.

### 2.6 VIVO_SEM_DECLARACAO — magnitude

| Categoria | Vivos | Declarados | Sem declaração |
|---|---:|---:|---:|
| Funções (nomes distintos, zapp+evo+ops+public) | 1.162 | 340 vivas declaradas | **~822** |
| Triggers não-internos | 421 | 23 | **~398** |
| Cron jobs | 222 | 15 | **207** |
| Views `public` (proxies) | 443 | 21 | ~422 |

---

## 3. Drift de migrations

`supabase_migrations.schema_migrations`: **648 versões aplicadas** (de `20260716` a `20260816250003`).
`supabase/migrations/*.sql`: **325 arquivos** (prefixo mais antigo `20260804000000`).

| Categoria | Qtd |
|---|---:|
| Aplicada **sem arquivo** no repo | **387** |
| Arquivo **sem aplicação** registrada | **64** |
| Aplicada **com** arquivo correspondente | 261 |

### 3.1 Aplicada sem arquivo — quebra por padrão

| Padrão | Qtd | Interpretação |
|---|---:|---|
| Versões **alfanuméricas** (`20260809C01`, `20260809G32`, `20260811B90003`, `20260812A00010`, …) | **160** | Aplicadas fora do fluxo de arquivo — rótulos manuais via MCP/`apply_migration`. Nenhum arquivo correspondente existe nem pode existir (o repo usa prefixo numérico). |
| Numéricas **anteriores a `20260804`** | **88** | Consolidadas no squash `20260804000000_canonical_schema_squash_133_migrations`; arquivos originais removidos do repo. Drift **esperado**. |
| Numéricas **≥ `20260804`** | **139** | Aplicadas sem arquivo. Inclui blocos inteiros: `20260809160000`–`20260809201000` (26), `20260810200000`–`20260810210003` (17), `20260811100001`–`20260811990006` (55), `20260812700001`–`20260812800001` (4). |

Exemplos de aplicadas-sem-arquivo mais recentes: `20260815250023`, `20260815250024`, `20260816000000`, `20260816140000`, `20260816141000`.

### 3.2 Arquivo sem aplicação registrada — 64 arquivos

Todos existem em `supabase/migrations/` mas nenhum registro em `schema_migrations`:

```
20260804210000  20260805103700  20260805104000  20260805105900  20260806210200
20260806810000  20260807240000  20260807250000  20260807270000  20260808230100
20260808230200  20260808230300  20260808260000  20260808270000  20260808280000
20260809000000  20260810120000  20260811130000  20260811140000  20260811150100
20260811150200  20260811150300  20260811150400  20260811160000  20260811170000
20260811180000  20260812160000  20260812170000  20260812173000  20260813180000
20260814230000  20260815010000  20260815020000  20260815030000  20260815035000
20260815040000  20260815050000  20260815060000  20260815070000  20260815080000
20260815095959  20260815110000  20260815120000  20260815124500  20260815130000
20260815140000  20260815150000  20260815160000  20260815170000  20260815180000
20260815210000  20260815211000  20260815212000  20260815213000  20260815214000
20260815215000  20260815220000  20260815221000  20260815222000  20260815223000
20260815224000  20260815225000  20260815230000  20260815231000
```

**Concentração crítica:** 33 dos 64 são de **2026-08-15** — a onda inteira `decouple_e8`…`decouple_e51` (`20260815010000_decouple_e8_pgnet_instrumentation` até `20260815231000`).

**Porém o efeito já está no banco.** Spot-check: `20260815090000_decouple_e31_zapp_check_license_heartbeat` declara `zapp.fn_check_license_heartbeat` → função **existe viva**. Idem `20260815050000_decouple_e27` → `zapp.fn_download_wa_status_media` viva. Conclusão: o SQL foi aplicado **fora de banda** (MCP `exec_sql`/`apply_migration` com rótulo alfanumérico diferente), e não pelo arquivo. `schema_migrations` **não é um ledger confiável** deste repositório.

**Exceção real:** `20260815035000_decouple_ops_pgnet_wrappers` declara `ops.pg_net_get` e `ops.pg_net_post` — **nenhuma das duas existe em produção**. Este arquivo não foi aplicado por nenhum caminho.

---

## 4. Tabelas sem RLS em `zapp`

**Zero.** RLS está 100% habilitado.

| Métrica | Valor |
|---|---:|
| Tabelas base em `zapp` (`relkind` em `r`,`p`) | 386 |
| Com `relrowsecurity = true` | **386** |
| Sem RLS | **0** |
| Policies em `zapp` (`pg_policies`) | 866 |
| Tabelas sem RLS em `evo` | **0** (70 tabelas) |
| Tabelas sem RLS em `ops` | **0** (51 tabelas) |

### 4.1 Porém: 11 tabelas com RLS ligado e **zero policies** (deny-all efetivo)

`relrowsecurity = true` sem nenhuma linha em `pg_policies` → nega tudo para não-superusuário (`service_role`/`postgres` seguem passando por `BYPASSRLS`).

| Tabela (`zapp`) | Natureza |
|---|---|
| `_backfill_nomes_backup_20260814` | backup ad-hoc |
| `_backup_contact_intelligence_lid_phone_20260811` | backup ad-hoc |
| `_backup_repontagem_conversation_events_20260812` | backup ad-hoc |
| `_dedup_backup_20260813` | backup ad-hoc |
| `_dedup_backup_ci_20260813` | backup ad-hoc |
| `_dedup_backup_events_20260813` | backup ad-hoc |
| `_dedup_lid_pares_20260813` | backup ad-hoc |
| `_remap_backup_20260814_conversations` | backup ad-hoc |
| `_remap_backup_20260814_messages` | backup ad-hoc |
| `contact_identity_lid_staging` | **staging ativa** |
| `license_heartbeat_log` | **tabela operacional** |

As 9 primeiras são resíduo de operação e deny-all é aceitável. `contact_identity_lid_staging` e `license_heartbeat_log` são funcionais — verificar se algum consumidor não-service_role precisa lê-las.

### 4.2 `SECURITY DEFINER` sem `search_path` fixo

**Zero** em todos os schemas auditados. `zapp` 775 secdef · `evo` 72 · `ops` 70 · `public` 39 — **todas** com `proconfig` definido. O guard `secdef-search-path-guard` (cron jobid 165) está funcionando.

---

## 5. Cron: jobs ativos, jobs falhando

| Métrica | Valor |
|---|---:|
| Total em `cron.job` | **222** |
| Ativos | **211** |
| Inativos (`active = false`) | **11** |
| Declarados em migrations (`cron.schedule`) | 18 (15 vivos) |
| **Vivos sem declaração no repo** | **207** |
| Execuções em `cron.job_run_details` | 45.315 (`succeeded` 45.094 · `failed` 218 · `connecting` 3) |
| Janela de retenção efetiva | ~2,4 dias para `succeeded` (desde 2026-08-14T03:06) · falhas retidas desde 2026-08-09 |

> `cron.job` = **222**, não 218. CLAUDE.md diz 218 (auditoria 2026-08-15) — cresceu 4 em um dia.

### 5.1 Jobs com falhas — janela de 7 dias

Duas classes distintas de falha:

**(a) `job startup timeout`** — falha de infraestrutura do pg_cron (`start_time IS NULL`, launcher não conseguiu abrir backend). Não é bug de código.

| jobid | jobname | schedule | execs | falhas | % |
|---:|---|---|---:|---:|---:|
| 27 | `whatsapp_reconcile_dispatch` | `0-59/5 * * * *` | 701 | 91 | **13,0%** |
| 41 | `scan-media-security` | `3-59/5 * * * *` | 711 | 27 | 3,8% |
| 317 | `outbound-queue-dispatch` | — | 1721 | 11 | 0,6% |
| 335 | `queue-autoassign-tick` | — | 3423 | 3 | 0,1% |
| 17 | `reprocess_pending_webhooks` | `0-58/2 * * * *` | 1713 | 3 | 0,2% |
| 30, 34, 10, 43, 193, 465, 326, 5, 160, 32, 450, 35, 33, 165, 144, 4 | diversos | — | — | 1–2 cada | <1% |

**(b) Erro determinístico de SQL** — bug real de código.

| jobid | jobname | falhas/execs | Última falha | Erro |
|---:|---|---:|---|---|
| **297** | `auto_resolve_alerts` | 19/113 (**16,8%**) | **2026-08-16T11:00Z** | `ERROR: function zapp.fn_auto_resolve_alerts() is not unique — Could not choose a best candidate function` |
| 206 | `monitor-ingestion-persistence-gap` | 15/244 (6,1%) | 2026-08-13T21:40Z | `ERROR: relation "evo.evolution_audit_log" does not exist` |
| 84 | `ops-notify-critical-alerts` | 5/691 | 2026-08-13T22:07Z | `ERROR: invalid symbol "\" found while decoding base64 sequence` em `vault.decrypted_secrets WHERE name='evolution_api_key'` |
| 429 | `pipeline-canary-keep-alive` | 4/1143 | 2026-08-13T19:36Z | `ERROR: invalid input syntax for type json — Token "\"` (escape duplo no literal JSON) |
| 311 | `wal_slot_lag_check` | 3/687 | 2026-08-09T16:35Z | `ERROR: column "resolved" can only be updated to DEFAULT — is a generated column` (UPDATE em `evo.evolution_alerts`) |
| 334 | `backfill-contact-id-ongoing` | 3/344 | **2026-08-16T11:52Z** | `ERROR: missing FROM-clause entry for table "ec"` em `UPDATE evo.evolution_messages_wpp2 m SET contact_id = ec.id` |
| 63 | `db_size_snapshot` | 1/4 (**25%**) | 2026-08-12T06:00Z | `ERROR: ON CONFLICT DO UPDATE command cannot affect row a second time` |
| 463 | `purge-storage-cache` | 1/3 (**33%**) | 2026-08-12T03:00Z | `ERROR: canceling statement due to statement timeout` em `fn_purge_storage_cache(integer)` linha 68 (`pg_sleep(0.2)`) |

### 5.2 jobid 297 — resolvido durante a janela desta auditoria

Sequência real de `cron.job_run_details`:

```
2026-08-16T09:00Z  failed   function zapp.fn_auto_resolve_alerts() is not unique
2026-08-16T09:30Z  failed   idem
2026-08-16T10:00Z  failed   idem
2026-08-16T10:30Z  failed   idem
2026-08-16T11:00Z  failed   idem
2026-08-16T11:30Z  succeeded  1 row
2026-08-16T12:00Z  succeeded  1 row
2026-08-16T12:30Z  succeeded  1 row
```

Verificação em `pg_proc` agora: **existe exatamente uma** assinatura, `zapp.fn_auto_resolve_alerts()`. A sobrecarga ambígua foi removida entre 11:00 e 11:30 de hoje (provavelmente por outra lane em execução paralela). O job voltou a rodar. **Registrar como resolvido hoje, não como pendência aberta.**

### 5.3 Jobs inativos (11)

| jobid | jobname |
|---:|---|
| 120 | `wpp2-session-expiry-watchdog` |
| 129 | `cron-log-daily-purge` |
| 131 | `guardian-heartbeat-sync` |
| 190 | `cleanup_expired_contact_ids` |
| 219 | `logflare-deno-cleanup` |
| 220 | `logflare-postgres-cleanup` |
| 221 | `logflare-gotrue-cleanup` |
| 222 | `logflare-realtime-cleanup` |
| 223 | `logflare-storage-cleanup` |
| 224 | `logflare-postgrest-cleanup` |
| 497 | `onda3_evo_compose_antidrift` |

### 5.4 Crons declarados no repo e ausentes do runtime

| Nome declarado | Vivo? |
|---|---|
| `purge-webhook-audit-log-90d` | não |
| `purge-webhook-logs` | não |
| `purge_webhook_events_processed` | não |

Três rotinas de retenção declaradas em migrations não têm job correspondente em `cron.job`.

---

## 6. Divergências CLAUDE.md × produção

| # | CLAUDE.md afirma | Produção (medido 2026-08-16) | Gravidade |
|---|---|---|---|
| D1 | `zapp.evolution_messages` e `zapp.evolution_conversations` são **tabelas físicas particionadas**; `evo.evolution_messages` / `evo.evolution_conversations` **"NÃO EXISTEM"** | **Invertido.** `evo.evolution_messages` e `evo.evolution_conversations` são as raízes particionadas (`relkind='p'`). `zapp.evolution_messages` e `zapp.evolution_conversations` são **views** (`relkind='v'`). `zapp` tem **0** tabelas particionadas. | 🔴 Crítica |
| D2 | `zapp.evolution_contacts` é **tabela física** | É **view** (`relkind='v'`). A tabela física é `evo.evolution_contacts` (`relkind='r'`). | 🔴 Crítica |
| D3 | Realtime: usar `schema:'zapp'`, tabela `evolution_messages` / `evolution_conversations` | **Nenhuma das duas está na publication `supabase_realtime`** — nem em `zapp` (é view, views nunca emitem) nem em `evo`. A publication tem exatamente **14 relations** e nenhuma é mensagem/conversa. | 🔴 Crítica |
| D4 | `zapp.failed_messages` e `zapp.dispatch_error_logs` estão na publication | **Nenhuma das duas está.** `zapp.failed_messages` é tabela física mas fora da publication; `zapp.dispatch_error_logs` idem. | 🔴 Alta |
| D5 | `zapp.evolution_messages` tem **14 partições** (`wpp2`, `comercial_01`–`08`, `compras`, `default`, `financeiro`, `logistica`, `marketing`) | `evo.evolution_messages` tem **2 partições**: `evolution_messages_wpp2` e `evolution_messages_default`. As 12 restantes não existem. | 🟠 Alta |
| D6 | `evolution_conversations` tem **13 partições** | `evo.evolution_conversations` tem **6**: `compras`, `default`, `financeiro`, `logistica`, `marketing`, `wpp2`. | 🟠 Alta |
| D7 | `zapp` = 323 base tables / 380 views | **386** tables / **256** views + 5 matviews | 🟡 Média |
| D8 | `evo` = 136 base tables | **70** (67 `r` + 3 `p`) — metade | 🟡 Média |
| D9 | `ops` = 20 tables · `archive` = 25 | `ops` = **51** · `archive` = **36** | 🟡 Média |
| D10 | `public` = 1 tabela interna (`_wal_slot_guard_events`) + 511 views | `public` tem **0 tabelas** e **443 views**. `_wal_slot_guard_events` vive em **`ops`**, não em `public`. | 🟡 Média |
| D11 | `ai` = 31 tabelas | **30** | 🟢 Baixa |
| D12 | 218 cron jobs | **222** (211 ativos + 11 inativos) | 🟢 Baixa |
| D13 | 123 Edge Functions / 130+ migrations | **325** arquivos de migration | 🟢 Baixa |
| D14 | `evo.evolution_messages_wpp2_archive` é tabela standalone em `evo` | Está em **`zapp`** (`zapp.evolution_messages_wpp2_archive`, `relkind='r'`, sem parent) | 🟡 Média |

> D1–D6 contradizem o bloco marcado como *"corrigido 2026-08-15 — fonte de verdade: `docs/decouple/ANALISE_FRONTEIRA_EVO_ZAPP_20260815.md`"*. A "correção" de 15/08 descreve um estado que **não corresponde ao banco de 16/08**: ou a migração evo→zapp foi revertida, ou nunca chegou a mover as relações físicas.

---

## 7. Achados

### A1 — Realtime de mensagens e conversas está morto 🔴 CRÍTICO
`pg_publication_rel` × `supabase_realtime` retorna **14 relations**, e `evolution_messages`/`evolution_conversations` não estão em nenhuma delas, em nenhum schema. A publication tem `pubviaroot = true`, então nem a raiz `evo.evolution_messages` nem qualquer partição emite CDC. Toda subscription de inbox em tempo real recebe **zero eventos** de mensagem.

Relations efetivamente na publication:
`evo.evolution_contacts`, `zapp.agent_stats`, `zapp.app_notifications`, `zapp.audit_logs`, `zapp.conversation_transfers`, `zapp.evolution_alerts`, `zapp.evolution_realtime_events`, `zapp.message_reactions`, `zapp.profiles`, `zapp.transfer_comments`, `zapp.user_roles`, `zapp.user_settings`, `zapp.warroom_alerts`, `zapp.whatsapp_connections`.

**Evidência:** `pg_publication` (`pubname='supabase_realtime'`, `n_rels=14`, `pubviaroot=true`) + `pg_publication_rel`.
**Hipótese de mitigação em produção:** o app pode estar usando `zapp.evolution_realtime_events` como canal-espelho (está na publication). Confirmar com o agente de frontend/hooks antes de tratar como incidente aberto.

### A2 — CLAUDE.md inverteu a topologia evo↔zapp 🔴 CRÍTICO
CLAUDE.md instrui explicitamente: *"`evo.evolution_messages` … NÃO EXISTEM"* e *"`zapp.evolution_messages` é tabela física particionada"*. `pg_class`/`pg_inherits` provam o oposto: `evo.evolution_messages` é `relkind='p'` com partições `_wpp2` e `_default`; `zapp.evolution_messages` é `relkind='v'`. Qualquer agente que siga o CLAUDE.md ao pé da letra vai escrever subscription, migration ou índice no objeto errado.
**Evidência:** `pg_class.relkind` + `pg_inherits` (93 linhas inspecionadas); `zapp` tem 0 relações `relkind='p'`.

### A3 — `schema_migrations` não é ledger confiável: 387 aplicadas sem arquivo, 64 arquivos sem aplicação 🔴 CRÍTICO
648 versões aplicadas contra 325 arquivos. 160 versões usam rótulos alfanuméricos (`20260809G32`, `20260811B90003`) que só podem ter vindo de `apply_migration`/`exec_sql` via MCP, fora do fluxo de arquivo. Em paralelo, 33 arquivos da onda de desacoplamento de 15/08 não têm registro — mas seus objetos **estão vivos**, provando aplicação fora de banda. Não há como reconstruir produção a partir do repo, nem validar o repo a partir de produção.
**Evidência:** `supabase_migrations.schema_migrations` (648) × `ls supabase/migrations/*.sql` (325); spot-check `20260815090000` → `zapp.fn_check_license_heartbeat` viva.

### A4 — `20260815035000_decouple_ops_pgnet_wrappers` nunca foi aplicado por caminho nenhum 🟠 ALTO
Único arquivo não-aplicado cujos objetos comprovadamente **não existem**: `ops.pg_net_get` e `ops.pg_net_post` ausentes de `pg_proc`. Todos os outros 63 arquivos não-registrados tiveram efeito aplicado fora de banda. Se algum consumidor chama esses wrappers, quebra em runtime.
**Evidência:** `supabase/migrations/20260815035000_decouple_ops_pgnet_wrappers.sql`; `pg_proc` sem `ops.pg_net_get`/`ops.pg_net_post`.

### A5 — Cron `whatsapp_reconcile_dispatch` (jobid 27) falha 13% das execuções por `job startup timeout` 🟠 ALTO
91 falhas em 701 execuções em 7 dias — de longe a maior taxa entre jobs de alta frequência. Roda a cada 5 min e é o reconciliador de despacho do WhatsApp: 13% de perda significa janelas de reconciliação puladas. Não é bug de SQL (`start_time IS NULL` → o launcher do pg_cron não conseguiu abrir backend), é **saturação de `max_worker_processes`/conexões** com 211 jobs ativos, muitos em `*/5` e `*/2`.
**Evidência:** `cron.job_run_details` agregado; `scan-media-security` (3,8%), `outbound-queue-dispatch` (0,6%) sofrem do mesmo modo.

### A6 — 3 crons com bug de SQL determinístico ainda não corrigidos 🟠 ALTO
- **jobid 206** `monitor-ingestion-persistence-gap`: `relation "evo.evolution_audit_log" does not exist` — a função referencia uma tabela que o desacoplamento removeu de `evo`. 15 falhas.
- **jobid 334** `backfill-contact-id-ongoing`: `missing FROM-clause entry for table "ec"` — `UPDATE evo.evolution_messages_wpp2 m SET contact_id = ec.id FROM (...)` com alias fora de escopo. Falhou hoje às 11:52Z.
- **jobid 311** `wal_slot_lag_check`: `UPDATE evo.evolution_alerts SET resolved_at=..., resolved=...` onde `resolved` é **coluna gerada**.
**Evidência:** `cron.job_run_details.return_message`, jobids 206/334/311.

### A7 — `ops-notify-critical-alerts` falha ao decodificar o segredo `evolution_api_key` do vault 🟠 ALTO
`ERROR: invalid symbol "\" found while decoding base64 sequence` ao ler `vault.decrypted_secrets WHERE name='evolution_api_key'`. Ou o segredo foi gravado com escape indevido, ou há mais de uma entrada com esse nome. Enquanto falha, **alertas críticos não são notificados** — é um cego no caminho de observabilidade. 5 falhas; última em 13/08.
**Evidência:** `cron.job_run_details` jobid 84.

### A8 — 822 funções e 398 triggers vivos sem nenhuma declaração no repo 🟠 ALTO
`zapp` tem 930 nomes de função distintos (954 assinaturas) e o repo declara 255. `pg_trigger` tem 421 triggers não-internos e o repo declara 26. A superfície de RPC exposta ao PostgREST é majoritariamente invisível ao code review, ao CI e ao knowledge graph.
**Evidência:** `pg_proc`/`pg_namespace` × `rg 'CREATE (OR REPLACE )?FUNCTION'`; `pg_trigger WHERE NOT tgisinternal`.

### A9 — 207 dos 222 cron jobs não estão declarados em migration 🟠 ALTO
O repo tem 18 `cron.schedule`. Produção tem 222 jobs, incluindo os de maior criticidade (`outbound-queue-dispatch`, `whatsapp_reconcile_dispatch`, `process-evolution-notifications`, `pipeline-canary-keep-alive`). Um restore a partir do repo não reconstrói o scheduler. Adicionalmente, 3 rotinas de retenção **declaradas** (`purge-webhook-logs`, `purge-webhook-audit-log-90d`, `purge_webhook_events_processed`) **não existem** em `cron.job` — retenção de webhook pode não estar rodando.
**Evidência:** `cron.job` (222) × `rg "cron\.schedule\('"` (18).

### A10 — 55 tabelas residuais de backup/staging em produção 🟡 MÉDIO
`zapp` 25 · `ops` 14 · `_backups` 8 · `evo` 8. Inclui `_dedup_backup_*_20260813`, `_remap_backup_20260814_*`, `_snap_pre_upgrade_*_20260811/12`, `evo_msgs_reanexacao_20260809`. Nove delas têm RLS ligado sem policy (deny-all). São resíduo das ondas de decouple/dedup e ninguém as expirou — o cron `expire-stale-backups` está declarado mas evidentemente não as alcança.
**Evidência:** `pg_class` filtrado por `relname LIKE '\_%' OR '%backup%' OR '%staging%' OR ~ '_20[0-9]{6}$'`.

### A11 — 11 tabelas em `zapp` com RLS ligado e zero policies 🟡 MÉDIO
Deny-all para qualquer role sem `BYPASSRLS`. Nove são backups (aceitável), mas **`contact_identity_lid_staging`** e **`license_heartbeat_log`** são operacionais. Se algum consumidor autenticado (não `service_role`) precisa lê-las, falha silenciosamente sem erro de permissão explícito.
**Evidência:** `pg_class.relrowsecurity=true` sem correspondência em `pg_policies`.

### A12 — Retenção de `cron.job_run_details` é de apenas ~2,4 dias 🟡 MÉDIO
`succeeded` mais antigo: 2026-08-14T03:06Z, contra 45.094 linhas. Com 222 jobs (vários a cada 2 min) o histórico de sucesso some rápido; falhas sobrevivem desde 09/08 apenas por serem raras. Investigação de incidente com mais de 3 dias é inviável.
**Evidência:** `SELECT status, min(start_time), max(start_time) FROM cron.job_run_details GROUP BY 1`.

### A13 — CLAUDE.md defasado em 8 contagens de schema 🟡 MÉDIO
Ver §6, D7–D13. As mais graves: `zapp` 323→386 (+63 tabelas não documentadas), `evo` 136→70 (documento superestima em quase o dobro), `ops` 20→51, `public` "1 tabela"→0.
**Evidência:** `pg_class` × `pg_namespace` agregado.

### A14 — `zapp.evolution_messages_wpp2_archive` documentada no schema errado 🟢 BAIXO
CLAUDE.md a descreve como `evo.evolution_messages_wpp2_archive`. Ela vive em `zapp` (`relkind='r'`, sem parent em `pg_inherits`). A observação de que **não é partição** está correta.
**Evidência:** `pg_class`/`pg_inherits`.

### A15 — jobid 297 `auto_resolve_alerts` resolvido durante esta auditoria 🟢 INFORMATIVO
Falhou 19× em 24h com `function zapp.fn_auto_resolve_alerts() is not unique`; a sobrecarga ambígua foi eliminada entre 11:00Z e 11:30Z de hoje, provavelmente por outra lane paralela. `pg_proc` agora tem uma única assinatura e as três últimas execuções sucederam. **Não é pendência aberta** — registrado para evitar retrabalho.
**Evidência:** `cron.job_run_details` jobid 297; `pg_get_function_identity_arguments`.

### A16 — Ponto positivo: RLS e `search_path` estão íntegros 🟢 CONFORME
386/386 tabelas de `zapp`, 70/70 de `evo` e 51/51 de `ops` com `relrowsecurity=true`. **Zero** funções `SECURITY DEFINER` sem `proconfig` (search_path) em `zapp`(775), `evo`(72), `ops`(70), `public`(39). O guard automático `secdef-search-path-guard` (jobid 165) está ativo e funcionando.
**Evidência:** `pg_class.relrowsecurity`; `pg_proc WHERE prosecdef AND proconfig IS NULL` → 0.

---

## Anexo — Consultas de reprodução

Todas somente leitura. Nenhuma escrita foi executada nesta auditoria.

```sql
-- §1.2 contagens por schema
SELECT n.nspname, count(*) FILTER (WHERE c.relkind='r') AS tab,
       count(*) FILTER (WHERE c.relkind='p') AS part,
       count(*) FILTER (WHERE c.relkind='v') AS views,
       count(*) FILTER (WHERE c.relkind='m') AS matviews
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace GROUP BY 1;

-- A1/A2 topologia + realtime
SELECT n.nspname, c.relname, c.relkind,
       EXISTS(SELECT 1 FROM pg_publication_rel r JOIN pg_publication p ON p.oid=r.prpubid
              WHERE r.prrelid=c.oid AND p.pubname='supabase_realtime') AS na_publication
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname LIKE 'evolution_messages%' OR c.relname LIKE 'evolution_conversations%';

-- A5/A6/A7 cron falhando
SELECT j.jobid, j.jobname, count(*) AS execs,
       count(*) FILTER (WHERE d.status='failed') AS falhas,
       left(max(d.return_message) FILTER (WHERE d.status='failed'),200) AS erro
FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
GROUP BY 1,2 HAVING count(*) FILTER (WHERE d.status='failed')>0 ORDER BY falhas DESC;

-- A11 RLS ligado sem policy
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='zapp' AND c.relkind IN ('r','p') AND c.relrowsecurity
  AND NOT EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='zapp' AND p.tablename=c.relname);

-- A3 drift de migrations
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
-- comparar com: ls supabase/migrations/*.sql | sed -E 's#.*/([0-9]+).*#\1#'
```
