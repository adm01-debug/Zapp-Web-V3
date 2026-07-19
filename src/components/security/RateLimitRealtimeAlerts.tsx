import { useEffect, useState } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Shield, Ban, Clock, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getLogger } from '@/lib/logger';
import {
  normalizeSecurityAlert,
  type NormalizedSecurityAlert as SecurityAlert,
} from '@/lib/normalizers';

const log = getLogger('RateLimitRealtimeAlerts');

const ALERT_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
> = {
  rate_limit: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10 dark:bg-warning/20/30' },
  blocked_ip: {
    icon: Ban,
    color: 'text-destructive',
    bg: 'bg-destructive/10 dark:bg-destructive/20/30',
  },
  suspicious: {
    icon: AlertTriangle,
    color: 'text-warning',
    bg: 'bg-warning/10 dark:bg-warning/20/30',
  },
  default: { icon: Shield, color: 'text-info', bg: 'bg-info/10 dark:bg-info/20/30' },
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'border-l-blue-500',
  medium: 'border-l-yellow-500',
  high: 'border-l-warning',
  critical: 'border-l-red-500',
};

/** Rate Limit Realtime Alerts component for the security section. */
export function RateLimitRealtimeAlerts() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const mountedRef = useMountedRef();

  useEffect(() => {
    // Fetch recent unresolved alerts
    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from('security_alerts')
        .select('*')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        log.error('Failed to fetch security_alerts', error);
        return;
      }
      if (!mountedRef.current) return;
      if (data)
        setAlerts(
          data.map((row) => normalizeSecurityAlert(row as unknown as Record<string, unknown>))
        );
    };

    void fetchAlerts();

    // Subscribe to new alerts
    const channel = supabase
      .channel('security-alerts')
      .on<SecurityAlert>(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'security_alerts' },
        (payload) => {
          const newAlert = normalizeSecurityAlert(
            payload.new as unknown as Record<string, unknown>
          );
          setAlerts((prev) => [newAlert, ...prev].slice(0, 10));

          // Play sound for critical alerts
          if (payload.new.severity === 'critical' || payload.new.severity === 'high') {
            playAlertSound();
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const playAlertSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.5;
      // Autoplay may be blocked before user interaction — log at debug, not warn.
      audio.play().catch((err: unknown) => {
        log.debug('[RateLimitRealtimeAlerts] alert sound blocked by autoplay policy', err);
      });
    } catch (e) {
      // Audio API unsupported or file unavailable — alerts still work without sound.
      log.warn('[RateLimitRealtimeAlerts] could not create Audio element for alert sound', e);
    }
  };

  const handleDismiss = async (alertId: string) => {
    setDismissed((prev) => new Set([...prev, alertId]));

    const { error } = await supabase
      .from('security_alerts')
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', alertId);
    if (error) log.error('Failed to mark security alert as resolved', error);
  };

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id));

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm space-y-2">
      <AnimatePresence mode="popLayout">
        {visibleAlerts.slice(0, 3).map((alert) => {
          const config = ALERT_CONFIG[alert.alert_type] ?? ALERT_CONFIG.default;
          const Icon = config.icon;

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              className={`rounded-lg border border-l-4 bg-card p-4 shadow-lg ${SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.medium}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${config.bg}`}
                >
                  <Icon className={`h-4 w-4 ${config.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => void handleDismiss(alert.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {alert.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{alert.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    {alert.ip_address && <code className="">{alert.ip_address}</code>}
                    <span>•</span>
                    <span>
                      {formatDistanceToNow(new Date(alert.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}