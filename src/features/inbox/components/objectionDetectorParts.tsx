import { memo, forwardRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ShieldQuestion,
  Lightbulb,
  Loader2,
  RefreshCw,
  Check,
  Copy,
  Send,
  ChevronUp,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

/** Objection component. */
export interface Objection {
  id: string;
  objection: string;
  counterArgument: string;
  confidence: number;
}

/* ─── Confidence Badge ─── */
/** Displays a percentage confidence badge for a detected objection. */
export const ConfidenceBadge = memo(function ConfidenceBadge({
  confidence,
}: {
  confidence: number;
}) {
  const pct = Math.round(confidence * 100);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
      <Zap className="h-2.5 w-2.5" />
      {pct}%
    </span>
  );
});

/* ─── Action Bar ─── */
/** Toolbar with copy, rewrite, and use-response actions for a counter-argument. */
export const ActionBar = memo(function ActionBar({
  text,
  idx,
  copiedIdx,
  isRewriting,
  rewritingAny,
  onCopy,
  onRewrite,
  onSelect,
}: {
  text: string;
  idx: number;
  copiedIdx: number | null;
  isRewriting: boolean;
  rewritingAny: boolean;
  onCopy: (text: string, idx: number) => void;
  onRewrite: (idx: number) => void;
  onSelect: (text: string) => void;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              onClick={() => onCopy(text, idx)}
              disabled={rewritingAny}
              aria-label={copiedIdx === idx ? 'Copiado' : 'Copiar texto'}
            >
              {copiedIdx === idx ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            {copiedIdx === idx ? 'Copiado!' : 'Copiar'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              onClick={() => onRewrite(idx)}
              disabled={rewritingAny}
              aria-label="Reescrever texto"
            >
              <RefreshCw className={cn('h-4 w-4', isRewriting && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            Reescrever
          </TooltipContent>
        </Tooltip>
      </div>
      <Button
        size="sm"
        className="h-9 gap-2 rounded-full bg-primary px-5 text-[12px] font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
        onClick={() => onSelect(text)}
        disabled={rewritingAny}
      >
        <Send className="h-3.5 w-3.5" />
        Usar resposta
      </Button>
    </div>
  );
});

/* ─── Objection Card ─── */
/** Expandable card displaying a detected objection and its AI-generated counter-argument. */
export const ObjectionCard = memo(
  forwardRef<
    HTMLDivElement,
    {
      obj: Objection;
      idx: number;
      isRewriting: boolean;
      rewritingAny: boolean;
      copiedIdx: number | null;
      onSelect: (text: string) => void;
      onCopy: (text: string, idx: number) => void;
      onRewrite: (idx: number) => void;
    }
  >(function ObjectionCard(
    { obj, idx, isRewriting, rewritingAny, copiedIdx, onSelect, onCopy, onRewrite },
    ref
  ) {
    const [expanded, setExpanded] = useState(true);
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ delay: idx * 0.06, type: 'spring', stiffness: 400, damping: 30 }}
        className="bg-muted/8 overflow-hidden rounded-2xl border border-border/30"
      >
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-full items-start gap-3 p-4 text-left"
          aria-expanded={expanded}
        >
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <ShieldQuestion className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="pr-4 text-[13px] font-medium leading-snug text-foreground">
              {obj.objection}
            </p>
            <ConfidenceBadge confidence={obj.confidence} />
          </div>
          <div className="mt-1 shrink-0 text-muted-foreground/60">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4">
                <div className="rounded-xl border border-border/20 bg-muted/15 p-4">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Lightbulb className="h-3 w-3 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {isRewriting ? (
                        <div className="flex items-center gap-2 py-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          <span className="text-xs text-muted-foreground">Reescrevendo...</span>
                        </div>
                      ) : (
                        <p className="text-[12.5px] leading-relaxed text-foreground/90">
                          {obj.counterArgument}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <ActionBar
                  text={obj.counterArgument}
                  idx={idx}
                  copiedIdx={copiedIdx}
                  isRewriting={isRewriting}
                  rewritingAny={rewritingAny}
                  onCopy={onCopy}
                  onRewrite={onRewrite}
                  onSelect={onSelect}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  })
);

/* ─── Shimmer ─── */
/** Animated shimmer placeholder shown while objection data is loading. */
export function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-muted/20', className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-muted/30 to-transparent" />
    </div>
  );
}
