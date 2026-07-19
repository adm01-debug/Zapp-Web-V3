/**
 * End-to-end request tracing helper.
 *
 * Generates a short UUID per logical user action (send message, start campaign,
 * public-api call) and returns:
 *   - `requestId` — string to stamp on DB inserts/updates (e.g. messages.request_id)
 *   - `headers`   — `{ 'x-request-id': … }` to attach to `supabase.functions.invoke`
 *                   so the edge function honors the same id in its structured logs.
 *
 * Usage:
 *   const trace = newRequestId();
 *   await supabase.functions.invoke('evolution-api', {
 *     body: { … }, headers: trace.headers,
 *   });
 *   await dbFrom('messages').insert({ …, request_id: trace.requestId });
 */
export interface RequestTrace {
  requestId: string;
  headers: { 'x-request-id': string };
}

/** Generates a short UUID-based request trace with headers ready for supabase.functions.invoke. */
export function newRequestId(prefix?: string): RequestTrace {
  const raw = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  const requestId = prefix ? `${prefix}_${raw}` : raw;
  return { requestId, headers: { 'x-request-id': requestId } };
}
