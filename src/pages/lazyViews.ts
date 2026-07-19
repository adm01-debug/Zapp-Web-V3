import { lazyWithRetry } from '@/lib/lazyWithRetry';
import React from 'react';

/** Lazy-loaded RealtimeInboxView with 3-attempt retry backoff. */
export const RealtimeInboxView = lazyWithRetry(() => import('@/features/inbox').then(m => ({ default: m.RealtimeInboxView })));
/** Lazy-loaded DashboardView with 3-attempt retry backoff. */
export const DashboardView = lazyWithRetry(() => import('@/components/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
/** Lazy-loaded SentimentAlertsDashboard with 3-attempt retry backoff. */
export const SentimentAlertsDashboard = lazyWithRetry(() => import('@/components/dashboard/SentimentAlertsDashboard').then(m => ({ default: m.SentimentAlertsDashboard })));
/** Lazy-loaded AgentsView with 3-attempt retry backoff. */
export const AgentsView = lazyWithRetry(() => import('@/components/agents/AgentsView').then(m => ({ default: m.AgentsView })));
/** Lazy-loaded QueuesView with 3-attempt retry backoff. */
export const QueuesView = lazyWithRetry(() => import('@/components/queues/QueuesView').then(m => ({ default: m.QueuesView })));
/** Lazy-loaded ContactsView pointing to ContactsRichView (KPIs, birthdays, tabs, grid/list/table/pipeline/map/analytics). */
export const ContactsView = lazyWithRetry(() => import('@/components/contacts/ContactsRichView').then(m => ({ default: m.ContactsRichView })));
/** Lazy-loaded ConnectionsView with 3-attempt retry backoff. */
export const ConnectionsView = lazyWithRetry(() => import('@/components/connections/ConnectionsView').then(m => ({ default: m.ConnectionsView })));
/** Lazy-loaded ConnectionsIntegrationsHub with 3-attempt retry backoff. */
export const ConnectionsIntegrationsHub = lazyWithRetry(() => import('@/components/connections/ConnectionsIntegrationsHub').then(m => ({ default: m.ConnectionsIntegrationsHub })));
/** Lazy-loaded TagsView with 3-attempt retry backoff. */
export const TagsView = lazyWithRetry(() => import('@/components/tags/TagsView').then(m => ({ default: m.TagsView })));
/** Lazy-loaded SettingsView with 3-attempt retry backoff. */
export const SettingsView = lazyWithRetry(() => import('@/components/settings/SettingsView').then(m => ({ default: m.SettingsView })));
/** Lazy-loaded ClientWalletView with 3-attempt retry backoff. */
export const ClientWalletView = lazyWithRetry(() => import('@/components/wallet/ClientWalletView').then(m => ({ default: m.ClientWalletView })));
/** Lazy-loaded AdminView with 3-attempt retry backoff. */
export const AdminView = lazyWithRetry(() => import('@/features/admin').then(m => ({ default: m.AdminView })));
/** Lazy-loaded ProductManagement (ExternalProductManagement) with 3-attempt retry backoff. */
export const ProductManagement = lazyWithRetry(() => import('@/components/catalog/ExternalProductManagement').then(m => ({ default: m.ExternalProductManagement })));
/** Lazy-loaded GroupsView with 3-attempt retry backoff. */
export const GroupsView = lazyWithRetry(() => import('@/components/groups/GroupsView').then(m => ({ default: m.GroupsView })));
/** Lazy-loaded TranscriptionsHistoryView with 3-attempt retry backoff. */
export const TranscriptionsHistoryView = lazyWithRetry(() => import('@/components/transcriptions/TranscriptionsHistoryView').then(m => ({ default: m.TranscriptionsHistoryView })));
/** Lazy-loaded AdvancedReportsView with 3-attempt retry backoff. */
export const AdvancedReportsView = lazyWithRetry(() => import('@/components/reports/AdvancedReportsView').then(m => ({ default: m.AdvancedReportsView })));
/** Lazy-loaded SecurityView with 3-attempt retry backoff. */
export const SecurityView = lazyWithRetry(() => import('@/components/security/SecurityView').then(m => ({ default: m.SecurityView })));
/** Lazy-loaded SystemFeaturesView with 3-attempt retry backoff. */
export const SystemFeaturesView = lazyWithRetry(() => import('@/components/docs/SystemFeaturesView').then(m => ({ default: m.SystemFeaturesView })));
/** Lazy-loaded CampaignsView with 3-attempt retry backoff. */
export const CampaignsView = lazyWithRetry(() => import('@/components/campaigns/CampaignsView').then(m => ({ default: m.CampaignsView })));
/** Lazy-loaded ChatbotFlowsView with 3-attempt retry backoff. */
export const ChatbotFlowsView = lazyWithRetry(() => import('@/components/chatbot/ChatbotFlowsView').then(m => ({ default: m.ChatbotFlowsView })));
/** Lazy-loaded AutomationsManager with 3-attempt retry backoff. */
export const AutomationsManager = lazyWithRetry(() => import('@/components/automations/AutomationsManager').then(m => ({ default: m.AutomationsManager })));
/** Lazy-loaded IntegrationsHub with 3-attempt retry backoff. */
export const IntegrationsHub = lazyWithRetry(() => import('@/components/integrations/IntegrationsHub').then(m => ({ default: m.IntegrationsHub })));
/** Lazy-loaded LGPDComplianceView with 3-attempt retry backoff. */
export const LGPDComplianceView = lazyWithRetry(() => import('@/components/compliance/LGPDComplianceView').then(m => ({ default: m.LGPDComplianceView })));
/** Lazy-loaded SalesPipelineView with 3-attempt retry backoff. */
export const SalesPipelineView = lazyWithRetry(() => import('@/components/pipeline/SalesPipelineView').then(m => ({ default: m.SalesPipelineView })));
/** Lazy-loaded KnowledgeBaseView with 3-attempt retry backoff. */
export const KnowledgeBaseView = lazyWithRetry(() => import('@/components/knowledge/KnowledgeBaseView').then(m => ({ default: m.KnowledgeBaseView })));
/** Lazy-loaded PaymentLinksView with 3-attempt retry backoff. */
export const PaymentLinksView = lazyWithRetry(() => import('@/components/payments/PaymentLinksView').then(m => ({ default: m.PaymentLinksView })));
/** Lazy-loaded WhatsAppFlowsBuilder with 3-attempt retry backoff. */
export const WhatsAppFlowsBuilder = lazyWithRetry(() => import('@/components/whatsapp-flows/WhatsAppFlowsBuilder').then(m => ({ default: m.WhatsAppFlowsBuilder })));
/** Lazy-loaded MetaCAPIView with 3-attempt retry backoff. */
export const MetaCAPIView = lazyWithRetry(() => import('@/components/meta-capi/MetaCAPIView').then(m => ({ default: m.MetaCAPIView })));
/** Lazy-loaded DiagnosticsView with 3-attempt retry backoff. */
export const DiagnosticsView = lazyWithRetry(() => import('@/components/diagnostics/DiagnosticsView').then(m => ({ default: m.DiagnosticsView })));
/** Lazy-loaded VoIPPanel with 3-attempt retry backoff. */
export const VoIPPanel = lazyWithRetry(() => import('@/components/calls/VoIPPanel').then(m => ({ default: m.VoIPPanel })));
/** Lazy-loaded AutoExportManager with 3-attempt retry backoff. */
export const AutoExportManager = lazyWithRetry(() => import('@/components/reports/AutoExportManager').then(m => ({ default: m.AutoExportManager })));
/** Lazy-loaded GoogleCalendarIntegration with 3-attempt retry backoff. */
export const GoogleCalendarIntegration = lazyWithRetry(() => import('@/components/integrations/GoogleCalendarIntegration').then(m => ({ default: m.GoogleCalendarIntegration })));
/** Lazy-loaded ThemeCustomizer with 3-attempt retry backoff. */
export const ThemeCustomizer = lazyWithRetry(() => import('@/components/settings/ThemeCustomizer').then(m => ({ default: m.ThemeCustomizer })));
/** Lazy-loaded ScheduleCalendarView with 3-attempt retry backoff. */
export const ScheduleCalendarView = lazyWithRetry(() => import('@/components/schedule/ScheduleCalendarView').then(m => ({ default: m.ScheduleCalendarView })));
/** Lazy-loaded WarRoomDashboard with 3-attempt retry backoff. */
export const WarRoomDashboard = lazyWithRetry(() => import('@/components/dashboard/WarRoomDashboard').then(m => ({ default: m.WarRoomDashboard })));
/** Lazy-loaded WhatsAppTemplatesManager with 3-attempt retry backoff. */
export const WhatsAppTemplatesManager = lazyWithRetry(() => import('@/components/catalog/WhatsAppTemplatesManager').then(m => ({ default: m.WhatsAppTemplatesManager })));
/** Lazy-loaded OmnichannelManager with 3-attempt retry backoff. */
export const OmnichannelManager = lazyWithRetry(() => import('@/components/omnichannel/OmnichannelManager').then(m => ({ default: m.OmnichannelManager })));
/** Lazy-loaded ChurnPredictionDashboard with 3-attempt retry backoff. */
export const ChurnPredictionDashboard = lazyWithRetry(() => import('@/components/ai/ChurnPredictionDashboard').then(m => ({ default: m.ChurnPredictionDashboard })));
/** Lazy-loaded AutoTicketClassifier with 3-attempt retry backoff. */
export const AutoTicketClassifier = lazyWithRetry(() => import('@/components/ai/AutoTicketClassifier').then(m => ({ default: m.AutoTicketClassifier })));
/** Lazy-loaded PerformanceMonitor with 3-attempt retry backoff. */
export const PerformanceMonitor = lazyWithRetry(() => import('@/components/performance/PerformanceMonitor').then(m => ({ default: m.PerformanceMonitor })));
/** Lazy-loaded OmnichannelInbox with 3-attempt retry backoff. */
export const OmnichannelInbox = lazyWithRetry(() => import('@/components/omnichannel/OmnichannelInbox').then(m => ({ default: m.OmnichannelInbox })));
/** Lazy-loaded AuditLogDashboard with 3-attempt retry backoff. */
export const AuditLogDashboard = lazyWithRetry(() => import('@/components/security/AuditLogDashboard').then(m => ({ default: m.AuditLogDashboard })));
/** Lazy-loaded AdminTelemetriaPage with 3-attempt retry backoff. */
export const AdminTelemetriaPage = lazyWithRetry(() => import('@/pages/AdminTelemetriaPage'));
/** Lazy-loaded AdminFailedMessagesPage with 3-attempt retry backoff. */
export const AdminFailedMessagesPage = lazyWithRetry(() => import('@/pages/AdminFailedMessagesPage'));
/** Lazy-loaded AdminFailedAuthMessagesPage with 3-attempt retry backoff. */
export const AdminFailedAuthMessagesPage = lazyWithRetry(() => import('@/pages/admin/AdminFailedAuthMessagesPage'));
/** Lazy-loaded AdminSearchInsightsPage with 3-attempt retry backoff. */
export const AdminSearchInsightsPage = lazyWithRetry(() => import('@/pages/AdminSearchInsightsPage'));
/** Lazy-loaded AdminWebhookEventsPage with 3-attempt retry backoff. */
export const AdminWebhookEventsPage = lazyWithRetry(() => import('@/pages/AdminWebhookEventsPage'));
/** Lazy-loaded AdminEvolutionApiLogsPage with 3-attempt retry backoff. */
export const AdminEvolutionApiLogsPage = lazyWithRetry(() => import('@/pages/AdminEvolutionApiLogsPage'));
/** Lazy-loaded AdminAlertHistoryPage with 3-attempt retry backoff. */
export const AdminAlertHistoryPage = lazyWithRetry(() => import('@/pages/AdminAlertHistoryPage'));
/** Lazy-loaded AdminWebhookOverviewPage with 3-attempt retry backoff. */
export const AdminWebhookOverviewPage = lazyWithRetry(() => import('@/pages/AdminWebhookOverviewPage'));
/** Lazy-loaded NPSDashboard with 3-attempt retry backoff. */
export const NPSDashboard = lazyWithRetry(() => import('@/components/nps/NPSDashboard').then(m => ({ default: m.NPSDashboard })));
/** Lazy-loaded SLADashboardView (SLADashboard) with 3-attempt retry backoff. */
export const SLADashboardView = lazyWithRetry(() => import('@/components/queues/SLADashboard').then(m => ({ default: m.SLADashboard })));
/** Lazy-loaded TeamChatView with 3-attempt retry backoff. */
export const TeamChatView = lazyWithRetry(() => import('@/components/team-chat/TeamChatView').then(m => ({ default: m.TeamChatView })));
/** Lazy-loaded EmailInboxView (GmailInboxView) with 3-attempt retry backoff. */
export const EmailInboxView = lazyWithRetry(() => import('@/components/gmail/GmailInboxView'));
/** Lazy-loaded EmailChatView (EmailChatInbox) with 3-attempt retry backoff. */
export const EmailChatView = lazyWithRetry(() => import('@/components/email/EmailChatInbox').then(m => ({ default: m.EmailChatInbox })));
/** Lazy-loaded PublicApiDashboard with 3-attempt retry backoff. */
export const PublicApiDashboard = lazyWithRetry(() => import('@/features/admin').then(m => ({ default: m.PublicApiDashboard })));
/** Lazy-loaded EmailWebhookMonitor with 3-attempt retry backoff. */
export const EmailWebhookMonitor = lazyWithRetry(() => import('@/features/admin').then(m => ({ default: m.EmailWebhookMonitor })));
/** Lazy-loaded MediaMigrationTool with 3-attempt retry backoff. */
export const MediaMigrationTool = lazyWithRetry(() => import('@/features/admin').then(m => ({ default: m.MediaMigrationTool })));
/** Lazy-loaded SicoobBridgeDashboard with 3-attempt retry backoff. */
export const SicoobBridgeDashboard = lazyWithRetry(() => import('@/features/admin').then(m => ({ default: m.SicoobBridgeDashboard })));
/** Lazy-loaded CRM360ExplorerView with 3-attempt retry backoff. */
export const CRM360ExplorerView = lazyWithRetry(() => import('@/components/crm360/CRM360ExplorerView').then(m => ({ default: m.CRM360ExplorerView })));
/** Lazy-loaded AIUsageDashboard with 3-attempt retry backoff. */
export const AIUsageDashboard = lazyWithRetry(() => import('@/features/admin').then(m => ({ default: m.AIUsageDashboard })));
/** Lazy-loaded TalkXView with 3-attempt retry backoff. */
export const TalkXView = lazyWithRetry(() => import('@/components/talkx/TalkXView'));
/** Lazy-loaded EvolutionMonitoringDashboard with 3-attempt retry backoff. */
export const EvolutionMonitoringDashboard = lazyWithRetry(() => import('@/components/monitoring/EvolutionMonitoringDashboard').then(m => ({ default: m.EvolutionMonitoringDashboard })));
/** Lazy-loaded AdminWebhookSecretStatusPage with 3-attempt retry backoff. */
export const AdminWebhookSecretStatusPage = lazyWithRetry(() => import('@/pages/AdminWebhookSecretStatusPage'));
/** Lazy-loaded AdminInstancePausesPage with 3-attempt retry backoff. */
export const AdminInstancePausesPage = lazyWithRetry(() => import('@/pages/AdminInstancePausesPage'));
/** Lazy-loaded AgentsOperationsPage with 3-attempt retry backoff. */
export const AgentsOperationsPage = lazyWithRetry(() => import('@/pages/inbox/AgentsOperationsPage'));
/** Lazy-loaded AdminRealtimeMonitorPage with 3-attempt retry backoff. */
export const AdminRealtimeMonitorPage = lazyWithRetry(() => import('@/pages/AdminRealtimeMonitorPage'));
/** Lazy-loaded AdminDispatchErrorsHistoryPage with 3-attempt retry backoff. */
export const AdminDispatchErrorsHistoryPage = lazyWithRetry(() => import('@/pages/AdminDispatchErrorsHistoryPage'));
/** Lazy-loaded AdminInboxSyncStatusPage with 3-attempt retry backoff. */
export const AdminInboxSyncStatusPage = lazyWithRetry(() => import('@/pages/admin/AdminInboxSyncStatusPage'));
/** Lazy-loaded AdminEvoApiHealthPage with 3-attempt retry backoff. */
export const AdminEvoApiHealthPage = lazyWithRetry(() => import('@/pages/admin/AdminEvoApiHealthPage'));
/** Lazy-loaded AdminEmailStatusPage with 3-attempt retry backoff. */
export const AdminEmailStatusPage = lazyWithRetry(() => import('@/pages/admin/AdminEmailStatusPage'));
/** Lazy-loaded AdminEmailAuditPage with 3-attempt retry backoff. */
export const AdminEmailAuditPage = lazyWithRetry(() => import('@/pages/admin/AdminEmailAuditPage'));
/** Lazy-loaded AdminConnectionsPage with 3-attempt retry backoff. */
export const AdminConnectionsPage = lazyWithRetry(() => import('@/pages/admin/Connections'));

/** Lazy-loaded InboxPage with 3-attempt retry backoff. */
export const InboxPage = lazyWithRetry(() => import('@/pages/inbox/InboxPage'));
/** Lazy-loaded SLAHistory with 3-attempt retry backoff. */
export const SLAHistory = lazyWithRetry(() => import('@/pages/SLAHistory'));
/** Lazy-loaded AchievementsSystem typed as a LazyExoticComponent accepting userId and showCompact props. */
export const AchievementsSystemLazy = lazyWithRetry(async () => {
  const m = await import('@/components/gamification/AchievementsSystem');
  return { default: m.AchievementsSystem };
}) as React.LazyExoticComponent<React.ComponentType<{ userId?: string; showCompact?: boolean }>>;
