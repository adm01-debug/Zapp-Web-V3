/**
 * Tests for useWebhookViewPreferences().
 *
 * The hook stores view preferences in localStorage under
 * 'zappweb:webhook-view-prefs:v1'. Tests use happy-dom's real
 * localStorage implementation — no mocking required.
 *
 * Covered:
 *   - Default state matches DEFAULT_WEBHOOK_VIEW_PREFS
 *   - Initialises from a valid stored value
 *   - Merges partial stored value with defaults (missing keys filled in)
 *   - Falls back to defaults on invalid JSON
 *   - setPref updates a single top-level preference
 *   - setVisibleColumn toggles one column's visibility
 *   - resetPrefs restores all preferences to defaults
 *   - clearFilters resets only the three filter fields
 *   - activeFilterCount is 0 with all-default prefs
 *   - activeFilterCount increments for each active filter field
 *   - Changes are persisted to localStorage
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useWebhookViewPreferences,
  DEFAULT_WEBHOOK_VIEW_PREFS,
} from '../useWebhookViewPreferences';

const STORAGE_KEY = 'zappweb:webhook-view-prefs:v1';

beforeEach(() => {
  localStorage.clear();
});

// ── default state ──────────────────────────────────────────────────────────────
describe('useWebhookViewPreferences — default state', () => {
  it('prefs matches DEFAULT_WEBHOOK_VIEW_PREFS when localStorage is empty', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    expect(result.current.prefs).toEqual(DEFAULT_WEBHOOK_VIEW_PREFS);
  });

  it('activeFilterCount is 0 by default', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    expect(result.current.activeFilterCount).toBe(0);
  });
});

// ── initialisation ─────────────────────────────────────────────────────────────
describe('useWebhookViewPreferences — initialisation from localStorage', () => {
  it('loads a fully stored value', () => {
    const stored = { ...DEFAULT_WEBHOOK_VIEW_PREFS, statusFilter: 'valid', tableDensity: 'compact' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useWebhookViewPreferences());
    expect(result.current.prefs.statusFilter).toBe('valid');
    expect(result.current.prefs.tableDensity).toBe('compact');
  });

  it('merges a partial stored object with defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ statusFilter: 'errored' }));
    const { result } = renderHook(() => useWebhookViewPreferences());
    expect(result.current.prefs.statusFilter).toBe('errored');
    // Missing fields filled by defaults
    expect(result.current.prefs.tableDensity).toBe(DEFAULT_WEBHOOK_VIEW_PREFS.tableDensity);
    expect(result.current.prefs.visibleColumns).toEqual(DEFAULT_WEBHOOK_VIEW_PREFS.visibleColumns);
  });

  it('falls back to defaults on invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'this is not json!!!');
    const { result } = renderHook(() => useWebhookViewPreferences());
    expect(result.current.prefs).toEqual(DEFAULT_WEBHOOK_VIEW_PREFS);
  });
});

// ── setPref ────────────────────────────────────────────────────────────────────
describe('useWebhookViewPreferences — setPref', () => {
  it('updates statusFilter', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => { result.current.setPref('statusFilter', 'invalid'); });
    expect(result.current.prefs.statusFilter).toBe('invalid');
  });

  it('updates reasonSearch', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => { result.current.setPref('reasonSearch', 'timeout'); });
    expect(result.current.prefs.reasonSearch).toBe('timeout');
  });

  it('updates tableDensity', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => { result.current.setPref('tableDensity', 'compact'); });
    expect(result.current.prefs.tableDensity).toBe('compact');
  });

  it('updates pinnedInstance', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => { result.current.setPref('pinnedInstance', 'instance-1'); });
    expect(result.current.prefs.pinnedInstance).toBe('instance-1');
  });

  it('persists the updated pref to localStorage', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => { result.current.setPref('statusFilter', 'unsigned'); });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.statusFilter).toBe('unsigned');
  });
});

// ── setVisibleColumn ───────────────────────────────────────────────────────────
describe('useWebhookViewPreferences — setVisibleColumn', () => {
  it('hides a column by setting it to false', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => { result.current.setVisibleColumn('event', false); });
    expect(result.current.prefs.visibleColumns.event).toBe(false);
  });

  it('shows a column by setting it to true', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_WEBHOOK_VIEW_PREFS, visibleColumns: { ...DEFAULT_WEBHOOK_VIEW_PREFS.visibleColumns, instance: false } })
    );
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => { result.current.setVisibleColumn('instance', true); });
    expect(result.current.prefs.visibleColumns.instance).toBe(true);
  });

  it('does not affect other columns', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => { result.current.setVisibleColumn('signature', false); });
    // All columns except 'signature' remain at their default (true)
    const { when, event, instance, status, action } = result.current.prefs.visibleColumns;
    expect([when, event, instance, status, action].every(Boolean)).toBe(true);
    expect(result.current.prefs.visibleColumns.signature).toBe(false);
  });
});

// ── resetPrefs ─────────────────────────────────────────────────────────────────
describe('useWebhookViewPreferences — resetPrefs', () => {
  it('restores all prefs to defaults', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => {
      result.current.setPref('statusFilter', 'valid');
      result.current.setPref('tableDensity', 'compact');
      result.current.setVisibleColumn('when', false);
    });
    act(() => { result.current.resetPrefs(); });
    expect(result.current.prefs).toEqual(DEFAULT_WEBHOOK_VIEW_PREFS);
  });
});

// ── clearFilters ───────────────────────────────────────────────────────────────
describe('useWebhookViewPreferences — clearFilters', () => {
  it('resets statusFilter, reasonSearch, eventTypeFilter to defaults', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => {
      result.current.setPref('statusFilter', 'errored');
      result.current.setPref('reasonSearch', 'connect fail');
      result.current.setPref('eventTypeFilter', 'MESSAGE_RECEIVED');
    });
    act(() => { result.current.clearFilters(); });
    expect(result.current.prefs.statusFilter).toBe(DEFAULT_WEBHOOK_VIEW_PREFS.statusFilter);
    expect(result.current.prefs.reasonSearch).toBe(DEFAULT_WEBHOOK_VIEW_PREFS.reasonSearch);
    expect(result.current.prefs.eventTypeFilter).toBe(DEFAULT_WEBHOOK_VIEW_PREFS.eventTypeFilter);
  });

  it('does not change non-filter prefs when clearing filters', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => { result.current.setPref('tableDensity', 'compact'); });
    act(() => { result.current.clearFilters(); });
    expect(result.current.prefs.tableDensity).toBe('compact');
  });
});

// ── activeFilterCount ──────────────────────────────────────────────────────────
describe('useWebhookViewPreferences — activeFilterCount', () => {
  it('is 0 when all filters are at defaults', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('is 1 when only statusFilter is non-default', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => { result.current.setPref('statusFilter', 'valid'); });
    expect(result.current.activeFilterCount).toBe(1);
  });

  it('is 2 when statusFilter and reasonSearch are active', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => {
      result.current.setPref('statusFilter', 'invalid');
      result.current.setPref('reasonSearch', 'timeout');
    });
    expect(result.current.activeFilterCount).toBe(2);
  });

  it('is 3 when all three filter fields are active', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => {
      result.current.setPref('statusFilter', 'errored');
      result.current.setPref('reasonSearch', 'fail');
      result.current.setPref('eventTypeFilter', 'MESSAGES_SET');
    });
    expect(result.current.activeFilterCount).toBe(3);
  });

  it('returns to 0 after clearFilters', () => {
    const { result } = renderHook(() => useWebhookViewPreferences());
    act(() => {
      result.current.setPref('statusFilter', 'valid');
      result.current.setPref('reasonSearch', 'x');
    });
    act(() => { result.current.clearFilters(); });
    expect(result.current.activeFilterCount).toBe(0);
  });
});
