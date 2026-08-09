# Estado: components/security, components/queues, components/mobile

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 51/51

## 1. Visão Geral

Três módulos de componentes com 51 arquivos: **mobile** (14 arq — shell móvel, PiP, swipe, voz, notificações), **queues** (16 arq — CRUD de filas, SLA, gráficos comparativos) e **security** (21 arq — audit logs, dispositivos, passkeys, bloqueio de IP/geo, rate-limit, reset de senha, VirusTotal).

### Tabela de Arquivos

| arquivo | linhas | o que faz | status | impl |
|---------|--------|-----------|--------|------|
| mobile/InAppNotification.tsx | 74 | Toast animado iOS-style (drag-to-dismiss, auto-timer) | EM_USO | COMPLETA |
| mobile/InAppNotificationProvider.tsx | 36 | Context + Provider para toasts in-app | EM_USO | COMPLETA |
| mobile/MiniChatPiP.tsx | 220 | Picture-in-Picture flutuante de chat com drag e quick reply | EM_USO | COMPLETA |
| mobile/MobileDrawerMenu.tsx | 310 | Drawer lateral (nav, busca, recentes, tema, logout) | ORFAO¹ | COMPLETA |
| mobile/MobileFAB.tsx | 118 | FAB multi-ação (nova conversa/contato/campanha) | ORFAO¹ | COMPLETA |
| mobile/MobileHeader.tsx | 155 | Header fixo com menu, avatar, badge de notificações | ORFAO¹ | COMPLETA |
| mobile/MobilePullToRefresh.tsx | 48 | Indicador visual de pull-to-refresh (sem lógica de gesture) | EM_USO | COMPLETA |
| mobile/MobileShell.tsx | 114 | Orquestra Header+Drawer+Notif+FAB+BottomNav | EM_USO | COMPLETA |
| mobile/NotificationsPanel.tsx | 178 | Painel slide-down de notificações com badge | ORFAO¹ | COMPLETA |
| mobile/SwipeableMessage.tsx | 92 | Wrapper de mensagem com swipe esq/dir (reply/forward) | EM_USO | COMPLETA |
| mobile/VoiceDictationButton.tsx | 89 | Botão dictation via Web Speech API (pt-BR) | EM_USO | COMPLETA |
| mobile/__tests__/MiniChatPiP.test.tsx | 108 | Testes unitários do PiP; mocka framer-motion | ORFAO | COMPLETA |
| mobile/__tests__/SwipeableMessage.test.tsx | 58 | Testes de swipe; mocka framer-motion + use-mobile | ORFAO | COMPLETA |
| mobile/__tests__/VoiceDictationButton.test.tsx | 65 | Testes do botão de voz; mocka useSpeechToText | ORFAO | COMPLETA |
| queues/AddMemberDialog.tsx | 112 | Dialog para adicionar membros a fila via fetchActiveProfiles | EM_USO | COMPLETA |
| queues/CreateQueueDialog.tsx | 127 | Dialog para criar fila com nome, descrição e cor | EM_USO | COMPLETA |
| queues/PeriodSelector.tsx | 202 | Seletor de período (7d/14d/30d/custom) com calendário | EM_USO | COMPLETA |
| queues/QueueAlertsDisplay.tsx | 98 | Exibe alertas animados de fila (espera, tempo, taxa) | EM_USO | COMPLETA |
| queues/QueueCard.tsx | 97 | Card de fila com membros e ações de gerenciamento | ORFAO² | COMPLETA |
| queues/QueueCharts.tsx | 248 | Gráficos analíticos de fila (area/bar/line) via recharts | EM_USO | COMPLETA |
| queues/QueueGoalsDialog.tsx | 262 | Dialog de metas e alertas de fila via useQueueGoals | EM_USO | COMPLETA |
| queues/QueueSlaPanel.tsx | 457 | Painel SLA com filtros de instância/agente/canal/habilidade | EM_USO | COMPLETA |
| queues/QueuesComparisonCharts.tsx | 105 | Gráficos bar + radar de comparação de filas | EM_USO | COMPLETA |
| queues/QueuesComparisonDashboard.tsx | 318 | Dashboard de comparação de filas com seletor de período | EM_USO | COMPLETA |
| queues/QueuesView.tsx | 276 | View principal de filas: CRUD, membros, metas, alertas | EM_USO | COMPLETA |
| queues/SLAAgentTable.tsx | 98 | Tabela de agentes com métricas SLA (TMA, cumprimento) | EM_USO | COMPLETA |
| queues/SLADashboard.tsx | 349 | Dashboard SLA: cards, painel, histórico, config | EM_USO | COMPLETA |
| queues/SLAMetricCards.tsx | 121 | Cards animados de métricas SLA com sparklines | EM_USO | COMPLETA |
| queues/__tests__/chartConfig.test.ts | 113 | Testa constantes de estilo Recharts | ORFAO | COMPLETA |
| queues/chartConfig.ts | 24 | Exporta constantes de estilo para Recharts | EM_USO | COMPLETA |
| security/AuditLogDashboard.tsx | 279 | Dashboard de audit_logs com filtros e paginação | EM_USO | COMPLETA |
| security/BlockedIPDialogs.tsx | 97 | Dialogs de bloquear/desbloquear IP | ORFAO¹ | COMPLETA |
| security/BlockedIPsPanel.tsx | 156 | Lista IPs bloqueados; abre BlockedIPDialogs | EM_USO | COMPLETA |
| security/DeviceCard.tsx | 220 | Card de dispositivo (SessionCard + DeviceCard, OS/browser) | ORFAO¹ | COMPLETA |
| security/DevicesPanel.tsx | 212 | Painel de sessões/dispositivos via useDeviceDetection | EM_USO | COMPLETA |
| security/GeoBlockingPanel.tsx | 158 | Painel de bloqueio geográfico por país | EM_USO | COMPLETA |
| security/IPWhitelistPanel.tsx | 279 | CRUD de whitelist de IPs via useIPWhitelist | EM_USO | COMPLETA |
| security/PasskeyDialogs.tsx | 86 | Dialogs de registro/renomeação de passkeys | ORFAO¹ | COMPLETA |
| security/PasskeysPanel.tsx | 331 | Painel WebAuthn via useWebAuthn + react-query | EM_USO | COMPLETA |
| security/PasswordResetRequestsPanel.tsx | 307 | Admin de aprovação/rejeição de reset de senha com realtime | EM_USO | COMPLETA |
| security/RateLimitConfigPanel.tsx | 280 | Config de rate-limit; lê/salva rate_limit_configs | EM_USO | PARCIAL |
| security/RateLimitRealtimeAlerts.tsx | 172 | Alertas flutuantes via realtime (security_alerts) | EM_USO | COMPLETA |
| security/RejectResetDialog.tsx | 46 | Dialog de rejeição de reset de senha com motivo | ORFAO¹ | COMPLETA |
| security/SecurityNotificationsPanel.tsx | 206 | Configura push notifications de segurança | EM_USO | PARCIAL |
| security/SecurityOverview.tsx | 303 | Visão geral de segurança (score, MFA, devices, alertas) | EM_USO | COMPLETA |
| security/SecurityPanels.tsx | 135 | Sub-painéis SecurityAlertsPanel + SecurityDevicesPanel | EM_USO | COMPLETA |
| security/SecuritySettingsPanel.tsx | 231 | Config de segurança pessoal (MFA, senha, reauth) | EM_USO | COMPLETA |
| security/SecurityView.tsx | 213 | Container com 11 abas de segurança (entry point lazy-loaded) | EM_USO | COMPLETA |
| security/VirusTotalConfig.tsx | 124 | Formulário para testar chave API VirusTotal via EF | EM_USO | PARCIAL |
| security/__tests__/AuditLogDashboard.test.tsx | 160 | Testes unitários do AuditLogDashboard | ORFAO | COMPLETA |
| security/__tests__/RateLimitConfigPanel.test.tsx | 228 | Testes unitários do RateLimitConfigPanel | ORFAO | COMPLETA |

> ¹ ORFAO por definição (zero importadores fora do próprio diretório) mas transitivamente EM_USO — ver seção 7.
> ² QueueCard: zero importadores externos; existe versão paralela em `src/pages/admin/queues/QueueCard.tsx`.

---

## 2. Fluxos Funcionais

### Fluxo mobile — atendimento
```
AppShell → MobileShell → MobileHeader (badge notif) + MobileDrawerMenu (nav) + MobileFAB (ações)
RealtimeInboxView → MiniChatPiP (PiP de conversa)
ConversationListSidebar → MobilePullToRefresh (indicador visual)
MessageBubble → SwipeableMessage → onSwipeLeft(reply) / onSwipeRight(forward)
TeamChatInputArea → VoiceDictationButton → Web Speech API pt-BR
App.tsx → InAppNotificationProvider → InAppNotification (toast)
```

### Fluxo queues — gestão de filas
```
ViewRouter / lazyViews → QueuesView → QueueCard + CreateQueueDialog + AddMemberDialog
                                       + QueueGoalsDialog + QueueAlertsDisplay
QueuesComparison page → QueuesComparisonDashboard → QueuesComparisonCharts + PeriodSelector
                                                      → useQueuesComparison
QueueDetails page → QueueCharts → useQueueAnalytics
SLADashboard page / ViewRouter → SLADashboard → QueueSlaPanel (rpc_queue_sla_panel)
                                               + SLAMetricCards + SLAAgentTable
                                               + SLAConfigurationManager / SLARulesManager
```

### Fluxo security — painel de segurança
```
ViewRouter / lazyViews → SecurityView (11 abas) →
  aba "overview"    → SecurityOverview → SecurityPanels (Alerts + Devices)
  aba "audit"       → AuditLogDashboard → useAuditLogsDashboard → audit_logs
  aba "devices"     → DevicesPanel → DeviceCard → useDeviceDetection
  aba "passkeys"    → PasskeysPanel → PasskeyDialogs → useWebAuthn
  aba "blocked-ips" → BlockedIPsPanel → BlockedIPDialogs → useBlockedIPs
  aba "whitelist"   → IPWhitelistPanel → useIPWhitelist
  aba "geo"         → GeoBlockingPanel → useGeoBlocking
  aba "rate-limit"  → RateLimitConfigPanel → useRateLimitConfigs → rate_limit_configs
  aba "alerts"      → RateLimitRealtimeAlerts (realtime INSERT security_alerts)
  aba "resets"      → PasswordResetRequestsPanel → RejectResetDialog
                        → realtime password_reset_requests
                        → EF approve-password-reset
  aba "settings"    → SecuritySettingsPanel → MFASettings + ReauthDialog
                    → SecurityNotificationsPanel → usePushNotifications
  aba "virustotal"  → VirusTotalConfig → EF virustotal-test
```

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

### Tabelas (schema `zapp`)
| tabela | componentes que acessam |
|--------|------------------------|
| `queues` | useQueues (QueuesView, QueueCard, SLADashboard) |
| `queue_members` | useQueues |
| `queue_goals` | useQueueGoals (QueueGoalsDialog, QueueAlertsDisplay) |
| `queue_skill_requirements` | QueueSlaPanel (query na montagem) |
| `profiles` | useActiveProfiles (AddMemberDialog) |
| `audit_logs` | useAuditLogsDashboard (AuditLogDashboard) |
| `blocked_ips` | useBlockedIPs (BlockedIPsPanel) |
| `ip_whitelist` | useIPWhitelist (IPWhitelistPanel) |
| `rate_limit_configs` | useRateLimitConfigs (RateLimitConfigPanel) |
| `password_reset_requests` | PasswordResetRequestsPanel (realtime + safeClient) |
| `security_alerts` | useSecurityAlerts / RateLimitRealtimeAlerts |
| `user_devices` / `user_sessions` | useDeviceDetection (DevicesPanel) |
| `passkeys` | useWebAuthn (PasskeysPanel) |
| `push_subscriptions` | usePushNotifications / useSecurityPushNotifications |
| `geo_blocking_settings` / `geo_blocked_countries` | useGeoBlocking (GeoBlockingPanel) |
| `channel_connections` | QueueSlaPanel (query na montagem) |

### RPCs
| rpc | componente |
|-----|-----------|
| `rpc_queue_sla_panel` | useQueueSlaPanel (QueueSlaPanel) |
| `rpc_queue_rebalance_candidates` | useQueueManagement (QueuesView) |
| RPCs SLA | useSLAMetrics, useSLAHistory (SLADashboard) |

### Canais Realtime
| canal | schema | tabela | trigger | componente |
|-------|--------|--------|---------|-----------|
| `security_alerts_*` | `zapp` | `security_alerts` | INSERT | RateLimitRealtimeAlerts |
| `pwd_reset_*` | `zapp` | `password_reset_requests` | INSERT/UPDATE | PasswordResetRequestsPanel |

### Edge Functions
| função | componente |
|--------|-----------|
| `approve-password-reset` | PasswordResetRequestsPanel |
| `virustotal-test` | VirusTotalConfig + useIPWhitelist |

---

## 4. Exports Públicos por Categoria

**Providers:** `InAppNotificationProvider`, `InAppNotification`

**Views (entry points lazy-loaded):** `QueuesView`, `SLADashboard`, `QueuesComparisonDashboard`, `AuditLogDashboard`, `SecurityView`

**Painéis de segurança:** `BlockedIPsPanel`, `DevicesPanel`, `GeoBlockingPanel`, `IPWhitelistPanel`, `PasskeysPanel`, `PasswordResetRequestsPanel`, `RateLimitConfigPanel`, `RateLimitRealtimeAlerts`, `SecurityNotificationsPanel`, `SecurityOverview`, `SecurityPanels`, `SecuritySettingsPanel`, `VirusTotalConfig`

**Painéis de fila:** `QueueSlaPanel`, `QueueAlertsDisplay`, `QueueCharts`, `QueuesComparisonCharts`

**Dialogs:** `AddMemberDialog`, `CreateQueueDialog`, `QueueGoalsDialog`, `BlockedIPDialogs`, `PasskeyDialogs`, `RejectResetDialog`

**Cards e tabelas:** `QueueCard`, `SLAAgentTable`, `SLAMetricCards`, `DeviceCard`

**Shell e componentes móveis:** `MobileShell`, `MobileDrawerMenu`, `MobileFAB`, `MobileHeader`, `MobilePullToRefresh`, `NotificationsPanel`, `SwipeableMessage`, `VoiceDictationButton`, `MiniChatPiP`

**Utilitários:** `PeriodSelector`, `chartConfig` (constantes Recharts)

---

## 5. Chama (Saída)

**Hooks internos do projeto**
- `useQueues`, `useQueueGoals`, `useQueueAnalytics`, `useQueueSlaPanel`, `useQueuesComparison`, `useQueueManagement`
- `useSLAMetrics`, `useSLAHistory`, `useAuditLogsDashboard`
- `useBlockedIPs`, `useIPWhitelist`, `useGeoBlocking`, `useDeviceDetection`, `useWebAuthn`, `useRateLimitConfigs`
- `useSecurityAlerts`, `useUserSecurityAlerts`, `usePushNotifications`, `useSecurityPushNotifications`
- `useActiveProfiles`, `useSpeechToText`, `useTheme`, `useKeyboardHeight`, `useIsMobile`, `useMountedRef`

**Feature modules**
- `@/features/auth` — `useAuth`, `useMFA`, `useUserRole`, `useReauthentication`, `MFASettings`, `ReauthDialog`
- `@/features/sla` — `useSLAMetrics`, `useSLAHistory`

**Integrações Supabase**
- `@/integrations/supabase/client` (supabase)
- `@/integrations/supabase/safeClient` (safeFrom — PasswordResetRequestsPanel, DevicesPanel)

**Componentes externos a este conjunto**
- `@/components/settings/SLAConfigurationManager`, `SLARulesManager`
- `@/components/reports/ExportButton`
- `@/components/layout/PageHeader`, `sidebarNavConfig`, `SidebarNavItem`
- `@/components/dashboard/FloatingParticles`
- `@/components/effects/AuroraBorealis`
- `@/components/ui/*` (shadcn/ui — button, dialog, card, badge, tabs, input, switch, etc.)

**Libs externas**
- `recharts`, `framer-motion`, `date-fns`, `lucide-react`, `sonner`, `react-router-dom`, `@tanstack/react-query`

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa | qtd |
|---------|-------------|-----|
| InAppNotification + Provider | `src/App.tsx` | 1 |
| MiniChatPiP | `src/features/inbox/components/RealtimeInboxView.tsx` | 1 |
| MobileShell | `src/components/layout/AppShell.tsx` | 1 |
| MobilePullToRefresh | `src/features/inbox/components/ConversationListSidebar.tsx` | 1 |
| SwipeableMessage | `src/features/inbox/components/chat/MessageBubble.tsx` | 1 |
| VoiceDictationButton | `src/components/team-chat/TeamChatInputArea.tsx` | 1 |
| QueuesView | `src/pages/lazyViews.ts`, `src/pages/ViewRouter.tsx` | 2 |
| SLADashboard | `src/pages/SLADashboard.tsx`, `src/pages/lazyViews.ts`, `src/pages/ViewRouter.tsx`, `src/components/routing/AppRoutes.tsx` | 4 |
| QueuesComparisonDashboard | `src/pages/QueuesComparison.tsx` | 1 |
| AuditLogDashboard | `src/pages/lazyViews.ts`, `src/pages/ViewRouter.tsx` | 2 |
| chartConfig | `src/components/dashboard/AIStatsWidget.tsx`, `__tests__/chartConfig.test.ts` | 2 |
| SecurityView | `src/pages/lazyViews.ts`, `src/pages/ViewRouter.tsx` | 2 |
| BlockedIPsPanel, IPWhitelistPanel | `SecurityView.tsx`, `src/pages/RateLimitDashboard.tsx` | 2 |
| DevicesPanel, PasskeysPanel, GeoBlockingPanel, PasswordResetRequestsPanel | `SecurityView.tsx` | 1 |
| RateLimitConfigPanel, RateLimitRealtimeAlerts, SecurityNotificationsPanel, SecuritySettingsPanel | `SecurityView.tsx` | 1 |
| SecurityOverview | `SecurityView.tsx` | 1 |
| SecurityPanels | `SecurityOverview.tsx` | 1 |
| QueueSlaPanel, SLAMetricCards, SLAAgentTable | `SLADashboard.tsx` (interno) | 1 |
| PeriodSelector | `QueueCharts.tsx`, `QueuesComparisonDashboard.tsx` | 2 |
| QueueCharts | `src/pages/QueueDetails.tsx` | 1 |
| RejectResetDialog | `PasswordResetRequestsPanel.tsx` (interno security/) | 1 |
| BlockedIPDialogs | `BlockedIPsPanel.tsx` (interno security/) | 1 |
| PasskeyDialogs | `PasskeysPanel.tsx` (interno security/) | 1 |
| DeviceCard | `DevicesPanel.tsx` (interno security/) | 1 |

---

## 7. Orfãos

### Arquivos de teste (6) — SEGURO
Não são importados; são executados pelo runner de testes. Removíveis somente se o componente associado for removido.

| arquivo | linhas | veredito |
|---------|--------|---------|
| mobile/__tests__/MiniChatPiP.test.tsx | 108 | SEGURO |
| mobile/__tests__/SwipeableMessage.test.tsx | 58 | SEGURO |
| mobile/__tests__/VoiceDictationButton.test.tsx | 65 | SEGURO |
| queues/__tests__/chartConfig.test.ts | 113 | SEGURO |
| security/__tests__/AuditLogDashboard.test.tsx | 160 | SEGURO |
| security/__tests__/RateLimitConfigPanel.test.tsx | 228 | SEGURO |

### Sub-componentes internos ao mobile/ (4) — NAO_REMOVER
Zero importadores fora de `mobile/`, mas consumidos por `MobileShell` que é EM_USO em `AppShell.tsx`. Remoção quebraria o shell móvel.

| arquivo | linhas | veredito | observação |
|---------|--------|---------|------------|
| MobileDrawerMenu.tsx | 310 | NAO_REMOVER | importado por MobileShell |
| MobileFAB.tsx | 118 | NAO_REMOVER | importado por MobileShell |
| MobileHeader.tsx | 155 | NAO_REMOVER | importado por MobileShell |
| NotificationsPanel.tsx | 178 | VERIFICAR | importado por MobileShell mas `notifications=[]` sempre — painel nunca exibe dados reais |

### Sub-componentes internos ao security/ (4) — NAO_REMOVER
Dialogs e cards usados pelos seus respectivos painéis no mesmo diretório.

| arquivo | linhas | veredito | observação |
|---------|--------|---------|------------|
| BlockedIPDialogs.tsx | 97 | NAO_REMOVER | usado por BlockedIPsPanel |
| DeviceCard.tsx | 220 | NAO_REMOVER | usado por DevicesPanel |
| PasskeyDialogs.tsx | 86 | NAO_REMOVER | usado por PasskeysPanel |
| RejectResetDialog.tsx | 46 | NAO_REMOVER | usado por PasswordResetRequestsPanel |

### Componente duplicado em queues/ (1) — VERIFICAR
| arquivo | linhas | veredito | observação |
|---------|--------|---------|------------|
| QueueCard.tsx | 97 | VERIFICAR | Zero importadores externos; existe duplicata em `src/pages/admin/queues/QueueCard.tsx` (187 linhas); risco de divergência de comportamento |

**Total orfãos: 15** (6 testes + 4 mobile internos + 4 security internos + 1 queue duplicado)

---

## 8. Implementação por Arquivo

| arquivo | impl | o que falta |
|---------|------|-------------|
| mobile/InAppNotification.tsx | COMPLETA | — |
| mobile/InAppNotificationProvider.tsx | COMPLETA | — |
| mobile/MiniChatPiP.tsx | COMPLETA | — |
| mobile/MobileDrawerMenu.tsx | COMPLETA | — |
| mobile/MobileFAB.tsx | COMPLETA | — |
| mobile/MobileHeader.tsx | COMPLETA | viewLabels hardcoded; novas views não aparecem automaticamente |
| mobile/MobilePullToRefresh.tsx | COMPLETA | lógica de gesture fica no pai; apenas indicador |
| mobile/MobileShell.tsx | COMPLETA | notifications[] sempre vazio; busca mobile sem UI conectada |
| mobile/NotificationsPanel.tsx | COMPLETA | produtor de notificações ausente |
| mobile/SwipeableMessage.tsx | COMPLETA | — |
| mobile/VoiceDictationButton.tsx | COMPLETA | — |
| mobile/__tests__/* | COMPLETA | ausência de testes de acessibilidade e gestos reais |
| queues/AddMemberDialog.tsx | COMPLETA | queueId recebido como _queueId (não usado no corpo) |
| queues/CreateQueueDialog.tsx | COMPLETA | cores parcialmente hardcoded (#EC4899, #06B6D4) |
| queues/PeriodSelector.tsx | COMPLETA | — |
| queues/QueueAlertsDisplay.tsx | COMPLETA | return null sem placeholder visual quando alerts vazio |
| queues/QueueCard.tsx | COMPLETA | — |
| queues/QueueCharts.tsx | COMPLETA | — |
| queues/QueueGoalsDialog.tsx | COMPLETA | — |
| queues/QueueSlaPanel.tsx | COMPLETA | sem cache para queries de filtros na montagem |
| queues/QueuesComparisonCharts.tsx | COMPLETA | — |
| queues/QueuesComparisonDashboard.tsx | COMPLETA | 5 Object.fromEntries() sem useMemo |
| queues/QueuesView.tsx | COMPLETA | — |
| queues/SLAAgentTable.tsx | COMPLETA | — |
| queues/SLADashboard.tsx | COMPLETA | rota registrada em dois lugares (ver A1) |
| queues/SLAMetricCards.tsx | COMPLETA | — |
| queues/chartConfig.ts | COMPLETA | — |
| queues/__tests__/chartConfig.test.ts | COMPLETA | — |
| security/AuditLogDashboard.tsx | COMPLETA | busca sem debounce (ver A6) |
| security/BlockedIPDialogs.tsx | COMPLETA | — |
| security/BlockedIPsPanel.tsx | COMPLETA | sem realtime; mudanças externas não refletem |
| security/DeviceCard.tsx | COMPLETA | — |
| security/DevicesPanel.tsx | COMPLETA | — |
| security/GeoBlockingPanel.tsx | COMPLETA | único painel a usar react-query (inconsistência) |
| security/IPWhitelistPanel.tsx | COMPLETA | sem realtime |
| security/PasskeyDialogs.tsx | COMPLETA | — |
| security/PasskeysPanel.tsx | COMPLETA | — |
| security/PasswordResetRequestsPanel.tsx | COMPLETA | mistura supabase + safeClient (ver A8) |
| security/RateLimitConfigPanel.tsx | PARCIAL | action sempre 'block'; DEFAULT_RULES hardcoded como fallback |
| security/RateLimitRealtimeAlerts.tsx | COMPLETA | — |
| security/RejectResetDialog.tsx | COMPLETA | — |
| security/SecurityNotificationsPanel.tsx | PARCIAL | _requestPermission e _security declarados mas não usados |
| security/SecurityOverview.tsx | COMPLETA | double cast as unknown as Record<string,unknown> em normalizeUserDevice |
| security/SecurityPanels.tsx | COMPLETA | — |
| security/SecuritySettingsPanel.tsx | COMPLETA | — |
| security/SecurityView.tsx | COMPLETA | — |
| security/VirusTotalConfig.tsx | PARCIAL | chave testada mas nunca persistida |
| security/__tests__/* | COMPLETA | — |

---

## 9. Achados

### A1 — SLADashboard registrado em duas rotas
`src/components/routing/AppRoutes.tsx:128` registra `/sla` via `pages/SLADashboard` e `src/pages/ViewRouter.tsx:136` via `lazyViews.SLADashboardView`. Risco de rota sobreposta ou instância duplicada do componente.

### A2 — VirusTotalConfig não persiste a chave API
`security/VirusTotalConfig.tsx:27–60` — API key inserida pelo usuário é testada via Edge Function `virustotal-test` mas **nunca salva**. Usuário precisa reinserir a cada sessão; funcionalidade incompleta.

### A3 — QueueCard duplicado com versão admin
`src/components/queues/QueueCard.tsx` (97 linhas) e `src/pages/admin/queues/QueueCard.tsx` (187 linhas) são dois componentes distintos com o mesmo nome. AdminQueuesPage usa a versão admin; QueuesView usa a versão components/. Risco de divergência de comportamento.

### A4 — RateLimitConfigPanel: action sempre 'block' e DEFAULT_RULES hardcoded
`security/RateLimitConfigPanel.tsx:26` — `useRateLimitConfigs` faz cast `action: 'block' as RateLimitRule['action']` ignorando o valor real do banco. Campos `throttle`/`alert` configurados pelo usuário são perdidos ao recarregar. O array `DEFAULT_RULES` (5 regras hardcoded) é usado como fallback quando DB retorna vazio, podendo sobrescrever config real em caso de erro de query.

### A5 — MobileShell: NotificationsPanel sempre vazio
`mobile/MobileShell.tsx:39` — `notifications` inicializa como `[]` e nunca recebe dados reais. `handleMarkAllNotificationsRead` é dead code funcional. NotificationsPanel renderiza mas exibe sempre "Nenhuma notificação".

### A6 — AuditLogDashboard sem debounce na busca
`security/AuditLogDashboard.tsx:68` — campo de busca chama `fetchAuditLogs` a cada keystroke sem throttle/debounce; pode gerar múltiplas queries rápidas.

### A7 — SecurityNotificationsPanel: bindings mortos e cast inseguro
`security/SecurityNotificationsPanel.tsx:18` — `_requestPermission` destrutado do hook mas nunca invocado. Linhas 23–24: `_security` e `_securityNotificationsEnabled` declarados mas não consumidos no render; cast `as { isEnabled?: boolean }` é inseguro pois o tipo real do hook é desconhecido.

### A8 — PasswordResetRequestsPanel mistura dois clientes Supabase
`security/PasswordResetRequestsPanel.tsx:47/59` usa `supabase` (cliente padrão) para o canal realtime enquanto `safeClient.from('password_reset_requests_safe')` (linha 65–66) é usado para leitura. Inconsistência de cliente no mesmo componente pode gerar problemas com RLS ou schema mismatch.

### A9 — MobileShell FAB navega para views em vez de criar
`mobile/MobileShell.tsx:93–98` — `onNewConversation` redireciona para `/inbox` em vez de abrir modal de criação; `onNewContact` e `onNewCampaign` fazem o mesmo. O FAB não cria nada, apenas muda de view.

### A10 — chartConfig duplicado com nome colidente
`queues/chartConfig.ts` exporta constantes de estilo Recharts. `src/components/dashboard/AIStatsWidget.tsx:56` define um `chartConfig` local com o mesmo nome. Nomenclatura idêntica pode causar confusão em imports futuros.

### A11 — GeoBlockingPanel único com react-query; demais usam useState+useEffect manual
`security/GeoBlockingPanel.tsx` é o único painel do módulo security/ a usar `@tanstack/react-query`. Os demais (BlockedIPsPanel, IPWhitelistPanel, DevicesPanel, etc.) usam padrão `useState`+`useEffect` manual — inconsistência de padrão de fetching no mesmo módulo.

### A12 — MobileHeader.viewLabels hardcoded sem cobertura de novas views
`mobile/MobileHeader.tsx:19–40` — mapa estático `viewLabels` lista traduções de views. Novas views adicionadas ao roteamento não aparecem com label traduzido automaticamente; fallback é o id raw da view.

### A13 — AddMemberDialog: parâmetro queueId ignorado no corpo
`queues/AddMemberDialog.tsx` recebe `queueId` mas o parâmetro é desestruturado como `_queueId` (prefixo underscore). A lógica de associar o membro à fila fica 100% delegada ao callback `onAddMember` — se o caller não implementar a associação, o membro não é vinculado à fila.

---

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
