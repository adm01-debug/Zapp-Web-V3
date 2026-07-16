import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MessageSquarePlus, Users, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface FABAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

interface MobileFABProps {
  onNewConversation?: () => void;
  onNewContact?: () => void;
  onNewCampaign?: () => void;
  className?: string;
}

export function MobileFAB({
  onNewConversation,
  onNewContact,
  onNewCampaign,
  className,
}: MobileFABProps) {
  const [isOpen, setIsOpen] = useState(false);

  const actions: FABAction[] = [
    ...(onNewConversation
      ? [
          {
            id: 'conversation',
            icon: <MessageSquarePlus className="h-5 w-5" />,
            label: 'Nova conversa',
            onClick: () => {
              onNewConversation();
              setIsOpen(false);
            },
          },
        ]
      : []),
    ...(onNewContact
      ? [
          {
            id: 'contact',
            icon: <Users className="h-5 w-5" />,
            label: 'Novo contato',
            onClick: () => {
              onNewContact();
              setIsOpen(false);
            },
          },
        ]
      : []),
    ...(onNewCampaign
      ? [
          {
            id: 'campaign',
            icon: <Megaphone className="h-5 w-5" />,
            label: 'Nova campanha',
            onClick: () => {
              onNewCampaign();
              setIsOpen(false);
            },
          },
        ]
      : []),
  ];

  return (
    <div className={cn('fixed bottom-[76px] right-4 z-40', className)}>
      {/* Action items */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-background/60"
              onClick={() => setIsOpen(false)}
            />

            <div className="absolute bottom-14 right-0 z-40 mb-2 flex flex-col-reverse items-end gap-3">
              {actions.map((action, i) => (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, y: 16, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.9 }}
                  transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 25 }}
                  className="flex items-center gap-2"
                >
                  <span className="whitespace-nowrap rounded-lg border border-border/40 bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-md">
                    {action.label}
                  </span>
                  <button
                    type="button"
                    onClick={action.onClick}
                    className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-border/40 bg-card text-foreground shadow-lg transition-transform hover:bg-accent active:scale-95"
                  >
                    {action.icon}
                  </button>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Main FAB with contextual icon */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          if (navigator.vibrate) navigator.vibrate(5);
          setIsOpen(!isOpen);
        }}
        className="relative z-40 flex h-14 touch-manipulation items-center justify-center gap-2 rounded-full px-5 text-primary-foreground shadow-xl"
        style={{ background: 'var(--gradient-primary)' }}
        aria-label="Ações rápidas"
      >
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          {isOpen ? <Plus className="h-6 w-6" /> : <MessageSquarePlus className="h-5 w-5" />}
        </motion.div>
        <AnimatePresence>
          {!isOpen && (
            <motion.span
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="overflow-hidden whitespace-nowrap text-sm font-semibold"
            >
              Novo
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
