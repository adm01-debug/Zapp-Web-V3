// Re-export from consolidated useSettingsManagement module (ETAPA 41 consolidation)
import { useWebhookViewPreferencesManagement } from '@/hooks/useSettingsManagement';

export function useWebhookViewPreferences(userId?: string) {
  return useWebhookViewPreferencesManagement(userId);

export interface WebhookViewPreferences {
  statusFilter: WebhookStatusFilter;
  reasonSearch: string;
  eventTypeFilter: string | null;
  pinnedInstance: string | null;
  tableDensity: WebhookTableDensity;
  visibleColumns: WebhookViewColumns;
}

export const DEFAULT_WEBHOOK_VIEW_PREFS: WebhookViewPreferences = {
  statusFilter: 'all',
  reasonSearch: '',
  eventTypeFilter: null,
  pinnedInstance: null,
  tableDensity: 'comfortable',
  visibleColumns: {
    when: true,
    event: true,
    instance: true,
    signature: true,
    status: true,
    action: true,
  },
};

const STORAGE_KEY = 'zappweb:webhook-view-prefs:v1';

function mergeWithDefaults(raw: Partial<WebhookViewPreferences> | null): WebhookViewPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WEBHOOK_VIEW_PREFS };
  return {
    ...DEFAULT_WEBHOOK_VIEW_PREFS,
    ...raw,
    visibleColumns: {
      ...DEFAULT_WEBHOOK_VIEW_PREFS.visibleColumns,
      ...(raw.visibleColumns ?? {}),
    },
  };
}

export function useWebhookViewPreferences() {
  const [prefs, setPrefs] = useState<WebhookViewPreferences>(() =>
    mergeWithDefaults(safeGetJSON<Partial<WebhookViewPreferences> | null>(STORAGE_KEY, null)),
  );

  useEffect(() => {
    safeSetJSON(STORAGE_KEY, prefs);
  }, [prefs]);

  const setPref = useCallback(
    <K extends keyof WebhookViewPreferences>(key: K, value: WebhookViewPreferences[K]) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setVisibleColumn = useCallback(
    (column: keyof WebhookViewColumns, visible: boolean) => {
      setPrefs((prev) => ({
        ...prev,
        visibleColumns: { ...prev.visibleColumns, [column]: visible },
      }));
    },
    [],
  );

  const resetPrefs = useCallback(() => {
    setPrefs({ ...DEFAULT_WEBHOOK_VIEW_PREFS });
  }, []);

  const clearFilters = useCallback(() => {
    setPrefs((prev) => ({
      ...prev,
      statusFilter: DEFAULT_WEBHOOK_VIEW_PREFS.statusFilter,
      reasonSearch: DEFAULT_WEBHOOK_VIEW_PREFS.reasonSearch,
      eventTypeFilter: DEFAULT_WEBHOOK_VIEW_PREFS.eventTypeFilter,
    }));
  }, []);

  const activeFilterCount =
    (prefs.statusFilter !== 'all' ? 1 : 0) +
    (prefs.reasonSearch.trim() ? 1 : 0) +
    (prefs.eventTypeFilter ? 1 : 0);

  return {
    prefs,
    setPref,
    setVisibleColumn,
    resetPrefs,
    clearFilters,
    activeFilterCount,
  };
}
