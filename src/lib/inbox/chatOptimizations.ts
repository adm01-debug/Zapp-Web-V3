export const BATCH_SIZE = 50;

export function isNearTop(scrollTop: number, threshold = 100): boolean {
  return scrollTop <= threshold;
}

export function isAtBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = 100,
): boolean {
  return scrollHeight - scrollTop <= clientHeight + threshold;
}

export function deduplicateMessages<T extends { id?: string; message_id?: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const existingIds = new Set(existing.map((item) => item.message_id ?? item.id));
  return incoming.filter(
    (item) => !existingIds.has(item.message_id) && !existingIds.has(item.id),
  );
}
