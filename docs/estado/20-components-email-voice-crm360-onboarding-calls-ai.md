# Estado: Components — email, voice, crm360, onboarding, evoApiHealth, calls, transitions, integrations, ai

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 68/68

## 1. Visão Geral

68 arquivos distribuídos em 9 diretórios de componentes. O padrão dominante é EM_USO (55 arquivos), com 9 órfãos compostos majoritariamente por arquivos de teste (`__tests__/`) e utilitários internos de diretório. Os módulos de `integrations/` concentram os stubs funcionais mais críticos (GoogleCalendar, N8n, Sentry). O módulo `email/` tem uma duplicata viva (`EmailChatBubble-v2`). O módulo `calls/` tem gaps de segurança VoIP documentados em teste mas não resolvidos.

### Tabela de Arquivos

| arquivo | linhas | o que faz | EM_USO/ORFAO | COMPLETA/PARCIAL/STUB/MORTA | o que falta |
|---------|--------|-----------|--------------|------------------------------|-------------|
| `ai/AutoTicketClassifier.tsx` | 266 | Classifica tickets via Edge Fn `ai-classify-tickets` + safeClient | EM_USO | COMPLETA | — |
| `ai/ChurnPredictionDashboard.tsx` | 274 | Dashboard de risco de churn via `dbFrom` + Edge Fn `ai-churn-analysis` | EM_USO | COMPLETA | — |
| `ai/classifyChurnRisk.ts` | 25 | Pure fn: score → nível de risco (critical/high/medium/low) | ORFAO | COMPLETA | Sem reexport no barrel do diretório |
| `ai/__tests__/AutoTicketClassifier.test.tsx` | 259 | Testes do AutoTicketClassifier | ORFAO | COMPLETA | — |
| `ai/__tests__/ChurnPredictionDashboard.test.tsx` | 250 | Testes do ChurnPredictionDashboard | ORFAO | COMPLETA | — |
| `ai/__tests__/classifyChurnRisk.test.ts` | 86 | Testes unitários de boundary de classifyChurnRisk | ORFAO | COMPLETA | — |
| `calls/CallDialog.tsx` | 288 | UI de chamada em andamento (aceitar/recusar/encerrar) | EM_USO | COMPLETA | — |
| `calls/DialPad.tsx` | 213 | Discador numérico SIP | ORFAO | COMPLETA | Só importado por VoIPPanel no mesmo dir |
| `calls/IncomingCallAlert.tsx` | 203 | Alerta de chamada entrante (dual source: legado + broadcast) | EM_USO | PARCIAL | Migração legado pendente |
| `calls/VoIPPanel.tsx` | 367 | Painel SIP: configuração, histórico, discador | EM_USO | PARCIAL | 8 gaps de segurança/funcionalidade documentados |
| `calls/__tests__/DialPad.test.tsx` | 298 | Testes do DialPad | ORFAO | COMPLETA | — |
| `calls/__tests__/VoIPPanel.test.tsx` | 107 | Testes do VoIPPanel | ORFAO | PARCIAL | Mock de `useSipClient` aponta path errado |
| `calls/__tests__/voip-security-gaps.test.ts` | 153 | Documentação de gaps de segurança VoIP | ORFAO | PARCIAL | 8 GAPs abertos, 14 fixos |
| `crm360/CRM360ExplorerView.tsx` | 98 | View principal do módulo CRM360: abas e roteamento | EM_USO | COMPLETA | — |
| `crm360/CRM360StatsCards.tsx` | 69 | Cards de contagem via `useExternalSelect` | EM_USO | COMPLETA | — |
| `crm360/CompanyFormDialog.tsx` | 238 | Dialog criação/edição de empresa via `useExternalMutation` | EM_USO | COMPLETA | — |
| `crm360/ContactFormDialog.tsx` | 268 | Dialog criação/edição de contato via `useExternalMutation` | EM_USO | COMPLETA | — |
| `crm360/DataExplorerTable.tsx` | 172 | Tabela genérica de exploração com busca, paginação e CSV | EM_USO | COMPLETA | — |
| `crm360/__tests__/crm360TabsConfig.test.ts` | 299 | Testes de `formatCellValue`, `RFM_SEGMENT_COLORS`, `TABS` | EM_USO | COMPLETA | — |
| `crm360/crm360TabsConfig.ts` | 88 | Re-exporta TabConfig; define TABS, formatCellValue, exportToCSV, RFM_SEGMENT_COLORS | EM_USO | COMPLETA | — |
| `crm360/crm360TabsData.ts` | 580 | Definições estáticas de 30+ abas com colunas, labels, editable | EM_USO | COMPLETA | — |
| `email/EmailAttachmentPreview.tsx` | 173 | Renderiza lista de anexos com download/preview | EM_USO | COMPLETA | — |
| `email/EmailChatBubble-v2.tsx` | 113 | Variante DOM-native do bubble com sanitizeHtmlWithHooks | ORFAO | PARCIAL | `EmailChatBubbleV2` sem consumidor externo real |
| `email/EmailChatBubble.tsx` | 416 | Bubble principal: expande/colapso, ações, SLA badge, anexos | EM_USO | COMPLETA | `onForward` delegado ao pai sem default |
| `email/EmailChatInbox.tsx` | 165 | Shell do inbox: thread selecionada, busca, multi-conta | EM_USO | COMPLETA | — |
| `email/EmailChatReplyBar.tsx` | 457 | Barra de resposta: compose, templates, assinatura, SLA, DOMPurify | EM_USO | PARCIAL | EMAIL-05: assinatura ignorada pela edge `gmail-send` |
| `email/EmailChatThread.tsx` | 192 | Thread de mensagens em ordem cronológica com SLAProgressBar | EM_USO | COMPLETA | — |
| `email/EmailSLABadge.tsx` | 157 | Badge/Dot/ProgressBar de SLA | EM_USO | COMPLETA | — |
| `email/EmailSearchBar.tsx` | 101 | Busca full-text de threads via `useEmailSearch` | EM_USO | COMPLETA | — |
| `email/EmailThreadList.tsx` | 289 | Lista de threads com filtros, SLADot e seleção | EM_USO | COMPLETA | Importa `EmailThread` de fonte divergente |
| `email/index.ts` | 33 | Barrel export do módulo email | EM_USO | COMPLETA | — |
| `evoApiHealth/KpiCard.tsx` | 30 | Card de KPI com ícone, valor e warning | EM_USO | COMPLETA | — |
| `evoApiHealth/Stat.tsx` | 18 | Stat label+value+status para HealthTab | EM_USO | COMPLETA | — |
| `evoApiHealth/tabs/AlertsTab.tsx` | 77 | Lista alertas ativos com acknowledge | EM_USO | COMPLETA | — |
| `evoApiHealth/tabs/ChannelsTab.tsx` | 74 | Lista canais de alerta (Slack/Discord/Webhook) com teste | EM_USO | COMPLETA | — |
| `evoApiHealth/tabs/DrTab.tsx` | 66 | DR health + runbook de recuperação | EM_USO | COMPLETA | — |
| `evoApiHealth/tabs/HealthTab.tsx` | 63 | Dashboard principal com KpiCards e Stats | EM_USO | COMPLETA | — |
| `evoApiHealth/tabs/HistoryTab.tsx` | 61 | Histórico de snapshots de saúde | EM_USO | COMPLETA | — |
| `integrations/BitrixIntegrationView.tsx` | 149 | Config Bitrix24 webhook; chama Edge Fn `bitrix-api` | EM_USO | PARCIAL | Sem persistência de config no DB |
| `integrations/EvolutionApiIntegrationView.tsx` | 381 | Gestão completa de instâncias Evolution API | EM_USO | COMPLETA | — |
| `integrations/GoogleCalendarIntegration.tsx` | 153 | Tela de conexão Google Calendar | EM_USO | STUB | handleConnect apenas exibe toast; sem OAuth real |
| `integrations/IntegrationsHub.tsx` | 132 | Hub que navega entre os 4 views de integração | EM_USO | COMPLETA | GoogleCalendar não está no hub (rota separada) |
| `integrations/N8nIntegrationView.tsx` | 199 | Config n8n webhooks | EM_USO | STUB | handleConnect sem persistência/validação real |
| `integrations/SentryIntegrationView.tsx` | 186 | Config Sentry + lista de erros | EM_USO | STUB | Erros mockErrors hardcoded; connect apenas seta estado |
| `onboarding/OnboardingChecklist.tsx` | 143 | Lista de tarefas de onboarding com progresso e dismiss | EM_USO | COMPLETA | Sem `useReducedMotion` |
| `onboarding/OnboardingTour.tsx` | 75 | Provider do tour guiado; re-exporta useTour e steps | EM_USO | COMPLETA | — |
| `onboarding/TourOverlay.tsx` | 255 | Overlay portal com spotlight e tooltips animados | EM_USO | COMPLETA | Não honra `prefers-reduced-motion` |
| `onboarding/WelcomeModal.tsx` | 152 | Modal de boas-vindas com animações Framer Motion | EM_USO | COMPLETA | Não honra `prefers-reduced-motion` |
| `onboarding/__tests__/OnboardingTour.test.tsx` | 285 | Testes do TourProvider/Overlay | EM_USO | COMPLETA | — |
| `onboarding/__tests__/defaultTourSteps.test.ts` | 142 | Testes das steps padrão | EM_USO | COMPLETA | — |
| `onboarding/defaultTourSteps.ts` | 53 | Array DEFAULT_ONBOARDING_STEPS com 5 steps em pt-BR | EM_USO | COMPLETA | Steps não verificam existência dos seletores DOM |
| `onboarding/tourContext.tsx` | 37 | Context + useTour hook + tipos TourStep/TourContextType | EM_USO | COMPLETA | — |
| `transitions/PageTransition.tsx` | 66 | AnimatePresence + motion.div por rota; honra useReducedMotion | EM_USO | COMPLETA | — |
| `transitions/TransitionProvider.tsx` | 67 | Context para variante/direção de transição; usePageTransition | EM_USO | COMPLETA | — |
| `transitions/__tests__/transitionVariants.test.ts` | 272 | Testes de buildVariants, reduced-motion, variants | EM_USO | COMPLETA | — |
| `transitions/index.ts` | 15 | Barrel de exports do módulo transitions | EM_USO | COMPLETA | — |
| `transitions/transitionVariants.ts` | 130 | buildVariants(), DEFAULT_EASE/DURATION, REDUCED_MOTION_* | EM_USO | COMPLETA | — |
| `transitions/useReducedMotion.ts` | 22 | Hook reativo para prefers-reduced-motion via matchMedia | EM_USO | COMPLETA | — |
| `voice/AudioFrequencyVisualizer.tsx` | 169 | Canvas animado de barras de frequência por fase de voz | EM_USO | COMPLETA | — |
| `voice/ElevenLabsDialogue.tsx` | 199 | UI geração áudio multi-voz via Edge Fn `elevenlabs-dialogue` | EM_USO | COMPLETA | — |
| `voice/ElevenLabsVoiceDesign.tsx` | 208 | Lista vozes ElevenLabs + preview TTS via Edge Fn `elevenlabs-voice` | EM_USO | COMPLETA | — |
| `voice/FloatingParticles.tsx` | 160 | Canvas de partículas animadas que reagem à fase de voz | EM_USO | COMPLETA | — |
| `voice/VoiceOrb.tsx` | 185 | Orbe visual animada por fase (framer-motion) | EM_USO | COMPLETA | — |
| `voice/VoiceSearchOverlay.tsx` | 146 | Modal overlay de busca por voz (portal); orquestra subcomponentes | EM_USO | COMPLETA | — |
| `voice/VoiceSearchOverlayConnected.tsx` | 144 | Adaptador Web Speech API → edge `voice-agent`; lazy-loaded | EM_USO | COMPLETA | — |
| `voice/VoiceSuggestions.tsx` | 48 | Chips de sugestão animados; 3 sugestões hardcoded | EM_USO | COMPLETA | Sugestões não dinâmicas |
| `voice/VoiceTranscriptArea.tsx` | 104 | Área de transcrição parcial/final e resposta do agente | EM_USO | COMPLETA | — |
| `voice/usePhaseColors.ts` | 85 | Hook: VoiceAgentPhase → cores HSL + prefers-color-scheme | EM_USO | COMPLETA | — |

---

## 2. Fluxos Funcionais

### AI — Classificação e Predição
`AutoTicketClassifier` → `safeClient` (zapp) + Edge Fn `ai-classify-tickets` → tabela `ai_conversation_tags`
`ChurnPredictionDashboard` → `dbFrom` (`contacts`) + Edge Fn `ai-churn-analysis`
`classifyChurnRisk` (pure fn, usada internamente)

### Calls — VoIP SIP
`IncomingCallAlert` → `useIncomingCallListener` (legado) + `useIncomingCallBroadcast` → `CallDialog`
`VoIPPanel` → `useSipClient` + Edge Fn `get-sip-password` + `useCallsHistory`
`DialPad` → usado apenas por `VoIPPanel` (sub-componente interno)

### CRM360 — Exploração de Dados Externos
`CRM360ExplorerView` → tabs com `CRM360StatsCards`, `DataExplorerTable`, `CompanyFormDialog`, `ContactFormDialog`
Tudo via `useExternalApiManagement` (hook) → API externa de CRM (não Supabase direto)
`crm360TabsData` → 30+ tabs definidas → `crm360TabsConfig` → `DataExplorerTable`

### Email — Chat de Email
`EmailChatInbox` → `useEmail` + `useGmailOAuthFlow` + `GmailAccountSelector`
→ `EmailThreadList` → seleciona thread → `EmailChatThread` → `EmailChatBubble`
→ `EmailChatReplyBar` → `emailSendMessage` (Edge Fn `gmail-send`)
`EmailSLABadge` / `EmailSearchBar` — consumidos inline

### EvoApiHealth — Monitoramento da Evolution API
`AdminEvoApiHealthPage` → `HealthTab` (KpiCards + Stats) + `AlertsTab` + `ChannelsTab` + `HistoryTab` + `DrTab`
Dados via `lib/evoApiHealth/hooks` → view `evo_api.v_alert_channels_health`

### Integrations — Hub de Integrações
`IntegrationsHub` → `EvolutionApiIntegrationView` (funcional) + `BitrixIntegrationView` (parcial)
+ `N8nIntegrationView` (stub) + `SentryIntegrationView` (stub)
`GoogleCalendarIntegration` — acessível apenas via rota direta (fora do hub)

### Onboarding — Tour Guiado
`OnboardingTour` (Provider) → `tourContext` → `TourOverlay` (portal animado)
`WelcomeModal` → exibido na primeira sessão
`OnboardingChecklist` → `useOnboardingChecklist` → `profiles`, `onboarding_steps`

### Transitions — Animações de Rota
`TransitionProvider` → `usePageTransition` → `PageTransition` (`AnimatePresence` + `motion.div`)
`useReducedMotion` + `transitionVariants.buildVariants()` → animações acessíveis

### Voice — Busca e Síntese por Voz
`VoiceSearchOverlayConnected` → `Web Speech API` + `processVoiceTranscript` → Edge Fn `voice-agent`
→ `VoiceSearchOverlay` → `VoiceOrb` + `FloatingParticles` + `AudioFrequencyVisualizer` + `VoiceTranscriptArea` + `VoiceSuggestions`
`ElevenLabsDialogue` / `ElevenLabsVoiceDesign` → SettingsView → Edge Fns `elevenlabs-dialogue` / `elevenlabs-voice`

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

| Tipo | Nome | Módulo |
|------|------|--------|
| Tabela (zapp) | `ai_conversation_tags` | ai/AutoTicketClassifier |
| Tabela (zapp) | `contacts` | ai/ChurnPredictionDashboard |
| Tabela (zapp) | `profiles`, `onboarding_steps` | onboarding (via hook) |
| Tabela (CRM ext.) | `companies`, `contacts`, `customers`, `salespeople`, `leads`, `deals` e 20+ | crm360 (via useExternalApiManagement) |
| Tabela (email_app) | `email_templates` | email/EmailChatReplyBar (via useEmailTemplates) |
| View (evo_api) | `v_alert_channels_health` | evoApiHealth (via lib/hooks) |
| Edge Function | `ai-classify-tickets` | ai/AutoTicketClassifier |
| Edge Function | `ai-churn-analysis` | ai/ChurnPredictionDashboard |
| Edge Function | `get-sip-password` | calls/VoIPPanel |
| Edge Function | `gmail-send` | email/EmailChatReplyBar |
| Edge Function | `bitrix-api` | integrations/BitrixIntegrationView |
| Edge Function | `voice-agent` | voice/VoiceSearchOverlayConnected |
| Edge Function | `elevenlabs-dialogue` | voice/ElevenLabsDialogue |
| Edge Function | `elevenlabs-voice` | voice/ElevenLabsVoiceDesign |
| Realtime | Nenhuma subscription direta nesses componentes | — |

---

## 4. Exports Públicos por Categoria

**ai/**: `AutoTicketClassifier` (default), `ChurnPredictionDashboard` (default), `classifyChurnRisk` (named — sem barrel)

**calls/**: `CallDialog`, `DialPad`, `IncomingCallAlert`, `VoIPPanel`

**crm360/**: `CRM360ExplorerView`, `CRM360StatsCards`, `CompanyFormDialog`, `ContactFormDialog`, `DataExplorerTable`, `crm360TabsConfig`, `crm360TabsData`, tipos `TabConfig`

**email/** (barrel index.ts): `EmailChatInbox`, `EmailChatThread`, `EmailChatBubble`, `EmailChatBubbleDOMSafe` (v2 alias), `EmailChatReplyBar`, `EmailThreadList`, `EmailSearchBar`, `EmailSLABadge`, `EmailAttachmentPreview`, `EmailChatBubbleProps`

**evoApiHealth/**: `KpiCard`, `Stat`, `AlertsTab`, `ChannelsTab`, `DrTab`, `HealthTab`, `HistoryTab`

**integrations/**: `IntegrationsHub`, `BitrixIntegrationView`, `EvolutionApiIntegrationView`, `GoogleCalendarIntegration`, `N8nIntegrationView`, `SentryIntegrationView`

**onboarding/**: `OnboardingTour`, `OnboardingChecklist`, `TourOverlay`, `WelcomeModal`, `tourContext` (useTour, TourContextType, TourStep), `defaultTourSteps`

**transitions/** (barrel index.ts): `PageTransition`, `TransitionProvider`, `usePageTransition`, `transitionVariants`, `useReducedMotion`, tipos `TransitionVariant`, `TransitionDirection`

**voice/**: `AudioFrequencyVisualizer`, `ElevenLabsDialogue`, `ElevenLabsVoiceDesign`, `FloatingParticles`, `VoiceOrb`, `VoiceSearchOverlay`, `VoiceSearchOverlayConnected`, `VoiceSuggestions`, `VoiceTranscriptArea`, `usePhaseColors`

---

## 5. Chama (Saída)

| Dependência externa | Consumidores |
|---------------------|-------------|
| `@/integrations/supabase/client` | AutoTicketClassifier, ChurnPredictionDashboard, VoIPPanel, BitrixIntegrationView, ElevenLabsDialogue, ElevenLabsVoiceDesign, VoiceSearchOverlayConnected |
| `@/integrations/supabase/safeClient` | AutoTicketClassifier |
| `@/integrations/datasource/db` (dbFrom) | ChurnPredictionDashboard |
| `@/features/inbox` (VoiceAgentPhase, hooks) | voice/* |
| `@/features/inbox/hooks/voice/*` | VoiceSearchOverlayConnected |
| `@/hooks/useIncomingCallListener` | IncomingCallAlert (legado) |
| `@/hooks/useIncomingCallBroadcast` | IncomingCallAlert |
| `@/hooks/useCallsHistory`, `useSipClient`, `useCalls` | VoIPPanel |
| `@/hooks/useExternalApiManagement` | crm360/* |
| `@/hooks/useEmail`, `useEmailManagement`, `useEmailSearch` | email/* |
| `@/hooks/gmail/gmailApi`, `gmailTypes` | email/* |
| `@/hooks/useGmailOAuthFlow` | EmailChatInbox |
| `@/hooks/useVoiceManagement` | VoiceSearchOverlayConnected |
| `@/hooks/useBitrixApi` | BitrixIntegrationView |
| `@/hooks/useEvolutionApiIntegration` | EvolutionApiIntegrationView |
| `@/hooks/useOnboardingChecklist` | OnboardingChecklist |
| `@/lib/evoApiHealth/types`, `hooks` | evoApiHealth/tabs/* |
| `@/lib/onboarding/checklistSteps` | OnboardingChecklist |
| `@/lib/audit` (logAudit) | CallDialog |
| `@/lib/sanitize` (sanitizeHtmlWithHooks) | EmailChatBubble-v2 |
| `@/lib/logger` | ChurnPredictionDashboard, ElevenLabsVoiceDesign, EmailChatBubble-v2 |
| `@/lib/formatters` | EmailAttachmentPreview, EmailChatBubble |
| `@/types/externalDB` (ExternalTableName) | crm360/* |
| `@/types/gmail` | EmailThreadList (fonte divergente) |
| `framer-motion` | voice/*, onboarding/*, transitions/*, email/EmailChatBubble |
| `react-dom` (createPortal) | TourOverlay, VoiceSearchOverlay |
| `react-router-dom` | transitions/PageTransition |
| `dompurify` | EmailChatBubble, EmailChatReplyBar, EmailChatBubble-v2 |
| `date-fns` / `ptBR` | calls/CallDialog, crm360TabsConfig |
| `sonner` | ai/*, calls/*, voice/ElevenLabsDialogue |

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa | importadores |
|---------|-------------|-------------|
| `ai/AutoTicketClassifier.tsx` | `lazyViews.ts`, `ViewRouter.tsx` | 2 |
| `ai/ChurnPredictionDashboard.tsx` | `lazyViews.ts`, `ViewRouter.tsx` | 2 |
| `calls/CallDialog.tsx` | `IncomingCallAlert`, `ChatDialogs` | 2 |
| `calls/IncomingCallAlert.tsx` | `ContactHeaderSection`, `ChatDialogs` | 2 |
| `calls/VoIPPanel.tsx` | `lazyViews.ts`, `ViewRouter.tsx` | 2 |
| `crm360/CRM360ExplorerView.tsx` | `lazyViews.ts`, `ViewRouter.tsx` | 2 |
| `crm360/CRM360StatsCards.tsx` | `CRM360ExplorerView` | 1 |
| `crm360/CompanyFormDialog.tsx` | `CRM360ExplorerView` | 1 |
| `crm360/ContactFormDialog.tsx` | `CRM360ExplorerView` | 1 |
| `crm360/DataExplorerTable.tsx` | `CRM360ExplorerView` | 1 |
| `crm360/crm360TabsConfig.ts` | `CRM360ExplorerView`, `DataExplorerTable`, testes | 3 |
| `crm360/crm360TabsData.ts` | `crm360TabsConfig` | 1 |
| `email/index.ts` (barrel) | múltiplas views de email | N |
| `email/EmailChatBubble.tsx` | `EmailChatThread` | 1 |
| `email/EmailChatInbox.tsx` | view de email | 1+ |
| `email/EmailChatBubble-v2.tsx` | `email/index.ts` (re-export) — sem consumidor externo real | 0 externos |
| `evoApiHealth/*` | `AdminEvoApiHealthPage` | 1 |
| `integrations/IntegrationsHub.tsx` | `ConnectionsIntegrationsHub` | 1 |
| `integrations/GoogleCalendarIntegration.tsx` | `ViewRouter.tsx` (rota direta) | 1 |
| `integrations/BitrixIntegrationView.tsx` | `IntegrationsHub` | 1 |
| `integrations/EvolutionApiIntegrationView.tsx` | `IntegrationsHub` | 1 |
| `integrations/N8nIntegrationView.tsx` | `IntegrationsHub` | 1 |
| `integrations/SentryIntegrationView.tsx` | `IntegrationsHub` | 1 |
| `onboarding/*` | `AppShell`, `ViewRouter`, contexto global | 2+ |
| `transitions/*` | `AppShell`, roteador de views | 2+ |
| `voice/VoiceSearchOverlayConnected.tsx` | `AppShell` (lazy) | 1 |
| `voice/ElevenLabsDialogue.tsx` | `SettingsView` | 1 |
| `voice/ElevenLabsVoiceDesign.tsx` | `SettingsView` | 1 |
| `voice/VoiceSearchOverlay.tsx` | `VoiceSearchOverlayConnected` | 1 |
| `voice/AudioFrequencyVisualizer.tsx` | `VoiceSearchOverlay` | 1 |
| `voice/FloatingParticles.tsx` | `VoiceSearchOverlay` | 1 |
| `voice/VoiceOrb.tsx` | `VoiceSearchOverlay` | 1 |
| `voice/VoiceSuggestions.tsx` | `VoiceSearchOverlay` | 1 |
| `voice/VoiceTranscriptArea.tsx` | `VoiceSearchOverlay` | 1 |
| `voice/usePhaseColors.ts` | `AudioFrequencyVisualizer`, `VoiceOrb`, `VoiceSearchOverlay` | 3 |

---

## 7. Órfãos

Lista fechada de arquivos com zero importadores fora do próprio diretório:

| arquivo | tamanho | veredito | motivo |
|---------|---------|----------|--------|
| `ai/__tests__/AutoTicketClassifier.test.tsx` | 259 linhas | SEGURO | Arquivo de teste — executado pelo runner, não importado |
| `ai/__tests__/ChurnPredictionDashboard.test.tsx` | 250 linhas | SEGURO | Arquivo de teste — executado pelo runner, não importado |
| `ai/__tests__/classifyChurnRisk.test.ts` | 86 linhas | SEGURO | Arquivo de teste — executado pelo runner, não importado |
| `ai/classifyChurnRisk.ts` | 25 linhas | SEGURO | Pure fn usada internamente em `ai/`; sem barrel reexport mas sem consumers externos conhecidos. Baixo risco |
| `calls/DialPad.tsx` | 213 linhas | SEGURO | Sub-componente interno de VoIPPanel; a separação é intencional |
| `calls/__tests__/DialPad.test.tsx` | 298 linhas | SEGURO | Arquivo de teste — executado pelo runner, não importado |
| `calls/__tests__/VoIPPanel.test.tsx` | 107 linhas | SEGURO | Arquivo de teste — executado pelo runner, não importado |
| `calls/__tests__/voip-security-gaps.test.ts` | 153 linhas | NAO_REMOVER | Documentação viva de 8 gaps de segurança VoIP abertos; remoção apagaria o rastreamento dos gaps |
| `email/EmailChatBubble-v2.tsx` | 113 linhas | VERIFICAR | `EmailChatBubbleV2` não tem consumidor externo real apesar de re-exportado como `EmailChatBubbleDOMSafe` no barrel. Candidato a remoção se v2 nunca for adotado |

---

## 8. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| `ai/AutoTicketClassifier.tsx` | COMPLETA | — |
| `ai/ChurnPredictionDashboard.tsx` | COMPLETA | — |
| `ai/classifyChurnRisk.ts` | COMPLETA | — |
| `ai/__tests__/*` (3 arquivos) | COMPLETA | — |
| `calls/CallDialog.tsx` | COMPLETA | — |
| `calls/DialPad.tsx` | COMPLETA | — |
| `calls/IncomingCallAlert.tsx` | PARCIAL | Migração de dual source (legado + broadcast) incompleta |
| `calls/VoIPPanel.tsx` | PARCIAL | 8 gaps de segurança/funcionalidade documentados |
| `calls/__tests__/DialPad.test.tsx` | COMPLETA | — |
| `calls/__tests__/VoIPPanel.test.tsx` | PARCIAL | Mock de `useSipClient` aponta path errado |
| `calls/__tests__/voip-security-gaps.test.ts` | PARCIAL | 8 GAPs abertos aguardando implementação |
| `crm360/*` (8 arquivos) | COMPLETA | — |
| `email/EmailAttachmentPreview.tsx` | COMPLETA | — |
| `email/EmailChatBubble-v2.tsx` | PARCIAL | `EmailChatBubbleV2` sem consumidor externo |
| `email/EmailChatBubble.tsx` | COMPLETA | `onForward` delegado ao pai (intencional) |
| `email/EmailChatInbox.tsx` | COMPLETA | — |
| `email/EmailChatReplyBar.tsx` | PARCIAL | EMAIL-05: assinatura ignorada pela edge `gmail-send`; EMAIL-09: template sem preview |
| `email/EmailChatThread.tsx` | COMPLETA | — |
| `email/EmailSLABadge.tsx` | COMPLETA | — |
| `email/EmailSearchBar.tsx` | COMPLETA | — |
| `email/EmailThreadList.tsx` | COMPLETA | — |
| `email/index.ts` | COMPLETA | — |
| `evoApiHealth/*` (7 arquivos) | COMPLETA | — |
| `integrations/BitrixIntegrationView.tsx` | PARCIAL | Sem persistência de config no DB após teste |
| `integrations/EvolutionApiIntegrationView.tsx` | COMPLETA | — |
| `integrations/GoogleCalendarIntegration.tsx` | STUB | OAuth não implementado; handleConnect = toast |
| `integrations/IntegrationsHub.tsx` | COMPLETA | — |
| `integrations/N8nIntegrationView.tsx` | STUB | handleConnect sem backend; estado apenas local |
| `integrations/SentryIntegrationView.tsx` | STUB | mockErrors hardcoded; sem API real |
| `onboarding/*` (8 arquivos) | COMPLETA | TourOverlay/WelcomeModal sem `useReducedMotion` |
| `transitions/*` (6 arquivos) | COMPLETA | — |
| `voice/*` (10 arquivos) | COMPLETA | VoiceSuggestions com sugestões hardcoded |

---

## 9. Achados

### A1 — Credenciais SIP compartilhadas por todos os agentes (risco de segurança)
`calls/__tests__/voip-security-gaps.test.ts:19-21` — GAP documentado e não resolvido: `phone1` + senha única compartilhada por todos os agentes; sem isolamento por perfil. Risco de acesso cruzado a chamadas entre agentes.

### A2 — Dual source de chamada entrante: migração incompleta
`calls/IncomingCallAlert.tsx:22-26` — `legacyCall ?? broadcastCall`: dois hooks de chamada entrante ativos simultaneamente (`useIncomingCallListener` legado + `useIncomingCallBroadcast` novo). Fallback duplo pode causar inconsistência de estado de chamadas.

### A3 — Mock de VoIPPanel.test aponta path errado
`calls/__tests__/VoIPPanel.test.tsx:27` — `vi.mock('@/hooks/useSipClient')` mas VoIPPanel importa de `@/features/inbox`. Mock nunca intercepta a implementação real; testes podem passar em falso positivo.

### A4 — EmailChatBubble-v2 duplicata sem consumidor
`email/EmailChatBubble-v2.tsx` — exporta `EmailChatBubble` (nome idêntico ao v1) + `EmailChatBubbleV2`. O barrel reexporta como `EmailChatBubbleDOMSafe`, mas nenhuma tela consome `EmailChatBubbleV2` externamente. Candidato à remoção se v2 não for adotado.

### A5 — Divergência de fonte do tipo EmailThread
`email/EmailThreadList.tsx:14` — importa `EmailThread` de `@/types/gmail`; demais arquivos do módulo importam de `@/hooks/gmail/gmailTypes`. Duas definições separadas do mesmo tipo; risco de dessincronia silenciosa de campos.

### A6 — EMAIL-05: assinatura ignorada pela edge gmail-send
`email/EmailChatReplyBar.tsx:133` — comentário documentado: a edge `gmail-send` não anexa assinatura ao email enviado, mesmo que o usuário configure uma. Bug funcional aberto.

### A7 — Três integrações completamente stub em produção (sem feature flag)
`integrations/GoogleCalendarIntegration.tsx:20-23` — handleConnect = `toast.info` apenas.
`integrations/N8nIntegrationView.tsx:38-43` — handleConnect = `setIsConnected(true)` local.
`integrations/SentryIntegrationView.tsx:30-33` — `mockErrors` hardcoded, connect sem API.
Todos renderizados sem feature flag; usuário vê UI funcional mas nenhuma ação persiste.

### A8 — URL de produção Evolution hardcoded no bundle
`integrations/EvolutionApiIntegrationView.tsx:17` — importa `DEFAULT_URL = 'https://evolution.atomicabr.com.br'` de hook de integração; URL de produção exposta no bundle JavaScript.

### A9 — TourOverlay e WelcomeModal ignoram prefers-reduced-motion
`onboarding/TourOverlay.tsx:115-251` — 13+ usos de `motion.*` sem `useReducedMotion`. `onboarding/WelcomeModal.tsx:22-149` — mesmo padrão. Inconsistente com `transitions/PageTransition` que já implementa o hook corretamente. Viola acessibilidade para usuários com vestibular disorders.

### A10 — FloatingParticles: nome colide com componente do dashboard
`voice/FloatingParticles.tsx` (160 linhas, aceita `phase: VoiceAgentPhase`) coexiste com `src/components/dashboard/FloatingParticles.tsx` (111 linhas, `forwardRef` sem props). Contextos diferentes, mas nome idêntico pode causar import incorreto sem erro de compilação.

### A11 — ElevenLabsDialogue usa fetch direto em vez de supabase.functions.invoke
`voice/ElevenLabsDialogue.tsx:81-88` — fetch direto à edge function, inconsistente com `ElevenLabsVoiceDesign` que usa `supabase.functions.invoke`. Sem erro funcional, mas dificulta padronização de error handling e interceptação de auth.

### A12 — tourContext sem guard para uso fora do Provider
`onboarding/tourContext.tsx` — `useTour()` lança exceção runtime se usado fora do `OnboardingTour` Provider. Sem mensagem de erro amigável; erro genérico de context undefined.

### A13 — crm360TabsData usa `ExternalTableName | string` como tipo de id
`crm360/crm360TabsData.ts:37` — o tipo `id: ExternalTableName | string` permite ids de aba não reconhecidos pela tipagem, causando silently-ignored queries no hook. Escape hatch não protegido.

### A14 — VoIPPanel: ausência de SRTP e 4 funcionalidades core não implementadas
`calls/__tests__/voip-security-gaps.test.ts:118,70,85,92,97` — GAPs documentados: sem criptografia SRTP de mídia, sem chamada entrante via SIP nativo, sem call transfer, sem hold/resume, sem gravação. Documentados como failing tests, não como TODOs no código principal.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
