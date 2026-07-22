
/**
 * Tests for useScanResponseHandler().
 *
 * The hook returns handleScanResult(result, opts?) which maps a ScanResult
 * to a ScanOutcome string and fires a toast (sonner) for non-success cases.
 *
 * toast.error is mocked so we can assert on calls without a real DOM renderer.
 *
 * Covered:
 *   - 'success' status → outcome 'success', no toast
 *   - MALWARE_DETECTED → outcome 'blocked', toast.error called
 *   - SUSPICIOUS_FILE  → outcome 'blocked', toast.error called
 *   - SCAN_TIMEOUT     → outcome 'retry',   toast.error called
 *   - SCAN_UNAVAILABLE → outcome 'retry',   toast.error called
 *   - NETWORK_ERROR    → outcome 'retry',   toast.error called
 *   - onRetry provided for retryable → toast receives action
 *   - INVALID_INPUT    → outcome 'input',   toast.error called
 *   - METHOD_NOT_ALLOWED → outcome 'input', toast.error called
 *   - STORAGE_ERROR    → outcome 'error',   toast.error called
 *   - INTERNAL_ERROR   → outcome 'error',   toast.error called
 *   - UNKNOWN          → outcome 'error',   toast.error called
 *   - fileName in opts → description includes the file name
 *   - toastId in opts  → passed to toast
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScanResponseHandler } from '../useScanResponseHandler';
import type { ScanResult, ScanCode } from '@/lib/scanResponse';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from 'sonner';

function makeSuccess(): ScanResult {
  return {
    status: 'success',
    verdict: 'clean',
    scanId: 'scan-001',
    message: 'OK',
    payload: {},
  };
}

function makeError(code: ScanCode, extra?: Partial<Extract<ScanResult, { status: 'error' }>>): ScanResult {
  return {
    status: 'error',
    code,
    message: `Error: ${code}`,
    verdict: 'unknown',
    scanId: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── success ────────────────────────────────────────────────────────────────────
describe('useScanResponseHandler — success', () => {
  it('returns "success" for a clean scan result', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    const outcome = result.current.handleScanResult(makeSuccess());
    expect(outcome).toBe('success');
  });

  it('does NOT call toast.error on success', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    result.current.handleScanResult(makeSuccess());
    expect(toast.error).not.toHaveBeenCalled();
  });
});

// ── blocking ───────────────────────────────────────────────────────────────────
describe('useScanResponseHandler — blocked outcomes', () => {
  it('returns "blocked" for MALWARE_DETECTED', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    expect(result.current.handleScanResult(makeError('MALWARE_DETECTED'))).toBe('blocked');
  });

  it('returns "blocked" for SUSPICIOUS_FILE', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    expect(result.current.handleScanResult(makeError('SUSPICIOUS_FILE'))).toBe('blocked');
  });

  it('calls toast.error for MALWARE_DETECTED', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    result.current.handleScanResult(makeError('MALWARE_DETECTED'));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

// ── retry ──────────────────────────────────────────────────────────────────────
describe('useScanResponseHandler — retry outcomes', () => {
  it('returns "retry" for SCAN_TIMEOUT', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    expect(result.current.handleScanResult(makeError('SCAN_TIMEOUT'))).toBe('retry');
  });

  it('returns "retry" for SCAN_UNAVAILABLE', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    expect(result.current.handleScanResult(makeError('SCAN_UNAVAILABLE'))).toBe('retry');
  });

  it('returns "retry" for NETWORK_ERROR', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    expect(result.current.handleScanResult(makeError('NETWORK_ERROR'))).toBe('retry');
  });

  it('includes action in toast when onRetry is provided', () => {
    const onRetry = vi.fn();
    const { result } = renderHook(() => useScanResponseHandler());
    result.current.handleScanResult(makeError('SCAN_TIMEOUT'), { onRetry });
    const call = vi.mocked(toast.error).mock.calls[0];
    expect(call[1]?.action).toBeDefined();
  });

  it('does NOT include action in toast when onRetry is absent', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    result.current.handleScanResult(makeError('SCAN_TIMEOUT'));
    const call = vi.mocked(toast.error).mock.calls[0];
    expect(call[1]?.action).toBeUndefined();
  });
});

// ── input error ────────────────────────────────────────────────────────────────
describe('useScanResponseHandler — input outcomes', () => {
  it('returns "input" for INVALID_INPUT', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    expect(result.current.handleScanResult(makeError('INVALID_INPUT'))).toBe('input');
  });

  it('returns "input" for METHOD_NOT_ALLOWED', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    expect(result.current.handleScanResult(makeError('METHOD_NOT_ALLOWED'))).toBe('input');
  });

  it('calls toast.error for INVALID_INPUT', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    result.current.handleScanResult(makeError('INVALID_INPUT'));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

// ── generic error ──────────────────────────────────────────────────────────────
describe('useScanResponseHandler — error outcomes', () => {
  it('returns "error" for STORAGE_ERROR', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    expect(result.current.handleScanResult(makeError('STORAGE_ERROR'))).toBe('error');
  });

  it('returns "error" for INTERNAL_ERROR', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    expect(result.current.handleScanResult(makeError('INTERNAL_ERROR'))).toBe('error');
  });

  it('returns "error" for UNKNOWN', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    expect(result.current.handleScanResult(makeError('UNKNOWN'))).toBe('error');
  });

  it('calls toast.error for STORAGE_ERROR', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    result.current.handleScanResult(makeError('STORAGE_ERROR'));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

// ── opts ───────────────────────────────────────────────────────────────────────
describe('useScanResponseHandler — opts', () => {
  it('includes fileName in toast description', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    result.current.handleScanResult(makeError('MALWARE_DETECTED'), { fileName: 'evil.exe' });
    const call = vi.mocked(toast.error).mock.calls[0];
    expect(call[1]?.description).toContain('evil.exe');
  });

  it('uses custom toastId when provided', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    result.current.handleScanResult(makeError('SCAN_TIMEOUT'), { toastId: 'custom-id' });
    const call = vi.mocked(toast.error).mock.calls[0];
    expect(call[1]?.id).toBe('custom-id');
  });

  it('defaults toastId to "file-upload"', () => {
    const { result } = renderHook(() => useScanResponseHandler());
    result.current.handleScanResult(makeError('SCAN_TIMEOUT'));
    const call = vi.mocked(toast.error).mock.calls[0];
    expect(call[1]?.id).toBe('file-upload');
  });
});