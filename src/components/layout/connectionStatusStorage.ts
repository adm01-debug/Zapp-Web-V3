export const RECONNECT_COOLDOWN_MS = 30_000;
export const HISTORY_STORAGE_KEY = 'zappweb:connection-disconnect-history';
export const HISTORY_MAX_ENTRIES = 20;
export const HISTORY_VISIBLE = 5;
export const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
export const FILTER_STORAGE_KEY = 'zappweb:connection-popover-filter';
export const SELECTED_STORAGE_KEY = 'zappweb:connection-popover-selected';

export type FilterValue = 'all' | 'connected' | 'disconnected';

export interface ConnectionRow {
  id: string;
  instance_id: string;
  instance_name: string | null;
  name: string | null;
  phone_number: string | null;
  status: string;
}

export interface DisconnectEvent {
  instance_id: string;
  instance_name: string | null;
  name?: string | null;
  at: number; // epoch ms
}

export const loadFilter = (): FilterValue => {
  try {
    const v = localStorage.getItem(FILTER_STORAGE_KEY);
    if (v === 'connected' || v === 'disconnected' || v === 'all') return v;
  } catch {
    /* ignore */
  }
  return 'all';
};

export const loadSelected = (): string | null => {
  try {
    return localStorage.getItem(SELECTED_STORAGE_KEY);
  } catch {
    return null;
  }
};

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

export const saveHistory = (events: DisconnectEvent[]) => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(events.slice(0, HISTORY_MAX_ENTRIES)));
  } catch {
    /* ignore quota errors */
  }
};

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
