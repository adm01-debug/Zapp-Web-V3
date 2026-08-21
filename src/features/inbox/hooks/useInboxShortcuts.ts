import { useHotkeys } from 'react-hotkeys-hook';

interface UseInboxShortcutsProps {
  onSearchFocus: () => void;
  onNextConversation: () => void;
  onPrevConversation: () => void;
  onArchive: () => void;
  onTransfer: () => void;
  onRefresh: () => void;
  onSearchFocusChat?: () => void;
  enabled?: boolean;
  /** Controla independentemente o Mod+E (arquivo). Permite que apenas um
   *  componente (ChatPanel ou Sidebar) possua o atalho em cada momento,
   *  evitando duplo disparo quando ambos estão montados. */
  archiveEnabled?: boolean;
}

/** Registers inbox keyboard shortcuts: Mod+K/slash for search, Alt+Up/Down for navigation, Mod+E archive, Mod+Shift+T transfer, Mod+R refresh, Mod+F chat search. */
export function useInboxShortcuts({
  onSearchFocus,
  onNextConversation,
  onPrevConversation,
  onArchive,
  onTransfer,
  onRefresh,
  onSearchFocusChat,
  enabled = true,
  archiveEnabled,
}: UseInboxShortcutsProps) {
  // Focus search: Cmd+K or Ctrl+K
  useHotkeys(['mod+k', '/'], (e) => {
    e.preventDefault();
    onSearchFocus();
  }, {
    enabled,
    // E40.6: '/' só casa via `key` (o lib compara `event.code` por padrão —
    // code 'Slash' nunca casa com a hotkey '/', deixando o atalho morto).
    useKey: true,
  });

  // Navigation: Alt + Up/Down
  useHotkeys('alt+up', (e) => {
    e.preventDefault();
    onPrevConversation();
  }, { enabled });

  useHotkeys('alt+down', (e) => {
    e.preventDefault();
    onNextConversation();
  }, { enabled });

  // Mod+E — um único dono: quando ChatPanel está montado (conversa selecionada),
  // o Sidebar desativa este atalho via archiveEnabled=false, evitando duplo disparo.
  useHotkeys('mod+e', (e) => {
    e.preventDefault();
    onArchive();
  }, { enabled: enabled && (archiveEnabled ?? true) });

  useHotkeys('mod+shift+t', (e) => {
    e.preventDefault();
    onTransfer();
  }, { enabled });

  useHotkeys('mod+r', (e) => {
    e.preventDefault();
    onRefresh();
  }, { enabled });

  // Chat Search: Cmd+F or Ctrl+F
  useHotkeys('mod+f', (e) => {
    if (onSearchFocusChat) {
      e.preventDefault();
      onSearchFocusChat();
    }
  }, { enabled });
}
