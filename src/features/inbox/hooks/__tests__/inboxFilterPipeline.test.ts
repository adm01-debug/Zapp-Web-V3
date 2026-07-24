import { describe, expect, it, vi } from 'vitest';

import {
  applyInboxFilters,
  computeInboxTabCounts,
  type ApplyInboxFiltersOptions,
} from '../inboxFilterPipeline';
import type { ConversationWithMessages, RealtimeMessage } from '@/features/inbox/hooks/realtime/types';
import type { InboxFiltersState } from '@/features/inbox/components/InboxFilters';

vi.mock('@/features/inbox', () => ({
  filterByContactType: (conversations: ConversationWithMessages[], type: string | null) => {
    if (!type) return conversations;
    return conversations.filter((conversation) => conversation.contact.contact_type === type);
  },
}));

const BASE_FILTERS: InboxFiltersState = {
  status: [],
  tags: [],
  agentId: null,
  dateRange: { from: null, to: null },
};

function buildMessage(id: string, contactId: string, createdAt: string): RealtimeMessage {
  return {
    id,
    contact_id: contactId,
    agent_id: null,
    content: `Mensagem ${id}`,
    sender: 'contact',
    message_type: 'text',
    media_url: null,
    is_read: false,
    status: 'delivered',
    status_updated_at: createdAt,
    created_at: createdAt,
    updated_at: createdAt,
    external_id: null,
    whatsapp_connection_id: 'wpp_pink_test',
    transcription: null,
    transcription_status: null,
    is_deleted: false,
  };
}

function buildConversation(
  id: string,
  assignedTo: string | null,
  unreadCount: number,
  channelType = 'whatsapp',
): ConversationWithMessages {
  const createdAt = '2026-07-24T12:00:00.000Z';
  const lastMessage = buildMessage(`m-${id}`, id, createdAt);

  return {
    contact: {
      id,
      name: `Contato ${id}`,
      surname: null,
      nickname: null,
      phone: `550000000${id}`,
      email: null,
      avatar_url: null,
      tags: null,
      company: null,
      job_title: null,
      assigned_to: assignedTo,
      queue_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      whatsapp_connection_id: 'wpp_pink_test',
      contact_type: 'cliente',
      group_category: null,
      ai_sentiment: null,
      channel_type: channelType,
      channel_connection_id: null,
    },
    messages: [lastMessage],
    unreadCount,
    lastMessage,
  };
}

function buildOptions(
  conversations: ConversationWithMessages[],
  overrides: Partial<ApplyInboxFiltersOptions> = {},
): ApplyInboxFiltersOptions {
  return {
    conversations,
    profileId: 'agent-1',
    externalSearch: undefined,
    search: '',
    sortBy: 'lastMessage',
    statusFilter: 'all',
    mainTab: 'open',
    subTab: 'attending',
    showAll: false,
    scope: 'mine',
    departmentAgentIds: ['agent-1', 'agent-2'],
    selectedQueueId: null,
    selectedContactType: null,
    showOnlyRetrying: false,
    failureCategoryFilter: 'all',
    failureCategoryById: {},
    filters: BASE_FILTERS,
    contactTagsMap: {},
    ticketStates: {},
    customScopes: [],
    hasPermission: (permission) =>
      [
        'inbox.view_whatsapp',
        'inbox.view_instagram',
        'inbox.view_chat',
        'inbox.view_department',
        'inbox.view_all',
      ].includes(permission),
    permissionsLoading: false,
    ...overrides,
  };
}

describe('inboxFilterPipeline — visibilidade de conversas aguardando', () => {
  it('mantém conversas sem responsável na aba Aguardando quando Atendendo está vazio', () => {
    const conversations = [
      buildConversation('c1', null, 1),
      buildConversation('c2', null, 1),
    ];
    const options = buildOptions(conversations);

    const attending = applyInboxFilters({ ...options, subTab: 'attending' });
    const waiting = applyInboxFilters({ ...options, subTab: 'waiting' });
    const counts = computeInboxTabCounts(options);

    expect(attending).toHaveLength(0);
    expect(waiting.map((conversation) => conversation.contact.id)).toEqual(['c1', 'c2']);
    expect(counts).toMatchObject({ open: 2, attending: 0, waiting: 2, unread: 2 });
  });

  it('não mistura conversas aguardando dentro de Atendendo mesmo com escopo global', () => {
    const conversations = [
      buildConversation('c1', 'agent-1', 0),
      buildConversation('c2', null, 0),
      buildConversation('c3', 'agent-2', 0),
    ];
    const options = buildOptions(conversations, { scope: 'all', showAll: true });

    const attending = applyInboxFilters({ ...options, subTab: 'attending' });
    const waiting = applyInboxFilters({ ...options, subTab: 'waiting' });
    const counts = computeInboxTabCounts(options);

    expect(attending.map((conversation) => conversation.contact.id)).toEqual(['c1', 'c3']);
    expect(waiting.map((conversation) => conversation.contact.id)).toEqual(['c2']);
    expect(counts).toMatchObject({ open: 3, attending: 2, waiting: 1 });
  });

  it('preserva conversas carregadas quando permissões de canal ainda estão desidratadas', () => {
    const conversations = [
      buildConversation('c1', null, 1),
      buildConversation('c2', null, 1),
    ];
    const options = buildOptions(conversations, {
      hasPermission: () => false,
      permissionsLoading: false,
      enforceChannelPermissions: false,
    });

    const waiting = applyInboxFilters({ ...options, subTab: 'waiting' });
    const counts = computeInboxTabCounts(options);

    expect(waiting.map((conversation) => conversation.contact.id)).toEqual(['c1', 'c2']);
    expect(counts).toMatchObject({ open: 2, attending: 0, waiting: 2, unread: 2 });
  });
});