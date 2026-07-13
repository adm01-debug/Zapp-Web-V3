import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setPendingWebhookEventsFilters,
  consumePendingWebhookEventsFilters,
  openWebhookEventsWithFilters,
} from '@/lib/webhookEventsDeepLink';
import type { WebhookEventsDeepLinkFilters } from '@/lib/webhookEventsDeepLink';

const STORAGE_KEY = 'webhook-events:pending-filters';

beforeEach(() => {
  sessionStorage.clear();
});

// ── setPendingWebhookEventsFilters ────────────────────────────────────────────

describe('setPendingWebhookEventsFilters — stores filters', () => {
  it('persists eventType in sessionStorage', () => {
    setPendingWebhookEventsFilters({ eventType: 'PRESENCE_UPDATE' });
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ eventType: 'PRESENCE_UPDATE' });
  });

  it('persists instance in sessionStorage', () => {
    setPendingWebhookEventsFilters({ instance: 'wpp2' });
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw!)).toEqual({ instance: 'wpp2' });
  });

  it('persists both eventType and instance together', () => {
    setPendingWebhookEventsFilters({ eventType: 'MESSAGE', instance: 'wpp1' });
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw!)).toEqual({ eventType: 'MESSAGE', instance: 'wpp1' });
  });

  it('persists empty object (no filters)', () => {
    setPendingWebhookEventsFilters({});
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw!)).toEqual({});
  });

  it('overwrites a previously stored value', () => {
    setPendingWebhookEventsFilters({ eventType: 'OLD' });
    setPendingWebhookEventsFilters({ eventType: 'NEW' });
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw!).eventType).toBe('NEW');
  });

  it('does not throw when sessionStorage throws', () => {
    const spy = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(() => setPendingWebhookEventsFilters({ eventType: 'X' })).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

// ── consumePendingWebhookEventsFilters ────────────────────────────────────────

describe('consumePendingWebhookEventsFilters — reads and removes', () => {
  it('returns null when no pending filters are stored', () => {
    expect(consumePendingWebhookEventsFilters()).toBeNull();
  });

  it('returns the stored filters object', () => {
    setPendingWebhookEventsFilters({ eventType: 'PRESENCE_UPDATE', instance: 'wpp2' });
    const result = consumePendingWebhookEventsFilters();
    expect(result).toEqual({ eventType: 'PRESENCE_UPDATE', instance: 'wpp2' });
  });

  it('removes the key from sessionStorage after reading', () => {
    setPendingWebhookEventsFilters({ eventType: 'PRESENCE_UPDATE' });
    consumePendingWebhookEventsFilters();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns null on the second call (single-consumption guarantee)', () => {
    setPendingWebhookEventsFilters({ eventType: 'PRESENCE_UPDATE' });
    consumePendingWebhookEventsFilters(); // first read
    expect(consumePendingWebhookEventsFilters()).toBeNull(); // second read
  });

  it('returns an object with only eventType when instance is absent', () => {
    setPendingWebhookEventsFilters({ eventType: 'MESSAGE' });
    expect(consumePendingWebhookEventsFilters()).toEqual({ eventType: 'MESSAGE' });
  });

  it('returns an object with only instance when eventType is absent', () => {
    setPendingWebhookEventsFilters({ instance: 'wpp1' });
    expect(consumePendingWebhookEventsFilters()).toEqual({ instance: 'wpp1' });
  });

  it('returns null when stored value is invalid JSON', () => {
    sessionStorage.setItem(STORAGE_KEY, '{invalid json}');
    expect(consumePendingWebhookEventsFilters()).toBeNull();
  });

  it('returns null when stored value is a JSON primitive (not object)', () => {
    sessionStorage.setItem(STORAGE_KEY, '"just a string"');
    expect(consumePendingWebhookEventsFilters()).toBeNull();
  });

  it('returns null when stored value is JSON null', () => {
    sessionStorage.setItem(STORAGE_KEY, 'null');
    expect(consumePendingWebhookEventsFilters()).toBeNull();
  });

  it('returns null when sessionStorage.getItem throws', () => {
    const spy = vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage access denied');
    });
    try {
      expect(consumePendingWebhookEventsFilters()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

// ── set / consume round-trip ──────────────────────────────────────────────────

describe('setPendingWebhookEventsFilters / consumePendingWebhookEventsFilters round-trip', () => {
  it('filters survive a set → consume round-trip', () => {
    const filters: WebhookEventsDeepLinkFilters = { eventType: 'MESSAGES_UPSERT', instance: 'main' };
    setPendingWebhookEventsFilters(filters);
    expect(consumePendingWebhookEventsFilters()).toEqual(filters);
  });

  it('filters with "all" values round-trip correctly', () => {
    setPendingWebhookEventsFilters({ eventType: 'all', instance: 'all' });
    expect(consumePendingWebhookEventsFilters()).toEqual({ eventType: 'all', instance: 'all' });
  });
});

// ── openWebhookEventsWithFilters ──────────────────────────────────────────────

describe('openWebhookEventsWithFilters — stores filters and dispatches event', () => {
  it('stores the filters in sessionStorage', () => {
    openWebhookEventsWithFilters({ eventType: 'SEND_MESSAGE' });
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw!)).toEqual({ eventType: 'SEND_MESSAGE' });
  });

  it('dispatches a "navigate-view" CustomEvent on window', () => {
    const received: CustomEvent[] = [];
    const handler = (e: Event) => received.push(e as CustomEvent);
    window.addEventListener('navigate-view', handler);
    try {
      openWebhookEventsWithFilters({ eventType: 'PRESENCE_UPDATE' });
      expect(received).toHaveLength(1);
    } finally {
      window.removeEventListener('navigate-view', handler);
    }
  });

  it('dispatches "navigate-view" with detail "webhook-events"', () => {
    let detail: unknown = null;
    const handler = (e: Event) => { detail = (e as CustomEvent).detail; };
    window.addEventListener('navigate-view', handler);
    try {
      openWebhookEventsWithFilters({ instance: 'wpp1' });
      expect(detail).toBe('webhook-events');
    } finally {
      window.removeEventListener('navigate-view', handler);
    }
  });

  it('filters stored are consumable by consumePendingWebhookEventsFilters', () => {
    openWebhookEventsWithFilters({ eventType: 'MESSAGE', instance: 'wpp2' });
    const consumed = consumePendingWebhookEventsFilters();
    expect(consumed).toEqual({ eventType: 'MESSAGE', instance: 'wpp2' });
  });
});
