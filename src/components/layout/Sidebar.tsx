import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Search, Moon, Sun, PanelLeftClose, PanelLeftOpen, Star } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/useTheme';
import { useSidebarCollapse, useSidebarFavorites } from '@/hooks/useSidebarState';
import { PushNotificationToggle } from '@/components/notifications/PushNotificationToggle';
import { ScreenProtectionToggle } from '@/components/notifications/ScreenProtectionToggle';
import { StatusLabelToggle } from '@/components/notifications/StatusLabelToggle';
import { SoundMuteToggle } from '@/components/notifications/SoundMuteToggle';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarNavGroup } from './SidebarNavGroup';
import { AgentProfilePopover } from './AgentProfilePopover';
import {
  primaryNav,
  sidebarGroups,
  communicationNav,
  automationNav,
  salesNav,
  connectionsNav,
  analyticsNav,
  systemNav,
  advancedNav,
} from './sidebarNavConfig';
import { useEvoApiAlertsBadge } from '@/lib/evoApiHealth/useEvoApiAlertsBadge';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  currentAgent?: { name: string; avatar?: string; status: 'online' | 'away' | 'offline' };
  onLogout?: () => void;
  inboxBadge?: number;
  onStatusChange?: (status: 'online' | 'away' | 'offline') => void;
}

export const Sidebar = React.memo(function Sidebar({
  currentView,
  onViewChange,
  currentAgent,
  onLogout,
  inboxBadge,
  onStatusChange,
}: SidebarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [statusOpen, setStatusOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapse();
  const { favorites, toggleFavorite, isFavorite } = useSidebarFavorites();
  const evoBadge = useEvoApiAlertsBadge();

  const allNavItems = useMemo(
    () => [
      ...communicationNav,
      ...automationNav,
      ...salesNav,
      ...connectionsNav,
      ...analyticsNav,
      ...systemNav,
      ...advancedNav,
    ],
    []
  );
  const favoriteItems = useMemo(
    () =>
      favorites
        .map((id) => allNavItems.find((item) => item.id === id))
        .filter(Boolean) as typeof allNavItems,
    [favorites, allNavItems]
  );

  // Per-group dynamic badges (currently: Sistema → evo-api-health alerts)
  const groupBadges: Record<
    string,
    Record<string, { count: number; variant?: 'destructive' | 'warning' | 'info'; title?: string }>
  > = {
    Sistema: {
      'evo-api-health': evoBadge.topSeverity
        ? {
            count: evoBadge.total,
            variant:
              evoBadge.topSeverity === 'critical'
                ? 'destructive'
                : evoBadge.topSeverity === 'warning'
                  ? 'warning'
                  : 'info',
            title: `${evoBadge.critical} críticos · ${evoBadge.warning} warnings · ${evoBadge.info} info`,
          }
        : { count: 0 },
    },
  };

  return (
    <aside
      id="main-navigation"
      role="navigation"
      aria-label="Menu de navegação principal"
      className={cn(
        'flex h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar antialiased transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-[68px]' : 'w-[240px]'
      )}
    >
      {/* Logo + Toggle */}
      <div
        className={cn(
          'flex h-[64px] shrink-0 items-center px-4',
          collapsed ? 'justify-center' : 'justify-between'
        )}
      >
        <button
          type="button"
          onClick={() => onViewChange('inbox')}
          className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-2xl bg-primary shadow-sm transition-all duration-300 hover:bg-primary/90 hover:shadow-glow-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="ZAPP — Ir para Inbox"
        >
          <span className="text-lg font-bold tracking-tighter text-primary-foreground">Z</span>
        </button>
        {!collapsed && (
          <span className="ml-2 mr-auto text-sm font-bold tracking-tight text-foreground">
            ZAPP
          </span>
        )}
        {!collapsed && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggle}
                className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label="Recolher menu"
              >
                <PanelLeftClose className="h-[15px] w-[15px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="text-xs">
              Recolher <kbd className="ml-1 rounded bg-muted/20 px-1 py-0.5 text-[10px]">⌘B</kbd>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {collapsed && (
        <div className="my-1 flex justify-center">
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggle}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-border/40 text-muted-foreground transition-all hover:border-border hover:bg-muted/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label="Expandir menu"
              >
                <PanelLeftOpen className="h-[16px] w-[16px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="text-xs">
              Expandir <kbd className="ml-1 rounded bg-muted/20 px-1 py-0.5 text-[10px]">⌘B</kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Status das conexões WhatsApp (compacto) */}
      <div
        className={cn(
          'flex shrink-0',
          collapsed ? 'justify-center px-[11px]' : 'px-3',
          'pb-1.5 pt-1'
        )}
      >
        <ConnectionStatusIndicator collapsed={collapsed} />
      </div>

      {/* Primary Nav */}
      <nav
        className={cn('flex flex-col gap-0.5', collapsed ? 'items-center px-[11px]' : 'px-2')}
        aria-label="Menu principal"
      >
        <ul
          role="list"
          className={cn(
            'm-0 flex w-full list-none flex-col gap-0.5 p-0',
            collapsed && 'items-center'
          )}
        >
          {primaryNav.map((item) => (
            <li key={item.id}>
              <SidebarNavItem
                item={item}
                currentView={currentView}
                onViewChange={onViewChange}
                badge={item.id === 'inbox' ? inboxBadge : undefined}
                collapsed={collapsed}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Search */}
      <div className={cn('my-1.5 flex', collapsed ? 'justify-center px-[11px]' : 'px-2')}>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => document.dispatchEvent(new CustomEvent('open-global-search'))}
              className={cn(
                'flex items-center gap-2 rounded-lg border border-dashed border-border/60 text-muted-foreground transition-all hover:border-border hover:bg-muted/10 hover:text-foreground',
                collapsed ? 'h-[30px] w-[40px] justify-center' : 'h-[32px] w-full px-3'
              )}
              aria-label="Buscar módulo (Ctrl+K)"
            >
              <Search className="h-[14px] w-[14px] shrink-0" />
              {!collapsed && <span className="text-xs text-muted-foreground">Buscar...</span>}
              {!collapsed && (
                <kbd className="ml-auto rounded bg-muted/20 px-1 py-0.5 text-[9px] text-muted-foreground">
                  ⌘K
                </kbd>
              )}
            </button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right" sideOffset={8} className="text-xs">
              Buscar <kbd className="ml-1 rounded bg-muted/20 px-1 py-0.5 text-[10px]">⌘K</kbd>
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      {/* Favorites */}
      {favoriteItems.length > 0 && (
        <>
          <div className={cn('mx-3 h-px bg-border', collapsed ? 'my-1' : 'my-1.5')} />
          {!collapsed && (
            <div className="flex items-center gap-1.5 px-3">
              <Star className="h-[10px] w-[10px] fill-warning text-warning" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Favoritos
              </span>
            </div>
          )}
          <nav
            className={cn('flex flex-col gap-0.5', collapsed ? 'items-center px-[11px]' : 'px-2')}
            aria-label="Favoritos"
          >
            <ul
              role="list"
              className={cn(
                'm-0 flex w-full list-none flex-col gap-0.5 p-0',
                collapsed && 'items-center'
              )}
            >
              {favoriteItems.map((item) => (
                <li key={item.id}>
                  <SidebarNavItem
                    item={item}
                    currentView={currentView}
                    onViewChange={onViewChange}
                    collapsed={collapsed}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}

      <div className={cn('mx-3 h-px bg-border', collapsed ? 'my-1' : 'my-1.5')} />

      {/* Groups */}
      <div className="scrollbar-none flex-1 overflow-y-auto overflow-x-hidden scroll-smooth">
        <div className={cn('flex flex-col gap-1.5 py-1', collapsed ? 'items-center' : 'px-2')}>
          {sidebarGroups.map((group) => (
            <SidebarNavGroup
              key={group.label}
              label={group.label}
              icon={group.icon}
              items={group.items}
              currentView={currentView}
              onViewChange={onViewChange}
              collapsed={collapsed}
              onToggleFavorite={toggleFavorite}
              isFavorite={isFavorite}
              badgeMap={groupBadges[group.label]}
            />
          ))}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex shrink-0 flex-col items-center gap-1.5 pb-3 pt-1.5">
        <div className="mx-3 h-px self-stretch bg-border" />
        {!collapsed && (
          <div className="flex items-center gap-1.5 self-stretch px-3 pb-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Controles rápidos
            </span>
          </div>
        )}
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-2xl border border-border/40 bg-muted/20 px-2 py-2 shadow-sm transition-all duration-300 hover:bg-muted/30',
            collapsed ? 'flex-col' : 'mx-2 flex-row self-stretch'
          )}
        >
          <ScreenProtectionToggle className="h-[36px] w-[36px] touch-manipulation" />
          <PushNotificationToggle className="h-[36px] w-[36px] touch-manipulation" />
          <SoundMuteToggle className="h-[36px] w-[36px] touch-manipulation" />
          <StatusLabelToggle className="h-[36px] w-[36px] touch-manipulation" />
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className={cn(
                  'flex h-[36px] w-[36px] touch-manipulation items-center justify-center rounded-lg text-muted-foreground transition-all duration-300 hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                  isDark && 'bg-primary/5 text-primary'
                )}
                aria-label={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
              >
                {isDark ? (
                  <Sun className="h-[16px] w-[16px]" />
                ) : (
                  <Moon className="h-[16px] w-[16px]" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="text-xs">
              {isDark ? 'Modo claro' : 'Modo escuro'}
            </TooltipContent>
          </Tooltip>
        </div>

        {currentAgent && (
          <AgentProfilePopover
            agent={currentAgent}
            collapsed={collapsed}
            statusOpen={statusOpen}
            onStatusOpenChange={setStatusOpen}
            onStatusChange={onStatusChange}
            onViewChange={onViewChange}
            onLogout={onLogout}
          />
        )}
      </div>
    </aside>
  );
});
