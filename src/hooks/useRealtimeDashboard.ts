// Re-export from consolidated useRealtimeManagement module (ETAPA 37 consolidation)
import { useRealtimeDashboardManagement } from '@/hooks/useRealtimeManagement';

export function useRealtimeDashboard(dashboardId?: string) {
  return useRealtimeDashboardManagement(dashboardId || 'default');
  }, []);

  // Fetch initial counts
  const fetchInitialData = useCallback(async () => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    try {
      const [messagesThisHour, messagesLastHour, unread, contactsToday] = await Promise.all([
        dbFrom('messages')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', hourAgo.toISOString()),
        dbFrom('messages')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', twoHoursAgo.toISOString())
          .lt('created_at', hourAgo.toISOString()),
        dbFrom('messages')
          .select('id', { count: 'exact', head: true })
          .eq('is_read', false)
          .eq('sender', 'contact'),
        dbFrom('contacts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart.toISOString()),
      ]);

      // Get active conversations (contacts with messages in last hour)
      const { data: activeContacts } = await supabase
        .from('messages')
        .select('contact_id')
        .gte('created_at', hourAgo.toISOString())
        .not('contact_id', 'is', null);

      const uniqueContacts = new Set(activeContacts?.map((m) => m.contact_id) || []);

      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        messagesThisHour: messagesThisHour.count || 0,
        messagesLastHour: messagesLastHour.count || 0,
        unreadMessages: unread.count || 0,
        newContactsToday: contactsToday.count || 0,
        activeConversationsNow: uniqueContacts.size,
        isConnected: true,
      }));

      messageCountRef.current = messagesThisHour.count || 0;
    } catch (error) {
      log.error('Error fetching initial data:', error);
    }
  }, []);

  // Subscribe to realtime changes
  useEffect(() => {
    fetchInitialData();

    logMessagesSubscribe('useRealtimeDashboard', { event: 'INSERT', table: dbTable('messages') });
    logMessagesSubscribe('useRealtimeDashboard', { event: 'UPDATE', table: dbTable('messages') });
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'evo', table: 'evolution_messages' }, // FATOR X v6.2
        wrapMessagesHandler<{ new: { from_me?: boolean } }>('useRealtimeDashboard', (payload) => {
          log.debug('New message received in dashboard');
          minuteCountRef.current++;
          messageCountRef.current++;

          setState((prev) => ({
            ...prev,
            messagesThisHour: messageCountRef.current,
            lastMessageAt: new Date(),
            unreadMessages:
              payload.new.from_me === false ? prev.unreadMessages + 1 : prev.unreadMessages,
          }));
        })
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'evo', table: 'evolution_contacts' }, // FATOR X v6.2
        () => {
          setState((prev) => ({
            ...prev,
            newContactsToday: prev.newContactsToday + 1,
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'evo', table: 'evolution_messages' }, // FATOR X v6.2
        wrapMessagesHandler<{ new: { is_read?: boolean }; old?: { is_read?: boolean } }>(
          'useRealtimeDashboard',
          (payload) => {
            if (payload.new.is_read && !payload.old?.is_read) {
              setState((prev) => ({
                ...prev,
                unreadMessages: Math.max(0, prev.unreadMessages - 1),
              }));
            }
          }
        )
      )
      .subscribe((status) => {
        setState((prev) => ({ ...prev, isConnected: status === 'SUBSCRIBED' }));
      });

    // Collect metrics every minute
    const metricsInterval = setInterval(() => {
      setState((prev) => {
        const metric: RealtimeMetric = {
          timestamp: new Date(),
          messagesPerMinute: minuteCountRef.current,
          activeConversations: prev.activeConversationsNow,
          avgResponseTimeSeconds: null,
        };

        const newHistory = [...prev.metricsHistory, metric].slice(-MAX_HISTORY);

        return {
          ...prev,
          messagesPerMinute: minuteCountRef.current,
          metricsHistory: newHistory,
        };
      });

      minuteCountRef.current = 0;
    }, 60000);

    // Refresh full data every 5 minutes
    const refreshInterval = setInterval(fetchInitialData, 5 * 60 * 1000);

    return () => {
      channel.unsubscribe();
      clearInterval(metricsInterval);
      clearInterval(refreshInterval);
    };
  }, [fetchInitialData]);

  return state;
}
