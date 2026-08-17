# FASE 7 — FEATURES DE NEGÓCIO

## Etapa 61 — TalkX: habilitar e comprovar disparo real de campanha

**Objetivo:** Transformar o disparo de campanha TalkX de "inferido/mock" em fluxo real verificado ponta a ponta (UI → edge → banco → Evolution API).

**Base:** findings-08 (disparo 🤔 INFERIDO — edge só aparece como mock em `TalkX.test.tsx:36`, doc19:220); findings-10 (CAMPANHAS-06 — cron `talkx-scheduler-check` a confirmar em produção, 26 L424; useTalkX 26 L38/L362); findings-08 A2 (leak de subscription com `Math.random()` em TalkXLiveMonitor:45 e TalkXView:93, 19:434); findings-08 (TalkXRecipientsList com `TALKX_POLL_INTERVAL`/`TALKX_RECIPIENTS_LIMIT` hardcoded, 19:469-470).

### Subetapas
- [ ] 61.1 Auditar o fluxo real: `TalkXView → useTalkX → invoke(edge) → zapp.talkx_campaigns/talkx_recipients → Evolution API` — listar todas as chamadas `supabase.functions.invoke` e comparar com a lista de edge functions deployadas.
- [ ] 61.2 Verificar em produção (via MCP/runtime) se a edge de disparo existe de fato; se não existir, criar a edge `campanha-send` (ou nome canônico do contrato) com validação Zod, rate-limit e idempotência por destinatário.
- [ ] 61.3 Confirmar o cron `talkx-scheduler-check` (CAMPANHAS-06) em produção: job pg_cron ativo? schedule correto? SQL versionado no repo? Criar migration versionada se ausente ou divergente.
- [ ] 61.4 Implementar fila de envio por destinatário: status `pending → sent/failed` em `talkx_recipients` com atualização transacional (`UPDATE ... WHERE status='pending' RETURNING`) para evitar duplo envio em reprocessamento.
- [ ] 61.5 Substituir o mock de `TalkX.test.tsx:36` por teste de contrato real da edge (payload Zod + respostas reais), mantendo o teste hermético com fetch mockado.
- [ ] 61.6 Corrigir leaks de subscription Realtime: remover `Math.random()` sem deps em TalkXLiveMonitor:45 e TalkXView:93 — usar chave estável por campanha + cleanup no unmount.
- [ ] 61.7 Externalizar `TALKX_POLL_INTERVAL` e `TALKX_RECIPIENTS_LIMIT` (19:469-470) para constantes configuráveis via env/feature flag, com default documentado.
- [ ] 61.8 Executar campanha de teste controlada (flag dry-run ou destinatário de teste) e comprovar entrega real com evidência de log (envio registrado na Evolution + status no banco).
- [ ] 61.9 Tratar falhas por destinatário: expor motivo de falha no TalkXRecipientsList, com retry manual e respeito à blacklist/opt-out existente.
- [ ] 61.10 Documentar runbook de campanha (limites de envio, blacklist, LGPD/opt-out, rollback) no repo, citando a evidência da subetapa 61.8.

### Critério de conclusão (checklist da etapa)
- [ ] Disparo real comprovado por log/status em runtime (não mais "inferido"): recipients com `sent` real via Evolution API.
- [ ] Cron `talkx-scheduler-check` ativo em produção e declarado em migration versionada no repo.
- [ ] Zero canais Realtime com `Math.random()` em componentes TalkX (grep limpo).
- [ ] Testes de TalkX exercitam contrato real da edge (sem mock fantasma).

## Etapa 62 — Campanhas: RLS de escrita, dedup atômico e engine A/B

**Objetivo:** Completar o CRUD real de campanhas — RLS UPDATE/DELETE, motor `campanha-send` e engine de A/B — eliminando o 403 silencioso no botão "Iniciar".

**Base:** findings-09 (useCampaigns — RLS UPDATE/DELETE ausente → 403; edge `campanha-send` inexistente; botão "Iniciar" sem efeito real, 23:55/23:350 e 21:283 A4); findings-10 (useCampaignABTesting — engine de disparo A/B inexistente e RLS INSERT/UPDATE/DELETE bloqueiam escrita, 27 L22/L243, A3 L294-296); findings-10 (useCampaigns.test.tsx sem testes de update/delete, 28 L32/L314).

### Subetapas
- [ ] 62.1 Migration versionada: criar policies RLS UPDATE/DELETE em `zapp.campaigns` (dono/workspace check), espelhando as policies INSERT/SELECT já existentes.
- [ ] 62.2 Migration versionada: criar/validar policies de escrita em `talkx_campaigns`/`talkx_recipients` necessárias para atualização de status e progresso.
- [ ] 62.3 Implementar a edge `campanha-send` (referida em findings-09) com validação de status da campanha, rate-limit por instância e idempotência por recipient — ou registrar ADR se o contrato real for outro.
- [ ] 62.4 Dedup atômico de destinatários: unique constraint `(campaign_id, contact_id)` em `talkx_recipients` + `ON CONFLICT DO NOTHING` na inserção em lote.
- [ ] 62.5 Criar colunas de A/B na migration (ex.: `variant`, `variant_weight`) em `campaigns` e persistir a variante escolhida por recipient no disparo.
- [ ] 62.6 Implementar engine A/B: seleção de variante por destinatário (peso configurado), agregação de resultados por variante (entregues/respondidas).
- [ ] 62.7 Atualizar `useCampaignABTesting` (27 L22/L243) para consumir a engine real — remover qualquer mock/local state que finja resultado.
- [ ] 62.8 Corrigir `useCampaigns` e `CampaignsView` (21:283): "Iniciar/Pausar" chamam o contrato real, tratam 403 com mensagem clara e invalidam o cache após mutação.
- [ ] 62.9 Adicionar testes de mutação real em `useCampaigns.test.tsx` (update/delete com RLS simulado) e cobertura da seleção A/B.
- [ ] 62.10 Validação runtime: iniciar campanha de teste, confirmar recipients deduplicados (inserts concorrentes → 1 linha) e variante A/B persistida por recipient.

### Critério de conclusão (checklist da etapa)
- [ ] Policies UPDATE/DELETE aplicadas via migration e validadas com `SET ROLE` (sem 403).
- [ ] Dedup atômico provado: 2 inserts concorrentes do mesmo recipient geram 1 única linha.
- [ ] Engine A/B funcional: variante persistida por recipient e resultados agregados por variante.
- [ ] Botão "Iniciar" produz envio real (evidência de status no banco), sem mock.

## Etapa 63 — useSyncToCRM: RPC real ou aposentadoria com feature flag

**Objetivo:** Eliminar o stub `RAISE P0001` mascarado por `isConfigured=false` — sync com CRM passa a funcionar de verdade ou a UI é desligada com flag.

**Base:** findings-10 (useSyncToCRM — RPC `sync_conversation_to_crm` é stub RAISE P0001 e `isConfigured=false` esconde o erro, 26 L36/L360, A2 L405-406); findings-05 (CRMAutoSync — RPC `sync_to_crm` STUB RAISE P0001, erro engolido por `catch {}`, `sentiment` hardcoded, doc10 A2 l.361).

### Subetapas
- [ ] 63.1 Mapear o contrato exigido pela UI: quais campos `sync_conversation_to_crm` deve enviar (conversation_id, contato, mensagens, sentiment) e qual o destino real (CRM externo ou staging interno).
- [ ] 63.2 Registrar decisão em ADR: implementar integração real OU desligar a feature com feature flag — nunca manter stub ativo.
- [ ] 63.3 Migration versionada: implementar `sync_conversation_to_crm` (SECURITY DEFINER, search_path fixo, checagem de permissão) escrevendo em fila de staging `crm_sync_queue` com status `pending` (se não houver CRM externo imediato).
- [ ] 63.4 Se houver CRM externo: criar edge function de envio com retry/backoff, idempotência por `conversation_id` e timeout (lição de findings-01:5 sobre chain sem timeout).
- [ ] 63.5 Remover `isConfigured=false` hardcoded: derivar de config real (tabela/flag) ou exibir erro explícito na UI quando não configurado.
- [ ] 63.6 Remover `catch {}` silencioso em CRMAutoSync (findings-05): propagar erro à UI com estado visível (toast/badge) e log estruturado.
- [ ] 63.7 Remover `sentiment` hardcoded do payload: usar análise real ou `null`, nunca valor fictício.
- [ ] 63.8 Aplicar feature flag: sem CRM configurado, ocultar a UI de sync (não exibir feature morta "visualmente presente").
- [ ] 63.9 Testes: RPC com `SET ROLE` (permissão negada/ok), erro propagado até a UI, idempotência de sync repetido.
- [ ] 63.10 Validação runtime + runbook: executar sync real (ou simulado com flag) e documentar o fluxo no repo.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhuma RPC de sync com `RAISE P0001` restante no repo (grep limpo).
- [ ] Erro/sucesso de sync visível na UI (sem `catch {}` ou `isConfigured=false` mascarando).
- [ ] Decisão ADR registrada (implementar vs. flag) e executada.
- [ ] Teste de permissão da RPC passando com `SET ROLE`.

## Etapa 64 — useLatestAnalysis: implementar RPC (GAP-6)

**Objetivo:** Substituir o STUB que retorna `null` sempre por RPC real, devolvendo dados à `AnalysisBadges`.

**Base:** findings-10 (useLatestAnalysis ❌ — queryFn retorna `null` sempre; RPC nunca implementada GAP-6; consumida por AnalysisBadges.tsx, 25 L20/L265, A1 L318-319); pendencias-consolidadas (findings-10: GAP-6 RPC de useLatestAnalysis nunca implementada).

### Subetapas
- [ ] 64.1 Definir o contrato da RPC (ex.: `rpc_latest_conversation_analysis(conversation_id)`) — payload: análise mais recente da conversa (tipo, resumo, confiança, created_at).
- [ ] 64.2 Inventariar no banco as tabelas/funções existentes de análise (ex.: `ai_conversation_tags`, `conversation_analyses`) para basear a RPC em dado real — nada de schema inventado.
- [ ] 64.3 Migration versionada: criar a RPC (SECURITY DEFINER, search_path fixo, grants mínimos) com fallback explícito quando não há análise.
- [ ] 64.4 Atualizar `useLatestAnalysis.ts:18`: invocar a RPC real com queryKey estável, retry e tratamento de erro (sem `null` silencioso).
- [ ] 64.5 Regenerar/atualizar tipos TS do Supabase para incluir a RPC (seguir fluxo de regeneração de types do repo).
- [ ] 64.6 `AnalysisBadges.tsx`: tratar estados loading/erro/vazio — badge real quando houver análise, estado vazio explícito quando não houver.
- [ ] 64.7 Garantir invalidação: novas análises (AI tags/summary) invalidam a query da badge.
- [ ] 64.8 Testes: useLatestAnalysis com mock da RPC (sucesso/vazio/erro) + teste de contrato do payload.
- [ ] 64.9 Verificar consumidores secundários da query (busca por usos de `useLatestAnalysis`) e cobrir cada um.
- [ ] 64.10 Validação runtime: chamar a RPC via MCP com usuário real e verificar a badge renderizando dado real na UI.

### Critério de conclusão (checklist da etapa)
- [ ] RPC existe em migration versionada e no banco (sem drift repo×DB).
- [ ] `AnalysisBadges` exibe dados reais ou estado vazio explícito — nunca vazio permanente por `null` silencioso.
- [ ] Tipos TS regenerados contendo a RPC (sem `as unknown as`).
- [ ] Testes de contrato da RPC passando.

## Etapa 65 — Mensagens agendadas: RLS (CAMPANHAS-09) + dispatcher real

**Objetivo:** Fazer mensagens agendadas de fato serem enviadas: RLS de escrita + cron/edge que dispara `scheduled_messages` com idempotência.

**Base:** findings-10 (useScheduledMessages — RLS INSERT/UPDATE ausentes, 403 silencioso, e nenhum cron/edge dispara `scheduled_messages`; CAMPANHAS-09, 26 L18/L342, A1 L402-403); findings-10 (useScheduledMessages.test.tsx sem mutações, 29 L33/L291); findings-04 (signed URL 7d em useChatScheduleMessage.ts:43 invalida agendamentos longos).

### Subetapas
- [ ] 65.1 Migration versionada: policies INSERT/UPDATE/DELETE em `scheduled_messages` (dono/workspace check) — resolve o 403 silencioso do CAMPANHAS-09.
- [ ] 65.2 Migration versionada: índice `(scheduled_at, status)` para polling eficiente do dispatcher.
- [ ] 65.3 Implementar dispatcher: edge function `scheduled-messages-dispatch` (ou RPC + cron) que seleciona mensagens devidas e envia via fila Evolution com validação Zod.
- [ ] 65.4 Criar cron pg_cron versionado (intervalo ~1min) autenticado com `CRON_SECRET` chamando o dispatcher.
- [ ] 65.5 Idempotência transacional: `UPDATE ... SET status='sent' WHERE status='pending' AND scheduled_at <= now() RETURNING *` — reprocessamento não duplica envio.
- [ ] 65.6 Falha com retry: status `failed` + contador de tentativas + backoff, sem loop infinito.
- [ ] 65.7 `useScheduledMessages`: propagar erro de RLS/mutação à UI (sem 403 silencioso) e invalidar cache após create/delete/update.
- [ ] 65.8 Mídia em agendamentos longos: tratar signed URL de 7 dias (useChatScheduleMessage.ts:43) — re-resolver URL no momento do envio ou limitar agendamento com aviso.
- [ ] 65.9 Testes: mutações create/delete/update com RLS simulado + dispatcher com relógio fake (devidas/não-devidas/duplo disparo).
- [ ] 65.10 Validação runtime: agendar mensagem para +2min e comprovar envio real com status no banco.

### Critério de conclusão (checklist da etapa)
- [ ] CRUD de agendamento sem 403 (validação com SET ROLE em runtime).
- [ ] Dispatcher/cron ativo e declarado no repo; mensagem agendada chega ao WhatsApp.
- [ ] Idempotência provada: reprocessamento não gera duplo envio.
- [ ] Testes de mutação e dispatcher passando no CI.

## Etapa 66 — Dashboards: remover todos os dados fake/hardcoded

**Objetivo:** Eliminar dados fictícios dos dashboards (tratados como bug) — métricas passam a vir de queries reais ou o widget é removido com flag.

**Base:** findings-06 (SatisfactionMetrics `dataUnavailable=true` hardcoded, 16@L343-344; gamificação fictícia XP=1250/coins=89/streak=7 no JSX, 16@L337-338; ConversationHeatmap response_time/satisfaction sempre 0, 16@L340-341; ActivityHeatmap resolutions cai em branch errado, 16@L352-353); findings-09 (useGoalNotifications `check.value` sempre null, 24:65/24:300; useDashboardDataBatch órfão com RPC `rpc_dashboard_init` possivelmente inexistente, 24:26/24:303); findings-01 (dashboard com `avgResponseTime: null`, `messagesHandled: 0`, war room zerado, recentActivity fake, 02 L160-164); findings-10 (useWarRoomData `alerts: []` hardcoded, 26 L65/L389; useQueueAnalytics `agentPerformance` hardcoded `[]`, 25 L52/L297).

### Subetapas
- [ ] 66.1 Inventariar por grep todos os valores hardcoded/fake em dashboards (XP/coins/streak, `avgResponseTime: null`, `messagesHandled: 0`, `alerts: []`, `agentPerformance: []`, `dataUnavailable`) e criar lista-verificável de remoção.
- [ ] 66.2 `SatisfactionMetrics`: implementar consulta real de CSAT/NPS (tabelas existentes) ou remover o widget com feature flag — proibido `dataUnavailable=true` fixo.
- [ ] 66.3 `ConversationHeatmap`: calcular response_time/satisfaction com queries agregadas reais; remover zeros fixos.
- [ ] 66.4 `ActivityHeatmap`: corrigir o branch de `resolutions` (dados caem no branch errado) e validar com fixture.
- [ ] 66.5 DashboardView: substituir XP=1250/coins=89/streak=7 hardcoded por dados do `GamificationProvider` (ver Etapa 70 para persistência).
- [ ] 66.6 `useGoalNotifications`: comparar métrica real contra `NOTIFY_THRESHOLDS` (corrigir `check.value` null) antes de disparar toast — toast sem base real é bug.
- [ ] 66.7 `useDashboardDataBatch`: adotar com RPC `rpc_dashboard_init` real (criada em migration) ou remover o hook órfão — decisão registrada.
- [ ] 66.8 `useWarRoomData`/`useQueueAnalytics`: implementar queries reais (alerts, agentPerformance) a partir das tabelas existentes ou remover com flag.
- [ ] 66.9 Qualquer métrica ainda sem fonte de dados deve exibir indicador explícito "sem dados" — nunca valor fictício silencioso.
- [ ] 66.10 Adicionar teste de regressão/lint que falha se novos literais fake (zeros/valores fixos) aparecerem em componentes de dashboard.

### Critério de conclusão (checklist da etapa)
- [ ] Grep de valores fake em componentes de dashboard = 0 (produção).
- [ ] SatisfactionMetrics com dados reais ou removido com flag (sem `dataUnavailable` fixo).
- [ ] Heatmaps e ActivityHeatmap exibem dados reais (sem zeros/branch errado).
- [ ] Toasts de meta só disparam com valor real comparado a threshold.

## Etapa 67 — SLA: consolidar duplicação e corrigir queries

**Objetivo:** Uma única fonte de verdade de SLA na UI e dados corretos — sem `staleTime: Infinity`, sem join que subreporta, sem rota duplicada.

**Base:** findings-01 (useSLAConfigurations `staleTime: Infinity` — mudanças de admin nunca refletem, 03 L292; useSLAMetrics join `contacts!inner(assigned_to)` subreporta conversas sem contato, 03 L291; useSLAHistory `new Date()` fora da queryKey — sem invalidação por dia, 03 L290); pendencias-consolidadas findings-06 (duplicação conceitual SLA: SettingsView × SLADashboard); findings-07 (rota SLA registrada em 2 lugares: AppRoutes.tsx:128 + ViewRouter.tsx:136).

### Subetapas
- [ ] 67.1 Mapa de duplicação: inventariar SettingsView (seção SLA) × SLADashboard × SLAMetricsDashboard × hooks `useSLA*` — listar sobreposições com evidência de linhas.
- [ ] 67.2 Decidir o dono único da configuração SLA (SettingsView ou SLADashboard) e registrar a decisão no plano/ADR.
- [ ] 67.3 Consolidar: uma única UI de configuração SLA (CRUD de `sla_configurations`); remover a duplicata com feature flag temporária se necessário.
- [ ] 67.4 `useSLAConfigurations`: remover `staleTime: Infinity` — usar staleTime curto + `invalidateOnMount`/focus e invalidação pós-mutação.
- [ ] 67.5 `useSLAMetrics`: trocar `contacts!inner(assigned_to)` por LEFT JOIN (ou contagem por conversation sem contato) para não subreportar (03 L291).
- [ ] 67.6 `useSLAHistory`: incluir o dia/período na `queryKey` (corrigir `new Date()` fora da key) para invalidar por mudança de dia (03 L290).
- [ ] 67.7 Resolver rota duplicada de SLA: manter UMA rota canônica (AppRoutes.tsx:128 ou ViewRouter.tsx:136) e remover a outra.
- [ ] 67.8 Alinhar `SLADeliveryHistoryDashboard`/`SLAHistoryDashboard`/`SLACharts` ao padrão consolidado (mesmos hooks e keys).
- [ ] 67.9 Testes: useSLAMetrics com e sem contato vinculado (contagem correta), useSLAHistory com mudança de dia, rota única renderizando.
- [ ] 67.10 Validação runtime: alterar config SLA em um cliente e ver refletir sem reload; conferir que métricas incluem conversas sem contato.

### Critério de conclusão (checklist da etapa)
- [ ] Uma única UI de configuração SLA em produção (duplicata removida).
- [ ] `staleTime: Infinity` eliminado — mudança de admin reflete sem reload.
- [ ] Contagem de métricas SLA bate com runtime (join corrigido, sem subreport).
- [ ] Rota SLA única; teste de rota passando.

## Etapa 68 — Notificações: RLS (42501), executor e dedup de providers

**Objetivo:** CRUD de canais/templates funcional + executor de envio real (DASHBOARD-08) + sem duplo disparo entre providers legados e novos.

**Base:** findings-08 (RLS ausente em `notification_templates` — nenhuma policy — e `notification_channels_config` só SELECT → salvar/excluir retorna 42501, 19:430-431; UnifiedNotificationProviders com risco de duplo disparo legado×novo, 19:457-458; NotificationChannelsAdmin CRUD, 19:56); findings-10 (TODO DASHBOARD-08 — executor de envio de canais de notificação ausente: salvar canal/template não produz efeito real, 25 L348-349; useNotificationChannels, 25 L30/L275).

### Subetapas
- [ ] 68.1 Migration versionada: policies RLS INSERT/UPDATE/DELETE em `notification_templates` (admin/workspace check).
- [ ] 68.2 Migration versionada: policies RLS INSERT/UPDATE/DELETE em `notification_channels_config`.
- [ ] 68.3 Migration versionada (se necessário): colunas de estado para o executor (`enabled`, `last_sent_at`, `error`) — validar contra schema real antes de criar.
- [ ] 68.4 Implementar executor DASHBOARD-08: edge function `notification-dispatcher` que lê canais/templates configurados e envia (in-app/push/email) com validação Zod e retry.
- [ ] 68.5 Cron pg_cron versionado chamando o dispatcher (intervalo definido) — sem executor = sem feature, nunca manter config morta.
- [ ] 68.6 `useNotificationChannels`: tratar 42501/erro com mensagem clara (sem falha silenciosa) e invalidar cache após CRUD.
- [ ] 68.7 `UnifiedNotificationProviders`: dedup de eventos (guard por eventId) entre providers legados e hooks novos — eliminar duplo disparo (19:457-458).
- [ ] 68.8 Botão "enviar notificação de teste" (PushNotificationToggle/NotificationChannelsAdmin) deve produzir efeito real via executor.
- [ ] 68.9 Testes: RLS com `SET ROLE` (42501 some), executor com canal mock, dedup de eventos com payload repetido.
- [ ] 68.10 Validação runtime: criar/editar/excluir canal e template sem 42501; notificação de teste chega de verdade.

### Critério de conclusão (checklist da etapa)
- [ ] CRUD de canais/templates sem 42501 (validado em runtime com SET ROLE).
- [ ] Executor DASHBOARD-08 implementado e com cron versionado; teste de envio chega.
- [ ] Nenhum duplo disparo entre providers (teste de dedup passando).
- [ ] Erros de notificação visíveis na UI (sem falha silenciosa).

## Etapa 69 — Catálogo, relatórios agendados e NPS/CSAT automáticos

**Objetivo:** Fechar features de negócio auxiliares: catálogo sem duplicação/timeout, relatórios agendados com pg_cron (DASHBOARD-16) e pesquisas NPS/CSAT com produtor real (DASHBOARD-04/05).

**Base:** findings-08 (formatPrice/handleImageError duplicados com ProductDetailDialog, 19:454-455; AutoExportManager STUB — rota `/auto-export` bloqueada com ShieldAlert, 19:439-440); findings-01 (sendProductToContact sem timeout na chain edge + DB inserts, 02 L52); findings-10 (useScheduledReports — pg_cron para disparo não existe no repo, DASHBOARD-16, 26 L19/L343); findings-09 (NPSDashboard — `nps-scheduler` deployada sem trigger, DASHBOARD-04, 22:29/22:285; useCSATAutoConfig sem produtor — nenhuma edge lê `csat_auto_config`, DASHBOARD-05, 23:52/23:353).

### Subetapas
- [ ] 69.1 Extrair `formatPrice`/`handleImageError` para util compartilhada e usar em ExternalProductCard + ProductDetailDialog (remover duplicação de 19:454-455).
- [ ] 69.2 `sendProductToContact`: adicionar timeout/AbortSignal na chain edge + DB inserts (02 L52) — envio de catálogo não pode pendurar indefinidamente.
- [ ] 69.3 AutoExportManager: registrar decisão — remover rota `/auto-export` OU implementar exportação agendada reutilizando `ExportButton`/`getData` (19:439-440); executar a decisão.
- [ ] 69.4 Migration versionada: policies RLS de escrita em `scheduled_reports` (e validação das existentes) para viabilizar o CRUD real.
- [ ] 69.5 DASHBOARD-16: criar pg_cron versionado que gera relatório agendado (CSV/PDF via rotina existente) e entrega por email/canal configurado.
- [ ] 69.6 DASHBOARD-04: religar `nps-scheduler` — criar trigger/cron que invoca a edge com `CRON_SECRET`, elegibilidade de contatos e janela de reenvio.
- [ ] 69.7 DASHBOARD-05: criar produtor CSAT que lê `csat_auto_config` e dispara pesquisa automática após conversa encerrada (edge ou RPC + cron).
- [ ] 69.8 Varrer demais stubs do domínio relatórios/exportação e aplicar regra: implementar ou flag — nunca UI que finge.
- [ ] 69.9 Testes: RPCs de agendamento (permissão), geração de relatório (formato/horário), elegibilidade NPS/CSAT (quem recebe, quando).
- [ ] 69.10 Validação runtime: relatório agendado gerado no horário previsto; NPS e CSAT disparados em ambiente controlado com evidência de log.

### Critério de conclusão (checklist da etapa)
- [ ] Zero duplicação de formatPrice/handleImageError; envio de catálogo com timeout.
- [ ] Rota `/auto-export` resolvida (implementada ou removida com flag — sem ShieldAlert morto).
- [ ] pg_cron de relatórios agendados existe no repo e está ativo (DASHBOARD-16 fechado).
- [ ] `nps-scheduler` com trigger e `csat_auto_config` com produtor (DASHBOARD-04/05 fechados).

## Etapa 70 — Onboarding acessível + gamificação real (níveis, achievements, XP transacional)

**Objetivo:** Onboarding respeitando `prefers-reduced-motion` e seletores válidos; gamificação com XP persistido em transação no banco — fim do XP fictício.

**Base:** findings-08 (TourOverlay com 13+ `motion.*` e WelcomeModal ignoram `prefers-reduced-motion`, 20:342-343; defaultTourSteps não verificam existência dos seletores DOM, 20:64; useTour fora do Provider lança exceção genérica, 20:351-352; AchievementBadge duplicado em LeaderboardHelpers.tsx:64, 19:451-452; GamificationProvider com triggers streak/xp/level-up, 19:36/19:118); findings-06 (gamificação fictícia XP=1250/coins=89/streak=7 no JSX do DashboardView, 16@L337-338).

### Subetapas
- [ ] 70.1 TourOverlay e WelcomeModal: usar `useReducedMotion` (padrão já existente em transitions/PageTransition, 20:66) — desabilitar animações quando o usuário preferir.
- [ ] 70.2 `defaultTourSteps`: validar existência dos seletores DOM em runtime — step ausente é pulado com aviso (não quebra o tour); adicionar teste dos seletores.
- [ ] 70.3 `useTour` fora do Provider: substituir exceção genérica por mensagem amigável de diagnóstico (20:351-352).
- [ ] 70.4 Definir modelo de gamificação real: níveis (thresholds de XP), achievements e transações de XP (entrada, data, motivo) — documentar em ADR breve.
- [ ] 70.5 Migration versionada: tabela `user_gamification` (user_id, xp, level, achievements[]) + tabela de transações de XP + RPC `grant_xp` (SECURITY DEFINER, transacional, search_path fixo).
- [ ] 70.6 GamificationProvider: persistir XP/streak/level via RPC `grant_xp` (triggers `incrementMessages`/`updateStreak`/`grantAchievement` existentes, 19:118) em vez de estado volátil.
- [ ] 70.7 DashboardView: substituir XP=1250/coins=89/streak=7 hardcoded (16@L337-338) por dados reais do provider (combinar com Etapa 66).
- [ ] 70.8 Unificar `AchievementBadge` (gamification) com o local de LeaderboardHelpers.tsx:64 (19:451-452) — um único componente reutilizado.
- [ ] 70.9 Leaderboard: basear ranking em XP transacional real (tabela `user_gamification`), não em mock/local.
- [ ] 70.10 Testes: RPC `grant_xp` (transação, concorrência, nível sobe no threshold), provider com persistência real, badges unificados, tour com seletor ausente.

### Critério de conclusão (checklist da etapa)
- [ ] `prefers-reduced-motion` respeitado em TourOverlay/WelcomeModal (teste com matchMedia mock).
- [ ] Tour não quebra com seletor ausente (step pulado + teste).
- [ ] XP/level/achievements persistidos no banco via transação — zero hardcoded no JSX (grep limpo).
- [ ] AchievementBadge único em uso (duplicação removida).


## Resumo (≤ 10 linhas)

- Fase 7 = 10 etapas (61–70) × 10 subetapas, todas ancoradas em findings reais (08/09/10 + consolidadas).
- 61–62: TalkX e campanhas — disparo real, RLS UPDATE/DELETE, dedup atômico, engine A/B.
- 63–65: stubs de negócio — useSyncToCRM (RAISE P0001), useLatestAnalysis (GAP-6), useScheduledMessages (CAMPANHAS-09 + dispatcher).
- 66: dashboards sem dados fake (SatisfactionMetrics, heatmaps, XP fictício, useGoalNotifications, useDashboardDataBatch).
- 67–68: SLA consolidado (staleTime/join/rota) e notificações (RLS 42501, executor DASHBOARD-08, dedup providers).
- 69: catálogo (formatPrice/timeout), relatórios agendados (DASHBOARD-16), NPS/CSAT (DASHBOARD-04/05).
- 70: onboarding acessível (reduced-motion, seletores) e gamificação real com XP transacional.
- Toda RLS de escrita é via migration versionada; todo stub restante é removido ou protegido por feature flag.


---
