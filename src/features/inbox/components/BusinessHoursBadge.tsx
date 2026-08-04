import { cn } from '@/lib/utils';
import { Clock, Sun } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBusinessHoursCheck } from '@/hooks/useBusinessHoursManagement';

interface BusinessHoursBadgeProps {
  connectionId: string | null | undefined;
  className?: string;
}

/** Business Hours Badge component. */
export function BusinessHoursBadge({ connectionId, className }: BusinessHoursBadgeProps) {
  const { data: isOpen, isError, isLoading } = useBusinessHoursCheck(connectionId);

  // Estado indeterminado (RPC falhou / ainda carregando): não exibe "Aberto" nem
  // "Fechado" — neutro. O erro do RPC não é mais engolido (a query fica em isError
  // e é logada), então a quebra do is_within_business_hours fica rastreável.
  if (isError || isLoading || isOpen === null || isOpen === undefined) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border',
          isOpen
            ? 'bg-success/10 text-success border-success/30'
            : 'bg-muted/40 text-muted-foreground border-border/50',
          className,
        )}>
          {isOpen ? <Sun className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {isOpen ? 'Aberto' : 'Fechado'}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {isOpen ? 'Dentro do horário comercial' : 'Fora do horário comercial'}
      </TooltipContent>
    </Tooltip>
  );
}
