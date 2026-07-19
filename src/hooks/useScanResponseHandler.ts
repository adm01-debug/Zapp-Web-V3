import { useCallback } from 'react';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('useScanResponseHandler');
import {
  type ScanResult,
  isBlocking,
  isRetryable,
  isInputError,
} from '@/lib/scanResponse';

/** Handle Scan Options interface definition. */
export interface HandleScanOptions {
  /** File name shown as toast description for blocking outcomes. */
  fileName?: string;
  /** Toast id used to dedupe consecutive notifications. */
  toastId?: string;
  /** Called when the user taps "Tentar novamente" on retryable errors. */
  onRetry?: () => void;
}

/** Scan Outcome type alias. */
export type ScanOutcome = 'success' | 'blocked' | 'retry' | 'input' | 'error';

/**
 * Single entry-point for rendering UX from a security-scanner response.
 *
 * Mapping:
 *   success                                  → 'success'  (no toast, caller emits its own)
 *   MALWARE_DETECTED | SUSPICIOUS_FILE       → 'blocked'  (destructive toast, no retry)
 *   SCAN_TIMEOUT | SCAN_UNAVAILABLE | net    → 'retry'    (toast with "Tentar novamente")
 *   INVALID_INPUT | METHOD_NOT_ALLOWED       → 'input'    (caller must change request)
 *   STORAGE_ERROR | INTERNAL_ERROR | UNKNOWN → 'error'    (generic toast)
 */
/** Handles security scan results with appropriate toast notifications and retry logic. */
export function useScanResponseHandler() {
  const handleScanResult = useCallback(
    (result: ScanResult, opts: HandleScanOptions = {}): ScanOutcome => {
      const { fileName, toastId = 'file-upload', onRetry } = opts;

      if (result.status === 'success') return 'success';

      const description =
        [
          fileName ? `Arquivo: ${fileName}` : null,
          result.scanId ? `ID da varredura: ${result.scanId}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined;

      if (isBlocking(result)) {
        log.warn('[scan] upload blocked', {
          code: result.code,
          verdict: result.verdict,
          scanId: result.scanId,
          fileName,
        });
        toast.error(result.message, {
          id: toastId,
          description,
          duration: 8000,
        });
        return 'blocked';
      }

      if (isRetryable(result)) {
        log.warn('[scan] upload retryable', {
          code: result.code,
          scanId: result.scanId,
          fileName,
        });
        toast.error(result.message, {
          id: toastId,
          description,
          duration: 10000,
          action: onRetry
            ? { label: 'Tentar novamente', onClick: onRetry }
            : undefined,
        });
        return 'retry';
      }

      if (isInputError(result)) {
        toast.error(result.message, {
          id: toastId,
          description,
          duration: 6000,
        });
        return 'input';
      }

      log.error('[scan] upload error', {
        code: result.code,
        scanId: result.scanId,
        fileName,
        details: result.details,
      });
      toast.error(result.message, {
        id: toastId,
        description,
        duration: 6000,
      });
      return 'error';
    },
    [],
  );

  return { handleScanResult };
}
