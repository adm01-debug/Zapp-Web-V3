/**
 * Per-message subscription to the in-memory send-status bus.
 * Lightweight: no DB call, no realtime channel — just listens to the
 * transient bus that `messageSender.ts` populates with sending/retrying/etc.
 *
 * Used by message bubbles to display live retry attempts (e.g. "2/3") next
 * to the status icon, beyond what the persisted `messages.status` exposes.
 */
import { useEffect, useState } from 'react';
import {
  getSendStatus,
  subscribeSendStatus,
  type SendStatusDetail,
} from './sendStatusBus';

/** Subscribes to transient send-status bus events for a single message; returns the current SendStatusDetail without any DB round-trip. */
export function useMessageSendStatus(messageId: string | undefined): SendStatusDetail | undefined {
  const [detail, setDetail] = useState<SendStatusDetail | undefined>(() =>
    messageId ? getSendStatus(messageId) : undefined,
  );

  useEffect(() => {
    if (!messageId) {
      setDetail(undefined);
      return;
    }
    setDetail(getSendStatus(messageId));
    const unsub = subscribeSendStatus(messageId, setDetail);
    return unsub;
  }, [messageId]);

  return detail;
}
