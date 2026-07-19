import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Message } from '@/types/chat';

/** Hook: FAILURE_CATEGORIES. */
export const FAILURE_CATEGORIES = ['failed', 'failed_auth', 'failed_retries'] as const;
/** Hook: Failure Category. */
export type FailureCategory = typeof FAILURE_CATEGORIES[number];

/** Hook: use Chat Filters. */
export function useChatFilters(messages: Message[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const failuresOnly = searchParams.get('failuresOnly') === '1';
  
  const rawCategory = searchParams.get('failureCategory');
  const failureCategory: FailureCategory | null =
    rawCategory && (FAILURE_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as FailureCategory)
      : null;

  const setFailuresOnly = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      const current = sp.get('failuresOnly') === '1';
      const value = typeof next === 'function' ? next(current) : next;
      if (value) {
        sp.set('failuresOnly', '1');
      } else {
        sp.delete('failuresOnly');
        sp.delete('failureCategory');
      }
      return sp;
    }, { replace: true });
  }, [setSearchParams]);

  const setFailureCategory = useCallback((next: FailureCategory | null) => {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (next) sp.set('failureCategory', next);
      else sp.delete('failureCategory');
      return sp;
    }, { replace: true });
  }, [setSearchParams]);

  const failedMessages = messages.filter(
    (m) => m.status === 'failed' || m.status === 'failed_auth' || m.status === 'failed_retries',
  );

  const categoryCounts = {
    failed: failedMessages.filter((m) => m.status === 'failed').length,
    failed_auth: failedMessages.filter((m) => m.status === 'failed_auth').length,
    failed_retries: failedMessages.filter((m) => m.status === 'failed_retries').length,
  };

  const categoryFilteredMessages = failureCategory 
    ? failedMessages.filter((m) => m.status === failureCategory) 
    : failedMessages;

  const visibleMessages = failuresOnly ? categoryFilteredMessages : messages;

  return {
    failuresOnly,
    failureCategory,
    setFailuresOnly,
    setFailureCategory,
    failedMessages,
    categoryCounts,
    categoryFilteredMessages,
    visibleMessages,
  };
}
