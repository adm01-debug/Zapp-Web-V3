import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, RefreshCw, AlertTriangle, Check, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToneSelector } from './ai-tools/ToneSelector';
import { PeriodFilterSelector } from './ai-tools/PeriodFilterSelector';
import { useObjectionDetector } from '@/hooks/useObjectionDetector';
import type { ChatMessage } from '../types/aiChatMessage';
import { ObjectionCard, ShimmerBlock } from './objectionDetectorParts';

interface ObjectionDetectorProps {
  contactId: string;
  contactName?: string;
  lastMessages: string[];
  allMessages?: ChatMessage[];
  onSelectSuggestion?: (text: string) => void;
}

/* ─── Main Component ─── */
/** Detects sales objections in recent chat messages using AI analysis, shows matched objection cards with suggested counter-responses, and supports tone/period filtering. */
export function ObjectionDetector({
  contactId,
  contactName,
  lastMessages,
  allMessages = [],
  onSelectSuggestion,
}: ObjectionDetectorProps) {
  const detector = useObjectionDetector(contactId, contactName, lastMessages, allMessages);

  const handleSelect = useCallback(
    (text: string) => {
      detector.handleSelect(text, onSelectSuggestion);
    },
    [detector.handleSelect, onSelectSuggestion] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ── Pre-analysis state ── */
  if (!detector.analyzed) {
    return (
      <div className="space-y-3">
        {detector.hasPeriodMessages && (
          <PeriodFilterSelector
            period={detector.periodFilter.analysisPeriod}
            onPeriodChange={detector.periodFilter.setAnalysisPeriod}
            customFrom={detector.periodFilter.customDateFrom}
            customTo={detector.periodFilter.customDateTo}
            onCustomFromChange={detector.periodFilter.setCustomDateFrom}
            onCustomToChange={detector.periodFilter.setCustomDateTo}
            onClearCustom={detector.periodFilter.clearCustomDates}
            filteredCount={detector.periodFilter.filteredMessages.length}
            totalCount={allMessages.length}
          />
        )}
        <ToneSelector selected={detector.selectedTone} onChange={detector.setSelectedTone} />
        <Button
          className="h-11 w-full rounded-2xl bg-primary text-[13px] font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98]"
          onClick={() => detector.analyze()}
          disabled={detector.loading || detector.clientMessages.length === 0}
        >
          {detector.loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analisando...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Detectar objeções
              {detector.clientMessages.length > 0 && (
                <span className="ml-2 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px] font-bold tabular-nums">
                  {detector.clientMessages.length}
                </span>
              )}
            </>
          )}
        </Button>
        {detector.clientMessages.length === 0 && (
          <p className="text-center text-[10px] italic text-muted-foreground">
            Nenhuma mensagem do cliente no período
          </p>
        )}
      </div>
    );
  }

  /* ── Loading ── */
  if (detector.loading && detector.objections.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-1">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div>
            <p className="text-xs font-semibold text-foreground">Analisando mensagens...</p>
            <p className="text-[10px] text-muted-foreground">
              {detector.clientMessages.length} mensagens em análise
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-border/20 p-4">
              <div className="flex items-start gap-3">
                <ShimmerBlock className="h-8 w-8 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <ShimmerBlock className="h-3.5 w-4/5" />
                  <ShimmerBlock className="h-5 w-16 rounded-full" />
                </div>
              </div>
              <ShimmerBlock className="h-16 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Empty / Error ── */
  if (detector.objections.length === 0) {
    return (
      <div className="space-y-4">
        {detector.error ? (
          <div
            role="alert"
            className="bg-destructive/8 flex items-start gap-3 rounded-2xl border border-destructive/15 p-4"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold text-destructive">Erro na análise</p>
              <p className="text-[11px] leading-relaxed text-destructive/80">{detector.error}</p>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-3 py-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10"
            >
              <Check className="h-7 w-7 text-primary" />
            </motion.div>
            <div className="space-y-1 text-center">
              <p className="text-sm font-semibold text-foreground">Nenhuma objeção!</p>
              <p className="max-w-[260px] text-[11px] text-muted-foreground">
                O cliente não apresentou resistências. Conversa fluindo bem 🎉
              </p>
            </div>
          </motion.div>
        )}
        <Button
          variant="outline"
          className="h-10 w-full rounded-2xl border-border/30 text-xs font-medium"
          onClick={detector.resetAnalysis}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Nova análise
        </Button>
      </div>
    );
  }

  /* ── Results ── */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10">
            <span className="text-sm font-bold text-primary">{detector.objections.length}</span>
          </div>
          <div>
            <p className="text-[13px] font-bold leading-none text-foreground">
              {detector.objections.length === 1 ? 'Objeção detectada' : 'Objeções detectadas'}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Contra-argumentos prontos</p>
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-muted/30"
              onClick={() => detector.analyze()}
              disabled={detector.loading}
              aria-label="Analisar objeções"
            >
              <motion.div
                animate={detector.loading ? { rotate: 360 } : {}}
                transition={{
                  duration: 1,
                  repeat: detector.loading ? Infinity : 0,
                  ease: 'linear',
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </motion.div>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-[10px]">
            Reanalisar
          </TooltipContent>
        </Tooltip>
      </div>

      <ToneSelector
        selected={detector.selectedTone}
        onChange={(tone) => {
          detector.setSelectedTone(tone);
          detector.analyze(tone);
        }}
        disabled={detector.loading}
      />

      <div className="relative">
        {detector.loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-muted/80 px-4 py-2.5 shadow-lg">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs font-medium text-foreground">Ajustando tom...</span>
            </div>
          </motion.div>
        )}
        <ScrollArea className="h-72 [&>[data-radix-scroll-area-viewport]]:max-h-72">
          <div className="space-y-3 pr-3">
            <AnimatePresence mode="popLayout">
              {detector.objections.map((obj, idx) => (
                <ObjectionCard
                  key={obj.id}
                  obj={obj}
                  idx={idx}
                  isRewriting={detector.rewritingIdx === idx}
                  rewritingAny={detector.rewritingIdx !== null}
                  copiedIdx={detector.copiedIdx}
                  onSelect={handleSelect}
                  onCopy={detector.handleCopy}
                  onRewrite={detector.rewriteSingle}
                />
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
