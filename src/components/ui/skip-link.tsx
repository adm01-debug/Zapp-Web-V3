import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, forwardRef } from 'react';
import { ArrowRight, Navigation, Search, MessageSquare, LayoutDashboard } from 'lucide-react';

interface SkipLinkProps {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const SkipLink = forwardRef<HTMLAnchorElement, SkipLinkProps>(function SkipLink(
  { href, children, icon, className },
  ref
) {
  const [isFocused, setIsFocused] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.querySelector(href) as HTMLElement | null;
    if (target) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.scrollIntoView({ behavior: 'smooth' });
      target.focus?.();
    }
  };

  return (
    <a
      ref={ref}
      href={href}
      onClick={handleClick}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={cn(
        'sr-only focus:not-sr-only',
        'focus:fixed focus:left-4 focus:top-4 focus:z-[9999]',
        'focus:flex focus:items-center focus:gap-2',
        'focus:rounded-xl focus:px-4 focus:py-3',
        'focus:bg-primary focus:text-primary-foreground',
        'focus:text-sm focus:font-semibold',
        'focus:shadow-2xl focus:shadow-primary/30',
        'focus:ring-4 focus:ring-primary/20 focus:ring-offset-2 focus:ring-offset-background',
        'focus:outline-none',
        'focus:animate-scale-in',
        'transition-all duration-300 ease-out',
        className
      )}
      data-focused={isFocused ? 'true' : 'false'}
    >
      {icon && <span className="text-primary-foreground/80">{icon}</span>}
      <span>{children}</span>
      <ArrowRight className="ml-1 h-4 w-4 animate-pulse" />
    </a>
  );
});

// Enhanced skip links container with multiple navigation options
export function SkipLinks() {
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        setShowIndicator(true);
        setTimeout(() => setShowIndicator(false), 3000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <nav className="skip-links-container" aria-label="Links de navegação rápida">
      <AnimatePresence>
        {showIndicator && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed left-4 top-20 z-[9998] rounded-lg border border-border bg-muted/95 px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur-sm"
          >
            Pressione{' '}
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5">Tab</kbd> para
            navegar
          </motion.div>
        )}
      </AnimatePresence>

      <SkipLink href="#main-content" icon={<LayoutDashboard className="h-4 w-4" />}>
        Pular para conteúdo principal
      </SkipLink>

      <SkipLink href="#main-navigation" icon={<Navigation className="h-4 w-4" />}>
        Pular para navegação
      </SkipLink>

      <SkipLink href="#inbox-section" icon={<MessageSquare className="h-4 w-4" />}>
        Pular para conversas
      </SkipLink>

      <SkipLink href="#search-input" icon={<Search className="h-4 w-4" />}>
        Pular para busca
      </SkipLink>
    </nav>
  );
}
