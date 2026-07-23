import { useCallback, useRef, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import type {
  FeedbackType,
  FeedbackOptions,
  WithFeedbackOptions,
  UndoableOptions,
} from './feedback/feedbackTypes';
import {
  FEEDBACK_ICONS,
  FEEDBACK_TITLES,
  FEEDBACK_DURATIONS,
} from './feedback/feedbackTypes';

/** Re-exported module members. */
export type { FeedbackType, FeedbackOptions, WithFeedbackOptions, UndoableOptions };

interface ToastHandle {
  id: string | number;
  dismiss: () => void;
  update: (opts: { description?: string; title?: string }) => void;
}

function makeHandle(id: string | number, title: string | undefined): ToastHandle {
  return {
    id,
    dismiss: () => sonnerToast.dismiss(id),
    update: (opts) => {
      sonnerToast(opts.title ?? title ?? '', { id, description: opts.description });
    },
  };
}

/** Provides feedback notifications for user actions with customizable types and durations. */
export function useActionFeedback() {
  const activeToasts = useRef<Map<string | number, ToastHandle>>(new Map());

  const showFeedback = useCallback(
    (type: FeedbackType, options: FeedbackOptions): ToastHandle => {
      const icon = FEEDBACK_ICONS[type];
      const title = options.title || FEEDBACK_TITLES[type];
      const duration = options.duration ?? FEEDBACK_DURATIONS[type];
      const description = options.action
        ? `${icon} ${options.description} [${options.action.label}]`
        : `${icon} ${options.description}`;

      const emit =
        type === 'error'
          ? sonnerToast.error
          : type === 'warning'
            ? sonnerToast.warning
            : type === 'success'
              ? sonnerToast.success
              : type === 'loading'
                ? sonnerToast.loading
                : sonnerToast.info;

      const id = emit(title, { description, duration });
      const handle = makeHandle(id, title);
      if (options.action) {
        activeToasts.current.set(id, handle);
      }
      return handle;
    },
    []
  );

  const success = useCallback(
    (d: string, t?: string) => showFeedback('success', { description: d, title: t }),
    [showFeedback]
  );
  const error = useCallback(
    (d: string, t?: string) => showFeedback('error', { description: d, title: t }),
    [showFeedback]
  );
  const warning = useCallback(
    (d: string, t?: string) => showFeedback('warning', { description: d, title: t }),
    [showFeedback]
  );
  const info = useCallback(
    (d: string, t?: string) => showFeedback('info', { description: d, title: t }),
    [showFeedback]
  );
  const loading = useCallback(
    (d: string, t?: string) => showFeedback('loading', { description: d, title: t }),
    [showFeedback]
  );

  const withFeedback = useCallback(
    async <T>(
      action: () => Promise<T>,
      options: WithFeedbackOptions<T> = {}
    ): Promise<T | undefined> => {
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
        success(typeof successMessage === 'function' ? successMessage(result) : successMessage);
        onSuccess?.(result);
        return result;
      } catch (err) {
        loadingToast?.dismiss();
        const e = err instanceof Error ? err : new Error(String(err));
        error(e.message || errorMessage);
        onError?.(e);
        return undefined;
      }
    },
    [loading, success, error]
  );

  const withUndo = useCallback(
    <T>(
      action: () => Promise<T>,
      options: UndoableOptions<T>
    ): Promise<T | 'undone' | undefined> => {
      return new Promise((resolve) => {
        const { description, undoDuration = 5000, onUndo, onConfirm } = options;
        let undone = false;
        let timeoutId: ReturnType<typeof setTimeout>;
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
    [showFeedback, info, error]
  );

  const withBatchFeedback = useCallback(
    async <T>(
      actions: (() => Promise<T>)[],
      options: {
        progressMessage?: (c: number, t: number) => string;
        successMessage?: string;
        errorMessage?: string;
        stopOnError?: boolean;
      } = {}
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
    [loading, success, error, warning]
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

/** Executes optimistic updates with automatic rollback and user feedback. */
export function useOptimisticAction<T>() {
  const feedback = useActionFeedback();
  const [isPending, setIsPending] = useState(false);
  const execute = useCallback(
    async (
      optimisticUpdate: () => void,
      serverAction: () => Promise<T>,
      rollback: () => void,
      options?: { successMessage?: string; errorMessage?: string; silent?: boolean }
    ): Promise<T | undefined> => {
      setIsPending(true);
      optimisticUpdate();
      try {
        const r = await serverAction();
        if (!options?.silent) feedback.success(options?.successMessage || 'Alteração salva!');
        return r;
      } catch (err) {
        rollback();
        feedback.error(err instanceof Error ? err.message : options?.errorMessage || 'Erro');
        return undefined;
      } finally {
        setIsPending(false);
      }
    },
    [feedback]
  );
  return { execute, isPending, ...feedback };
}

/** Provides confirmation dialogs for destructive or important user actions. */
export function useConfirmAction() {
  const feedback = useActionFeedback();
  const confirm = useCallback(
    async <T>(
      action: () => Promise<T>,
      options: { message: string; confirmLabel?: string }
    ): Promise<T | 'cancelled' | undefined> => {
      return new Promise((resolve) => {
        const toastResult = feedback.showFeedback('warning', {
          title: 'Confirmação',
          description: options.message,
          duration: 30000,
          action: {
            label: options.confirmLabel || 'Confirmar',
            onClick: async () => {
              toastResult.dismiss();
              try {
                const r = await action();
                feedback.success('Ação confirmada!');
                resolve(r);
              } catch (err) {
                feedback.error(err instanceof Error ? err.message : 'Erro');
                resolve(undefined);
              }
            },
          },
        });
      });
    },
    [feedback]
  );
  return { confirm, ...feedback };
}
