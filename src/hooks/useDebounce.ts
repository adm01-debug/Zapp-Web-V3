import { useEffect, useRef, useCallback } from 'react';

interface UseDebounceOptions {
  /** Delay in milliseconds (default: 300) */
  delay?: number;
  /** Whether to call immediately on first invocation (default: false) */
  leading?: boolean;
}

/** Returns a debounced version of a callback that executes after specified delay. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  optionsOrDelay: UseDebounceOptions | number = {}
): T {
  const options: UseDebounceOptions =
    typeof optionsOrDelay === 'number' ? { delay: optionsOrDelay } : optionsOrDelay;
  const { delay = 300, leading = false } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const leadingCalledRef = useRef(false);
  const hasTrailingRef = useRef(false);

  // Always use the latest callback
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      // Leading edge: call immediately on first invocation. Subsequent calls
      // within the window (or every call when not leading) mark a trailing call.
      if (leading && !leadingCalledRef.current) {
        leadingCalledRef.current = true;
        callbackRef.current(...args);
      } else {
        hasTrailingRef.current = true;
      }

      // Clear existing timer
      if (timerRef.current) clearTimeout(timerRef.current);

      // Set new timer. With `leading`, only fire the trailing edge if there was
      // at least one additional call after the leading one — otherwise a single
      // invocation would fire twice.
      timerRef.current = setTimeout(() => {
        if (!leading || hasTrailingRef.current) {
          callbackRef.current(...args);
        }
        leadingCalledRef.current = false;
        hasTrailingRef.current = false;
      }, delay);
    },
    [delay, leading]
  ) as T;

  return debouncedFn;
}

/** Returns a debounced value that only updates after specified delay. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Need useState for useDebouncedValue
import { useState } from 'react';
