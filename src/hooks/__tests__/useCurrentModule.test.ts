/**
 * Tests for useCurrentModule().
 *
 * The hook looks up a viewId across all sidebar nav groups and returns
 * { id, label, icon, group } for known IDs or a fallback object with
 * id/label set to viewId and icon/group set to null.
 *
 * Covered:
 *   - Returns correct label and non-null icon for a primaryNav item
 *   - group is null for primaryNav items (empty label group)
 *   - Returns correct label and group for a named-group item
 *   - Returns fallback { id: viewId, label: viewId, icon: null, group: null } for unknown IDs
 *   - Each major nav group is represented (salesNav, automationNav, analyticsNav,
 *     connectionsNav, systemNav)
 *   - Result is stable (same reference) when viewId is unchanged (useMemo)
 *   - Result changes when viewId changes
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCurrentModule } from '../useCurrentModule';

// ── primaryNav items ───────────────────────────────────────────────────────────
describe('useCurrentModule — primaryNav', () => {
  it('returns correct label for "inbox"', () => {
    const { result } = renderHook(() => useCurrentModule('inbox'));
    expect(result.current.label).toBe('Chat');
  });

  it('returns non-null icon for "inbox"', () => {
    const { result } = renderHook(() => useCurrentModule('inbox'));
    expect(result.current.icon).not.toBeNull();
  });

  it('group is null for primaryNav items (empty-label group)', () => {
    const { result } = renderHook(() => useCurrentModule('inbox'));
    expect(result.current.group).toBeNull();
  });

  it('returns id equal to viewId', () => {
    const { result } = renderHook(() => useCurrentModule('dashboard'));
    expect(result.current.id).toBe('dashboard');
  });
});

// ── named-group nav items ──────────────────────────────────────────────────────
describe('useCurrentModule — named groups', () => {
  it('resolves salesNav item "crm360" with group "Vendas & CRM"', () => {
    const { result } = renderHook(() => useCurrentModule('crm360'));
    expect(result.current.label).toBe('CRM 360°');
    expect(result.current.group).toBe('Vendas & CRM');
  });

  it('resolves analyticsNav item "warroom" with group "Analytics"', () => {
    const { result } = renderHook(() => useCurrentModule('warroom'));
    expect(result.current.label).toBe('War Room');
    expect(result.current.group).toBe('Analytics');
  });

  it('resolves connectionsNav item "connections"', () => {
    const { result } = renderHook(() => useCurrentModule('connections'));
    expect(result.current.label).toBe('Conexões & Integrações');
    expect(result.current.group).toBe('Conexões');
  });

  it('resolves systemNav item "admin"', () => {
    const { result } = renderHook(() => useCurrentModule('admin'));
    expect(result.current.label).toBe('Admin');
    expect(result.current.group).toBe('Sistema');
  });

  it('resolves automationNav item "chatbot"', () => {
    const { result } = renderHook(() => useCurrentModule('chatbot'));
    expect(result.current.label).toBe('Chatbot');
    expect(result.current.group).not.toBeNull();
  });

  it('resolves analyticsNav item "sla"', () => {
    const { result } = renderHook(() => useCurrentModule('sla'));
    expect(result.current.label).toBe('SLA');
    expect(result.current.group).toBe('Analytics');
  });
});

// ── unknown viewId fallback ────────────────────────────────────────────────────
describe('useCurrentModule — unknown viewId', () => {
  it('returns id equal to viewId for unknown id', () => {
    const { result } = renderHook(() => useCurrentModule('totally-unknown-view'));
    expect(result.current.id).toBe('totally-unknown-view');
  });

  it('returns label equal to viewId for unknown id', () => {
    const { result } = renderHook(() => useCurrentModule('totally-unknown-view'));
    expect(result.current.label).toBe('totally-unknown-view');
  });

  it('returns null icon for unknown id', () => {
    const { result } = renderHook(() => useCurrentModule('totally-unknown-view'));
    expect(result.current.icon).toBeNull();
  });

  it('returns null group for unknown id', () => {
    const { result } = renderHook(() => useCurrentModule('totally-unknown-view'));
    expect(result.current.group).toBeNull();
  });
});

// ── reactivity ────────────────────────────────────────────────────────────────
describe('useCurrentModule — reactivity', () => {
  it('result is stable when viewId is unchanged', () => {
    const { result, rerender } = renderHook(() => useCurrentModule('inbox'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('result changes when viewId changes', () => {
    let viewId = 'inbox';
    const { result, rerender } = renderHook(() => useCurrentModule(viewId));
    const first = result.current;
    viewId = 'dashboard';
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current.id).toBe('dashboard');
  });
});
