// Re-export from consolidated useIntegrationAuthenticationManagement module (ETAPA 47 consolidation)
import { useEvolutionAutoSyncManagement } from '@/hooks/useIntegrationAuthenticationManagement';

export function useEvolutionAutoSync(onSynced?: () => void) {
  return useEvolutionAutoSyncManagement(onSynced);
        const phone =
          i.instance?.number || i.instance?.ownerJid?.replace('@s.whatsapp.net', '') || '';
        const status = i.instance?.status === 'open' ? 'connected' : 'disconnected';

        const { error: insertError } = await safeClient.from('whatsapp_connections', (q) =>
          q.insert({
            name,
            phone_number: phone,
            instance_id: instanceName,
            instance_name: instanceName,
            status,
            is_default: false,
            api_type: 'evolution',
          })
        );

        if (insertError) {
          log.warn(`Failed to sync ${instanceName}`, { error: insertError.message });
        }
      }

      // 5. Refresh connections list
      onSynced?.();
    } catch (err) {
      log.warn('Auto-sync failed', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void syncAll();
  }, []); // intentionally empty — runs once on mount

  return { syncAll };
}
