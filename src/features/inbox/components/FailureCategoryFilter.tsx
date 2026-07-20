/**
 * Dropdown compacto para escolher a categoria de falha exibida quando o
 * filtro "apenas com retry/falha" está ativo no sidebar do inbox.
 *
 * Implementação nativa (button + painel absoluto) — substitui o uso anterior
 * de Radix Select para evitar o loop "Maximum update depth exceeded" causado
 * pela cascata SelectTrigger -> PopperAnchor -> composeRefs no sidebar.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ShieldAlert, AlertOctagon, ServerCrash, WifiOff, HelpCircle, Filter, ChevronDown } from 'lucide-react';
import type { FailureCategory } from '@/features/inbox';

interface Option {
  value: FailureCategory | 'all';
  label: string;
  Icon: typeof Filter;
  iconClass: string;
}

const OPTIONS: Option[] = [
  { value: 'all', label: 'Todas as falhas', Icon: Filter, iconClass: 'text-muted-foreground' },
  { value: 'auth', label: 'Auth (401/403)', Icon: ShieldAlert, iconClass: 'text-warning' },
  { value: 'http_4xx', label: 'HTTP 4xx', Icon: AlertOctagon, iconClass: 'text-warning' },
  { value: 'http_5xx', label: 'HTTP 5xx', Icon: ServerCrash, iconClass: 'text-destructive' },
  { value: 'network', label: 'Timeout / rede', Icon: WifiOff, iconClass: 'text-info' },
  { value: 'unknown', label: 'Outras', Icon: HelpCircle, iconClass: 'text-muted-foreground' },
];

interface Props {
  value: FailureCategory | 'all';
  onChange: (value: FailureCategory | 'all') => void;
  counts: Record<FailureCategory | 'all', number>;
}

/** Failure Category Filter constant. */
export const FailureCategoryFilter = memo(function FailureCategoryFilter({ value, onChange, counts }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  const ActiveIcon = active.Icon;

  const handleSelect = useCallback((next: FailureCategory | 'all') => {
    setOpen(false);
    onChange(next);
  }, [onChange]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filtrar por categoria de falha"
        className={cn(
          'flex items-center justify-between h-7 text-[11px] bg-destructive/10 border border-destructive/30',
          'rounded-md focus:outline-none focus:ring-1 focus:ring-destructive/40 px-2 gap-1 w-[110px]',
        )}
      >
        <span className="flex items-center gap-1 truncate">
          <ActiveIcon className={cn('w-3 h-3 shrink-0', active.iconClass)} />
          <span className="truncate">{active.label}</span>
        </span>
        <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Categorias de falha"
          className={cn(
            'absolute z-50 mt-1 right-0 min-w-[200px] max-h-[320px] overflow-y-auto',
            'rounded-md border bg-popover text-popover-foreground shadow-md p-1',
          )}
        >
          {OPTIONS.map((opt) => {
            const Icon = opt.Icon;
            const count = counts[opt.value] ?? 0;
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-[11px]',
                  'hover:bg-accent hover:text-accent-foreground focus:outline-none focus:bg-accent',
                  selected && 'bg-accent/60',
                )}
              >
                <Icon className={cn('w-3.5 h-3.5 shrink-0', opt.iconClass)} />
                <span className="flex-1 truncate">{opt.label}</span>
                {count > 0 && (
                  <span className="ml-auto text-[9px] text-muted-foreground font-medium tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
