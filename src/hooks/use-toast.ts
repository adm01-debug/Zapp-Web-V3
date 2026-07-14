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
