/**
 * ============================================================================
 * CONTRATO E65 — Mensagens agendadas: RLS + dispatcher  (TESTE RED)
 * ============================================================================
 * Status: RED — o executor AINDA NÃO implementou a Etapa 65.
 * Verificado em 2026-08-17 (worktree wt-o2):
 *   - zapp.scheduled_messages tem SÓ policy SELECT (scheduled_messages_select);
 *     INSERT/UPDATE/DELETE ausentes → mutações falham 403 (CAMPANHAS-09).
 *   - Nenhum índice (scheduled_at, status).
 *   - Nenhum zapp.fn_dispatch_* / edge scheduled-messages-dispatch / cron.
 *   - useScheduledMessages.ts inalterado (toast com mensagem crua do Postgres).
 *
 * CONTRATO — o que o executor DEVE implementar para este arquivo ficar GREEN:
 *
 * [C1] RLS 403 → toast de erro REAL (subetapa 65.7):
 *   - PostgrestError code '42501' (RLS violation) em INSERT/UPDATE de
 *     scheduled_messages DEVE virar toast com variant 'destructive' e
 *     description AMIGÁVEL contendo "permiss" (ex.: 'Você não tem permissão
 *     para agendar mensagens'). NUNCA o texto cru do Postgres
 *     ("new row violates row-level security policy..."). NUNCA toast de
 *     sucesso quando a mutação falhou.
 *
 * [C2] Dispatcher (65.3/65.5): migration versionada (YYYYMMDDHHMMSS) com
 *   função `zapp.fn_dispatch_scheduled_messages()` (aceito também
 *   rpc_dispatch_*, prefixo fn_/rpc_) cujo corpo:
 *     a) seleciona SÓ devidas: WHERE status='pending' AND scheduled_at <= now()
 *     b) marca 'sent' ATOMICAMENTE no MESMO statement:
 *        UPDATE zapp.scheduled_messages SET status='sent', sent_at=now()
 *        WHERE status='pending' AND scheduled_at <= now() RETURNING *;
 *     c) SECURITY DEFINER com search_path fixo (convenção AGENTS.md).
 *
 * [C3] Idempotência (65.5): o WHERE da dispatch DEVE conter o guard
 *   status='pending' — a "claim" acontece no próprio UPDATE que seleciona.
 *   Duas execuções seguidas NÃO duplicam envio (run 2 → 0 linhas).
 *
 * [C4] RLS de escrita (65.1): policies INSERT/UPDATE/DELETE em
 *   zapp.scheduled_messages (nomes scheduled_messages_insert/update/delete,
 *   alinhados ao padrão scheduled_messages_select existente).
 *
 * [C5] Índice (65.2): CREATE INDEX ... ON zapp.scheduled_messages
 *   (scheduled_at, status) — aceita (status, scheduled_at).
 *
 * [C6] Cron (65.4, fora do escopo deste teste): cron.schedule versionado
 *   chamando o dispatcher (padrão campanhas-14) — validar em runtime (65.10).
 *
 * Execução: `bun run test -- src/hooks/__tests__/useScheduledMessages.real.test.ts`
 * (ou vitest run <arquivo>). Sem banco: RLS simulado via mock do supabase;
 * dispatcher validado estaticamente contra supabase/migrations/*.sql.
 * ============================================================================
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mocks (mesmo padrão do teste existente useScheduledMessages.test.tsx)
// ---------------------------------------------------------------------------
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/lib/logger');

import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { toast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const RLS_ERROR = {
  code: '42501',
  message: 'new row violates row-level security policy for table "scheduled_messages"',
  details: null,
  hint: null,
};

/** Erro PostgREST realista que o supabase-js devolve num 403 de RLS. */
function buildRlsError() {
  return { ...RLS_ERROR };
}

/**
 * Mock do supabase que ramifica por tabela:
 *  - profiles            → maybeSingle OK (perfil do usuário logado)
 *  - scheduled_messages  → insert/update configuráveis via parâmetro
 */
function mockSupabaseForMutations(opts: { insertError?: unknown; updateError?: unknown }) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'scheduled_messages') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: null, error: opts.insertError ?? null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
        }),
      };
    }
    throw new Error(`Tabela inesperada no mock: ${table}`);
  });
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const futureDate = () => new Date(Date.now() + 60 * 60 * 1000); // +1h (validado "no futuro")

// ---------------------------------------------------------------------------
// Helpers estáticos — leitura das migrations (sem banco)
// ---------------------------------------------------------------------------
function migrationsDir() {
  return path.resolve(process.cwd(), 'supabase', 'migrations');
}

function loadMigrations(): { file: string; sql: string }[] {
  const dir = migrationsDir();
  if (!fs.existsSync(dir)) {
    throw new Error(`Diretório de migrations não encontrado: ${dir}`);
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: fs.readFileSync(path.join(dir, file), 'utf8') }));
}

function migrationsContaining(pattern: RegExp): string[] {
  return loadMigrations()
    .filter(({ sql }) => pattern.test(sql))
    .map(({ file }) => file);
}

/** Extrai o statement UPDATE ... scheduled_messages ... ; mais próximo do início. */
function extractDispatchUpdate(sql: string): string | null {
  const m = sql.match(/UPDATE\s+(?:zapp\.)?scheduled_messages\b[\s\S]*?;/i);
  return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
// [C1] RLS 403 → toast de erro real (hook com supabase mockado)
// ---------------------------------------------------------------------------
describe('E65 [C1] RLS 403 vira toast de erro real (sem 403 silencioso)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
  });

  it('INSERT com erro RLS 42501 → toast destructive com mensagem amigável de permissão', async () => {
    mockSupabaseForMutations({ insertError: buildRlsError() });

    const { result } = renderHook(() => useScheduledMessages('c1'), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.scheduleMessage({
        contactId: 'c1',
        content: 'Follow up agendado',
        scheduledAt: futureDate(),
      }),
    ).rejects.toThrow();

    expect(toast).toHaveBeenCalledTimes(1);
    const call = vi.mocked(toast).mock.calls[0][0];
    expect(call.variant).toBe('destructive');
    expect(call.title).toBe('Erro ao agendar mensagem');
    // Contrato: mensagem amigável citando permissão — NUNCA o texto cru do Postgres.
    expect(call.description).toMatch(/permiss/i);
    expect(call.description).not.toContain('row-level security');
  });

  it('UPDATE (cancelar) com erro RLS 42501 → toast destructive com mensagem amigável', async () => {
    mockSupabaseForMutations({ updateError: buildRlsError() });

    const { result } = renderHook(() => useScheduledMessages('c1'), {
      wrapper: createWrapper(),
    });

    await expect(result.current.cancelMessage('sm1')).rejects.toThrow();

    expect(toast).toHaveBeenCalledTimes(1);
    const call = vi.mocked(toast).mock.calls[0][0];
    expect(call.variant).toBe('destructive');
    expect(call.title).toBe('Erro ao cancelar');
    expect(call.description).toMatch(/permiss/i);
    expect(call.description).not.toContain('row-level security');
  });

  it('mutação com erro NUNCA emite toast de sucesso', async () => {
    mockSupabaseForMutations({ insertError: buildRlsError() });

    const { result } = renderHook(() => useScheduledMessages('c1'), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.scheduleMessage({
        contactId: 'c1',
        content: 'x',
        scheduledAt: futureDate(),
      }),
    ).rejects.toThrow();

    const titles = vi.mocked(toast).mock.calls.map((c) => c[0].title);
    expect(titles).not.toContain('Mensagem agendada com sucesso!');
    expect(titles).toContain('Erro ao agendar mensagem');
  });

  it('INSERT sem erro → toast de sucesso (controle: o mock 42501 é o que falha)', async () => {
    mockSupabaseForMutations({ insertError: null });

    const { result } = renderHook(() => useScheduledMessages('c1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.scheduleMessage({
        contactId: 'c1',
        content: 'Follow up agendado',
        scheduledAt: futureDate(),
      });
    });

    const titles = vi.mocked(toast).mock.calls.map((c) => c[0].title);
    expect(titles).toContain('Mensagem agendada com sucesso!');
  });
});

// ---------------------------------------------------------------------------
// [C2] fn_dispatch pega devidas e marca 'sent' (contrato estático das migrations)
// ---------------------------------------------------------------------------
describe('E65 [C2] fn_dispatch: pega due e marca sent (migration versionada)', () => {
  const DISPATCH_FN = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:zapp\.)?(?:fn|rpc)_dispatch[a-z_]*\s*\(/i;

  it('existe função de dispatch (fn_/rpc_ dispatch*) em migration versionada', () => {
    const files = migrationsContaining(DISPATCH_FN);
    expect(
      files,
      `Nenhuma migration define o dispatcher (${DISPATCH_FN}). O executor precisa criar a migration E65 com zapp.fn_dispatch_scheduled_messages().`,
    ).not.toHaveLength(0);
    // Nome de arquivo versionado: YYYYMMDDHHMMSS_*.sql
    for (const f of files) {
      expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it('corpo faz UPDATE atômico SET status= sent ... RETURNING', () => {
    const dispatchFiles = loadMigrations().filter(({ sql }) => DISPATCH_FN.test(sql));
    expect(dispatchFiles.length).toBeGreaterThan(0);

    for (const { file, sql } of dispatchFiles) {
      const stmt = extractDispatchUpdate(sql);
      expect(
        stmt,
        `Migration ${file}: dispatcher não contém UPDATE zapp.scheduled_messages. Contrato: UPDATE ... SET status='sent' ... RETURNING *`,
      ).not.toBeNull();
      expect(stmt!).toMatch(/SET\s+status\s*=\s*'sent'/i);
      expect(stmt!).toMatch(/RETURNING/i);
    }
  });

  it('função é SECURITY DEFINER (convenção AGENTS.md)', () => {
    const dispatchFiles = loadMigrations().filter(({ sql }) => DISPATCH_FN.test(sql));
    expect(dispatchFiles.length).toBeGreaterThan(0);
    for (const { file, sql } of dispatchFiles) {
      expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    }
  });
});

// ---------------------------------------------------------------------------
// [C3] Idempotência: 2 runs não duplicam (guard status='pending' + simulação)
// ---------------------------------------------------------------------------
describe('E65 [C3] idempotência do dispatcher (2 runs não duplicam)', () => {
  /** Modelo de execução do contrato [C2b]: claim e envio no MESMO UPDATE. */
  function runDispatch(
    messages: { id: string; status: string; scheduled_at: string }[],
    now: Date,
  ): { sent: string[]; remaining: typeof messages } {
    const sent: string[] = [];
    const remaining = messages.map((m) => {
      if (m.status === 'pending' && new Date(m.scheduled_at) <= now) {
        sent.push(m.id);
        return { ...m, status: 'sent' as const };
      }
      return m;
    });
    return { sent, remaining };
  }

  it('a migration guarda o UPDATE com WHERE status= pending (claim atômica)', () => {
    const files = migrationsContaining(
      /UPDATE\s+(?:zapp\.)?scheduled_messages\b[\s\S]*?status\s*=\s*'pending'/i,
    );
    expect(
      files,
      'Contrato [C3]: o UPDATE do dispatcher DEVE filtrar status=\'pending\' — sem esse guard, 2 runs reenviam a mesma mensagem.',
    ).not.toHaveLength(0);

    for (const file of files) {
      const sql = loadMigrations().find((m) => m.file === file)!.sql;
      const stmt = extractDispatchUpdate(sql);
      expect(stmt).not.toBeNull();
      expect(stmt!).toMatch(/status\s*=\s*'pending'/i);
      expect(stmt!).toMatch(/scheduled_at\s*<=\s*(?:now\(\)|clock_timestamp\(\)|current_timestamp)/i);
    }
  });

  it('simulação com relógio fake: run 1 envia só devidas; run 2 envia 0 (sem duplicado)', () => {
    const now = new Date('2026-08-17T12:00:00Z');
    const fixture = [
      { id: 'm1', status: 'pending', scheduled_at: '2026-08-17T11:59:00Z' }, // due
      { id: 'm2', status: 'pending', scheduled_at: '2026-08-17T12:30:00Z' }, // futura
      { id: 'm3', status: 'sent', scheduled_at: '2026-08-17T10:00:00Z' }, // já enviada
      { id: 'm4', status: 'cancelled', scheduled_at: '2026-08-17T09:00:00Z' }, // cancelada
    ];

    const run1 = runDispatch(fixture, now);
    expect(run1.sent).toEqual(['m1']); // só a devida e pendente

    const run2 = runDispatch(run1.remaining, now);
    expect(run2.sent).toEqual([]); // idempotente: nada novo
    expect(run2.remaining.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('mensagem futura NÃO é disparada antes do tempo (relógio fake)', () => {
    const now = new Date('2026-08-17T12:00:00Z');
    const dueLater = [
      { id: 'm5', status: 'pending', scheduled_at: '2026-08-17T12:00:01Z' },
    ];
    const run = runDispatch(dueLater, now);
    expect(run.sent).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// [C4] RLS de escrita (INSERT/UPDATE/DELETE) — migration versionada
// ---------------------------------------------------------------------------
describe('E65 [C4] policies INSERT/UPDATE/DELETE em zapp.scheduled_messages', () => {
  for (const op of ['insert', 'update', 'delete'] as const) {
    it(`policy scheduled_messages_${op} existe em migration versionada`, () => {
      const pattern = new RegExp(
        `CREATE\\s+POLICY\\s+(?:"|')?scheduled_messages_${op}(?:"|')?\\s+ON\\s+(?:zapp\\.)?scheduled_messages`,
        'i',
      );
      const files = migrationsContaining(pattern);
      expect(
        files,
        `Contrato [C4]: falta CREATE POLICY scheduled_messages_${op} ON zapp.scheduled_messages (hoje só existe scheduled_messages_select → mutações dão 403).`,
      ).not.toHaveLength(0);
      for (const f of files) {
        expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// [C5] Índice (scheduled_at, status) para polling do dispatcher
// ---------------------------------------------------------------------------
describe('E65 [C5] índice (scheduled_at, status)', () => {
  it('CREATE INDEX com as duas colunas (ordem aceita: (scheduled_at, status) ou (status, scheduled_at))', () => {
    const files = migrationsContaining(
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+[^;]*?\bON\s+(?:zapp\.)?scheduled_messages\b[^;]*?\([^)]*scheduled_at[^)]*status[^)]*\)/is,
    );
    expect(
      files,
      'Contrato [C5]: falta índice em zapp.scheduled_messages (scheduled_at, status) — polling do dispatcher sem índice varre a tabela.',
    ).not.toHaveLength(0);
  });
});
