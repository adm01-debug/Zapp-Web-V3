import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type ThemeDebugInfo = {
  presetId: string;
  presetName: string;
  hasPresetFont: boolean;
  fontOrigin: string;
  activeFont: string;
  mode: string;
};

export function ThemeDebugTooltip() {
  const debug = (window as Window & { __THEME_DEBUG__?: ThemeDebugInfo }).__THEME_DEBUG__;

  if (!debug) return null;

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex animate-pulse cursor-help items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] text-primary">
            <Info className="h-3 w-3" />
            DEBUG: {debug.presetName}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="w-64 space-y-2 p-3 text-[10px]">
          <div className="flex justify-between border-b border-border/10 pb-1">
            <span className="text-muted-foreground">Preset:</span>
            <span className="text-foreground">{debug.presetId}</span>
          </div>
          <div className="flex justify-between border-b border-border/10 pb-1">
            <span className="text-muted-foreground">Modo:</span>
            <span className="uppercase text-foreground">{debug.mode}</span>
          </div>
          <div className="flex justify-between border-b border-border/10 pb-1">
            <span className="text-muted-foreground">Origem Fonte:</span>
            <span
              className={
                debug.hasPresetFont ? 'text-warning-foreground' : 'text-success-foreground'
              }
            >
              {debug.fontOrigin}
            </span>
          </div>
          <div className="pt-1">
            <span className="mb-1 block text-muted-foreground">Fonte Ativa:</span>
            <span className="break-all text-[9px] leading-tight text-foreground/80">
              {debug.activeFont}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
