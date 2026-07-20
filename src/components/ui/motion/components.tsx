import { motion, HTMLMotionProps, useReducedMotion } from 'framer-motion';
import { forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { fadeIn, fadeInUp, scaleIn, staggerContainer, staggerItem } from './variants';

// Page transition wrapper
interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  direction?: 'forward' | 'back' | null;
}

/** Animates page entry/exit with a horizontal slide respecting reduced-motion preference and mobile breakpoint. */
export const PageTransition = forwardRef<HTMLDivElement, PageTransitionProps>(({ children, className, direction }, ref) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const shouldReduce = useReducedMotion();
  const slideX = isMobile ? 24 : 12;
  const enterX = direction === 'back' ? -slideX : slideX;
  const exitX = direction === 'back' ? slideX : -slideX;

  return (
    <motion.div ref={ref}
      initial={shouldReduce ? false : { opacity: 0, x: enterX }}
      animate={{ opacity: 1, x: 0 }}
      exit={shouldReduce ? undefined : { opacity: 0, x: exitX }}
      transition={shouldReduce ? { duration: 0 } : { duration: isMobile ? 0.25 : 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn('h-full min-h-0 overflow-hidden', className)}
    >
      {children}
    </motion.div>
  );
});
PageTransition.displayName = 'PageTransition';

// Neon page reveal
interface NeonPageRevealProps { children: ReactNode; className?: string; delay?: number; }

/** Fades and scales content in with two radial neon glows (primary/secondary) flashing briefly on entry. */
export function NeonPageReveal({ children, className, delay = 0 }: NeonPageRevealProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 40, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] } }}
      className={cn('relative', className)}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0] }} transition={{ duration: 1, delay: delay + 0.2 }}
        className="absolute -top-4 -left-4 w-32 h-32 pointer-events-none"
        style={{ background: 'radial-gradient(circle, hsl(var(--secondary) / 0.4) 0%, transparent 70%)', filter: 'blur(20px)' }} />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0] }} transition={{ duration: 1, delay: delay + 0.3 }}
        className="absolute -bottom-4 -right-4 w-32 h-32 pointer-events-none"
        style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 70%)', filter: 'blur(20px)' }} />
      {children}
    </motion.div>
  );
}

// Motion Card
interface MotionCardProps extends HTMLMotionProps<'div'> { children: ReactNode; hover?: boolean; tap?: boolean; }

/** Card wrapper that lifts on hover and scales on tap; both effects are individually toggleable via props. */
export const MotionCard = forwardRef<HTMLDivElement, MotionCardProps>(
  ({ children, className, hover = true, tap = true, ...props }, ref) => (
    <motion.div ref={ref}
      whileHover={hover ? { y: -4, transition: { duration: 0.2 } } : undefined}
      whileTap={tap ? { scale: 0.98 } : undefined}
      className={cn('rounded-xl border border-border bg-card text-card-foreground shadow-none transition-shadow', className)}
      {...props}>{children}</motion.div>
  )
);
MotionCard.displayName = 'MotionCard';

// Motion Button
interface MotionButtonProps extends HTMLMotionProps<'button'> { children: ReactNode; }

/** Animated button that scales slightly on hover and compresses on tap for tactile feedback. */
export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ children, className, ...props }, ref) => (
    <motion.button ref={ref} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }} className={className} {...props}>{children}</motion.button>
  )
);
MotionButton.displayName = 'MotionButton';

// Staggered list
/** Container that orchestrates staggered child entry animations using the shared `staggerContainer` variant. */
export function StaggeredList({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div variants={staggerContainer} initial="hidden" animate="visible" className={className}>{children}</motion.div>;
}

/** Individual item inside a StaggeredList; applies the shared `staggerItem` variant for sequential reveal. */
export const StaggeredItem = forwardRef<HTMLDivElement, HTMLMotionProps<'div'> & { children: ReactNode }>(
  ({ children, className, ...props }, ref) => (
    <motion.div ref={ref} variants={staggerItem} className={className} {...props}>{children}</motion.div>
  )
);
StaggeredItem.displayName = 'StaggeredItem';

// Fade/Scale/Slide convenience wrappers
interface MotionFadeInProps extends HTMLMotionProps<'div'> { children: ReactNode; delay?: number; }

/** Fades a div in using the shared `fadeIn` variant; supports an optional entry delay in seconds. */
export const MotionFadeIn = forwardRef<HTMLDivElement, MotionFadeInProps>(
  ({ children, className, delay = 0, ...props }, ref) => (
    <motion.div ref={ref} initial="hidden" animate="visible" exit="exit" variants={fadeIn} transition={{ delay }} className={className} {...props}>{children}</motion.div>
  )
);
MotionFadeIn.displayName = 'MotionFadeIn';

/** Slides a div up and fades it in using the shared `fadeInUp` variant; supports an optional entry delay. */
export const MotionSlideUp = forwardRef<HTMLDivElement, MotionFadeInProps>(
  ({ children, className, delay = 0, ...props }, ref) => (
    <motion.div ref={ref} initial="hidden" animate="visible" exit="exit" variants={fadeInUp} transition={{ delay }} className={className} {...props}>{children}</motion.div>
  )
);
MotionSlideUp.displayName = 'MotionSlideUp';

/** Scales and fades a div in using the shared `scaleIn` variant; supports an optional entry delay in seconds. */
export const MotionScale = forwardRef<HTMLDivElement, MotionFadeInProps>(
  ({ children, className, delay = 0, ...props }, ref) => (
    <motion.div ref={ref} initial="hidden" animate="visible" exit="exit" variants={scaleIn} transition={{ delay }} className={className} {...props}>{children}</motion.div>
  )
);
MotionScale.displayName = 'MotionScale';

// Interactive hover/tap
/** Div wrapper with configurable hover/tap scale factors; sets `cursor-pointer` by default. */
export const MotionInteractive = forwardRef<HTMLDivElement, HTMLMotionProps<'div'> & { children: ReactNode; hoverScale?: number; tapScale?: number }>(
  ({ children, className, hoverScale = 1.02, tapScale = 0.98, ...props }, ref) => (
    <motion.div ref={ref} whileHover={{ scale: hoverScale }} whileTap={{ scale: tapScale }}
      transition={{ duration: 0.2 }} className={cn('cursor-pointer', className)} {...props}>{children}</motion.div>
  )
);
MotionInteractive.displayName = 'MotionInteractive';

// Skeleton shimmer
/** Animated shimmer placeholder used while content loads; accepts a `rounded` variant for shape matching. */
export function SkeletonShimmer({ className, rounded = 'md' }: { className?: string; rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full' }) {
  const r = { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', full: 'rounded-full' };
  return <div className={cn('relative overflow-hidden bg-muted', r[rounded], className)}><div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-background/60 to-transparent" /></div>;
}
