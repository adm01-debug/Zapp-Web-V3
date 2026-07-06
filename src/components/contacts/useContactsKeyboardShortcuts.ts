import { useEffect } from 'react';
import { toast } from 'sonner';

type ViewMode = 'grid' | 'list' | 'table' | 'map' | 'analytics' | 'kanban';

interface Params {
  setIsAddDialogOpen: (open: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setShowShortcutHelp: (updater: (prev: boolean) => boolean) => void;
  onCloseShortcutHelp: () => void;
}

/**
 * Encapsula os atalhos de teclado do Hub de Contatos (N, F, G, L, T, M, A, P,
 * ?, Esc). Ignora eventos originados em campos editáveis e emite toasts curtos.
 */
export function useContactsKeyboardShortcuts({
  setIsAddDialogOpen,
  setViewMode,
  setShowShortcutHelp,
  onCloseShortcutHelp,
}: Params) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target?.isContentEditable ?? false);

      if (isEditable) {
        if (e.key === 'Escape') target?.blur();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutHelp((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        onCloseShortcutHelp();
        return;
      }

      const key = e.key.toLowerCase();
      const modeMap: Record<string, { mode: ViewMode; label: string }> = {
        g: { mode: 'grid', label: 'Grid' },
        l: { mode: 'list', label: 'Lista' },
        t: { mode: 'table', label: 'Tabela' },
        m: { mode: 'map', label: 'Mapa' },
        a: { mode: 'analytics', label: 'Analytics' },
        p: { mode: 'kanban', label: 'Pipeline (Kanban)' },
      };

      if (key === 'n') {
        e.preventDefault();
        setIsAddDialogOpen(true);
        toast.info('Atalho: Novo Registro', { duration: 1000 });
        return;
      }
      if (key === 'f') {
        e.preventDefault();
        const input = document.querySelector(
          'input[placeholder*="Buscar"]'
        ) as HTMLInputElement | null;
        if (input) {
          input.focus();
          toast.info('Atalho: Focar Busca', { duration: 1000 });
        }
        return;
      }
      const cfg = modeMap[key];
      if (cfg) {
        e.preventDefault();
        setViewMode(cfg.mode);
        toast.info(`Visualização: ${cfg.label}`, { duration: 1000 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsAddDialogOpen, setViewMode, setShowShortcutHelp, onCloseShortcutHelp]);
}
