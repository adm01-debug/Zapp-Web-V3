import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
  userName?: string;
}

export const WelcomeModal = forwardRef<HTMLDivElement, WelcomeModalProps>(function WelcomeModal(
  { isOpen, onClose, onStartTour, userName },
  _ref
) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="relative mx-4 w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        >
          {/* Background decoration */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-24 -top-24 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-secondary/20 blur-3xl" />
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-full p-2 transition-colors hover:bg-muted"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>

          {/* Content */}
          <div className="relative p-8 text-center">
            {/* Animated icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-lg"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Rocket className="h-10 w-10 text-primary-foreground" />
              </motion.div>
            </motion.div>

            {/* Welcome text */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="mb-2 font-display text-2xl font-bold text-foreground">
                Bem-vindo{userName ? `, ${userName.split(' ')[0]}` : ''}! 🎉
              </h2>
              <p className="mb-6 leading-relaxed text-muted-foreground">
                Estamos felizes em ter você aqui! Quer fazer um tour rápido para conhecer todas as
                funcionalidades da plataforma?
              </p>
            </motion.div>

            {/* Features preview */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-8 grid grid-cols-3 gap-3"
            >
              {[
                { icon: '💬', label: 'Chat em tempo real' },
                { icon: '📊', label: 'Dashboard de metas' },
                { icon: '🔔', label: 'Alertas inteligentes' },
              ].map((feature, index) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  className="rounded-xl bg-muted/50 p-3"
                >
                  <span className="mb-1 block text-2xl">{feature.icon}</span>
                  <span className="text-xs text-muted-foreground">{feature.label}</span>
                </motion.div>
              ))}
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Pular tour
              </Button>
              <Button className="flex-1 gap-2" onClick={onStartTour}>
                <Play className="h-4 w-4" />
                Iniciar Tour Guiado
              </Button>
            </motion.div>

            {/* Skip hint */}
            <p className="mt-4 text-xs text-muted-foreground">
              Você pode acessar o tour novamente nas configurações
            </p>
          </div>

          {/* Floating particles */}
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-2 w-2 rounded-full bg-primary/30"
              style={{
                left: `${20 + i * 15}%`,
                top: `${10 + i * 10}%`,
              }}
              animate={{
                y: [0, -20, 0],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 3 + i * 0.5,
                repeat: Infinity,
                delay: i * 0.3,
              }}
            />
          ))}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});
