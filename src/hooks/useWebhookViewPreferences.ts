// useWebhookViewPreferences — persiste preferências de view de webhooks no localStorage
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'zappweb:webhook-view-prefs:v1';

interface VisibleColumns {
  when: boolean;
  event: boolean;
  instance: boolean;
  status: boolean;
  action: boolean;
  signature: boolean;
  [key: string]: boolean;
}

interface WebhookViewPrefs {
  statusFilter: string;
  reasonSearch: string;
  eventTypeFilter: string;
  tableDensity: 'compact' | 'normal' | 'comfortable';
  pinnedInstance: string | null;
  visibleColumns: VisibleColumns;
  [key: string]: unknown;
}

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

function savePrefs(prefs: WebhookViewPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* storage full — silently ignore */ }
}

function computeActiveFilterCount(prefs: WebhookViewPrefs): number {
  let count = 0;
  if (prefs.statusFilter !== DEFAULT_WEBHOOK_VIEW_PREFS.statusFilter) count++;
  if (prefs.reasonSearch !== DEFAULT_WEBHOOK_VIEW_PREFS.reasonSearch) count++;
  if (prefs.eventTypeFilter !== DEFAULT_WEBHOOK_VIEW_PREFS.eventTypeFilter) count++;
  return count;
}

export function useWebhookViewPreferences(_userId?: string) {
  const [prefs, setPrefsState] = useState<WebhookViewPrefs>(loadPrefs);

  const updatePrefs = useCallback((next: WebhookViewPrefs) => {
    setPrefsState(next);
    savePrefs(next);
  }, []);

  const setPref = useCallback(<K extends keyof WebhookViewPrefs>(key: K, value: WebhookViewPrefs[K]) => {
    setPrefsState(prev => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      return next;
    });
  }, []);

  const setVisibleColumn = useCallback((column: string, visible: boolean) => {
    setPrefsState(prev => {
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
    setPrefsState(prev => {
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
