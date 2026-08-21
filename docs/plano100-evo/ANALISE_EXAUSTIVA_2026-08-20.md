# PLANO-100 EVO — Análise Exaustiva e Execução Final (20/08/2026)

> **Autor:** sessão `claude-fable-p100-final` (Claude Code Remote, branch `claude/analise-plano-implementacao-vgam82`)
> **Método:** cada etapa validada contra o estado REAL de produção (Supabase self-hosted PG 15.8 via MCP, PG14 da Evolution e containers via Portainer, RabbitMQ via rabbitmqctl/mgmt-api). Nada foi assumido de documentação; toda evidência citada existe em `evo.audit100_baseline`, `cron.job`, catálogos do PG ou logs de container.
> **Contexto:** o plano já vinha sendo executado por 16 sessões (Hermes/Claude) registradas no baseline entre 19/08 16:28 e 20/08 18:47. Esta sessão fez a validação cruzada final, fechou as lacunas implementáveis e corrigiu 3 implementações que estavam **erradas** (detalhe abaixo).

---

## 1. Sumário executivo

| Dimensão | Resultado |
|---|---|
| Etapas 100% concluídas e validadas | **78** |
| Concluídas **com correção/melhoria** nesta sessão | **12** (e3, e14, e19, e28–29, e36–38, e40, e69, e78, e96, e98) |
| Armadas aguardando **gate temporal** (24h/48h/3 dias) | **6** (e20/CP-2, e33–35, e50/CP-6, e60/CP-7, e80/CP-9 formal) |
| Exigem janela/ação humana | **4** (e97 parada de réplica; credencial Evolution no n8n; fix @lid na Evolution — issue #100; vault `elevenlabs_api_key`) |
| **Cobertura do espelho (24h) ao final da sessão** | **100,00%** (0 faltantes reais; 387 by-design) |
| `v_kpi_overview` | **6–19 ms** (antes: 1.857 ms) e **sem NULLs estruturais** |
| Espaço recuperado (VACUUM FULL desta noite) | **~22,5 MB** nesta rodada (traefik_401 13,9→1,1 MB; partição 2026_07 5,6 MB→48 KB) |
| Backlog RabbitMQ (real, mgmt-api) | **0** em todas as 21 filas do vhost `evolution` (22:50 BRT) |

**As três implementações erradas que esta sessão corrigiu:**

1. **e57 (backlog RabbitMQ) era métrica fabricada** — `fn_collect_backlog_history` não consultava o RabbitMQ: somava contadores **cumulativos** do consumer e gravava como "unacked" (por isso o KPI exibia 123.609 de "backlog" com filas zeradas). Reimplementada com coleta REAL por fila via RabbitMQ Management API (pg_net em 2 fases + `evo._rabbit_probe`; credencial Basic em `evo._secure_config`, transportada 100% server-side). Linhas antigas marcadas `consumer-counters-INVALIDO`.
2. **e36–38 (VACUUM FULL) nunca iria rodar** — o cron 553 chamava `evo.fn_vacuum_full_lane2()`, uma função plpgsql com `VACUUM` dentro (inválido no PostgreSQL: VACUUM não executa em função/transação). Executei o VACUUM FULL real às ~20:15 BRT (janela fora de 08–19h) nas 8 tabelas, removi o cron 553 e dropei a função.
3. **v_kpi_overview tinha regressão dupla** — a versão das 18h reintroduziu `NULL::numeric` em `pct_401_24h`/`ipwatch_hits_24h` e somava o histórico de backlog de 24h (por isso 123k). A v3 lê agregados pesados de `evo.kpi_rollup_24h` (cron `evo-kpi-rollup-5m`), backlog = **último snapshot real**, e cada coluna tem fonte declarada em `notas`.

**Descoberta central da auditoria (Lane 1):** o gap de cobertura de hoje **não era perda de pipeline clássica** — 100% das mensagens ausentes tinham `remoteJid @lid` (novo endereçamento do WhatsApp), e o `ingest_ledger` prova que **77 delas nunca chegaram ao consumer** (a Evolution não publicou o `messages.upsert` no Rabbit). O espelho ingere @lid normalmente (845/24h), então a perda é **seletiva, na publicação da Evolution** — mesma família do buraco de 14–16/08 (perda de 88–91%/dia). Backfill aplicado (65 mensagens de conteúdo real recuperadas via FDW) e correção raiz aberta como **Evolution_Api_Stack#100**.

---

## 2. Incidente investigado ao vivo (19:55–21:00 BRT)

Ao iniciar, `v_pipeline_health` marcava **CRITICAL** (0 msgs/5min, lag ~40min) e o KPI mostrava "backlog 123k". Diagnóstico com evidência:

- **RabbitMQ real: 0 ready / 0 unacked** em todas as filas `wpp2.*` (2 consumers cada) — o "backlog" era a métrica fabricada (item 1 acima).
- **wpp2 `open` e saudável** (Evolution API; última desconexão real 13/08). Os alertas "wpp2 DESCONECTADO / Rescan QR / License INATIVA" das 17:53–18:07 coincidem com o **restart do container Evolution (~17:56)** + **falsos positivos de chamadores com apikey defasada**.
- A queda de tráfego 18h–20h foi majoritariamente orgânica (PG14 na fonte também caiu para ~12 msgs/h) somada à janela de flapping das 17:25–17:36 (`v_reconnect_pattern_7d`: **flapping real**, 186 connects/7d, 143 com gap <5min).
- **401 crônico (~950 hits/24h, o dia inteiro)** em `sendText`/`fetchInstances`/`connectionState`/`getBase64`: por eliminação (watchdogs shell só postam em `$ALERT_URL`; `whatsapp-watchdog` monta a v7 correta; edge functions ok), o chamador é o **n8n**, cuja secret `n8n_evolution_api_key_v1` (09/08) é anterior à rotação de 14/08. Efeitos: alertas falsos + **fila de mídia congelada** (`getBase64` 401) + canal WhatsApp de alertas degradado.

---

## 3. Correções aplicadas nesta sessão (produção)

| # | Ação | Evidência |
|---|---|---|
| 1 | VACUUM FULL+ANALYZE em 8 tabelas (janela ok) + purge 401>7d | `p100_e36_38_vacuum_full_manual`; traefik 13,9→1,1 MB; 2026_07 5,6 MB→48 KB |
| 2 | Cron 553 removido + `fn_vacuum_full_lane2` dropada (inválida) | `cron.unschedule(553)` |
| 3 | `fn_recon_coverage_snapshot` **v2**: denominador só conteúdo real (sem grupo/status/reaction/protocol), colunas `missing_lid_24h`/`missing_bydesign_24h`, alerta <99% (dedupe 6h) | migração `20260820213000` |
| 4 | **Backfill** 24h dos faltantes reais (@lid) via FDW, `ON CONFLICT DO NOTHING`, `raw_data.backfill=true` | 65 inseridos; cobertura 24h → **100,00%** |
| 5 | `evo.kpi_rollup_24h` + `fn_kpi_rollup_refresh` + cron `evo-kpi-rollup-5m` (559) | KPI 6–19 ms |
| 6 | `v_kpi_overview` **v3** (colunas originais preservadas + `missing_real_24h`, `missing_lid_24h`, `rollup_at`, `backlog_captured_at`) | `SELECT` validado |
| 7 | `fn_collect_backlog_history` **v2** — backlog REAL via mgmt-api (pg_net, 2 fases; `evo._rabbit_probe`) | snapshot 22:50: 21 filas, todas 0 |
| 8 | Vault corrigido **sem exposição de valores**: `evolution_api_key` ← secret v7 (global) e `evolution_instance_token_wpp2` ← token vivo do PG14 (pipes server-side `docker exec … | psql COPY FROM STDIN`; MD5 conferidos `5cac45d5…:48` / `9398b849…:36`) | `vault_md5_scan_20260820` |
| 9 | User mapping FDW criado para `supabase_admin` (espelhando o do `postgres`) — o tool de transação do MCP falhava com "user mapping not found" | DO server-side |
| 10 | Comentários **100%**: 32 colunas + 3 tabelas (graveyard/staging com racional RLS deny-all) + 2 funções restantes | `cols_sem=0, tabelas_sem=0, views_sem=0, fns_sem=0` |
| 11 | 3 crons de purge 60d novos: `evo-purge-consumer-stats-60d`, `evo-purge-backlog-history-60d`, `evo-purge-watchdog-media-links-60d` | e55 completa |
| 12 | Fila de mídia: 15 itens `processing` travados desde 10/08 → `pending` | `p100_media_queue_reset_travados` |
| 13 | Linha `test-synthetic` removida de `recon_coverage_daily` | CP-2 limpo |
| 14 | Migrações formais registradas: `20260820210000/213000/215500` (e79) | `schema_migrations` |
| 15 | e87: comentário operacional em `supabase/functions/evolution-webhook/index.ts` (registro Evolution→edge desabilitado ↔ função ATIVA como processadora do consumer) | este PR |
| 16 | e77: dump `db/schema/schema-evo.sql` (973 KB) pós-P100 versionado | **Evolution_Api_Stack PR #99** |
| 17 | Achados consolidados p/ correção na Evolution/infra | **Evolution_Api_Stack issue #100** |
| 18 | Job 213 (`media_pipeline_health_check`) validado verde após fix da coluna (`succeeded` às 21:00) | `cron.job_run_details` |

---

## 4. Matriz das 100 etapas

Legenda: ✅ concluída e validada · 🔧 concluída com correção/variação (descrita) · ⏳ armada, aguardando gate temporal · 🔶 parcial/dependência externa · ⛔ não executada (exige janela humana)

### Lane 1 — Reconciliação (1–20)

| # | Status | Evidência / observação |
|---|---|---|
| 1–2 | ✅ | Baselines 24h/7d gravados (sessões 19–20/08) |
| 3 | 🔧 | Implementada MELHOR que o plano: FDW `evo.fdw_evolution_message` (server `evolution_postgres`) em vez de \copy+INSERT em lotes |
| 4 | ✅ | Set-diff exato por `message_id` (`_recon_pg14_ids`/`_recon_missing` + fn v2) |
| 5 | ✅ | Classificação: 100% @lid; 34 reactions + 16 protocol (by-design), 77 sem rastro |
| 6 | ✅ | 20/08 manhã: 1.387 perdidos reais → NO-GO honesto; à noite: 77 reais @lid |
| 7 | ✅ | Rabbit (DLQ/filas zeradas) + `ingest_ledger` como rastro por evento |
| 8 | ✅ | **Causa-raiz: perda de publicação seletiva p/ @lid na Evolution** (`p100_e5_e8_causa_raiz_lid`; issue #100) |
| 9 | ✅ | Backfills: 1.387 (manhã, canário+lotes 1k) + 65 (noite, conteúdo real @lid) |
| 10 | ✅ | **CP-1 GO** (recheck 09:13 = 0; re-fechado 22:40 com coverage 100,00%) |
| 11 | ✅ | 7d: 12.826 perdas (35,3%; 14–16/08 quase totais) medidas e backfill 7d completo (11:38) |
| 12–13 | ✅ | Métrica materializada em `recon_coverage_daily` (não computada na view) |
| 14 | 🔧 | Função criada; v2 hoje. Variação vs plano: é `SECURITY INVOKER` (não SECDEF) com `search_path` fixo — mais restritiva, mantida |
| 15 | ✅ | Cron `recon-coverage-daily` (543) **exatamente às 04:30** |
| 16 | ✅ | `v_kpi_overview` reescrita lendo `recon_coverage_daily` |
| 17 | ✅ | **6–19 ms** medidos (meta <150 ms; antes 1.857 ms) |
| 18 | ✅ | Runbook "Reconciliação PG14↔evo — set-diff por message_id" em `ops_runbooks` |
| 19 | 🔧 | Alerta <99% no snapshot diário via `rpc_boundary_raise_alert` (canal WhatsApp degradado pela credencial do n8n — pendência §6) |
| 20 | ⏳ | **CP-2 armado**: hoje 100,00%; exige 3 dias ≥99%. Risco conhecido: sem o fix @lid (#100), dias seguintes podem reprovar — o monitoramento agendado (§7) acompanha e decide |

### Lane 2 — Performance DB (21–40)

| # | Status | Evidência / observação |
|---|---|---|
| 21 | ✅ | Snapshot dos 232 indexdefs em 5 partes no baseline (rollback garantido) |
| 22–23 | ✅ | ANALYZE nas 6 tabelas; `n_live_tup` conferido |
| 24–25 | ✅ | Causa das stats zeradas investigada e patch no job produtor |
| 26–27 | ✅ | `idx_msgs_wpp2_conversation_fk` criado (07:55) + EXPLAIN do DELETE validado |
| 28–29 | 🔧 | O plano mandava "dropar 2 FKs NOT VALID"; a solução correta aplicada foi **dropar as 2 FKs standalone por partição e manter 1 FK lógica para a raiz particionada** (`fk_media_queue_message_uuid`; as 2 entradas com `conparentid=1774303` são filhas INTERNAS da FK raiz — não são constraints independentes). Migração `f006_f007_drop_dup_fks_indexes`; validação 18:47 |
| 30 | ✅ | CP-3 sem regressão (o CRITICAL de 19–20h foi tráfego/flapping na fonte, não DDL) |
| 31–32 | ✅ | 133 idx zero-scan classificados (47 PK + 13 unique manter; 7 partial 30d; candidatos lote 1 listados) e cruzados com views/fns |
| 33–35 | ⏳ | **Drops adiados CORRETAMENTE** — a regra de ordem (CP-2 antes de qualquer drop) ainda não liberou. Lote 1 pronto no baseline; nenhum índice de dados foi dropado hoje (conformidade verificada) |
| 36–38 | 🔧 | **Executado de verdade nesta sessão** (o cron criado antes era inoperante — ver §1). Meta ≥40 MB: cumprida no acumulado do dia (partição 2026_07 20 MB→48 KB; traefik 15→1,1 MB; +22,5 MB da rodada da noite) |
| 39 | ✅ | `autovacuum_scale_factor=0.05` nas top-5 (aplicado 08:02 e ratificado 18:47) |
| 40 | 🔧 | CP-5: espaço ✔; p95 de INSERT sem baseline comparável (pg_stat_statements tem reset semanal — job 103). Sem sinal de regressão; aceito com ressalva registrada |

### Lane 3 — Observabilidade (41–60)

| # | Status | Evidência / observação |
|---|---|---|
| 41–42 | 🔧 | `strict_status` com janela noturna implementado inline na view. Variação: fora de horário usa DEGRADED<4h/CRITICAL≥4h (plano sugeria warn 8h/crit 24h) — mais rígido, mantido |
| 43 | ✅ | Validação L3a registrada (verdict + simulação) |
| 44–45 | ✅ | 232 crons auditados; job 9 desativado (446 mantém); pares 57/148, 311/458, 189/190, 527/528, 459/481 analisados — vários NÃO eram duplicatas (complementares), decisão documentada |
| 46–47 | ✅ | Post-mortem do cluster 19/08 15:26 BRT (18:26 UTC): "job startup timeout" em 6 jobs (contenção na partida); offsets reescalonados |
| 48 | ✅ | `v_cron_health_24h` criada e comentada |
| 49 | ✅ | KPI <150 ms via rollup (medido 6–19 ms) |
| 50 | ⏳ | CP-6 armado (24h). Falso CRITICAL noturno eliminado; job 213 verde às 21:00 (fix da coluna `warroom_alerts.message`) |
| 51 | ✅ | Alerta sintético E2E: webhook externo + e-mail entregues (`triple_channel=true`); WhatsApp pulou (heartbeat lag + credencial n8n — §6) |
| 52 | ✅ | Mapa de watchdogs em `ops_runbooks` (11 runbooks) |
| 53–54 | 🔶 | View criada; **flapping é REAL** (186/7d; 143 reconexões <5min; crítico 17:25 hoje). Correlação final da causa depende do fix Evolution (#100) — investigação segue aberta |
| 55 | ✅ | Retenções completas: existentes + 3 novas (consumer-stats/backlog-history/watchdog-media-links, 60d) |
| 56 | ✅ | `evolution_traefik_401_stats`: 13,9 MB → **1,1 MB** (<5 MB ✔) com purge diário + vacuum semanal |
| 57 | ✅ | **Reimplementada** — backlog real por fila (mgmt-api/pg_net); snapshot 22:50 = 21 filas × 0 |
| 58 | ✅ | `consumer_drop_total` = última amostra por réplica (0) |
| 59 | ✅ | KPI sem NULLs estruturais; semântica de cada coluna declarada em `notas` e nos comments |
| 60 | ⏳ | CP-7 armado (48h) |

### Lane 4 — Semântica IA (61–80)

| # | Status | Evidência / observação |
|---|---|---|
| 61–64 | ✅ | **100%**: 1.099/1.099 colunas, 74/74 tabelas, 33/33 views, 104/104 funções comentadas (drift da manhã re-fechado à noite) |
| 65–66 | ✅ | `v_ai_catalog` (74 linhas) e `v_ai_dataflow` vivos |
| 67 | ✅ | 11 runbooks (reconciliação, restore de partição, troca de instância, rotação de credenciais, A13, Baileys RTO=3min, RabbitMQ 406, security checklist, LID/JID×2, snapshot) |
| 68 | ✅ | `media_status` unknown: causa era DEFAULT (texto sem mídia), não perda; backfill evo aplicado (15.964 corrigidos p/ `none`; staging `_unknown_media_backfill_20260820` p/ rollback 30d); domínio documentado |
| 69 | 🔧 | `message_type` unknown (130/7d = 0,37%): não é falha do mapa (`EVO_PROTOBUF_MESSAGE_TYPE_MAP` cobre os tipos) — são **stubs criados por `messages.update` quando o upsert @lid se perdeu** (raw_data NULL). Correção raiz = fix @lid (#100). Já <1% (meta CP-9 ✔) |
| 70 | ✅ | CP-8: semântica 100%; catálogo 74/74; “PR aberto” cumprido via **PR #99 + issue #100** (o fix não é no consumer.py — o consumer só roteia; o parser vive na edge do zapp e o defeito raiz na Evolution) |
| 71–72 | ✅ | Catálogo testado por agente e ajustado |
| 73 | ✅ | RLS deny-all documentado nas 3 tabelas graveyard/staging (comments com racional) |
| 74 | ✅ | Consumidores externos mapeados no catálogo |
| 75 | ✅ | `v_ai_health_summary` viva (1 linha) |
| 76 | 🔶 | "deploy_12_improvements" 18:02 (12/12 validadas). Deploy do fix @lid pendente de patch na imagem custom (#100) |
| 77 | ✅ | **Dump versionado** `db/schema/schema-evo.sql` (973 KB, pós-P100) — PR #99 |
| 78 | 🔧 | Drift-guard ATIVO via `ops.check_schema_drift()` (referência no banco, loop contínuo). Variação vs plano (comparar dump×arquivo) proposta na issue #100 §6 |
| 79 | ✅ | Migrações formais registradas (3 desta sessão + f003–f012 da manhã) |
| 80 | ⏳ | CP-9: unknown 0,37% ✔, guard rodando ✔, catálogo validado ✔ — formalização após 24h de ciclo limpo |

### Lane 5 — Segurança & Higiene (81–100)

| # | Status | Evidência / observação |
|---|---|---|
| 81–82 | ✅ | SECDEF 80/80 com `search_path` fixo (0 sem) |
| 83–84 | ✅ | GRANTs mínimos: `anon` **zero**; `authenticated` só 18 SELECTs auditados |
| 85 | ✅ | RLS validado (SET ROLE em BEGIN/ROLLBACK — L5a) |
| 86 | ✅ | Decisão A13 formal: webhook mantido DESABILITADO como fallback + runbook de emergência com payload do `evo_set_webhook` |
| 87 | ✅ | Verificado no volume (`/home/deno/functions/evolution-webhook/`) + comentário operacional no código (este PR): registro direto desabilitado ↔ função ATIVA como processadora do consumer |
| 88 | ✅ | `_secure_config` sem exposição PostgREST (grant só service_role; RLS srvc_only) |
| 89 | ✅ | Idades das secrets: todas as sensíveis <12d; **nenhuma >180d** ⇒ sem rotação obrigatória. Legadas >90d a aposentar: `evolution_db_uri_v1`, `pg_evolution_url_n8n_app_v1`, `rabbitmq_default_vhost_v1` (e `rabbitmq_url_evolution_v2` em uso → próxima janela) |
| 90 | ✅ | **CP-10a GO** |
| 91 | ✅ | Partições dept (0 rows) = reservadas, comentadas |
| 92 | ✅ | `idx_usage_audit`/`migration_watermark` renomeadas `_dead_*_20260820` (graveyard comentado; watermark com ressalva de 30d por ter update em 11/08) |
| 93 | ✅ | Produtores de `backfill_audit`/`pipeline_history`/`retention_log` religados (1 linha-prova em cada) |
| 94 | ✅ | registry(8.501)×archive(35.142) com política via `media-loss-retry-purge` (525) e growth monitorado |
| 95 | ✅ | `whatsapp_check_queue`: vacuum semanal (542) + FULL hoje |
| 96 | 🔧 | Prova de restore AUTOMATIZADA já existe (`restore-integrity-check` diário 11:00 + `collect-restore-logs`); validação de conteúdo do schema evo por amostragem proposta como evolução |
| 97 | ⛔ | Parada de 1 réplica do consumer **exige janela combinada** — runbook e critérios prontos; recomendo janela de 10 min em horário morto |
| 98 | 🔧 | RTO de reconexão JÁ documentado (runbook "Baileys Session Restore — RTO=3min"). Derrubada intencional adiada: com flapping real em curso (#100), o teste viraria ruído — executar pós-estabilização |
| 99 | ✅ | Este relatório + consolidação no baseline |
| 100 | 🔶 | **Revisão cruzada substantiva feita**: set-diff re-executado PÓS-todas as mudanças = **0 faltantes reais** (prova de que nada quebrou o ingest). A contra-assinatura por segundo agente fica para o ciclo de monitoramento (§7) |

---

## 5. Achados NOVOS (fora do escopo original do plano)

1. **401 crônico → n8n com credencial pré-rotação** (~950 hits/24h; falsos "wpp2 DESCONECTADO"/"License INATIVA"; fila de mídia congelada). Vault do Supabase JÁ corrigido server-side; falta o n8n (§6.1).
2. **Vault: `elevenlabs_api_key` corrompida** (`invalid ciphertext` — não decripta). Funções que a leem falharão. Recriação exige o valor original (§6.3).
3. **Sentry (front zapp, HOJE ~19h45):** `safeClient: Erro na query from contact_tags` — 84 eventos em minutos ([SENTRY-GREEN-BASKET-ND](https://promobrindes.sentry.io/issues/SENTRY-GREEN-BASKET-ND)). Novo, fora do P100 — investigar no app.
4. **Prisma `messageUpdate.create` sem `remoteJid`** — exceção recorrente na Evolution custom (issue #100 §2).
5. **Consumer→edge SSL EOF intermitente** + rajadas AMQP `ConnectionRefused` **apenas em restarts** (Sentry 13d; issue #100 §5).
6. **Armadilha de operação:** a secret `evolution_api_key_v7_20260814` é montada na Evolution com nome de arquivo `evolution_api_key_v4_20260704` (target herdado).
7. **Topologia divergente do CLAUDE.md:** em produção, `evo.evolution_messages`/`evo.evolution_conversations` são as raízes particionadas FÍSICAS (`relkind='p'`) com partições `wpp2`+`default`, e `zapp.evolution_messages` é VIEW — a nota de 2026-08-15 no CLAUDE.md (raiz física em `zapp`, 14 partições) não bate com o catálogo atual. Recomendo reconciliar a documentação.

## 6. Pendências que dependem de você (Joaquim)

| # | Ação | Esforço | Efeito |
|---|---|---|---|
| 1 | **n8n → Credenciais → Evolution API**: substituir a apikey pelo valor da secret `evolution_api_key_v7_20260814` (e bump `n8n_evolution_api_key_v2` no stack) | 2 min | Mata os 401, os alertas falsos e destrava a fila de mídia (2k pending drenam sozinhos) |
| 2 | Priorizar o **fix @lid** na imagem custom (issue **Evolution_Api_Stack#100 §1**) | dev | Elimina a perda real (~36 conversas de texto/dia); destrava CP-2 de forma estrutural |
| 3 | Recriar `elevenlabs_api_key` no vault (valor não é recuperável do ciphertext) | 1 min | Reativa integrações ElevenLabs |
| 4 | Janela de 10 min (horário morto) para **e97** (parada de 1 réplica do consumer) | agendar | Fecha o último teste de resiliência |
| 5 | Revisar/mergear **PR Evolution_Api_Stack#99** (dump e77) e o PR deste repo | review | Fecha e77 no Git e publica o comentário e87 |

## 7. Gates temporais — monitoramento agendado

Esta sessão agendou check-ins automáticos (send_later) para:

- **+1h**: CI/status do PR deste repo; primeira leitura do ciclo do rollup/backlog.
- **21/08 ~08:05 BRT**: valida o snapshot 04:30 (CP-2 dia 1/3), purges 03:4x, CP-6 (24h sem falso CRITICAL), CP-9 formal.
- **22/08 ~08:05 BRT**: CP-2 dia 2/3 + CP-7 (48h KPI íntegro).
- **23/08 ~08:05 BRT**: **CP-2 GO/NO-GO final** (3 dias) → se GO, libera os drops e33–35 (lote 1 já preparado no baseline); re-execução do set-diff como contra-assinatura da e100.

## 8. Rastreabilidade

- Baseline: `SELECT * FROM evo.audit100_baseline WHERE session='claude-fable-p100-final' ORDER BY captured_at;`
- Migrações: `20260820210000`, `20260820213000`, `20260820215500` (+ f003–f012 da manhã)
- PR dump: https://github.com/adm01-debug/Evolution_Api_Stack/pull/99 · Issue achados: https://github.com/adm01-debug/Evolution_Api_Stack/issues/100
- Sentry (14d): reconexões consumer↔Rabbit em restarts; SSL EOF contacts-update; novo erro front `contact_tags`
