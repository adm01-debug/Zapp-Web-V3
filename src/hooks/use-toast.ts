import { toast as sonnerToast } from 'sonner';

/** Wrapper hook providing toast notification functionality via Sonner library. */
const useToast = () => {
  return {
    toasts: [],
    toast: sonnerToast,
    dismiss: (id?: string) => {
      if (id) {
        sonnerToast.dismiss(id);
      } else {
        sonnerToast.dismiss();
      }
    },
  };
};

export { useToast, sonnerToast as toast };
