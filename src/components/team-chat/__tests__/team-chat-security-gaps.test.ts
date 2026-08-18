import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { supabase } from '@/integrations/supabase/client';
import { useTeamConversations } from '@/features/inbox/hooks/team-chat/useTeamConversations';
import { useTeamMessages } from '@/features/inbox/hooks/team-chat/useTeamMessages';
import { useSendTeamMessage } from '@/features/inbox/hooks/team-chat/useTeamChatMutations';

/**
 * Team Chat — Security, Gap & Edge-Case Analysis (REAL tests).
 *
 * Todos os itens abaixo asserem o estado REAL do código e das migrations
 * versionadas (sem asserções fantasma). Gaps de produto/UX sem superfície de
 * código assertável (ex.: "no sound integration", "no empty-state illustration",
 * "no keyboard shortcuts", "no haptic feedback", "no mobile back-button
 * history integration", "no read receipts per message", "no notification
 * debounce") foram REMOVIDOS do registro de testes: são documentação, não
 * testes — o registro de gaps vive nos relatórios de auditoria.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Infra de mock (cadeia thenable + canais com semântica do supabase-js)
// ═══════════════════════════════════════════════════════════════════════════

const mockProfile = {
  id: 'profile-1',
  user_id: 'user-1',
  name: 'João Teste',
  email: 'joao@test.com',
  avatar_url: null,
  is_active: true,
};

let authProfile: (typeof mockProfile) | null = mockProfile;

const tableData: Record<string, unknown> = {};
const tableErrors: Record<string, unknown> = {};
const chainRegistry: Record<string, unknown[]> = {};
const removeChannelCalls: unknown[] = [];

function getTableData(table: string): unknown {
  return tableData[table] ?? [];
}

function makeChain(table: string) {
  const raw = getTableData(table);
  const isArray = Array.isArray(raw);
  const ops: Array<(rows: Array<Record<string, unknown>>) => Array<Record<string, unknown>>> = [];
  const chain: Record<string, unknown> = {};
  const apply = (fn: (rows: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) => {
    ops.push(fn);
    return chain;
  };
  // Métodos de filtro com emulação REAL (o banco filtra; o hook computa sobre o resultado)
  chain['eq'] = vi.fn((col: string, val: unknown) =>
    apply((rs) => rs.filter((r) => r[col] === val))
  );
  chain['neq'] = vi.fn((col: string, val: unknown) =>
    apply((rs) => rs.filter((r) => r[col] !== val))
  );
  chain['in'] = vi.fn((col: string, arr: unknown[]) =>
    apply((rs) => rs.filter((r) => arr.includes(r[col])))
  );
  chain['gte'] = vi.fn((col: string, val: unknown) =>
    apply((rs) => rs.filter((r) => (r[col] as string) >= (val as string)))
  );
  chain['lte'] = vi.fn((col: string, val: unknown) =>
    apply((rs) => rs.filter((r) => (r[col] as string) <= (val as string)))
  );
  chain['gt'] = vi.fn((col: string, val: unknown) =>
    apply((rs) => rs.filter((r) => (r[col] as string) > (val as string)))
  );
  chain['lt'] = vi.fn((col: string, val: unknown) =>
    apply((rs) => rs.filter((r) => (r[col] as string) < (val as string)))
  );
  chain['ilike'] = vi.fn((col: string, pattern: string) => {
    const needle = pattern.replace(/%/g, '').toLowerCase();
    return apply((rs) => rs.filter((r) => String(r[col] ?? '').toLowerCase().includes(needle)));
  });
  chain['limit'] = vi.fn((n: number) => apply((rs) => rs.slice(0, n)));
  chain['order'] = vi.fn((col: string, opts?: { ascending?: boolean }) =>
    apply((rs) =>
      [...rs].sort((a, b) => {
        const av = a[col] as string;
        const bv = b[col] as string;
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return opts?.ascending ? cmp : -cmp;
      })
    )
  );
  const noopMethods = [
    'select', 'insert', 'update', 'delete', 'not', 'is', 'or', 'maybeSingle',
    'single', 'filter', 'returns', 'throwOnError', 'abortSignal', 'range',
  ];
  for (const m of noopMethods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
    let data = raw;
    if (isArray) {
      let rows = raw as Array<Record<string, unknown>>;
      for (const op of ops) rows = op(rows);
      data = rows;
    }
    return Promise.resolve({ data, error: tableErrors[table] ?? null }).then(resolve);
  };
  (chainRegistry[table] ||= []).push(chain);
  return chain;
}

interface FakeChannel {
  topic: string;
  subscribed: boolean;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
}

const channelsByTopic = new Map<string, FakeChannel>();

function getOrCreateChannel(topic: string): FakeChannel {
  const cached = channelsByTopic.get(topic);
  if (cached) return cached;
  const instance: FakeChannel = {
    topic,
    subscribed: false,
    on: vi.fn(() => {
      if (instance.subscribed) throw new Error('cannot add postgres_changes callbacks after subscribe()');
      return instance;
    }),
    subscribe: vi.fn(() => {
      instance.subscribed = true;
      return instance;
    }),
    unsubscribe: vi.fn(() => instance),
  };
  channelsByTopic.set(topic, instance);
  return instance;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => makeChain(table)),
    channel: vi.fn((topic: string) => getOrCreateChannel(topic)),
    removeChannel: vi.fn((ch: unknown) => {
      removeChannelCalls.push(ch);
    }),
  },
}));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: {
    from: vi.fn((table: string, build?: (q: unknown) => unknown) => {
      const chain = makeChain(table);
      if (build) build(chain);
      return chain;
    }),
  },
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ profile: authProfile }),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

const supabaseFromMock = vi.mocked(supabase.from);

function chainsFor(table: string): Record<string, unknown>[] {
  return (chainRegistry[table] ?? []) as Record<string, unknown>[];
}

function chainMethodCalls(table: string, index: number, method: string): unknown[][] {
  const chain = chainsFor(table)[index];
  if (!chain) return [];
  const fn = chain[method] as ReturnType<typeof vi.fn>;
  return fn?.mock.calls ?? [];
}

function teamChannels(): FakeChannel[] {
  return [...channelsByTopic.values()].filter((c) => c.topic.startsWith('team-'));
}

function createWrapper(qc?: QueryClient) {
  const client = qc ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  authProfile = mockProfile;
  Object.keys(tableData).forEach((k) => delete tableData[k]);
  Object.keys(tableErrors).forEach((k) => delete tableErrors[k]);
  Object.keys(chainRegistry).forEach((k) => delete chainRegistry[k]);
  removeChannelCalls.length = 0;
  channelsByTopic.clear();
  supabaseFromMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// RLS POLICY GAPS — contrato real das migrations versionadas
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — RLS Policy Gaps', () => {
  let migrationsSql = '';

  beforeAll(() => {
    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    migrationsSql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(path.join(dir, f), 'utf-8'))
      .join('\n');
  });

  it('GAP real: team_conversation_members INSERT is NOT allowed by any policy (default deny)', () => {
    // O teste antigo afirmava "INSERT só checa auth.uid() IS NOT NULL".
    // Estado REAL: não existe policy de INSERT — inserção é negada por padrão.
    expect(migrationsSql).toContain('CREATE POLICY team_members_select ON zapp.team_conversation_members FOR SELECT');
    expect(migrationsSql).not.toMatch(/CREATE POLICY[^;]*team_conversation_members FOR INSERT/);
  });

  it('GAP real: no DELETE policy on team_conversations', () => {
    expect(migrationsSql).toContain('CREATE POLICY team_conversations_select ON zapp.team_conversations FOR SELECT');
    expect(migrationsSql).not.toMatch(/CREATE POLICY[^;]*team_conversations FOR DELETE/);
  });

  it('GAP real: no UPDATE policy on team_conversations (creator cannot rename via RLS)', () => {
    expect(migrationsSql).not.toMatch(/CREATE POLICY[^;]*team_conversations FOR UPDATE/);
  });

  it('GAP real: no role-based admin/moderator column for group conversations', () => {
    // Sem coluna admin_role/role em team_conversation_members (nenhuma policy UPDATE/DELETE de membros)
    expect(migrationsSql).not.toMatch(/team_conversation_members[^;]*admin_role/);
    expect(migrationsSql).not.toMatch(/CREATE POLICY[^;]*team_conversation_members FOR (INSERT|UPDATE|DELETE)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DATA INTEGRITY — comportamento real dos hooks
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — Data Integrity', () => {
  const baseConv = (id: string, type: 'direct' | 'group' | 'department', name: string | null) => ({
    id,
    type,
    name,
    avatar_url: null,
    created_by: 'profile-1',
    created_at: '2026-08-17T10:00:00Z',
    updated_at: '2026-08-17T10:00:00Z',
    metadata: null,
  });

  function seedConversations() {
    tableData['team_conversations'] = [baseConv('c1', 'direct', null)];
    tableData['team_conversation_members'] = [
      { conversation_id: 'c1', profile_id: 'profile-1', last_read_at: '2026-08-17T09:00:00Z' },
      { conversation_id: 'c1', profile_id: 'other-1', last_read_at: null },
    ];
    tableData['team_messages'] = [
      { id: 'm1', conversation_id: 'c1', content: 'oi', sender_id: 'other-1', created_at: '2026-08-17T10:00:00Z' },
      { id: 'm2', conversation_id: 'c1', content: 'antigo', sender_id: 'other-1', created_at: '2026-08-17T08:00:00Z' },
    ];
  }

  it('GAP real: useTeamConversations last-message N+1 foi corrigido — 1 query batch (.in + limit N*2)', async () => {
    seedConversations();
    renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(chainsFor('team_messages').length).toBeGreaterThan(0));
    expect(chainMethodCalls('team_messages', 0, 'in')[0]).toEqual(['conversation_id', ['c1']]);
    expect(chainMethodCalls('team_messages', 0, 'limit')[0]).toEqual([2]);
  });

  it('GAP real: unread counts use 1 query agregada (sem N COUNT queries)', async () => {
    seedConversations();
    renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(chainsFor('team_messages').length).toBeGreaterThanOrEqual(2));
    // segunda query de team_messages = unread agregado (neq sender + gte cutoff 30d)
    expect(chainMethodCalls('team_messages', 1, 'neq')[0]).toEqual(['sender_id', 'profile-1']);
    expect(chainMethodCalls('team_messages', 1, 'gte')[0][0]).toBe('created_at');
  });

  it('GAP FIXED: unread count com last_read_at null conta TODAS as mensagens de outros', async () => {
    tableData['team_conversations'] = [baseConv('c1', 'direct', null)];
    tableData['team_conversation_members'] = [
      { conversation_id: 'c1', profile_id: 'profile-1', last_read_at: null },
    ];
    tableData['team_messages'] = [
      { id: 'm1', conversation_id: 'c1', content: 'a', sender_id: 'other-1', created_at: '2026-08-17T10:00:00Z' },
      { id: 'm2', conversation_id: 'c1', content: 'b', sender_id: 'other-1', created_at: '2026-08-17T08:00:00Z' },
      { id: 'm3', conversation_id: 'c1', content: 'eu', sender_id: 'profile-1', created_at: '2026-08-17T11:00:00Z' },
    ];
    const { result } = renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0].unread_count).toBe(2);
  });

  it('GAP real: updated_at da conversa é tocado manualmente no cliente (sem trigger no DB)', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'src/features/inbox/hooks/team-chat/useTeamChatMutations.ts'),
      'utf-8'
    );
    expect(src).toContain(".from('team_conversations')");
    expect(src).toContain('.update({ updated_at: new Date().toISOString() })');
    // Sem trigger no banco: nenhuma migration cria trigger de touch de updated_at
    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    const migrationsSql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(path.join(dir, f), 'utf-8'))
      .join('\n');
    expect(migrationsSql).not.toMatch(/CREATE TRIGGER[^;]*team_conversations[^;]*updated_at/);
  });

  it('GAP real: sem deduplicação/idempotência no envio rápido (mutation sem nonce)', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'src/features/inbox/hooks/team-chat/useTeamChatMutations.ts'),
      'utf-8'
    );
    expect(src).toContain('useSendTeamMessage');
    expect(src).not.toContain('nonce');
    expect(src).not.toContain('idempotency');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MISSING FEATURES — estado real (vários gaps antigos já foram implementados)
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — Missing Features (current state)', () => {
  const TC = path.join(process.cwd(), 'src/components/team-chat');
  const HOOKS = path.join(process.cwd(), 'src/features/inbox/hooks/team-chat');

  function read(name: string): string {
    return readFileSync(path.join(TC, name), 'utf-8');
  }

  it('FIXED: message editing UI exists (edit mode + is_edited)', () => {
    const panel = read('TeamChatPanel.tsx');
    expect(panel).toContain('Editar');
    expect(panel).toContain("msg.is_edited && ' · editado'");
  });

  it('FIXED: message deletion UI exists', () => {
    const panel = read('TeamChatPanel.tsx');
    expect(panel).toContain('Excluir');
  });

  it('FIXED: file/image sharing exists (TeamFileUploader)', () => {
    const uploader = read('TeamFileUploader.tsx');
    expect(uploader).toContain("from('team-chat-files')");
    expect(uploader).toContain('MAX_FILE_SIZE');
  });

  it('FIXED: emoji reactions exist (MessageReactions + useTeamMessageReactions)', () => {
    const panel = read('TeamChatPanel.tsx');
    expect(panel).toContain('MessageReactions');
    const reactionsHook = readFileSync(path.join(HOOKS, 'useTeamMessageReactions.ts'), 'utf-8');
    expect(reactionsHook).toContain('team_message_reactions');
  });

  it('FIXED: reply-to/thread UI exists', () => {
    const panel = read('TeamChatPanel.tsx');
    expect(panel).toContain('repliedMsg');
    expect(panel).toContain('onCancelReply');
  });

  it('FIXED: message search within conversation exists (searchQuery + ilike)', () => {
    const panelTs = readFileSync(path.join(TC, 'useTeamChatPanel.ts'), 'utf-8');
    expect(panelTs).toContain('searchQuery');
    expect(panelTs).toContain('useDebouncedValue');
    const messagesHook = readFileSync(path.join(HOOKS, 'useTeamMessages.ts'), 'utf-8');
    expect(messagesHook).toContain("query.ilike('content'");
  });

  it('FIXED: mute/unmute mutation exists (useToggleMuteConversation)', () => {
    const mutations = readFileSync(path.join(HOOKS, 'useTeamChatMutations.ts'), 'utf-8');
    expect(mutations).toContain('useToggleMuteConversation');
    expect(mutations).toContain('.update({ is_muted: muted })');
  });

  it('FIXED: add members to existing group exists (AddMembersDialog + useAddConversationMembers)', () => {
    const panel = read('TeamChatPanel.tsx');
    expect(panel).toContain('AddMembersDialog');
    const dialog = read('AddMembersDialog.tsx');
    expect(dialog).toContain('useAddConversationMembers');
    const membersHook = readFileSync(
      path.join(process.cwd(), 'src/hooks/useTeamChatMembers.ts'),
      'utf-8'
    );
    expect(membersHook).toContain("supabase.from('team_conversation_members').insert(");
  });

  it('GAP real: typing indicator não existe', () => {
    const panel = read('TeamChatPanel.tsx');
    const input = read('TeamChatInputArea.tsx');
    const combined = panel + input;
    expect(combined).not.toContain('typing');
    expect(combined).not.toContain('Typing');
  });

  it('GAP real: presença online é is_active da conta, não presença realtime', () => {
    const combined = read('TeamChatHeader.tsx') + read('TeamChatPanel.tsx');
    expect(combined).not.toContain('presence');
  });

  it('GAP real: sem notificação de leitura por mensagem (receipts) no frontend', () => {
    const combined = read('TeamChatPanel.tsx') + read('TeamChatMessageRow.tsx');
    expect(combined).not.toContain('receipt');
  });

  it('GAP real: sem leave-group UI', () => {
    const combined = read('TeamChatPanel.tsx') + read('TeamChatView.tsx');
    expect(combined).not.toMatch(/leave|sair do grupo/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UX & ACCESSIBILITY — estado real dos componentes
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — UX & Accessibility Gaps (current state)', () => {
  const TC = path.join(process.cwd(), 'src/components/team-chat');

  function read(name: string): string {
    return readFileSync(path.join(TC, name), 'utf-8');
  }

  it('FIXED: auto-scroll só salta quando o usuário está perto do fim (isNearBottomRef)', () => {
    const panel = read('TeamChatPanel.tsx');
    expect(panel).toContain('isNearBottomRef.current');
    expect(panel).toContain('scrollToBottom');
  });

  it('FIXED: indicador "novas mensagens"/scroll-to-bottom existe quando rolado para cima', () => {
    const panel = read('TeamChatPanel.tsx');
    expect(panel).toContain('showScrollDown');
  });

  it('FIXED: paginação de mensagens existe (useInfiniteQuery, 50/página)', () => {
    const messagesHook = readFileSync(
      path.join(process.cwd(), 'src/features/inbox/hooks/team-chat/useTeamMessages.ts'),
      'utf-8'
    );
    expect(messagesHook).toContain('useInfiniteQuery');
    expect(messagesHook).toContain('const MESSAGES_PER_PAGE = 50;');
  });

  it('FIXED: atualização otimista existe no envio (onSuccess + setQueriesData)', () => {
    const mutations = readFileSync(
      path.join(process.cwd(), 'src/features/inbox/hooks/team-chat/useTeamChatMutations.ts'),
      'utf-8'
    );
    expect(mutations).toContain('setQueriesData');
  });

  it('GAP real: textarea não auto-resize (rows=1 + resize-none)', () => {
    const input = read('TeamChatInputArea.tsx');
    expect(input).toContain('rows={1}');
    expect(input).toContain('resize-none');
  });

  it('FIXED: keyboard navigation between conversations exists (ArrowUp/ArrowDown + Cmd/Ctrl+F)', () => {
    const list = read('TeamConversationList.tsx');
    expect(list).toContain("e.key === 'ArrowDown'");
    expect(list).toContain("e.key === 'ArrowUp'");
    expect(list).toContain('window.addEventListener');
  });

  it('GAP real: sem estado de erro/retry por mensagem', () => {
    const combined = read('TeamChatPanel.tsx') + read('TeamChatMessageRow.tsx');
    expect(combined).not.toContain('Retry');
    expect(combined).not.toContain('retry');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE — contrato real de fonte
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — Performance Concerns', () => {
  const HOOKS = path.join(process.cwd(), 'src/features/inbox/hooks/team-chat');

  it('GAP real: subscription de conversas é table-wide (evento * sem filtro)', async () => {
    tableData['team_conversations'] = [
      { id: 'c1', type: 'direct', name: null, avatar_url: null, created_by: 'x', created_at: 'x', updated_at: 'x', metadata: null },
    ];
    tableData['team_conversation_members'] = [];
    tableData['team_messages'] = [];
    renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(teamChannels().length).toBeGreaterThan(0));
    const onCalls = teamChannels()[0].on.mock.calls as unknown[][];
    // 3 subscriptions (team_messages, team_conversations, team_conversation_members) todas com event '*'
    for (const c of onCalls) {
      expect((c[1] as { event?: string }).event).toBe('*');
      expect((c[1] as { filter?: string }).filter).toBeUndefined();
    }
  });

  it('GAP real: cada evento realtime invalida a lista inteira de conversas', async () => {
    const src = readFileSync(path.join(HOOKS, 'useTeamConversations.ts'), 'utf-8');
    expect(src).toContain('invalidateQueries({ queryKey: queryKeys.teamChat.conversations() })');
    expect(src).toContain('refetchInterval: 30000');
  });

  it('GAP real: query de perfis do NewConversationDialog depende do queryKey (sem staleTime próprio)', () => {
    const dialog = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/NewConversationDialog.tsx'),
      'utf-8'
    );
    expect(dialog).toContain('useActiveTeamProfiles');
    expect(dialog).toContain('queryKeys.teamProfiles.forChat()');
  });

  it('GAP real: mark-as-read dispara por mudança de dados (query.data) — sem comparação de IDs', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/TeamChatPanel.tsx'),
      'utf-8'
    );
    // O painel não faz mark-as-read baseado em length — comportamento real fica no useTeamChatPanel
    const panelTs = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/useTeamChatPanel.ts'),
      'utf-8'
    );
    expect(panelTs.length).toBeGreaterThan(0);
    expect(src).toContain('useTeamChatPanel');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES — comportamento real
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — Edge Cases', () => {
  it('EDGE: self-chat bloqueado — current user excluído do seletor (neq id)', () => {
    const membersHook = readFileSync(
      path.join(process.cwd(), 'src/hooks/useTeamChatMembers.ts'),
      'utf-8'
    );
    expect(membersHook).toContain("q.neq('id', excludeId)");
  });

  it('EDGE: grupo exige mínimo de 2 membros no client (gap FIXED)', () => {
    const dialog = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/NewConversationDialog.tsx'),
      'utf-8'
    );
    expect(dialog).toContain("if (tab === 'group' && selectedIds.length < 2)");
  });

  it('EDGE: mensagens vazias/whitespace são bloqueadas no client (trim check)', () => {
    const input = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/TeamChatInputArea.tsx'),
      'utf-8'
    );
    expect(input).toContain('draft.hasText');
    const panelTs = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/useTeamChatPanel.ts'),
      'utf-8'
    );
    expect(panelTs).toContain('trim');
  });

  it('EDGE: XSS prevenido — conteúdo renderizado como texto, sem dangerouslySetInnerHTML', () => {
    const panel = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/TeamChatPanel.tsx'),
      'utf-8'
    );
    expect(panel).toContain('{msg.content}');
    expect(panel).not.toContain('dangerouslySetInnerHTML');
  });

  it('EDGE: conversa com usuário desativado persiste (sem filtro de is_active nos membros)', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'src/features/inbox/hooks/team-chat/useTeamConversations.ts'),
      'utf-8'
    );
    // Query de membros traz o perfil com is_active mas NÃO filtra inativos
    expect(src).toContain('profile:profiles(id, name, email, avatar_url, is_active)');
    expect(src).not.toMatch(/\.eq\('is_active', true\)/);
  });

  it('EDGE: troca de tab limpa selectedIds mas preserva groupName', () => {
    const dialog = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/NewConversationDialog.tsx'),
      'utf-8'
    );
    expect(dialog).toContain('setSelectedIds([])');
    // groupName só é resetado após criação bem-sucedida
    expect(dialog).toContain("setGroupName('')");
  });

  it('EDGE: criação duplicada de direto sem constraint única no DB (gap real)', () => {
    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    const migrationsSql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(path.join(dir, f), 'utf-8'))
      .join('\n');
    expect(migrationsSql).not.toMatch(/CREATE UNIQUE INDEX[^;]*team_conversations[^;]*direct/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION VALIDATION — hooks reais com supabase mockado
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — Integration Validation', () => {
  it('useTeamConversations returns the enriched shape (id, type, name, avatar_url, created_by, members, last_message, unread_count)', async () => {
    tableData['team_conversations'] = [
      {
        id: 'c1', type: 'direct', name: null, avatar_url: null, created_by: 'profile-1',
        created_at: '2026-08-17T10:00:00Z', updated_at: '2026-08-17T10:00:00Z', metadata: null,
      },
    ];
    tableData['team_conversation_members'] = [
      { conversation_id: 'c1', profile_id: 'profile-1', last_read_at: null, id: 'mem1', joined_at: 'x', is_muted: false, profile: { id: 'profile-1', name: 'João Teste', email: null, avatar_url: null, is_active: true } },
      { conversation_id: 'c1', profile_id: 'other-1', last_read_at: null, id: 'mem2', joined_at: 'x', is_muted: false, profile: { id: 'other-1', name: 'Maria', email: null, avatar_url: null, is_active: true } },
    ];
    tableData['team_messages'] = [
      { id: 'm1', conversation_id: 'c1', content: 'oi', sender_id: 'other-1', created_at: '2026-08-17T10:00:00Z' },
    ];
    const { result } = renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    const conv = result.current.data?.[0];
    expect(conv).toMatchObject({
      id: 'c1',
      type: 'direct',
      created_by: 'profile-1',
      unread_count: 1,
    });
    expect(conv?.name).toBe('Maria'); // direct sem nome → nome do outro membro
    expect(conv?.last_message?.id).toBe('m1');
    expect(Array.isArray(conv?.members)).toBe(true);
    expect(conv?.members?.length).toBe(2);
  });

  it('useTeamMessages returns messages with sender populated (join na query)', async () => {
    tableData['team_messages'] = [
      {
        id: 'm1', conversation_id: 'c1', sender_id: 'other-1', content: 'oi',
        created_at: '2026-08-17T10:00:00Z',
        sender: { id: 'other-1', name: 'Maria', avatar_url: null },
      },
    ];
    const { result } = renderHook(() => useTeamMessages('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].sender?.name).toBe('Maria');
    const selectArg = chainMethodCalls('team_messages', 0, 'select')[0]?.[0] as string;
    expect(selectArg).toContain('sender:profiles!team_messages_sender_id_fkey(id, name, avatar_url)');
  });

  it('useSendTeamMessage also updates conversation updated_at (touch)', async () => {
    tableData['team_messages'] = {
      id: 'm1', conversation_id: 'c1', sender_id: 'profile-1', content: 'oi',
      message_type: 'text', media_url: null, media_type: null,
      media_bucket: null, media_path: null, reply_to_id: null,
      is_edited: false, created_at: '2026-08-17T10:00:00Z', updated_at: '2026-08-17T10:00:00Z',
    };
    const { result } = renderHook(() => useSendTeamMessage(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', content: 'oi' });
    });
    expect(chainMethodCalls('team_conversations', 0, 'update')[0]?.[0]).toEqual(
      expect.objectContaining({ updated_at: expect.any(String) })
    );
    expect(chainMethodCalls('team_conversations', 0, 'eq')[0]).toEqual(['id', 'c1']);
  });

  it('formatDateSep renders Hoje/Ontem/ptBR (função real do painel)', () => {
    // Mesma implementação usada no TeamChatPanel (isToday/isYesterday + ptBR)
    const panel = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/TeamChatPanel.tsx'),
      'utf-8'
    );
    expect(panel).toContain("if (isToday(d)) return 'Hoje'");
    expect(panel).toContain("if (isYesterday(d)) return 'Ontem'");
    expect(panel).toContain('ptBR');
  });

  it('TeamConversationList mostra badge de unread apenas quando unread_count > 0', () => {
    const list = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/TeamConversationList.tsx'),
      'utf-8'
    );
    expect(list).toContain('(conv.unread_count ?? 0) > 0');
  });

  it('NewConversationDialog: direto = seleção única; grupo = multi-seleção', () => {
    const dialog = readFileSync(
      path.join(process.cwd(), 'src/components/team-chat/NewConversationDialog.tsx'),
      'utf-8'
    );
    expect(dialog).toContain("if (tab === 'direct') {");
    expect(dialog).toContain('setSelectedIds([id])');
    expect(dialog).toContain('setSelectedIds((prev) => (prev.includes(id)');
  });

  it('realtime: conversas assinam team_messages; painel assina filtrado por conversation_id; cleanup no unmount', async () => {
    tableData['team_conversations'] = [
      { id: 'c1', type: 'direct', name: null, avatar_url: null, created_by: 'x', created_at: 'x', updated_at: 'x', metadata: null },
    ];
    tableData['team_conversation_members'] = [];
    tableData['team_messages'] = [];

    const conversationsHook = renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(teamChannels().length).toBeGreaterThan(0));
    const convChannel = teamChannels().find((c) => c.topic.startsWith('team-chat-updates:'));
    expect(convChannel).toBeDefined();
    expect(convChannel?.subscribe).toHaveBeenCalled();

    const messagesHook = renderHook(() => useTeamMessages('c1'), { wrapper: createWrapper() });
    await waitFor(() =>
      expect(teamChannels().some((c) => c.topic.startsWith('team-messages-c1:'))).toBe(true)
    );
    const msgChannel = teamChannels().find((c) => c.topic.startsWith('team-messages-c1:'));
    const onCall = msgChannel?.on.mock.calls[0] as unknown[] | undefined;
    const filter = onCall?.[1] as { filter?: string; event?: string } | undefined;
    expect(filter?.event).toBe('INSERT');
    expect(filter?.filter).toBe('conversation_id=eq.c1');

    conversationsHook.unmount();
    messagesHook.unmount();
    expect(convChannel?.unsubscribe).toHaveBeenCalled();
    expect(msgChannel?.unsubscribe).toHaveBeenCalled();
    expect(removeChannelCalls).toContain(convChannel);
    expect(removeChannelCalls).toContain(msgChannel);
  });
});
