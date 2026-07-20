import * as React from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { IconButton } from './icon-button';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'left' | 'right';
  className?: string;
}

/** Mobile Drawer component for the ui section. */
export const MobileDrawer = React.forwardRef<HTMLDivElement, MobileDrawerProps>(
  ({ isOpen, onClose, children, side = 'left', className }, _ref) => {
    const dragX = useMotionValue(0);
    const dragThreshold = 100;

    const handleDragEnd = (
      _event: MouseEvent | TouchEvent | PointerEvent,
      info: { offset: { x: number } }
    ) => {
      if (side === 'left' && info.offset.x < -dragThreshold) {
        onClose();
      } else if (side === 'right' && info.offset.x > dragThreshold) {
        onClose();
      }
    };

    React.useEffect(() => {
      if (isOpen) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
      return () => {
        document.body.style.overflow = '';
      };
    }, [isOpen]);

    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: side === 'left' ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: side === 'left' ? '-100%' : '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: side === 'left' ? 0.5 : 0, right: side === 'right' ? 0.5 : 0 }}
              onDragEnd={handleDragEnd}
              style={{ x: dragX }}
              className={cn(
                'fixed top-0 z-[101] h-full w-[85%] max-w-sm',
                'border-r border-border bg-sidebar shadow-xl',
                side === 'left' ? 'left-0' : 'right-0',
                className
              )}
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
            >
              <div
                className="absolute top-1/2 h-16 w-1 -translate-y-1/2 rounded-full bg-muted-foreground/30"
                style={{ [side === 'left' ? 'right' : 'left']: 8 }}
              />
              <div className="absolute right-4 top-4">
                <IconButton aria-label="Fechar menu" variant="ghost" size="sm" onClick={onClose}>
                  <X className="h-5 w-5" />
                </IconButton>
              </div>
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }
);

MobileDrawer.displayName = 'MobileDrawer';

// Bottom Navigation for mobile
interface BottomNavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

interface BottomNavigationProps {
  items: BottomNavItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Bottom Navigation component for the ui section. */
export function BottomNavigation({ items, activeId, onChange, className }: BottomNavigationProps) {
  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-[100]',
        'border-t border-border/10 bg-background/90 backdrop-blur-3xl',
        'safe-area-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.3)]',
        className
      )}
      role="navigation"
      aria-label="Navegação principal"
    >
      <div className="flex h-[64px] items-center justify-around px-2">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button type="button"
              key={item.id}
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(5);
                onChange(item.id);
              }}
              className={cn(
                'flex h-full flex-1 flex-col items-center justify-center gap-1',
                'relative touch-manipulation transition-colors duration-150',
                'active:scale-95 active:transition-transform',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
            >
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute left-1/2 top-0 h-[4px] w-14 -translate-x-1/2 rounded-b-full bg-primary shadow-[0_4px_12px_rgba(var(--primary-rgb),0.5)]"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <div className="relative">
                <motion.div
                  animate={isActive ? { scale: 1.15, y: -2 } : { scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  {item.icon}
                </motion.div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -right-3 -top-1.5 flex h-[18px] min-w-[18px] animate-scale-in items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground shadow-md">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] leading-none transition-all',
                  isActive ? 'font-bold text-primary' : 'font-medium text-muted-foreground'
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// Pull to Refresh
interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

/** Pull To Refresh component for the ui section. */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [isPulling, setIsPulling] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const pullY = useMotionValue(0);
  const pullProgress = useTransform(pullY, [0, 80], [0, 1]);
  // Hook chamado incondicionalmente no topo (rules-of-hooks); usado no JSX abaixo.
  const arrowRotate = useTransform(pullProgress, [0, 1], [0, 180]);

  const handleDragEnd = async () => {
    if (pullY.get() > 80) {
      setIsRefreshing(true);
      await onRefresh();
      setIsRefreshing(false);
    }
    setIsPulling(false);
  };

  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.5, bottom: 0 }}
      onDragStart={() => setIsPulling(true)}
      onDragEnd={handleDragEnd}
      style={{ y: isPulling ? pullY : 0 }}
    >
      <AnimatePresence>
        {(isPulling || isRefreshing) && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="absolute left-1/2 top-0 -translate-x-1/2 p-3"
          >
            {isRefreshing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent"
              />
            ) : (
              <motion.div style={{ rotate: arrowRotate }} className="h-6 w-6">
                ↓
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </motion.div>
  );
}

// Touch Feedback Wrapper
interface TouchFeedbackProps {
  children: React.ReactNode;
  className?: string;
  onPress?: () => void;
}

/** Touch Feedback component for the ui section. */
export function TouchFeedback({ children, className, onPress }: TouchFeedbackProps) {
  return (
    <motion.div
      whileTap={{ scale: 0.97, opacity: 0.8 }}
      transition={{ duration: 0.1 }}
      onClick={onPress}
      className={cn('cursor-pointer touch-manipulation', className)}
    >
      {children}
    </motion.div>
  );
}
