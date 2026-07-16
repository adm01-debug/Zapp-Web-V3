import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X } from 'lucide-react';

export interface InAppNotificationData {
  id: string;
  title: string;
  body: string;
  avatar?: string;
  onClick?: () => void;
}

interface InAppNotificationProps {
  notification: InAppNotificationData | null;
  duration?: number;
  onDismiss: () => void;
}

export function InAppNotification({
  notification,
  duration = 4000,
  onDismiss,
}: InAppNotificationProps) {
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [notification, duration, onDismiss]);

  const initials =
    notification?.title
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2) || '?';

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ y: -80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -80, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          drag="y"
          dragConstraints={{ top: -100, bottom: 0 }}
          onDragEnd={(_, info) => {
            if (info.offset.y < -30) onDismiss();
          }}
          className="safe-area-top fixed left-2 right-2 top-2 z-[100] cursor-pointer"
          onClick={() => {
            notification.onClick?.();
            onDismiss();
          }}
        >
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border/40 bg-card/95 p-3 shadow-2xl backdrop-blur-xl">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={notification.avatar} alt={notification.title} />
              <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{notification.title}</p>
              <p className="truncate text-xs text-muted-foreground">{notification.body}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="shrink-0 touch-manipulation rounded-full p-1 transition-transform hover:bg-muted active:scale-95"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
