import { describe, expect, it, vi } from 'vitest';

import {
  applyInboxFilters,
  computeInboxTabCounts,
  type ApplyInboxFiltersOptions,
} from '../inboxFilterPipeline';
import type { ConversationWithMessages, RealtimeMessage } from '../realtime/types';
import type { InboxFiltersState } from '../../components/InboxFilters';

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
  isArchived: boolean = false,
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
    isArchived,
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
    const options = buildOptions(conversations, { subTab: 'waiting' });

    const attending = applyInboxFilters({ ...options, subTab: 'attending' });
    const waiting = applyInboxFilters({ ...options, subTab: 'waiting' });
    const counts = computeInboxTabCounts(options);

    expect(attending).toHaveLength(0);
    expect(waiting.map((conversation) => conversation.contact.id)).toEqual(['c1', 'c2']);
    // open reflete o subTab ativo (waiting) para casar 1:1 com a lista visível
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
    // subTab default 'attending' → open casa com attending (2), não união
    expect(counts).toMatchObject({ open: 2, attending: 2, waiting: 1 });
  });

  it('preserva conversas carregadas quando permissões de canal ainda estão desidratadas', () => {
    const conversations = [
      buildConversation('c1', null, 1),
      buildConversation('c2', null, 1),
    ];
    const options = buildOptions(conversations, {
      subTab: 'waiting',
      hasPermission: () => false,
      permissionsLoading: false,
      enforceChannelPermissions: false,
    });

    const waiting = applyInboxFilters({ ...options, subTab: 'waiting' });
    const counts = computeInboxTabCounts(options);

    expect(waiting.map((conversation) => conversation.contact.id)).toEqual(['c1', 'c2']);
    expect(counts).toMatchObject({ open: 2, attending: 0, waiting: 2, unread: 2 });
  });

  it('não derruba conversas WhatsApp durante carregamento das permissões de canal', () => {
    const conversations = [
      buildConversation('c1', null, 1),
      buildConversation('c2', null, 1),
    ];
    const options = buildOptions(conversations, {
      subTab: 'waiting',
      hasPermission: () => false,
      permissionsLoading: true,
      enforceChannelPermissions: true,
    });

    const visible = applyInboxFilters(options);
    const counts = computeInboxTabCounts(options);

    expect(visible.map((conversation) => conversation.contact.id)).toEqual(['c1', 'c2']);
    expect(counts).toMatchObject({ open: 2, attending: 0, waiting: 2, unread: 2 });
  });

  it('aplica bloqueio por canal somente quando o gate de permissões está hidratado', () => {
    const conversations = [
      buildConversation('c1', null, 1),
      buildConversation('c2', null, 1),
    ];
    const options = buildOptions(conversations, {
      subTab: 'waiting',
      hasPermission: () => false,
      permissionsLoading: false,
      enforceChannelPermissions: true,
    });

    const visible = applyInboxFilters(options);
    const counts = computeInboxTabCounts(options);

    expect(visible).toHaveLength(0);
    expect(counts).toMatchObject({ open: 0, attending: 0, waiting: 0, unread: 0 });
  });
});

describe('inboxFilterPipeline — gate archivedTab (aba Arquivadas)', () => {
  const ids = (conversations: ConversationWithMessages[]) =>
    conversations.map((c) => c.contact.id);

  it('archivedTab=true retorna SOMENTE conversas com isArchived===true', () => {
    const conversations = [
      buildConversation('c1', 'agent-1', 1, 'whatsapp', true),
      buildConversation('c2', 'agent-2', 0, 'whatsapp', false),
      buildConversation('c3', null, 0, 'instagram', true),
    ];

    const result = applyInboxFilters(buildOptions(conversations, { archivedTab: true }));

    expect(ids(result)).toEqual(['c1', 'c3']);
  });

  it('archivedTab=true ignora mainTab/subTab/statusFilter/scope/queue/tags/agent/date/contactType/failure', () => {
    const conversations = [
      buildConversation('c1', 'agent-1', 0, 'whatsapp', true), // resolvida via ticketStates
      buildConversation('c2', null, 1, 'whatsapp', true), // sem responsável + não lida
      buildConversation('c3', 'agent-9', 0, 'whatsapp', true), // outro agente/queue/lead
      buildConversation('c4', 'agent-1', 0, 'whatsapp', false), // NÃO arquivada
    ];
    const options = buildOptions(conversations, {
      archivedTab: true,
      mainTab: 'resolved',
      subTab: 'attending',
      statusFilter: 'unread',
      scope: 'mine',
      showAll: false,
      selectedQueueId: 'queue-x',
      selectedContactType: 'lead',
      showOnlyRetrying: true,
      failureCategoryFilter: 'auth',
      filters: {
        status: ['unread'],
        tags: ['tag-x'],
        agentId: 'agent-1',
        dateRange: { from: new Date('2020-01-01'), to: new Date('2020-01-02') },
      },
      contactTagsMap: { c1: ['tag-x'] },
      ticketStates: { c1: { status: 'resolved' } },
    });

    // Se qualquer filtro vazasse, o resultado seria subconjunto próprio (ex.: só c1)
    const resolvedTab = applyInboxFilters({ ...options, mainTab: 'resolved' });
    expect(ids(resolvedTab).sort()).toEqual(['c1', 'c2', 'c3']);

    // mainTab unread + statusFilter unread + subTab waiting também são ignorados
    const unreadTab = applyInboxFilters({ ...options, mainTab: 'unread', subTab: 'waiting' });
    expect(ids(unreadTab).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('archivedTab=true + busca por nome filtra dentro dos arquivados', () => {
    const conversations = [
      buildConversation('c1', null, 0, 'whatsapp', true),
      buildConversation('c2', null, 0, 'whatsapp', true),
      buildConversation('c3', null, 0, 'whatsapp', false), // não arquivada que casaria com a busca
    ];

    const result = applyInboxFilters(
      buildOptions(conversations, { archivedTab: true, search: 'Contato c2' })
    );

    expect(ids(result)).toEqual(['c2']);
  });

  it('archivedTab=true + busca por telefone (dígitos) filtra dentro dos arquivados', () => {
    const conversations = [
      buildConversation('c1', null, 0, 'whatsapp', true), // phone 550000000c1 → dígitos 5500000001
      buildConversation('c2', null, 0, 'whatsapp', true), // phone 550000000c2 → dígitos 5500000002
      buildConversation('c3', null, 0, 'whatsapp', false),
    ];

    const result = applyInboxFilters(
      buildOptions(conversations, { archivedTab: true, search: '5500000002' })
    );

    expect(ids(result)).toEqual(['c2']);
  });

  it('archivedTab=true também respeita externalSearch dentro dos arquivados', () => {
    const conversations = [
      buildConversation('c1', null, 0, 'whatsapp', true),
      buildConversation('c2', null, 0, 'whatsapp', true),
    ];

    const result = applyInboxFilters(
      buildOptions(conversations, { archivedTab: true, externalSearch: 'Contato c1' })
    );

    expect(ids(result)).toEqual(['c1']);
  });

  it('archivedTab=false (default) exclui arquivadas das abas open/resolved/unread', () => {
    const conversations = [
      buildConversation('c1', 'agent-1', 1, 'whatsapp', false),
      buildConversation('c2', 'agent-1', 1, 'whatsapp', true),
      buildConversation('c3', 'agent-1', 0, 'whatsapp', true),
    ];
    const ticketStates = { c3: { status: 'resolved' } };

    const open = applyInboxFilters(
      buildOptions(conversations, { mainTab: 'open', subTab: 'attending', ticketStates })
    );
    expect(ids(open)).toEqual(['c1']);

    const resolved = applyInboxFilters(
      buildOptions(conversations, { mainTab: 'resolved', ticketStates })
    );
    expect(ids(resolved)).toEqual([]);

    const unread = applyInboxFilters(
      buildOptions(conversations, { mainTab: 'unread', ticketStates })
    );
    expect(ids(unread)).toEqual(['c1']);
  });

  it('archivedTab=false (default): busca não ressuscita arquivadas', () => {
    const conversations = [
      buildConversation('c1', null, 0, 'whatsapp', false),
      buildConversation('c2', null, 0, 'whatsapp', true),
    ];

    const matchingArchived = applyInboxFilters(buildOptions(conversations, { search: 'Contato c2' }));
    expect(matchingArchived).toHaveLength(0);

    const matchingNormal = applyInboxFilters(buildOptions(conversations, { search: 'Contato c1' }));
    expect(ids(matchingNormal)).toEqual(['c1']);
  });

  it('computeInboxTabCounts mantém contadores normais (não-arquivadas) mesmo com archivedTab=true', () => {
    const conversations = [
      buildConversation('c1', 'agent-1', 1, 'whatsapp', false),
      buildConversation('c2', 'agent-1', 1, 'whatsapp', true),
      buildConversation('c3', null, 0, 'whatsapp', true),
    ];
    const options = buildOptions(conversations, { archivedTab: true, subTab: 'attending' });

    const counts = computeInboxTabCounts(options);

    expect(counts).toMatchObject({ open: 1, attending: 1, waiting: 0, resolved: 0, unread: 1 });
  });

  it('preserva ordenação por lastMessage desc na aba arquivada', () => {
    const c1 = buildConversation('c1', null, 0, 'whatsapp', true);
    const c2 = buildConversation('c2', null, 0, 'whatsapp', true);
    const c3 = buildConversation('c3', null, 0, 'whatsapp', true);
    c1.lastMessage = { ...c1.lastMessage!, created_at: '2026-07-25T10:00:00.000Z' };
    c2.lastMessage = { ...c2.lastMessage!, created_at: '2026-07-26T10:00:00.000Z' };
    c3.lastMessage = { ...c3.lastMessage!, created_at: '2026-07-24T10:00:00.000Z' };

    const result = applyInboxFilters(buildOptions([c1, c2, c3], { archivedTab: true }));

    expect(ids(result)).toEqual(['c2', 'c1', 'c3']);

    // sortBy alternativos continuam funcionando na aba arquivada
    const byName = applyInboxFilters(
      buildOptions([c1, c2, c3], { archivedTab: true, sortBy: 'name' })
    );
    expect(ids(byName)).toEqual(['c1', 'c2', 'c3']);
  });

  it('conversa sem campo isArchived (undefined) é tratada como NÃO arquivada e não quebra', () => {
    const c1 = buildConversation('c1', 'agent-1', 1, 'whatsapp', true);
    const c2 = buildConversation('c2', 'agent-1', 1, 'whatsapp');
    const c3 = buildConversation('c3', 'agent-1', 0, 'whatsapp', true);
    // remove o campo para simular payload antigo sem isArchived
    delete (c2 as Partial<ConversationWithMessages>).isArchived;

    const normal = applyInboxFilters(
      buildOptions([c1, c2, c3], { mainTab: 'open', subTab: 'attending' })
    );
    expect(ids(normal)).toEqual(['c2']);

    const archived = applyInboxFilters(buildOptions([c1, c2, c3], { archivedTab: true }));
    expect(ids(archived)).toEqual(['c1', 'c3']);
  });

  it('archivedTab=true sem nenhuma arquivada retorna lista vazia', () => {
    const conversations = [
      buildConversation('c1', null, 0, 'whatsapp', false),
      buildConversation('c2', null, 1, 'whatsapp', false),
    ];

    const result = applyInboxFilters(buildOptions(conversations, { archivedTab: true }));

    expect(result).toEqual([]);
  });
});
