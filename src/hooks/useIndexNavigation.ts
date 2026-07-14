import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import { useGlobalKeyboard } from '@/components/keyboard/GlobalKeyboardProvider';
import { User } from '@supabase/supabase-js';

/** Manages view navigation history with deep-linking, back/forward, and keyboard shortcuts. */
export function useIndexNavigation(user: User | null, loading: boolean) {
  const { 
    currentView, 
    navigateTo: rawNavigateTo, 
    goBack: rawGoBack, 
    goForward: rawGoForward, 
    canGoBack, 
    canGoForward, 
    breadcrumbTrail 
  } = useNavigationHistory('inbox');
  const [searchParams] = useSearchParams();
  
  const navDirectionRef = useRef<'forward' | 'back'>('forward');
  const deepLinkViewHandledRef = useRef(false);
  const { registerNavigationHandler, unregisterNavigationHandler } = useGlobalKeyboard();

  const setCurrentView = useCallback((viewId: string) => {
    navDirectionRef.current = 'forward';
    rawNavigateTo(viewId);
  }, [rawNavigateTo]);

  const goBack = useCallback(() => {
    navDirectionRef.current = 'back';
    rawGoBack();
  }, [rawGoBack]);

  const goForward = useCallback(() => {
    navDirectionRef.current = 'forward';
    rawGoForward();
  }, [rawGoForward]);

  // Register navigation handler for command palette/shortcuts
  useEffect(() => {
    registerNavigationHandler(setCurrentView);
    return () => unregisterNavigationHandler();
  }, [registerNavigationHandler, unregisterNavigationHandler, setCurrentView]);

  // Custom event bridge
  useEffect(() => {
    const handler = (e: Event) => {
      const view = (e as CustomEvent<string>).detail;
      if (typeof view === 'string') setCurrentView(view);
    };
    window.addEventListener('navigate-view', handler as EventListener);
    return () => window.removeEventListener('navigate-view', handler as EventListener);
  }, [setCurrentView]);

  // Deep-link: ?view=<viewId>
  useEffect(() => {
    if (deepLinkViewHandledRef.current || loading || !user) return;
    const targetView = searchParams.get('view');
    
    // Se o targetView for uma rota que agora é interna (como connections ou integrations)
    // mapeamos para o novo hub unificado.
    let resolvedView = targetView;
    if (targetView === 'connections' || targetView === 'integrations' || targetView === 'bridge') {
      resolvedView = 'connections'; // 'connections' é o ID do Hub unificado
    }

    if (resolvedView && resolvedView !== currentView) {
      deepLinkViewHandledRef.current = true;
      setCurrentView(resolvedView);
    } else if (resolvedView) {
      deepLinkViewHandledRef.current = true;
    }
  }, [loading, user, currentView, setCurrentView]);

  return {
    currentView,
    setCurrentView,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    breadcrumbTrail,
    navDirectionRef
  };
}
