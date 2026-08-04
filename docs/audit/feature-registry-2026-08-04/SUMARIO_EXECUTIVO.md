# SUMÁRIO EXECUTIVO — Inventário Funcional ZAPP-WEB-V3

> Auditoria: 2026-08-04 · Recursos: **155** · ✅ Full **80** (52%) · 🟨 Partial **74** (48%) · 🟦 Suggested **1**

## Por domínio

| Domínio | Full | Partial | Suggested | Total |
|---|---|---|---|---|
| AUTOMACOES/CHATBOT/FOLLOW-UP | 2 | 10 | 1 | 13 |
| CAMPANHAS/TALKX/AGENDADAS | 1 | 13 | 0 | 14 |
| CONTATOS/CRM | 11 | 5 | 0 | 16 |
| DASHBOARDS/NOTIFICACOES/INTEGRACOES | 9 | 9 | 0 | 18 |
| E-MAIL | 0 | 14 | 0 | 14 |
| EVOLUTION/WHATSAPP | 11 | 5 | 0 | 16 |
| FILAS/SLA/AGENTES | 12 | 4 | 0 | 16 |
| IA/VOZ/AUDIO | 13 | 3 | 0 | 16 |
| INBOX/CONVERSAS/MENSAGENS | 11 | 5 | 0 | 16 |
| SEGURANCA/COMPLIANCE/ADMIN | 10 | 6 | 0 | 16 |

## Destaques

- **Núcleo de atendimento sólido**: Inbox (11/16 Full), Contatos (11/16), WhatsApp (11/16), IA (13/16), Filas (12/16) — os fluxos principais estão fim-a-fim conectados.
- **E-mail é o maior gap**: 0/14 Full — cisão gmail_*/email_*, contrato gmail-sync fechado, refresh de token morto em 3 caminhos, realtime admin com schema errado.
- **Campanhas é o 2º maior gap**: 1/14 Full — Talkx existe mas o ecossistema de campanhas está majoritariamente back-end/latente.
- **Wire-check estrutural LIMPO**: 61/61 RPCs reais, 57/57 edges invocadas existem, 41/41 canais realtime apontam para tabelas na publication. Nenhum fio F-01..F-06 clássico.
- **Fios quebrados reais estão no comportamento**: AdminQueuesPage NOOPs (7 ações), atribuição automática com apply:false (localStorage), CSAT sem produtor, agendadas sem worker, quick replies em 3 tabelas divergentes, RPC business hours quebrada pós-migração, feature flags órfãs, 2FA sem challenge no login, LGPD com deleção fictícia, IP/geo sem enforcement.

## BACKLOG PRIORIZADO

### Quick wins (esforço P — 15)

| ID | Recurso | O que falta |
|---|---|---|
| AUTOMACOES-04 | Painel de execuções de chatbot | RLS/grants de zapp.chatbot_executions não verificados; nenhum produtor grava nela (evolution-chatbot grava em  |
| AUTOMACOES-06 | Mensagem de ausência | Nenhum edge/consumer lê away_messages em runtime (grep em supabase/functions só achou external-db-proxy allowl |
| CAMPANHAS-03 | Lista de destinatários de campanha | RPC íntegro e funcional, mas fluxo sem disparo e 0 linhas na tabela (db_uso.txt não lista campaign_contacts).  |
| CAMPANHAS-05 | Disparo manual TalkX (start/pause/cancel) | Engine funcional (service role bypassa RLS), mas único trigger é useTalkX dentro de TalkXView — UI inacessível |
| CAMPANHAS-06 | Disparo agendado TalkX (scheduled_at) | NENHUM trigger: db_crons.txt (146 jobs pg_cron) não tem job talkx/scheduler e invoke_calls_front.txt não invoc |
| CAMPANHAS-07 | Monitoramento ao vivo TalkX | Fio realtime ÍNTEGRO (publication cobre as duas tabelas físicas), mas UI montada dentro de TalkXView — inacess |
| CAMPANHAS-12 | Blacklist TalkX | UI montada dentro de TalkXView — inacessível (ver CAMPANHAS-04). RLS off na tabela hoje (writes funcionam), ma |
| CAMPANHAS-14 | NPS agendado (scheduler) | Sem trigger: sem cron pg_cron (db_crons.txt não lista nps) e sem invoke do front (invoke_calls_front.txt não l |
| EMAIL-06 | Rascunhos (auto-save) | gmail-send NÃO implementa 'createDraft'/'updateDraft' — handler só tem saveDraft/deleteDraft (gmail-send/index |
| EMAIL-12 | Revalidação de credencial / refresh de token | FIOS QUEBRADOS: (a) emailRefreshToken (gmailApi.ts:220-230) invoca gmail-token-refresh SEM action → default re |
| EMAIL-13 | Health check do e-mail (admin) | FIOS QUEBRADOS: (a) fetch primário GET /functions/v1/email-health (useEmailHealthStatus.ts:57-65) → edge inexi |
| FILAS-04 | Routing rules (fila/canal) | Tabela zapp.queue_routing_rules (routing rules de FILA) sem nenhum consumidor front/edge; feature vive apenas  |
| INBOX-07 | Snooze conversa | ConversationList.tsx:254 renderiza ConversationContextMenu SEM passar onSnooze -> itens do menu de snooze são  |
| WHATSAPP-05 | Templates WhatsApp (HSM) | Sem dados (0 templates em zapp.whatsapp_templates); edge evolution-templates nunca é invocada pelo front (0 ma |
| WHATSAPP-12 | Bloqueio/pausa de instância | UI ÓRFÃ: AdminInstancePausesPage exportada em lazyViews.ts:133 mas AUSENTE do VIEW_MAP (src/pages/ViewRouter.t |

### Esforço médio (M — 43)

| ID | Recurso | O que falta |
|---|---|---|
| AUTOMACOES-01 | Regras de automação (CRUD) | RLS de zapp.automations não localizada nas migrations ativas; 0 linhas no DB; duplicidade automations vs autom |
| AUTOMACOES-02 | Execuções de automação + sugestão IA | Depende de AUTOMACOES-01 populado (0 regras → 0 execuções); logs admin /admin/automations/logs ok mas vazios |
| AUTOMACOES-03 | Chatbot flow builder | 0 linhas; edge evolution-chatbot responde via evolution_chatbot_responses sem vincular a chatbot_flows; sem pr |
| AUTOMACOES-05 | Quick replies | Front usa message_templates; zapp.quick_replies órfã; evo.evolution_quick_replies=13 sem consumo — 3 tabelas p |
| AUTOMACOES-07 | Auto-close de conversas | Sem cron/agendador no db_crons; edge referencia contacts/messages sem schema confirmado (auto-close index.ts:4 |
| AUTOMACOES-08 | Business hours | public.is_within_business_hours (search_path=public) consulta business_hours movida p/ zapp → RPC provavelment |
| CAMPANHAS-02 | Teste A/B de campanha (variantes) | Sem engine estatístico nem integração com disparo: variante é só dado. Policy campaign_ab_select é SELECT-only |
| CAMPANHAS-04 | Campanha TalkX (broadcast) | 2 fios quebrados: (1) view 'talkx' registrada no ViewRouter mas NENHUM nav/trigger navega para ela (grep 'talk |
| CAMPANHAS-11 | Relatório agendado | Edge ÓRFÃ: invoke_calls_front.txt só lista talkx-add-recipients e talkx-control (send-scheduled-report NUNCA i |
| CAMPANHAS-13 | Orçamento marketing WhatsApp | Sem UI, sem função visível em migrations (grep 'marketing' no canonical só acha índices mortos), sem referênci |
| CONTATOS-04 | Campos customizados | NENHUM componente UI renderiza campos customizados (grep useContactCustomFields em *.tsx sem consumidor fora d |
| CONTATOS-12 | Exportação (CSV) | Export puramente client-side (download do que já está na tela): sem RPC/edge de export, sem escrita em zapp.co |
| CONTATOS-14 | Vínculo com empresa | Nenhum .from('companies') no src (tabela órfã com 4 linhas); vínculo real no app é só o campo texto company do |
| CONTATOS-16 | Bloqueio de contato (WhatsApp) | SEM UI: componente BlockContactDialog documentado no mapping NÃO existe em src/ (grep sem resultado); updateBl |
| DASHBOARD-03 | KPIs diários (mv_daily_metrics) | UI/hook consumindo mv_daily_metrics — nenhum painel lê os KPIs |
| DASHBOARD-04 | NPS (pesquisas e score) | Trigger do nps-scheduler (sem cron, sem invoke) — automação de campanhas nunca dispara; tabela com 0 linhas |
| DASHBOARD-05 | CSAT (satisfação e auto-config) | Coleta automática: NENHUM edge/webhook escreve csat_surveys (grep supabase/functions vazio) e csat_auto_config |
| DASHBOARD-07 | Notificações in-app e canais (app_notifications + canais/templates) | Badge de não-lidas: IndexContentConnected.tsx:94 passa unreadNotifications={0} hardcoded (rpc_app_bootstrap re |
| DASHBOARD-13 | Integração Sicoob (bridge e outbox) | pg_cron para sicoob-outbox-consumer (fio quebrado: consumidor nunca roda); tabelas com 0 linhas; dashboard só  |
| DASHBOARD-17 | Health score e observabilidade (client-observability) | NENHUM painel de health score no front (grep 'healthScore' em src/ só acha number_reputation.health_score) — s |
| DASHBOARD-18 | Media pipeline (download queue, scan e cache) | UI de monitoramento da fila/scan: nenhum painel lê media_download_queue/media_scan_log (grep src/ só acha medi |
| EMAIL-01 | Conectar conta Gmail (OAuth) | EmailChatInbox (rota email-chat, useEmail.ts) espera data.authUrl mas edge devolve data.url → popup nunca abre |
| EMAIL-05 | Enviar e-mail (novo/reply, CC/BCC, anexos) | Assinatura NUNCA anexada ao body (EmailChatReplyBar.tsx:130-141 envia só bodyHtml; gmail-send ignora campo sig |
| EMAIL-07 | Labels (sistema + personalizadas) | syncLabels grava email_app.gmail_labels, mas a UI lê email_app.email_labels — store mismatch (mesma cisão EMAI |
| EMAIL-08 | Assinaturas de e-mail | Sem tela de gestão: save/remove/setDefault (useEmailSignature.ts:40-109) não são chamados por NENHUMA UI (grep |
| EMAIL-09 | Templates de e-mail | ZERO referências em src/ (grep email_templates src/ vazio fora de types.ts) — sem UI, sem hook, sem RPC; Messa |
| EMAIL-10 | Tracking de abertura (pixel) | Nenhuma UI/frontend (invoke_calls_front.txt não lista; grep src/ vazio); gmail-send NÃO injeta pixel em mensag |
| EMAIL-11 | Tracking de clique (links) | Sem UI/frontend; nenhum link é reescrito no envio (gmail-send não processa links); tabelas vazias; sem testes |
| EMAIL-14 | Buscar e-mails | textSearch('subject') exige coluna tsvector — subject é text na view zapp.email_threads (SELECT * de email_app |
| FILAS-12 | Presenca do agente | zapp.agent_presence (realtime publicada) sem nenhum subscriber em src/ (grep verificou zero); zapp.agents sem  |
| FILAS-13 | Atribuicao automatica / rebalanceamento | Cron queue-rebalance-every-5min nao existe em producao (snapshot 2026-08-04) - rebalanceamento automatico via  |
| IA-07 | Resumo de conversa | Edge dedicada ai-conversation-summary órfã (nunca invocada); tabela conversation_summaries sem leitura/escrita |
| IA-14 | Agente de voz | Fio quebrado: edge voice-agent existe mas nunca é invocada pela UI; overlay de voz usa apenas SpeechRecognitio |
| IA-15 | Copiloto de voz | Edge voice-copilot-action órfã (nunca invocada); handler é stub local; escrita em voice_command_logs morta. |
| INBOX-08 | Fechar conversa | Status 'resolved' do ticket é só overlay localStorage (ticketStore.ts:19; useTicketStatus.ts:29-32 setStatus)  |
| INBOX-09 | CSAT pós-conversa | zapp.csat_responses nunca é escrita pelo front (só types.ts) — coleta de respostas pós-conversa não conectada; |
| INBOX-12 | Atribuir / transferir conversa | Transferência manual persiste em contacts.assigned_to (fio OK), mas zapp.conversation_transfers (na publicatio |
| SEGURANCA-01 | Login com 2FA | Nenhum navigate('/2fa') no codebase; login (Auth.tsx/useAuthForm) não trata challenge MFA obrigatório — só enr |
| SEGURANCA-09 | ACL de e-mail | Zero referências no front — alerta cego, sem UI |
| SEGURANCA-14 | Feature flags / kill switches | loadFeatureFlags() nunca é chamado (flagCache sempre null → defaults); system_kill_switches sem consumidor; ki |
| WHATSAPP-06 | Cloud API Meta (modo oficial WhatsApp Business) | Sem credencial oficial ativa (whatsapp_official_credentials=0; 3 conexões em modo evolution); legacy whatsapp- |
| WHATSAPP-10 | Follow-up automático de conversas | UI gerencia sequências locais (0 linhas) enquanto a edge evolution-followup lê evo.evolution_followup_rules —  |
| WHATSAPP-14 | Automações auxiliares Evolution (chatbot, sentiment, bitrix-sync) | As 3 edges estão deployadas porém quebradas (500/404/503) e sem qualquer consumidor no front; o app tem implem |

### Esforço grande (G — 16): decisão de produto

| ID | Recurso | O que falta |
|---|---|---|
| AUTOMACOES-09 | Follow-up sequences | Cron sem fonte no repo (sem edge nem SQL fn); followup_executions 0 linhas; engine de execução não rastreável; |
| AUTOMACOES-12 | Agendamentos cron customizados | Zero UI/hook no front (grep em src não achou consumidores); backend sem produtor evidenciado |
| CAMPANHAS-01 | Criar/gerenciar campanha clássica | Motor de disparo: nenhum edge/cron envia campanhas clássicas (TalkX tem os edges, clássica não). RLS: canonica |
| CAMPANHAS-08 | Follow-up automático | Fio fragmentado: UI grava zapp.followup_sequences/steps, mas o edge processa evo.evolution_followups (0 linhas |
| CAMPANHAS-09 | Mensagem agendada (chat) | DISPARADOR INEXISTENTE: nenhuma edge (grep scheduled_messages em supabase/functions = vazio) nem cron processa |
| CONTATOS-07 | Segmentos | Zero código frontend (sem hook, sem RPC, sem UI). Único 'segmento' visível é RFM vindo de CRM externo (Externa |
| DASHBOARD-08 | Notificações por canal (channels/templates) | UI, hook e executor — nada lê/escreve as tabelas |
| DASHBOARD-16 | Relatórios agendados | Fio quebrado crítico: front grava scheduled_report_configs, edge lê scheduled_reports (tabela diferente) → rel |
| EMAIL-02 | Conectar conta IMAP/SMTP (não-Gmail) | Sem UI, sem hook, sem chamada frontend (invoke_calls_front.txt não lista email-imap-bridge); implementação aut |
| EMAIL-03 | Listar threads do inbox | Store vazia: email_app.email_threads=0 linhas (db_uso.txt) — edges de sync escrevem em gmail_threads (gmail-sy |
| EMAIL-04 | Ler mensagens de uma thread | email_app.email_messages=0 linhas (db_uso.txt) — edges gravam gmail_messages (gmail-sync/index.ts:606, gmail-w |
| FILAS-14 | Transferencia com comentario | Fluxo de transferencia nao escreve em conversation_transfers nem transfer_comments - o historico pago (rpc_lis |
| INBOX-15 | Mensagens agendadas | NENHUM worker envia as mensagens: db_crons.txt (146 jobs) não tem cron de scheduled_messages, nenhuma edge é i |
| SEGURANCA-04 | Bloqueio de IP / whitelist | Enforcement: login-attempts e demais edges nunca consultam blocked_ips; whitelist sem uso |
| SEGURANCA-05 | Geo-blocking | Nenhuma edge verifica país no login; 0 linhas |
| SEGURANCA-10 | LGPD (consentimento, export, deleção) | Export bloqueado por policy (toast); deleção só loga gdpr_deletion_request — não insere em zapp.data_deletion_ |

### Suggested (1) — avaliar

- **AUTOMACOES-13** Feriados: evo.evolution_holidays=11 (db_uso) + menção textual em supabase/migrations/20260804000000_canonical_schema.sql:6975 (lista evolution_holiday

## Riscos

1. **Módulos Full que dependem de dados zero**: 9 recursos Full do Inbox têm em_uso=nao — feature pronta mas nunca exercitada em produção.
2. **Backend-only latente**: ~128 RPCs e ~53 edges sem consumo no front (capacidade pronta, sem UI).
3. **RPC business hours com search_path=public pós-move** — falha silenciosa tratada como 'aberto'.
4. **ACL de e-mail cega**: 2189 alertas gerados por cron sem nenhum consumidor.
5. **Anomalia de deploy**: gmail-tests.test.ts deployado como edge function.