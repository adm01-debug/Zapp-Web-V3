import { Suspense, useCallback, forwardRef, lazy, useState, useMemo, memo } from 'react';
import { Target, Mic, Minimize2, Info } from 'lucide-react';
import { useViewTransition } from '@/hooks/useViewTransition';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/layout/Sidebar';
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';
import { ViewRouter } from '@/pages/ViewRouter';
import { ViewLoadingFallback } from '@/components/layout/ViewLoadingFallback';
import { RouteLoadingBar } from '@/components/ui/route-loading-bar';
import { FailedMessageAlertsMount } from '@/components/system/FailedMessageAlertsMount';
import { AutomationFailureAlertsMount } from '@/components/system/AutomationFailureAlertsMount';
import { IntegrationMigrationMount } from '@/components/system/IntegrationMigrationMount';
import { MobileShell } from '@/components/mobile/MobileShell';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSwipeNavigation } from '@/hooks/useSwipeControl';
import { useZenMode } from '@/hooks/useZenMode';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useVoiceActionHandler } from '@/hooks/useVoiceActionHandler';

const LazyVoiceOverlay = lazy(() => import('@/components/voice/VoiceSearchOverlayConnected'));

// Memoize sub-components to prevent unnecessary re-renders when parent state changes
const MemoizedSidebar = memo(Sidebar);
const MemoizedMobileShell = memo(MobileShell);
const MemoizedViewRouter = memo(ViewRouter);

interface AppShellProps {
  currentView: string;
  setCurrentView: (viewId: string) => void;
  userId?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  breadcrumbTrail: string[];
  navDirectionRef: React.MutableRefObject<'forward' | 'back'>;
  profile: { name?: string | null; avatar_url?: string | null } | null;
  userEmail: string;
  signOut: () => void;
  unreadNotifications: number;
  showChecklist: boolean;
  loading: boolean;
}

export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(function AppShell(
  {
    currentView,
    setCurrentView,
    userId,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    breadcrumbTrail,
    navDirectionRef: _navDirectionRef,
    profile,
    userEmail,
    signOut,
    unreadNotifications,
    showChecklist,
    loading,
  },
  _ref
) {
  const isMobile = useIsMobile();
  const { isZen, toggleZen } = useZenMode();
  const isInboxView = currentView === 'inbox' || currentView === 'team-chat';
  const { startTransition } = useViewTransition();
  const [voiceOpen, setVoiceOpen] = useState(false);

  const handleViewChange = useCallback(
    (viewId: string) => {
      startTransition(() => setCurrentView(viewId));
    },
    [startTransition, setCurrentView]
  );

  const handleVoiceAction = useVoiceActionHandler(handleViewChange);

  // Mobile edge-swipe navigation
  useSwipeNavigation({
    onSwipeBack: goBack,
    onSwipeForward: goForward,
    canGoBack,
    canGoForward,
    enabled: isMobile,
    edgeWidth: 20,
    threshold: 60,
  });

  const appVersion = useMemo(() => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '.');
    return `v2.0.${today}.10-10`;
  }, []);

  const currentAgent = useMemo(
    () => ({
      name: profile?.name || userEmail || 'Usuário',
      avatar: profile?.avatar_url || undefined,
      status: 'online' as const,
    }),
    [profile?.name, profile?.avatar_url, userEmail]
  );

  return (
    <div className="relative flex h-screen max-h-screen min-h-screen overflow-hidden bg-background selection:bg-primary/20">
      <RouteLoadingBar isLoading={loading} />

      {/* Background mounts are non-visual or global UI overlays */}
      <Suspense fallback={null}>
        <FailedMessageAlertsMount />
        <AutomationFailureAlertsMount />
        <IntegrationMigrationMount />
      </Suspense>

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      {isMobile ? (
        <MemoizedMobileShell
          currentView={currentView}
          setCurrentView={setCurrentView}
          profile={profile}
          userEmail={userEmail}
          signOut={signOut}
          unreadNotifications={unreadNotifications}
        />
      ) : (
        !isZen && (
          <MemoizedSidebar
            currentView={currentView}
            onViewChange={handleViewChange}
            currentAgent={currentAgent}
            onLogout={signOut}
            inboxBadge={unreadNotifications || undefined}
          />
        )
      )}

      {!isMobile && (
        <div className="pointer-events-none fixed bottom-2 left-2 z-[60] flex select-none items-center gap-1.5 rounded-full border border-border/10 bg-muted/10 px-2 py-0.5 text-[9px] text-muted-foreground/60 opacity-40 transition-opacity hover:opacity-100">
          <Info className="h-2.5 w-2.5 opacity-40" />
          <span>{appVersion}</span>
          <span className="h-1 w-1 rounded-full bg-success/40" />
          <span className="uppercase tracking-tighter opacity-40">Build 10/10</span>
        </div>
      )}

      <main
        id="main-content"
        role="main"
        aria-label="Conteúdo principal"
        tabIndex={-1}
        className={cn(
          'relative flex h-full max-h-full min-h-0 min-w-0 flex-1 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
          isMobile && 'pb-[64px] pt-12'
        )}
      >
        {/* A11y: single h1 landmark for the app shell (WCAG page-has-heading-one). */}
        <h1 className="sr-only">ZAPP Web — Central de Atendimento</h1>

        {!isMobile && isInboxView && (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button type="button"
                onClick={toggleZen}
                className={cn(
                  'absolute right-3 top-3 z-30 flex h-9 items-center gap-2 rounded-full transition-all duration-500',
                  'touch-manipulation border border-border/40 shadow-sm backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isZen
                    ? 'border-primary/40 bg-primary/15 px-4 text-primary shadow-lg shadow-primary/10 hover:border-primary/60 hover:bg-primary/25'
                    : 'border-border/40 bg-background/80 px-3.5 text-muted-foreground/80 hover:border-border/80 hover:bg-background hover:text-foreground'
                )}
                aria-label={isZen ? 'Sair do modo zen' : 'Entrar no modo zen'}
              >
                {isZen ? <Minimize2 className="h-3.5 w-3.5" /> : <Target className="h-4 w-4" />}
                <span className="text-[11px] font-medium tracking-wide">
                  {isZen ? 'Sair' : 'Zen'}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8} className="text-xs">
              {isZen ? 'Sair do modo zen (Esc)' : 'Modo zen — foco total'}
            </TooltipContent>
          </Tooltip>
        )}

        {showChecklist && currentView === 'dashboard' && (
          <div className="animate-slide-in-right absolute right-4 top-4 z-20 w-96 max-w-[calc(100%-2rem)]">
            <OnboardingChecklist onNavigate={handleViewChange} />
          </div>
        )}

        <Suspense fallback={<ViewLoadingFallback />}>
          <MemoizedViewRouter
            currentView={currentView}
            userId={userId}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onGoBack={goBack}
            onGoForward={goForward}
            breadcrumbTrail={breadcrumbTrail}
            onNavigateTo={handleViewChange}
          />
        </Suspense>
      </main>

      {!isMobile && (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button type="button"
              onClick={() => setVoiceOpen(true)}
              className="fixed bottom-6 right-6 z-50 flex h-[54px] w-[54px] items-center justify-center rounded-full border border-primary/20 bg-gradient-to-br from-primary via-primary to-secondary text-primary-foreground shadow-xl shadow-primary/20 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95"
              aria-label="Assistente de voz inteligente"
            >
              <Mic className="h-6 w-6" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            Assistente de Voz IA
          </TooltipContent>
        </Tooltip>
      )}

      {voiceOpen && (
        <Suspense fallback={null}>
          <LazyVoiceOverlay
            isOpen={voiceOpen}
            onClose={() => setVoiceOpen(false)}
            onAction={handleVoiceAction}
            onError={(msg) => toast.error(msg)}
          />
        </Suspense>
      )}

      <div
        id="a11y-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        id="a11y-alert"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </div>
  );
});
