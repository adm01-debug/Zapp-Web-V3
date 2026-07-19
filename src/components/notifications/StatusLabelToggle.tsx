/**
 * Toggle "Mostrar texto de status" — alterna a preferência
 * `inbox-status-label-visible` (ver `useInboxStatusPref`).
 *
 * Posicionado no rodapé da Sidebar junto aos outros quick controls.
 */
import { Tag, TagsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useInboxStatusPref } from '@/features/inbox';

/** Status Label Toggle function. */
export function StatusLabelToggle({ className }: { className?: string }) {
  const { showLabel, toggle } = useInboxStatusPref();

  const label = showLabel
    ? 'Ocultar texto de status nas mensagens'
    : 'Mostrar texto de status nas mensagens';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative h-9 w-9 rounded-lg transition-colors',
            showLabel && 'text-primary',
            className,
          )}
          onClick={toggle}
          aria-label={label}
          aria-pressed={showLabel}
        >
          {showLabel ? (
            <>
              <TagsIcon className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            </>
          ) : (
            <Tag className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
