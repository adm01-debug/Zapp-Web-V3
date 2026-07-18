import { useState, useCallback } from 'react';

const STORAGE_KEY = 'zappweb:webhook-view-prefs:v1';

export interface WebhookViewPrefs {
  statusFilter: string;
  reasonSearch: string;
  eventTypeFilter: string;
  tableDensity: 'comfortable' | 'compact' | 'standard';
  pinnedInstance: string | null;
  visibleColumns: {
    when: boolean;
    event: boolean;
    instance: boolean;
    status: boolean;
    action: boolean;
    signature: boolean;
  };
}

export const DEFAULT_WEBHOOK_VIEW_PREFS: WebhookViewPrefs = {
  statusFilter: 'all',
  reasonSearch: '',
  eventTypeFilter: 'all',
  tableDensity: 'comfortable',
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

const FILTER_KEYS: (keyof WebhookViewPrefs)[] = ['statusFilter', 'reasonSearch', 'eventTypeFilter'];

function loadPrefs(): WebhookViewPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WEBHOOK_VIEW_PREFS;
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
    return DEFAULT_WEBHOOK_VIEW_PREFS;
  }
}

function savePrefs(prefs: WebhookViewPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* noop */
  }
}

export function useWebhookViewPreferences(_userId?: string) {
  const [prefs, setPrefsState] = useState<WebhookViewPrefs>(loadPrefs);

  const updatePrefs = useCallback((updated: WebhookViewPrefs) => {
    setPrefsState(updated);
    savePrefs(updated);
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

  const setVisibleColumn = useCallback(
    (column: keyof WebhookViewPrefs['visibleColumns'], visible: boolean) => {
      setPrefsState((prev) => {
        const next = {
          ...prev,
          visibleColumns: { ...prev.visibleColumns, [column]: visible },
        };
        savePrefs(next);
        return next;
      });
    },
    []
  );

  const resetPrefs = useCallback(() => {
    updatePrefs(DEFAULT_WEBHOOK_VIEW_PREFS);
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

  const activeFilterCount = FILTER_KEYS.reduce((count, key) => {
    const val = prefs[key];
    const def = DEFAULT_WEBHOOK_VIEW_PREFS[key];
    return count + (val !== def ? 1 : 0);
  }, 0);

  return { prefs, setPref, setVisibleColumn, resetPrefs, clearFilters, activeFilterCount };
}
