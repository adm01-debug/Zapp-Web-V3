// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Toast = { id: string; open: boolean; [key: string]: any };
type ToastState = { toasts: Toast[] };

type ToastAction =
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'UPDATE_TOAST'; toast: Partial<Toast> & { id: string } }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string };

const TOAST_LIMIT = 1;

export function reducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'ADD_TOAST':
      return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };
    case 'DISMISS_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          action.toastId === undefined || t.id === action.toastId ? { ...t, open: false } : t
        ),
      };
    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts:
          action.toastId === undefined ? [] : state.toasts.filter((t) => t.id !== action.toastId),
      };
    default:
      return state;
  }
}

import { toast as sonnerToast } from 'sonner';
import type { ExternalToast } from 'sonner';
import type { ReactNode } from 'react';

type LegacyToastVariant = 'default' | 'destructive';

export type LegacyToastInput = ExternalToast & {
  title?: ReactNode;
  description?: ReactNode;
  variant?: LegacyToastVariant;
};

type ToastMessage = Parameters<typeof sonnerToast>[0];
type ToastOptions = Parameters<typeof sonnerToast>[1];

type CompatToast = ((message: ToastMessage | LegacyToastInput, data?: ToastOptions) => string | number) &
  typeof sonnerToast;

const normalizeToast = (input: LegacyToastInput): { message: ReactNode; data: ExternalToast } => {
  const { title, description, variant, ...rest } = input;
  return {
    message: title ?? description ?? '',
    data: {
      ...rest,
      description: title ? description : undefined,
      richColors: variant === 'destructive' ? true : rest.richColors,
    },
  };
};

const toastCompat = ((message: ToastMessage | LegacyToastInput, data?: ToastOptions) => {
  if (
    message &&
    typeof message === 'object' &&
    !Array.isArray(message) &&
    ('title' in message || 'variant' in message)
  ) {
    const normalized = normalizeToast(message as LegacyToastInput);
    if ((message as LegacyToastInput).variant === 'destructive') {
      return sonnerToast.error(normalized.message, normalized.data);
    }
    return sonnerToast(normalized.message, normalized.data);
  }

  return sonnerToast(message as ToastMessage, data);
}) as CompatToast;

Object.assign(toastCompat, sonnerToast);

/** Wrapper hook providing toast notification functionality via Sonner library. */
const useToast = () => {
  return {
    toasts: [],
    toast: toastCompat,
    dismiss: (id?: string) => {
      if (id) {
        sonnerToast.dismiss(id);
      } else {
        sonnerToast.dismiss();
      }
    },
  };
};

export { useToast, toastCompat as toast };
