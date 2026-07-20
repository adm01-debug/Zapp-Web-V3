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

/** C A C H E_ T T L constant. */
export const CACHE_TTL = 300_000; // 5 minutes

/** contact Enrichment Cache constant. */
export const contactEnrichmentCache = new Map<
  string,
  { data: ContactEnrichmentData; timestamp: number }
>();

/**
 * Enrichment `tags` may arrive as a JSON array string, plain comma-separated
 * string, or malformed data. Never lets a single bad value throw.
 */
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
