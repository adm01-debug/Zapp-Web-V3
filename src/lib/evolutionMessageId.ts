/**
 * Robustly extract the WhatsApp/Evolution message id from a send response.
 *
 * Evolution API has slightly inconsistent response shapes across endpoints
 * (`/message/sendText`, `/message/sendMedia`, `/message/sendWhatsAppAudio`,
 * `/message/sendSticker`) and across versions. This helper walks every known
 * location so that a failed retry can still correlate to the same message via
 * `external_id`, instead of inserting a duplicate row.
 *
 * Known shapes seen in the wild:
 *   { key: { id: "..." } }                        // sendText (v2)
 *   { key: "..." }                                // key as raw string (old builds)
 *   { messageId: "..." }                          // some v1 builds
 *   { id: "..." }                                 // sendSticker (rare)
 *   { keyId: "..." }                              // alt casing
 *   { message: { key: { id: "..." } } }           // sendWhatsAppAudio
 *   { response: { key: { id: "..." } } }          // proxied error/success
 *   { data: { key: { id: "..." } } }              // wrapped envelope
 *   { key: { remoteJid, id } }                    // standard Baileys key
 *
 * Null-safe: `null`, `undefined`, primitives, `{ key: null }` and nested
 * null/absent containers all return `null` instead of throwing (F4-19).
 *
 * Returns the first non-empty string found, or `null` when nothing matches.
 */
export function extractEvolutionMessageId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;

  const candidates: unknown[] = [];
  const r = response as Record<string, unknown>;

  // `key` pode ser o objeto Baileys padrão ({ id, remoteJid, fromMe }) ou, em
  // algumas builds/respostas de erro, uma string crua — tratamos ambos.
  const pushKeyAndFields = (container: Record<string, unknown> | null | undefined) => {
    if (!container || typeof container !== 'object') return;
    const key = container.key;
    if (typeof key === 'string') {
      candidates.push(key);
    } else if (key && typeof key === 'object') {
      candidates.push((key as Record<string, unknown>).id);
    }
    candidates.push(container.messageId, container.keyId, container.id);
  };

  // Direct top-level fields
  pushKeyAndFields(r);

  // One level of nesting commonly used by media/audio/sticker endpoints
  const nestedKeys = ['message', 'response', 'data', 'result'] as const;
  for (const k of nestedKeys) {
    const inner = r[k] as Record<string, unknown> | null | undefined;
    if (inner && typeof inner === 'object') {
      pushKeyAndFields(inner);
      // Two levels deep: sendWhatsAppAudio sometimes returns
      // `{ message: { message: { key: { id } } } }` on retries.
      const inner2 = inner.message as Record<string, unknown> | null | undefined;
      if (inner2 && typeof inner2 === 'object') {
        pushKeyAndFields(inner2);
      }
    }
  }

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim();
  }
  return null;
}
