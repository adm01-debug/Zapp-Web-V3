import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Message } from '@/types/chat';

/** Hook: FAILURE_CATEGORIES. */
export const FAILURE_CATEGORIES = ['failed', 'failed_auth', 'failed_retries'] as const;
/** Hook: Failure Category. */
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

/** Hook: use Chat Filters. */
export function useChatFilters(messages: Message[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const failuresOnly = searchParams.get('failuresOnly') === '1';

  const rawCategory = searchParams.get('failureCategory');
  const failureCategory: FailureCategory | null =
    rawCategory && (FAILURE_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as FailureCategory)
      : null;

  const setFailuresOnly = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setSearchParams(
        (prev) => {
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
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setFailureCategory = useCallback(
    (next: FailureCategory | null) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (next) sp.set('failureCategory', next);
          else sp.delete('failureCategory');
          return sp;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const failedMessages = useMemo(
    () =>
      messages.filter(
        (m) => m.status === 'failed' || m.status === 'failed_auth' || m.status === 'failed_retries'
      ),
    [messages]
  );

  // Um único passe em vez de três filters separados
  const categoryCounts = useMemo(() => {
    const acc = { failed: 0, failed_auth: 0, failed_retries: 0 };
    for (const m of failedMessages) {
      if (m.status === 'failed') acc.failed++;
      else if (m.status === 'failed_auth') acc.failed_auth++;
      else if (m.status === 'failed_retries') acc.failed_retries++;
    }
    return acc;
  }, [failedMessages]);

  const categoryFilteredMessages = useMemo(
    () =>
      failureCategory ? failedMessages.filter((m) => m.status === failureCategory) : failedMessages,
    [failedMessages, failureCategory]
  );

  const visibleMessages = useMemo(
    () => (failuresOnly ? categoryFilteredMessages : messages),
    [failuresOnly, categoryFilteredMessages, messages]
  );

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
