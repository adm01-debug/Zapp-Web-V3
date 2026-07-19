/**
 * Pure aggregation helpers for the Realtime Monitor page.
 *
 * Groups `failed_messages` rows by responsible agent and by channel/instance
 * for the dispatch-error block. Kept side-effect free so it can be unit
 * tested without React or Supabase.
 */

import type { FailedMessageRow } from '@/features/admin';

/** Agent Dispatch Aggregate interface. */
export interface AgentDispatchAggregate {
  agent: string;
  total: number;
  pct: number;
  topReasons: Array<{ reason: string; count: number }>;
  lastErrorAt: string | null;
}

/** Channel Dispatch Aggregate interface definition. */
export interface ChannelDispatchAggregate {
  instance: string;
  total: number;
  pct: number;
  lastErrorAt: string | null;
  lastError: string | null;
}

const UNKNOWN_AGENT = 'sem-agente';

/** Extracts the responsible agent from the payload, with a stable fallback. */
export function extractAgent(row: FailedMessageRow): string {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const candidates = [
    p.agent_email,
    p.agentEmail,
    p.assigned_to,
    p.assignedTo,
    p.created_by,
    p.user_email,
    p.userEmail,
    p.agent_id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim();
  }
  return UNKNOWN_AGENT;
}

/**
 * Normaliza campos textuais que podem chegar como null, '' ou apenas espaços
 * em branco do upstream. Whitespace-only é tratado como ausente para evitar
 * que a UI agrupe falhas sob um "código" invisível ('   ').
 */
function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dispatchReason(row: FailedMessageRow): string {
  const code = normalizeText(row.error_code);
  if (code) return code;
  if (row.http_status) return `http_${row.http_status}`;
  return 'unknown';
}

function topN<T extends string>(counts: Map<T, number>, n: number): Array<{ reason: T; count: number }> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([reason, count]) => ({ reason, count }));
}

/** aggregate By Agent function. */
export function aggregateByAgent(rows: FailedMessageRow[]): AgentDispatchAggregate[] {
  const total = rows.length;
  const grouped = new Map<string, FailedMessageRow[]>();
  for (const r of rows) {
    const key = extractAgent(r);
    const list = grouped.get(key) ?? [];
    list.push(r);
    grouped.set(key, list);
  }
  return [...grouped.entries()]
    .map(([agent, list]) => {
      const reasons = new Map<string, number>();
      let lastErrorAt: string | null = null;
      for (const r of list) {
        const reason = dispatchReason(r);
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
        const ts = r.last_attempt_at ?? r.updated_at ?? r.created_at;
        if (!lastErrorAt || new Date(ts) > new Date(lastErrorAt)) lastErrorAt = ts;
      }
      return {
        agent,
        total: list.length,
        pct: total === 0 ? 0 : Math.round((list.length / total) * 1000) / 10,
        topReasons: topN(reasons, 3),
        lastErrorAt,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** aggregate By Channel function. */
export function aggregateByChannel(rows: FailedMessageRow[]): ChannelDispatchAggregate[] {
  const total = rows.length;
  const grouped = new Map<string, FailedMessageRow[]>();
  for (const r of rows) {
    const key = r.instance_name || 'desconhecida';
    const list = grouped.get(key) ?? [];
    list.push(r);
    grouped.set(key, list);
  }
  return [...grouped.entries()]
    .map(([instance, list]) => {
      let lastErrorAt: string | null = null;
      let lastError: string | null = null;
      for (const r of list) {
        const ts = r.last_attempt_at ?? r.updated_at ?? r.created_at;
        if (!lastErrorAt || new Date(ts) > new Date(lastErrorAt)) {
          lastErrorAt = ts;
          lastError = normalizeText(r.error_message) ?? normalizeText(r.error_code);
        }
      }
      return {
        instance,
        total: list.length,
        pct: total === 0 ? 0 : Math.round((list.length / total) * 1000) / 10,
        lastErrorAt,
        lastError,
      };
    })
    .sort((a, b) => b.total - a.total);
}
