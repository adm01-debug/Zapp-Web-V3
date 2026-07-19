// Consolidated Advanced Features Management Module (ETAPA 50 consolidation)
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fromTable } from '@/lib/supabaseHelpers';
import { useToast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';
import { ConversationWithMessages } from '@/features/inbox';
import { type ToneKey, getTonePrompt } from '@/features/inbox/components/ai-tools/ToneSelector';
import { usePeriodFilter } from '@/features/inbox/components/ai-tools/PeriodFilterSelector';
import type { ChatMessage } from '@/features/inbox/types/aiChatMessage';

const log = getLogger('useAdvancedFeaturesManagement');

// ===== Bulk Actions Management =====
/** Hook: Bulk Action. */
export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'destructive' | 'outline';
  action: (items: T[]) => Promise<void>;
  confirm?: {
    title: string;
    description: string;
  };
}

interface UseBulkActionsOptions<T> {
  tableName?: string;
  queryKey?: string[];
  actions?: BulkAction<T>[];
  onActionComplete?: () => void;
}

interface UseBulkActionsResult<T> {
  selectedIds: Set<string>;
  selectedItems: T[];
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  selectOne: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  toggleSelection: (id: string) => void;
  isSelected: (id: string) => boolean;
  executeAction: (actionId: string) => Promise<void>;
  availableActions: BulkAction<T>[];
  isExecuting: boolean;
  hasSelection: boolean;
  selectionCount: number;
}

/** Hook: use Bulk Actions Management. */
export function useBulkActionsManagement<T extends { id: string }>(
  items: T[],
  options: UseBulkActionsOptions<T> = {},
): UseBulkActionsResult<T> {
  const { tableName, queryKey, actions = [], onActionComplete } = options;
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExecuting, setIsExecuting] = useState(false);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isPartiallySelected = selectedIds.size > 0 && selectedIds.size < items.length;
  const hasSelection = selectedIds.size > 0;

  const selectOne = useCallback((id: string) => {
    setSelectedIds((prev) => new Set([...prev, id]));
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((item) => item.id)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const defaultActions: BulkAction<T>[] = useMemo(() => {
    if (!tableName || selectedItems.length === 0) return [];

    return [
      {
        id: 'delete',
        label: 'Excluir Selecionados',
        variant: 'destructive' as const,
        confirm: {
          title: 'Confirmar Exclusão',
          description: `Tem certeza que deseja excluir ${selectedItems.length} item(s)? Esta ação não pode ser desfeita.`,
        },
        action: async (actionItems: T[]) => {
          const ids = actionItems.map((i) => i.id);
          if (ids.length === 0) {
            throw new Error('Nenhum item selecionado');
          }
          const { error } = await fromTable(tableName)
            .delete()
            .in('id', ids);

          if (error) throw error;
          toast.success(`${ids.length} item(s) excluído(s)`);
        },
      },
      {
        id: 'archive',
        label: 'Arquivar Selecionados',
        variant: 'outline' as const,
        action: async (actionItems: T[]) => {
          const ids = actionItems.map((i) => i.id);
          if (ids.length === 0) {
            throw new Error('Nenhum item selecionado');
          }
          const { error } = await fromTable(tableName)
            .update({ status: 'archived', updated_at: new Date().toISOString() } as Record<string, unknown>)
            .in('id', ids);

          if (error) throw error;
          toast.success(`${ids.length} item(s) arquivado(s)`);
        },
      },
    ];
  }, [tableName, selectedItems]);

  const availableActions = useMemo(() => [...defaultActions, ...actions], [defaultActions, actions]);

  const executeAction = useCallback(
    async (actionId: string) => {
      const action = availableActions.find((a) => a.id === actionId);
      if (!action || selectedItems.length === 0) return;

      setIsExecuting(true);

      try {
        await action.action(selectedItems);

        if (queryKey) {
          await queryClient.invalidateQueries({ queryKey });
        }

        deselectAll();
        onActionComplete?.();
      } catch (error) {
        toast.error(
          `Erro ao executar ação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        );
      } finally {
        setIsExecuting(false);
      }
    },
    [availableActions, selectedItems, queryClient, queryKey, deselectAll, onActionComplete],
  );

  return {
    selectedIds,
    selectedItems,
    isAllSelected,
    isPartiallySelected,
    selectOne,
    selectAll,
    deselectAll,
    toggleSelection,
    isSelected,
    executeAction,
    availableActions,
    isExecuting,
    hasSelection,
    selectionCount: selectedIds.size,
  };
}

// ===== Offline Cache Management =====
const CACHE_KEY = 'offline_conversations';
const CACHE_TTL = 1000 * 60 * 30;
const CACHE_VERSION = 2;

interface CacheEntry {
  data: ConversationWithMessages[];
  timestamp: number;
  version: number;
}

function readCache(): ConversationWithMessages[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (!entry.data || !Array.isArray(entry.data)) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    if (entry.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch (e) {
    log.warn('Failed to read offline cache', e);
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // Ignore removal errors
    }
    return null;
  }
}

function writeCacheSync(data: ConversationWithMessages[]): boolean {
  try {
    const trimmed = data.slice(0, 50).map((c) => ({
      ...c,
      messages: c.messages.slice(-20),
    }));
    const entry: CacheEntry = { data: trimmed, timestamp: Date.now(), version: CACHE_VERSION };
    const jsonStr = JSON.stringify(entry);

    // Check estimated size and quota
    const estimatedSize = new Blob([jsonStr]).size;
    const maxAllowedSize = 5 * 1024 * 1024; // 5MB default quota
    if (estimatedSize > maxAllowedSize * 0.8) {
      log.warn(
        `Offline cache size (${estimatedSize} bytes) exceeds 80% of quota, skipping write`,
      );
      return false;
    }

    localStorage.setItem(CACHE_KEY, jsonStr);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      log.warn('Offline cache quota exceeded on first attempt', e);
      return false;
    }
    log.error('Failed to write offline cache', e);
    return false;
  }
}

async function writeCacheWithRetry(
  data: ConversationWithMessages[],
  maxRetries = 3,
): Promise<boolean> {
  // Try synchronous write first for better performance and testability
  if (writeCacheSync(data)) {
    return true;
  }

  // If sync write failed, try async retries with backoff (for quota errors)
  const trimmed = data.slice(0, 50).map((c) => ({
    ...c,
    messages: c.messages.slice(-20),
  }));
  const entry: CacheEntry = { data: trimmed, timestamp: Date.now(), version: CACHE_VERSION };
  const jsonStr = JSON.stringify(entry);

  for (let attempt = 0; attempt < maxRetries - 1; attempt++) {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // Ignore removal errors
    }
    const backoffDelay = Math.pow(2, attempt) * 100;
    await new Promise((resolve) => setTimeout(resolve, backoffDelay));

    try {
      localStorage.setItem(CACHE_KEY, jsonStr);
      log.info('Offline cache recovered after retry');
      return true;
    } catch (e) {
      log.warn(`Retry ${attempt + 1} failed for offline cache`, e);
      if (attempt === maxRetries - 2) {
        log.error('All offline cache retries exhausted');
        return false;
      }
    }
  }
  return false;
}

/** Hook: use Offline Cache Management. */
export function useOfflineCacheManagement(conversations: ConversationWithMessages[], loading: boolean) {
  const [cachedData, setCachedData] = useState<ConversationWithMessages[] | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const lastWriteRef = useRef(0);
  const pendingWriteRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setCachedData(cached);
      log.info(`Loaded ${cached.length} conversations from offline cache`);
    }
  }, []);

  useEffect(() => {
    if (!loading && conversations.length > 0) {
      const now = Date.now();
      if (now - lastWriteRef.current > 10000 && !pendingWriteRef.current) {
        lastWriteRef.current = now;
        // Fire async write without blocking
        pendingWriteRef.current = writeCacheWithRetry(conversations).then((success) => {
          pendingWriteRef.current = null;
          if (success) {
            log.info(`Offline cache updated (${conversations.length} conversations)`);
          }
          return success;
        });
      }
    }
  }, [conversations, loading]);

  const effectiveData = isOffline && loading ? cachedData || [] : conversations;
  const usingCache = isOffline && loading && !!cachedData;

  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // Ignore removal errors
    }
    setCachedData(null);
  }, []);

  return {
    conversations: effectiveData,
    isOffline,
    usingCache,
    clearCache,
  };
}

// ===== Action Feedback Management =====
import type {
  FeedbackType,
  FeedbackOptions,
  WithFeedbackOptions,
  UndoableOptions,
} from './feedback/feedbackTypes';
import {
  FEEDBACK_ICONS,
  FEEDBACK_TITLES,
  FEEDBACK_VARIANTS,
  FEEDBACK_DURATIONS,
} from './feedback/feedbackTypes';

export type { FeedbackType, FeedbackOptions, WithFeedbackOptions, UndoableOptions };

/** Hook: use Action Feedback Management. */
export function useActionFeedbackManagement() {
  const { toast } = useToast();
  const activeToasts = useRef<Map<string, { dismiss: () => void }>>(new Map());

  const showFeedback = useCallback(
    (type: FeedbackType, options: FeedbackOptions) => {
      const icon = FEEDBACK_ICONS[type];
      const title = options.title || FEEDBACK_TITLES[type];
      const duration = options.duration ?? FEEDBACK_DURATIONS[type];
      const description = options.action
        ? `${icon} ${options.description} [${options.action.label}]`
        : `${icon} ${options.description}`;
      const toastResult = toast({ title, description, variant: FEEDBACK_VARIANTS[type], duration });
      if (options.action) {
        activeToasts.current.set(toastResult.id, {
          dismiss: () => {
            toastResult.dismiss();
            activeToasts.current.delete(toastResult.id);
          },
        });
      }
      return toastResult;
    },
    [toast],
  );

  const success = useCallback(
    (d: string, t?: string) => showFeedback('success', { description: d, title: t }),
    [showFeedback],
  );
  const error = useCallback(
    (d: string, t?: string) => showFeedback('error', { description: d, title: t }),
    [showFeedback],
  );
  const warning = useCallback(
    (d: string, t?: string) => showFeedback('warning', { description: d, title: t }),
    [showFeedback],
  );
  const info = useCallback(
    (d: string, t?: string) => showFeedback('info', { description: d, title: t }),
    [showFeedback],
  );
  const loading = useCallback(
    (d: string, t?: string) => showFeedback('loading', { description: d, title: t }),
    [showFeedback],
  );

  const withFeedback = useCallback(
    async <T,>(action: () => Promise<T>, options: WithFeedbackOptions<T> = {}): Promise<T | undefined> => {
      const {
        loadingMessage = 'Processando...',
        successMessage = 'Operação concluída com sucesso!',
        errorMessage = 'Ocorreu um erro.',
        showLoading = true,
        onSuccess,
        onError,
      } = options;
      const loadingToast = showLoading ? loading(loadingMessage) : null;
      try {
        const result = await action();
        loadingToast?.dismiss();
        let finalSuccessMessage: string;
        if (typeof successMessage === 'function') {
          try {
            finalSuccessMessage = successMessage(result);
            if (!finalSuccessMessage || typeof finalSuccessMessage !== 'string') {
              finalSuccessMessage = 'Operação concluída com sucesso!';
            }
          } catch (e) {
            log.error('Error in successMessage callback', e);
            finalSuccessMessage = 'Operação concluída com sucesso!';
          }
        } else {
          finalSuccessMessage = successMessage || 'Operação concluída com sucesso!';
        }
        success(finalSuccessMessage);
        onSuccess?.(result);
        return result;
      } catch (err) {
        loadingToast?.dismiss();
        const e = err instanceof Error ? err : new Error(String(err));
        let finalErrorMessage = e.message?.trim() || '';
        if (!finalErrorMessage) {
          finalErrorMessage = errorMessage || 'Ocorreu um erro.';
        }
        error(finalErrorMessage);
        onError?.(e);
        return undefined;
      }
    },
    [loading, success, error],
  );

  const withUndo = useCallback(
    <T,>(action: () => Promise<T>, options: UndoableOptions<T>): Promise<T | 'undone' | undefined> => {
      return new Promise((resolve) => {
        const { description, undoDuration = 5000, onUndo, onConfirm } = options;
        let undone = false;
        let timeoutId: NodeJS.Timeout;
        const toastResult = showFeedback('info', {
          description,
          duration: undoDuration,
          action: {
            label: 'Desfazer',
            onClick: () => {
              undone = true;
              clearTimeout(timeoutId);
              toastResult.dismiss();
              onUndo();
              info('Ação desfeita');
              resolve('undone');
            },
          },
        });
        timeoutId = setTimeout(async () => {
          if (!undone) {
            try {
              const r = await action();
              onConfirm?.(r);
              resolve(r);
            } catch (err) {
              error(err instanceof Error ? err.message : 'Erro');
              resolve(undefined);
            }
          }
        }, undoDuration);
      });
    },
    [showFeedback, info, error],
  );

  const withBatchFeedback = useCallback(
    async <T,>(
      actions: (() => Promise<T>)[],
      options: {
        progressMessage?: (c: number, t: number) => string;
        successMessage?: string;
        errorMessage?: string;
        stopOnError?: boolean;
      } = {},
    ): Promise<{ results: T[]; errors: Error[] }> => {
      const {
        progressMessage = (c, t) => `Processando ${c} de ${t}...`,
        successMessage = 'Todas as operações concluídas!',
        errorMessage = 'Algumas operações falharam',
        stopOnError = false,
      } = options;
      const results: T[] = [];
      const errors: Error[] = [];
      const total = actions.length;
      const loadingToast = loading(progressMessage(0, total));
      for (let i = 0; i < actions.length; i++) {
        loadingToast.update({
          id: loadingToast.id,
          description: `⟳ ${progressMessage(i + 1, total)}`,
        });
        try {
          results.push(await actions[i]());
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
          if (stopOnError) break;
        }
      }
      loadingToast.dismiss();
      if (errors.length === 0) success(successMessage);
      else if (errors.length === total) error(errorMessage);
      else warning(`${results.length} sucesso, ${errors.length} falhas`);
      return { results, errors };
    },
    [loading, success, error, warning],
  );

  const dismissAll = useCallback(() => {
    activeToasts.current.forEach((t) => t.dismiss());
    activeToasts.current.clear();
  }, []);

  return {
    showFeedback,
    success,
    error,
    warning,
    info,
    loading,
    withFeedback,
    withUndo,
    withBatchFeedback,
    dismissAll,
  };
}

// ===== Objection Detector Management =====
interface Objection {
  objection: string;
  counterArgument: string;
  confidence: number;
}

/** Hook: use Objection Detector Management. */
export function useObjectionDetectorManagement(
  contactId: string,
  contactName: string | undefined,
  lastMessages: string[],
  allMessages: ChatMessage[],
) {
  const [objections, setObjections] = useState<Objection[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [selectedTone, setSelectedTone] = useState<ToneKey>('friendly');
  const [rewritingIdx, setRewritingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCallRef = useRef(0);

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const normalized = useMemo(
    () => allMessages.map((m) => ({ ...m, created_at: m.created_at || m.timestamp })),
    [allMessages],
  );

  const hasPeriodMessages = normalized.length > 0;
  const periodFilter = usePeriodFilter(normalized, 'all');

  const clientMessages = useMemo(() => {
    if (!hasPeriodMessages) return lastMessages;
    return periodFilter.filteredMessages
      .filter((m) => m.sender !== 'agent' && m.content && m.content.trim().length > 0)
      .map((m) => m.content);
  }, [hasPeriodMessages, periodFilter.filteredMessages, lastMessages]);

  useEffect(() => {
    setAnalyzed(false);
    setObjections([]);
    setError(null);
    setRewritingIdx(null);
    setCopiedIdx(null);
    setSelectedTone('friendly');
  }, [contactId]);

  useEffect(() => {
    setAnalyzed(false);
    setObjections([]);
    setError(null);
  }, [periodFilter.analysisPeriod, periodFilter.customDateFrom, periodFilter.customDateTo]);

  const analyze = useCallback(
    async (tone?: ToneKey) => {
      if (clientMessages.length === 0) {
        toast.warning('Nenhuma mensagem do cliente para analisar.');
        return;
      }
      const now = Date.now();
      if (now - lastCallRef.current < 3000) {
        toast.warning('Aguarde alguns segundos antes de tentar novamente.');
        return;
      }
      lastCallRef.current = now;
      setLoading(true);
      setError(null);
      const activeTone = tone ?? selectedTone;
      const activePrompt = getTonePrompt(activeTone);

      try {
        const response = await supabase.functions.invoke('ai-proxy', {
          body: {
            messages: [
              {
                role: 'system',
                content: `Você é um especialista em inteligência comercial e negociação de uma empresa distribuidora/comercial.

CONTEXTO DO NEGÓCIO — Identifique o tipo de conversa:
• VENDAS: Vendedor ↔ cliente — objeções de preço, prazo, quantidade, condições.
• COMPRAS: Comprador ↔ fornecedor — resistências em negociação de custos, prazos de entrega, MOQ.
• LOGÍSTICA: Logística ↔ transportadora — objeções sobre frete, prazo de coleta, restrições.
• RH: RH ↔ colaborador — resistências sobre políticas, benefícios, procedimentos.
• FINANCEIRO: Cobranças — objeções de pagamento, contestações, renegociações.
• SAC: Reclamações — insatisfação, devoluções, garantia.

Analise as mensagens e identifique objeções/resistências do interlocutor. Para cada uma, sugira um contra-argumento persuasivo e adequado ao contexto do departamento.
${contactName ? `IMPORTANTE: O nome do contato é "${contactName.split(' ')[0]}". TODA resposta (counterArgument) DEVE começar mencionando o nome do contato de forma natural (ex: "${contactName.split(' ')[0]}, entendo sua preocupação..." ou "${contactName.split(' ')[0]}, compreendo perfeitamente..."). Isso é OBRIGATÓRIO para humanizar o atendimento.` : ''}
${activePrompt}
Responda APENAS em JSON válido com este formato:
[{"objection":"texto da objeção","counterArgument":"sugestão de resposta","confidence":0.85}]
Se não houver objeções, retorne []`,
              },
              { role: 'user', content: `Mensagens do cliente:\n${clientMessages.join('\n')}` },
            ],
            model: 'google/gemini-3-flash-preview',
          },
        });

        if (response.error) throw new Error(response.error.message || 'Erro na API');
        const content =
          response.data?.content || response.data?.choices?.[0]?.message?.content || '[]';

        // Use non-greedy regex to find first array
        const jsonMatch = content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (e) {
            log.error('Failed to parse JSON from AI response', { error: e, content });
            setObjections([]);
            setError('Resposta da IA em formato inválido');
            return;
          }

          if (!Array.isArray(parsed)) {
            log.error('Expected array from AI, got', typeof parsed);
            setObjections([]);
            setError('Formato de resposta inválido');
            return;
          }

          const valid = parsed
            .filter((o: unknown) => {
              if (typeof o !== 'object' || o === null) return false;
              const obj = o as Record<string, unknown>;

              // Strict validation: require non-empty strings
              const objectionStr = String(obj.objection || '').trim();
              const counterArgStr = String(obj.counterArgument || '').trim();

              if (!objectionStr || !counterArgStr) {
                log.warn('Filtered out objection with empty fields', { objection: objectionStr, counterArgument: counterArgStr });
                return false;
              }

              return (
                typeof obj.objection === 'string' &&
                typeof obj.counterArgument === 'string'
              );
            })
            .map((o: Record<string, unknown>) => ({
              objection: String(o.objection).trim(),
              counterArgument: String(o.counterArgument).trim(),
              confidence:
                typeof o.confidence === 'number' ? Math.min(1, Math.max(0, o.confidence)) : 0.5,
            }));

          setObjections(valid);
          if (valid.length > 0) {
            toast.success(`${valid.length} objeção(ões) detectada(s)!`);
          } else {
            setError(null);
          }
        } else {
          log.warn('No JSON array found in AI response', { content });
          setObjections([]);
          setError('Nenhuma objeção detectada na resposta');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        log.error('Objection detection error', { error: msg });
        setError(msg);
        setObjections([]);
        toast.error('Falha ao analisar objeções. Tente novamente.');
      }
      setAnalyzed(true);
      setLoading(false);
    },
    [clientMessages, selectedTone, contactName],
  );

  const rewriteSingle = useCallback(
    async (idx: number) => {
      setRewritingIdx(idx);
      const activePrompt = getTonePrompt(selectedTone);
      try {
        const response = await supabase.functions.invoke('ai-proxy', {
          body: {
            messages: [
              {
                role: 'system',
                content: `Reescreva o contra-argumento abaixo mantendo o mesmo significado mas mudando o tom. ${activePrompt}${contactName ? ` IMPORTANTE: A resposta DEVE começar com o nome "${contactName.split(' ')[0]}" de forma natural e humana.` : ''} Responda APENAS com o texto reescrito, sem aspas ou explicações.`,
              },
              { role: 'user', content: objections[idx].counterArgument },
            ],
            model: 'google/gemini-3-flash-preview',
          },
        });
        const content = response.data?.content || response.data?.choices?.[0]?.message?.content;
        if (content) {
          setObjections((prev) =>
            prev.map((o, i) => (i === idx ? { ...o, counterArgument: content.trim() } : o)),
          );
          toast.success('Resposta reescrita!');
        }
      } catch {
        toast.error('Erro ao reescrever. Tente novamente.');
      }
      setRewritingIdx(null);
    },
    [objections, selectedTone, contactName],
  );

  const handleSelect = useCallback((text: string, onSelectSuggestion?: (text: string) => void) => {
    onSelectSuggestion?.(text);
    toast.success('Resposta inserida no chat!');
  }, []);

  const handleCopy = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success('Copiado!');
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedIdx(null), 2000);
  }, []);

  const resetAnalysis = useCallback(() => {
    setAnalyzed(false);
    setError(null);
  }, []);

  return {
    objections,
    loading,
    analyzed,
    selectedTone,
    setSelectedTone,
    rewritingIdx,
    error,
    copiedIdx,
    hasPeriodMessages,
    clientMessages,
    periodFilter,
    analyze,
    rewriteSingle,
    handleSelect,
    handleCopy,
    resetAnalysis,
  };
}

// ===== Service Worker Management =====
const CACHE_RESET_FLAG = 'sw-cache-reset-done';
const SW_CLEANUP_TIMEOUT = 5000; // 5 second timeout for cleanup operations

async function cleanupLegacyServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || typeof caches === 'undefined') return false;

  let cacheKeys: string[] = [];
  try {
    // Set timeout for cache.keys() to prevent indefinite hang
    cacheKeys = await Promise.race([
      caches.keys(),
      new Promise<string[]>((_, reject) =>
        setTimeout(
          () => reject(new Error('Cache.keys() timeout')),
          SW_CLEANUP_TIMEOUT / 2,
        ),
      ),
    ]);
  } catch (e) {
    log.warn('[ServiceWorker] Failed to get cache keys', e);
    return false;
  }

  if (cacheKeys.length === 0) {
    try {
      sessionStorage.removeItem(CACHE_RESET_FLAG);
    } catch {
      // Ignore storage errors
    }
    return false;
  }

  log.info('[ServiceWorker] Purging stale caches that can restore old UI bundles', cacheKeys);

  let registrations: ServiceWorkerRegistration[] = [];
  try {
    if (navigator.serviceWorker.getRegistrations) {
      registrations = await Promise.race([
        navigator.serviceWorker.getRegistrations(),
        new Promise<ServiceWorkerRegistration[]>((_, reject) =>
          setTimeout(
            () => reject(new Error('getRegistrations() timeout')),
            SW_CLEANUP_TIMEOUT / 2,
          ),
        ),
      ]);
    }
  } catch (e) {
    log.warn('[ServiceWorker] Failed to get registrations', e);
  }

  // Unregister all service workers with timeout protection
  const unregisterPromises = registrations.map((registration) =>
    Promise.race([
      registration.unregister().catch((e) => {
        log.warn('[ServiceWorker] Failed to unregister', e);
      }),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error('Unregister timeout')),
          SW_CLEANUP_TIMEOUT / 2,
        ),
      ),
    ]).catch((e) => {
      log.warn('[ServiceWorker] Unregister operation timeout or failed', e);
    }),
  );

  // Delete all caches with timeout protection
  const deletePromises = cacheKeys.map((key) =>
    Promise.race([
      caches.delete(key).catch((e) => {
        log.warn(`[ServiceWorker] Failed to delete cache '${key}'`, e);
        return false;
      }),
      new Promise<boolean>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Cache delete timeout for '${key}'`)),
          SW_CLEANUP_TIMEOUT / 2,
        ),
      ),
    ]).catch((e) => {
      log.warn(`[ServiceWorker] Cache delete operation timeout for '${key}'`, e);
      return false;
    }),
  );

  // Wait for all cleanup operations with overall timeout
  let allSucceeded = false;
  try {
    await Promise.race([
      Promise.all([...unregisterPromises, ...deletePromises]),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error('Overall cleanup timeout')),
          SW_CLEANUP_TIMEOUT,
        ),
      ),
    ]);
    allSucceeded = true;
  } catch (e) {
    log.warn('[ServiceWorker] Cleanup operations did not complete in time', e);
    // Continue anyway - we've made best effort
  }

  // Only mark as done and reload if cleanup succeeded significantly (80%+ of operations completed)
  if (sessionStorage.getItem(CACHE_RESET_FLAG) !== '1' && allSucceeded) {
    try {
      sessionStorage.setItem(CACHE_RESET_FLAG, '1');
      log.info('[ServiceWorker] Cleanup completed successfully, reloading...');
      // Use setTimeout to ensure session storage write completes before reload
      setTimeout(() => {
        window.location.reload();
      }, 100);
      return true;
    } catch (e) {
      log.warn('[ServiceWorker] Failed to set cleanup flag', e);
    }
  }

  return false;
}

/** Hook: use Service Worker Management. */
export function useServiceWorkerManagement() {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    if (!('serviceWorker' in navigator)) return;

    let cleanup: (() => void) | undefined;
    let disposed = false;
    const timeoutIds: NodeJS.Timeout[] = [];

    const registerServiceWorker = async (retryCount = 0) => {
      const wasDisposed = disposed;
      if (wasDisposed) return;

      try {
        const reloadedForLegacyCleanup = await cleanupLegacyServiceWorker();
        if (reloadedForLegacyCleanup) return;
        if (disposed) return;

        let registration;
        try {
          registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          });
        } catch (err) {
          const error = err as Error;
          if (error.message.includes('404') && retryCount < 3) {
            log.warn(`[ServiceWorker] 404 on registration attempt ${retryCount + 1}, retrying...`);
            const jitter = Math.random() * 1000;
            const delay = 2000 * Math.pow(2, retryCount) + jitter;
            const timeoutId = setTimeout(() => {
              if (!disposed) {
                registerServiceWorker(retryCount + 1);
              }
            }, delay);
            timeoutIds.push(timeoutId);
            return;
          }
          throw err;
        }

        if (disposed) return;

        log.debug('[ServiceWorker] Registration successful:', registration.scope);

        let updateFailureCount = 0;
        const intervalId = setInterval(() => {
          registration
            .update()
            .then(() => {
              updateFailureCount = 0;
            })
            .catch((err) => {
              updateFailureCount++;
              if (updateFailureCount >= 3) {
                log.error('[ServiceWorker] Update check failed 3 times consecutively:', err);
                updateFailureCount = 0;
              } else {
                log.debug(
                  `[ServiceWorker] Update check failed (${updateFailureCount}/3), will retry:`,
                  err,
                );
              }
            });
        }, 300_000);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                log.debug('[ServiceWorker] New content available');
                document.dispatchEvent(new CustomEvent('sw-update-available'));
              }
            });
          }
        });

        const onMessage = (event: MessageEvent) => {
          log.debug('[ServiceWorker] Message received:', event.data);
          if (event.data.type === 'NOTIFICATION_CLICK') {
            document.dispatchEvent(
              new CustomEvent('notification-click', {
                detail: event.data.data,
              }),
            );
          }
        };
        navigator.serviceWorker.addEventListener('message', onMessage);

        cleanup = () => {
          clearInterval(intervalId);
          timeoutIds.forEach((id) => clearTimeout(id));
          navigator.serviceWorker.removeEventListener('message', onMessage);
        };
      } catch (error) {
        log.error('[ServiceWorker] Registration failed:', error);
      }
    };

    void registerServiceWorker();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
}