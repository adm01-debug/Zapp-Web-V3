/**
 * Module-level cache for `whatsapp_connections` reads.
 *
 * Mirrors the TTL + in-flight dedup pattern from `useGlobalSettings`:
 *  - Single fetch coalesces concurrent callers (no thundering herd).
 *  - 30s TTL avoids redundant round-trips on hot paths (every message send,
 *    every status indicator render, every transfer dialog open).
 *  - Realtime + mutation sites must call `invalidateWhatsappConnectionsCache()`
 *    so the next read repopulates fresh data.
 */
import { supabase } from '@/integrations/supabase/client';

export interface WhatsappConnectionRow {
  id: string;
  instance_id: string | null;
  instance_name: string | null;
  phone_number: string | null;
  status: string | null;
  api_type: string | null;
  updated_at: string | null;
  created_at: string | null;
  [key: string]: unknown;
}

const TTL_MS = 30_000;

let cache: { rows: WhatsappConnectionRow[]; expiresAt: number } | null = null;
let inflight: Promise<WhatsappConnectionRow[]> | null = null;

async function fetchFromDb(): Promise<WhatsappConnectionRow[]> {
  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as WhatsappConnectionRow[];
}

export async function getWhatsappConnections(force = false): Promise<WhatsappConnectionRow[]> {
  const now = Date.now();
  if (!force && cache && cache.expiresAt > now) return cache.rows;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const rows = await fetchFromDb();
      cache = { rows, expiresAt: Date.now() + TTL_MS };
      return rows;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function invalidateWhatsappConnectionsCache(): void {
  cache = null;
}

export async function getWhatsappConnectionById(
  id: string,
  force = false,
): Promise<WhatsappConnectionRow | null> {
  const rows = await getWhatsappConnections(force);
  return rows.find((r) => r.id === id) ?? null;
}

export async function getFirstConnectedWhatsapp(
  force = false,
): Promise<WhatsappConnectionRow | null> {
  const rows = await getWhatsappConnections(force);
  // Match prior behavior: most-recently-updated connected instance first.
  return (
    rows
      .filter((r) => r.status === 'connected')
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0] ?? null
  );
}
