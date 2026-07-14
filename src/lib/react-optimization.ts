/**
 * React performance optimization helpers
 *
 * Utilities for memoization, preventing unnecessary re-renders, and optimizing dependency arrays.
 */

import {
  DependencyList,
  useMemo,
  useCallback as useCallbackReact,
  useRef,
  useEffect,
  useState,
} from 'react';

/**
 * Memoize a value with deep equality check (not reference equality)
 *
 * Useful when comparing objects/arrays that should be equal if their contents are equal.
 * Standard useMemo only re-computes if dependencies change, but this also checks value equality.
 */
export function useDeepMemo<T>(
  factory: () => T,
  deps: DependencyList,
  isEqual?: (a: T, b: T) => boolean
): T {
  const ref = useRef<T>();
  const signalRef = useRef<DependencyList>();

  // Use reference equality for deps, deep equality for value
  const depsChanged = !signalRef.current || !areArraysEqual(signalRef.current, deps);

  if (depsChanged) {
    const newValue = factory();
    const shouldUpdate =
      !ref.current || (isEqual ? !isEqual(ref.current, newValue) : ref.current !== newValue);

    if (shouldUpdate) {
      ref.current = newValue;
    }
    signalRef.current = deps;
  }

  return ref.current!;
}

/**
 * useCallback variant that uses deep equality for dependencies
 *
 * Prevents callback from changing when deps array contents are equal but references differ.
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  deps: DependencyList
): T {
  const depsRef = useRef<DependencyList>(deps);
  const stableCallbackRef = useRef(callback);

  // Check if deps actually changed (by value, not reference)
  const depsChanged = !areArraysEqual(depsRef.current, deps);
  if (depsChanged) {
    depsRef.current = deps;
    stableCallbackRef.current = callback;
  }

  return useCallbackReact(
    (...args: unknown[]) => stableCallbackRef.current(...args),
    [stableCallbackRef]
  ) as T;
}

/**
 * Track previous value to detect when it changed
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/**
 * Debounce a value — only update after N milliseconds of inactivity
 *
 * Useful for search inputs, resize handlers, etc. Reduces downstream effects.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(handler);
  }, [value, delayMs]);

  return debouncedValue;
}

/**
 * Simple deep equality check for dependency arrays
 */
function areArraysEqual(a: DependencyList | undefined, b: DependencyList | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Memoize inline object/array to prevent re-creating on every render
 *
 * Instead of:
 *   const config = { mode: 'dark', size: 'lg' };
 * Use:
 *   const config = useMemoObject({ mode, size });
 */
export function useMemoObject<T extends Record<string, unknown>>(obj: T): T {
  return useMemo(() => obj, Object.values(obj));
}

/**
 * Memoize inline array to prevent re-creating on every render
 */
export function useMemoArray<T>(arr: T[]): T[] {
  return useMemo(() => arr, arr);
}
