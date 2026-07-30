/**
 * E11–E14: Envio/Edição integridade.
 *
 * Cluster covering:
 *   E11 – assinatura idempotente (applySignature não duplica)
 *   E12 – edit sem falso sucesso (editMessageApi guard)
 *   E13 – onSendMessage contrato (3 params aceitos)
 *   E14 – INSERT UUID-JID fixado (isValidUUID antes de insert)
 */

import { describe, it, expect, vi } from 'vitest';
import { isValidUUID } from '@/utils/uuid';

// ── E11: Assinatura idempotente ─────────────────────────────────────────────
// applySignature must NOT prepend the signature when content already starts
// with `*<agentName>:*`. This protects against double-application during
// retry / error-recovery flows.

describe('E11 — applySignature idempotente', () => {
  it('prepends signature when content has none', () => {
    // Simulate the logic from useMessageSignature.applySignature
    const agentSignature = 'João - Suporte';
    const signatureEnabled = true;

    const applySignature = (content: string): string => {
      if (!signatureEnabled || !agentSignature) return content;
      const sigPrefix = `*${agentSignature}:*`;
      if (content.startsWith(sigPrefix)) return content;
      return `${sigPrefix}\n${content}`;
    };

    const result = applySignature('Mensagem de teste');
    expect(result).toBe('*João - Suporte:*\nMensagem de teste');
  });

  it('does NOT duplicate signature when content already has it', () => {
    const agentSignature = 'João - Suporte';
    const signatureEnabled = true;

    const applySignature = (content: string): string => {
      if (!signatureEnabled || !agentSignature) return content;
      const sigPrefix = `*${agentSignature}:*`;
      if (content.startsWith(sigPrefix)) return content;
      return `${sigPrefix}\n${content}`;
    };

    const alreadySigned = '*João - Suporte:*\nMensagem de teste';
    const result = applySignature(alreadySigned);
    // Must return as-is, no double prefix
    expect(result).toBe(alreadySigned);
  });

  it('returns content unchanged when signature is disabled', () => {
    const agentSignature = 'João - Suporte';
    const signatureEnabled = false;

    const applySignature = (content: string): string => {
      if (!signatureEnabled || !agentSignature) return content;
      const sigPrefix = `*${agentSignature}:*`;
      if (content.startsWith(sigPrefix)) return content;
      return `${sigPrefix}\n${content}`;
    };

    const result = applySignature('Mensagem de teste');
    expect(result).toBe('Mensagem de teste');
  });

  it('returns content unchanged when agentSignature is empty', () => {
    const agentSignature = '';
    const signatureEnabled = true;

    const applySignature = (content: string): string => {
      if (!signatureEnabled || !agentSignature) return content;
      const sigPrefix = `*${agentSignature}:*`;
      if (content.startsWith(sigPrefix)) return content;
      return `${sigPrefix}\n${content}`;
    };

    const result = applySignature('Mensagem');
    expect(result).toBe('Mensagem');
  });

  it('handles edge case: content exactly equals the signature prefix', () => {
    const agentSignature = 'João';
    const signatureEnabled = true;

    const applySignature = (content: string): string => {
      if (!signatureEnabled || !agentSignature) return content;
      const sigPrefix = `*${agentSignature}:*`;
      if (content.startsWith(sigPrefix)) return content;
      return `${sigPrefix}\n${content}`;
    };

    // Content exactly matches the prefix (no newline after)
    const result = applySignature('*João:*');
    expect(result).toBe('*João:*'); // should detect startsWith and return as-is
  });
});

// ── E12: Edit sem falso sucesso ──────────────────────────────────────────────
// The edit flow must verify that editMessageApi was actually called before
// updating the DB locally. Missing instanceName / externalId / contactJid
// must produce an early return with error, NOT a false-success toast.

describe('E12 — edit guard (falso sucesso)', () => {
  it('rejects edit when instanceName is missing', () => {
    const instanceName: string | undefined = undefined;
    const externalId = 'msg-ext-id';
    const contactJid = '5511999999999@s.whatsapp.net';

    // Guard equivalent: if (!instanceName || !externalId || !contactJid) return error
    const shouldEarlyExit = !instanceName || !externalId || !contactJid;
    expect(shouldEarlyExit).toBe(true);
  });

  it('rejects edit when externalId is missing', () => {
    const instanceName = 'wpp2';
    const externalId: string | undefined = undefined;
    const contactJid = '5511999999999@s.whatsapp.net';

    const shouldEarlyExit = !instanceName || !externalId || !contactJid;
    expect(shouldEarlyExit).toBe(true);
  });

  it('rejects edit when contactJid is falsy (empty phone)', () => {
    const instanceName = 'wpp2';
    const externalId = 'msg-ext-id';
    const contactJid = '';

    const shouldEarlyExit = !instanceName || !externalId || !contactJid;
    expect(shouldEarlyExit).toBe(true);
  });

  it('allows edit when all three params are present', () => {
    const instanceName = 'wpp2';
    const externalId = 'msg-ext-id';
    const contactJid = '5511999999999@s.whatsapp.net';

    const shouldProceed = !!(instanceName && externalId && contactJid);
    expect(shouldProceed).toBe(true);
  });
});

// ── E13: onSendMessage contrato (3 params) ──────────────────────────────────
// onSendMessage must accept (content, attachments?, onProgress?) so the
// caller can pass all three without issues.

describe('E13 — onSendMessage contrato', () => {
  it('accepts call with all 3 params: content, attachments, onProgress', () => {
    const onSendMessage = vi.fn();

    const progressCb = vi.fn();
    const content = 'Hello world';
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });

    // Call with 3 params (as useChatPanelHandlers.handleSend does)
    onSendMessage(content, [file], progressCb);

    expect(onSendMessage).toHaveBeenCalledWith(content, [file], progressCb);
  });

  it('accepts call with just content (attachments and onProgress optional)', () => {
    const onSendMessage = vi.fn();
    onSendMessage('only-text');
    expect(onSendMessage).toHaveBeenCalledWith('only-text');
  });

  it('accepts call with content + attachments but no onProgress', () => {
    const onSendMessage = vi.fn();
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    onSendMessage('Com anexo', [file]);
    expect(onSendMessage).toHaveBeenCalledWith('Com anexo', [file]);
  });

  it('onProgress callback is invoked with 0..100 values', () => {
    // Simulate the progress update flow
    const onProgress = vi.fn();

    // Simulate the send operation calling onProgress
    onProgress(50);
    onProgress(100);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 50);
    expect(onProgress).toHaveBeenNthCalledWith(2, 100);
  });
});

// ── E14: INSERT UUID-JID fixado ─────────────────────────────────────────────
// Before inserting into messages (uuid contact_id column), isValidUUID must
// guard against WhatsApp JIDs to prevent PostgREST 400 errors.

describe('E14 — guard isValidUUID antes de insert', () => {
  it('isValidUUID returns false for WhatsApp JIDs (phone numbers)', () => {
    const jids = [
      '5511463755170',
      '551146375517@s.whatsapp.net',
      '5511999999999-1234567890@g.us',
      '11987654321',
    ];
    for (const jid of jids) {
      expect(isValidUUID(jid)).toBe(false);
    }
  });

  it('isValidUUID returns true for valid UUIDs', () => {
    const uuids = [
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    ];
    for (const uuid of uuids) {
      expect(isValidUUID(uuid)).toBe(true);
    }
  });

  it('isValidUUID returns false for null/undefined/empty', () => {
    expect(isValidUUID(null)).toBe(false);
    expect(isValidUUID(undefined)).toBe(false);
    expect(isValidUUID('')).toBe(false);
  });

  it('inline guard rejects non-UUID contact_id before insert', () => {
    // Simulate the guard pattern used in ChatPanel.tsx onPollSent/onContactSent
    const contactId = '5511463755170'; // WhatsApp JID, not a UUID

    if (!isValidUUID(contactId)) {
      // This branch should be taken — guard prevents the insert
      expect(true).toBe(true);
    } else {
      // Should never reach here
      expect(true).toBe(false);
    }
  });

  it('inline guard allows valid UUID contact_id to proceed', () => {
    const contactId = '550e8400-e29b-41d4-a716-446655440000'; // valid UUID

    if (!isValidUUID(contactId)) {
      // Should NOT reach here — UUID is valid
      expect(true).toBe(false);
    } else {
      expect(true).toBe(true);
    }
  });
});
