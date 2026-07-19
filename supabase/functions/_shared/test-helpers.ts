/**
 * Shared test helpers usable by ANY edge function test suite.
 *
 * Promoted from `supabase/functions/evolution-api/__tests__/_helpers.ts` so
 * that other functions (e.g. `public-api`) can reuse the same robust
 * source-reading and block-extraction primitives without duplicating logic.
 */

const _sourceCache = new Map<string, string>();

/**
 * Read a source file relative to the importing test module. Cached per URL.
 *
 * Usage from a test file:
 *   const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");
 */
export async function readSourceFrom(
  importMetaUrl: string,
  relativePath: string,
): Promise<string> {
  const url = new URL(relativePath, importMetaUrl).toString();
  const cached = _sourceCache.get(url);
  if (cached !== undefined) return cached;
  const text = await Deno.readTextFile(new URL(url));
  _sourceCache.set(url, text);
  return text;
}

/** Extract Block Options interface definition. */
export interface ExtractBlockOptions {
  /** Stop the block when this pattern is found after the marker (exclusive). */
  until?: string | RegExp;
  /** Max characters to scan / return (default 2000). */
  maxSize?: number;
}

/**
 * Extract a chunk of source starting at `marker`. If `until` is provided,
 * the block ends at the next match of `until` after the marker (exclusive),
 * bounded by `maxSize`. Otherwise returns up to `maxSize` characters.
 *
 * Throws a descriptive error if the marker is not found.
 */
export function extractBlock(
  source: string,
  marker: string,
  opts: ExtractBlockOptions = {},
): string {
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`extractBlock: marker not found: ${JSON.stringify(marker)}`);
  }
  const maxSize = opts.maxSize ?? 2000;
  const window = source.slice(start, start + maxSize);
  if (opts.until !== undefined) {
    const afterMarker = window.slice(marker.length);
    const idx = afterMarker.search(
      typeof opts.until === "string"
        ? new RegExp(opts.until.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        : opts.until,
    );
    if (idx !== -1) {
      return window.slice(0, marker.length + idx);
    }
  }
  return window;
}

/**
 * Returns true if the marker exists anywhere in source. Useful for
 * "if-implemented" guard tests that no-op when a feature isn't there yet.
 */
export function hasMarker(source: string, marker: string): boolean {
  return source.indexOf(marker) !== -1;
}
