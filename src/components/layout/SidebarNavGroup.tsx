import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SidebarNavItem, type NavItemConfig } from './SidebarNavItem';

interface BadgeInfo {
  count: number;
  variant?: 'destructive' | 'warning' | 'info';
  title?: string;
}

interface SidebarNavGroupProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: readonly NavItemConfig[];
  currentView: string;
  onViewChange: (v: string) => void;
  defaultOpen?: boolean;
  collapsed?: boolean;
  onToggleFavorite?: (id: string) => void;
  isFavorite?: (id: string) => boolean;
  badgeMap?: Record<string, BadgeInfo | undefined>;
}

/** Sidebar Nav Group component for the layout section. */
export const SidebarNavGroup = React.memo(function SidebarNavGroup({
  label,
  icon: GroupIcon,
  items,
  currentView,
  onViewChange,
  defaultOpen = false,
  collapsed = true,
  onToggleFavorite,
  isFavorite,
  badgeMap,
}: SidebarNavGroupProps) {
  const hasActiveItem = items.some((item) => item.id === currentView);
  const [isOpen, setIsOpen] = useState(defaultOpen || hasActiveItem);

  useEffect(() => {
    if (hasActiveItem && !isOpen) setIsOpen(true);
  }, [hasActiveItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerButton = (
    <button
      type="button"
      onClick={() => setIsOpen((prev) => !prev)}
      className={cn(
        'group/trigger flex items-center rounded-xl outline-none transition-all duration-500 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        collapsed
          ? 'h-[38px] w-full justify-center gap-1'
          : 'h-[38px] w-full gap-2 px-3 hover:bg-muted/15',
        hasActiveItem ? 'font-black text-primary' : 'text-muted-foreground/80 hover:text-foreground'
      )}
      aria-expanded={isOpen}
      aria-label={`${label} — ${isOpen ? 'recolher' : 'expandir'}`}
    >
      <GroupIcon
        className={cn(
          collapsed ? 'h-[11px] w-[11px]' : 'h-[13px] w-[13px]',
          'shrink-0 transition-colors duration-200'
        )}
      />
      {!collapsed && (
        <span className="select-none truncate text-[10px] font-semibold uppercase tracking-[0.08em]">
          {label}
        </span>
      )}
      <ChevronRight
        className={cn(
          'shrink-0 transition-transform duration-250 ease-out',
          collapsed
            ? 'h-[8px] w-[8px]'
            : 'ml-auto h-[11px] w-[11px] opacity-60 group-hover/trigger:opacity-100',
          isOpen && 'rotate-90'
        )}
      />
    </button>
  );

  return (
    <div className="mt-0.5 flex w-full flex-col border-t border-border/40 pt-1.5 first:mt-0 first:border-t-0 first:pt-0">
      {collapsed ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="text-xs font-semibold">
            {label}
          </TooltipContent>
        </Tooltip>
      ) : (
        triggerButton
      )}

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={cn('flex w-full flex-col overflow-hidden', collapsed && 'items-center')}
            aria-label={label}
          >
            <ul
              role="list"
              className={cn(
                'm-0 flex w-full list-none flex-col gap-0.5 p-0 pt-0.5',
                collapsed && 'items-center px-[11px]',
                !collapsed && 'px-2'
              )}
            >
              {items.map((item) => {
                const b = badgeMap?.[item.id];
                return (
                  <li key={item.id}>
                    <SidebarNavItem
                      item={item}
                      currentView={currentView}
                      onViewChange={onViewChange}
                      collapsed={collapsed}
                      onToggleFavorite={onToggleFavorite}
                      isFavorite={isFavorite?.(item.id)}
                      badge={b?.count}
                      badgeVariant={b?.variant}
                      badgeTitle={b?.title}
                    />
                  </li>
                );
              })}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
});
