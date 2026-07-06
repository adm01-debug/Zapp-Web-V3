import { useRef, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, AlertTriangle, MessageSquare, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToneSelector } from './ai-tools/ToneSelector';
import { AIResponseCard } from './ai-tools/AIResponseCard';
import { PeriodFilterSelector } from './ai-tools/PeriodFilterSelector';
import { useUniversityHelp } from '@/hooks/useUniversityHelp';
import type { ChatMessage } from '../types/aiChatMessage';

interface UniversityHelpProps {
  contactId: string;
  contactName?: string;
  messages: ChatMessage[];
  onSelectSuggestion?: (text: string) => void;
}

type FilterMode = 'all' | 'client' | 'agent';

export function UniversityHelp({
  contactId,
  contactName,
  messages,
  onSelectSuggestion,
}: UniversityHelpProps) {
  const {
    selectedIds,
    loading,
    response,
    selectedTone,
    setSelectedTone,
    error,
    filterMode,
    setFilterMode,
    filteredMessages,
    periodFilter,
    toggleMessage,
    selectAll,
    generateResponse,
    handleRegenerate,
    lastCallRef,
  } = useUniversityHelp(contactId, contactName, messages);

  const responseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (response && responseRef.current) {
      responseRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [response]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && selectedIds.size > 0 && !loading) {
        e.preventDefault();
        generateResponse();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [generateResponse, selectedIds.size, loading]);

  const filterButtons: { mode: FilterMode; label: string }[] = [
    { mode: 'all', label: 'Todos' },
    { mode: 'client', label: 'Só cliente' },
    { mode: 'agent', label: 'Só atendente' },
  ];

  return (
    <div className="space-y-3">
      <PeriodFilterSelector
        period={periodFilter.analysisPeriod}
        onPeriodChange={periodFilter.setAnalysisPeriod}
        customFrom={periodFilter.customDateFrom}
        customTo={periodFilter.customDateTo}
        onCustomFromChange={periodFilter.setCustomDateFrom}
        onCustomToChange={periodFilter.setCustomDateTo}
        onClearCustom={periodFilter.clearCustomDates}
        filteredCount={periodFilter.filteredMessages.length}
        totalCount={messages.length}
      />

      <ToneSelector
        selected={selectedTone}
        onChange={(tone) => {
          setSelectedTone(tone);
          if (response && selectedIds.size > 0) {
            lastCallRef.current = 0;
            generateResponse(tone);
          }
        }}
        disabled={loading}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-full border border-border/30 bg-muted/30 p-0.5">
          {filterButtons.map((f) => (
            <button
              key={f.mode}
              type="button"
              onClick={() => {
                setFilterMode(f.mode);
              }}
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
                filterMode === f.mode
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={selectAll}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            {selectedIds.size === filteredMessages.length && filteredMessages.length > 0
              ? 'Limpar'
              : 'Todos'}
          </button>
          <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-semibold tabular-nums">
            {selectedIds.size}/{filteredMessages.length}
          </Badge>
        </div>
      </div>

      <ScrollArea className="h-48 rounded-xl border border-border/30 bg-muted/5 [&>[data-radix-scroll-area-viewport]]:max-h-48">
        <div className="space-y-0.5 p-1.5">
          {filteredMessages.map((m) => {
            const isSelected = selectedIds.has(m.id);
            const isAgent = m.sender === 'agent';
            return (
              <label
                key={m.id}
                className={`flex cursor-pointer items-start gap-2 rounded-lg p-2 transition-all ${isSelected ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/20'}`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleMessage(m.id)}
                  className="mt-0.5 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <Badge
                    variant="outline"
                    className={`mb-0.5 h-4 px-1.5 py-0 text-[9px] ${isAgent ? 'border-primary/30 bg-primary/5 text-primary' : 'border-warning/30 bg-warning/5 text-warning'}`}
                  >
                    {isAgent ? '🧑‍💼 Atendente' : '👤 Cliente'}
                  </Badge>
                  <p className="line-clamp-2 text-[11px] leading-snug text-foreground">
                    {m.content}
                  </p>
                </div>
              </label>
            );
          })}
          {filteredMessages.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8">
              <MessageSquare className="h-5 w-5 text-muted-foreground/40" />
              <p className="text-[11px] text-muted-foreground">Nenhuma mensagem disponível</p>
            </div>
          )}
        </div>
      </ScrollArea>

      <Button
        variant="default"
        size="sm"
        className="h-9 w-full text-xs font-medium"
        onClick={() => generateResponse()}
        disabled={loading || selectedIds.size === 0}
        title="Ctrl+Enter para gerar"
      >
        {loading ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Gerando resposta...
          </>
        ) : (
          <>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Gerar resposta ({selectedIds.size} {selectedIds.size === 1 ? 'msg' : 'msgs'})
          </>
        )}
      </Button>
      {selectedIds.size > 0 && !loading && !response && (
        <p className="text-center text-[9px] text-muted-foreground">
          ⌘/Ctrl + Enter para gerar rapidamente
        </p>
      )}

      {error && !response && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-xs font-semibold text-destructive">Erro ao gerar resposta</p>
            <p className="mb-2 text-[11px] text-destructive/80">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="h-6 border-destructive/30 px-2.5 text-[10px] text-destructive hover:bg-destructive/10"
              onClick={() => generateResponse()}
              disabled={loading}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Tentar novamente
            </Button>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {response && (
          <div ref={responseRef}>
            <AIResponseCard
              response={response}
              onUse={onSelectSuggestion}
              onRegenerate={handleRegenerate}
              isRegenerating={loading}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
