/**
 * archivedScenarios.simulacao.test.ts — Simulação de 8 cenários de falha/comportamento
 * dos CHATS ARQUIVADOS (PR PR 773).
 *
 * Estratégia: lógica pura, SEM Supabase. Os cenários exercitam o contrato real:
 *   - buildConversation/buildConversations (realtime/realtimeUtils.ts):
 *     isArchived derivado de contact.deleted_at.
 *   - applyInboxFilters/computeInboxTabCounts (inboxFilterPipeline.ts):
 *     gate archivedTab (true → SÓ arquivadas; false → exclui arquivadas).
 *   - contactsRepository.archive/updateStatusBulk: soft-delete que NÃO mexe em
 *     assigned_to (verificado por contrato de fonte + simulação fiel do patch).
 *   - useArchiveConversationActions: guarda só contra id vazio (Cenário H).
 *
 * Simulações espelham exatamente os patches reais do repositório:
 *   archive  → { deleted_at: ISO } (só deleted_at — a view contacts não expõe
 *              deleted_reason/deleted_by)
 *   restore  → { deleted_at: null }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  applyInboxFilters,
  computeInboxTabCounts,
  type ApplyInboxFiltersOptions,
} from '../inboxFilterPipeline';
import {
  buildConversation,
  buildConversations,
} from '../realtime/realtimeUtils';
import { useArchiveConversationActions } from '../useArchiveConversationActions';
import type { ConversationContact, ConversationWithMessages, RealtimeMessage } from '../realtime/types';
import type { InboxFiltersState } from '../../components/InboxFilters';

vi.mock('@/features/inbox', () => ({
  filterByContactType: (conversations: ConversationWithMessages[], type: string | null) => {
    if (!type) return conversations;
    return conversations.filter((conversation) => conversation.contact.contact_type === type);
  },
}));

// Mocks de mutação do Cenário H (precisam de vi.hoisted por causa do hoisting do vi.mock)
const { mockArchiveMutate, mockRestoreMutate } = vi.hoisted(() => ({
  mockArchiveMutate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockRestoreMutate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('@/services/contacts/useContactsMutations', () => ({
  useArchiveContact: () => ({ mutateAsync: mockArchiveMutate }),
  useRestoreContact: () => ({ mutateAsync: mockRestoreMutate }),
}));

// ===== Fixtures locais =====

const BASE_FILTERS: InboxFiltersState = {
  status: [],
  tags: [],
  agentId: null,
  dateRange: { from: null, to: null },
};

let seq = 0;
function makeContact(overrides: Partial<ConversationContact> = {}): ConversationContact {
  seq += 1;
  const id = overrides.id ?? `contact-${seq}`;
  return {
    id,
    name: overrides.name ?? `Contato ${seq}`,
    surname: null,
    nickname: null,
    phone: `551199999${String(seq).padStart(4, '0')}`,
    email: null,
    avatar_url: null,
    tags: null,
    company: null,
    job_title: null,
    assigned_to: null,
    queue_id: null,
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-01T10:00:00.000Z',
    deleted_at: null,
    whatsapp_connection_id: 'wpp_pink_test',
    contact_type: 'cliente',
    group_category: null,
    ai_sentiment: null,
    channel_type: 'whatsapp',
    channel_connection_id: null,
    ...overrides,
  };
}

function makeMessage(
  id: string,
  contactId: string,
  createdAt: string,
  overrides: Partial<RealtimeMessage> = {}
): RealtimeMessage {
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
    ...overrides,
  };
}

function buildOptions(
  conversations: ConversationWithMessages[],
  overrides: Partial<ApplyInboxFiltersOptions> = {}
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

/**
 * Simulação fiel do patch real de contactsRepository.updateStatusBulk:
 * 'archived' → { deleted_at: ISO } (NÃO toca assigned_to; a view contacts só
 * expõe deleted_at — deleted_reason/deleted_by não existem nas views).
 * 'active'   → { deleted_at: null }.
 */
function simulateUpdateStatusBulk(
  contact: ConversationContact,
  status: 'active' | 'archived'
): ConversationContact {
  const patch =
    status === 'archived'
      ? { deleted_at: new Date('2026-08-01T12:00:00.000Z').toISOString() }
      : { deleted_at: null };
  return { ...contact, ...patch };
}

// ===== CENÁRIO A — arquivar conversa =====

describe('CENÁRIO A — arquivar conversa (soft-delete → aba Arquivadas)', () => {
  it('A1. contato ativo: isArchived=false, aparece na lista normal e NÃO na aba arquivada', () => {
    const contact = makeContact({ id: 'a-ativo', name: 'Ana Ativa', assigned_to: 'agent-1' });
    const msg = makeMessage('m1', contact.id, '2026-07-30T10:00:00.000Z');
    const [conv] = buildConversations([contact], [msg]);

    expect(conv.isArchived).toBe(false);

    const normal = applyInboxFilters(buildOptions([conv]));
    const archived = applyInboxFilters(buildOptions([conv], { archivedTab: true }));

    expect(normal.map((c) => c.contact.id)).toEqual(['a-ativo']);
    expect(archived).toHaveLength(0);
  });

  it('A2. contato arquivado (deleted_at setado, como contactsRepository.archive faria): isArchived=true, some da lista normal e aparece na aba arquivada', () => {
    const contact = simulateUpdateStatusBulk(
      makeContact({ id: 'a-arquivada', name: 'Ana Arquivada', assigned_to: 'agent-1' }),
      'archived'
    );
    const msg = makeMessage('m1', contact.id, '2026-07-30T10:00:00.000Z');
    const [conv] = buildConversations([contact], [msg]);

    expect(conv.isArchived).toBe(true);
    expect(conv.contact.deleted_at).toBeTruthy();
    expect(conv.contact.deleted_at).toBeTruthy();

    const normal = applyInboxFilters(buildOptions([conv]));
    const archived = applyInboxFilters(buildOptions([conv], { archivedTab: true }));

    expect(normal).toHaveLength(0); // NÃO vaza para a lista normal
    expect(archived.map((c) => c.contact.id)).toEqual(['a-arquivada']);
  });

  it('A3. lista mista: cada conversa cai na aba certa', () => {
    const ativo = makeContact({ id: 'm-ativo', name: 'Maria Ativa', assigned_to: 'agent-1' });
    const arquivado = simulateUpdateStatusBulk(
      makeContact({ id: 'm-arquivado', name: 'Marcos Arquivado', assigned_to: 'agent-1' }),
      'archived'
    );
    const convs = buildConversations(
      [ativo, arquivado],
      [
        makeMessage('m1', ativo.id, '2026-07-30T10:00:00.000Z'),
        makeMessage('m2', arquivado.id, '2026-07-30T11:00:00.000Z'),
      ]
    );

    const normal = applyInboxFilters(buildOptions(convs));
    const archived = applyInboxFilters(buildOptions(convs, { archivedTab: true }));

    expect(normal.map((c) => c.contact.id)).toEqual(['m-ativo']);
    expect(archived.map((c) => c.contact.id)).toEqual(['m-arquivado']);
    // União = total, sem perdas nem duplicatas
    expect([...normal, ...archived].map((c) => c.contact.id).sort()).toEqual(
      ['m-arquivado', 'm-ativo']
    );
  });
});

// ===== CENÁRIO B — desarquivar =====

describe('CENÁRIO B — desarquivar (restore limpa deleted_at → volta à lista normal)', () => {
  it('B1. restore: deleted_at limpo → isArchived=false e conversa volta à lista normal', () => {
    const arquivado = simulateUpdateStatusBulk(
      makeContact({ id: 'b-restaurado', name: 'Bruno Restaurado', assigned_to: 'agent-1' }),
      'archived'
    );
    const msg = makeMessage('m1', arquivado.id, '2026-07-30T10:00:00.000Z');
    const [convArquivada] = buildConversations([arquivado], [msg]);
    expect(convArquivada.isArchived).toBe(true);

    // Desarquiva (mesmo patch de contactsRepository.restore / updateStatusBulk('active'))
    const restaurado = simulateUpdateStatusBulk(arquivado, 'active');
    const [convRestaurada] = buildConversations([restaurado], [msg]);

    expect(convRestaurada.isArchived).toBe(false);
    expect(convRestaurada.contact.deleted_at).toBeNull();
    expect(convRestaurada.contact.deleted_at).toBeNull();

    const normal = applyInboxFilters(buildOptions([convRestaurada]));
    const archived = applyInboxFilters(buildOptions([convRestaurada], { archivedTab: true }));

    expect(normal.map((c) => c.contact.id)).toEqual(['b-restaurado']);
    expect(archived).toHaveLength(0);
  });

  it('B2. restore preserva mensagens, unreadCount e lastMessage da conversa', () => {
    const arquivado = simulateUpdateStatusBulk(
      makeContact({ id: 'b-msgs', name: 'Bruno Msgs', assigned_to: 'agent-1' }),
      'archived'
    );
    const msgs = [
      makeMessage('m1', arquivado.id, '2026-07-30T10:00:00.000Z', { is_read: true }),
      makeMessage('m2', arquivado.id, '2026-07-30T10:05:00.000Z', { is_read: false }),
    ];
    const [antes] = buildConversations([arquivado], msgs);
    const [depois] = buildConversations([simulateUpdateStatusBulk(arquivado, 'active')], msgs);

    expect(antes.messages).toHaveLength(2);
    expect(depois.messages).toHaveLength(2);
    expect(depois.unreadCount).toBe(1);
    expect(depois.lastMessage?.id).toBe('m2');
  });
});

// ===== CENÁRIO C — mensagem NOVA para contato arquivado =====

describe('CENÁRIO C — mensagem nova para contato ARQUIVADO (não vaza para lista normal)', () => {
  it('C1. rebuild com mensagens novas mantém isArchived=true e atualiza lastMessage/unread', () => {
    const arquivado = simulateUpdateStatusBulk(
      makeContact({ id: 'c-arquivado', name: 'Carla Arquivada', assigned_to: 'agent-1' }),
      'archived'
    );
    const msgsNovas = [
      makeMessage('m1', arquivado.id, '2026-08-01T10:00:00.000Z', { is_read: true }),
      makeMessage('m2', arquivado.id, '2026-08-02T10:00:00.000Z', { is_read: false, content: 'Oi, ainda estou aqui' }),
    ];
    const conv = buildConversation(arquivado, msgsNovas);

    expect(conv.isArchived).toBe(true); // CONTINUA arquivada
    expect(conv.unreadCount).toBe(1);
    expect(conv.lastMessage?.content).toBe('Oi, ainda estou aqui');

    const normal = applyInboxFilters(buildOptions([conv]));
    const archived = applyInboxFilters(buildOptions([conv], { archivedTab: true }));

    expect(normal).toHaveLength(0); // NÃO vaza — mensagem nova NÃO desarquiva
    expect(archived.map((c) => c.contact.id)).toEqual(['c-arquivado']);
  });

  it('C2. mensagem nova para arquivada não infla contador de não lidas da lista normal', () => {
    const arquivada = simulateUpdateStatusBulk(
      makeContact({ id: 'c-unread', name: 'Carla Unread', assigned_to: 'agent-1' }),
      'archived'
    );
    const ativa = makeContact({ id: 'c-ativa', name: 'Caio Ativo', assigned_to: 'agent-1' });
    const convs = buildConversations(
      [arquivada, ativa],
      [
        makeMessage('m1', arquivada.id, '2026-08-02T10:00:00.000Z', { is_read: false }),
        makeMessage('m2', ativa.id, '2026-08-02T10:00:00.000Z', { is_read: true }),
      ]
    );

    const unreadTab = applyInboxFilters(buildOptions(convs, { mainTab: 'unread' }));
    expect(unreadTab.map((c) => c.contact.id)).toEqual([]); // arquivada excluída do unread
  });
});

// ===== CENÁRIO D — busca na aba arquivada =====

describe('CENÁRIO D — busca na aba arquivada (filtra SÓ arquivadas)', () => {
  const fixtures = () => {
    const ana = simulateUpdateStatusBulk(
      makeContact({ id: 'd-ana', name: 'Ana Silva', assigned_to: 'agent-1' }),
      'archived'
    );
    const bruno = makeContact({ id: 'd-bruno', name: 'Bruno Souza', assigned_to: 'agent-1' }); // NÃO arquivado
    const carlos = simulateUpdateStatusBulk(
      makeContact({ id: 'd-carlos', name: 'Carlos Lima', assigned_to: 'agent-1' }),
      'archived'
    );
    return buildConversations(
      [ana, bruno, carlos],
      [
        makeMessage('m1', ana.id, '2026-07-30T10:00:00.000Z'),
        makeMessage('m2', bruno.id, '2026-07-30T10:05:00.000Z'),
        makeMessage('m3', carlos.id, '2026-07-30T10:10:00.000Z', { content: 'Segue o pedido #9988' }),
      ]
    );
  };

  it('D1. busca por nome de arquivada encontra na aba arquivada', () => {
    const convs = fixtures();
    const result = applyInboxFilters(buildOptions(convs, { archivedTab: true, search: 'ana' }));
    expect(result.map((c) => c.contact.id)).toEqual(['d-ana']);
  });

  it('D2. busca que casa nome de NÃO-arquivada NÃO retorna nada na aba arquivada', () => {
    const convs = fixtures();
    const result = applyInboxFilters(buildOptions(convs, { archivedTab: true, search: 'bruno' }));
    expect(result).toHaveLength(0); // Bruno é ativo — não vaza para a aba arquivada
  });

  it('D3. a mesma busca encontra o não-arquivado na lista normal', () => {
    const convs = fixtures();
    const result = applyInboxFilters(buildOptions(convs, { archivedTab: false, search: 'bruno' }));
    expect(result.map((c) => c.contact.id)).toEqual(['d-bruno']);
  });

  it('D4. busca por conteúdo da última mensagem também funciona na aba arquivada', () => {
    const convs = fixtures();
    const result = applyInboxFilters(buildOptions(convs, { archivedTab: true, search: 'pedido #9988' }));
    expect(result.map((c) => c.contact.id)).toEqual(['d-carlos']);
  });
});

// ===== CENÁRIO E — contadores =====

describe('CENÁRIO E — computeInboxTabCounts ignora arquivadas (não zera nem infla)', () => {
  const fixtures = () => {
    const ativa1 = makeContact({ id: 'e-ativa1', name: 'Elisa Um', assigned_to: 'agent-1' });
    const ativa2 = makeContact({ id: 'e-ativa2', name: 'Eduardo Dois', assigned_to: 'agent-1' });
    const arquivada1 = simulateUpdateStatusBulk(
      makeContact({ id: 'e-arq1', name: 'Elisa Arq', assigned_to: 'agent-1' }),
      'archived'
    );
    const arquivada2 = simulateUpdateStatusBulk(
      makeContact({ id: 'e-arq2', name: 'Edu Arq', assigned_to: 'agent-1' }),
      'archived'
    );
    return buildConversations(
      [ativa1, ativa2, arquivada1, arquivada2],
      [
        makeMessage('m1', ativa1.id, '2026-07-30T10:00:00.000Z', { is_read: false }), // 1 não lida ativa
        makeMessage('m2', ativa2.id, '2026-07-30T10:05:00.000Z', { is_read: true }),
        makeMessage('m3', arquivada1.id, '2026-07-30T10:10:00.000Z', { is_read: false }), // não lida ARQUIVADA
        makeMessage('m4', arquivada2.id, '2026-07-30T10:15:00.000Z', { is_read: false }), // não lida ARQUIVADA
      ]
    );
  };

  it('E1. contadores refletem SÓ as não-arquivadas (arquivadas não contam)', () => {
    const convs = fixtures();
    const counts = computeInboxTabCounts(buildOptions(convs));

    expect(counts).toMatchObject({ open: 2, attending: 2, waiting: 0, resolved: 0, unread: 1 });
  });

  it('E2. mesmo com archivedTab=true (usuário na aba Arquivadas), contadores continuam das não-arquivadas — não zeram', () => {
    const convs = fixtures();
    const counts = computeInboxTabCounts(buildOptions(convs, { archivedTab: true }));

    expect(counts.open).toBe(2); // NÃO é 0 (há arquivadas) e NÃO é 4 (arquivadas não inflam)
    expect(counts.unread).toBe(1);
  });

  it('E3. só com arquivadas no conjunto, contadores ficam 0 (elas nunca contam)', () => {
    const convs = fixtures().filter((c) => c.isArchived);
    expect(convs).toHaveLength(2);

    const counts = computeInboxTabCounts(buildOptions(convs));
    expect(counts).toMatchObject({ open: 0, attending: 0, unread: 0 });
  });
});

// ===== CENÁRIO F — bulk archive + undo no pipeline =====

describe('CENÁRIO F — bulk archive + undo (updateStatusBulk + refetch simulado)', () => {
  it('F1. updateStatusBulk("archived") + refetch → itens somem da lista normal e vão para a aba arquivada', () => {
    // Estado "no banco" (fixtures locais)
    let contactRows = [
      makeContact({ id: 'f-1', name: 'Fulano Um', assigned_to: 'agent-1' }),
      makeContact({ id: 'f-2', name: 'Fulano Dois', assigned_to: 'agent-1' }),
    ];
    const messages = [
      makeMessage('m1', 'f-1', '2026-07-30T10:00:00.000Z'),
      makeMessage('m2', 'f-2', '2026-07-30T10:05:00.000Z'),
    ];
    // refetch = rebuild a partir do estado atual (igual ao fluxo real pós-mutação)
    const refetch = () => buildConversations(contactRows, messages);

    // Antes do bulk: 2 na lista normal, 0 na arquivada
    const antes = refetch();
    expect(applyInboxFilters(buildOptions(antes)).map((c) => c.contact.id).sort()).toEqual(['f-1', 'f-2']);
    expect(applyInboxFilters(buildOptions(antes, { archivedTab: true }))).toHaveLength(0);

    // bulkArchive → updateStatusBulk('archived') em lote (mesmo patch do repositório real)
    contactRows = contactRows.map((c) => simulateUpdateStatusBulk(c, 'archived'));

    // refetch pós-mutação
    const posBulk = refetch();
    expect(applyInboxFilters(buildOptions(posBulk))).toHaveLength(0); // sumiram da normal
    expect(applyInboxFilters(buildOptions(posBulk, { archivedTab: true })).map((c) => c.contact.id).sort()).toEqual(
      ['f-1', 'f-2']
    );
  });

  it('F2. undo → updateStatusBulk("active") + refetch → itens voltam à lista normal', () => {
    let contactRows = [
      simulateUpdateStatusBulk(makeContact({ id: 'f-3', name: 'Fulana Tres', assigned_to: 'agent-1' }), 'archived'),
    ];
    const messages = [makeMessage('m1', 'f-3', '2026-07-30T10:00:00.000Z')];
    const refetch = () => buildConversations(contactRows, messages);

    // Estado arquivado (pós-bulk, pré-undo)
    expect(applyInboxFilters(buildOptions(refetch()))).toHaveLength(0);

    // undoAction → updateStatusBulk('active')
    contactRows = contactRows.map((c) => simulateUpdateStatusBulk(c, 'active'));

    const aposUndo = refetch();
    expect(applyInboxFilters(buildOptions(aposUndo)).map((c) => c.contact.id)).toEqual(['f-3']);
    expect(applyInboxFilters(buildOptions(aposUndo, { archivedTab: true }))).toHaveLength(0);
    expect(aposUndo[0].isArchived).toBe(false);
  });

  it('F3. contrato do patch bulk: NUNCA toca assigned_to (regressão do bug de desatribuir)', () => {
    const contato = makeContact({ id: 'f-4', name: 'Fulano Quatro', assigned_to: 'agent-9' });

    const arquivado = simulateUpdateStatusBulk(contato, 'archived');
    expect(arquivado.assigned_to).toBe('agent-9'); // assigned_to preservado
    expect(arquivado.deleted_at).toBeTruthy();

    const restaurado = simulateUpdateStatusBulk(arquivado, 'active');
    expect(restaurado.assigned_to).toBe('agent-9'); // e continua preservado após undo
    expect(restaurado.deleted_at).toBeNull();
  });
});

// ===== CENÁRIO G — contato arquivado com assigned_to =====

describe('CENÁRIO G — arquivar NÃO limpa assigned_to (contrato do repositório)', () => {
  it('G1. buildConversation de contato arquivado com assigned_to mantém o vínculo', () => {
    const contato = simulateUpdateStatusBulk(
      makeContact({ id: 'g-1', name: 'Gabi Atribuida', assigned_to: 'agent-7' }),
      'archived'
    );
    const [conv] = buildConversations(
      [contato],
      [makeMessage('m1', contato.id, '2026-07-30T10:00:00.000Z')]
    );

    expect(conv.isArchived).toBe(true);
    expect(conv.contact.assigned_to).toBe('agent-7'); // arquivar NÃO desatribui
  });

  it('G2. fonte real: contactsRepository.archive/updateStatusBulk só setam deleted_at (nunca assigned_to/deleted_reason)', () => {
    const sourcePath = resolve(process.cwd(), 'src/services/contacts/contactsRepository.ts');
    const source = readFileSync(sourcePath, 'utf8');

    const archiveBlock = source.match(/archive: async[\s\S]*?\n {2}\},/)?.[0] ?? '';
    expect(archiveBlock).toContain('deleted_at');
    // A view contacts não expõe deleted_reason/deleted_by (comprovado em
    // produção) — o patch NÃO pode incluir colunas inexistentes.
    expect(archiveBlock).not.toContain('deleted_reason');
    expect(archiveBlock).not.toContain('deleted_by');
    expect(archiveBlock).not.toContain('assigned_to');
    expect(archiveBlock).not.toContain('assignedTo');

    const bulkBlock = source.match(/updateStatusBulk: async[\s\S]*?\n {2}\},/)?.[0] ?? '';
    expect(bulkBlock).not.toContain('deleted_reason');
    expect(bulkBlock).not.toContain('deleted_by');
    expect(bulkBlock).not.toContain('assigned_to');
    expect(bulkBlock).not.toContain('assignedTo');
  });
});

// ===== CENÁRIO H — IDs não-UUID =====

describe('CENÁRIO H — IDs não-UUID em useArchiveConversationActions', () => {
  const mockOnDone = vi.fn();

  beforeEach(() => {
    mockArchiveMutate.mockClear();
    mockRestoreMutate.mockClear();
    mockOnDone.mockClear();
  });

  it('H1. id vazio é ignorado (guarda do hook)', async () => {
    const { result } = renderHook(() => useArchiveConversationActions());
    await act(async () => {
      await result.current.archive('');
    });
    expect(mockArchiveMutate).not.toHaveBeenCalled();
  });

  it('H2. GAP CORRIGIDO (PR PR 773): id NÃO-UUID é IGNORADO — guarda isValidUUID no hook', async () => {
    const { result } = renderHook(() => useArchiveConversationActions());
    await act(async () => {
      await result.current.archive('not-a-uuid');
    });
    // O hook agora filtra com isValidUUID (mesmo padrão do bulk) — evita o
    // erro feio 22P02 do PostgREST (cast uuid inválido).
    expect(mockArchiveMutate).not.toHaveBeenCalled();
  });

  it('H2b. restore também ignora id NÃO-UUID', async () => {
    const { result } = renderHook(() => useArchiveConversationActions());
    await act(async () => {
      await result.current.restore('5511999887766@s.whatsapp.net');
    });
    expect(mockRestoreMutate).not.toHaveBeenCalled();
  });

  it('H3. UUID válido passa normalmente e onDone dispara após sucesso', async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useArchiveConversationActions(onDone));
    await act(async () => {
      await result.current.archive('00000000-0000-0000-0000-000000000000');
    });
    expect(mockArchiveMutate).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000000');
    expect(onDone).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.restore('00000000-0000-0000-0000-000000000000');
    });
    expect(mockRestoreMutate).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000000');
  });
});
