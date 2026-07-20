export const BATCH_SIZE = 50;

export function isNearTop(scrollTop: number, threshold = 100): boolean {
  return scrollTop <= threshold;
}

export function isAtBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = 100
): boolean {
  return scrollHeight - scrollTop <= clientHeight + threshold;
}

type WithId = { id?: string; message_id?: string };

export function deduplicateMessages<T extends WithId>(existing: T[], incoming: T[]): T[] {
  const existingIds = new Set(existing.map((m) => m.message_id ?? m.id));
  return incoming.filter((m) => !existingIds.has(m.message_id ?? m.id));
}
