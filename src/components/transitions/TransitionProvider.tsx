/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { TransitionOverrides, TransitionVariantName } from './transitionVariants';

interface TransitionState {
  variant: TransitionVariantName;
  overrides: TransitionOverrides;
}

interface TransitionContextValue extends TransitionState {
  setVariant: (variant: TransitionVariantName, overrides?: TransitionOverrides) => void;
  resetVariant: () => void;
}

const TransitionContext = createContext<TransitionContextValue | null>(null);

interface TransitionProviderProps {
  children: ReactNode;
  defaultVariant?: TransitionVariantName;
  defaultOverrides?: TransitionOverrides;
}

/** Transition Provider function. */
export function TransitionProvider({
  children,
  defaultVariant = 'fade',
  defaultOverrides = {},
}: TransitionProviderProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial: TransitionState = { variant: defaultVariant, overrides: defaultOverrides };
  const [state, setState] = useState<TransitionState>(initial);

  const setVariant = useCallback(
    (variant: TransitionVariantName, overrides: TransitionOverrides = {}) => {
      setState({ variant, overrides });
    },
    []
  );

  const resetVariant = useCallback(() => setState(initial), [initial]);

  const value = useMemo<TransitionContextValue>(
    () => ({ ...state, setVariant, resetVariant }),
    [state, setVariant, resetVariant]
  );

  return <TransitionContext.Provider value={value}>{children}</TransitionContext.Provider>;
}

/**
 * Reads/updates the active page transition. Safe to call outside provider —
 * returns sensible defaults so navigation never crashes.
 */
export function usePageTransition(): TransitionContextValue {
  const ctx = useContext(TransitionContext);
  if (ctx) return ctx;
  return {
    variant: 'fade',
    overrides: {},
    setVariant: () => undefined,
    resetVariant: () => undefined,
  };
}
