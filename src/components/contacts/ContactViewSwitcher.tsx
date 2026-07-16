import { LayoutGrid, List, Table2, Settings2, MapPin, BarChart3, GitGraph } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type ContactViewMode = 'grid' | 'list' | 'table' | 'map' | 'kanban' | 'analytics';

interface ContactViewSwitcherProps {
  viewMode: ContactViewMode;
  onViewModeChange: (mode: ContactViewMode) => void;
  gridColumns: number;
  onGridColumnsChange: (cols: number) => void;
}

const VIEW_MODES = [
  { value: 'grid' as const, label: 'Grid', icon: LayoutGrid },
  { value: 'list' as const, label: 'Lista', icon: List },
  { value: 'table' as const, label: 'Tabela', icon: Table2 },
  { value: 'map' as const, label: 'Mapa', icon: MapPin },
  { value: 'kanban' as const, label: 'Pipeline', icon: GitGraph },
  { value: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
];

const GRID_COLUMN_OPTIONS = [3, 4, 5, 6];

export function ContactViewSwitcher({
  viewMode,
  onViewModeChange,
  gridColumns,
  onGridColumnsChange,
}: ContactViewSwitcherProps) {
  return (
    <div className="flex items-center gap-1.5">
      {/* View mode toggles */}
      <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
        {VIEW_MODES.map(({ value, label, icon: Icon }) => (
          <button
            type="button"
            key={value}
            onClick={() => onViewModeChange(value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150',
              viewMode === value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Grid columns selector (only in grid mode) */}
      {viewMode === 'grid' && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Settings2 className="h-3.5 w-3.5" />
              Colunas
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuLabel className="text-xs">Colunas</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {GRID_COLUMN_OPTIONS.map((cols) => (
              <DropdownMenuItem
                key={cols}
                onClick={() => onGridColumnsChange(cols)}
                className={cn(gridColumns === cols && 'bg-primary/10 text-primary')}
              >
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: cols }).map((_, i) => (
                      <div key={i} className="h-3 w-2 rounded-[1px] bg-current opacity-60" />
                    ))}
                  </div>
                  <span>{cols} colunas</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
