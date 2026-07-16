import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronDown } from 'lucide-react';
import { CATEGORY_LABELS, ALL_CATEGORIES } from './audioMemeConstants';

interface AudioMemeCategorySelectorProps {
  value: string;
  onChange: (cat: string) => void;
  size?: 'sm' | 'xs';
}

export function AudioMemeCategorySelector({
  value,
  onChange,
  size = 'sm',
}: AudioMemeCategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const info = CATEGORY_LABELS[value] || { emoji: '📦', label: value };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button"
          className={cn(
            'flex items-center gap-1 rounded-md border border-border/50 transition-colors hover:bg-muted/60',
            size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <span>{info.emoji}</span>
          <span className="text-muted-foreground">{info.label}</span>
          <ChevronDown
            className={cn(size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3', 'text-muted-foreground/60')}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-[240px] w-[200px] overflow-y-auto p-1.5"
        align="start"
        side="bottom"
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-0.5">
          {ALL_CATEGORIES.map((cat) => {
            const catInfo = CATEGORY_LABELS[cat];
            const isActive = cat === value;
            return (
              <button type="button"
                key={cat}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(cat);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                  isActive
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <span>{catInfo.emoji}</span>
                <span className="flex-1">{catInfo.label}</span>
                {isActive && <Check className="h-3 w-3 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
