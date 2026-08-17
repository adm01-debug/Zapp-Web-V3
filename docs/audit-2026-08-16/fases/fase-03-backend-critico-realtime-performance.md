# FASE 3 — BACKEND CRÍTICO, REALTIME E PERFORMANCE

## Etapa 21 — Reativar Realtime de mensagens e conversas na publication

**Objetivo:** Fazer `evo.evolution_messages`/`evo.evolution_conversations` voltarem a emitir eventos na publication `supabase_realtime`, com gate de topologia, correção dos hooks e docs.

**Base:** findings-12:58 (37:351-358 — 14 relations na publication, mensagens/conversas fora em nenhum schema; A1 🔴 CRÍTICO); findings-07:94 (31:29-34, 150-161 — subscriptions nunca recebem INSERT/UPDATE); findings-12:130 (ERRATA 46-54 — GATE `relkind` obrigatório antes de agir).

### Subetapas
- [ ] 21.1 Rodar GATE `relkind` via `supabase_db_query` (`pg_class`+`pg_namespace`): evo raízes `p`/`r`, zapp views `v`; se divergir da ERRATA, abortar e revisar a errata (findings-12:130).
- [ ] 21.2 Listar relations atuais: `SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'` — registrar as 14 e confirmar ausência das 2 tabelas (37:351-358).
- [ ] 21.3 Adicionar as raízes `evo.evolution_messages` e `evo.evolution_conversations` (`ALTER PUBLICATION supabase_realtime ADD TABLE`); confirmar `pubviaroot=true` para partições herdarem (37:332) e testar evento em partição `_wpp2`; se o papel do MCP não for dono da publication, executar como `supabase_admin`.
- [ ] 21.4 Verificar RLS/grants: `authenticated` foi REVOKE em `evo.*` (findings-12:123, ERRATA 21-54) — garantir policy SELECT para o papel do browser, senão o evento chega mas é filtrado (zero entrega).
- [ ] 21.5 Conferir a subscription no front: canal com `schema:'evo'` + tabela/evento corretos (findings-12:123); corrigir qualquer ponto que aponte `schema:'zapp'` (premissa invertida, 31:29-34).
- [ ] 21.6 Prova E2E: INSERT de teste via `supabase_db_query` em `evo.evolution_messages` → evento observado no canal (console/WS) com o mesmo JWT do browser.
- [ ] 21.7 Corrigir `useZappConversations.test.tsx` (127L) que trava topologia obsoleta (exige `schema:'evo'` por asserção — 31:138-148): reescrever para a topologia vigente.
- [ ] 21.8 Corrigir hooks zappweb que leem a partição `_wpp2` direto (`from()` na partição, 30:196-197) → leitura pela raiz `evolution_messages` (ERRATA 204-205).
- [ ] 21.9 Interceptar docs contaminados (31- recomenda `schema:'zapp'` — quebraria Realtime; 32- A1; 36- A8 — findings-12:129) e corrigir CLAUDE.md (regra 4 invertida + 8 contagens, ERRATA 157-172).
- [ ] 21.10 Registrar a migração do `ALTER PUBLICATION` no repo e endurecer o guard INV-6 (não fail-open: drift de publication deve reprovar CI — findings-12:95, 38:328).

### Critério de conclusão (checklist da etapa)
- [ ] `evo.evolution_messages` e `evo.evolution_conversations` constam em `pg_publication_tables` (query salva como evidência)
- [ ] INSERT real gera evento no canal realtime (evidência de console/WS com JWT autenticado)
- [ ] `useZappConversations.test.tsx` verde com topologia vigente
- [ ] CLAUDE.md corrigido com contagens medidas (zapp 386 / evo 70 / ops 51)
- [ ] Migração versionada aplicada e INV-6 sem fail-open

## Etapa 22 — Consertar fila offline do PWA (ADR-005): tag e handler do SW

**Objetivo:** Fazer a fila offline realmente drenar: alinhar a tag de broadcast e implementar o handler `sendQueuedMessages()` no service worker.

**Base:** findings-22:117 (_CONSOLIDADO.md §4.1 — `offlineQueue.ts:137` registra `send-queued-messages`; `sw.js:149` escuta `send-messages`; handler `sendQueuedMessages()` em `sw.js:152` é `console.log` vazio; feature aparenta existir e não faz nada).

### Subetapas
- [ ] 22.1 Ler `offlineQueue.ts` e `sw.js` no repo; mapear o fluxo enfileirar → broadcast → drenar (eventos `online`/message).
- [ ] 22.2 Padronizar a tag: contrato único (ex.: `send-messages`) em `offlineQueue.ts:137` e `sw.js:149` — ou inverter, com decisão registrada.
- [ ] 22.3 Implementar `sendQueuedMessages()` em `sw.js:152`: ler fila persistida (IndexedDB), reenviar via Supabase/EF, atualizar status por item.
- [ ] 22.4 Garantir persistência da fila no IndexedDB (TTL + limite de itens) — sobreviver a kill do service worker.
- [ ] 22.5 Reuso de `idempotency_key` (`msg:<id>`) no reenvio — evitar duplicata via `evolution_send_idempotency` (findings-03:33).
- [ ] 22.6 Falhas: retry com backoff (maxRetries=3) e status terminal `abandoned` para o canal `failed_messages` (findings-03:56).
- [ ] 22.7 Sinalizar na UI mensagens pendentes offline e disparar a drenagem ao religar (evento `online`).
- [ ] 22.8 Testes: handler do SW (drenagem) + teste do broadcast com a tag correta.
- [ ] 22.9 E2E real: enviar mensagem com rede offline → religar → mensagem entregue e visível no inbox, sem duplicata.
- [ ] 22.10 Atualizar ADR-005 com estado pós-fix (feature funcional, limitações conhecidas).

### Critério de conclusão (checklist da etapa)
- [ ] Tag única alinhada (offlineQueue ↔ sw.js) e handler sem `console.log` vazio
- [ ] E2E offline→online entregou a mensagem no WhatsApp (evidência no inbox)
- [ ] 1 envio por item (idempotency validado)
- [ ] ADR-005 atualizado com evidência

## Etapa 23 — Unificar dual-path de mensagens (zapp.messages × evo.evolution_messages)

**Objetivo:** Definir fonte canônica de mensagens do inbox e eliminar o risco de inconsistência do caminho duplo, com fallback documentado.

**Base:** findings-03:234 (06:688-691 — dual-path sem mecanismo de migração/fallback documentado; `useMessages` PARCIAL, 06:627); findings-07:108-109 (31:171-176 — `isArchived` sempre false, ramo morto; 31:179-185 — ramo PTT por comparação literal em vez de `extractMessageType`).

### Subetapas
- [ ] 23.1 Mapa de escritas/leituras: grep por `.from('messages')` e `evolution_messages` (useMessages, useRealtimeMessages, useConversationMessagesData, insertAuxMessage…).
- [ ] 23.2 Definir fonte canônica de leitura do inbox: `evo.evolution_messages` cursor-based via `rpc_list_messages_lite` (findings-03:43) e registrar contrato.
- [ ] 23.3 Migrar leituras legadas (messageRepository/`useMessages`) para o caminho canônico com fallback documentado.
- [ ] 23.4 Decidir destino de escritas auxiliares (`insertAuxMessage`: UUID → `zapp.messages`; JID → skip hoje — findings-03:166) e implementar de forma consistente.
- [ ] 23.5 Deprecar `useMessages` (LEGADO) com aviso no código e remoção agendada.
- [ ] 23.6 Corrigir `evolutionAdapter`: `isArchived` sempre false (ramo morto) e ramo PTT via `extractMessageType` (findings-07:108-109).
- [ ] 23.7 Remover cópia inline de `shouldUpdateStatus`/`STATUS_PRIORITY` → importar de `evolution-helpers.ts` (pendencias-consolidadas.md:461).
- [ ] 23.8 Testes de contrato do adapter: 61 casos existentes + novos (isArchived/PTT) (findings-07:106).
- [ ] 23.9 Telemetria de divergência: amostra periódica contando mensagens por fonte (zapp vs evo) em produção.
- [ ] 23.10 Documentar arquitetura de dados de mensagens (data-flow) e atualizar docs de estado 06/07.

### Critério de conclusão (checklist da etapa)
- [ ] Fonte canônica definida e leituras legadas migradas (0 leituras `zapp.messages` no caminho do inbox)
- [ ] `isArchived`/PTT corrigidos com testes verdes
- [ ] Divergência medida ≈ 0 em produção (evidência de amostra)
- [ ] Doc de arquitetura de mensagens atualizado

## Etapa 24 — Corrigir edge functions críticas (templates 401, health-check, imap-bridge)

**Objetivo:** Fazer `evolution-templates` responder ao chamador real, `connection-health-check` usar o gateway e encerrar o STUB do `email-imap-bridge`.

**Base:** findings-12:36-37 (36:330-332 — A1: `connection-health-check` com 2 fetch diretos `:40`/`:151` + `requireEnv('EVOLUTION_API_URL')` `:193` fora do gateway; A2: `email-imap-bridge` STUB declarado, 36:284-294; A3: `evolution-templates` 401 em 100% via `requireServiceRoleOrCron()`, 36:303-309).

### Subetapas
- [ ] 24.1 `evolution-templates`: substituir `requireServiceRoleOrCron()` por auth compatível com o chamador browser (ou rotear a chamada server-side) — 36:303-309.
- [ ] 24.2 `evolution-templates`: corrigir `syncFromEvolution` (falha silenciosa) e validar CRUD/envio via invoke autenticado.
- [ ] 24.3 `connection-health-check`: trocar os 2 fetch diretos (`:40`, `:151`) por `_shared/providers/evolution/client.ts` (gateway).
- [ ] 24.4 `connection-health-check`: substituir `requireEnv('EVOLUTION_API_URL')` (`:193`) por resolução via vault/gateway (sem URL hardcoded).
- [x] 24.5 `email-imap-bridge`: decisão registrada (2026-08-17, wt-g5) — IMAP/SMTP real é INVIÁVEL em Edge Function (HTTP-only, sem TCP); caminho VIÁVEL construído: `zapp-email-inbound-webhook` (webhook Resend → zapp.emails) + `zapp-email-send` (Resend API + storage) + migration zapp.emails RLS. TODO EMAIL-02 removido do docblock com justificativa.
- [x] 24.6 Decisão executada: contrato honesto no `email-imap-bridge` (docblock corrigido, só ações reais; fetchInbox/sendMessage rejeitadas no contrato) + edges viáveis `zapp-email-*` registradas (contract-schemas/edge-contract-schemas/contract-versions).
- [ ] 24.7 Deploy das funções (deploy-edge.sh / supabase) + smoke `edge-auth-smoke` (invoke com JWT) (findings-12:79).
- [ ] 24.8 Atualizar ESTADO.md e CLAUDE.md (status/contagem das 3 funções).
- [ ] 24.9 Testes de contrato Zod (`parseOrReject`) para as 3 funções (edge-function-contract-tests).
- [ ] 24.10 Verificação em produção: invoke browser → 200; health-check 100% via gateway; imap-bridge sem anúncio falso.

### Critério de conclusão (checklist da etapa)
- [ ] `evolution-templates` 200 para o chamador real (browser/cron) com envio validado
- [ ] `connection-health-check` sem fetch direto à Evolution (gateway 100%)
- [x] `email-imap-bridge`: contrato honesto (sem STUB/anúncio falso em produção) + caminho viável `zapp-email-*` construído (2026-08-17, wt-g5)
- [ ] Smoke + contrato Zod verdes em produção

## Etapa 25 — Eliminar bypasses do gateway Evolution e fechar gate I8

**Objetivo:** Zerar fetch direto à Evolution API a partir de edge functions e React, com gate I8 varrendo também código Deno.

**Base:** findings-22:118 (_CONSOLIDADO.md §8.2/§9 — 3 bypasses reais, 2 enviam WhatsApp: `evolution-templates` `:53`/`:81`, `evolution-notification-dispatcher` `:257`/`:270`, +2 parciais; gate I8 varre pg_proc e é cego a edge functions Deno); pendencias-consolidadas.md:548 (5 `invoke('evolution-*')` direto do React fora do adapter).

### Subetapas
- [ ] 25.1 Inventário completo: grep em `supabase/functions` por fetch direto (EVOLUTION_API_URL, evolution.atomicabr.com.br, `fn_get_vault_secret` + fetch).
- [ ] 25.2 Migrar o bypass do `evolution-templates` (`:53` vault + `:81` sendText) para o gateway client.
- [ ] 25.3 Migrar `evolution-notification-dispatcher` (`:257`/`:270`) para o gateway client.
- [ ] 25.4 Migrar os 2 bypasses parciais listados no _CONSOLIDADO §8.2.
- [ ] 25.5 Reimplementar gate I8: varredura de edge functions Deno (não só `pg_proc`) — gate bloqueante no CI.
- [ ] 25.6 Migrar os 5 `invoke('evolution-*')` direto do React para o adapter/wrapper (pendencias-consolidadas.md:548).
- [ ] 25.7 Garantir `fn_get_vault_secret` acessível apenas server-side (nenhum path chamável por browser).
- [ ] 25.8 Testes de regressão: envio WhatsApp real (sendText/sendAudio) via gateway.
- [ ] 25.9 Rodar o gate novo: 0 violações (fetch direto) em `supabase/functions` e `src`.
- [ ] 25.10 Documentar decisão de arquitetura e atualizar ADR/gate I8 (cobertura Deno).

### Critério de conclusão (checklist da etapa)
- [ ] 0 fetch diretos à Evolution em `supabase/functions` e `src` (gate verde)
- [ ] Envios WhatsApp passam 100% pelo gateway (evidência de log)
- [ ] 5 `invoke` direto do React migrados para o adapter
- [ ] Vault secrets inacessíveis a código browser-side

## Etapa 26 — Corrigir crons quebrados e declarar jobs no repo

**Objetivo:** Zerar as falhas dos 5 jobs (27, 206, 334, 311, 84), declarar os jobs corrigidos no repo e ampliar retenção de `job_run_details`.

**Base:** findings-12:63-65 (37:372-384 — A5: job 27 `whatsapp_reconcile_dispatch` 91 falhas/701 execs (13%) por `job startup timeout`; A6: jobs 206/334/311 com bug SQL determinístico; A7: job 84 erro base64 no `vault.decrypted_secrets`); findings-12:62 (37:390-392 — 207 crons vivos sem declaração); findings-12:69 (37:402-404 — retenção `job_run_details` ~2,4 dias).

### Subetapas
- [ ] 26.1 Coletar estado dos 5 jobs via `supabase_db_query` (`cron.job` + `cron.job_run_details` 7d) — mensagens de erro atuais.
- [ ] 26.2 Job 27: mitigar `job startup timeout` (simplificar launcher/janela/backoff) e revalidar função ambígua + estado `connecting` (pendencias-consolidadas.md:877).
- [ ] 26.3 Job 206: corrigir referência `evo.evolution_audit_log does not exist` (nome real da tabela de auditoria).
- [ ] 26.4 Job 334: corrigir `missing FROM-clause entry for table "ec"` (falhou 16/08 11:52Z).
- [ ] 26.5 Job 311: corrigir escrita em coluna gerada `resolved`.
- [ ] 26.6 Job 84: corrigir `invalid symbol "\" found while decoding base64` no `vault.decrypted_secrets('evolution_api_key')` (reescrever secret válido no vault).
- [ ] 26.7 Declarar os jobs corrigidos no repo (migration com `cron.schedule` idempotente) — reduzir os 207 sem declaração.
- [ ] 26.8 Aumentar retenção de `cron.job_run_details` para ≥7 dias (investigação >3 dias inviável).
- [ ] 26.9 Validar 7 dias: 0 falhas nos 5 jobs (ou <1%) com evidência de `job_run_details`.
- [ ] 26.10 Atualizar CRON-MATRIX.md (inclui D-1: job 161 `evo-wpp2-401-disconnect-feed` sem espelho — findings-22:145).

### Critério de conclusão (checklist da etapa)
- [ ] 5 jobs sem falha nos últimos 7 dias (evidência SQL anexada)
- [ ] Retenção `job_run_details` ≥ 7 dias
- [ ] Jobs corrigidos declarados em migration aplicada
- [ ] CRON-MATRIX atualizado

## Etapa 27 — Tornar schema_migrations um ledger confiável e versionar RPCs órfãs (absorve: RPCs de email sem migration)

**Objetivo:** Reconciliar as 648 aplicadas × 325 arquivos (387 sem arquivo / 64 sem aplicação) e garantir que o repo reconstrua produção.

**Base:** findings-12:60-61 (37:364-366 — 387 aplicadas sem arquivo, 64 arquivos sem aplicação, ledger não confiável; 37:368-370 — `20260815035000_decouple_ops_pgnet_wrappers` nunca aplicada, `ops.pg_net_get`/`pg_net_post` ausentes); findings-22:146 (MIGRATIONS-DRIFT — 62 migrations recentes pendentes de commit).

### Subetapas
- [ ] 27.1 Exportar `schema_migrations` completo via `supabase_db_query` (648 registros) e salvar artefato.
- [ ] 27.2 Classificar as 387 sem arquivo: 160 rótulos alfanuméricos (MCP), 88 squash, 139 numéricas — agrupar por origem (37:153-196).
- [ ] 27.3 Mapear os 64 arquivos sem aplicação (33 da onda 15/08 fora de banda + demais) e verificar se o efeito já está presente no banco.
- [ ] 27.4 Resolver `20260815035000_decouple_ops_pgnet_wrappers`: aplicar (criar `ops.pg_net_get`/`pg_net_post`) ou registrar com efeito verificado.
- [ ] 27.5 Commitar as 62 migrations pendentes no repo (MIGRATIONS-DRIFT :8-12).
- [ ] 27.6 Criar migration de reconciliação (baseline declarativo) registrando as aplicadas sem arquivo — sem reaplicar DDL.
- [ ] 27.7 Validar paridade: query de diff — 0 aplicadas sem arquivo e 0 arquivos sem aplicação.
- [ ] 27.8 Reforçar gates CI (migration-uniqueness/schema-drift) para reprovar novo desalinhamento (findings-12:79).
- [ ] 27.9 Atualizar MIGRATIONS-DRIFT.md com o novo estado.
- [ ] 27.10 Dry-run de reconstrução de schema a partir do repo (staging) para provar ledger confiável.

### Critério de conclusão (checklist da etapa)
- [ ] 0 aplicadas sem arquivo / 0 arquivos sem aplicação (query de diff anexada)
- [ ] `20260815035000` resolvida (aplicada ou registrada com efeito verificado)
- [ ] 62 migrations commitadas
- [ ] Gates CI reprovam em drift (testado com fixture/PR proposital)

## Etapa 28 — Corrigir telemetria do consumer (INSERT em relação inexistente)

**Objetivo:** Parar a perda de telemetria do consumer do evolution-stack corrigindo o INSERT em relação inexistente (`consumer.py:239`) e validar o pipeline de ingestão.

**Base:** pendencias-consolidadas.md:547 (consumer.py:239 — INSERT em relação inexistente, telemetria perdida; E89: consumer sem `PG_EVOLUTION_URL`/dual-write); pendencias-consolidadas.md:930 (bug bilateral consumer-stats 404, POST ~30s acumulando); pendencias-consolidadas.md:934 (drift digest runtime `9b1a5b967` × stack `0f4b07cfb`).

### Subetapas
- [ ] 28.1 Localizar `consumer.py:239` no evolution-stack (repo/container via `portainer_exec_container`) e identificar a relação-alvo inexistente.
- [ ] 28.2 Confirmar topologia real da tabela via `supabase_db_query` (zapp/evo pós-move 11:50Z) e corrigir o INSERT (schema + colunas).
- [ ] 28.3 Validar `PG_EVOLUTION_URL` no serviço consumer (env) — sem ela o dual-write E89 não funciona.
- [ ] 28.4 Implementar/validar dual-write (E89) para a telemetria nos destinos corretos.
- [ ] 28.5 Deploy do consumer corrigido no evolution-stack (stack 126) via Portainer.
- [ ] 28.6 Corrigir o bug bilateral consumer-stats 404 (POST ~30s acumulando 404) (pendencias-consolidadas.md:930).
- [ ] 28.7 Verificar telemetria: contagem de linhas na tabela-alvo antes/depois (janela 15min) — evidência SQL.
- [ ] 28.8 Alinhar digest runtime × stack (`9b1a5b967` × `0f4b07cfb`) e labels OCI 2.3.7 vs 2.4.0 (pendencias-consolidadas.md:934).
- [ ] 28.9 Testes do consumer (código + testes no PR do evolution-stack — E89).
- [ ] 28.10 Validar runbook PAUSE_INGEST contra a topologia atual (relkind) e corrigir referências antes do primeiro uso (pendencias-consolidadas.md:874).

### Critério de conclusão (checklist da etapa)
- [ ] 0 erro de INSERT no log do consumer (relação existe)
- [ ] Telemetria crescendo no banco após deploy (2 amostras SQL com 15min de intervalo)
- [ ] consumer-stats sem 404 no log
- [ ] Digest runtime = stack (imagem alinhada)

## Etapa 29 — Eliminar dependência reversa evo→zapp (fn_normalize_send_jid 13×)

**Objetivo:** Zerar chamadas de funções `evo` para funções `zapp` (`fn_normalize_send_jid` 13×, `is_admin_or_supervisor` 6×) formalizando o contrato no BOUNDARY.

**Base:** pendencias-consolidadas.md:936 (findings-16:9 — dependência reversa evo→zapp: `fn_normalize_send_jid` 13×, `is_admin_or_supervisor` 6×; formalizar contrato no BOUNDARY); pendencias-consolidadas.md:757 (E97 — boundary-audit como gate bloqueante nos dois repos).

### Subetapas
- [ ] 29.1 Inventariar referências via `supabase_db_query`: `pg_proc` em `evo` com `prosrc LIKE '%fn_normalize_send_jid%'` (13×) e `%is_admin_or_supervisor%` (6×).
- [ ] 29.2 Listar as funções em `zapp` (SECDEF? search_path? grants) — contrato atual das funções dependidas.
- [ ] 29.3 Decidir contrato: espelhar em schema neutro (ex.: `ops`/`_shared`) ou criar wrappers locais em `evo`; registrar dono no BOUNDARY.
- [ ] 29.4 Implementar a mudança sem alterar comportamento (mesmos search_path/security).
- [ ] 29.5 Validar search_path/RLS pós-mudança: chamadas passam a ser intra-schema.
- [ ] 29.6 Testes de contrato das funções compartilhadas (mesmos casos em ambos os schemas).
- [ ] 29.7 Ativar gate boundary-audit bloqueante nos dois repos (E97) (pendencias-consolidadas.md:757).
- [ ] 29.8 Rodar boundary-audit: 0 violações evo→zapp.
- [ ] 29.9 Atualizar BOUNDARY/ADR (dono das funções compartilhadas).
- [ ] 29.10 Verificar em produção: reconciliação (cron job 27) e envios seguem OK por 7 dias.

### Critério de conclusão (checklist da etapa)
- [ ] 0 referências evo→zapp (query `pg_proc` anexada)
- [ ] Gate boundary-audit verde nos dois repos
- [ ] 7 dias sem regressão na reconciliação/envios
- [ ] BOUNDARY atualizado com dono das funções

## Etapa 30 — Performance do banco vivo: índices, N+1, slow queries e bloat
**Objetivo:** Eliminar as lacunas de performance medidas (webhook_events_processed 369MB sem retenção eficiente, 13 índices candidatos parados, queries lentas sem gate).
**Base:** INDICES_CLEANUP_PROPOSTA (13 índices aguardando revisão sênior) · query_telemetry/slow queries · bloat de tabelas quentes · N+1 no front.
### Subetapas
- [ ] 30.1 Revisar a INDICES_CLEANUP_PROPOSTA com sênior: validar os 13 candidatos com EXPLAIN em produção (nunca dropar PK/UNIQUE/FK).
- [ ] 30.2 Criar migration versionada para os índices aprovados (CREATE INDEX IF NOT EXISTS, sem lock agressivo — usar CONCURRENTLY onde aplicável).
- [ ] 30.3 Auditar N+1 no frontend: mapear loops de .single()/.select() em map (grep `for.*await.*select`) e substituir por queries em lote (in/eq).
- [ ] 30.4 Habilitar/verificar o monitor de slow queries (fn_monitor_slow_queries + query_telemetry) e definir log_min_duration_statement.
- [ ] 30.5 Executar retenção no webhook_events_processed (369MB): política de arquivamento via fn_cleanup_webhook_events_v2 + particionamento/archive.
- [ ] 30.6 Verificar autovacuum das tabelas quentes (evolution_messages, webhook_*, app_notifications) com fn_force_autovacuum e ajustar thresholds.
- [ ] 30.7 Substituir materialized views defasadas por refresh incremental ou cache com TTL (dashboards KPIs).
- [ ] 30.8 Auditar RPCs >3s (supabase_client_performance): adicionar índices de suporte ou cache.
- [ ] 30.9 Criar cron de análise semanal de bloat/index usage (fn_optimization_recommendations) com alerta.
- [ ] 30.10 Medir antes/depois: latência p95 dos RPCs e tamanho do banco (evidência no PR).
### Critério de conclusão (checklist da etapa)
- [ ] Índices aprovados criados e EXPLAIN confirma uso (idx_scan > 0 em 7 dias)
- [ ] N+1 eliminados nos caminhos mapeados (0 ocorrências no grep)
- [ ] Retenção aplicada: webhook_events_processed estabilizado (< X% crescimento semanal)
- [ ] Latência p95 dos RPCs principais medida e melhorada
- [ ] Cron de análise semanal ativo no pg_cron


---
