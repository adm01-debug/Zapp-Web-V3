/**
 * evolutionContactCache — in-memory enrichment cache for contact metadata
 * (tags, company, ai_sentiment) fetched via rpc_get_contact.
 */
export interface ContactEnrichmentData {
  tags?: unknown;
  company?: string;
  ai_sentiment?: string;
  name?: string;
  push_name?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

export const CACHE_TTL = 300_000; // 5 minutes

export const contactEnrichmentCache = new Map<
  string,
  { data: ContactEnrichmentData; timestamp: number }
>();

/** Parses enrichment tags from JSON array strings, comma-separated strings, or malformed data safely. */
export function safeParseTags(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return trimmed
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}
