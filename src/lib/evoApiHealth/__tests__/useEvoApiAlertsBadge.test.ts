/**
 * Tests for useEvoApiAlertsBadge().
 *
 * The hook aggregates ActiveAlert[] into severity counts and topSeverity.
 * useActiveAlerts (React Query) is mocked so the hook runs without a
 * QueryClientProvider — only the useMemo aggregation logic is under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockUseActiveAlerts = vi.hoisted(() => vi.fn());

vi.mock('../hooks', () => ({
  useActiveAlerts: mockUseActiveAlerts,
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { useEvoApiAlertsBadge } from '../useEvoApiAlertsBadge';
import type { ActiveAlert } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeAlert(id: number, severity: ActiveAlert['severity']): ActiveAlert {
  return {
    id,
    alert_type: 'test',
    severity,
    title: `Alert ${id}`,
    details: {},
    created_at: new Date().toISOString(),
    age_seconds: 0,
  };
}

function setupAlerts(alerts: ActiveAlert[]) {
  mockUseActiveAlerts.mockReturnValue({ data: { data: alerts } });
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockUseActiveAlerts.mockReturnValue({ data: undefined });
});

// ── Empty / no data ───────────────────────────────────────────────────────────
describe('useEvoApiAlertsBadge — empty state', () => {
  it('returns all zeros and null topSeverity when data is undefined', () => {
    mockUseActiveAlerts.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current).toEqual({
      critical: 0,
      warning: 0,
      info: 0,
      total: 0,
      topSeverity: null,
    });
  });

  it('returns all zeros when data.data is an empty array', () => {
    setupAlerts([]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current).toEqual({
      critical: 0,
      warning: 0,
      info: 0,
      total: 0,
      topSeverity: null,
    });
  });

  it('returns all zeros when data.data is null (treats null like empty)', () => {
    mockUseActiveAlerts.mockReturnValue({ data: { data: null } });
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.total).toBe(0);
    expect(result.current.topSeverity).toBeNull();
  });
});

// ── Single-severity counts ────────────────────────────────────────────────────
describe('useEvoApiAlertsBadge — single severity', () => {
  it('counts critical alerts correctly', () => {
    setupAlerts([makeAlert(1, 'critical'), makeAlert(2, 'critical')]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.critical).toBe(2);
    expect(result.current.warning).toBe(0);
    expect(result.current.info).toBe(0);
    expect(result.current.total).toBe(2);
  });

  it('counts warning alerts correctly', () => {
    setupAlerts([makeAlert(1, 'warning')]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.warning).toBe(1);
    expect(result.current.critical).toBe(0);
    expect(result.current.total).toBe(1);
  });

  it('counts info alerts correctly', () => {
    setupAlerts([makeAlert(1, 'info'), makeAlert(2, 'info'), makeAlert(3, 'info')]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.info).toBe(3);
    expect(result.current.total).toBe(3);
  });
});

// ── Mixed severity counts ─────────────────────────────────────────────────────
describe('useEvoApiAlertsBadge — mixed severities', () => {
  it('counts each severity bucket independently', () => {
    setupAlerts([
      makeAlert(1, 'critical'),
      makeAlert(2, 'warning'),
      makeAlert(3, 'warning'),
      makeAlert(4, 'info'),
    ]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.critical).toBe(1);
    expect(result.current.warning).toBe(2);
    expect(result.current.info).toBe(1);
    expect(result.current.total).toBe(4);
  });

  it('total equals sum of all severity counts', () => {
    setupAlerts([
      makeAlert(1, 'critical'),
      makeAlert(2, 'critical'),
      makeAlert(3, 'warning'),
      makeAlert(4, 'info'),
      makeAlert(5, 'info'),
    ]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    const { critical, warning, info, total } = result.current;
    expect(total).toBe(critical + warning + info);
  });
});

// ── topSeverity ───────────────────────────────────────────────────────────────
describe('useEvoApiAlertsBadge — topSeverity', () => {
  it('is "critical" when any critical alert exists', () => {
    setupAlerts([makeAlert(1, 'critical'), makeAlert(2, 'warning'), makeAlert(3, 'info')]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.topSeverity).toBe('critical');
  });

  it('is "warning" when no critical but warnings exist', () => {
    setupAlerts([makeAlert(1, 'warning'), makeAlert(2, 'info')]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.topSeverity).toBe('warning');
  });

  it('is "info" when only info alerts exist', () => {
    setupAlerts([makeAlert(1, 'info')]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.topSeverity).toBe('info');
  });

  it('is null when no alerts exist', () => {
    setupAlerts([]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.topSeverity).toBeNull();
  });

  it('critical beats warning+info even with many of both', () => {
    setupAlerts([
      makeAlert(1, 'warning'),
      makeAlert(2, 'warning'),
      makeAlert(3, 'info'),
      makeAlert(4, 'critical'),
    ]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.topSeverity).toBe('critical');
  });

  it('warning beats info when no critical', () => {
    setupAlerts([makeAlert(1, 'info'), makeAlert(2, 'info'), makeAlert(3, 'warning')]);
    const { result } = renderHook(() => useEvoApiAlertsBadge());
    expect(result.current.topSeverity).toBe('warning');
  });
});
