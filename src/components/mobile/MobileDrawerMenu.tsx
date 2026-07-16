import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X, Search, Moon, Sun, LogOut, ChevronRight, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/hooks/useTheme';
import { useUserRole, type AppRole } from '@/features/auth';
import { IconButton } from '@/components/ui/icon-button';
import {
  primaryNav,
  automationNav,
  salesNav,
  connectionsNav,
  analyticsNav,
  systemNav,
  advancedNav,
} from '@/components/layout/sidebarNavConfig';
import type { NavItemConfig } from '@/components/layout/SidebarNavItem';

interface MobileDrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: string;
  onViewChange: (view: string) => void;
  agentName?: string;
  agentAvatar?: string;
  agentStatus?: 'online' | 'away' | 'offline';
  onLogout?: () => void;
}

// Deduplicated list for search and recents
const allItems = (() => {
  const seen = new Set<string>();
  return [
    ...primaryNav,
    ...salesNav,
    ...automationNav,
    ...analyticsNav,
    ...connectionsNav,
    ...systemNav,
    ...advancedNav,
  ].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
})();

const sections = [
  { title: 'Principal', items: primaryNav },
  { title: 'Vendas & CRM', items: salesNav },
  { title: 'Automação & IA', items: automationNav },
  { title: 'Analytics', items: analyticsNav },
  { title: 'Conexões', items: connectionsNav },
  { title: 'Sistema', items: systemNav },
  { title: 'Avançado', items: advancedNav },
];

const RECENTS_KEY = 'mobile-drawer-recents';
const MAX_RECENTS = 5;

function getRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveRecent(id: string) {
  const recents = getRecents().filter((r) => r !== id);
  recents.unshift(id);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
}

const listItemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.02, duration: 0.2, ease: 'easeOut' as const },
  }),
};

export function MobileDrawerMenu({
  isOpen,
  onClose,
  currentView,
  onViewChange,
  agentName,
  agentAvatar,
  agentStatus = 'online',
  onLogout,
}: MobileDrawerMenuProps) {
  const [search, setSearch] = useState('');
  const { resolvedTheme, setTheme } = useTheme();
  const { hasRole } = useUserRole();
  const isDark = resolvedTheme === 'dark';

  const initials =
    agentName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2) || 'U';

  // Hide items the user lacks roles for (defense layer in addition to RPC/RLS guards)
  const canSee = useCallback(
    (item: NavItemConfig) =>
      !item.requiredRoles || item.requiredRoles.some((r) => hasRole(r as AppRole)),
    [hasRole]
  );

  const filteredSections = useMemo(() => {
    const base = sections
      .map((s) => ({ ...s, items: s.items.filter(canSee) }))
      .filter((s) => s.items.length > 0);
    if (!search.trim()) return base;
    return base
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => i.label.toLowerCase().includes(search.toLowerCase())),
      }))
      .filter((s) => s.items.length > 0);
  }, [search, canSee]);

  const recentIds = useMemo(getRecents, [isOpen]);
  const recentItems = useMemo(
    () =>
      (
        recentIds.map((id) => allItems.find((i) => i.id === id)).filter(Boolean) as typeof allItems
      ).filter(canSee),
    [recentIds, canSee]
  );

  const handleNav = (id: string) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(5);
    saveRecent(id);
    onViewChange(id);
    onClose();
    setSearch('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-background/60 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            drag="x"
            dragConstraints={{ left: -320, right: 0 }}
            dragElastic={0.08}
            onDragEnd={(_e, info) => {
              if (info.offset.x < -60 || info.velocity.x < -300) {
                onClose();
              }
            }}
            className="safe-area-top fixed left-0 top-0 z-[101] flex h-full w-[80%] max-w-[300px] flex-col border-r border-border/40 bg-card shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                    <AvatarImage src={agentAvatar} alt={agentName} />
                    <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
                      agentStatus === 'online' && 'bg-[hsl(var(--online,142_71%_45%))]',
                      agentStatus === 'away' && 'bg-[hsl(var(--away,38_92%_50%))]',
                      agentStatus === 'offline' && 'bg-muted-foreground/50'
                    )}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight text-foreground">
                    {agentName || 'Usuário'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {agentStatus === 'online'
                      ? '● Online'
                      : agentStatus === 'away'
                        ? '● Ausente'
                        : '● Offline'}
                  </p>
                </div>
              </div>
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="Fechar menu"
                className="rounded-xl"
              >
                <X className="h-5 w-5" />
              </IconButton>
            </div>

            {/* Search */}
            <div className="px-4 pb-2 pt-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar seção..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 rounded-xl border-0 bg-muted/50 pl-9 text-sm"
                />
              </div>
            </div>

            {/* Navigation */}
            <div className="scroll-fade-y flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
              {/* Recentes */}
              {!search.trim() && recentItems.length > 0 && (
                <div className="mb-2">
                  <p className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    <Clock className="h-3 w-3" /> Recentes
                  </p>
                  {recentItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;
                    return (
                      <button
                        type="button"
                        key={`recent-${item.id}`}
                        onClick={() => handleNav(item.id)}
                        className={cn(
                          'flex w-full touch-manipulation items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                          'active:scale-[0.98]',
                          isActive
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-foreground/80 active:bg-muted/80'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-[18px] w-[18px] shrink-0',
                            isActive ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                        <span className="flex-1 truncate text-left">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {filteredSections.map((section, sectionIdx) => (
                <div key={section.title} className="mb-2">
                  <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {section.title}
                  </p>
                  {section.items.map((item, itemIdx) => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;
                    const globalIdx = sectionIdx * 10 + itemIdx;
                    return (
                      <motion.button
                        key={item.id}
                        custom={globalIdx}
                        variants={listItemVariants}
                        initial="hidden"
                        animate="visible"
                        onClick={() => handleNav(item.id)}
                        className={cn(
                          'flex w-full touch-manipulation items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                          'active:scale-[0.98] active:transition-transform',
                          isActive
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-foreground/80 active:bg-muted/80'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-[18px] w-[18px] shrink-0',
                            isActive ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                        <span className="flex-1 truncate text-left">{item.label}</span>
                        {isActive && <ChevronRight className="h-4 w-4 shrink-0 text-primary/50" />}
                      </motion.button>
                    );
                  })}
                </div>
              ))}

              {filteredSections.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum resultado encontrado</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="safe-area-bottom flex shrink-0 items-center gap-2 border-t border-border px-3 py-2.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="h-10 flex-1 touch-manipulation gap-2 rounded-xl text-sm active:scale-[0.98]"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {isDark ? 'Claro' : 'Escuro'}
              </Button>
              {onLogout && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogout}
                  className="h-10 touch-manipulation rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive active:scale-[0.98]"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
