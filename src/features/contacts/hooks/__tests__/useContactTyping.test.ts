/**
 * E40.8/E40.9 — Contrato do broadcast de digitação (useContactTyping /
 * useContactTypingState).
 *
 * Contrato (docs/audit-2026-08-16/PLANO-100-ETAPAS.md, etapa 40;
 * pendencias-consolidadas.md:17):
 *  - subscrição no canal EXATO `typing:${remoteJid}`;
 *  - broadcast `contact_typing` { isTyping: true } → isTyping=true (participant
 *    exposto em grupos); expira automaticamente após TYPING_AUTO_CLEAR_MS —
 *    nunca fica "digitando" eterno;
 *  - stop com DEBOUNCE: { isTyping: false } só derruba após
 *    TYPING_STOP_DEBOUNCE_MS sem reativação (anti-flicker composing/paused);
 *  - dedupe: broadcasts repetidos de typing não acumulam timers nem trocam o
 *    estado de forma espúria;
 *  - defesas: @broadcast ignorado; @g.us ignorado por default (allowGroups
 *    opt-in); enabled=false suspende a subscrição;
 *  - cleanup no unmount: unsubscribe + removeChannel (sem vazamento de canal);
 *  - troca de remoteJid → re-subscribe no novo canal e unsubscribe do antigo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useContactTypingState,
  useContactTyping,
  TYPING_AUTO_CLEAR_MS,
  TYPING_STOP_DEBOUNCE_MS,
} from '../useContactTyping';

interface ChannelEntry {
  topic: string;
  broadcastCb?: (payload: unknown) => void;
  subscribeCb?: (status: string) => void;
  unsubscribeCb?: () => void;
  unsubscribed: boolean;
}

const fake = vi.hoisted(() => {
  const entries: ChannelEntry[] = [];
  const instances: Array<{ entry: ChannelEntry; unsubscribe: ReturnType<typeof vi.fn> }> = [];

  const channel = vi.fn((topic: string) => {
    const entry: ChannelEntry = { topic, unsubscribed: false };
    entries.push(entry);
    const instance = {
      on: vi.fn((type: string, _opts: unknown, cb?: (payload: unknown) => void) => {
        if (type === 'broadcast') entry.broadcastCb = cb;
        return instance;
      }),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        entry.subscribeCb = cb;
        return instance;
      }),
      unsubscribe: vi.fn(() => {
        entry.unsubscribed = true;
      }),
    };
    instances.push({ entry, unsubscribe: instance.unsubscribe });
    return instance;
  });

  const removeChannel = vi.fn();
  const logChannelError = vi.fn();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  const supabase = { channel, removeChannel, from: vi.fn(), rpc: vi.fn() };

  return {
    entries,
    instances,
    channel,
    removeChannel,
    logChannelError,
    logger,
    supabase,
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: fake.supabase }));
vi.mock('@/integrations/supabase/channelErrorLogging', () => ({
  logChannelError: fake.logChannelError,
}));
vi.mock('@/lib/logger', () => ({ getLogger: () => fake.logger }));

const JID = '5511999999999@s.whatsapp.net';

describe('useContactTyping (broadcast de digitação)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.entries.length = 0;
    fake.instances.length = 0;
    fake.channel.mockClear();
    fake.removeChannel.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function broadcast(entry: ChannelEntry, payload: unknown) {
    // O callback do supabase-js recebe o ENVELOPE { payload, ... } — o hook
    // destrutura `({ payload })`. Sem o envelope o payload chega undefined.
    act(() => {
      entry.broadcastCb?.({ payload });
    });
  }

  it('subscreve no canal exato `typing:${remoteJid}` e registra o handler de broadcast', () => {
    renderHook(() => useContactTypingState(JID));
    expect(fake.channel).toHaveBeenCalledTimes(1);
    expect(fake.channel).toHaveBeenCalledWith(`typing:${JID}`);
    expect(fake.entries[0].broadcastCb).toBeTypeOf('function');
  });

  it('broadcast typing:true → isTyping=true; expira após TYPING_AUTO_CLEAR_MS (nunca eterno)', () => {
    const { result } = renderHook(() => useContactTypingState(JID));
    broadcast(fake.entries[0], { isTyping: true });
    expect(result.current.isTyping).toBe(true);

    // antes do auto-clear ainda digita; depois, expira
    act(() => {
      vi.advanceTimersByTime(TYPING_AUTO_CLEAR_MS - 1);
    });
    expect(result.current.isTyping).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isTyping).toBe(false);
  });

  it('expoe participant em grupos e limpa no auto-clear', () => {
    const { result } = renderHook(() =>
      useContactTypingState('120363@x@g.us', { allowGroups: true })
    );
    broadcast(fake.entries[0], { isTyping: true, participant: '5511988887777@s.whatsapp.net' });
    expect(result.current.isTyping).toBe(true);
    expect(result.current.participant).toBe('5511988887777@s.whatsapp.net');

    act(() => {
      vi.advanceTimersByTime(TYPING_AUTO_CLEAR_MS);
    });
    expect(result.current.isTyping).toBe(false);
    expect(result.current.participant).toBeNull();
  });

  it('stop com debounce: isTyping:false só derruba após TYPING_STOP_DEBOUNCE_MS (anti-flicker)', () => {
    const { result } = renderHook(() => useContactTypingState(JID));
    broadcast(fake.entries[0], { isTyping: true });
    expect(result.current.isTyping).toBe(true);

    broadcast(fake.entries[0], { isTyping: false });
    // dentro da janela de debounce ainda mostra "digitando"
    act(() => {
      vi.advanceTimersByTime(TYPING_STOP_DEBOUNCE_MS - 1);
    });
    expect(result.current.isTyping).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isTyping).toBe(false);
  });

  it('dedupe: broadcasts repetidos de typing mantêm estado sem acumular (expiração única)', () => {
    const { result } = renderHook(() => useContactTypingState(JID));
    broadcast(fake.entries[0], { isTyping: true });
    broadcast(fake.entries[0], { isTyping: true });
    broadcast(fake.entries[0], { isTyping: true });
    expect(result.current.isTyping).toBe(true);

    // um único auto-clear derruba tudo (nenhum timer órfão segura "true")
    act(() => {
      vi.advanceTimersByTime(TYPING_AUTO_CLEAR_MS);
    });
    expect(result.current.isTyping).toBe(false);

    // reativação após expirar funciona (estado não ficou preso)
    broadcast(fake.entries[0], { isTyping: true });
    expect(result.current.isTyping).toBe(true);
  });

  it('ignora @broadcast e @g.us por default (sem criar canal); allowGroups opt-in', () => {
    renderHook(() => useContactTypingState('status@broadcast'));
    renderHook(() => useContactTypingState('1203630123456789@g.us'));
    expect(fake.channel).not.toHaveBeenCalled();

    fake.channel.mockClear();
    renderHook(() => useContactTypingState('1203630123456789@g.us', { allowGroups: true }));
    expect(fake.channel).toHaveBeenCalledWith('typing:1203630123456789@g.us');
  });

  it('enabled=false suspende a subscrição (sem canal criado)', () => {
    renderHook(() => useContactTypingState(JID, { enabled: false }));
    renderHook(() => useContactTypingState(JID, false));
    expect(fake.channel).not.toHaveBeenCalled();
  });

  it('cleanup no unmount: unsubscribe + removeChannel (sem vazamento de listeners)', () => {
    const { unmount } = renderHook(() => useContactTypingState(JID));
    const instance = fake.instances[0];
    unmount();
    expect(instance.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('troca de remoteJid → unsubscribe do canal antigo + subscribe no novo', () => {
    const { rerender } = renderHook(
      ({ jid }) => useContactTypingState(jid),
      { initialProps: { jid: JID } }
    );
    expect(fake.channel).toHaveBeenCalledWith(`typing:${JID}`);
    const first = fake.instances[0];

    act(() => {
      rerender({ jid: '5521988887777@s.whatsapp.net' });
    });
    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fake.channel).toHaveBeenLastCalledWith('typing:5521988887777@s.whatsapp.net');
  });

  it('API booleana useContactTyping devolve isTyping simples', () => {
    const { result } = renderHook(() => useContactTyping(JID));
    expect(typeof result.current).toBe('boolean');
    expect(result.current).toBe(false);
    broadcast(fake.entries[0], { isTyping: true });
    expect(result.current).toBe(true);
  });
});
