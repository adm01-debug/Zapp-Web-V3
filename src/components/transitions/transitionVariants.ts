import type { Variants, Transition } from 'framer-motion';

/** Transition Variant Name component for the transitions section. */
export type TransitionVariantName =
  | 'fade'
  | 'slide-x'
  | 'slide-y'
  | 'zoom'
  | 'flip-x'
  | 'flip-y'
  | 'parallax';

/** Transition Direction component for the transitions section. */
export type TransitionDirection = 'left' | 'right' | 'up' | 'down';

/** Transition Overrides component for the transitions section. */
export interface TransitionOverrides {
  duration?: number;
  ease?: Transition['ease'];
  distance?: number;
  opacity?: number;
  direction?: TransitionDirection;
}

/** DEFAULT_EASE component for the transitions section. */
export const DEFAULT_EASE: Transition['ease'] = [0.4, 0, 0.2, 1];
/** DEFAULT_DURATION component for the transitions section. */
export const DEFAULT_DURATION = 0.3;

function signX(direction: TransitionDirection = 'right'): number {
  return direction === 'left' ? -1 : 1;
}
function signY(direction: TransitionDirection = 'up'): number {
  return direction === 'down' ? 1 : -1;
}

/** build Variants component for the transitions section. */
export function buildVariants(
  name: TransitionVariantName,
  overrides: TransitionOverrides = {},
): { variants: Variants; transition: Transition } {
  const {
    duration = DEFAULT_DURATION,
    ease = DEFAULT_EASE,
    distance = 40,
    opacity = 0,
    direction,
  } = overrides;

  const transition: Transition = { duration, ease };

  switch (name) {
    case 'fade':
      return {
        transition,
        variants: {
          initial: { opacity },
          animate: { opacity: 1 },
          exit: { opacity },
        },
      };
    case 'slide-x': {
      const s = signX(direction);
      return {
        transition,
        variants: {
          initial: { opacity, x: distance * s },
          animate: { opacity: 1, x: 0 },
          exit: { opacity, x: -distance * s },
        },
      };
    }
    case 'slide-y': {
      const s = signY(direction);
      return {
        transition,
        variants: {
          initial: { opacity, y: distance * s },
          animate: { opacity: 1, y: 0 },
          exit: { opacity, y: -distance * s },
        },
      };
    }
    case 'zoom':
      return {
        transition,
        variants: {
          initial: { opacity, scale: 0.96 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity, scale: 1.04 },
        },
      };
    case 'flip-x':
      return {
        transition,
        variants: {
          initial: { opacity, rotateX: 90 },
          animate: { opacity: 1, rotateX: 0 },
          exit: { opacity, rotateX: -90 },
        },
      };
    case 'flip-y':
      return {
        transition,
        variants: {
          initial: { opacity, rotateY: 90 },
          animate: { opacity: 1, rotateY: 0 },
          exit: { opacity, rotateY: -90 },
        },
      };
    case 'parallax':
      return {
        transition,
        variants: {
          initial: { opacity, y: 60, scale: 1.05 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity, y: -60, scale: 0.95 },
        },
      };
  }
}

/** REDUCED_MOTION_TRANSITION component for the transitions section. */
export const REDUCED_MOTION_TRANSITION: Transition = { duration: 0.01 };
/** REDUCED_MOTION_VARIANTS component for the transitions section. */
export const REDUCED_MOTION_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
