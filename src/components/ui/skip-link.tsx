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

export const SkipLink = forwardRef<HTMLAnchorElement, SkipLinkProps>(function SkipLink({ 
  href, 
  children,
  icon,
  className 
}, ref) {
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
        'focus:fixed focus:top-4 focus:left-4 focus:z-[9999]',
        'focus:flex focus:items-center focus:gap-2',
        'focus:px-4 focus:py-3 focus:rounded-xl',
        'focus:bg-primary focus:text-primary-foreground',
        'focus:font-semibold focus:text-sm',
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
      <ArrowRight className="w-4 h-4 ml-1 animate-pulse" />
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
    <nav 
      className="skip-links-container" 
      aria-label="Links de navegação rápida"
      role="navigation"
    >
      <AnimatePresence>
        {showIndicator && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-4 z-[9998] bg-muted/95 backdrop-blur-sm px-3 py-2 rounded-lg text-xs text-muted-foreground shadow-lg border border-border"
          >
            Pressione <kbd className="px-1.5 py-0.5 bg-background rounded border border-border ">Tab</kbd> para navegar
          </motion.div>
        )}
      </AnimatePresence>

      <SkipLink 
        href="#main-content" 
        icon={<LayoutDashboard className="w-4 h-4" />}
      >
        Pular para conteúdo principal
      </SkipLink>
      
      <SkipLink 
        href="#main-navigation"
        icon={<Navigation className="w-4 h-4" />}
      >
        Pular para navegação
      </SkipLink>
      
      <SkipLink 
        href="#inbox-section"
        icon={<MessageSquare className="w-4 h-4" />}
      >
        Pular para conversas
      </SkipLink>
      
      <SkipLink 
        href="#search-input"
        icon={<Search className="w-4 h-4" />}
      >
        Pular para busca
      </SkipLink>
    </nav>
  );
}
