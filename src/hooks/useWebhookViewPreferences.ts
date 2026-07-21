// useWebhookViewPreferences — persiste preferências de view de webhooks no localStorage
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'zappweb:webhook-view-prefs:v1';

/** Hook: Webhook Status Filter. */
export type WebhookStatusFilter =
  | 'all'
  | 'success'
  | 'failed'
  | 'pending'
  | 'valid'
  | 'invalid'
  | 'unsigned'
  | 'errored';
/** Hook: Webhook Table Density. */
export type WebhookTableDensity = 'compact' | 'normal' | 'comfortable';

/** Hook: Webhook View Columns. */
export interface WebhookViewColumns {
  when: boolean;
  event: boolean;
  instance: boolean;
  status: boolean;
  action: boolean;
  signature: boolean;
  [key: string]: boolean;
}

/** Preferências persistidas de visualização de webhooks. */
export interface WebhookViewPreferences {
  statusFilter: WebhookStatusFilter | string;
  reasonSearch: string;
  eventTypeFilter: string | null;
  tableDensity: WebhookTableDensity;
  pinnedInstance: string | null;
  visibleColumns: WebhookViewColumns;
  [key: string]: unknown;
}

/** Alias interno — mantém compat com o restante do módulo. */
type WebhookViewPrefs = WebhookViewPreferences;

/** Hook: DEFAULT_WEBHOOK_VIEW_PREFS. */
export const DEFAULT_WEBHOOK_VIEW_PREFS: WebhookViewPrefs = {
  statusFilter: 'all',
  reasonSearch: '',
  eventTypeFilter: 'all',
  tableDensity: 'normal',
  pinnedInstance: null,
  visibleColumns: {
    when: true,
    event: true,
    instance: true,
    status: true,
    action: true,
    signature: true,
  },
};

/** Reads webhook view preferences from localStorage, merging with defaults on partial or missing data. Returns defaults on parse error. */
function loadPrefs(): WebhookViewPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WEBHOOK_VIEW_PREFS };
    const parsed = JSON.parse(raw) as Partial<WebhookViewPrefs>;
    return {
      ...DEFAULT_WEBHOOK_VIEW_PREFS,
      ...parsed,
      visibleColumns: {
        ...DEFAULT_WEBHOOK_VIEW_PREFS.visibleColumns,
        ...(parsed.visibleColumns ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_WEBHOOK_VIEW_PREFS };
  }
}

/** Persists the given webhook view preferences to localStorage, silently ignoring quota errors. */
function savePrefs(prefs: WebhookViewPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage full — silently ignore */
  }
}

/** Returns the number of filter fields that differ from their default values (statusFilter, reasonSearch, eventTypeFilter). */
function computeActiveFilterCount(prefs: WebhookViewPrefs): number {
  let count = 0;
  if (prefs.statusFilter !== DEFAULT_WEBHOOK_VIEW_PREFS.statusFilter) count++;
  if (prefs.reasonSearch !== DEFAULT_WEBHOOK_VIEW_PREFS.reasonSearch) count++;
  if (prefs.eventTypeFilter !== DEFAULT_WEBHOOK_VIEW_PREFS.eventTypeFilter) count++;
  return count;
}

/** Hook: use Webhook View Preferences. */
export function useWebhookViewPreferences(_userId?: string) {
  const [prefs, setPrefsState] = useState<WebhookViewPrefs>(loadPrefs);

  const updatePrefs = useCallback((next: WebhookViewPrefs) => {
    setPrefsState(next);
    savePrefs(next);
  }, []);

  const setPref = useCallback(
    <K extends keyof WebhookViewPrefs>(key: K, value: WebhookViewPrefs[K]) => {
      setPrefsState((prev) => {
        const next = { ...prev, [key]: value };
        savePrefs(next);
        return next;
      });
    },
    []
  );

  const setVisibleColumn = useCallback((column: string, visible: boolean) => {
    setPrefsState((prev) => {
      const next = {
        ...prev,
        visibleColumns: { ...prev.visibleColumns, [column]: visible },
      };
      savePrefs(next);
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    const defaults = { ...DEFAULT_WEBHOOK_VIEW_PREFS };
    updatePrefs(defaults);
  }, [updatePrefs]);

  const clearFilters = useCallback(() => {
    setPrefsState((prev) => {
      const next = {
        ...prev,
        statusFilter: DEFAULT_WEBHOOK_VIEW_PREFS.statusFilter,
        reasonSearch: DEFAULT_WEBHOOK_VIEW_PREFS.reasonSearch,
        eventTypeFilter: DEFAULT_WEBHOOK_VIEW_PREFS.eventTypeFilter,
      };
      savePrefs(next);
      return next;
    });
  }, []);

  return {
    prefs,
    setPref,
    setVisibleColumn,
    resetPrefs,
    clearFilters,
    activeFilterCount: computeActiveFilterCount(prefs),
  };
}
