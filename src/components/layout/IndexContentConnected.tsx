import { useState, useEffect, forwardRef } from 'react';
import { useAuth } from '@/features/auth';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useOnboardingChecklist } from '@/hooks/useOnboardingChecklist';
import { useTranscriptionNotifications } from '@/hooks/useTranscriptionNotifications';
import { useConnectionAlertsPush } from '@/hooks/useConnectionManagement';
import { useWebhookHealthAlerts } from '@/hooks/useWebhookHealthAlerts';
import { useUserRole } from '@/features/auth';
import { useTour, DEFAULT_ONBOARDING_STEPS } from '@/components/onboarding/OnboardingTour';
import { useIndexNavigation } from '@/hooks/useIndexNavigation';
import { useGmailOAuthFlow } from '@/hooks/useGmailOAuthFlow';
import { useIndexKeyboardShortcuts } from '@/hooks/useIndexKeyboardShortcuts';

import { AppShell } from '@/components/layout/AppShell';
import { CommandPalette } from '@/components/CommandPalette';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { UnifiedNotificationProviders } from '@/components/notifications/UnifiedNotificationProviders';
import { OfflineIndicator, ConnectionToast } from '@/components/ui/offline-indicator';
import { DegradedConnectionsBanner } from '@/components/alerts/DegradedConnectionsBanner';

export const IndexContentConnected = forwardRef<HTMLDivElement>(function IndexContentConnected(_props, _ref) {
  const { user, profile, loading, signOut } = useAuth();
  const { hasCompletedOnboarding, loading: loadingOnboarding, completeOnboarding } = useOnboarding();
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
    navDirectionRef
  } = useIndexNavigation(user, loading);

  useGmailOAuthFlow();
  useIndexKeyboardShortcuts({ goBack, goForward, canGoBack, setCurrentView });

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
  const { isComplete: checklistComplete, isDismissed: checklistDismissed } = useOnboardingChecklist({
    enabled: currentView === 'dashboard',
  });

  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (!loadingOnboarding && hasCompletedOnboarding === false && user) {
      setShowWelcome(true);
    }
  }, [loadingOnboarding, hasCompletedOnboarding, user]);

  const showChecklist = !checklistComplete && !checklistDismissed && currentView === 'dashboard';

  if (!user) return null;

  return (
    <UnifiedNotificationProviders>
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
          unreadNotifications={0}
          showChecklist={showChecklist}
          loading={loading}
        />

        <CommandPalette onNavigate={setCurrentView} />

        <OfflineIndicator />
        <ConnectionToast />
        <DegradedConnectionsBanner onNavigate={setCurrentView} />

        <WelcomeModal
          isOpen={showWelcome}
          onClose={() => { setShowWelcome(false); completeOnboarding(); }}
          onStartTour={() => {
            setShowWelcome(false);
            setTimeout(() => startTour(DEFAULT_ONBOARDING_STEPS), 400);
          }}
          userName={profile?.name}
        />
    </UnifiedNotificationProviders>
  );
});
