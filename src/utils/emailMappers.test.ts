import { describe, it, expect } from 'vitest';
import { emailMappers } from '../utils/emailMappers';

describe('emailMappers', () => {
  describe('account', () => {
    it('should map a raw account row correctly', () => {
      const raw = {
        id: 'acc_123',
        user_id: 'user_456',
        email: 'test@example.com',
        display_name: 'Test Account',
        picture_url: 'http://pic.url',
        is_active: true,
        token_expiry: '2026-05-06T12:00:00Z',
        watch_expiry: '2026-05-06T12:00:00Z',
        created_at: '2026-05-01T00:00:00Z',
      };
      const result = emailMappers.account(raw);
      expect(result).toEqual({
        id: 'acc_123',
        user_id: 'user_456',
        email: 'test@example.com',
        display_name: 'Test Account',
        picture_url: 'http://pic.url',
        is_active: true,
        token_expiry: '2026-05-06T12:00:00Z',
        watch_expiry: '2026-05-06T12:00:00Z',
        created_at: '2026-05-01T00:00:00Z',
      });
    });

    it('should handle missing optional fields in account', () => {
      const raw = {
        id: 'acc_123',
        email: 'test@example.com',
      };
      const result = emailMappers.account(raw);
      expect(result.is_active).toBe(true);
      expect(result.display_name).toBeUndefined();
    });
  });

  describe('tokenInfo', () => {
    it('should map token info correctly', () => {
      const raw = {
        account_id: 'acc_123',
        email: 'test@example.com',
        is_active: true,
        token_status: 'valid',
        token_expiry: '2026-05-06T12:00:00Z',
        watch_status: 'active',
        watch_expiry: '2026-05-06T12:00:00Z',
        minutes_until_expiry: 60,
      };
      const result = emailMappers.tokenInfo(raw);
      expect(result).toEqual(raw);
    });

    it('should use default values for tokenInfo missing fields', () => {
      const raw = { account_id: 'acc_123' };
      const result = emailMappers.tokenInfo(raw);
      expect(result.token_status).toBe('no_token');
      expect(result.watch_status).toBe('no_watch');
      expect(result.is_active).toBe(true);
    });
  });

  describe('thread', () => {
    it('should map thread correctly', () => {
      const raw = {
        id: 'thread_123',
        account_id: 'acc_123',
        email_thread_id: 'gmail_id_456',
        subject: 'Hello',
        snippet: 'World',
        from_email: 'sender@test.com',
        from_name: 'Sender',
        label_ids: ['INBOX'],
        unread_count: 2,
        message_count: 5,
        is_starred: true,
        is_important: false,
        sla_status: 'ok',
        assigned_to: 'agent_1',
        last_message_at: '2026-05-06T10:00:00Z',
        first_reply_at: '2026-05-06T10:05:00Z',
        created_at: '2026-05-06T09:00:00Z',
        contact: { name: 'Contact' },
        tags: ['urgent'],
      };
      const result = emailMappers.thread(raw);
      expect(result.id).toBe('thread_123');
      expect(result.thread_id).toBe('gmail_id_456');
      expect(result.is_unread).toBe(true);
    });

    it('should use fallback thread_id from data.thread_id if email_thread_id is missing', () => {
      const raw = { thread_id: 'fallback_id' };
      const result = emailMappers.thread(raw);
      expect(result.email_thread_id).toBe('fallback_id');
      expect(result.thread_id).toBe('fallback_id');
    });

    it('should handle empty label_ids and tags', () => {
      const result = emailMappers.thread({});
      expect(result.label_ids).toEqual([]);
      expect(result.tags).toEqual([]);
      expect(result.unread_count).toBe(0);
      expect(result.is_unread).toBe(false);
    });
  });

  describe('label', () => {
    it('should map label info correctly', () => {
      const raw = {
        id: 'lbl_123',
        account_id: 'acc_123',
        email_label_id: 'INBOX',
        name: 'Inbox',
        type: 'system',
        color: '#ff0000',
        thread_count: 10,
        unread_count: 2,
      };
      const result = emailMappers.label(raw);
      expect(result).toEqual(raw);
    });

    it('should default label type to user', () => {
      const result = emailMappers.label({ name: 'My Label' });
      expect(result.type).toBe('user');
    });
  });

  describe('array helpers', () => {
    it('should map arrays of accounts', () => {
      const raw = [{ id: '1' }, { id: '2' }];
      const result = emailMappers.accounts(raw);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array when input is null/undefined', () => {
      expect(
        emailMappers.accounts(null as unknown as Parameters<typeof emailMappers.accounts>[0])
      ).toEqual([]);
      expect(
        emailMappers.threads(undefined as unknown as Parameters<typeof emailMappers.threads>[0])
      ).toEqual([]);
    });
  });
});
