# FASE 9 — DESACOPLAMENTO EVO×ZAPP

## Etapa 81 — Implementar client cloud (C1): 12 verbos + registry fail-closed
**Objetivo:** Entregar `providers/cloud/client.ts` (12 verbos, Bearer, retry/backoff) roteado pelo registry e migrar as edges para `getProviderClient()`, fechando a porta P2.
**Base:** pendência real findings-14.md §10 C1 (L134); findings-14.md §2 P2 (L30-31); findings-14.md §4 COVERAGE_V4 (L60-61).
### Subetapas
- [ ] 81.1 Reconciliar worktree × CLOUD_CLIENT.md: confirmar presença/conteúdo atual de `providers/cloud/client.ts` (12 verbos, Bearer, retry/backoff) e atualizar o doc para a realidade medida (nunca presumir ausência sem verificar)
- [ ] 81.2 Garantir `case 'cloud'` no registry com guard fail-closed: sem `WHATSAPP_CLOUD_PHONE_ID`/`WHATSAPP_CLOUD_TOKEN` → throw; nunca retorna undefined (registry.ts L58 e defesa no construtor)
- [ ] 81.3 Manter paridade fake (C2, já FEITO): fake com 12 verbos incl. `getProfilePicture`, sem `sendAudio`; `registry.test.ts` cobre os 3 providers com `PROVIDER_UNDER_TEST` (guard `DENO_ENV=test`)
- [ ] 81.4 Migrar as 10+ edges que importam `evolutionClient`/`getBaseUrl` direto para `getProviderClient()` (SUBSTITUABILITY P2-c/D2)
- [ ] 81.5 Fechar os 33 gaps do COVERAGE_V4: verbo no contrato Zod + implementação no `evolutionClient` e no `fakeProvider` + roteamento da action por ele
- [ ] 81.6 Trocar `proxyToEvolution` pelo `evolutionClient` + validação Zod nas actions cobertas (hoje cobertura efetiva de roteamento 0/41 = 0%)
- [ ] 81.7 Porta P1: completar `sendInteractive` (hoje zod 400) e `sendPtv` (FormData) em modo cloud
- [ ] 81.8 Rodar harness 67/67 + suíte registry/contract no CI (verb-contract 12/12, contract-coverage ≥90% com gate)
- [ ] 81.9 Exigir teste de contrato Zod em PRs de resolvers/gateway (D10 do SCORECARD_V4) — gate de review, não só CI
- [ ] 81.10 Atualizar SUBSTITUABILITY_MATRIX_V4 e COVERAGE_V4 com cobertura efetiva medida (roteamento >0% e % de contrato fechada)
### Critério de conclusão (checklist da etapa)
- [ ] verb-contract 12/12 verde no CI e cobertura efetiva de roteamento >0% com evidência
- [ ] nenhuma edge de produção importa `evolutionClient`/`getBaseUrl` direto (inventory TOTAL=0)
- [ ] harness 67/67 verde e registry.test.ts com os 3 providers
- [ ] COVERAGE_V4 e SUBSTITUABILITY_MATRIX_V4 atualizados com os números medidos

## Etapa 82 — Corrigir normalizer cloud (C3/C4/C5) + espelhos do ADR-008
**Objetivo:** Eliminar os 3 bugs do `whatsapp-cloud-normalizer.ts` (content vazio audio/sticker, epoch 1970, JID duplo) com testes de regressão e sincronizar os espelhos TS×Deno do contrato canônico.
**Base:** pendência real findings-14.md §10 C3/C4/C5 (L135); findings-13.md item 17 ADR-008 (L125); findings-15.md §10 (L83-84).
### Subetapas
- [ ] 82.1 Reconciliar estado atual do `whatsapp-cloud-normalizer.ts` vs os bugs C3/C4/C5 (fixes podem já existir no worktree — confirmar por teste, não por leitura)
- [ ] 82.2 Fix C3: content vazio para áudio/sticker — garantir `caption`/`filename`/fallback correto nos tipos media
- [ ] 82.3 Fix C4: timestamp nunca 1970 — `parseInt` com fallback "now", ISO com `Date.parse`, ms >1e12 → /1000
- [ ] 82.4 Fix C5: JID duplo sem sanitizar — normalizar `remoteJid`/`from`/`to` com dedupe e trim simétrico
- [ ] 82.5 Adicionar testes de regressão dos 3 casos em `__tests__/whatsapp-cloud-normalizer.test.ts` (vermelho antes do fix, verde depois)
- [ ] 82.6 Rodar harness 67/67 + suíte do normalizer local e no CI (Deno)
- [ ] 82.7 Sincronizar espelho Deno do ADR-008: `CanonicalMessage`/`'queued'` (Deno) × `ChannelMessage`/`'pending'` (TS) — revisar sync E45 (L104-112)
- [ ] 82.8 Alinhar normalizadores assimétricos E47/E48: E48 Meta produz pré-canônico sem `account`/`direction` — completar campos
- [ ] 82.9 Resolver drift `DeliveryStatus` TS `'pending'` × Deno `'queued'` com teste de contrato que falhe em divergência (CANONICAL_COLUMN_MAP L130-132)
- [ ] 82.10 Registrar decisão de contrato: ~55 colunas sem correspondente canônico → `metadata` (lista nominal no CANONICAL_COLUMN_MAP, sem alterar schema)
### Critério de conclusão (checklist da etapa)
- [ ] 3 fixes C3/C4/C5 com teste de regressão verde (e vermelho comprovado antes)
- [ ] espelhos TS×Deno sem drift — teste de contrato passa e gate não regride
- [ ] harness 67/67 verde; CANONICAL_COLUMN_MAP atualizado (drifts fechados)

## Etapa 83 — Handler webhook v2 (C6) e ativação cloud [APROVAÇÃO]
**Objetivo:** Migrar `whatsapp-cloud-webhook/index.ts` para handler v2 + normalizer (statuses persistidos, não só logados) e ligar o cloud com os 4 blocos do checklist (env/secrets + webhook Meta + código + flip/rollback).
**Base:** pendência real findings-14.md §10 C6 (L136) e checklist ligar cloud (L138); findings-14.md §2 P3 (L32).
### Subetapas
- [ ] 83.1 [APROVAÇÃO] Obter credenciais Meta de produção (`WHATSAPP_CLOUD_PHONE_ID`/`WHATSAPP_CLOUD_TOKEN`) + conta WABA produção + template aprovado (janela 24h) — bloqueia todo o restante da etapa
- [ ] 83.2 Reconciliar `whatsapp-cloud-webhook/index.ts` vs C6: handler v2 + normalizer, statuses ACK persistidos (sent/delivered/read/failed) e idempotência por `message.id`; registrar evidência se já migrado
- [ ] 83.3 Provisionar secrets vault WHATSAPP_CLOUD_* (4) e documentar cadeia vault×swarm×env (VAULT_SECRETS_V4 pendência §5 item 3)
- [ ] 83.4 Configurar webhook Meta com `messages`+`statuses` apontando para a edge (verificação de assinatura/HMAC habilitada)
- [ ] 83.5 Implementar `mode.ts` + resolvers cloud `ops.fn_cloud_*` + regenerar fixture `sql_report_snapshot.json`
- [ ] 83.6 Criar script flip/rollback (evolution→cloud / cloud→evolution) + baseline recalculado com digests
- [ ] 83.7 Ativação real do webhook Meta + congelamento da ingestão Evolution (P3) na janela combinada com a Etapa 84
- [ ] 83.8 Validação dedupe no overlap dual: mesma mensagem via 2 portas não gera duplicata em `zapp.evolution_messages`
- [ ] 83.9 Registrar procedimento e tempos no RUNBOOK_TROCA_PROVIDER (seção cloud)
- [ ] 83.10 Verificação final: webhook v2 processa `messages`+`statuses` com asserts; statuses não ficam apenas logados; 0 erros no console da edge
### Critério de conclusão (checklist da etapa)
- [ ] credenciais Meta provisionadas e webhook ativo com `messages`+`statuses`
- [ ] handler v2 em produção com persistência de status validada por evidência de runtime
- [ ] secrets no vault com cadeia documentada; flip/rollback testado em ensaio
- [ ] dedupe no overlap dual sem duplicatas (0 na validação)

## Etapa 84 — Executar ensaio REAL evolution→cloud (E92) [APROVAÇÃO]
**Objetivo:** Executar a troca real de provider com tempos medidos, critérios de abort e rollback por identidade de objeto, tornando I9 PASS.
**Base:** pendência real findings-13.md item 1 E92 (L109); findings-16.md §3 item 1 (L40); findings-15.md §7 I9 (L66).
### Subetapas
- [ ] 84.1 [APROVAÇÃO] Aprovar janela do ensaio real (data/hora, participantes, escopo P2/P4, rollback e critérios de abort) — aguarda credenciais Meta da Etapa 83
- [ ] 84.2 Pré-checks do RUNBOOK_TROCA_PROVIDER (L.86/L.107): credenciais, baseline, digests, DLQ=0, pipeline vivo (3 serviços healthy)
- [ ] 84.3 Executar flip evolution→cloud nas portas P2 (edge gateway) e P4 (SQL resolvers) com telemetria ativa (egress log E86)
- [ ] 84.4 Medir tempos de resposta e comparar com E91 (fake 12/12, 46ms) — registrar em ENSAIO_TROCA_PROVIDER_MEDIDO
- [ ] 84.5 Validar I9 = PASS no `ops.fn_boundary_audit()` e atualizar BOUNDARY_SCORE_T1
- [ ] 84.6 Executar rollback por identidade de objeto (E94) e validar estado pós-rollback (digests iguais ao baseline)
- [ ] 84.7 Verificar critérios de abort do BASELINE: erro envio >1%, DLQ>0 novas/10min, latência p95 webhook >2×, críticos >0
- [ ] 84.8 Registrar ensaio no VALIDACAO_V4.md com evidências (timestamps, métricas, screenshots/logs)
- [ ] 84.9 Reavaliar `v237Fallbacks`/`contract.zod` (assumem 2.3.x) vs prod 2.4.0 e decidir manutenção pós-ensaio
- [ ] 84.10 Verificação: relatório final do ensaio com tempos, dados, rollback e placar I9 anexado aos artefatos decouple
### Critério de conclusão (checklist da etapa)
- [ ] ensaio real executado com relatório de evidências (tempos + dados + logs)
- [ ] I9 = PASS no BOUNDARY_SCORE (placar 7/9+ ou 9/9 conforme formalização I6/I7)
- [ ] rollback validado e estado idêntico ao baseline (critérios de abort respeitados)

## Etapa 85 — Consumer dual-write (E89) e saúde do evolution-stack
**Objetivo:** Entregar o PR do consumer sem `PG_EVOLUTION_URL`/dual-write no evolution-stack, corrigir telemetria perdida e drift de artefatos (digest/OCI), e sanear o runbook PAUSE_INGEST.
**Base:** pendência real findings-13.md item 2 E89 (L110); findings-15.md F4 consumer.py:239 (L124); findings-16.md §3 itens 3/7 (L42, L46-47); findings-14.md §9 PAUSE_INGEST (L124).
### Subetapas
- [ ] 85.1 Abrir PR no evolution-stack: consumer sem `PG_EVOLUTION_URL` / dual-write (código + testes), conforme E89 (CHECKLIST L27)
- [ ] 85.2 Corrigir `consumer.py:239`: INSERT em relação inexistente (`public.evolution_webhook_events`) — telemetria perdida sem alarme; redirecionar ou remover com log explícito
- [ ] 85.3 Fix bug bilateral consumer-stats 404: POST HTTP ~30s acumulando 404 (lado evolution-stack) e zerar contadores
- [ ] 85.4 Reconciliar drift digest runtime `9b1a5b967` × stack `0f4b07cfb`: redeploy alinhado e digests únicos no Swarm
- [ ] 85.5 Reconciliar labels OCI 2.3.7 × prod 2.4.0: relabel/tag da imagem e verificação `docker inspect`
- [ ] 85.6 Testes de dual-write: dedupe no overlap (mesma mensagem por 2 portas), 0 duplicatas, idempotência
- [ ] 85.7 Corrigir PAUSE_INGEST.md: SQL `evo.evolution_messages` → `zapp.evolution_messages` (tabela vive em zapp) + versão PG 15.8 (não pg14) em todas as fases do runbook
- [ ] 85.8 Primeiro uso registrado do PAUSE_INGEST: pausa ≤30min, 0 msgs perdidas, retomada validada (log no runbook)
- [ ] 85.9 Verificação de telemetria: consumer-stats 200, eventos fluindo, DLQ=0, latência <5min
- [ ] 85.10 Verificação Swarm: digest e label OCI únicos (stack = runtime), 2 réplicas do consumer saudáveis
### Critério de conclusão (checklist da etapa)
- [ ] PR E89 mergeado no evolution-stack com testes verdes
- [ ] consumer.py:239 corrigido e 404 consumer-stats zerado (evidência de runtime)
- [ ] digest `9b1a5b967`×`0f4b07cfb` e labels OCI 2.3.7×2.4.0 reconciliados
- [ ] PAUSE_INGEST sem referência a schema inexistente e com 1 uso registrado

## Etapa 86 — Roles evo_writer/zapp_writer (E53/E54) + congelamento formal evo [APROVAÇÃO]
**Objetivo:** Criar/aplicar as roles de contrato e executar o congelamento formal das tabelas evo (V4-FINAL #75) com decisão dos 115 grants e limpeza de índices, sem nenhum DROP.
**Base:** pendência real findings-13.md itens 9/15 E53/E54 (L117, L123); findings-14.md §8 EVO_RETIREMENT_V4 (L110-112); findings-16.md §3 item 11 (L50); findings-14.md §11 INDICES_CLEANUP (L148).
### Subetapas
- [ ] 86.1 [APROVAÇÃO] Aprovar congelamento formal (COMMENT CONGELADO + REVOKE `authenticated` em ~25 tabelas frias; NUNCA DROP nesta rodada) + janela de manutenção — pré-condição `[⛔]` do EVO_RETIREMENT_V4
- [ ] 86.2 Aplicar E54 no banco: migration de teste de roles (prova SET ROLE negativo/positivo) e registrar em `schema_migrations`
- [ ] 86.3 Verificar/criar roles `evo_writer` e `zapp_writer` (sem evidência de criação em T3) com grants mínimos por consumidor
- [ ] 86.4 Substituir CRUD de `service_role` em evo pelas roles dedicadas (writers externos sem superuser, padrão NOBYPASSRLS + SECURITY DEFINER em ops)
- [ ] 86.5 Decidir os 115 fns evo `EXECUTE` público p/ `authenticated`: REVOKE seletivo vs superfície aceita documentada (lista nominal de consumidores PostgREST)
- [ ] 86.6 Congelar as 27 tabelas evo órfãs/ frias (COMMENT + REVOKE; sem DROP; service_role/crons intocados)
- [ ] 86.7 INDICES_CLEANUP: aplicar `20260815120000_cleanup_evo_webhook_v2_redundant_idx.sql` (13 DROP INDEX CONCURRENTLY IF EXISTS, fora de transação) com pré-checks `idx_scan=0` e `indisunique/indisprimary=false`; NUNCA dropar PK/UNIQUE/suporte de FK
- [ ] 86.8 Revalidar risco E23 (realtime) antes de remover do runbook: congelamento de grants não derruba realtime — medir
- [ ] 86.9 Verificar ambiente MCP: `vps_*`/`ops_runbooks`/`e2e_probe_results` em evo (possível mistura de ambientes) e apontar para canônico
- [ ] 86.10 Monitorar 7 dias pós-congelamento: grants, realtime, crons, DLQ e latência (janela do INDICES_CLEANUP)
### Critério de conclusão (checklist da etapa)
- [ ] E54 aplicada com prova SET ROLE verde; roles `evo_writer`/`zapp_writer` existentes com grants mínimos
- [ ] congelamento executado na janela aprovada (COMMENT + REVOKE), 27 tabelas congeladas sem DROP
- [ ] decisão dos 115 fns registrada (REVOKE seletivo ou superfície aceita)
- [ ] 13 índices dropados com pré-checks e 7 dias de monitoramento sem regressão

## Etapa 87 — Egresso: remover evolution-proxy + decidir evolution-templates [APROVAÇÃO]
**Objetivo:** Aposentar o `evolution-proxy` (4 critérios do ADR-011), migrar `ZappWebbDemoPage`, resolver o 401 do `evolution-templates` e consolidar os 3 DRIFT do RPC_AUDIT, mantendo egresso único via `evolution-api`.
**Base:** pendência real findings-13.md itens 4/5 (L112-113); findings-14.md §1 EGRESS_SURFACE_V4 (L15-18); findings-14.md §3 RPC_AUDIT_V4 (L47).
### Subetapas
- [ ] 87.1 [APROVAÇÃO] Aprovar remoção do `evolution-proxy` (4 critérios do ADR-011 L104-110) e o destino do `evolution-templates` (rotear via gateway × aposentar com banner)
- [ ] 87.2 Migrar `ZappWebbDemoPage.tsx` (único chamador real do proxy) para `evolution-api` com contrato Zod
- [ ] 87.3 Deletar `evolutionClient.ts` + `_archive` associado após migração (verificar 0 importadores)
- [ ] 87.4 Remover `evolution-proxy` do deploy (EGRESS_SURFACE 10 fns → 9) e atualizar ESTADO.md/EGRESS_SURFACE_V4
- [ ] 87.5 `evolution-templates`: corrigir 401 (browser → service-role/cron via gateway) OU aposentar com banner — fim da quebra silenciosa (V4-FINAL #31)
- [ ] 87.6 `evolution-credentials`: remover branch GET morto pós-410 (linhas 167-232) e manter 410 como sentinela
- [ ] 87.7 `evolution-bitrix-sync`: restaurar segredo `bitrix_webhook_url` (R06-07) OU formalizar aposentadoria (hoje 503)
- [ ] 87.8 RPC_AUDIT: consolidar 3 DRIFT (`fn_compute_contact_dedup_hash`, `rpc_get_contact`, `rpc_mark_messages_read`) pelo protocolo E15 — verificar chamadores PostgREST antes de remover assinatura
- [ ] 87.9 Verificação: 0 invokes diretos (E81 mantido), inventory TOTAL=0, egresso browser→Evolution só via `evolution-api`
- [ ] 87.10 Atualizar EGRESS_SURFACE_V4 com superfície congelada pós-remoção e registrar no RETRO_V4
### Critério de conclusão (checklist da etapa)
- [ ] ZappWebbDemoPage roteado via `evolution-api`; `evolution-proxy` fora do deploy e do código
- [ ] `evolution-templates` sem 401 (ou aposentada com banner explícito)
- [ ] 3 DRIFT do RPC_AUDIT consolidados sem quebra de chamadores
- [ ] EGRESS_SURFACE_V4 atualizado; inventory TOTAL=0

## Etapa 88 — Soberania de plataforma (I6) + ADR-016 + P4 versionado
**Objetivo:** Criar o repo `atomica-platform` com GitOps (obs-*.yml, zapp_health_guard, stack destino), corrigir E35/E36, criar o ADR-016 e versionar os resolvers da porta P4.
**Base:** pendência real findings-13.md itens 8/10 (L116, L118); findings-15.md §4 F2 ops.fn_evo_url (L121) e F1 sql-gate (L122); findings-13.md item 13 Fase 0 (L121).
### Subetapas
- [ ] 88.1 Criar repo `atomica-platform` (E26) com estrutura GitOps (stacks, observabilidade, health)
- [ ] 88.2 Gerar `obs-*.yml` por sistema (E28) — depende da decisão de dashboards (CHECKLIST L28)
- [ ] 88.3 Mover `zapp_health_guard` para o repo de plataforma (E30 — hoje segue no evolution-stack)
- [ ] 88.4 Mover `supabase.yml`/`obs-*.yml` para fora do evolution-stack + stack destino (E31-E33) com GitOps aplicado
- [ ] 88.5 Corrigir E35/E36 (gates inversos): deploy pipeline versionado + introspector versão COMMIT_SHA
- [ ] 88.6 E37: criar staging (E9) e executar prova destrutiva OU documentar bloqueio formal (staging inexistente)
- [ ] 88.7 Criar ADR-016 (porta P4 decidida via `ops.fn_provider_call`) e registrar no docs/decouple (INDEP E84 L285)
- [ ] 88.8 Versionar `ops.fn_evo_url()`/`ops.fn_evo_key()` (hoje DB-as-source, zero CREATE no repo) em migration idempotente
- [ ] 88.9 Criar resolvers cloud `ops.fn_cloud_*` + regenerar fixture `sql_report_snapshot.json` (sql-gate 12→25)
- [ ] 88.10 Fechar Fase 0: E6 backup restaurável validado, E10 dashboard 7d, E12 `log_min_duration` — evidências anexadas
### Critério de conclusão (checklist da etapa)
- [ ] `atomica-platform` criado com GitOps; `supabase.yml`/`obs-*.yml` fora do evolution-stack
- [ ] ADR-016 aceito e registrado (porta P4 formalizada)
- [ ] `ops.fn_evo_url`/`fn_evo_key` + `ops.fn_cloud_*` versionados; fixture sql-gate 25/25
- [ ] I6 = PASS no `ops.fn_boundary_audit()` (evidência T2 formal)

## Etapa 89 — Dono único de migrations evo (I7) + verdade documental
**Objetivo:** Concluir a classificação exaustiva do E40, ativar o gate E42, corrigir refs STALE/migrations sem registro e atualizar CLAUDE.md/fixture, tornando I7 PASS.
**Base:** pendência real findings-13.md item 14 I7 residual (L122); findings-16.md §3 itens 4/5 (L43-44); findings-15.md F3 CLAUDE.md (L123) e F1 fixture (L122); findings-16.md §3 itens 9/10 (L48-49).
### Subetapas
- [ ] 89.1 Classificação exaustiva arquivo-a-arquivo do E40: 51+ migrations legadas com DDL `evo.*` (graveyard, movidas ou allowlist)
- [ ] 89.2 Ativar gate E42 (hoje inativo): zero migrations novas `evo.*` fora da allowlist (critério 4 do ADR-015, 30 dias)
- [ ] 89.3 Corrigir 6 refs STALE da baseline E41 no evolution-stack (RELATORIO_FINAL L.53)
- [ ] 89.4 Validar migrations sem registro `20260808280000`/`20260813180000`: aplicar × arquivar com decisão registrada
- [ ] 89.5 Atualizar CLAUDE.md (topologia evo/zapp, Realtime, 136 vs 58 tabelas, regra 4) + docs irmãos contaminados (31-, _HANDOFF/_PROGRESSO)
- [ ] 89.6 Ampliar sql-gate fixture 12→25: adicionar as 5 fns fora do fixture (falsos positivos eliminados)
- [ ] 89.7 Formalizar dependência reversa evo→zapp (`fn_normalize_send_jid` 13x, `is_admin_or_supervisor` 6x) como contrato no BOUNDARY
- [ ] 89.8 `fn_backfill_contact_id`: UPDATE direto em evo (I2=1) — ALLOWED_BYPASS documentado ou correção via `rpc_boundary_*`
- [ ] 89.9 Corrigir 7 views sem `security_invoker` (drift pré-existente; validar/rodar cron autofix e conferir as 11 views da Rota A)
- [ ] 89.10 Verificação final: gate E42 bloqueia nova migration evo; fixture = prod; CLAUDE.md correto; I7 = PASS
### Critério de conclusão (checklist da etapa)
- [ ] 51+ migrations classificadas com veredito por arquivo (graveyard/movida/allowlist)
- [ ] gate E42 ativo e bloqueando; 6 refs STALE corrigidas; 2 migrations sem registro decididas
- [ ] CLAUDE.md e docs irmãos sem premissa invertida; fixture sql-gate 25/25
- [ ] 7 views com `security_invoker=true`; I7 = PASS no boundary audit

## Etapa 90 — Fechar pendências operacionais do desacoplamento (runbooks, índices, crons, baselines)
**Objetivo:** Executar as pendências operacionais remanescentes da onda V4/independência com dono claro e sem decisão de arquitetura pendente.
**Base:** PAUSE_INGEST (SQL referencia evo.evolution_messages inexistente) · INDICES_CLEANUP (13 candidatos) · CRON_FAILURES_7D (job 27 ambíguo, job 138 0 execuções) · 6 refs STALE baseline E41 · drift digest consumer 9b1a5b967×0f4b07cfb · labels OCI 2.3.7×2.4.0 · VAULT cadência vault×swarm×env.
### Subetapas
- [ ] 90.1 Corrigir o runbook PAUSE_INGEST: apontar para as tabelas reais (zapp.evolution_messages) e PG 15.8; validar o SQL em transaction ROLLBACK.
- [ ] 90.2 Executar a revisão sênior da INDICES_CLEANUP_PROPOSTA e aplicar/descartar os 13 candidatos com DDL versionado.
- [ ] 90.3 Confirmar correção do job 27 (função ambígua + estado connecting) e verificar job 138 (0 execuções em 7d).
- [ ] 90.4 Corrigir as 6 refs STALE da baseline E41 no evolution-stack (PR no repo irmão).
- [ ] 90.5 Alinhar digest do consumer runtime (9b1a5b967) com o stack (0f4b07cfb): rebuild + deploy versionado.
- [ ] 90.6 Harmonizar labels OCI 2.3.7 (manifesto) × 2.4.0 (produção): atualizar manifestos e contract.zod.
- [ ] 90.7 Documentar a cadeia vault×swarm×env dos secrets (VAULT_SECRETS_V4 pendência) + verificar 2 secrets no evolution-stack.
- [ ] 90.8 Validar as 2 migrations sem registro (20260808280000/20260813180000) e registrá-las no ledger.
- [ ] 90.9 Rodar o checklist de verificação do schema-registry (evo.json/zapp.json) contra o banco vivo.
- [ ] 90.10 Atualizar SCORECARD/CHECKLIST com as evidências de fechamento.
### Critério de conclusão (checklist da etapa)
- [ ] PAUSE_INGEST validado em ROLLBACK no banco real
- [ ] Índices decididos com DDL registrado
- [ ] Jobs 27/138 saudáveis em pg_cron (7 dias)
- [ ] Baseline E41 sem refs STALE e digest alinhado
- [ ] Evidências registradas no SCORECARD


---
