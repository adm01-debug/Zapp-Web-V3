import { useState, useEffect, useCallback, useRef } from 'react';
import { getLogger } from '@/lib/logger';
import type { ConnectionInfo } from './types';

const log = getLogger('useMonitoringNotifications');

/** Hook: use Monitoring Notifications. */
export function useMonitoringNotifications() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const prevConnectionsRef = useRef<ConnectionInfo[]>([]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);

  const requestNotifications = useCallback(async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotificationsEnabled(perm === 'granted');
  }, []);

  const checkDisconnections = useCallback((connections: ConnectionInfo[]) => {
    const prev = prevConnectionsRef.current;
    if (prev.length > 0 && notificationsEnabled) {
      connections.forEach(conn => {
        const prevConn = prev.find(p => p.id === conn.id);
        if (prevConn && prevConn.status === 'connected' && conn.status !== 'connected') {
          try {
            new Notification('⚠️ Conexão Perdida', {
              body: `A instância ${conn.instance_id} foi desconectada.`,
              icon: '/favicon.ico',
              tag: `disconnect-${conn.instance_id}`,
            });
          } catch (e) { log.warn('Browser notification failed', e); }
        }
      });
    }
    prevConnectionsRef.current = connections;
  }, [notificationsEnabled]);

  return { notificationsEnabled, requestNotifications, checkDisconnections };
}
