import { useState, useMemo } from 'react';
import type { ConversationWithMessages, ConversationContact } from './types';

/** Provides client-side search, status-filter, and sort controls over a conversation list; returns the filtered/sorted result and the setter callbacks. */
export function useConversationsFilter(conversations: ConversationWithMessages[]) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'unread'>('all');
  const [sortBy, setSortBy] = useState<'lastMessage' | 'name' | 'unread'>('lastMessage');

  const filteredConversations = useMemo(() => {
    let filtered = [...conversations];

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (conv) =>
          conv.contact.name.toLowerCase().includes(q) ||
          conv.contact.phone.includes(q) ||
          conv.lastMessage?.content?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((conv) => {
        if (statusFilter === 'unread') return conv.unreadCount > 0;
        if (statusFilter === 'open') {
          return (
            !conv.lastMessage ||
            conv.lastMessage.sender === 'contact' ||
            (conv.contact as ConversationContact & { routing_status?: string }).routing_status ===
              'pending'
          );
        }
        if (statusFilter === 'closed') {
          return (
            conv.lastMessage?.sender === 'agent' &&
            (conv.contact as ConversationContact & { routing_status?: string }).routing_status !==
              'pending'
          );
        }
        return true;
      });
    }

    filtered.sort((a, b) => {
      if (sortBy === 'unread') {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      }
      if (sortBy === 'name') {
        return a.contact.name.localeCompare(b.contact.name);
      }
      const aTime = a.lastMessage
        ? new Date(a.lastMessage.created_at).getTime()
        : new Date(a.contact.created_at).getTime();
      const bTime = b.lastMessage
        ? new Date(b.lastMessage.created_at).getTime()
        : new Date(b.contact.created_at).getTime();
      return bTime - aTime;
    });

    return filtered;
  }, [conversations, search, statusFilter, sortBy]);

  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    filteredConversations,
  };
}
