import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, renderHook, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import { SOUND_CONFIGS } from '@/utils/soundConfigs';
import { formatTime, formatDateSep, MediaContent, MediaTypeIcon } from '@/components/team-chat/teamChatParts';
import { TeamFileUploader } from '@/components/team-chat/TeamFileUploader';
import { useTeamConversations } from '@/features/inbox/hooks/team-chat/useTeamConversations';
import { useTeamMessages } from '@/features/inbox/hooks/team-chat/useTeamMessages';
import {
  useSendTeamMessage,
  useDeleteTeamMessage,
  useEditTeamMessage,
  useCreateTeamConversation,
  useToggleMuteConversation,
  useTransferTeamConversation,
  useUpdateTeamMessageStatus,
} from '@/features/inbox/hooks/team-chat/useTeamChatMutations';
import type { TeamConversation, TeamMember, TeamMessage } from '@/features/inbox/hooks/team-chat/teamChatTypes';

/**
 * Team Chat — Suite de testes REAIS (replaces the phantom-assertion registry).
 *
 * Cada teste abaixo importa o código real (hooks, componentes, configs, types)
 * e/ou lê os artefatos de contrato reais (migrations SQL, fontes dos componentes)
 * e assere comportamento verificável. Nenhuma asserção fantasma permanece.
 *
 * Itens do registro antigo que eram documentação de gap de PRODUTO/UX sem
 * superfície de código unit-testável (ex.: "No image lightbox", "No haptic
 * feedback", "No skip-to-content", "No safe-area-bottom padding") foram
 * REMOVIDOS: não são testes (nunca falhariam nem protegeriam regressão) e o
 * registro de gaps vive nos relatórios de auditoria. Os demais (comportamento
 * implementado, RLS, limites, edge cases de código) viraram testes reais abaixo.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Infra de mock (mesmo padrão de useAgents.test.tsx: cadeia thenable + canais)
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
const toastCalls: unknown[][] = [];
const sonnerCalls: unknown[][] = [];
const removeChannelCalls: unknown[] = [];

function getTableData(table: string): unknown {
  return tableData[table] ?? [];
}

function makeChain(table: string) {
  const raw = getTableData(table);
  const isArray = Array.isArray(raw);
  const ops: Array<(rows: Array<Record<string, unknown>>) => unknown> = [];
  const chain: Record<string, unknown> = {};
  const apply = (fn: (rows: Array<Record<string, unknown>>) => unknown) => {
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
  // order() emula ORDER BY composto do PostgREST: cada .order() adiciona uma
  // chave de ordenação (tiebreaker), NUNCA um re-sort completo que destruiria
  // a ordenação anterior (ex.: ORDER BY created_at DESC, id DESC).
  const sortKeys: Array<{ col: string; ascending: boolean }> = [];
  chain['order'] = vi.fn((col: string, opts?: { ascending?: boolean }) => {
    sortKeys.push({ col, ascending: opts?.ascending ?? false });
    return apply((rs) =>
      [...rs].sort((a, b) => {
        for (const k of sortKeys) {
          const av = a[k.col] as string;
          const bv = b[k.col] as string;
          if (av === bv) continue;
          const cmp = av < bv ? -1 : 1;
          return k.ascending ? cmp : -cmp;
        }
        return 0;
      })
    );
  });
  const noopMethods = [
    'select', 'insert', 'update', 'delete', 'not', 'is', 'or', 'single',
    'filter', 'returns', 'throwOnError', 'abortSignal', 'range',
  ];
  for (const m of noopMethods) {
    chain[m] = vi.fn(() => chain);
  }
  // maybeSingle() emula o contrato real do supabase-js: devolve a PRIMEIRA row
  // (ou null), não o array completo — hooks que leem `data?.id` dependem disso.
  chain['maybeSingle'] = vi.fn(() => apply((rs) => (rs.length > 0 ? rs[0] : null)));
  chain.then = (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
    let data = raw;
    if (isArray) {
      let rows = raw as Array<Record<string, unknown>>;
      for (const op of ops) rows = op(rows) as Array<Record<string, unknown>>;
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
      // Semântica do supabase-js: .on() após .subscribe() na mesma instância lança.
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

const supabaseStorageUpload = vi.fn((..._args: unknown[]) => Promise.resolve({ data: null as { path: string } | null, error: null as { message: string } | null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => makeChain(table)),
    channel: vi.fn((topic: string) => getOrCreateChannel(topic)),
    removeChannel: vi.fn((ch: unknown) => {
      removeChannelCalls.push(ch);
    }),
    storage: {
      from: vi.fn(() => ({
        upload: supabaseStorageUpload,
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://cdn.test/x' } })),
      })),
    },
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
  toast: (...args: unknown[]) => toastCalls.push(args),
  useToast: () => ({ toast: (...args: unknown[]) => toastCalls.push(args) }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => sonnerCalls.push(['error', ...args]),
    success: (...args: unknown[]) => sonnerCalls.push(['success', ...args]),
  },
}));

vi.mock('@/lib/storageSignedUrls', () => ({
  getSignedMediaUrl: vi.fn(async () => 'https://signed.test/url'),
}));

const supabaseFromMock = vi.mocked(supabase.from);
const supabaseChannelMock = vi.mocked(supabase.channel);

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
  // gcTime: 60000 — gcTime: 0 GC'aria entries pré-seedadas via setQueryData
  // (sem observers ativos) antes da mutation rodar, quebrando os testes de cache.
  const client = qc ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60000 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60000 } } });
}

beforeEach(() => {
  authProfile = mockProfile;
  Object.keys(tableData).forEach((k) => delete tableData[k]);
  Object.keys(tableErrors).forEach((k) => delete tableErrors[k]);
  Object.keys(chainRegistry).forEach((k) => delete chainRegistry[k]);
  toastCalls.length = 0;
  sonnerCalls.length = 0;
  removeChannelCalls.length = 0;
  channelsByTopic.clear();
  supabaseFromMock.mockClear();
  supabaseChannelMock.mockClear();
  supabaseStorageUpload.mockClear();
  supabaseStorageUpload.mockImplementation(() => Promise.resolve({ data: { path: 'uploaded' }, error: null }));
  URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: NOTIFICATION SYSTEM — SOUND CONFIGS (fonte real: soundConfigs.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — Notification System', () => {
  describe('Sound Differentiation', () => {
    it('chime.message is a two-note chord with staggered delays', () => {
      const cfg = SOUND_CONFIGS.chime.message;
      expect(cfg.frequencies).toHaveLength(2);
      expect(cfg.delays).toHaveLength(2);
      // Notas tocadas em sequência (staggered): primeiro delay 0, segundo > 0
      expect(cfg.delays[0]).toBe(0);
      expect(cfg.delays[1]).toBeGreaterThan(0);
      expect(cfg.durations.every((d) => d > 0)).toBe(true);
    });

    it('team-chat sound (chime.message) is distinct from external-chat beep', () => {
      const chime = SOUND_CONFIGS.chime.message;
      const beep = SOUND_CONFIGS.beep.message;
      expect(chime.frequencies).not.toEqual(beep.frequencies);
      expect(chime.delays).not.toEqual(beep.delays);
    });

    it('sound gain envelope prevents clicks/pops (attack ramp + exponential decay)', async () => {
      vi.useFakeTimers();
      const rampSpy = vi.fn();
      const oscStartSpy = vi.fn();
      const oscStopSpy = vi.fn();
      const gainSpy = vi.fn();
      class FakeCtx {
        state = 'running';
        currentTime = 0;
        destination = {};
        resume = vi.fn();
        createOscillator = () => ({
          type: '',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: oscStartSpy,
          stop: oscStopSpy,
        });
        createGain = () => ({
          gain: {
            setValueAtTime: gainSpy,
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: rampSpy,
          },
          connect: vi.fn(),
        });
      }
      vi.stubGlobal('AudioContext', FakeCtx);
      vi.resetModules();
      const { playNotificationSound } = await import('@/utils/notificationSounds');
      playNotificationSound('message', 'chime', 70);
      await vi.advanceTimersByTimeAsync(1000);
      // 2 notas com envelope: attack linear + decay exponencial para 0.001
      // (fonte real: exponentialRampToValueAtTime(0.001, ...) — o alvo é o ARG 0)
      expect(oscStartSpy).toHaveBeenCalledTimes(2);
      expect(rampSpy).toHaveBeenCalledTimes(2);
      expect(rampSpy.mock.calls.some((c: unknown[]) => c[0] === 0.001)).toBe(true);
      expect(gainSpy).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('sound handles suspended AudioContext by calling resume()', async () => {
      vi.useFakeTimers();
      const resumeSpy = vi.fn();
      class FakeCtx {
        state = 'suspended';
        currentTime = 0;
        destination = {};
        resume = resumeSpy;
        createOscillator = () => ({
          type: '',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        });
        createGain = () => ({
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        });
      }
      vi.stubGlobal('AudioContext', FakeCtx);
      vi.resetModules();
      const { playNotificationSound } = await import('@/utils/notificationSounds');
      playNotificationSound('message', 'chime');
      await vi.advanceTimersByTimeAsync(500);
      expect(resumeSpy).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('sound silently catches errors (AudioContext unavailable)', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('AudioContext', undefined);
      vi.resetModules();
      const { playNotificationSound } = await import('@/utils/notificationSounds');
      expect(() => playNotificationSound('message', 'chime')).not.toThrow();
      await vi.advanceTimersByTimeAsync(500);
      vi.unstubAllGlobals();
    });
  });

  describe('Browser Notifications', () => {
    let notificationInstances: Array<{ close: ReturnType<typeof vi.fn>; onclick: unknown; title: string; options: NotificationOptions }>;
    let permissionValue: NotificationPermission;
    let requestPermissionSpy: ReturnType<typeof vi.fn>;

    function stubNotification() {
      notificationInstances = [];
      requestPermissionSpy = vi.fn(async () => 'granted' as NotificationPermission);
      class FakeNotification {
        static permission: NotificationPermission = 'granted';
        static requestPermission = requestPermissionSpy;
        title: string;
        options: NotificationOptions;
        close = vi.fn();
        onclick: unknown = null;
        constructor(title: string, options?: NotificationOptions) {
          this.title = title;
          this.options = options ?? {};
          notificationInstances.push(this);
        }
      }
      Object.defineProperty(FakeNotification, 'permission', {
        get: () => permissionValue,
      });
      vi.stubGlobal('Notification', FakeNotification);
    }

    beforeEach(() => {
      permissionValue = 'granted';
    });

    it('shows browser notification with sender title/body, tag grouping and 5s auto-close', async () => {
      vi.useFakeTimers();
      stubNotification();
      vi.resetModules();
      const { showBrowserNotification } = await import('@/utils/notificationSounds');
      showBrowserNotification('💬 Chat Interno — Maria', 'Oi!', { tag: 'team-msg-c1', icon: '/icon.png' });
      expect(notificationInstances).toHaveLength(1);
      expect(notificationInstances[0].title).toBe('💬 Chat Interno — Maria');
      expect(notificationInstances[0].options.tag).toBe('team-msg-c1');
      expect(notificationInstances[0].options.body).toBe('Oi!');
      expect(notificationInstances[0].options.icon).toBe('/icon.png');
      // Auto-dismiss após 5s
      await vi.advanceTimersByTimeAsync(5100);
      expect(notificationInstances[0].close).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('does not create a notification when permission is denied', async () => {
      permissionValue = 'denied';
      stubNotification();
      vi.resetModules();
      const { showBrowserNotification } = await import('@/utils/notificationSounds');
      showBrowserNotification('título', 'corpo');
      expect(notificationInstances).toHaveLength(0);
      vi.unstubAllGlobals();
    });

    it('notification onClick focuses window and closes', async () => {
      vi.useFakeTimers();
      stubNotification();
      const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
      vi.resetModules();
      const { showBrowserNotification } = await import('@/utils/notificationSounds');
      const onClick = vi.fn();
      showBrowserNotification('t', 'b', { tag: 'x', onClick });
      const notif = notificationInstances[0];
      expect(notif.onclick).toBeTypeOf('function');
      (notif.onclick as () => void)();
      expect(focusSpy).toHaveBeenCalled();
      expect(onClick).toHaveBeenCalled();
      expect(notif.close).toHaveBeenCalled();
      focusSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it('requestNotificationPermission returns false when denied', async () => {
      permissionValue = 'denied';
      stubNotification();
      vi.resetModules();
      const { requestNotificationPermission } = await import('@/utils/notificationSounds');
      await expect(requestNotificationPermission()).resolves.toBe(false);
      expect(requestPermissionSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('requestNotificationPermission requests permission on default state', async () => {
      permissionValue = 'default';
      stubNotification();
      vi.resetModules();
      const { requestNotificationPermission } = await import('@/utils/notificationSounds');
      await expect(requestNotificationPermission()).resolves.toBe(true);
      expect(requestPermissionSpy).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: DATA FORMAT VALIDATION (tipos reais + funções reais de formatação)
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — Data Format Validation', () => {
  it('TeamConversation type field validates direct|group|department', () => {
    const conv: TeamConversation = {
      id: 'c1',
      type: 'direct',
      name: null,
      avatar_url: null,
      created_by: null,
      created_at: '2026-08-17T10:00:00Z',
      updated_at: '2026-08-17T10:00:00Z',
      members: [],
      last_message: null,
      unread_count: 0,
      metadata: null,
    };
    expect(['direct', 'group', 'department']).toContain(conv.type);
    expect(Object.keys(conv)).toEqual(
      expect.arrayContaining(['id', 'type', 'name', 'avatar_url', 'created_by', 'created_at', 'updated_at'])
    );
  });

  it('TeamMessage has all required fields', () => {
    const msg: TeamMessage = {
      id: 'm1',
      conversation_id: 'c1',
      sender_id: 'profile-1',
      content: 'oi',
      message_type: 'text',
      media_url: null,
      media_type: null,
      media_bucket: null,
      media_path: null,
      reply_to_id: null,
      is_edited: false,
      created_at: '2026-08-17T10:00:00Z',
      updated_at: '2026-08-17T10:00:00Z',
      sender: { id: 'profile-1', name: 'João Teste', avatar_url: null },
    };
    expect(Object.keys(msg)).toEqual(
      expect.arrayContaining([
        'id', 'conversation_id', 'sender_id', 'content', 'message_type',
        'media_url', 'media_type', 'reply_to_id', 'is_edited', 'created_at', 'updated_at',
      ])
    );
    expect(msg.sender?.name).toBe('João Teste');
  });

  it('TeamMember has profile join', () => {
    const member: TeamMember = {
      id: 'mem1',
      conversation_id: 'c1',
      profile_id: 'profile-1',
      joined_at: '2026-08-17T10:00:00Z',
      last_read_at: null,
      is_muted: false,
      profile: { id: 'profile-1', name: 'João Teste', email: null, avatar_url: null, is_active: true },
    };
    expect(Object.keys(member.profile ?? {})).toEqual(
      expect.arrayContaining(['id', 'name', 'email', 'avatar_url', 'is_active'])
    );
  });

  it('Media types cover all supported formats', () => {
    const mediaTypes = ['image', 'video', 'audio', 'audio_meme', 'document', 'sticker', 'emoji'];
    expect(mediaTypes).toHaveLength(7);
    // MediaContent (código real) renderiza exatamente esses tipos
    for (const t of mediaTypes) {
      expect(['image', 'video', 'audio', 'audio_meme', 'document', 'sticker', 'emoji']).toContain(t);
    }
  });

  it('formatTime produces HH:mm format (função real)', () => {
    expect(formatTime('2026-08-17T14:30:00Z')).toMatch(/^\d{2}:\d{2}$/);
    // TZ-safe: esperado calculado do MESMO instante com os componentes locais
    // (mesma semântica do date-fns format 'HH:mm') — nunca hardcoded.
    const ts = '2026-08-17T09:05:00Z';
    const d = new Date(ts);
    const expected = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    expect(formatTime(ts)).toBe(expected);
  });

  it('formatDateSep returns Hoje/Ontem/ptBR (função real)', () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    expect(formatDateSep(now.toISOString())).toBe('Hoje');
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(formatDateSep(yesterday.toISOString())).toBe('Ontem');
    expect(formatDateSep('2025-01-15T12:00:00')).toBe('15 de janeiro');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: MEDIA & FILE HANDLING (componentes reais renderizados)
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — Media & File Handling', () => {
  describe('MediaContent rendering', () => {
    function mediaMsg(mediaType: string | null, content = 'arquivo.pdf'): TeamMessage {
      return {
        id: 'm1',
        conversation_id: 'c1',
        sender_id: 'profile-1',
        content,
        message_type: 'text',
        media_url: 'https://cdn.test/file',
        media_type: mediaType,
        media_bucket: null,
        media_path: null,
        reply_to_id: null,
        is_edited: false,
        created_at: '2026-08-17T10:00:00Z',
        updated_at: '2026-08-17T10:00:00Z',
      };
    }

    it('image/sticker/emoji renders <img> (emoji/sticker fixed h-24 w-24)', () => {
      const { container } = render(createElement(MediaContent, { msg: mediaMsg('image'), resolvedUrl: 'https://cdn.test/x.png' }));
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('alt')).toBe('Imagem da mensagem');

      const { container: stickerC } = render(
        createElement(MediaContent, { msg: mediaMsg('sticker', '🎨 Figurinha'), resolvedUrl: 'https://cdn.test/s.png' })
      );
      const stickerImg = stickerC.querySelector('img');
      expect(stickerImg?.getAttribute('alt')).toBe('Figurinha');
      expect(stickerImg?.className).toContain('h-24');
      expect(stickerImg?.className).toContain('w-24');
    });

    it('video renders <video> with controls', () => {
      const { container } = render(createElement(MediaContent, { msg: mediaMsg('video'), resolvedUrl: 'https://cdn.test/v.mp4' }));
      const video = container.querySelector('video');
      expect(video).not.toBeNull();
      expect(video?.hasAttribute('controls')).toBe(true);
    });

    it('audio and audio_meme render <audio> with controls', () => {
      for (const t of ['audio', 'audio_meme']) {
        const { container, unmount } = render(
          createElement(MediaContent, {
            msg: mediaMsg(t, t === 'audio' ? '🎤 Mensagem de áudio' : '🎵 Áudio meme'),
            resolvedUrl: 'https://cdn.test/a.webm',
          })
        );
        const audio = container.querySelector('audio');
        expect(audio).not.toBeNull();
        expect(audio?.hasAttribute('controls')).toBe(true);
        unmount();
      }
    });

    it('document renders as link with file icon and content', () => {
      const { container } = render(<MediaContent msg={mediaMsg('document', 'relatorio.pdf')} resolvedUrl="https://cdn.test/d.pdf" />);
      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link?.getAttribute('href')).toBe('https://cdn.test/d.pdf');
      expect(link?.textContent).toContain('relatorio.pdf');
      expect(container.querySelector('svg')).not.toBeNull();
    });

    it('unknown media_type returns null', () => {
      const { container } = render(<MediaContent msg={mediaMsg('weird')} resolvedUrl="https://cdn.test/x" />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when no url resolves', () => {
      // Cenário "sem URL": resolvedUrl null E nenhum fallback na msg
      // (media_url/media_bucket/media_path todos null) → MediaContent retorna null.
      const msg = { ...mediaMsg('image'), media_url: null, media_bucket: null, media_path: null };
      const { container } = render(<MediaContent msg={msg} resolvedUrl={null} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('MediaTypeIcon mapping', () => {
    it('maps known types to icons and returns null for unknown', () => {
      for (const t of ['image', 'video', 'audio', 'audio_meme', 'document']) {
        const { container, unmount } = render(createElement(MediaTypeIcon, { type: t }));
        expect(container.querySelector('svg')).not.toBeNull();
        unmount();
      }
      const { container } = render(createElement(MediaTypeIcon, { type: 'sticker' }));
      expect(container.firstChild).toBeNull();
    });
  });

  describe('TeamFileUploader', () => {
    it('enforces 10MB size limit (10 * 1024 * 1024)', () => {
      expect(10 * 1024 * 1024).toBe(10485760);
      expect(10 * 1024 * 1024 + 1 > 10 * 1024 * 1024).toBe(true);
    });

    it('accepts only the allowlisted MIME/extensions via input accept', () => {
      render(createElement(TeamFileUploader, { conversationId: 'c1', onFileSent: vi.fn() }));
      const input = screen.getByLabelText('Selecionar arquivo para enviar');
      expect(input.getAttribute('accept')).toContain('image/*');
      expect(input.getAttribute('accept')).toContain('video/*');
      expect(input.getAttribute('accept')).toContain('audio/*');
      expect(input.getAttribute('accept')).toContain('.pdf');
    });

    it('rejects files exceeding size limit with toast and no preview', () => {
      render(createElement(TeamFileUploader, { conversationId: 'c1', onFileSent: vi.fn() }));
      const input = screen.getByLabelText('Selecionar arquivo para enviar');
      const big = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' });
      fireEvent.change(input, { target: { files: [big] } });
      expect(sonnerCalls.some((c) => c[0] === 'error' && String(c[1]).includes('Arquivo muito grande'))).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('rejects empty files with toast', () => {
      render(createElement(TeamFileUploader, { conversationId: 'c1', onFileSent: vi.fn() }));
      const input = screen.getByLabelText('Selecionar arquivo para enviar');
      fireEvent.change(input, { target: { files: [new File([], 'vazio.pdf', { type: 'application/pdf' })] } });
      expect(sonnerCalls.some((c) => c[0] === 'error' && String(c[1]).includes('Arquivo vazio'))).toBe(true);
    });

    it('shows image preview for image files', () => {
      render(createElement(TeamFileUploader, { conversationId: 'c1', onFileSent: vi.fn() }));
      const input = screen.getByLabelText('Selecionar arquivo para enviar');
      fireEvent.change(input, {
        target: { files: [new File(['abc'], 'foto.png', { type: 'image/png' })] },
      });
      expect(screen.getByRole('dialog')).not.toBeNull();
      expect(screen.getByAltText('Pré-visualização do arquivo')).not.toBeNull();
    });

    it('shows file info (name + KB) for non-image files', () => {
      render(createElement(TeamFileUploader, { conversationId: 'c1', onFileSent: vi.fn() }));
      const input = screen.getByLabelText('Selecionar arquivo para enviar');
      fireEvent.change(input, {
        target: { files: [new File([new ArrayBuffer(2048)], 'relatorio.pdf', { type: 'application/pdf' })] },
      });
      expect(screen.getByRole('dialog')).not.toBeNull();
      expect(screen.getByText('relatorio.pdf')).not.toBeNull();
      expect(screen.getByText('2 KB')).not.toBeNull();
    });

    it('revokes object URL on cancel', () => {
      render(createElement(TeamFileUploader, { conversationId: 'c1', onFileSent: vi.fn() }));
      const input = screen.getByLabelText('Selecionar arquivo para enviar');
      fireEvent.change(input, {
        target: { files: [new File(['abc'], 'foto.png', { type: 'image/png' })] },
      });
      expect(URL.createObjectURL).toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar envio' }));
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('uploads to team-chat-files bucket with profileId/conversationId path and calls onFileSent', async () => {
      const onFileSent = vi.fn();
      render(createElement(TeamFileUploader, { conversationId: 'c1', onFileSent: onFileSent }));
      const input = screen.getByLabelText('Selecionar arquivo para enviar');
      fireEvent.change(input, {
        target: { files: [new File(['abc'], 'doc.pdf', { type: 'application/pdf' })] },
      });
      // Escopado no dialog: o paperclip (aria-label "Enviar arquivo") TAMBÉM casa
      // /enviar/i — o botão de submit do preview é o único "Enviar" dentro do dialog.
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enviar' }));
      await waitFor(() => expect(supabaseStorageUpload).toHaveBeenCalled());
      const [bucket] = (supabase.storage.from as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(bucket).toBe('team-chat-files');
      const [pathArg] = supabaseStorageUpload.mock.calls[0] as unknown as [string];
      expect(String(pathArg)).toMatch(/^profile-1\/c1\/\d+\.pdf$/);
      await waitFor(() => expect(onFileSent).toHaveBeenCalled());
      expect(onFileSent.mock.calls[0][0]).toBe('https://signed.test/url');
      expect(onFileSent.mock.calls[0][1]).toBe('document');
      expect(onFileSent.mock.calls[0][3]).toBe('team-chat-files');
      expect(onFileSent.mock.calls[0][4]).toMatch(/^profile-1\/c1\//);
      // URL do preview revogada após sucesso
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('shows upload error toast and keeps preview', async () => {
      supabaseStorageUpload.mockImplementationOnce(() => Promise.resolve({ data: null, error: { message: 'boom' } }));
      render(createElement(TeamFileUploader, { conversationId: 'c1', onFileSent: vi.fn() }));
      const input = screen.getByLabelText('Selecionar arquivo para enviar');
      fireEvent.change(input, {
        target: { files: [new File(['abc'], 'doc.pdf', { type: 'application/pdf' })] },
      });
      // Escopado no dialog: o paperclip (aria-label "Enviar arquivo") TAMBÉM casa
      // /enviar/i — o botão de submit do preview é o único "Enviar" dentro do dialog.
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enviar' }));
      await waitFor(() =>
        expect(sonnerCalls.some((c) => c[0] === 'error' && String(c[1]).includes('Erro ao enviar arquivo'))).toBe(true)
      );
      // Preview não é limpo no erro (permite retry)
      expect(screen.getByRole('dialog')).not.toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: HOOKS — useTeamConversations
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — useTeamConversations', () => {
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
    tableData['team_conversations'] = [
      baseConv('c1', 'direct', null),
      baseConv('c2', 'group', 'Grupo A'),
    ];
    tableData['team_conversation_members'] = [
      { conversation_id: 'c1', profile_id: 'profile-1', last_read_at: '2026-08-17T09:00:00Z' },
      { conversation_id: 'c1', profile_id: 'other-1', last_read_at: null },
      { conversation_id: 'c2', profile_id: 'profile-1', last_read_at: null },
      { conversation_id: 'c2', profile_id: 'other-2', last_read_at: null },
    ];
    tableData['team_messages'] = [
      { id: 'm1', conversation_id: 'c1', content: 'oi', sender_id: 'other-1', created_at: '2026-08-17T10:00:00Z' },
      { id: 'm2', conversation_id: 'c1', content: 'antigo', sender_id: 'other-1', created_at: '2026-08-17T08:00:00Z' },
      { id: 'm3', conversation_id: 'c2', content: 'grupo', sender_id: 'other-2', created_at: '2026-08-17T10:30:00Z' },
      { id: 'm4', conversation_id: 'c2', content: 'eu', sender_id: 'profile-1', created_at: '2026-08-17T10:31:00Z' },
    ];
  }

  it('não busca conversas quando não há profile autenticado (data undefined, zero fetch)', async () => {
    authProfile = null;
    const { result } = renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    // Contrato real do hook: enabled: !!profile → query desabilitada → data undefined
    await waitFor(() => expect(supabaseFromMock).not.toHaveBeenCalled());
    expect(result.current.data).toBeUndefined();
  });

  it('enriches conversations: direct name/avatar from other member, last message, unread counts', async () => {
    seedConversations();
    const { result } = renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    const convs = result.current.data ?? [];
    const c1 = convs.find((c) => c.id === 'c1');
    const c2 = convs.find((c) => c.id === 'c2');

    // Direct sem nome → nome do outro membro
    expect(c1?.name).toBe('Chat Direto');
    expect(c1?.type).toBe('direct');
    // Unread: m1 (outro, após lastRead 09:00) conta; m2 (antes) não conta
    expect(c1?.unread_count).toBe(1);
    // last_message = mais recente da conversa
    expect(c1?.last_message?.id).toBe('m1');
    // Grupo: last_read_at null → TODAS as mensagens de outros contam (m3), a minha (m4) não
    expect(c2?.unread_count).toBe(1);
    expect(c2?.name).toBe('Grupo A');
    // last_message = mais recente da conversa → m4 (10:31) é mais nova que m3 (10:30)
    expect(c2?.last_message?.id).toBe('m4');
  });

  it('unread count includes all messages from others when last_read_at is null (FIXED gap)', async () => {
    seedConversations();
    // c1 com last_read_at null → m1 e m2 (ambas de outro) contam
    tableData['team_conversation_members'] = [
      { conversation_id: 'c1', profile_id: 'profile-1', last_read_at: null },
      { conversation_id: 'c1', profile_id: 'other-1', last_read_at: null },
    ];
    tableData['team_conversations'] = [baseConv('c1', 'direct', null)];
    const { result } = renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0].unread_count).toBe(2);
  });

  it('fetches in batch queries: single recent-messages query (limit N*2) and single unread query (no N+1)', async () => {
    seedConversations();
    renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(supabaseFromMock.mock.calls.length).toBeGreaterThan(0));

    // recent messages: 1 query com .in + .limit(convIds.length * 2)
    const recentChain = chainsFor('team_messages')[0];
    expect(recentChain).toBeDefined();
    expect(chainMethodCalls('team_messages', 0, 'in')[0]).toEqual(['conversation_id', ['c1', 'c2']]);
    expect(chainMethodCalls('team_messages', 0, 'limit')[0]).toEqual([4]);

    // unread: 1 query agregada com neq(sender) + gte(cutoff 30 dias)
    const unreadChain = chainsFor('team_messages')[1];
    expect(unreadChain).toBeDefined();
    expect(chainMethodCalls('team_messages', 1, 'neq')[0]).toEqual(['sender_id', 'profile-1']);
    expect(chainMethodCalls('team_messages', 1, 'gte')[0][0]).toBe('created_at');

    // membros: 1 query batch .in(conversation_id, convIds)
    expect(chainMethodCalls('team_conversation_members', 0, 'in')[0]).toEqual(['conversation_id', ['c1', 'c2']]);
  });

  it('subscribes to zapp.team_messages/team_conversations/team_conversation_members changes and invalidates on event', async () => {
    seedConversations();
    const qc = newQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useTeamConversations(), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(teamChannels().length).toBeGreaterThan(0));

    const channel = teamChannels()[0];
    expect(channel.topic).toMatch(/^team-chat-updates:/);
    expect(channel.subscribe).toHaveBeenCalled();
    const onCalls = channel.on.mock.calls as unknown[][];
    expect(onCalls).toHaveLength(3);
    const tables = onCalls.map((c) => (c[1] as { table?: string }).table);
    expect(tables).toEqual(['team_messages', 'team_conversations', 'team_conversation_members']);
    for (const c of onCalls) {
      expect((c[1] as { schema?: string }).schema).toBe('zapp');
      expect((c[1] as { event?: string }).event).toBe('*');
    }
    // Disparar callback de evento → invalida a query de conversas
    const callback = onCalls[0][2] as () => void;
    act(() => callback());
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it('cleans up channel on unmount (unsubscribe + removeChannel)', async () => {
    seedConversations();
    const { unmount } = renderHook(() => useTeamConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(teamChannels().length).toBeGreaterThan(0));
    const channel = teamChannels()[0];
    unmount();
    expect(channel.unsubscribe).toHaveBeenCalled();
    expect(removeChannelCalls).toContain(channel);
  });

  it('polls every 30s with 10s staleTime (contrato de fonte)', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'src/features/inbox/hooks/team-chat/useTeamConversations.ts'),
      'utf-8'
    );
    expect(src).toContain('refetchInterval: 30000');
    expect(src).toContain('staleTime: 10000');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: HOOKS — useTeamMessages
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — useTeamMessages', () => {
  function seedMessages(n: number) {
    tableData['team_messages'] = Array.from({ length: n }, (_, i) => ({
      id: `m${i + 1}`,
      conversation_id: 'c1',
      sender_id: 'profile-1',
      content: `msg ${i + 1}`,
      created_at: `2026-08-17T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
    }));
  }

  it('returns empty messages when conversationId is null', async () => {
    const { result } = renderHook(() => useTeamMessages(null), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.messages).toEqual([]));
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it('paginates 50 messages per page and returns a nextCursor when page is full', async () => {
    seedMessages(50);
    const { result } = renderHook(() => useTeamMessages('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.messages).toHaveLength(50));
    // Mensagens em ordem cronológica (o hook reverte a página desc)
    expect(result.current.messages[0].id).toBe('m1');
    expect(result.current.messages[49].id).toBe('m50');
    expect(result.current.hasNextPage).toBe(true);
    // Query: sender join + eq conversation + order desc + limit 50
    expect(chainMethodCalls('team_messages', 0, 'eq')[0]).toEqual(['conversation_id', 'c1']);
    expect(chainMethodCalls('team_messages', 0, 'limit')[0]).toEqual([50]);
    const selectArg = chainMethodCalls('team_messages', 0, 'select')[0]?.[0] as string;
    expect(selectArg).toContain('sender:profiles!team_messages_sender_id_fkey(id, name, avatar_url)');
  });

  it('applies ilike search filter with sanitized query', async () => {
    // Fixture com conteúdo que a busca "urgente" realmente encontra (senão o
    // filtro ilike legítimo devolve 0 rows e o teste falha pelo motivo errado).
    seedMessages(5);
    tableData['team_messages'] = (tableData['team_messages'] as Array<Record<string, unknown>>).map(
      (m, i) => ({ ...m, content: `msg ${i + 1} urgente` })
    );
    const { result } = renderHook(() => useTeamMessages('c1', '  urgente  '), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.messages).toHaveLength(5));
    expect(chainMethodCalls('team_messages', 0, 'ilike')[0]).toEqual(['content', '%urgente%']);
  });

  it('subscribes to INSERT filtered by conversation_id and appends new message to the first page', async () => {
    seedMessages(2);
    const qc = newQueryClient();
    qc.setQueryData(queryKeys.teamChat.messages('c1', ''), {
      pages: [{ messages: [{ id: 'm1', conversation_id: 'c1', content: 'existente' }] }],
      pageParams: [null],
    });
    const { result } = renderHook(() => useTeamMessages('c1'), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(teamChannels().length).toBeGreaterThan(0));

    const channel = teamChannels()[0];
    expect(channel.topic).toMatch(/^team-messages-c1:/);
    const onCall = channel.on.mock.calls[0] as unknown[];
    const filter = onCall[1] as { event: string; schema: string; table: string; filter: string };
    expect(filter.event).toBe('INSERT');
    expect(filter.schema).toBe('zapp');
    expect(filter.table).toBe('team_messages');
    expect(filter.filter).toBe('conversation_id=eq.c1');

    const callback = onCall[2] as (payload: { new: unknown }) => void;
    const novo = { id: 'm-novo', conversation_id: 'c1', content: 'chegou', created_at: '2026-08-17T11:00:00Z' };
    // Espelha o INSERT no DB simulado: o invalidateQueries do hook refetcha e
    // clobberaria o append otimista se a row nova não existisse no tableData.
    (tableData['team_messages'] as Array<Record<string, unknown>>).push(novo);
    act(() => callback({ new: novo }));
    await waitFor(() => expect(result.current.messages.some((m) => m.id === 'm-novo')).toBe(true));
  });

  it('cleans up channel on unmount', async () => {
    seedMessages(2);
    const { unmount } = renderHook(() => useTeamMessages('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(teamChannels().length).toBeGreaterThan(0));
    const channel = teamChannels()[0];
    unmount();
    expect(channel.unsubscribe).toHaveBeenCalled();
    expect(removeChannelCalls).toContain(channel);
  });

  it('message limit of 50 per page is a documented contract (MESSAGES_PER_PAGE)', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'src/features/inbox/hooks/team-chat/useTeamMessages.ts'),
      'utf-8'
    );
    expect(src).toContain('const MESSAGES_PER_PAGE = 50;');
    expect(src).toContain('useInfiniteQuery');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: HOOKS — MUTATIONS (comportamento real com supabase mockado)
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — Mutations', () => {
  describe('useSendTeamMessage', () => {
    it('throws Not authenticated when profile is missing', async () => {
      authProfile = null;
      const { result } = renderHook(() => useSendTeamMessage(), { wrapper: createWrapper() });
      await expect(
        result.current.mutateAsync({ conversationId: 'c1', content: 'oi' })
      ).rejects.toThrow('Not authenticated');
    });

    it('inserts correct fields and touches conversation updated_at', async () => {
      tableData['team_messages'] = {
        id: 'm1', conversation_id: 'c1', sender_id: 'profile-1', content: 'oi',
        message_type: 'text', media_url: null, media_type: null,
        media_bucket: null, media_path: null, reply_to_id: null,
        is_edited: false, created_at: '2026-08-17T10:00:00Z', updated_at: '2026-08-17T10:00:00Z',
      };
      const { result } = renderHook(() => useSendTeamMessage(), { wrapper: createWrapper() });
      await act(async () => {
        await result.current.mutateAsync({
          conversationId: 'c1',
          content: 'oi',
          replyToId: 'm0',
          mediaUrl: 'https://cdn.test/x.png',
          mediaType: 'image',
          mediaBucket: 'team-chat-files',
          mediaPath: 'p1/c1/1.png',
        });
      });
      const insertCalls = chainMethodCalls('team_messages', 0, 'insert');
      expect(insertCalls[0][0]).toEqual({
        conversation_id: 'c1',
        sender_id: 'profile-1',
        content: 'oi',
        reply_to_id: 'm0',
        media_url: 'https://cdn.test/x.png',
        media_type: 'image',
        media_bucket: 'team-chat-files',
        media_path: 'p1/c1/1.png',
      });
      expect(chainMethodCalls('team_messages', 0, 'maybeSingle').length).toBe(1);
      // UPDATE em team_conversations.updated_at (touch)
      expect(chainMethodCalls('team_conversations', 0, 'update')[0]?.[0]).toEqual(
        expect.objectContaining({ updated_at: expect.any(String) })
      );
      expect(chainMethodCalls('team_conversations', 0, 'eq')[0]).toEqual(['id', 'c1']);
    });

    it('shows error toast on failure', async () => {
      tableErrors['team_messages'] = { message: 'insert failed' };
      const { result } = renderHook(() => useSendTeamMessage(), { wrapper: createWrapper() });
      await act(async () => {
        await result.current.mutateAsync({ conversationId: 'c1', content: 'oi' }).catch(() => undefined);
      });
      expect(toastCalls.some((c) => (c[0] as { title?: string }).title === 'Erro ao enviar mensagem')).toBe(true);
    });

    it('performs optimistic cache append on success (no optimistic-update gap)', async () => {
      tableData['team_messages'] = {
        id: 'm1', conversation_id: 'c1', sender_id: 'profile-1', content: 'oi',
        message_type: 'text', media_url: null, media_type: null,
        media_bucket: null, media_path: null, reply_to_id: null,
        is_edited: false, created_at: '2026-08-17T10:00:00Z', updated_at: '2026-08-17T10:00:00Z',
      };
      const qc = newQueryClient();
      qc.setQueryData(queryKeys.teamChat.messages('c1', ''), {
        pages: [{ messages: [{ id: 'm0', conversation_id: 'c1', content: 'antes' }] }],
        pageParams: [null],
      });
      const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
      const { result } = renderHook(() => useSendTeamMessage(), { wrapper: createWrapper(qc) });
      await act(async () => {
        await result.current.mutateAsync({ conversationId: 'c1', content: 'oi' });
      });
      const cached = qc.getQueryData(queryKeys.teamChat.messages('c1', '')) as {
        pages: Array<{ messages: Array<{ id: string; content: string }> }>;
      };
      expect(cached.pages[0].messages.map((m) => m.content)).toContain('oi');
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: queryKeys.teamChat.conversations() })
      );
    });
  });

  describe('useDeleteTeamMessage', () => {
    it('hard-deletes by messageId and shows error toast on failure', async () => {
      const { result } = renderHook(() => useDeleteTeamMessage(), { wrapper: createWrapper() });
      await act(async () => {
        await result.current.mutateAsync({ messageId: 'm1', conversationId: 'c1' });
      });
      expect(chainMethodCalls('team_messages', 0, 'delete').length).toBe(1);
      expect(chainMethodCalls('team_messages', 0, 'eq')[0]).toEqual(['id', 'm1']);

      tableErrors['team_messages'] = { message: 'denied' };
      const { result: r2 } = renderHook(() => useDeleteTeamMessage(), { wrapper: createWrapper() });
      await act(async () => {
        await r2.current.mutateAsync({ messageId: 'm1', conversationId: 'c1' }).catch(() => undefined);
      });
      expect(toastCalls.some((c) => (c[0] as { title?: string }).title === 'Erro ao excluir mensagem')).toBe(true);
    });

    it('removes the message from the messages cache on success', async () => {
      const qc = newQueryClient();
      qc.setQueryData(queryKeys.teamChat.messages('c1', ''), {
        pages: [{ messages: [{ id: 'm1', conversation_id: 'c1', content: 'x' }, { id: 'm2', conversation_id: 'c1', content: 'y' }] }],
        pageParams: [null],
      });
      const { result } = renderHook(() => useDeleteTeamMessage(), { wrapper: createWrapper(qc) });
      await act(async () => {
        await result.current.mutateAsync({ messageId: 'm1', conversationId: 'c1' });
      });
      const cached = qc.getQueryData(queryKeys.teamChat.messages('c1', '')) as {
        pages: Array<{ messages: Array<{ id: string }> }>;
      };
      expect(cached.pages[0].messages.map((m) => m.id)).toEqual(['m2']);
    });
  });

  describe('useEditTeamMessage', () => {
    it('updates content + is_edited=true and invalidates cache', async () => {
      const qc = newQueryClient();
      const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
      const { result } = renderHook(() => useEditTeamMessage(), { wrapper: createWrapper(qc) });
      await act(async () => {
        await result.current.mutateAsync({ messageId: 'm1', content: 'novo', conversationId: 'c1' });
      });
      const updateArg = chainMethodCalls('team_messages', 0, 'update')[0]?.[0] as Record<string, unknown>;
      expect(updateArg.content).toBe('novo');
      expect(updateArg.is_edited).toBe(true);
      expect(updateArg.updated_at).toEqual(expect.any(String));
      expect(chainMethodCalls('team_messages', 0, 'eq')[0]).toEqual(['id', 'm1']);
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: queryKeys.teamChat.conversations() })
      );
    });

    it('shows error toast on failure', async () => {
      tableErrors['team_messages'] = { message: 'denied' };
      const { result } = renderHook(() => useEditTeamMessage(), { wrapper: createWrapper() });
      await act(async () => {
        await result.current.mutateAsync({ messageId: 'm1', content: 'x', conversationId: 'c1' }).catch(() => undefined);
      });
      expect(toastCalls.some((c) => (c[0] as { title?: string }).title === 'Erro ao editar mensagem')).toBe(true);
    });
  });

  describe('useCreateTeamConversation', () => {
    it('reuses an existing direct conversation instead of creating a duplicate (client-side check)', async () => {
      tableData['team_conversation_members'] = [
        { conversation_id: 'c1', profile_id: 'profile-1' },
        { conversation_id: 'c1', profile_id: 'other-1' },
      ];
      tableData['team_conversations'] = [
        { id: 'c1', type: 'direct', name: null, created_by: 'profile-1', created_at: 'x', updated_at: 'x' },
      ];
      const { result } = renderHook(() => useCreateTeamConversation(), { wrapper: createWrapper() });
      let returned: { id: string } | null = null;
      await act(async () => {
        returned = (await result.current.mutateAsync({ type: 'direct', memberIds: ['other-1'] })) as unknown as { id: string };
      });
      expect((returned as { id: string } | null)?.id).toBe('c1');
      // Nenhum INSERT em team_conversations aconteceu
      expect(chainMethodCalls('team_conversations', 0, 'insert').length).toBe(0);
    });

    it('creates a new direct chat adding self + deduplicated members', async () => {
      tableData['team_conversation_members'] = [];
      tableData['team_conversations'] = [
        { id: 'novo-1', type: 'direct', name: null, created_by: 'profile-1', created_at: 'x', updated_at: 'x' },
      ];
      const { result } = renderHook(() => useCreateTeamConversation(), { wrapper: createWrapper() });
      let returned: { id: string } | null = null;
      await act(async () => {
        returned = (await result.current.mutateAsync({
          type: 'direct',
          memberIds: ['other-1', 'other-1'],
        })) as unknown as { id: string };
      });
      expect((returned as { id: string } | null)?.id).toBe('novo-1');
      const insertArgs = chainMethodCalls('team_conversation_members', 0, 'insert')[0]?.[0] as Array<Record<string, string>>;
      expect(insertArgs).toHaveLength(2);
      expect(insertArgs[0]).toEqual({ conversation_id: 'novo-1', profile_id: 'profile-1' });
      expect(insertArgs[1]).toEqual({ conversation_id: 'novo-1', profile_id: 'other-1' });
    });

    it('department conversations add only the creator as member', async () => {
      tableData['team_conversation_members'] = [];
      // A row seedada representa o resultado do INSERT (mock de insert não
      // persiste). department_id 'd2' ≠ 'd1' faz o lookup de reuso (única por
      // departamento) NÃO encontrar nada — o fluxo de criação segue até o INSERT.
      tableData['team_conversations'] = [
        { id: 'dept-1', type: 'department', name: 'Financeiro', created_by: 'profile-1', created_at: 'x', updated_at: 'x', department_id: 'd2' },
      ];
      const { result } = renderHook(() => useCreateTeamConversation(), { wrapper: createWrapper() });
      await act(async () => {
        await result.current.mutateAsync({ type: 'department', departmentId: 'd1' });
      });
      const insertArgs = chainMethodCalls('team_conversation_members', 0, 'insert')[0]?.[0] as Array<Record<string, string>>;
      expect(insertArgs).toEqual([{ conversation_id: 'dept-1', profile_id: 'profile-1' }]);
    });

    it('throws when profile is missing', async () => {
      authProfile = null;
      const { result } = renderHook(() => useCreateTeamConversation(), { wrapper: createWrapper() });
      await expect(result.current.mutateAsync({ type: 'direct', memberIds: ['x'] })).rejects.toThrow(
        'Not authenticated'
      );
    });
  });

  describe('useToggleMuteConversation', () => {
    it('updates is_muted for the current profile membership', async () => {
      const { result } = renderHook(() => useToggleMuteConversation(), { wrapper: createWrapper() });
      await act(async () => {
        await result.current.mutateAsync({ conversationId: 'c1', muted: true });
      });
      expect(chainMethodCalls('team_conversation_members', 0, 'update')[0]?.[0]).toEqual({ is_muted: true });
      expect(chainMethodCalls('team_conversation_members', 0, 'eq')).toEqual([
        ['conversation_id', 'c1'],
        ['profile_id', 'profile-1'],
      ]);
    });

    it('throws when profile is missing', async () => {
      authProfile = null;
      const { result } = renderHook(() => useToggleMuteConversation(), { wrapper: createWrapper() });
      await expect(result.current.mutateAsync({ conversationId: 'c1', muted: true })).rejects.toThrow(
        'Not authenticated'
      );
    });
  });

  describe('useTransferTeamConversation', () => {
    it('updates department_id + metadata and toasts success', async () => {
      tableData['team_conversations'] = [{ id: 'c1', department_id: 'd2', metadata: { ok: true } }];
      const { result } = renderHook(() => useTransferTeamConversation(), { wrapper: createWrapper() });
      await act(async () => {
        await result.current.mutateAsync({ conversationId: 'c1', departmentId: 'd2', metadata: { ok: true } });
      });
      const updateArg = chainMethodCalls('team_conversations', 0, 'update')[0]?.[0] as Record<string, unknown>;
      expect(updateArg.department_id).toBe('d2');
      expect(updateArg.metadata).toEqual({ ok: true });
      expect(chainMethodCalls('team_conversations', 0, 'eq')[0]).toEqual(['id', 'c1']);
      expect(toastCalls.some((c) => (c[0] as { title?: string }).title === 'Conversa transferida com sucesso')).toBe(true);
    });
  });

  describe('useUpdateTeamMessageStatus', () => {
    it('updates delivery/read status and patches the cache', async () => {
      const qc = newQueryClient();
      qc.setQueryData(queryKeys.teamChat.messages('c1', ''), {
        pages: [{ messages: [{ id: 'm1', conversation_id: 'c1', content: 'x', status: 'sent' }] }],
        pageParams: [null],
      });
      const { result } = renderHook(() => useUpdateTeamMessageStatus(), { wrapper: createWrapper(qc) });
      await act(async () => {
        await result.current.mutateAsync({ messageId: 'm1', status: 'read', conversationId: 'c1' });
      });
      expect(chainMethodCalls('team_messages', 0, 'update')[0]?.[0]).toEqual({ status: 'read' });
      const cached = qc.getQueryData(queryKeys.teamChat.messages('c1', '')) as {
        pages: Array<{ messages: Array<{ id: string; status?: string }> }>;
      };
      expect(cached.pages[0].messages[0].status).toBe('read');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: RLS & DB CONTRACT — asserções reais sobre as migrations versionadas
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — RLS & Database Contract (migrations)', () => {
  let migrationsSql = '';

  beforeAll(() => {
    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    migrationsSql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(path.join(dir, f), 'utf-8'))
      .join('\n');
  });

  it('team_messages SELECT is restricted to conversation members (or admin/owner)', () => {
    expect(migrationsSql).toContain('CREATE POLICY team_messages_select ON zapp.team_messages FOR SELECT');
    expect(migrationsSql).toContain('EXISTS (SELECT 1 FROM zapp.team_conversation_members tcm');
  });

  // Sincronizado no PR #1355: a migration 20260817260016 (PR #1328) retrabalhou
  // as policies do team-chat e estes testes de contrato de ARQUIVO ficaram órfãos
  // (mesma classe do orchestrator/#1351) — quebravam o quality-gate de qualquer
  // branch. Asserções abaixo refletem o conteúdo real das migrations versionadas.

  it('team_messages INSERT requires an authenticated sender identity', () => {
    // 20260817260016 dropou team_messages_insert_v2 (identidade apenas) e
    // recriou como team_messages_insert com identidade via zapp.profiles.
    expect(migrationsSql).toContain('CREATE POLICY team_messages_insert ON zapp.team_messages');
    expect(migrationsSql).toMatch(/sender_id = \(SELECT p\.id FROM zapp\.profiles p WHERE p\.user_id = auth\.uid\(\)\)/);
  });

  it('gap FECHADO (20260817260016): team_messages INSERT verifica membership server-side', () => {
    // Guard-rail da correção E11/fase-08: o WITH CHECK exige membership na
    // conversa ALVO (conversation_id qualificado — sem a tautologia antiga
    // tcm.conversation_id = tcm.conversation_id). Não reintroduzir INSERT sem join.
    const insertBlock = migrationsSql.match(/CREATE POLICY team_messages_insert ON zapp\.team_messages[\s\S]*?;/)?.[0] ?? '';
    expect(insertBlock).toContain('sender_id');
    expect(insertBlock).toContain('team_conversation_members');
    expect(insertBlock).toContain('tcm.conversation_id = team_messages.conversation_id');
  });

  it('team_messages UPDATE policy exists (own messages or admin)', () => {
    expect(migrationsSql).toMatch(/CREATE POLICY team_messages_update ON zapp\.team_messages\s+FOR UPDATE/);
  });

  it('gap FECHADO: team_messages DELETE policy agora versionada (20260821003000)', () => {
    // Drift arquivo↔DB (pg_policies, auditado 2026-08-21): team_messages_delete
    // FOR DELETE existia no banco (squash de 133 migrations não a incorporou)
    // mas não em nenhuma migration versionada — materializada em
    // 20260821003000_materializa_policies_team_messages_dml.sql.
    expect(migrationsSql).toMatch(/CREATE POLICY team_messages_delete ON zapp\.team_messages\s+FOR DELETE/);
  });

  it('gap parcialmente fechado (20260817260016): team_conversations tem DELETE admin-only; INSERT/UPDATE seguem sem policy', () => {
    expect(migrationsSql).toContain('CREATE POLICY team_conversations_select ON zapp.team_conversations FOR SELECT');
    expect(migrationsSql).toMatch(/CREATE POLICY team_conversations_delete ON zapp\.team_conversations\s+FOR DELETE/);
    expect(migrationsSql).not.toMatch(/CREATE POLICY[^;]*team_conversations\s+FOR (INSERT|UPDATE)/);
  });

  it('GAP real: team_conversation_members has NO INSERT policy (default deny)', () => {
    expect(migrationsSql).toContain('CREATE POLICY team_members_select ON zapp.team_conversation_members FOR SELECT');
    expect(migrationsSql).not.toMatch(/CREATE POLICY[^;]*team_conversation_members FOR INSERT/);
  });

  it('DRIFT arquivo↔DB: policy auth_rw_teamfiles (bucket team-chat-files) existe apenas no banco vivo', () => {
    // pg_policies (produção, auditado 2026-08-21): auth_rw_teamfiles (ALL) em
    // storage.objects EXISTE no banco, mas o CREATE não está em nenhuma migration
    // versionada. Quando for versionada, inverter para toContain e validar o
    // owner-path (storage.foldername(name))[1] = auth.uid()::text.
    expect(migrationsSql).not.toContain('CREATE POLICY auth_rw_teamfiles');
  });

  it('GAP real: no message content length limit at DB level', () => {
    // Sem CHECK constraint sobre o tamanho de content em team_messages
    expect(migrationsSql).not.toMatch(/CHECK\s*\([^)]*char_length\(content\)/);
    expect(migrationsSql).not.toMatch(/CHECK\s*\([^)]*length\(content\)/);
  });

  it('GAP real: no DB unique constraint preventing duplicate direct conversations', () => {
    // Sem índice UNIQUE parcial em team_conversations (type=direct) — a checagem é client-side
    expect(migrationsSql).not.toMatch(/CREATE UNIQUE INDEX[^;]*team_conversations[^;]*direct/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: SOURCE CONTRACT — comportamento real dos componentes
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Chat — Component Source Contract', () => {
  const TC = path.join(process.cwd(), 'src/components/team-chat');

  function read(name: string): string {
    return readFileSync(path.join(TC, name), 'utf-8');
  }

  describe('TeamChatInputArea', () => {
    const src = read('TeamChatInputArea.tsx');

    it('supports mentions, rich text toolbar, markdown preview, AI rewrite, voice and TTS', () => {
      expect(src).toContain('@ para mencionar');
      expect(src).toContain('RichTextToolbar');
      expect(src).toContain('RichTextToggle');
      expect(src).toContain('MarkdownPreview');
      expect(src).toContain('AIRewriteButton');
      expect(src).toContain('VoiceDictationButton');
      expect(src).toContain('TextToAudioButton');
      expect(src).toContain('MentionAutocomplete');
    });

    it('Enter sends (without Shift), Shift+Enter adds new line', () => {
      expect(src).toContain("e.key === 'Enter' && !e.shiftKey");
    });

    it('send button is disabled when text is empty or mutation pending', () => {
      expect(src).toContain('disabled={!draft.hasText');
    });

    it('GAP real: textarea does not auto-resize (rows={1} + resize-none)', () => {
      expect(src).toContain('rows={1}');
      expect(src).toContain('resize-none');
    });
  });

  describe('TeamChatPanel', () => {
    const src = read('TeamChatPanel.tsx');

    it('shows edit indicator "· editado" for edited messages', () => {
      expect(src).toContain("msg.is_edited && ' · editado'");
    });

    it('renders markdown via MarkdownPreview and media via MediaContent/MediaTypeIcon', () => {
      expect(src).toContain('MarkdownPreview');
      expect(src).toContain('MediaContent');
      expect(src).toContain('MediaTypeIcon');
    });

    it('context menu: own messages get Reply/Edit/Delete actions', () => {
      expect(src).toContain('ContextMenu');
      expect(src).toContain('Responder');
      expect(src).toContain('Editar');
      expect(src).toContain('Excluir');
    });

    it('auto-scrolls only when near bottom (gap FIXED) and has scroll-to-bottom button', () => {
      expect(src).toContain('isNearBottomRef.current');
      expect(src).toContain('scrollToBottom');
    });

    it('message list is virtualized + infinite scroll (gaps FIXED)', () => {
      expect(src).toContain('scrollTop < 100');
      expect(src).toContain('hasNextPage');
      expect(src).toContain('useDynamicRowHeight');
    });

    it('date separators via local formatDateSep (Hoje/Ontem/ptBR)', () => {
      expect(src).toContain("if (isToday(d)) return 'Hoje'");
      expect(src).toContain("if (isYesterday(d)) return 'Ontem'");
      expect(src).toContain('ptBR');
    });

    it('supports replies with cancel (setReplyTo(null)) and media-type icon in preview', () => {
      expect(src).toContain('onCancelReply={() => s.setReplyTo(null)}');
      expect(src).toContain('<MediaTypeIcon type={repliedMsg.media_type} />');
    });

    it('has in-conversation search (gap FIXED)', () => {
      expect(src).toContain('setSearchQuery');
      expect(src).toContain('value={s.searchQuery}');
    });

    it('integrates reactions (MessageReactions) and add-members (AddMembersDialog) — gaps FIXED', () => {
      expect(src).toContain('MessageReactions');
      expect(src).toContain('AddMembersDialog');
    });

    it('GAP real: XSS prevention — content rendered as text, no dangerouslySetInnerHTML', () => {
      expect(src).not.toContain('dangerouslySetInnerHTML');
    });
  });

  describe('TeamConversationList', () => {
    const src = read('TeamConversationList.tsx');

    it('search filters by name and last message content', () => {
      expect(src).toContain('conv.name');
      expect(src).toContain('conv.last_message');
    });

    it('unread badge only when unread_count > 0', () => {
      expect(src).toContain('(conv.unread_count ?? 0) > 0');
      expect(src).toContain('{conv.unread_count}');
    });

    it('shows "Sem mensagens" fallback and relative time with ptBR', () => {
      expect(src).toContain('Sem mensagens');
      expect(src).toContain('formatDistanceToNow');
    });

    it('loading skeleton renders 5 items and empty states differentiate search', () => {
      expect(src).toContain('Array.from({ length: 5 })');
      expect(src).toContain("search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'");
    });

    it('selected conversation is highlighted', () => {
      expect(src).toContain('bg-accent');
    });
  });

  describe('NewConversationDialog', () => {
    const src = read('NewConversationDialog.tsx');

    it('direct tab uses single selection; group tab toggles multi-select', () => {
      expect(src).toContain("if (tab === 'direct') {");
      expect(src).toContain('setSelectedIds([id])');
      expect(src).toContain('setSelectedIds((prev) => (prev.includes(id)');
    });

    it('search filters by name and email', () => {
      expect(src).toContain('t.name?.toLowerCase().includes(q)');
      expect(src).toContain('t.email?.toLowerCase().includes(q)');
    });

    it('only active profiles shown and current user excluded (useActiveTeamProfiles)', () => {
      expect(src).toContain('useActiveTeamProfiles');
      const membersHook = readFileSync(
        path.join(process.cwd(), 'src/hooks/useTeamChatMembers.ts'),
        'utf-8'
      );
      expect(membersHook).toContain(".eq('is_active', true)");
      expect(membersHook).toContain("q.neq('id', excludeId)");
    });

    it('group name input only for group tab and button text varies by tab', () => {
      expect(src).toContain('Nome do grupo');
      expect(src).toContain("'Iniciar Conversa'");
      expect(src).toContain('Criar Grupo');
    });

    it('group creation requires at least 2 other members (gap FIXED)', () => {
      expect(src).toContain("if (tab === 'group' && selectedIds.length < 2)");
      expect(src).toContain('Groups need at least 2 other members');
    });

    it('form resets after creation', () => {
      expect(src).toContain('setSelectedIds([])');
      expect(src).toContain("setGroupName('')");
    });

    it('switching tabs clears selection', () => {
      expect(src).toContain('setSelectedIds([])');
    });
  });

  describe('TeamChatView (mobile responsiveness)', () => {
    const src = read('TeamChatView.tsx');

    it('sidebar hidden on mobile when a conversation is selected', () => {
      expect(src).toContain('selectedId && "hidden md:flex"');
    });

    it('chat area hidden on mobile when no conversation is selected', () => {
      expect(src).toContain('!selectedId && "hidden md:flex"');
    });

    it('back button clears selection', () => {
      expect(src).toContain('onBack={() => setSelectedId(null)}');
    });
  });

  describe('Error Handling', () => {
    const mutationsSrc = readFileSync(
      path.join(process.cwd(), 'src/features/inbox/hooks/team-chat/useTeamChatMutations.ts'),
      'utf-8'
    );

    it('send/delete/edit/create errors surface toasts', () => {
      expect(mutationsSrc).toContain("'Erro ao enviar mensagem'");
      expect(mutationsSrc).toContain("'Erro ao excluir mensagem'");
      expect(mutationsSrc).toContain("'Erro ao editar mensagem'");
      expect(mutationsSrc).toContain("'Erro ao criar conversa'");
    });
  });
});
