/**
 * Tests for useHubTabNavigation().
 *
 * react-router-dom is mocked so no Router context is required.
 * mockSetSearchParams actually mutates mockParams so that both useEffects
 * inside the hook stay consistent (first effect writes, second effect reads
 * the updated value and produces no-op).
 *
 * Covered:
 *   - Defaults to 'connections' when no ?tab param
 *   - Reads valid tab values: 'connections', 'integrations'
 *   - Reads 'bridge' when isDev=true; falls back to 'connections' when false
 *   - Falls back to 'connections' for unknown / empty tab values
 *   - setTab() updates the tab state
 *   - isDev=true allows 'bridge' via setTab; isDev=false keeps 'connections'
 *   - Returns { tab, setTab } with correct types
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockParams = new URLSearchParams();

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [
    mockParams,
    (updater: ((p: URLSearchParams) => URLSearchParams) | URLSearchParams) => {
      if (typeof updater === 'function') updater(mockParams);
    },
  ],
}));

import { useHubTabNavigation } from '../useHubTabNavigation';

beforeEach(() => {
  vi.clearAllMocks();
  [...mockParams.keys()].forEach((k) => mockParams.delete(k));
});

// ── initial tab resolution ─────────────────────────────────────────────────────
describe('useHubTabNavigation — initial tab', () => {
  it('defaults to "connections" when no ?tab param is present', () => {
    const { result } = renderHook(() => useHubTabNavigation(false));
    expect(result.current.tab).toBe('connections');
  });

  it('reads "connections" from ?tab=connections', () => {
    mockParams.set('tab', 'connections');
    const { result } = renderHook(() => useHubTabNavigation(false));
    expect(result.current.tab).toBe('connections');
  });

  it('reads "integrations" from ?tab=integrations', () => {
    mockParams.set('tab', 'integrations');
    const { result } = renderHook(() => useHubTabNavigation(false));
    expect(result.current.tab).toBe('integrations');
  });

  it('reads "bridge" from ?tab=bridge when isDev=true', () => {
    mockParams.set('tab', 'bridge');
    const { result } = renderHook(() => useHubTabNavigation(true));
    expect(result.current.tab).toBe('bridge');
  });

  it('falls back to "connections" for ?tab=bridge when isDev=false', () => {
    mockParams.set('tab', 'bridge');
    const { result } = renderHook(() => useHubTabNavigation(false));
    expect(result.current.tab).toBe('connections');
  });

  it('falls back to "connections" for an unknown tab value', () => {
    mockParams.set('tab', 'garbage');
    const { result } = renderHook(() => useHubTabNavigation(false));
    expect(result.current.tab).toBe('connections');
  });

  it('falls back to "connections" for an empty tab param', () => {
    mockParams.set('tab', '');
    const { result } = renderHook(() => useHubTabNavigation(false));
    expect(result.current.tab).toBe('connections');
  });
});

// ── setTab ─────────────────────────────────────────────────────────────────────
describe('useHubTabNavigation — setTab()', () => {
  it('setTab("integrations") updates tab from default', () => {
    const { result } = renderHook(() => useHubTabNavigation(false));
    expect(result.current.tab).toBe('connections');
    act(() => result.current.setTab('integrations'));
    expect(result.current.tab).toBe('integrations');
  });

  it('setTab("connections") transitions from integrations', () => {
    mockParams.set('tab', 'integrations');
    const { result } = renderHook(() => useHubTabNavigation(false));
    expect(result.current.tab).toBe('integrations');
    act(() => result.current.setTab('connections'));
    expect(result.current.tab).toBe('connections');
  });

  it('setTab("bridge") works when isDev=true', () => {
    const { result } = renderHook(() => useHubTabNavigation(true));
    act(() => result.current.setTab('bridge'));
    expect(result.current.tab).toBe('bridge');
  });

  it('setting same tab value leaves state unchanged', () => {
    const { result } = renderHook(() => useHubTabNavigation(false));
    act(() => result.current.setTab('connections'));
    expect(result.current.tab).toBe('connections');
  });
});

// ── return shape ───────────────────────────────────────────────────────────────
describe('useHubTabNavigation — return shape', () => {
  it('returns an object with { tab, setTab }', () => {
    const { result } = renderHook(() => useHubTabNavigation(false));
    expect(result.current).toHaveProperty('tab');
    expect(result.current).toHaveProperty('setTab');
    expect(typeof result.current.setTab).toBe('function');
  });

  it('tab is one of the valid HubTab values', () => {
    const valid = ['connections', 'integrations', 'bridge'];
    const { result } = renderHook(() => useHubTabNavigation(false));
    expect(valid).toContain(result.current.tab);
  });
});
