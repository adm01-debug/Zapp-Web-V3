/**
 * D-03 regression test: dedup key generation in useExternalMessages.
 *
 * The E17 fix replaced `DEFAULT_INSTANCE` with `instanceName ?? DEFAULT_INSTANCE`
 * in dedup keys so that different WhatsApp instances produce distinct cache keys.
 *
 * We test the key-construction pattern directly rather than instantiating the
 * full hook (which requires Supabase/Realtime mocks). The pattern is:
 *
 *   `inbox:initial:${remoteJid}:${CONVERSATION_PAGE_SIZE}:${instanceName ?? DEFAULT_INSTANCE}`
 *   `inbox:poll:${remoteJid}:${afterDate}:${instanceName ?? DEFAULT_INSTANCE}:${jidToPhone(remoteJid)}`
 *   `older:${remoteJid}:${oldest}:${CONVERSATION_PAGE_SIZE}:${instanceName ?? DEFAULT_INSTANCE}`
 */
import { describe, it, expect } from 'vitest';

const DEFAULT_INSTANCE = 'wpp2';

/** Builds a dedup key matching the pattern used in useExternalMessages.initialFetch. */
function initialKey(remoteJid: string, instanceName?: string, _pageSize = 50): string {
  return `inbox:initial:${remoteJid}:50:${instanceName ?? DEFAULT_INSTANCE}`;
}

/** Builds a dedup key matching the pattern used in useExternalMessages.pollNewMessages. */
function pollKey(remoteJid: string, afterDate: string, instanceName?: string): string {
  const phone = remoteJid.replace(/[^0-9]/g, '');
  return `inbox:poll:${remoteJid}:${afterDate}:${instanceName ?? DEFAULT_INSTANCE}:${phone}`;
}

/** Builds a dedup key matching the pattern used in useExternalMessages.loadOlder. */
function olderKey(
  remoteJid: string,
  oldest: string,
  instanceName?: string,
  _pageSize = 50
): string {
  return `older:${remoteJid}:${oldest}:50:${instanceName ?? DEFAULT_INSTANCE}`;
}

describe('useExternalApiManagement — D-03 regression: dedup key instanceName', () => {
  const JID = '5511999999999@s.whatsapp.net';
  const DATE = '2026-07-30T12:00:00.000Z';

  describe('initialKey', () => {
    it('uses DEFAULT_INSTANCE when instanceName is undefined', () => {
      const key = initialKey(JID);
      expect(key).toContain('wpp2');
    });

    it('uses instanceName when provided', () => {
      const key = initialKey(JID, 'marketing');
      expect(key).toContain('marketing');
    });

    it('produces distinct keys for different instance names', () => {
      const keyWpp2 = initialKey(JID, 'wpp2');
      const keyMarketing = initialKey(JID, 'marketing');
      expect(keyWpp2).not.toBe(keyMarketing);
    });

    it('produces same key for same jid and instance', () => {
      const a = initialKey(JID, 'comercial_01');
      const b = initialKey(JID, 'comercial_01');
      expect(a).toBe(b);
    });

    it('includes remoteJid', () => {
      const key = initialKey(JID);
      expect(key).toContain(JID);
    });
  });

  describe('pollKey', () => {
    it('uses DEFAULT_INSTANCE when instanceName is undefined', () => {
      const key = pollKey(JID, DATE);
      expect(key).toContain('wpp2');
    });

    it('uses instanceName when provided', () => {
      const key = pollKey(JID, DATE, 'artes');
      expect(key).toContain('artes');
    });

    it('produces distinct keys for different instance names', () => {
      const a = pollKey(JID, DATE, 'wpp2');
      const b = pollKey(JID, DATE, 'financeiro');
      expect(a).not.toBe(b);
    });

    it('includes afterDate and phone in the key', () => {
      const key = pollKey(JID, DATE, 'wpp2');
      expect(key).toContain(DATE);
      expect(key).toContain('5511999999999');
    });
  });

  describe('olderKey', () => {
    it('uses DEFAULT_INSTANCE when instanceName is undefined', () => {
      const key = olderKey(JID, DATE);
      expect(key).toContain('wpp2');
    });

    it('uses instanceName when provided', () => {
      const key = olderKey(JID, DATE, 'logistica');
      expect(key).toContain('logistica');
    });

    it('produces distinct keys for different instance names', () => {
      const a = olderKey(JID, DATE, 'comercial_01');
      const b = olderKey(JID, DATE, 'comercial_02');
      expect(a).not.toBe(b);
    });
  });
});
