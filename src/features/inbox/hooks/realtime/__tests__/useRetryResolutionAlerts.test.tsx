/**
 * E38 — Alertas de retry sem toasts duplicados (TDD, Etapa 38 da campanha).
 *
 * Contrato (spec: fases-para-repo/fase-04-inbox-nucleo-hooks-servicos.md, Etapa 38
 * + deliberação da campanha "retry em lote → 1 toast (não 500); alerta por conversa"):
 *
 *   38.2  O MESMO messageId resolvido 2× em sessão longa → 1 toast
 *         (dedupe por messageId, fontes redundantes bus + realtime).
 *   38.3  SOFT_CAP=500: 600 resoluções distintas → o Set evicta 20% e NENHUM
 *         toast duplicado é emitido para conversas/ids já notificados
 *         (histórico de toasts separado do cap); conversa nova segue alertando.
 *   38.5  Status terminais (success / failed_retries / failed_auth) emitem o
 *         toast correto (sonner) e o id sai do set em voo (wasRetrying).
 *   BATCH Retry em lote (500 mensagens da MESMA conversa) → 1 toast, não 500.
 *   CONV  Alerta por conversa: batch em 2 conversas → 2 toasts (1 por conversa),
 *         cada um com ação "Abrir conversa" navegando para /chat-popup/<contactId>.
 *
 * Estado RED esperado (pré-fix): os testes BATCH, CONV e SOFT_CAP-sem-re-toast
 * falham — a implementação atual deduplica apenas por messageId (seenRef) e
 * emite 1 toast POR MENSAGEM (500 toasts num batch de 500 mensagens da mesma
 * conversa), e ids evictados pelo cap voltam a emitir toast duplicado.
 * Os testes de dedupe por messageId (38.2), cross-source e de status terminal
 * (38.5) já passam na implementação atual (GREEN).
 *
 * Mocks: supabase realtime (canal fake capturando o callback postgres_changes),
 * sonner (toast.success/error), react-router (useNavigate), logger.
 * O sendStatusBus é REAL (singleton in-memory) — isolado via __resetSendStatusForTest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockNavigate = vi.fn();

type PgPayload = {
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

const fakeSupabase = vi.hoisted(() => {
  const callbacks = new Map<string, (payload: PgPayload) => void>();
  const channels: unknown[] = [];
  function createClient() {
    return {
      channel: vi.fn((topic: string) => {
        const ch = {
          topic,
          on: vi.fn(
            (event: string, _filter: unknown, cb: (payload: PgPayload) => void) => {
              if (event === 'postgres_changes') callbacks.set(topic, cb);
              return ch;
            }
          ),
          subscribe: vi.fn((cb?: (status: string) => void) => {
            cb?.('SUBSCRIBED');
            return ch;
          }),
          unsubscribe: vi.fn(() => ch),
        };
        channels.push(ch);
        return ch;
      }),
      // supabase-js removeChannel retorna Promise — o cleanup do hook faz
      // `.catch(() => {})`; sem Promise o unmount quebra o React (act).
      removeChannel: vi.fn(() => Promise.resolve()),
    };
  }
  return { createClient, callbacks, channels };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: fakeSupabase.createClient(),
}));
vi.mock('@/integrations/supabase/channelErrorLogging', () => ({
  logChannelError: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { useRetryResolutionAlerts } from '../useRetryResolutionAlerts';
import { emitSendStatus, __resetSendStatusForTest } from '../sendStatusBus';

/** Dispara um UPDATE do realtime (evo.evolution_messages) no canal do hook. */
function fireUpdate(opts: {
  id: string;
  prev: string;
  next: string;
  contactId?: string | null;
  retryAttempt?: number | null;
  retryTotal?: number | null;
  errorReason?: string | null;
}) {
  const cb = fakeSupabase.callbacks.values().next().value;
  if (!cb) throw new Error('nenhum callback postgres_changes registrado (hook não montado?)');
  cb({
    old: { id: opts.id, status: opts.prev },
    new: {
      id: opts.id,
      status: opts.next,
      contact_id: opts.contactId ?? null,
      retry_attempt: opts.retryAttempt ?? null,
      retry_total: opts.retryTotal ?? null,
      error_reason: opts.errorReason ?? null,
    },
  });
}

/** Total de toasts emitidos (success + error). */
function toastCount(): number {
  return vi.mocked(toast.success).mock.calls.length + vi.mocked(toast.error).mock.calls.length;
}

function mountHook(enabled = true) {
  return renderHook(() => useRetryResolutionAlerts(enabled));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate.mockReset();
  __resetSendStatusForTest();
  fakeSupabase.callbacks.clear();
  fakeSupabase.channels.length = 0;
});

// ── BATCH / CONVERSA (RED na implementação atual) ──────────────────────────

describe('E38 — retry em lote: 1 toast por conversa (não 1 por mensagem)', () => {
  it('RED: 500 mensagens da MESMA conversa resolvendo em lote → 1 toast, não 500', () => {
    mountHook();
    for (let i = 0; i < 500; i++) {
      fireUpdate({ id: `m-${i}`, prev: 'retrying', next: 'sent', contactId: 'c1' });
    }
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('RED: batch em 2 conversas → 2 toasts (alerta por conversa), ação navega para a conversa certa', () => {
    mountHook();
    for (let i = 0; i < 300; i++) {
      fireUpdate({ id: `a-${i}`, prev: 'retrying', next: 'sent', contactId: 'cA' });
    }
    for (let i = 0; i < 200; i++) {
      fireUpdate({ id: `b-${i}`, prev: 'retrying', next: 'sent', contactId: 'cB' });
    }
    expect(toast.success).toHaveBeenCalledTimes(2);

    const actions = vi
      .mocked(toast.success)
      .mock.calls.map(([, opts]) => opts?.action)
      .filter(
        (a): a is { label: string; onClick: () => void } =>
          a !== null && typeof a === 'object' && 'onClick' in a
      );
    expect(actions).toHaveLength(2);
    for (const action of actions) {
      expect(action.label).toBe('Abrir conversa');
      action.onClick();
    }
    expect(mockNavigate).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenCalledWith('/chat-popup/cA');
    expect(mockNavigate).toHaveBeenCalledWith('/chat-popup/cB');
  });

  it('RED: falha em lote (mesma conversa) → 1 toast.error, não 500', () => {
    mountHook();
    for (let i = 0; i < 500; i++) {
      fireUpdate({
        id: `f-${i}`,
        prev: 'retrying',
        next: 'failed_retries',
        contactId: 'c1',
        errorReason: 'timeout',
      });
    }
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });
});

// ── SOFT_CAP (RED na implementação atual) ──────────────────────────────────

describe('E38 — SOFT_CAP=500: histórico de toasts separado do cap', () => {
  it('RED: 600 conversas distintas alertam 1× cada; evictado NÃO re-toasta; conversa nova segue alertando', () => {
    mountHook();
    for (let i = 0; i < 600; i++) {
      fireUpdate({ id: `m-${i}`, prev: 'retrying', next: 'sent', contactId: `c${i}` });
    }
    // 1 toast por conversa distinta (cap é de memória, não de alerta)
    expect(toast.success).toHaveBeenCalledTimes(600);

    // m-0 já foi evictado do set limitado (eviction dos 20% mais antigos) —
    // mas a conversa c0 JÁ FOI NOTIFICADA → não pode re-toastar.
    fireUpdate({ id: 'm-0', prev: 'retrying', next: 'sent', contactId: 'c0' });
    // Conversa nova continua alertando normalmente.
    fireUpdate({ id: 'm-600', prev: 'retrying', next: 'sent', contactId: 'c600' });

    expect(toast.success).toHaveBeenCalledTimes(601);
  });
});

// ── 38.2 / cross-source (GREEN na implementação atual) ─────────────────────

describe('E38 — dedupe por messageId (fontes redundantes)', () => {
  it('GREEN: mesmo messageId resolvido 2× em sessão longa → 1 toast', () => {
    mountHook();
    fireUpdate({ id: 'm1', prev: 'retrying', next: 'sent', contactId: 'c1' });
    fireUpdate({ id: 'm1', prev: 'retrying', next: 'sent', contactId: 'c1' });
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('GREEN: bus + realtime do MESMO messageId → 1 toast (fontes redundantes)', () => {
    mountHook();
    emitSendStatus('m1', { status: 'retrying' });
    emitSendStatus('m1', { status: 'sent', attempt: 2, totalRetries: 3 });
    fireUpdate({ id: 'm1', prev: 'retrying', next: 'sent', contactId: 'c1' });
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
});

// ── 38.5 status terminais (GREEN na implementação atual) ───────────────────

describe('E38 — status terminais (38.5)', () => {
  it('GREEN: success via bus → toast.success com contador (attempt/total)', () => {
    mountHook();
    emitSendStatus('m1', { status: 'retrying' });
    emitSendStatus('m1', { status: 'sent', attempt: 2, totalRetries: 3 });
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(toast.success).mock.calls[0][0])).toContain(
      'Mensagem entregue após retentativa (2/3)'
    );
  });

  it('GREEN: failed_retries → toast.error com motivo; failed_auth → mensagem de autenticação', () => {
    mountHook();
    emitSendStatus('f1', { status: 'retrying' });
    emitSendStatus('f1', {
      status: 'failed_retries',
      errorReason: 'timeout',
      attempt: 3,
      totalRetries: 3,
    });
    emitSendStatus('f2', { status: 'retrying' });
    emitSendStatus('f2', { status: 'failed_auth' });
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toContain(
      'Mensagem falhou após esgotar retentativas'
    );
    expect(String(vi.mocked(toast.error).mock.calls[1][0])).toContain(
      'Falha de autenticação'
    );
  });

  it('GREEN: realtime retrying→failed_retries → toast.error com reason no description', () => {
    mountHook();
    fireUpdate({
      id: 'm1',
      prev: 'retrying',
      next: 'failed_retries',
      contactId: 'c1',
      errorReason: 'conexão perdida',
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toContain(
      'Mensagem falhou após esgotar retentativas'
    );
    expect(String(vi.mocked(toast.error).mock.calls[0][1]?.description)).toContain(
      'conexão perdida'
    );
  });

  it('GREEN: envio de primeira (sem retrying prévio) → NENHUM toast', () => {
    mountHook();
    emitSendStatus('m1', { status: 'sent' });
    fireUpdate({ id: 'm2', prev: 'sending', next: 'sent', contactId: 'c1' });
    expect(toastCount()).toBe(0);
  });
});
