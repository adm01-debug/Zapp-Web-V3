/** Hook: Feedback Type. */
export type FeedbackType = 'success' | 'error' | 'warning' | 'info' | 'loading';

/** Hook: Feedback Options. */
export interface FeedbackOptions {
  title?: string;
  description: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/** Hook: With Feedback Options. */
export interface WithFeedbackOptions<T> {
  loadingMessage?: string;
  successMessage?: string | ((result: T) => string);
  errorMessage?: string;
  showLoading?: boolean;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
}

/** Hook: Undoable Options. */
export interface UndoableOptions<T> {
  description: string;
  undoDuration?: number;
  onUndo: () => void;
  onConfirm?: (result: T) => void;
}

/** Hook: FEEDBACK_ICONS. */
export const FEEDBACK_ICONS: Record<FeedbackType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
  loading: '⟳',
};

/** Hook: FEEDBACK_TITLES. */
export const FEEDBACK_TITLES: Record<FeedbackType, string> = {
  success: 'Sucesso!',
  error: 'Erro!',
  warning: 'Atenção',
  info: 'Informação',
  loading: 'Processando...',
};

/** Hook: FEEDBACK_VARIANTS. */
export const FEEDBACK_VARIANTS: Record<FeedbackType, 'default' | 'destructive'> = {
  success: 'default',
  error: 'destructive',
  warning: 'default',
  info: 'default',
  loading: 'default',
};

/** Hook: FEEDBACK_DURATIONS. */
export const FEEDBACK_DURATIONS: Record<FeedbackType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
  loading: 60000,
};
