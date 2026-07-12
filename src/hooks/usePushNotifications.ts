import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('usePushNotifications');

interface PushNotificationState {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  isLoading: boolean;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[];
}

const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

/**
 * Aguarda o Service Worker ser registrado. O registro é DEFERIDO em App.tsx
 * (DeferredHooks: first paint + ~800ms + lazy chunk), então componentes que
 * montam cedo NÃO podem depender de `navigator.serviceWorker.ready` — essa
 * promise nunca resolve enquanto nenhum SW estiver registrado, e o race de 5s
 * anterior estourava como falso "ERROR" no console.
 * Faz polling em `getRegistration()`. Nunca lança: retorna `null` no timeout.
 */
async function waitForServiceWorkerRegistration(
  timeoutMs = 15_000,
  pollMs = 500,
): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) return registration;
    } catch {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: 'default',
    isSubscribed: false,
    isLoading: true,
  });

  useEffect(() => {
    let mounted = true;

    const checkSupport = async () => {
      const isSupported = 'Notification' in window &&
                          'serviceWorker' in navigator &&
                          'PushManager' in window;

      if (!isSupported) {
        if (mounted) setState(prev => ({ ...prev, isSupported: false, isLoading: false }));
        return;
      }

      const permission = Notification.permission;

      let isSubscribed = false;
      try {
        // O SW é registrado de forma deferida (App.tsx/DeferredHooks) — usar
        // polling em getRegistration() em vez de correr contra `.ready`.
        const registration = await waitForServiceWorkerRegistration();
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          isSubscribed = !!subscription;
        } else {
          // Condição esperada (SW deferido ou indisponível) — não é erro de app.
          log.warn('[Push] Service Worker não registrado dentro da janela de espera; checagem de subscription adiada');
        }
      } catch (error) {
        log.warn('[Push] Falha não-crítica ao checar push subscription:', error);
      }

      if (mounted) {
        setState({
          isSupported: true,
          permission,
          isSubscribed,
          isLoading: false,
        });
      }
    };

    checkSupport();
    return () => { mounted = false; };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      toast.error('Notificações push não são suportadas neste navegador');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission }));

      if (permission === 'granted') {
        toast.success('Permissão concedida para notificações!');
        return true;
      } else if (permission === 'denied') {
        toast.error('Permissão negada. Você pode alterar nas configurações do navegador.');
        return false;
      }
      return false;
    } catch (error) {
      log.error('Error requesting permission:', error);
      toast.error('Erro ao solicitar permissão');
      return false;
    }
  }, [state.isSupported]);

  const subscribe = useCallback(async (): Promise<PushSubscription | null> => {
    if (!state.isSupported) return null;

    try {
      if (state.permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) return null;
      }

      const registration = await waitForServiceWorkerRegistration();
      if (!registration) {
        toast.error('Service Worker ainda não está pronto. Tente novamente em alguns segundos.');
        return null;
      }
      await navigator.serviceWorker.ready; // registro existe -> ativação é iminente

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      setState(prev => ({ ...prev, isSubscribed: true }));
      toast.success('Notificações push ativadas!');

      log.debug('Push subscription:', JSON.stringify(subscription));

      return subscription;
    } catch (error) {
      log.error('Error subscribing to push:', error);
      toast.error('Erro ao ativar notificações push');
      return null;
    }
  }, [state.isSupported, state.permission, requestPermission]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      const registration = await waitForServiceWorkerRegistration(5_000);
      if (!registration) return false; // sem SW registrado não há subscription a remover
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        setState(prev => ({ ...prev, isSubscribed: false }));
        toast.success('Notificações push desativadas');
        return true;
      }
      return false;
    } catch (error) {
      log.error('Error unsubscribing:', error);
      toast.error('Erro ao desativar notificações');
      return false;
    }
  }, []);

  const showNotification = useCallback(async (payload: NotificationPayload): Promise<boolean> => {
    if (state.permission !== 'granted') {
      log.warn('Notification permission not granted');
      return false;
    }

    try {
      const registration = await waitForServiceWorkerRegistration(5_000);
      if (!registration) {
        log.warn('[Push] SW indisponível — notificação não exibida:', payload.title);
        return false;
      }

      const options: NotificationOptions = {
        body: payload.body,
        icon: payload.icon || '/favicon.ico',
        badge: payload.badge || '/favicon.ico',
        tag: payload.tag,
        data: payload.data,
        requireInteraction: payload.requireInteraction ?? false,
        silent: payload.silent ?? false,
      };

      await registration.showNotification(payload.title, options);

      return true;
    } catch (error) {
      log.error('Error showing notification:', error);
      return false;
    }
  }, [state.permission]);

  const toggleSubscription = useCallback(async () => {
    if (state.isSubscribed) {
      return unsubscribe();
    } else {
      const subscription = await subscribe();
      return !!subscription;
    }
  }, [state.isSubscribed, subscribe, unsubscribe]);

  return {
    ...state,
    requestPermission,
    subscribe,
    unsubscribe,
    showNotification,
    toggleSubscription,
  };
}
