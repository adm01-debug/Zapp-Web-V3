# EXECUCAO DO PLANO DE CORRECAO — 100 ETAPAS (schema zapp / pipeline EVO)

**Data:** 2026-08-20/21 · **Base:** RELATORIO-AUDITORIA-ZAPP-20260820 (12 findings) · **Executor final:** sessao Claude Code (validacao exaustiva + fechamento)
**Contexto:** parte do plano ja havia sido executada por sessao anterior no mesmo dia (2026-08-20). Esta execucao **validou item a item** o que estava feito, corrigiu o que estava incompleto, fechou os gaps e versionou tudo.

---

## 1. Veredito por finding

| Finding | Estado na validacao | Acao desta execucao | Status final |
|---|---|---|---|
| **F-001** watchdog midia (job 524) | ✅ JA FEITO — `zapp.fn_media_queue_stalled_alert()` criada, job reagendado, `succeeded` em todos os ticks, 6 alertas reais em 48h | Versionado retroativamente (arquivo + linha `20260820113000`) | **FECHADO** |
| **F-002** outage 14/08 | 🔶 RECUPERADO mas nao quantificado — dia 14/08 com 6.588 msgs (auditoria via 449) | Delta FDW janela 13–17/08 medido: **PG14=23.696 vs evo=23.703 (deficit −7)**; unicos deltas horarios (3 e 1) = canarias. **Perda real = 0.** Sentinela preventiva criada: `zapp.fn_fdw_delta_sentinel()` + cron 556 `7,37 * * * *` (testada, `succeeded`) | **FECHADO** |
| **F-003** colisao de migrations | 🔶 PARCIAL — names corrigidos no banco, mas repo ainda tinha `20260818140000_etapa57_invite_user.sql` e faltavam os sentinels | Arquivo colidido **removido** (banco bate byte a byte com `20260818190003_invite_user_rpc.sql` — conferido via `pg_get_functiondef`); criados `20260818140000_sentinel_teste_mensal.sql` e `20260818160000_sentinel_curto_521.sql` retroativos com DDL real; arquivo `20260820140000_f003_version_sentinels.sql` | **FECHADO** |
| **F-004** snapshot canonico | ❌ NAO FEITO | snapshot canonico `scripts/decouple/snapshots/zapp_schema_snapshot.sql` REGENERADO do banco vivo (pg_dump 15.8 schema-only --no-owner --no-privileges + transform E41 idempotente, pipeline oficial do drift-gate; 2,85 MB brutos, 77.732 linhas, integridade conferida por tamanho/gzip apos transferencia) | **FECHADO** |
| **F-005** DML `authenticated` em evo | ✅ JA FEITO (migration `20260819160000_ml004_revoke_auth_write`, GATE-A) | Validado: **0 grants** INSERT/UPDATE/DELETE p/ authenticated em `evo.*`; policies de escrita remanescentes sao inertes (sem grant nao ha acesso) | **FECHADO** |
| **F-006** 3 FKs duplicadas | ✅ JA FEITO **com correcao tecnica**: as 3 FKs sao o parent + 2 clones internos do PG15 p/ FK→tabela particionada (`conparentid` aponta p/ `fk_media_queue_message_uuid`) — **falso positivo da auditoria**; reconstrucao limpa + `idx_mdq_message_uuid_instance` criados (`20260820120500`) | Validado (conparentid conferido); FKs sem indice na tabela = 0 | **FECHADO** |
| **F-007** 7 grupos de indices duplicados | ✅ JA FEITO (6 dropados + trio de `evolution_contacts` = falso positivo mantido, `20260820120500`) | **2 grupos NOVOS** achados e dropados: `evo.idx_recon_coverage_daily_snapshot_date` (redundante c/ PK) e `zapp.idx_contact_tags_contact`+`idx_contact_tags_contact_id` (ambos idx_scan=0, cobertos pela UNIQUE `(contact_id,tag_id)`); **+4 FKs sem indice** cobertas (crm_sync_config, csat_surveys, n8n_config, notification_delivery_log) — `20260820192000` | **FECHADO** (grupos=0, FKs sem indice=0) |
| **F-008** comments/docs IA | 🔶 PARCIAL — tabelas zapp 100% (386/386) feito; **colunas 22,7%** (meta ≥40%); DICIONARIO inexistente | **Colunas 22,7% → 47,7%** (1.942/4.075; 98% das colunas de tabelas com dados): gerador com regras nome/tipo/FK/PK + valores de CHECK, amostra de 45 revisada antes, overrides curados p/ top-5 tabelas (`20260820190000`); rpc_* evo **29/29 (100%)**, zapp 17→59 comentadas (159 sem cabecalho no fonte = skip honesto); 3 tabelas staging evo comentadas; `docs/DICIONARIO-BANCO.md` (813 linhas) + `docs/MODULOS-INATIVOS.md` (242 tabelas vazias, 124 grupos) gerados | **FECHADO** |
| **F-009** sprawl (24 tmp + 252 vazias) | ✅ JA FEITO (GATE-B): zero tabelas `_backup_/_dedup_/_remap_` restantes em zapp/evo; `_backups` com expiry (backup_metadata) | `docs/MODULOS-INATIVOS.md` criado (etapa 77 pendente); 3 stagings novos de 20/08 comentados como candidatos a DROP futuro | **FECHADO** |
| **F-010** retencao webhook_events (472MB) | ✅ JA FEITO (GATE-C): cron 546 purge 7d + cron 544 vacuum + `evo.fn_purge_traefik_401_stats` diario (551) + vacuum semanal (541). 600k→194k rows (oldest 13/08); traefik 13MB/7,6k rows | Versionado retroativamente (`20260820151000`) | **FECHADO** |
| **F-011** ESTADO.md + I2 | 🔶 PARCIAL — `fn_filter_canary_messages` movida p/ zapp (I2=0), mas ESTADO.md ainda dizia "2026-08-08" | ESTADO.md atualizado (secao "Plano de correcao 100 etapas — EXECUTADO" + linha de verificacao 2026-08-20 + medicao desacoplamento I2=0, boundary 26+10, 123 edge functions); `20260820180000` versionada retroativamente | **FECHADO** |
| **F-012** 4 containers orfaos | ✅ JA FEITO (GATE-C): os 4 removidos (validado em portainer_list_containers) | **RECORRENCIA + CAUSA RAIZ**: novo orfao `gallant_lederberg` (edge-runtime, bridge, labels vazios, AutoRemove=true, volume `evo-gate6-32424289592` = run do GitHub Actions) → leak do job **gate6 do CI do evolution-stack** no runner self-hosted. Marker `20260820152000` + pacote **GATE-C2** abaixo | **FECHADO** (com pendencia GATE-C2) |
| F-013 (informativo) | RLS-on sem policy = deny-all intencional | Revalidado: 5 tabelas (2 zapp ja documentadas + 3 stagings evo de 20/08, agora comentadas) | OK |

## 2. Achados NOVOS desta execucao (fora dos 12 da auditoria)

| # | Achado | Acao |
|---|---|---|
| N-1 | **Cron 213 `media_pipeline_health_check` quebrado** — `fn_run_media_health_alert()` inseria coluna `body` (hoje `message`) em warroom_alerts; bug latente que so disparava com fila>1000; falhando desde 20/08 16:00 | **CORRIGIDO** (`20260820191000`): colunas atuais + cast enum `warroom_alert_type`; testado — alerta real criado ("Fila com 2099 pending"); job `succeeded` no tick 00:00 |
| N-2 | **P1 operacional: downloads de midia sem sucesso desde 10/08** — ultimo `done` = 10/08 23:12; 0 done em 24h; 1.869 pending (backfill de 20/08, staging `_unknown_media_backfill_20260820` c/ 15.958 refs) e `failed` crescendo (735→992 durante a execucao — retries rodando e falhando, coerente com midia >7d expirada no CDN) | **NAO alterado** (religar worker/descartar backfill = decisao do dono do pipeline; watchdogs 524/213/probes e2e estao alertando corretamente — os alertas abertos sao VERDADEIROS). Item 1 dos proximos passos |
| N-3 | **I2 regrediu para 1 durante a execucao** — a propria sentinela FDW criada em `evo` referenciava `zapp.evolution_alerts` | **CORRIGIDO na hora**: funcao movida para `zapp.fn_fdw_delta_sentinel` (mesmo padrao do watchdog 524), cron 556 realinhado, I2=0 revalidado |
| N-4 | **Sentry (14d)**: burst novo `safeClient: Erro na query from contact_tags` — 84 eventos entre 23:16:06Z e 23:21:09Z de 20/08, release `9b7d29a`, UI de etiquetas | **Nao relacionado ao plano** (primeira escrita desta execucao: ~00:40Z de 21/08, 1h20 depois do fim do burst; coincide com janela de deploy do front). Recomendacao: revisar retry-loop do safeClient na exclusao de etiquetas. Demais issues Sentry = bursts de infra (AMQP/DNS/SSL) nos restarts de 19-20/08, consumer saudavel desde entao |
| N-5 | Registro `20260820093000` com o nome embutido na versao (`…_recon_coverage_daily`) | Normalizado para `20260820093000` (`20260820194000`) |
| N-6 | Arquivo `20260820000000_drift_version_stamps.sql` nao registrava a si proprio em schema_migrations | Linha inserida |

## 3. Bateria de validacao — antes (auditoria 20/08) vs depois (21/08 ~01:45Z)

| Metrica | Auditoria 20/08 | Pos-plano | Meta |
|---|---|---|---|
| Cron 524 (watchdog midia) | falha em TODA execucao | `succeeded` em todos os ticks | ✅ |
| Perda real de mensagens (janela 13–17/08) | desconhecida (dia 14/08 = 449) | **0** (PG14 23.696 vs evo 23.703) | ✅ |
| Tabelas sem PK (zapp+evo) | 0 | 0 | ✅ |
| FKs sem indice (zapp+evo) | 4 (+ media_download_queue) | **0** | ✅ |
| Grupos de indices duplicados | 7 (+2 novos) | **0** | ✅ |
| SECDEF sem search_path | 0 | 0 | ✅ |
| RLS-on sem policy (com dados) | 13 (deny-all intencional) | 5 (todas documentadas/intencionais) | ✅ |
| DML `authenticated` em evo.* | presente | **0 grants** | ✅ |
| Comments tabelas zapp | 27% (108/400) | **100%** (386/386) | ✅ |
| Comments colunas zapp | 20,7% (887/4.276) | **47,7%** (1.942/4.075) | ✅ ≥40% |
| Comments tabelas evo | 100% | 100% (74/74, incl. 3 stagings novos) | ✅ |
| Comments rpc_* | evo parcial / zapp 17 | evo **29/29**; zapp 59/218 | ✅ boundary 100% |
| Crons falhando (janela 4h) | F-001 + cluster restart | **nenhum** | ✅ |
| DLQ consumer | 0 | 0 | ✅ |
| Duplicatas message_id 7d | 0 | 0 | ✅ |
| Outbound queue pendente | 0 | 0 (1.892 historicas `cancelled`) | ✅ |
| webhook_events_processed | 472MB / ~600k rows / 18d | 194k rows / retencao 7d ativa (tamanho fisico decai via vacuum semanal) | ✅ |
| I2 (evo→zapp fora de boundary) | 1 (`fn_filter_canary_messages`) | **0** | ✅ |
| Tabelas tmp `_backup_/_dedup_/_remap_` | 24 | **0** (movidas/dropadas, GATE-B) | ✅ |
| Migrations repo↔banco (janela ≥2026-08-17) | colisao + serie f0xx sem arquivo | **0 divergencia do plano**; residuais fora do escopo: `20260817193000` e `20260817200001` (banco-only, ondas de 17/08). A `20260820230000` (fix_fanout, onda paralela) teve o arquivo publicado no main durante esta execucao (#1351) — resolvida | ✅ |
| Fila de midia | pending=0 (manha) | pending=1.869/failed=992 (backfill 20/08 + worker sem sucesso desde 10/08) — **alertado** (achado N-2) | ⚠️ operacional |

## 4. Migrations criadas/ajustadas por esta execucao

Aplicadas no banco via MCP (`supabase_apply_migration` bugado no self-hosted) + linha manual em `schema_migrations` + arquivo no repo:

| Versao | Arquivo | Tipo |
|---|---|---|
| 20260818140000 | `sentinel_teste_mensal.sql` | retroativo (DDL real: FT + cron 530) |
| 20260818160000 | `sentinel_curto_521.sql` | retroativo (cron 532) |
| 20260820093000 | `recon_coverage_daily.sql` | retroativo (onda paralela) |
| 20260820100000 | `rls_class2_fix_authuid_to_profile.sql` | retroativo (stub documentado) |
| 20260820113000 | `f001_fix_cron_524_media_stalled_alert_fn.sql` | retroativo + linha nova |
| 20260820130000 | `f008_comments_full_coverage.sql` | retroativo (386 COMMENTs reais) |
| 20260820140000 | `f003_version_sentinels.sql` | retroativo |
| 20260820151000 | `f010_webhook_events_retention_7d_purge.sql` | retroativo (crons 546/544/551/541 + fn) |
| 20260820152000 | `f012_containers_orphans_removed.sql` | marker infra |
| 20260820180000 | `f011_drop_evo_fn_filter_canary_messages.sql` | retroativo (fn + 3 triggers) |
| 20260820190000 | `f008_comments_lote3_colunas.sql` | **novo** (gerador + DO + curadoria; aplicado) |
| 20260820191000 | `fix_cron_213_media_health_alert_fn.sql` | **novo** (aplicado) |
| 20260820192000 | `f007_extra_dup_idx_fk_indexes.sql` | **novo** (aplicado; CONCURRENTLY fora de transacao) |
| 20260820193000 | `f002_fdw_delta_sentinel.sql` | **novo** (aplicado; fn em zapp por I2) |
| 20260820194000 | `f008_comments_evo_staging_e_meta.sql` | **novo** (aplicado) |
| — | `20260818140000_etapa57_invite_user.sql` | **REMOVIDO** (colisao F-003) |
| — | `scripts/decouple/snapshots/zapp_schema_snapshot.sql` | snapshot F-004 (nao-migration) |

Rollbacks: documentados no cabecalho de cada arquivo.

## 5. Gates

- **GATE-A** (revoke DML evo): aprovado e executado em sessao anterior (`ml004`, 2026-08-19). Validado.
- **GATE-B** (drop backups tmp): aprovado e executado em sessao anterior. Validado (0 remanescentes).
- **GATE-C** (retencao + 4 containers): aprovado e executado em sessao anterior. Validado.
- **GATE-C2 — PENDENTE DE `APROVADO`** (nova ocorrencia F-012):
  - **O que:** remover o container orfao `gallant_lederberg` (id `c7665f4d1e09`, supabase/edge-runtime:v1.74.0, criado 2026-08-20 22:28 UTC, rede bridge, labels vazios, AutoRemove=true, volume `evo-gate6-32424289592`).
  - **Evidencia de causa raiz:** o volume nomeia o run 32424289592 do GitHub Actions — job "gate6" (evolution-stack) sobe edge-runtime no runner self-hosted e vaza o container quando o job termina sem stop.
  - **Comando (apos APROVADO, e somente se o run do CI ja terminou):** `docker stop gallant_lederberg` (AutoRemove limpa o resto).
  - **Fix definitivo (recomendado):** step de cleanup `if: always()` no workflow gate6 do repo `evolution-stack` (stop por label/nome) — fora do escopo deste repo.

## 6. UNKNOWN / BLOQUEADO remanescentes

1. **UNKNOWN — dono do backfill de midia de 20/08**: quem enfileirou (staging `_unknown_media_backfill_20260820`) e se o worker de download deve ser religado ou o backfill descartado (itens >7d tendem a CDN expirado → perda historica aceita, etapa 18 do plano).
2. **UNKNOWN — DDL exato da onda `20260820100000` (rls_class2)**: aplicado por sessao paralela sem captura previa; stub retroativo criado; estado vivo coberto pelo snapshot.
3. Residuais banco-only fora do escopo do plano: `20260817193000` (e25_message_hourly_fdw_reconcile_delta1h) e `20260817200001` (e39a_extra_webhook_v2_evo_reconciler_grants). (`20260820230000` resolvida via #1351 durante esta execucao.)
4. Sentry `SENTRY-GREEN-BASKET-ND` (contact_tags, UI de etiquetas): burst autolimitado na janela de deploy do front; investigar retry-loop do safeClient (84 eventos/5min).

## 7. Proximos passos (3)

1. **Decidir o backlog de midia (N-2)**: religar/consertar o consumidor de `media_download_queue` OU marcar o backfill de 10-20/08 como perda historica aceita e expirar os pendentes — os alertas abertos (`media_download_queue_stalled`, `[MEDIA] Pipeline degradado`) sao verdadeiros e vao persistir ate a decisao.
2. **GATE-C2**: aprovar remocao do `gallant_lederberg` + abrir issue no `evolution-stack` para o cleanup step do gate6 (fix definitivo da recorrencia F-012).
3. **Apos o primeiro disparo real da sentinela FDW** (deficit>20), calibrar o threshold se necessario; e apos 1 semana de retencao 7d, conferir devolucao de espaco fisico de `webhook_events_processed` (esperado <200MB) — se nao decair, avaliar `pg_repack`.
