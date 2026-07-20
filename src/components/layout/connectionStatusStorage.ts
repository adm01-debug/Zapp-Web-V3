/** RECONNECT_COOLDOWN_MS component for the layout section. */
export const RECONNECT_COOLDOWN_MS = 30_000;
/** HISTORY_STORAGE_KEY component for the layout section. */
export const HISTORY_STORAGE_KEY = 'zappweb:connection-disconnect-history';
/** HISTORY_MAX_ENTRIES component for the layout section. */
export const HISTORY_MAX_ENTRIES = 20;
/** HISTORY_VISIBLE component for the layout section. */
export const HISTORY_VISIBLE = 5;
/** HISTORY_TTL_MS component for the layout section. */
export const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
/** FILTER_STORAGE_KEY component for the layout section. */
export const FILTER_STORAGE_KEY = 'zappweb:connection-popover-filter';
/** SELECTED_STORAGE_KEY component for the layout section. */
export const SELECTED_STORAGE_KEY = 'zappweb:connection-popover-selected';

/** Filter Value component for the layout section. */
export type FilterValue = 'all' | 'connected' | 'disconnected';

/** Connection Row component for the layout section. */
export interface ConnectionRow {
  id: string;
  instance_id: string;
  instance_name: string | null;
  name: string | null;
  phone_number: string | null;
  status: string;
}

/** Disconnect Event component for the layout section. */
export interface DisconnectEvent {
  instance_id: string;
  instance_name: string | null;
  name?: string | null;
  at: number; // epoch ms
}

/** load Filter component for the layout section. */
export const loadFilter = (): FilterValue => {
  try {
    const v = localStorage.getItem(FILTER_STORAGE_KEY);
    if (v === 'connected' || v === 'disconnected' || v === 'all') return v;
  } catch {
    /* ignore */
  }
  return 'all';
};

/** load Selected component for the layout section. */
export const loadSelected = (): string | null => {
  try {
    return localStorage.getItem(SELECTED_STORAGE_KEY);
  } catch {
    return null;
  }
};

/** load History component for the layout section. */
export const loadHistory = (): DisconnectEvent[] => {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DisconnectEvent[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - HISTORY_TTL_MS;
    return parsed.filter((e) => e && typeof e.at === 'number' && e.at >= cutoff);
  } catch {
    return [];
  }
};

/** save History component for the layout section. */
export const saveHistory = (events: DisconnectEvent[]) => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(events.slice(0, HISTORY_MAX_ENTRIES)));
  } catch {
    /* ignore quota errors */
  }
};

/** format Relative component for the layout section. */
export const formatRelative = (ts: number): string => {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const d = Math.floor(hr / 24);
  return `há ${d}d`;
};
