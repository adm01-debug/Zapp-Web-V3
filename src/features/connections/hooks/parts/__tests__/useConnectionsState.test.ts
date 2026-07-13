/**
 * Tests for useConnectionsState().
 *
 * The hook manages all local UI state for the connections panel:
 * - connections list, loading flag, dialog open/close flags
 * - qrCodeDialog: initially loaded from sessionStorage (lazy init)
 * - newConnection form state and isCreating flag
 * - syncingHistory tracker
 * - announceConnected: fires toast exactly once per connection id (dedup via ref)
 *
 * sessionStorage is provided by happy-dom — no stub required.
 * toast from @/hooks/use-toast is mocked to avoid the full reducer setup.
 *
 * Covered:
 *   - initial state: all fields match expected defaults
 *   - qrCodeDialog lazy init: falls back to INITIAL_QR_STATE when sessionStorage empty
 *   - qrCodeDialog lazy init: restores from valid (non-expired) sessionStorage entry
 *   - qrCodeDialog lazy init: discards an expired pending entry
 *   - qrCodeDialog lazy init: restores a non-pending status without expiry check
 *   - qrCodeDialog lazy init: returns INITIAL_QR_STATE on malformed JSON
 *   - setConnections updates connections
 *   - setLoading toggles loading
 *   - setIsAddDialogOpen opens and closes the dialog
 *   - setQrCodeDialog merges partial updates
 *   - setNewConnection updates the new-connection form
 *   - setIsCreating toggles the creating flag
 *   - setSyncingHistory sets and clears the syncing id
 *   - dialogGenRef starts at 0 and can be mutated by callers
 *   - refreshInFlightRef starts at false
 *   - INITIAL_QR_STATE and QR_STORAGE_KEY constants are exposed
 *   - announceConnected calls toast on first call
 *   - announceConnected does NOT call toast again for the same connection id
 *   - announceConnected calls toast for a different connection id
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConnectionsState } from '../useConnectionsState';

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

// Import after vi.mock so the reference is the spy
import { toast } from '@/hooks/use-toast';

const QR_STORAGE_KEY = 'zapp:qrDialog:v1';

function setPersistedQr(data: object) {
  sessionStorage.setItem(QR_STORAGE_KEY, JSON.stringify(data));
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  sessionStorage.clear();
});

// ── initial state ──────────────────────────────────────────────────────────────
describe('useConnectionsState — initial state (empty sessionStorage)', () => {
  it('connections is an empty array', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.connections).toEqual([]);
  });

  it('loading starts as true', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.loading).toBe(true);
  });

  it('isAddDialogOpen starts as false', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.isAddDialogOpen).toBe(false);
  });

  it('qrCodeDialog.open starts as false', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.qrCodeDialog.open).toBe(false);
  });

  it('newConnection starts with empty name and phone', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.newConnection.name).toBe('');
    expect(result.current.newConnection.phone_number).toBe('');
    expect(result.current.newConnection.api_type).toBe('evolution');
  });

  it('isCreating starts as false', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.isCreating).toBe(false);
  });

  it('syncingHistory starts as null', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.syncingHistory).toBeNull();
  });
});

// ── sessionStorage qrCodeDialog lazy init ──────────────────────────────────────
describe('useConnectionsState — qrCodeDialog sessionStorage loading', () => {
  it('uses INITIAL_QR_STATE when sessionStorage is empty', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.qrCodeDialog.open).toBe(false);
    expect(result.current.qrCodeDialog.connectionId).toBe('');
  });

  it('restores a valid non-expired pending entry', () => {
    const expiresAt = Date.now() + 300_000; // 5 min in the future
    setPersistedQr({
      connectionId: 'conn-abc',
      connectionName: 'My WhatsApp',
      qrCode: 'data:image/png;base64,abc123',
      status: 'pending',
      expiresAt,
      attemptId: 'attempt-1',
    });
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.qrCodeDialog.open).toBe(true);
    expect(result.current.qrCodeDialog.connectionId).toBe('conn-abc');
    expect(result.current.qrCodeDialog.connectionName).toBe('My WhatsApp');
    expect(result.current.qrCodeDialog.qrCode).toBe('data:image/png;base64,abc123');
    expect(result.current.qrCodeDialog.status).toBe('pending');
    expect(result.current.qrCodeDialog.ttlSource).toBe('detected');
  });

  it('discards an expired pending entry (expiresAt <= now)', () => {
    setPersistedQr({
      connectionId: 'conn-expired',
      connectionName: 'Old',
      qrCode: null,
      status: 'pending',
      expiresAt: Date.now() - 1_000, // 1 second ago
      attemptId: 'attempt-2',
    });
    const { result } = renderHook(() => useConnectionsState());
    // Should fall back to INITIAL_QR_STATE
    expect(result.current.qrCodeDialog.open).toBe(false);
    expect(result.current.qrCodeDialog.connectionId).toBe('');
  });

  it('restores a "connected" entry without expiry check', () => {
    setPersistedQr({
      connectionId: 'conn-xyz',
      connectionName: 'Connected',
      qrCode: null,
      status: 'connected',
      expiresAt: null,
      attemptId: null,
    });
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.qrCodeDialog.open).toBe(true);
    expect(result.current.qrCodeDialog.status).toBe('connected');
    expect(result.current.qrCodeDialog.ttlSource).toBeNull();
    expect(result.current.qrCodeDialog.ttlSeconds).toBeNull();
  });

  it('returns INITIAL_QR_STATE on malformed JSON in sessionStorage', () => {
    sessionStorage.setItem(QR_STORAGE_KEY, '{not valid json');
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.qrCodeDialog.open).toBe(false);
  });
});

// ── state setters ──────────────────────────────────────────────────────────────
describe('useConnectionsState — state setters', () => {
  it('setConnections updates the connections array', () => {
    const { result } = renderHook(() => useConnectionsState());
    const conn = {
      id: 'c1', name: 'Test', phone_number: '+1', instance_id: null,
      status: 'connected', qr_code: null, is_default: false, created_at: '2024-01-01',
    };
    act(() => { result.current.setConnections([conn]); });
    expect(result.current.connections).toHaveLength(1);
    expect(result.current.connections[0].id).toBe('c1');
  });

  it('setLoading can be set to false', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.setLoading(false); });
    expect(result.current.loading).toBe(false);
  });

  it('setLoading can be toggled back to true', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.setLoading(false); });
    act(() => { result.current.setLoading(true); });
    expect(result.current.loading).toBe(true);
  });

  it('setIsAddDialogOpen opens the dialog', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.setIsAddDialogOpen(true); });
    expect(result.current.isAddDialogOpen).toBe(true);
  });

  it('setIsAddDialogOpen closes the dialog', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.setIsAddDialogOpen(true); });
    act(() => { result.current.setIsAddDialogOpen(false); });
    expect(result.current.isAddDialogOpen).toBe(false);
  });

  it('setQrCodeDialog replaces the dialog state', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => {
      result.current.setQrCodeDialog({
        open: true,
        connectionId: 'c99',
        connectionName: 'X',
        qrCode: null,
        status: 'loading',
        expiresAt: null,
        attemptId: null,
        ttlSeconds: null,
        ttlSource: null,
      });
    });
    expect(result.current.qrCodeDialog.open).toBe(true);
    expect(result.current.qrCodeDialog.connectionId).toBe('c99');
  });

  it('setNewConnection updates form fields', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => {
      result.current.setNewConnection({
        name: 'My Connection',
        phone_number: '+55 11 9 9999-9999',
        api_type: 'official',
      });
    });
    expect(result.current.newConnection.name).toBe('My Connection');
    expect(result.current.newConnection.api_type).toBe('official');
  });

  it('setIsCreating sets to true during creation', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.setIsCreating(true); });
    expect(result.current.isCreating).toBe(true);
  });

  it('setIsCreating resets to false after creation', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.setIsCreating(true); });
    act(() => { result.current.setIsCreating(false); });
    expect(result.current.isCreating).toBe(false);
  });

  it('setSyncingHistory sets the connection id being synced', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.setSyncingHistory('conn-syncing'); });
    expect(result.current.syncingHistory).toBe('conn-syncing');
  });

  it('setSyncingHistory can be cleared to null', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.setSyncingHistory('conn-syncing'); });
    act(() => { result.current.setSyncingHistory(null); });
    expect(result.current.syncingHistory).toBeNull();
  });
});

// ── refs ───────────────────────────────────────────────────────────────────────
describe('useConnectionsState — refs', () => {
  it('dialogGenRef.current starts at 0', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.dialogGenRef.current).toBe(0);
  });

  it('dialogGenRef.current can be incremented by callers', () => {
    const { result } = renderHook(() => useConnectionsState());
    result.current.dialogGenRef.current += 1;
    expect(result.current.dialogGenRef.current).toBe(1);
  });

  it('refreshInFlightRef.current starts as false', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.refreshInFlightRef.current).toBe(false);
  });
});

// ── constants exposed ──────────────────────────────────────────────────────────
describe('useConnectionsState — exposed constants', () => {
  it('exposes INITIAL_QR_STATE with open=false', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.INITIAL_QR_STATE.open).toBe(false);
    expect(result.current.INITIAL_QR_STATE.connectionId).toBe('');
    expect(result.current.INITIAL_QR_STATE.qrCode).toBeNull();
  });

  it('exposes QR_STORAGE_KEY matching the expected key', () => {
    const { result } = renderHook(() => useConnectionsState());
    expect(result.current.QR_STORAGE_KEY).toBe('zapp:qrDialog:v1');
  });
});

// ── announceConnected ──────────────────────────────────────────────────────────
describe('useConnectionsState — announceConnected', () => {
  it('calls toast on the first announcement', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.announceConnected({ id: 'conn-1', name: 'Main' }); });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('does NOT call toast again for the same connection id', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.announceConnected({ id: 'conn-1', name: 'Main' }); });
    act(() => { result.current.announceConnected({ id: 'conn-1', name: 'Main' }); });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('calls toast for a different connection id', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.announceConnected({ id: 'conn-1', name: 'A' }); });
    act(() => { result.current.announceConnected({ id: 'conn-2', name: 'B' }); });
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it('includes the connection name in the toast description', () => {
    const { result } = renderHook(() => useConnectionsState());
    act(() => { result.current.announceConnected({ id: 'conn-x', name: 'Shop Brasil' }); });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('Shop Brasil'),
      }),
    );
  });
});
