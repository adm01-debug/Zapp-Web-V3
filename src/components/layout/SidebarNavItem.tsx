import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';
import { useUserRole } from '@/features/auth';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePrefetchOnHover } from '@/hooks/usePrefetchOnHover';

/** Nav Required Role type alias. */
export type NavRequiredRole = 'dev' | 'admin' | 'supervisor' | 'agent';

/** Nav Item Config interface definition. */
export interface NavItemConfig {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  badge?: number;
  /** Optional role gate — item is hidden from users without one of these roles. */
  requiredRoles?: NavRequiredRole[];
}

const SHORTCUT_MAP: Record<string, string> = {
  inbox: '⌘1',
  dashboard: '⌘2',
};

interface SidebarNavItemProps {
  item: NavItemConfig;
  currentView: string;
  onViewChange: (v: string) => void;
  badge?: number;
  badgeVariant?: 'destructive' | 'warning' | 'info';
  badgeTitle?: string;
  collapsed?: boolean;
  onToggleFavorite?: (id: string) => void;
  isFavorite?: boolean;
}

/** Sidebar Nav Item constant. */
export const SidebarNavItem = React.memo(function SidebarNavItem({ item, currentView, onViewChange, badge, badgeVariant = 'destructive', badgeTitle, collapsed = true, onToggleFavorite, isFavorite }: SidebarNavItemProps) {
  const { hasRole } = useUserRole();
  const { prefetch } = usePrefetchOnHover();
  
  const hasAccess = !item.requiredRoles || item.requiredRoles.some(role => hasRole(role));

  const Icon = item.icon;
  const isActive = currentView === item.id;
  const shortcut = item.shortcut || SHORTCUT_MAP[item.id];
  const badgeCount = badge ?? item.badge;

  const handleMouseEnter = useCallback(() => {
    if (!isActive) prefetch(item.id);
  }, [isActive, item.id, prefetch]);

  if (!hasAccess) {
    return null;
  }

  const button = (
    <button type="button"
      data-tour={item.id}
      onClick={() => onViewChange(item.id)}
      onMouseEnter={handleMouseEnter}
      aria-label={badgeCount ? `${item.label} (${badgeTitle ?? `${badgeCount} não lidas`})` : item.label}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative rounded-2xl flex items-center gap-3 transition-all duration-500 ease-out group/item outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        collapsed ? 'w-[44px] h-[44px] justify-center' : 'w-full h-[44px] px-3.5 rounded-2xl',
        isActive
          ? 'text-primary font-black shadow-md shadow-primary/5'
          : 'text-sidebar-foreground/70 hover:bg-muted/20 hover:text-foreground active:scale-[0.96]'
      )}
    >
      {isActive && (
        <>
          <div
            className={cn(
            'absolute inset-0 bg-primary/10 transition-all duration-500 ease-out',
            collapsed ? 'rounded-2xl' : 'rounded-2xl'
          )}
          />
          {/* Active indicator bar — highly visible in collapsed mode */}
          <div className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 w-[4px] rounded-r-full bg-primary transition-all duration-300',
            collapsed ? 'h-6 -left-[12px]' : 'h-5 -left-[8px]'
          )} />
        </>
      )}
      <Icon className={cn(
        'w-[18px] h-[18px] relative z-10 shrink-0 transition-transform duration-150',
        !isActive && 'group-hover/item:scale-110'
      )} />
      {!collapsed && (
        <span className="relative z-10 text-[13px] font-medium truncate">{item.label}</span>
      )}
      {/*
       * IMPORTANTE: Não usar <button type="button"> aqui dentro — HTML proíbe elemento
       * interativo dentro de outro elemento interativo (button > button).
       * Isso causava o warning:
       *   "Warning: <button type="button"> cannot appear as a descendant of <button type="button">"
       * e quebrava acessibilidade de teclado. Usamos <div role="button">
       * com tabIndex e onKeyDown para manter semântica ARIA válida.
       */}
      {!collapsed && onToggleFavorite && (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(item.id);
            }
          }}
          className={cn(
            'relative z-20 ml-auto w-5 h-5 rounded flex items-center justify-center transition-all opacity-0 group-hover/item:opacity-100 cursor-pointer',
            isFavorite ? 'opacity-100 text-warning' : 'text-muted-foreground hover:text-warning'
          )}
          aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        >
          <Star className={cn('w-3 h-3', isFavorite && 'fill-warning')} />
        </div>
      )}
      {badgeCount != null && badgeCount > 0 && (
        <span
          title={badgeTitle}
          className={cn(
            'z-20 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none shadow-none animate-scale-in',
            badgeVariant === 'warning' && 'bg-warning text-warning-foreground',
            badgeVariant === 'info' && 'bg-info text-info-foreground',
            badgeVariant === 'destructive' && 'bg-destructive text-destructive-foreground',
            collapsed ? 'absolute -top-0.5 -right-0.5' : 'relative',
            !collapsed && !onToggleFavorite && 'ml-auto'
          )}
        >
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="bg-popover border-border text-xs font-medium flex items-center gap-2">
          <span>{item.label}</span>
          {shortcut && (
            <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]  text-muted-foreground">
              {shortcut}
            </kbd>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
});
