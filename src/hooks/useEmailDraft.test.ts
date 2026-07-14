// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEmailDraft } from './useEmailDraft';
import { safeClient } from '@/integrations/supabase/safeClient';
import { emailSaveDraft, emailDeleteDraft } from './gmail/gmailApi';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'new_id' }, error: null }),
    })),
  },
}));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: {
    from: vi.fn((_table, cb) => {
      const q = {
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      if (cb) cb(q);
      return Promise.resolve({ data: null, error: null });
    }),
    single: vi.fn().mockResolvedValue({ data: { id: 'new_id' }, error: null }),
  },
}));

vi.mock('./gmail/gmailApi', () => ({
  emailSaveDraft: vi.fn().mockResolvedValue({ data: { draftId: 'external_id' }, error: null }),
  emailDeleteDraft: vi.fn().mockResolvedValue({ success: true }),
}));

describe('useEmailDraft', () => {
  const accountId = 'acc_123';
  const threadId = 'thread_456';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with empty draft', () => {
    const { result } = renderHook(() => useEmailDraft(accountId, threadId));
    expect(result.current.draft).toEqual({
      to: [],
      cc: [],
      subject: '',
      bodyHtml: '',
      isDirty: false,
    });
  });

  it('should update draft state and set isDirty to true', () => {
    const { result } = renderHook(() => useEmailDraft(accountId, threadId));

    act(() => {
      result.current.update({ subject: 'Test Subject' });
    });

    expect(result.current.draft.subject).toBe('Test Subject');
    expect(result.current.draft.isDirty).toBe(true);
  });

  it('should save manually with save()', async () => {
    const { result } = renderHook(() => useEmailDraft(accountId, threadId));

    act(() => {
      result.current.update({ bodyHtml: '<p>Content</p>' });
    });

    await act(async () => {
      await result.current.save();
    });

    expect(emailSaveDraft).toHaveBeenCalled();
    expect(result.current.draft.isDirty).toBe(false);
  });

  it('should discard and delete draft', async () => {
    const { result } = renderHook(() => useEmailDraft(accountId, threadId));

    act(() => {
      result.current.update({ subject: 'To be discarded' });
    });
    await act(async () => {
      await result.current.save();
    });

    await act(async () => {
      await result.current.discard();
    });

    expect(safeClient.from).toHaveBeenCalledWith('email_drafts', expect.any(Function));
    expect(emailDeleteDraft).toHaveBeenCalledWith(accountId, 'external_id');
    expect(result.current.draft.subject).toBe('');
    expect(result.current.draft.id).toBeUndefined();
  });

  it('should handle save errors gracefully', async () => {
    vi.mocked(emailSaveDraft).mockRejectedValueOnce(new Error('API Error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useEmailDraft(accountId, threadId));

    act(() => {
      result.current.update({ subject: 'Error test' });
    });

    await act(async () => {
      await result.current.save();
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Email draft save error'),
      expect.any(Error)
    );
    expect(result.current.isSaving).toBe(false);
    consoleSpy.mockRestore();
  });
});
