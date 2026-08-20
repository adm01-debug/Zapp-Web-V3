import { useHotkeys } from 'react-hotkeys-hook';

interface UseInboxShortcutsProps {
  onSearchFocus: () => void;
  onNextConversation: () => void;
  onPrevConversation: () => void;
  onArchive: () => void;
  /** Quando false, este consumidor cede o Mod+E (evita registro duplo Sidebar+ChatPanel). */
  enableArchive?: boolean;
  onTransfer: () => void;
  onRefresh: () => void;
  onSearchFocusChat?: () => void;
  enabled?: boolean;
}

/** Registers inbox keyboard shortcuts: Mod+K/slash for search, Alt+Up/Down for navigation, Mod+E archive, Mod+Shift+T transfer, Mod+R refresh, Mod+F chat search. */
export function useInboxShortcuts({
  onSearchFocus,
  onNextConversation,
  onPrevConversation,
  onArchive,
  enableArchive = true,
  onTransfer,
  onRefresh,
  onSearchFocusChat,
  enabled = true,
}: UseInboxShortcutsProps) {
  // Focus search: Cmd+K or Ctrl+K
  useHotkeys(
    ['mod+k', '/'],
    (e) => {
      e.preventDefault();
      onSearchFocus();
    },
    {
      enabled,
      // E40.6: '/' só casa via `key` (o lib compara `event.code` por padrão —
      // code 'Slash' nunca casa com a hotkey '/', deixando o atalho morto).
      useKey: true,
    }
  );

  // Navigation: Alt + Up/Down
  useHotkeys(
    'alt+up',
    (e) => {
      e.preventDefault();
      onPrevConversation();
    },
    { enabled }
  );

  useHotkeys(
    'alt+down',
    (e) => {
      e.preventDefault();
      onNextConversation();
    },
    { enabled }
  );

  // Actions
  useHotkeys(
    'mod+e',
    (e) => {
      e.preventDefault();
      onArchive();
    },
    { enabled: enabled && enableArchive }
  );

  useHotkeys(
    'mod+shift+t',
    (e) => {
      e.preventDefault();
      onTransfer();
    },
    { enabled }
  );

  useHotkeys(
    'mod+r',
    (e) => {
      e.preventDefault();
      onRefresh();
    },
    { enabled }
  );

  // Chat Search: Cmd+F or Ctrl+F
  useHotkeys(
    'mod+f',
    (e) => {
      if (onSearchFocusChat) {
        e.preventDefault();
        onSearchFocusChat();
      }
    },
    { enabled }
  );
}
