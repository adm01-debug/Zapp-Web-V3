import { useState, useEffect, forwardRef } from 'react';
import { useAuth } from '@/features/auth';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useOnboardingChecklist } from '@/hooks/useOnboardingChecklist';
import { useTranscriptionNotifications } from '@/hooks/useTranscriptionNotifications';
import { useConnectionAlertsPush } from '@/hooks/useConnectionAlertsPush';
import { useWebhookHealthAlerts } from '@/hooks/useWebhookHealthAlerts';
import { useUserRole } from '@/features/auth';
import { useTour, DEFAULT_ONBOARDING_STEPS } from '@/components/onboarding/OnboardingTour';
import { useIndexNavigation } from '@/hooks/useIndexNavigation';
import { useEmailOAuthFlow } from '@/hooks/useGmailOAuthFlow';
import { useIndexKeyboardShortcuts } from '@/hooks/useIndexKeyboardShortcuts';
import { useAppBootstrap } from '@/hooks/useAppBootstrap';

import { AppShell } from '@/components/layout/AppShell';
import { CommandPalette } from '@/components/CommandPalette';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import {
  SLANotificationProvider,
  GoalNotificationProvider,
} from '@/components/notifications/UnifiedNotificationProviders';
import { OfflineIndicator, ConnectionToast } from '@/components/ui/offline-indicator';
import { SupabaseConnectivityBanner } from '@/components/ui/supabase-connectivity-banner';
import { DegradedConnectionsBanner } from '@/components/alerts/DegradedConnectionsBanner';

export const IndexContentConnected = forwardRef<HTMLDivElement>(
  function IndexContentConnected(_props, _ref) {
    const { user, profile, loading, signOut } = useAuth();
    const {
      hasCompletedOnboarding,
      loading: loadingOnboarding,
      completeOnboarding,
    } = useOnboarding();
    const { startTour } = useTour();
    const { isAdmin } = useUserRole();

    // Navigation & Logic hooks
    const {
      currentView,
      setCurrentView,
      goBack,
      goForward,
      canGoBack,
      canGoForward,
      breadcrumbTrail,
      navDirectionRef,
    } = useIndexNavigation(user, loading);

    useEmailOAuthFlow();
    useIndexKeyboardShortcuts({ goBack, goForward, canGoBack, setCurrentView });

    // DASHBOARD-07: badge de notificações real — rpc_app_bootstrap retorna
    // unread_notifications (contagem de zapp.app_notifications não lidas).
    // Antes era hardcoded `0` (AppShell nunca exibia badge).
    const { unreadNotifications } = useAppBootstrap();

    // Notifications & Alerts
    const [notifReady, setNotifReady] = useState(false);
    useEffect(() => {
      const t = setTimeout(() => setNotifReady(true), 2000);
      return () => clearTimeout(t);
    }, []);

    useTranscriptionNotifications({ enabled: !!user && notifReady });
    useConnectionAlertsPush();
    useWebhookHealthAlerts({ enabled: !!user && notifReady && isAdmin });

    // Onboarding Checklist
    const { progress: checklistProgress, isDismissed: checklistDismissed } =
      useOnboardingChecklist();
    const checklistComplete = checklistProgress >= 100;

    const [showWelcome, setShowWelcome] = useState(false);
    useEffect(() => {
      if (!loadingOnboarding && hasCompletedOnboarding === false && user) {
        setShowWelcome(true);
      }
    }, [loadingOnboarding, hasCompletedOnboarding, user]);

    const showChecklist = !checklistComplete && !checklistDismissed && currentView === 'dashboard';

    if (!user) return null;

    return (
      <SLANotificationProvider>
        <GoalNotificationProvider>
          <AppShell
            currentView={currentView}
            setCurrentView={setCurrentView}
            userId={user.id}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            goBack={goBack}
            goForward={goForward}
            breadcrumbTrail={breadcrumbTrail}
            navDirectionRef={navDirectionRef}
            profile={profile}
            userEmail={user.email || ''}
            signOut={signOut}
            unreadNotifications={unreadNotifications}
            showChecklist={showChecklist}
            loading={loading}
          />

          <CommandPalette onNavigate={setCurrentView} />

          <OfflineIndicator />
          <ConnectionToast />
          <SupabaseConnectivityBanner />
          <DegradedConnectionsBanner onNavigate={setCurrentView} />

          <WelcomeModal
            isOpen={showWelcome}
            onClose={() => {
              setShowWelcome(false);
              completeOnboarding();
            }}
            onStartTour={() => {
              setShowWelcome(false);
              setTimeout(() => startTour(DEFAULT_ONBOARDING_STEPS), 400);
            }}
            userName={profile?.name}
          />
        </GoalNotificationProvider>
      </SLANotificationProvider>
    );
  }
);
