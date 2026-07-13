import { toast as sonnerToast } from 'sonner';

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
