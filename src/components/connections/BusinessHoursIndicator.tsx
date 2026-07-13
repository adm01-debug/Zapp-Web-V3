import { cn } from '@/lib/utils';
import { useBusinessHours, BusinessHour } from '@/hooks/useBusinessHoursManagement';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BusinessHoursIndicatorProps {
  connectionId: string;
  className?: string;
}

export function BusinessHoursIndicator({ connectionId, className }: BusinessHoursIndicatorProps) {
  const { businessHours, isLoading } = useBusinessHours(connectionId);

  if (isLoading || !businessHours.length) return null;

  const getDayStatus = (day: number) => {
    const dayConfig = businessHours.find((h: BusinessHour) => h.day_of_week === day);
    if (!dayConfig) return { status: 'disabled', label: 'Fechado' };
    
    const isEnabled = dayConfig.is_enabled;
    if (!isEnabled) return { status: 'closed', label: 'Fechado' };

    return { 
      status: 'open', 
      label: `${dayConfig.start_time} - ${dayConfig.end_time}` 
    };
  };

  const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-1", className)}>
        {days.map((day, i) => {
          const { status, label } = getDayStatus(i);
          return (
            <Tooltip key={`${day}-${i}`}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold border",
                    status === 'open' ? "bg-whatsapp/10 border-whatsapp text-whatsapp" :
                    status === 'closed' ? "bg-muted border-border text-muted-foreground" :
                    "bg-muted/50 border-dashed border-border text-muted-foreground/50"
                  )}
                >
                  {day}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
