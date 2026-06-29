import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { usePageTransition } from './TransitionProvider';
import { useReducedMotion } from './useReducedMotion';
import {
  buildVariants,
  REDUCED_MOTION_TRANSITION,
  REDUCED_MOTION_VARIANTS,
  type TransitionOverrides,
  type TransitionVariantName,
} from './transitionVariants';

interface PageTransitionProps {
  children: ReactNode;
  /** Override the variant from context for this subtree. */
  variant?: TransitionVariantName;
  /** Per-instance overrides merged on top of context overrides. */
  overrides?: TransitionOverrides;
  /** Override the key used by AnimatePresence (defaults to current pathname). */
  routeKey?: string;
  className?: string;
}

/**
 * Wraps route content with an AnimatePresence + motion.div that animates on
 * pathname change. Honors `prefers-reduced-motion` automatically.
 */
export function PageTransition({
  children,
  variant,
  overrides,
  routeKey,
  className,
}: PageTransitionProps) {
  const location = useLocation();
  const ctx = usePageTransition();
  const reduced = useReducedMotion();

  const activeVariant = variant ?? ctx.variant;
  const activeOverrides: TransitionOverrides = { ...ctx.overrides, ...(overrides ?? {}) };

  const { variants, transition } = reduced
    ? { variants: REDUCED_MOTION_VARIANTS, transition: REDUCED_MOTION_TRANSITION }
    : buildVariants(activeVariant, activeOverrides);

  const usesFlip = !reduced && (activeVariant === 'flip-x' || activeVariant === 'flip-y');

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey ?? location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={transition}
        className={cn('w-full h-full will-change-transform', className)}
        style={usesFlip ? { perspective: 1200, transformStyle: 'preserve-3d' } : undefined}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
