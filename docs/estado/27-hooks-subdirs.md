# Estado: Hooks — Subdiretórios (admin, ai-providers, campaigns, catalog, connections, contacts, dashboard, email, evolution, feedback, followup, gmail, groups, media-library, messaging, meta-capi, monitoring, omnichannel, pipeline, settings, shortcuts, sla, sticker-picker, team-chat)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 46/46

## 1. Visão Geral

46 hooks distribuídos em 24 subdiretórios. O padrão dominante é **shim de re-export**: arquivos de 7–40 linhas que apenas repassam para um hook consolidado (facade). Os hooks consolidados reais têm entre 150–530 linhas. Há 1 órfão confirmado por grep.

### Tabela de Arquivos

| arquivo | linhas | o que faz | status | completude |
|---------|--------|-----------|--------|-----------|
| `admin/useAdminAutomations.ts` | 48 | Shim → `useAdminManagement` (automações) | EM_USO | COMPLETA |
| `admin/useAdminChannels.ts` | 25 | Shim → `useAdminManagement` (canais) | EM_USO | COMPLETA |
| `admin/useAdminQueues.ts` | 40 | Shim → `useAdminManagement` (filas) | EM_USO | COMPLETA |
| `admin/useDepartmentsAdmin.ts` | 19 | Shim → `useAdminManagement` (depts) | EM_USO | COMPLETA |
| `admin/useHmacSelfTest.ts` | 20 | Shim → `useAdminManagement` (HMAC self-test) | EM_USO | COMPLETA |
| `admin/useRolesPageState.ts` | 30 | Shim → `useAdminManagement` (roles page) | EM_USO | COMPLETA |
| `admin/useRoutePermissions.ts` | 21 | Shim → `useAdminManagement` (route perms) | EM_USO | COMPLETA |
| `ai-providers/useAIProviders.ts` | 160 | CRUD autônomo de `ai_providers` + test via Edge Function `ai-proxy` | EM_USO | COMPLETA |
| `campaigns/useCampaignABTesting.ts` | 31 | Shim → `useBusinessLogicManagement` (variantes A/B) | EM_USO | PARCIAL |
| `catalog/useSendProduct.ts` | 27 | Shim → `useBusinessLogicManagement` (envio de produto) | EM_USO | COMPLETA |
| `connections/useBridgeHealth.ts` | 7 | Re-export de `useBridgeHealthManagement` via `useConnectionsManagement` | EM_USO | COMPLETA |
| `connections/useConnectionsManagement.ts` | 117 | Consolidação: navegação de abas + bridge health | EM_USO | COMPLETA |
| `connections/useHubTabNavigation.ts` | 65 | Navegação por abas via URL query param (`?tab=`) | EM_USO | COMPLETA |
| `contacts/useCompanies.ts` | 163 | CRUD de `companies` com detecção de RLS bloqueado | EM_USO | PARCIAL |
| `contacts/useContactSegments.ts` | 163 | CRUD de `contact_segments` com detecção de RLS bloqueado | EM_USO | PARCIAL |
| `dashboard/useSentimentData.ts` | 259 | Stats de sentimento via `audit_logs`, `conversation_analyses`, `profiles` | EM_USO | COMPLETA |
| `email/useEmailSignature.ts` | 128 | CRUD de `email_signatures` por conta | EM_USO | COMPLETA |
| `email/useEmailTemplates.ts` | 153 | CRUD de `email_templates` | EM_USO | COMPLETA |
| `email/useImapAccounts.ts` | 234 | CRUD de contas IMAP/SMTP via edge `email-imap-bridge` | EM_USO | COMPLETA |
| `evolution/v237Fallbacks.ts` | 81 | Fallback para Evolution API v2.37 via RPCs quando endpoint retorna 404/405/501 | EM_USO | COMPLETA |
| `feedback/feedbackTypes.ts` | 67 | Tipos e constantes do sistema de feedback (toast) | EM_USO | COMPLETA |
| `followup/useFollowUpSequences.ts` | 214 | CRUD de `evolution_followup_rules` | EM_USO | PARCIAL |
| `gmail/gmailApi.ts` | 528 | Funções utilitárias para Email API via Edge Functions | EM_USO | PARCIAL |
| `gmail/gmailApiTypes.ts` | 82 | Tipos de parâmetros/respostas da Email API | **ORFAO** | MORTA |
| `gmail/gmailMocks.ts` | 131 | Dados mock para testes/dev do módulo Gmail | EM_USO | COMPLETA |
| `gmail/gmailTypes.ts` | 285 | Tipos TypeScript canônicos do módulo email | EM_USO | COMPLETA |
| `groups/actions.ts` | 252 | CRUD e broadcast para `whatsapp_groups` | EM_USO | COMPLETA |
| `groups/types.ts` | 31 | Interfaces `WhatsAppGroup`, `WhatsAppConnection`, `GROUP_CATEGORIES` | EM_USO | COMPLETA |
| `media-library/useMediaLibrary.ts` | 27 | Re-export facade pós-consolidação ETAPA 21 | EM_USO | COMPLETA |
| `media-library/useMediaLibraryManagement.ts` | 530 | CRUD + upload unificado (consolidação de 2 hooks antigos) | EM_USO | COMPLETA |
| `media-library/useMediaLibraryTypes.ts` | 111 | Tipos, constantes de categoria, helpers puros | EM_USO | COMPLETA |
| `media-library/useMediaUpload.ts` | 11 | Re-export shim pós-consolidação ETAPA 21 | EM_USO | COMPLETA |
| `messaging/useInstanceRetryConfig.ts` | 179 | Lê/grava config de retry por instância em `global_settings` | EM_USO | COMPLETA |
| `meta-capi/useMetaCapi.ts` | 149 | Eventos CAPI Meta + config pixel em `meta_capi_events`/`global_settings` | EM_USO | COMPLETA |
| `monitoring/useMonitoringActions.ts` | 15 | Shim re-export pós-consolidação ETAPA 23 | EM_USO | COMPLETA |
| `monitoring/useMonitoringData.ts` | 15 | Shim re-export pós-consolidação ETAPA 23 | EM_USO | COMPLETA |
| `monitoring/useMonitoringManagement.ts` | 481 | Data + Actions de monitoramento unificados | EM_USO | COMPLETA |
| `omnichannel/useChannelRoutingRules.ts` | 13 | Shim → `useOmnichannelManagement` | EM_USO | COMPLETA |
| `omnichannel/useOmnichannelChannels.ts` | 13 | Shim → `useOmnichannelManagement` | EM_USO | COMPLETA |
| `omnichannel/useOmnichannelManagement.ts` | 216 | CRUD de canais omnichannel e regras de roteamento | EM_USO | COMPLETA |
| `pipeline/useSalesPipeline.ts` | 8 | Shim → `useBusinessLogicManagement` (pipeline de vendas) | EM_USO | COMPLETA |
| `settings/useSkillBasedRouting.ts` | 185 | CRUD de habilidades de agentes e requisitos de filas | EM_USO | COMPLETA |
| `shortcuts/defaultShortcuts.ts` | 34 | Constante com 24 atalhos de teclado padrão | EM_USO | COMPLETA |
| `sla/useSLAScopeOptions.ts` | 167 | Carrega opções de escopo para formulário de regras SLA | EM_USO | COMPLETA |
| `sticker-picker/useStickerPicker.ts` | 418 | Gerencia picker de figurinhas (upload, filtro, envio, delete) | EM_USO | COMPLETA |
| `team-chat/useDepartmentManagement.ts` | 260 | CRUD de membros, convites, audit log e config WhatsApp de departamento | EM_USO | COMPLETA |

---

## 2. Fluxos funcionais

### Admin (7 shims + 1 facade)
`AdminQueuesPage.tsx` → `useAdminQueues` → `useAdminManagement` → `useAdminQueuesManagement` → `zapp.queues`  
Padrão idêntico para automações, canais, departamentos, HMAC, roles, route permissions.

### AI Providers
`AIProvidersManager.tsx` → `useAIProviders` → `zapp.ai_providers` + Edge `ai-proxy`

### Connections / Hub
`ConnectionsIntegrationsHub.tsx` → `useHubTabNavigation` (URL `?tab=`) + `useConnectionsManagement` → `BridgeService.checkHealth()` (HTTP)  
`BridgeSupabaseView.tsx` → `useBridgeHealth` → `useConnectionsManagement` → BridgeService

### Email / Gmail
`EmailChatReplyBar.tsx` → `gmailApi` (edge `gmail-send`) + `useEmailSignature` (`email_signatures`) + `useEmailTemplates` (`email_templates`)  
`useGmailOAuthFlow.ts` → `gmailApi` → edge `gmail-oauth` + `gmail-token-refresh`  
`ImapAccountsSettings.tsx` → `useImapAccounts` → edge `email-imap-bridge`

### Evolution Fallbacks
`useEvolutionApiManagement.ts` → `v237Fallbacks` → `rpc_list_conversations`, `rpc_list_contacts`, `rpc_get_contact` (RPCs DB)

### Follow-up
`FollowUpSequences.tsx` → `useFollowUpSequences` → `zapp.evolution_followup_rules` *(sem seletor de template; template_id sempre null)*

### Grupos WhatsApp
`useGroupsManager.ts` → `groups/actions.ts` + `groups/types.ts` → `zapp.whatsapp_groups` + Edge `evolution-api` + `zapp.contacts`

### Media Library
`MediaAdminPanel.tsx` → `useMediaLibrary` (facade) → `useMediaLibraryManagement` → `zapp.stickers` / `zapp.audio_memes` / `zapp.custom_emojis` + Storage (3 buckets) + Edges `classify-sticker`, `classify-audio-meme`, `classify-emoji`

### Monitoring
`useEvolutionMonitoring.ts` → `useMonitoringActions` + `useMonitoringData` → `useMonitoringManagement` → `zapp.whatsapp_connections` + `zapp.connection_health_logs` + `evo.evolution_messages` + Edges `evolution-api`, `connection-health-check`, `webhook-diagnostic`

### Omnichannel
`ChannelRoutingRules.tsx` → `useChannelRoutingRules` → `useOmnichannelManagement` → `zapp.channel_connections`, `zapp.channel_routing_rules`, `zapp.queues`

### SLA / Shortcuts / Stickers / Team-chat
`SLARuleFormDialog.tsx` → `useSLAScopeOptions` → `zapp.contacts`, `zapp.queues`, `zapp.profiles`  
`useKeyboardManagement.ts` → `defaultShortcuts` (constante pura)  
`StickerPicker.tsx` → `useStickerPicker` → `zapp.stickers` + Storage `stickers`/`whatsapp-media` + Edge `classify-sticker`  
`DepartmentManagementDialog.tsx` → `useDepartmentManagement` → `zapp.departments`, `zapp.profiles`, `zapp.audit_logs`, `zapp.department_invitations`

---

## 3. Tabelas, RPCs, canais realtime e edge functions

### Tabelas `zapp` acessadas
`ai_providers`, `campaign_ab_variants`, `channel_connections`, `channel_routing_rules`, `companies`, `contact_segments`, `contacts`, `departments`, `department_invitations`, `email_signatures`, `email_templates`, `evolution_followup_rules`, `global_settings`, `imap_smtp_accounts`, `meta_capi_events`, `profiles`, `queues`, `stickers`, `audio_memes`, `custom_emojis`, `whatsapp_connections`, `connection_health_logs`, `whatsapp_groups`, `audit_logs`, `agent_skills`, `queue_skill_requirements`

### Tabelas `evo` acessadas
`evolution_messages` (via view zapp)

### RPCs (chamadas diretas)
`rpc_list_conversations`, `rpc_list_contacts`, `rpc_get_contact` (via `v237Fallbacks` — schema não tipado, cast `as unknown as SupabaseClient<any>`)

### Realtime
Nenhum canal Realtime identificado nestes hooks.

### Edge Functions chamadas
`ai-proxy`, `evolution-api`, `evolution-api/get-webhook`, `evolution-api/set-webhook`, `email-imap-bridge`, `gmail-sync`, `gmail-send`, `gmail-webhook`, `gmail-oauth`, `gmail-token-refresh`, `connection-health-check`, `evolution-webhook`, `webhook-diagnostic`, `classify-sticker`, `classify-audio-meme`, `classify-emoji`, `classify-emoji` (custom-emojis)

---

## 4. Exports Públicos por categoria

### Hooks de state + query (React Query)
`useAIProviders`, `useCompanies`, `useContactSegments`, `useSentimentData`, `useEmailSignature`, `useEmailTemplates`, `useImapAccounts`, `useFollowUpSequences`, `useInstanceRetryConfig`, `useMetaCapi`, `useMonitoringManagement`, `useOmnichannelManagement`, `useSkillBasedRouting`, `useSLAScopeOptions`, `useStickerPicker`, `useDepartmentManagement`

### Shims de re-export (wrappers finos)
`useAdminAutomations`, `useAdminChannels`, `useAdminQueues`, `useDepartmentsAdmin`, `useHmacSelfTest`, `useRolesPageState`, `useRoutePermissions`, `useCampaignABTesting`, `useSendProduct`, `useBridgeHealth`, `useMediaLibrary`, `useMediaUpload`, `useMonitoringActions`, `useMonitoringData`, `useChannelRoutingRules`, `useOmnichannelChannels`, `useSalesPipeline`

### Arquivos de tipos / constantes puros
`feedbackTypes.ts`, `groups/types.ts`, `media-library/useMediaLibraryTypes.ts`, `shortcuts/defaultShortcuts.ts`, `gmail/gmailTypes.ts`, `gmail/gmailApiTypes.ts` (órfão)

### Utilitários / funções não-hook
`groups/actions.ts`, `gmail/gmailApi.ts`, `evolution/v237Fallbacks.ts`, `gmail/gmailMocks.ts`

---

## 5. Chama (Saída)

| dependência externa | quem usa |
|--------------------|---------|
| `@tanstack/react-query` | useAIProviders, useCompanies, useContactSegments, useSentimentData, useEmailTemplates, useImapAccounts, useFollowUpSequences, useInstanceRetryConfig, useMonitoringManagement, useOmnichannelManagement, useSkillBasedRouting, useDepartmentManagement, useMediaLibraryManagement |
| `@/integrations/supabase/client` | maioria dos hooks autônomos |
| `@/integrations/supabase/safeClient` | useEmailSignature, useEmailTemplates, useImapAccounts, useMonitoringManagement, useOmnichannelManagement, useSkillBasedRouting |
| `@/features/admin/hooks/useAdminManagement` | 7 shims admin |
| `@/features/business-logic/hooks/useBusinessLogicManagement` | useCampaignABTesting, useSendProduct, useSalesPipeline |
| `@/services/connections/BridgeService` | useConnectionsManagement |
| `@/services/api/queryKeys` | useFollowUpSequences, useOmnichannelManagement, useSkillBasedRouting, useDepartmentManagement |
| `@/lib/logger` | useCompanies, useContactSegments, useSentimentData, useImapAccounts, useFollowUpSequences, useMediaLibraryManagement, useMonitoringManagement, useStickerPicker, groups/actions.ts |
| `@/lib/evolutionInstance` | groups/actions.ts, useMonitoringManagement |
| `@/integrations/datasource/db` | groups/actions.ts, useMonitoringManagement |
| `@/hooks/use-toast` | useAIProviders, useMetaCapi, useFollowUpSequences, useSkillBasedRouting, useDepartmentManagement |
| `sonner` | useMediaLibraryManagement, useInstanceRetryConfig, useMonitoringManagement, useOmnichannelManagement, groups/actions.ts |
| `react-router-dom` | useConnectionsManagement, useHubTabNavigation |
| `date-fns` | useSentimentData |
| `@/types/gmail` | gmailMocks (tipo SLAStatus — namespace diferente de gmailTypes.ts) |
| `@/features/sla` | useSLAScopeOptions (tipo SLARuleScope) |
| `@/features/inbox/components/stickers/StickerTypes` | useStickerPicker |
| `@/lib/mediaUrl` | useMediaLibraryManagement, useStickerPicker |
| `@/lib/retryConfig` | useInstanceRetryConfig |

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa | contagem |
|---------|-------------|---------|
| `admin/useAdminAutomations.ts` | `AdminAutomationsPage.tsx`, `AutomationRuleDialog.tsx`, `automationRuleDialogParts.tsx`, `useAdminManagement.ts` | 4 |
| `admin/useAdminChannels.ts` | `AdminChannelsPage.tsx`, `useAdminManagement.ts` | 2 |
| `admin/useAdminQueues.ts` | `AdminQueuesPage.tsx`, `QueueEditDialog.tsx`, `QueueCard.tsx`, `QueueMembersDialog.tsx`, `useAdminManagement.ts` | 5 |
| `admin/useDepartmentsAdmin.ts` | `DepartmentsPage.tsx`, `useAdminManagement.ts` | 2 |
| `admin/useHmacSelfTest.ts` | `HmacSelfTestPage.tsx` | 1 |
| `admin/useRolesPageState.ts` | `RolesPage.tsx` | 1 |
| `admin/useRoutePermissions.ts` | `RoutePermissionsPage.tsx`, `useAdminManagement.ts` | 2 |
| `ai-providers/useAIProviders.ts` | `AIProvidersManager.tsx` | 1 |
| `campaigns/useCampaignABTesting.ts` | `CampaignABTesting.tsx` | 1 |
| `catalog/useSendProduct.ts` | `ContactSelectionStep.tsx`, `SendProductDialog.tsx` | 2 |
| `connections/useBridgeHealth.ts` | `BridgeSupabaseView.tsx` | 1 |
| `connections/useConnectionsManagement.ts` | `useBridgeHealth.ts`, `useHubTabNavigation` (consolidação interna) | 2 |
| `connections/useHubTabNavigation.ts` | `ConnectionsIntegrationsHub.tsx`, `useConnectionsManagement.ts`, `__tests__/useHubTabNavigation.test.tsx` | 3 |
| `contacts/useCompanies.ts` | `ContactCompanyField.tsx`, `CompaniesManagerDialog.tsx`, `CompanyFormDialog.tsx` | 3 |
| `contacts/useContactSegments.ts` | `ExternalContact360Panel.tsx`, `SegmentsManagerDialog.tsx` | 2 |
| `dashboard/useSentimentData.ts` | `SentimentAlertsDashboard.tsx`, `SentimentTabContent.tsx`, `useSentimentData.pure.test.ts` | 3 |
| `email/useEmailSignature.ts` | `EmailChatReplyBar.tsx`, `useEmailManagement.ts`, `EmailSignaturesSettings.tsx` | 3 |
| `email/useEmailTemplates.ts` | `EmailTemplatesManager.tsx`, `EmailTemplatesSettings.tsx`, `useEmailTemplates.ts` (raiz), `EmailChatReplyBar.tsx` | 4 |
| `email/useImapAccounts.ts` | `ImapAccountsSettings.tsx` | 1 |
| `evolution/v237Fallbacks.ts` | `useEvolutionApiManagement.ts`, `v237Fallbacks.test.ts` | 2 |
| `feedback/feedbackTypes.ts` | `useActionFeedback.ts` | 1 |
| `followup/useFollowUpSequences.ts` | `FollowUpSequences.tsx` | 1 |
| `gmail/gmailApi.ts` | `EmailChatReplyBar.tsx`, `useEmailDraft.ts`, `useGmailOAuthFlow.ts`, `useEmailManagement.ts`, `EmailChatBubble.tsx`, `useEmailSearch.ts`, `gmailUtils.test.ts`, `useEmailDraft.test.ts` | 8 |
| `gmail/gmailApiTypes.ts` | **nenhum** | **0** |
| `gmail/gmailMocks.ts` | `useEmail.ts`, `useEmailManagement.ts` | 2 |
| `gmail/gmailTypes.ts` | `GmailAccountSelector.tsx`, `EmailAttachmentPreview.tsx`, `EmailChatThread.tsx`, `EmailChatBubble.tsx`, `useEmail.ts`, `useEmailManagement.ts`, `gmailUtils.test.ts` | 7 |
| `groups/actions.ts` | `hooks/useGroupsManager.ts` | 1 |
| `groups/types.ts` | `hooks/useGroupsManager.ts` | 1 |
| `media-library/useMediaLibrary.ts` | `MediaItemRow.tsx`, `StatsCards.tsx`, `MediaAdminPanel.tsx`, `__tests__/useMediaLibrary.utils.test.ts` | 4 |
| `media-library/useMediaLibraryManagement.ts` | shims internos (useMediaLibrary.ts, useMediaUpload.ts) | 0 externos diretos |
| `media-library/useMediaLibraryTypes.ts` | `MediaAdminPanel.tsx` (via re-export de useMediaLibrary) | indireto |
| `media-library/useMediaUpload.ts` | `MediaAdminPanel.tsx` | 1 |
| `messaging/useInstanceRetryConfig.ts` | `features/admin/components/RetryConfigPanel.tsx` | 1 |
| `meta-capi/useMetaCapi.ts` | `components/meta-capi/MetaCAPIView.tsx` | 1 |
| `monitoring/useMonitoringActions.ts` | `components/monitoring/hooks/useEvolutionMonitoring.ts`, `features/inbox/hooks/useRealtimeMessages.ts` | 2 |
| `monitoring/useMonitoringData.ts` | `components/monitoring/hooks/useEvolutionMonitoring.ts` | 1 |
| `monitoring/useMonitoringManagement.ts` | shims internos (useMonitoringActions.ts, useMonitoringData.ts) | 0 externos diretos |
| `omnichannel/useChannelRoutingRules.ts` | `ChannelRoutingRules.tsx`, `AdminQueuesPage.tsx` | 2 |
| `omnichannel/useOmnichannelChannels.ts` | `OmnichannelManager.tsx` | 1 |
| `omnichannel/useOmnichannelManagement.ts` | shims internos (2 shims acima) | 0 externos diretos |
| `pipeline/useSalesPipeline.ts` | `SalesPipelineView.tsx` | 1 |
| `settings/useSkillBasedRouting.ts` | `SkillBasedRoutingSettings.tsx` | 1 |
| `shortcuts/defaultShortcuts.ts` | `useKeyboardManagement.ts`, `defaultShortcuts.test.ts` | 2 |
| `sla/useSLAScopeOptions.ts` | `SLARuleFormDialog.tsx` | 1 |
| `sticker-picker/useStickerPicker.ts` | `StickerPicker.tsx` | 1 |
| `team-chat/useDepartmentManagement.ts` | `DepartmentManagementDialog.tsx` | 1 |

---

## 7. Órfãos

**1 arquivo com zero importadores fora do próprio diretório:**

| arquivo | linhas | veredito | justificativa |
|---------|--------|----------|---------------|
| `gmail/gmailApiTypes.ts` | 82 | **VERIFICAR** | Todas as interfaces que define (`EmailApiError`, `EmailApiResponse`, `MarkReadParams`, `SendMessageParams`, etc.) já existem em `gmailApi.ts` e `gmailTypes.ts`. Arquivo é duplicata redundante. Nenhum importador externo encontrado por grep. Antes de remover, confirmar que nenhum `index.ts` do diretório re-exporta seu conteúdo. |

---

## 8. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|------------|
| `admin/useAdminAutomations.ts` | COMPLETA | — |
| `admin/useAdminChannels.ts` | COMPLETA | — |
| `admin/useAdminQueues.ts` | COMPLETA | — |
| `admin/useDepartmentsAdmin.ts` | COMPLETA | — |
| `admin/useHmacSelfTest.ts` | COMPLETA | — |
| `admin/useRolesPageState.ts` | COMPLETA | — |
| `admin/useRoutePermissions.ts` | COMPLETA | — |
| `ai-providers/useAIProviders.ts` | COMPLETA | — |
| `campaigns/useCampaignABTesting.ts` | PARCIAL | Engine de disparo A/B inexistente; RLS INSERT/UPDATE/DELETE em `campaign_ab_variants` bloqueiam escrita |
| `catalog/useSendProduct.ts` | COMPLETA | — |
| `connections/useBridgeHealth.ts` | COMPLETA | — |
| `connections/useConnectionsManagement.ts` | COMPLETA | — |
| `connections/useHubTabNavigation.ts` | COMPLETA | — |
| `contacts/useCompanies.ts` | PARCIAL | RLS INSERT/UPDATE/DELETE ausentes em `companies` — mutações retornam `rlsBlocked:true` e falham silenciosamente |
| `contacts/useContactSegments.ts` | PARCIAL | Idem para `contact_segments` — escrita inoperante |
| `dashboard/useSentimentData.ts` | COMPLETA | — |
| `email/useEmailSignature.ts` | COMPLETA | Mapeamento de coluna `content_html`/`html_content` tem comentário de gambiarra pendente |
| `email/useEmailTemplates.ts` | COMPLETA | — |
| `email/useImapAccounts.ts` | COMPLETA | Conexão TCP real via broker externo (Nylas/EmailEngine) não implementada — documentado |
| `evolution/v237Fallbacks.ts` | COMPLETA | — |
| `feedback/feedbackTypes.ts` | COMPLETA | — |
| `followup/useFollowUpSequences.ts` | PARCIAL | `template_id=null` em todo insert — sequences criadas pela UI não disparam mensagens reais (motor externo ausente) |
| `gmail/gmailApi.ts` | PARCIAL | `downloadAttachment` retorna 501 (TODO EMAIL-04 pendente) |
| `gmail/gmailApiTypes.ts` | MORTA | Arquivo duplicata, nenhum importador |
| `gmail/gmailMocks.ts` | COMPLETA | — |
| `gmail/gmailTypes.ts` | COMPLETA | — |
| `groups/actions.ts` | COMPLETA | — |
| `groups/types.ts` | COMPLETA | — |
| `media-library/useMediaLibrary.ts` | COMPLETA | — |
| `media-library/useMediaLibraryManagement.ts` | COMPLETA | — |
| `media-library/useMediaLibraryTypes.ts` | COMPLETA | — |
| `media-library/useMediaUpload.ts` | COMPLETA | — |
| `messaging/useInstanceRetryConfig.ts` | COMPLETA | — |
| `meta-capi/useMetaCapi.ts` | COMPLETA | `saveConfig` usa select+insert/update manual em vez de `.upsert()` — race condition potencial |
| `monitoring/useMonitoringActions.ts` | COMPLETA | — |
| `monitoring/useMonitoringData.ts` | COMPLETA | — |
| `monitoring/useMonitoringManagement.ts` | COMPLETA | — |
| `omnichannel/useChannelRoutingRules.ts` | COMPLETA | — |
| `omnichannel/useOmnichannelChannels.ts` | COMPLETA | — |
| `omnichannel/useOmnichannelManagement.ts` | COMPLETA | — |
| `pipeline/useSalesPipeline.ts` | COMPLETA | — |
| `settings/useSkillBasedRouting.ts` | COMPLETA | — |
| `shortcuts/defaultShortcuts.ts` | COMPLETA | — |
| `sla/useSLAScopeOptions.ts` | COMPLETA | Usa `useState+useEffect` manual em vez de React Query — sem cache, sem retry |
| `sticker-picker/useStickerPicker.ts` | COMPLETA | — |
| `team-chat/useDepartmentManagement.ts` | COMPLETA | — |

---

## 9. Achados

### A1 — Padrão shim circular em admin (7 shims ↔ 1 facade)
`admin/useAdminAutomations.ts` (e 6 irmãos), `admin/useAdminManagement.ts` (facade)  
Os 7 shims importam `useAdminManagement` e `useAdminManagement` re-importa os 7 shims. Dependência circular. Em runtime não falha (ESM resolve lazy), mas pode causar surpresas em tree-shaking e Hot Module Replacement. Os shims acrescentam valor apenas como alias de API estável para as páginas.

### A2 — RLS SELECT-only bloqueia escrita em companies e contact_segments
`contacts/useCompanies.ts`, `contacts/useContactSegments.ts`  
INSERT/UPDATE/DELETE falham com código 42501. Os hooks detectam e retornam `rlsBlocked:true`, mas toda UI de escrita (formulários de empresa, segmentos) está inoperante até as policies serem criadas no DB.

### A3 — Engine A/B de campanhas inexistente (feature dead-end)
`campaigns/useCampaignABTesting.ts`  
O hook persiste variantes em `campaign_ab_variants` mas não existe motor de disparo nem split de audiência. CRUD funciona, mas o dado gravado nunca é consumido.

### A4 — `gmailApiTypes.ts` é órfão e duplicata
`gmail/gmailApiTypes.ts:1–82`  
Zero importadores externos. Todas as interfaces definidas aqui duplicam `gmailApi.ts` e `gmailTypes.ts`. Candidato direto a remoção após confirmar ausência de re-export via `index.ts`.

### A5 — Duplicação de tipos: `@/types/gmail.ts` vs `gmail/gmailTypes.ts`
`gmail/gmailMocks.ts` importa `SLAStatus` de `@/types/gmail`; `gmailTypes.ts` define `EmailSLAStatus` com semântica ligeiramente diferente. Dois namespaces para o mesmo conceito — risco de divergência silenciosa.

### A6 — `downloadAttachment` é STUB que retorna 501
`gmail/gmailApi.ts`  
Parâmetros descartados com `void`, retorno fixo de erro. TODO EMAIL-04 pendente. Nenhum consumidor de produção chama esta função ainda.

### A7 — `useFollowUpSequences` cria regras com `template_id=null` sempre
`followup/useFollowUpSequences.ts`  
O motor `evolution-followup` edge usa `template_id` para renderizar a mensagem. Regras criadas pela UI atual nunca disparam conteúdo real. Documentado como "PONTE PENDENTE" nos comentários do hook.

### A8 — `useMetaCapi.saveConfig` com upsert manual (race condition)
`meta-capi/useMetaCapi.ts:96–109`  
Executa `select` + `insert`/`update` em sequência em vez de `.upsert(..., { onConflict: 'key' })`. Race condition possível em saves concorrentes da mesma instância. Contrasta com `useInstanceRetryConfig` que usa upsert correto na mesma tabela `global_settings`.

### A9 — Cast inseguro em `useMediaLibraryManagement`
`media-library/useMediaLibraryManagement.ts:83`  
`supabase.from(type as 'stickers')` força o tipo para `stickers` independente do valor real (`audio_memes`, `custom_emojis`). Funciona em runtime mas remove type-safety das queries de tabela dinâmica.

### A10 — `VITE_SUPABASE_URL` não validado antes de concatenação de URL
`monitoring/useMonitoringManagement.ts`  
URL de webhook montada por `import.meta.env.VITE_SUPABASE_URL + '/functions/v1/evolution-webhook'`. Se a variável de ambiente estiver undefined, a URL inválida não falha explicitamente na construção — falha silenciosamente em runtime apenas ao ser chamada.

### A11 — Duplo sistema de toast em `useOmnichannelManagement`
`omnichannel/useOmnichannelManagement.ts`  
Importa `toast` do `sonner` e `toast` do `@/hooks/use-toast` simultaneamente. Diferentes operações usam sistemas diferentes — inconsistência de UX onde mensagens de sucesso/erro aparecem em locais diferentes da tela.

### A12 — `email: ''` hardcoded em insert de `department_invitations`
`team-chat/useDepartmentManagement.ts:148`  
Convites criados com campo email vazio. Pode violar constraints futuras ou lógica de envio de e-mail de convite.

### A13 — `useSLAScopeOptions` sem React Query (padrão inconsistente)
`sla/useSLAScopeOptions.ts`  
Usa `useState` + `useEffect` com Promises manuais. Sem cache, sem deduplicação de requests, sem retry automático. Padrão inconsistente com todos os outros hooks de data-fetching do projeto.

### A14 — Duplicação de navegação: `useHubTabNavigation` vs `useConnectionsManagement`
`connections/useHubTabNavigation.ts`, `connections/useConnectionsManagement.ts`  
Lógica de navegação por abas duplicada em dois arquivos. `useConnectionsManagement` embrulha `useHubTabNavigationManagement` que é cópia funcional de `useHubTabNavigation`. O único delta real: `useHubTabNavigation` expõe `setValidatedTab` extra.

### A15 — `whatsapp_api_key` mantida em estado React plain
`team-chat/useDepartmentManagement.ts`  
Chave de API do WhatsApp carregada do DB e mantida em estado React como string sem ofuscação. Se o departamento tiver chave real, ela fica acessível em memória React DevTools.

### A16 — Variável `log` declarada mas não usada (dead code)
`dashboard/useSentimentData.ts`, `monitoring/useMonitoringManagement.ts`  
`log = getLogger(...)` declarado mas suprimido por `eslint-disable-next-line @typescript-eslint/no-unused-vars`. Indicam logger incluído no merge de consolidação mas nunca usado nas funções do módulo.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
