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
}: UseInboxShortcutsProps) {
  // Focus search: Cmd+K or Ctrl+K
  useHotkeys(['mod+k', '/'], (e) => {
    e.preventDefault();
    onSearchFocus();
  }, { enabled });

  // Navigation: Alt + Up/Down
  useHotkeys('alt+up', (e) => {
    e.preventDefault();
    onPrevConversation();
  }, { enabled });

  useHotkeys('alt+down', (e) => {
    e.preventDefault();
    onNextConversation();
  }, { enabled });

  // Actions
  useHotkeys('mod+e', (e) => {
    e.preventDefault();
    onArchive();
  }, { enabled });

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
