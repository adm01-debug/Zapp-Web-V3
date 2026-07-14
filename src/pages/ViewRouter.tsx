import { Construction } from 'lucide-react';
import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useCurrentModule } from '@/hooks/useCurrentModule';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAriaAnnouncer } from '@/hooks/useAriaAnnouncer';
import { useUserRole, type AppRole } from '@/features/auth';
import { ErrorBoundaryWithRetry } from '@/components/ui/error-boundary-retry';
import { NotAuthorizedView } from '@/features/auth';

import * as Views from './lazyViews';

// Route-level role gates. Backend RPC/RLS remain the source of truth — this is a UX layer.
// `hasRole` é hierárquico: requerer 'admin' já libera para dev; requerer 'supervisor' libera para admin/dev.
const VIEW_REQUIRED_ROLES: Record<string, AppRole[]> = {
  // Áreas técnicas — visualização: admin+ (admin já inclui dev).
  'failed-messages': ['admin'],
  'failed-auth-messages': ['admin'],
  'search-insights': ['admin'],
  // Operação — supervisor+
  'agents-ops': ['supervisor'],
  'realtime-monitor': ['supervisor'],
  'dispatch-errors-history': ['supervisor'],
};

interface ViewRouterProps {
  currentView: string;
  userId?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  breadcrumbTrail?: string[];
  onNavigateTo?: (viewId: string) => void;
}

// Views that manage their own full-screen layout (no header)
const FULL_SCREEN_VIEWS = new Set(['inbox', 'pipeline', 'omni-inbox', 'team-chat', 'email-chat']);

interface WithHeaderProps {
  viewId: string;
  children: React.ReactNode;
}

function WithHeader({ viewId, children }: WithHeaderProps) {
  if (FULL_SCREEN_VIEWS.has(viewId)) return <>{children}</>;
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-6">{children}</div>
    </div>
  );
}

// Declarative route map — easier to maintain than switch/case
const VIEW_MAP: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  inbox: Views.RealtimeInboxView,
  dashboard: Views.DashboardView,
  agents: Views.AgentsView,
  'agents-system': Views.AgentsView,
  queues: Views.QueuesView,
  contacts: Views.ContactsView,
  groups: Views.GroupsView,
  connections: Views.ConnectionsIntegrationsHub,
  wallet: Views.ClientWalletView,
  catalog: Views.ProductManagement,
  transcriptions: Views.TranscriptionsHistoryView,
  admin: Views.AdminView,
  tags: Views.TagsView,
  sentiment: Views.SentimentAlertsDashboard,
  reports: Views.AdvancedReportsView,
  security: Views.SecurityView,
  settings: Views.SettingsView,
  docs: Views.SystemFeaturesView,
  campaigns: Views.CampaignsView,
  chatbot: Views.ChatbotFlowsView,
  automations: Views.AutomationsManager,
  integrations: Views.ConnectionsIntegrationsHub,
  privacy: Views.LGPDComplianceView,
  pipeline: Views.SalesPipelineView,
  knowledge: Views.KnowledgeBaseView,
  payments: Views.PaymentLinksView,
  'wa-flows': Views.WhatsAppFlowsBuilder,
  'meta-capi': Views.MetaCAPIView,
  diagnostics: Views.DiagnosticsView,
  voip: Views.VoIPPanel,
  'auto-export': Views.AutoExportManager,
  'google-calendar': Views.GoogleCalendarIntegration,
  themes: Views.ThemeCustomizer,
  schedule: Views.ScheduleCalendarView,
  warroom: Views.WarRoomDashboard,
  'wa-templates': Views.WhatsAppTemplatesManager,
  omnichannel: Views.OmnichannelManager,
  churn: Views.ChurnPredictionDashboard,
  'ticket-classifier': Views.AutoTicketClassifier,
  performance: Views.PerformanceMonitor,
  'omni-inbox': Views.OmnichannelInbox,
  'audit-logs': Views.AuditLogDashboard,
  telemetry: Views.AdminTelemetriaPage,
  'failed-messages': Views.AdminFailedMessagesPage,
  'failed-auth-messages': Views.AdminFailedAuthMessagesPage,
  'webhook-events': Views.AdminWebhookEventsPage,
  'evolution-api-logs': Views.AdminEvolutionApiLogsPage,
  'alert-history': Views.AdminAlertHistoryPage,
  'webhook-overview': Views.AdminWebhookOverviewPage,
  nps: Views.NPSDashboard,
  'team-chat': Views.TeamChatView,
  'email-chat': Views.EmailChatView,
  email: Views.EmailInboxView,
  'public-api': Views.PublicApiDashboard,
  'email-webhook': Views.EmailWebhookMonitor,
  'media-migration': Views.MediaMigrationTool,
  'sicoob-bridge': Views.SicoobBridgeDashboard,
  crm360: Views.CRM360ExplorerView,
  'ai-usage': Views.AIUsageDashboard,
  sla: Views.SLADashboardView,
  talkx: Views.TalkXView,
  'evolution-monitor': Views.EvolutionMonitoringDashboard,
  'webhook-secret': Views.AdminWebhookSecretStatusPage,
  'search-insights': Views.AdminSearchInsightsPage,
  'agents-ops': Views.AgentsOperationsPage,
  'realtime-monitor': Views.AdminRealtimeMonitorPage,
  'dispatch-errors-history': Views.AdminDispatchErrorsHistoryPage,
  'inbox-sync-status': Views.AdminInboxSyncStatusPage,
  'evo-api-health': Views.AdminEvoApiHealthPage,
  'email-status': Views.AdminEmailStatusPage,
  'email-audit': Views.AdminEmailAuditPage,
  'sla-history': Views.SLAHistory,
  'admin-connections': Views.AdminConnectionsPage,
  bridge: Views.ConnectionsIntegrationsHub,
};

// Views that need custom props
const SPECIAL_VIEWS: Record<string, (props: ViewRouterProps) => React.ReactNode> = {
  achievements: (props) => (
    <ErrorBoundaryView viewId="achievements">
      <Views.AchievementsSystemLazy userId={props.userId} />
    </ErrorBoundaryView>
  ),
};

export function ViewRouter({
  currentView,
  userId,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  breadcrumbTrail,
  onNavigateTo,
}: ViewRouterProps) {
  const mod = useCurrentModule(currentView);
  useDocumentTitle(mod.label);
  const { announce } = useAriaAnnouncer();
  const prefersReduced = useReducedMotion();

  // Announce view changes for screen readers
  useEffect(() => {
    announce(`Navegou para ${mod.label}`);
  }, [currentView, mod.label, announce]);

  const content = useMemo(() => {
    // Check special views first (those needing props)
    if (SPECIAL_VIEWS[currentView]) {
      return SPECIAL_VIEWS[currentView]({
        currentView,
        userId,
        canGoBack,
        canGoForward,
        onGoBack,
        onGoForward,
        breadcrumbTrail,
        onNavigateTo,
      });
    }
    // Standard views from map
    const ViewComponent = VIEW_MAP[currentView];
    if (ViewComponent) {
      return (
        <ErrorBoundaryView viewId={currentView}>
          <ViewComponent />
        </ErrorBoundaryView>
      );
    }
    return <FallbackView currentView={currentView} />;
  }, [
    currentView,
    userId,
    canGoBack,
    canGoForward,
    onGoBack,
    onGoForward,
    breadcrumbTrail,
    onNavigateTo,
  ]);

  return (
    <WithHeader viewId={currentView}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={currentView}
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
          animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
          transition={{
            duration: 0.2,
            ease: [0.22, 1, 0.36, 1], // Custom fast-out-slow-in easing
          }}
          className="h-full w-full will-change-transform"
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </WithHeader>
  );
}

/** Per-view error boundary with automatic retry + role gating. */
function ErrorBoundaryView({ viewId, children }: { viewId: string; children: React.ReactNode }) {
  const mod = useCurrentModule(viewId);
  const requiredRoles = VIEW_REQUIRED_ROLES[viewId];
  const { hasRole, loading: rolesLoading } = useUserRole();

  if (requiredRoles) {
    if (rolesLoading) {
      return (
        <div
          className="flex h-full w-full items-center justify-center text-sm text-muted-foreground"
          role="status"
          aria-busy="true"
        >
          Verificando permissões…
        </div>
      );
    }
    const allowed = requiredRoles.some((r) => hasRole(r));
    if (!allowed) return <NotAuthorizedView viewLabel={mod.label} />;
  }

  return (
    <ErrorBoundaryWithRetry key={viewId} moduleName={mod.label} maxAutoRetries={2}>
      {children}
    </ErrorBoundaryWithRetry>
  );
}

function FallbackView({ currentView }: { currentView: string }) {
  const mod = useCurrentModule(currentView);
  const Icon = mod.icon || Construction;

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-sm animate-fade-in px-6 text-center">
        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20"
          style={{ background: 'var(--gradient-primary)' }}
        >
          <Icon className="h-9 w-9 text-primary-foreground" />
        </div>

        <h2 className="mb-2 font-display text-2xl font-bold text-foreground">{mod.label}</h2>

        {mod.group && (
          <span className="mb-3 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {mod.group}
          </span>
        )}

        <p className="text-sm leading-relaxed text-muted-foreground">
          Este módulo está em desenvolvimento e será disponibilizado em breve.
        </p>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60">
          <Construction className="h-3.5 w-3.5" />
          <span>Em construção</span>
        </div>
      </div>
    </div>
  );
}
