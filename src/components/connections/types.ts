/** Hub Tab component for the connections section. */
export type HubTab = 'connections' | 'integrations' | 'bridge';

/** Bridge Status component for the connections section. */
export type BridgeStatus = 'idle' | 'checking' | 'online' | 'offline';

/** Health Row component for the connections section. */
export type HealthRow = {
  window_label?: string | null;
  events_total?: number | null;
  events_ok?: number | null;
  events_failed?: number | null;
  avg_latency_ms?: number | null;
  last_event_at?: string | null;
};
