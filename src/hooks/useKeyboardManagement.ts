import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { DEFAULT_SHORTCUTS } from '@/hooks/shortcuts/defaultShortcuts';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export interface ShortcutBinding {
  id: string;
  name: string;
  description: string;
  defaultKey: string;
  defaultModifiers: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  };
  customKey?: string;
  customModifiers?: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  };
  category: 'chat' | 'navigation' | 'actions' | 'selection';
}

interface GlobalShortcutAction {
  id: string;
  action: () => void;
}

interface UseIndexKeyboardShortcutsParams {
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  setCurrentView: (viewId: string) => void;
}

interface UseKeyboardHeightResult {
  keyboardHeight: number;
  isKeyboardOpen: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// CUSTOM SHORTCUTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'custom-keyboard-shortcuts';

/** Manages custom keyboard shortcuts with persistent storage. */
export function useCustomShortcutsManagement() {
  const [shortcuts, setShortcuts] = useState<ShortcutBinding[]>(DEFAULT_SHORTCUTS);
  const [isRecording, setIsRecording] = useState<string | null>(null);
  const [pendingShortcut, setPendingShortcut] = useState<{
    key: string;
    modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };
  } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const customBindings = JSON.parse(stored) as Record<
          string,
          { key: string; modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } }
        >;
        setShortcuts((prev) =>
          prev.map((shortcut) => {
            const custom = customBindings[shortcut.id];
            if (custom) {
              return { ...shortcut, customKey: custom.key, customModifiers: custom.modifiers };
            }
            return shortcut;
          })
        );
      } catch (e) {
        log.error('Failed to parse stored shortcuts:', e);
      }
    }
  }, []);

  const saveShortcuts = useCallback((updatedShortcuts: ShortcutBinding[]) => {
    const customBindings: Record<
      string,
      { key: string; modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } }
    > = {};
    updatedShortcuts.forEach((shortcut) => {
      if (shortcut.customKey) {
        customBindings[shortcut.id] = { key: shortcut.customKey, modifiers: shortcut.customModifiers || {} };
      }
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customBindings));
    } catch {
      // storage unavailable
    }
  }, []);

  const updateShortcut = useCallback(
    (
      id: string,
      key: string,
      modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }
    ) => {
      setShortcuts((prev) => {
        const updated = prev.map((shortcut) =>
          shortcut.id === id ? { ...shortcut, customKey: key, customModifiers: modifiers } : shortcut
        );
        saveShortcuts(updated);
        return updated;
      });
    },
    [saveShortcuts]
  );

  const resetShortcut = useCallback(
    (id: string) => {
      setShortcuts((prev) => {
        const updated = prev.map((shortcut) =>
          shortcut.id === id ? { ...shortcut, customKey: undefined, customModifiers: undefined } : shortcut
        );
        saveShortcuts(updated);
        return updated;
      });
    },
    [saveShortcuts]
  );

  const resetAllShortcuts = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getActiveBinding = useCallback((shortcut: ShortcutBinding) => ({
    key: shortcut.customKey || shortcut.defaultKey,
    modifiers: shortcut.customModifiers || shortcut.defaultModifiers,
  }), []);

  const getShortcutById = useCallback((id: string) => shortcuts.find((s) => s.id === id), [shortcuts]);

  const formatShortcut = useCallback(
    (shortcut: ShortcutBinding) => {
      const binding = getActiveBinding(shortcut);
      const parts: string[] = [];
      if (binding.modifiers.ctrlKey) parts.push('Ctrl');
      if (binding.modifiers.shiftKey) parts.push('Shift');
      if (binding.modifiers.altKey) parts.push('Alt');
      parts.push(binding.key === ' ' ? 'Space' : binding.key);
      return parts;
    },
    [getActiveBinding]
  );

  const startRecording = useCallback((id: string) => {
    setIsRecording(id);
    setPendingShortcut(null);
  }, []);

  const stopRecording = useCallback(() => {
    if (isRecording && pendingShortcut) updateShortcut(isRecording, pendingShortcut.key, pendingShortcut.modifiers);
    setIsRecording(null);
    setPendingShortcut(null);
  }, [isRecording, pendingShortcut, updateShortcut]);

  const cancelRecording = useCallback(() => {
    setIsRecording(null);
    setPendingShortcut(null);
  }, []);

  const recordKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (!isRecording) return;
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
      event.preventDefault();
      setPendingShortcut({
        key: event.key,
        modifiers: {
          ctrlKey: event.ctrlKey || undefined,
          shiftKey: event.shiftKey || undefined,
          altKey: event.altKey || undefined,
        },
      });
    },
    [isRecording]
  );

  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', recordKeyPress);
      return () => window.removeEventListener('keydown', recordKeyPress);
    }
  }, [isRecording, recordKeyPress]);

  const checkConflict = useCallback(
    (id: string, key: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) => {
      return shortcuts.find((s) => {
        if (s.id === id) return false;
        const binding = getActiveBinding(s);
        return (
          binding.key.toLowerCase() === key.toLowerCase() &&
          !!binding.modifiers.ctrlKey === !!modifiers.ctrlKey &&
          !!binding.modifiers.shiftKey === !!modifiers.shiftKey &&
          !!binding.modifiers.altKey === !!modifiers.altKey
        );
      });
    },
    [shortcuts, getActiveBinding]
  );

  return {
    shortcuts,
    isRecording,
    pendingShortcut,
    updateShortcut,
    resetShortcut,
    resetAllShortcuts,
    getActiveBinding,
    getShortcutById,
    formatShortcut,
    startRecording,
    stopRecording,
    cancelRecording,
    checkConflict,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// GLOBAL KEYBOARD SHORTCUTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

const STATIC_ACTIONS: Record<string, () => void> = {
  'global-search': () => {
    document.dispatchEvent(new CustomEvent('open-global-search'));
  },
  'toggle-theme': () => {
    document.dispatchEvent(new CustomEvent('toggle-theme'));
  },
  'show-shortcuts-help': () => {
    document.dispatchEvent(new CustomEvent('show-shortcuts-help'));
  },
  'refresh-data': () => {
    window.location.reload();
  },
  'toggle-sidebar': () => {
    document.dispatchEvent(new CustomEvent('toggle-sidebar'));
  },
  'quick-compose': () => {
    document.dispatchEvent(new CustomEvent('quick-compose'));
  },
  'toggle-notifications': () => {
    document.dispatchEvent(new CustomEvent('toggle-notifications'));
  },
};

/** Manages global keyboard shortcuts with conflict detection and custom action binding. */
export function useGlobalKeyboardShortcutsManagement(customActions?: GlobalShortcutAction[]) {
  const navigate = useNavigate();
  const { shortcuts, getActiveBinding } = useCustomShortcutsManagement();

  const defaultActions = useMemo(
    () => ({
      ...STATIC_ACTIONS,
      'go-to-inbox': () => {
        navigate('/');
        toast.info('📥 Inbox', { duration: 1500 });
      },
      'go-to-dashboard': () => {
        navigate('/');
        toast.info('📊 Dashboard', { duration: 1500 });
      },
      'go-to-contacts': () => {
        navigate('/');
        toast.info('👥 Contatos', { duration: 1500 });
      },
      'go-to-settings': () => {
        navigate('/');
        toast.info('⚙️ Configurações', { duration: 1500 });
      },
    }),
    [navigate]
  );

  const actions = useMemo(() => {
    const merged = { ...defaultActions };
    customActions?.forEach(({ id, action }) => {
      merged[id] = action;
    });
    return merged;
  }, [defaultActions, customActions]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      const allowedInInputs = ['global-search', 'clear-selection', 'show-shortcuts-help'];

      for (const shortcut of shortcuts) {
        const binding = getActiveBinding(shortcut);

        if (!binding.key || !event.key) continue;
        const keyMatches = event.key.toLowerCase() === binding.key.toLowerCase();
        const ctrlMatches = !!event.ctrlKey === !!binding.modifiers.ctrlKey;
        const shiftMatches = !!event.shiftKey === !!binding.modifiers.shiftKey;
        const altMatches = !!event.altKey === !!binding.modifiers.altKey;

        if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
          if (isInput && !allowedInInputs.includes(shortcut.id)) {
            continue;
          }

          const action = actions[shortcut.id];
          if (action) {
            event.preventDefault();
            event.stopPropagation();
            action();
            return;
          }
        }
      }
    },
    [shortcuts, getActiveBinding, actions]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  return { shortcuts };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// INDEX KEYBOARD SHORTCUTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Manages keyboard shortcuts for navigation in index view with history and escape handling. */
export function useIndexKeyboardShortcutsManagement(params: UseIndexKeyboardShortcutsParams) {
  const { goBack, goForward, canGoBack, setCurrentView } = params;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      } else if (e.key === 'Escape' && !isInput) {
        const hasOpenDialog = document.querySelector('[data-state="open"][role="dialog"]');
        if (!hasOpenDialog && canGoBack) {
          goBack();
        }
      } else if (e.altKey && e.key === 'Home') {
        e.preventDefault();
        setCurrentView('inbox');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goBack, goForward, canGoBack, setCurrentView]);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// KEYBOARD HEIGHT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Tracks mobile keyboard height and open state using VisualViewport API. */
export function useKeyboardHeightManagement(): UseKeyboardHeightResult {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      const diff = window.innerHeight - vv.height;
      const kbHeight = Math.max(0, diff);
      setKeyboardHeight(kbHeight);
      setIsKeyboardOpen(kbHeight > 50);
    };

    vv.addEventListener('resize', handleResize);
    vv.addEventListener('scroll', handleResize);

    return () => {
      vv.removeEventListener('resize', handleResize);
      vv.removeEventListener('scroll', handleResize);
    };
  }, []);

  return { keyboardHeight, isKeyboardOpen };
}
