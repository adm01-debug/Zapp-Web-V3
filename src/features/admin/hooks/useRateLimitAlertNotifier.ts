import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { AlertSeverity, RateLimitAlert } from './useRateLimitAlerts';

const SEEN_KEY = 'zapp:admin:rate-limit-seen:v1';
const NOTIFY_PREF_KEY = 'zapp:admin:rate-limit-notify:v1';

/** Notify Preferences interface definition. */
export interface NotifyPreferences {
  enabled: boolean;
  minSeverity: AlertSeverity;
  browserNotifications: boolean;
}

const DEFAULT_PREFS: NotifyPreferences = {
  enabled: true,
  minSeverity: 'high',
  browserNotifications: false,
};

const SEV_RANK: Record<AlertSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** load Notify Prefs function. */
export function loadNotifyPrefs(): NotifyPreferences {
  try {
    const raw = localStorage.getItem(NOTIFY_PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** save Notify Prefs function. */
export function saveNotifyPrefs(next: NotifyPreferences) {
  try {
    localStorage.setItem(NOTIFY_PREF_KEY, JSON.stringify(next));
  } catch {
    /* localStorage unavailable */
  }
}

function loadSeen(): Record<string, AlertSeverity> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, AlertSeverity>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* ignore */
  }
}

/**
 * Dispara toasts (e opcionalmente notificações do sistema) quando alertas
 * novos aparecem ou escalam de severidade em relação ao snapshot anterior.
 */
export function useRateLimitAlertNotifier(
  alerts: RateLimitAlert[],
  prefs: NotifyPreferences = DEFAULT_PREFS
) {
  const seenRef = useRef<Record<string, AlertSeverity>>(loadSeen());

  useEffect(() => {
    if (!prefs.enabled || alerts.length === 0) return;

    const minRank = SEV_RANK[prefs.minSeverity];
    const seen = seenRef.current;
    const nextSeen: Record<string, AlertSeverity> = {};
    const fresh: RateLimitAlert[] = [];

    for (const a of alerts) {
      nextSeen[a.id] = a.severity;
      if (SEV_RANK[a.severity] < minRank) continue;

      const prev = seen[a.id];
      const escalated = prev && SEV_RANK[a.severity] > SEV_RANK[prev];
      if (!prev || escalated) fresh.push(a);
    }

    seenRef.current = nextSeen;
    saveSeen(nextSeen);

    if (fresh.length === 0) return;

    for (const a of fresh.slice(0, 5)) {
      const isCritical = a.severity === 'critical';
      const message = a.description;
      if (isCritical) {
        toast.error(a.title, { description: message, duration: 10000 });
      } else {
        toast.warning(a.title, { description: message, duration: 7000 });
      }

      if (prefs.browserNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(a.title, { body: message, tag: a.id });
        } catch {
          /* ignore */
        }
      }
    }

    if (fresh.length > 5) {
      toast.info(`+${fresh.length - 5} alertas adicionais de rate limit`);
    }
  }, [alerts, prefs.enabled, prefs.minSeverity, prefs.browserNotifications]);
}

/** request Browser Notification Permission function. */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}
