import { getLogger } from '@/lib/logger';

const log = getLogger('chatOptimizations');

/**
 * Chat performance optimization utilities.
 * Includes incremental loading logic and windowing helpers.
 */

/** Batch Size constant. */
export const BATCH_SIZE = 50;

/**
 * Checks if the scroll is near the top to trigger historical load.
 */
export const isNearTop = (scrollTop: number, threshold = 100) => {
  return scrollTop <= threshold;
};

/**
 * Checks if the scroll is at the bottom to maintain auto-scroll.
 */
export const isAtBottom = (
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = 100
) => {
  return scrollHeight - scrollTop <= clientHeight + threshold;
};

interface WithId {
  id: string;
  message_id?: string;
}

/**
 * Simple message deduplication by message_id or ID.
 */
export const deduplicateMessages = <T extends WithId>(existing: T[], incoming: T[]): T[] => {
  const existingIds = new Set(existing.map((m) => m.message_id || m.id));
  return incoming.filter((m) => !existingIds.has(m.message_id || m.id));
};

/**
 * Track last received message per contact for UX enhancements.
 */
const LAST_RECEIVED_KEY = 'chat_last_received_v1';

/** Last Received Info interface. */
export interface LastReceivedInfo {
  message_id: string;
  timestamp: string;
  content: string;
}

/** set Last Received constant. */
export const setLastReceived = (remoteJid: string, info: LastReceivedInfo) => {
  try {
    const data = JSON.parse(localStorage.getItem(LAST_RECEIVED_KEY) || '{}');
    data[remoteJid] = info;
    localStorage.setItem(LAST_RECEIVED_KEY, JSON.stringify(data));
  } catch (e) {
    log.error('Error saving last received info', e);
  }
};

/** get Last Received constant. */
export const getLastReceived = (remoteJid: string): LastReceivedInfo | null => {
  try {
    const data = JSON.parse(localStorage.getItem(LAST_RECEIVED_KEY) || '{}');
    return data[remoteJid] || null;
  } catch {
    return null;
  }
};
