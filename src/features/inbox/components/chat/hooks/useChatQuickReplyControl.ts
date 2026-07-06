import { useCallback, useMemo, useState } from 'react';

interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  category: string;
}

interface Params {
  inputValue: string;
  dbQuickReplies: QuickReply[];
  quickRepliesOpen: boolean;
  openQuickReplies: () => void;
  closeQuickReplies: () => void;
  slashCommandsOpen: boolean;
  setInputValue: (v: string) => void;
  focusInput: () => void;
  incrementUseCount: (id: string) => void;
  baseHandleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  baseHandleKeyDown: (e: React.KeyboardEvent, slashOpen: boolean) => void;
}

/**
 * Centralizes the quick-reply UX: filtering by "/" prefix, arrow-key
 * navigation, Enter to pick and syncing overlay open/close with input value.
 */
export function useChatQuickReplyControl({
  inputValue,
  dbQuickReplies,
  quickRepliesOpen,
  openQuickReplies,
  closeQuickReplies,
  slashCommandsOpen,
  setInputValue,
  focusInput,
  incrementUseCount,
  baseHandleInputChange,
  baseHandleKeyDown,
}: Params) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!inputValue.startsWith('/')) return [];
    const q = inputValue.slice(1).toLowerCase();
    return dbQuickReplies.filter(
      (r) => r.shortcut.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)
    );
  }, [dbQuickReplies, inputValue]);

  const handleQuickReply = useCallback(
    (reply: QuickReply) => {
      setInputValue(reply.content);
      closeQuickReplies();
      setTimeout(() => focusInput(), 10);
      incrementUseCount(reply.id);
    },
    [setInputValue, closeQuickReplies, focusInput, incrementUseCount]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (quickRepliesOpen && filtered.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((p) => (p + 1) % filtered.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((p) => (p - 1 + filtered.length) % filtered.length);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const sel = filtered[selectedIndex];
          if (sel) handleQuickReply(sel);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeQuickReplies();
          return;
        }
      }
      baseHandleKeyDown(e, slashCommandsOpen);
    },
    [
      quickRepliesOpen,
      filtered,
      selectedIndex,
      handleQuickReply,
      closeQuickReplies,
      baseHandleKeyDown,
      slashCommandsOpen,
    ]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      baseHandleInputChange(e);
      if (value.startsWith('/')) {
        if (!quickRepliesOpen) openQuickReplies();
        setSelectedIndex(0);
      } else if (quickRepliesOpen) {
        closeQuickReplies();
      }
    },
    [baseHandleInputChange, quickRepliesOpen, openQuickReplies, closeQuickReplies]
  );

  return { filtered, selectedIndex, handleQuickReply, handleKeyDown, handleInputChange };
}
