import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUpload = vi.hoisted(() => vi.fn());
const mockCreateSignedUrl = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
      }),
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: mockToast,
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { useChatScheduleMessage } from '@/features/inbox/components/chat/hooks/useChatScheduleMessage';

const mockScheduleMessage = vi.fn<(args: {
  contactId: string;
  content: string;
  scheduledAt: Date;
  messageType: string;
  mediaUrl?: string;
}) => Promise<unknown>>();

function render() {
  const onDone = vi.fn();
  const utils = renderHook(() =>
    useChatScheduleMessage({
      contactId: 'c1',
      scheduleMessage: mockScheduleMessage,
      onDone,
    })
  );
  return { ...utils, onDone };
}

const future = () => new Date(Date.now() + 86_400_000);

describe('useChatScheduleMessage (CAMPANHAS-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScheduleMessage.mockResolvedValue({ id: 'sm1' });
  });

  it('schedules text message with exact args and calls onDone once', async () => {
    const { result, onDone } = render();

    await act(async () => {
      await result.current('Olá', future());
    });

    expect(mockScheduleMessage).toHaveBeenCalledTimes(1);
    expect(mockScheduleMessage).toHaveBeenCalledWith({
      contactId: 'c1',
      content: 'Olá',
      scheduledAt: expect.any(Date),
      messageType: 'text',
      mediaUrl: undefined,
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('toasts REAL RLS error on 403 and does NOT call onDone (sem silêncio)', async () => {
    mockScheduleMessage.mockRejectedValue({
      code: '42501',
      message: 'new row violates row-level security policy',
    });
    const { result, onDone } = render();

    await act(async () => {
      await result.current('Olá', future());
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao agendar mensagem',
        variant: 'destructive',
        description: expect.stringContaining('Acesso negado'),
      })
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('toasts generic error on non-RLS failure and does NOT call onDone', async () => {
    mockScheduleMessage.mockRejectedValue(new Error('network down'));
    const { result, onDone } = render();

    await act(async () => {
      await result.current('Olá', future());
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao agendar mensagem',
        variant: 'destructive',
        description: 'Tente novamente.',
      })
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('does not schedule when attachment upload fails (toast de upload)', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'bucket denied' } });
    const { result, onDone } = render();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    await act(async () => {
      await result.current('Olá', future(), file);
    });

    expect(mockScheduleMessage).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro no upload', variant: 'destructive' })
    );
  });

  it('uploads attachment and schedules as media type with signed URL', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/url' } });
    const { result, onDone } = render();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    await act(async () => {
      await result.current('Legenda', future(), file);
    });

    expect(mockScheduleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: 'image',
        mediaUrl: 'https://signed/url',
      })
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps stable identity between renders (useCallback)', () => {
    const { result, rerender } = render();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useChatScheduleMessage — E39: prazo máximo de agendamento (signed URL 7d)', () => {
  it('E39.8 RED: agendamento com mídia para mais de 7 dias cria URL inválida — deve ser rejeitado', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/url' } });
    const { result, onDone } = render();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    // 8 dias à frente > TTL da signed URL (604800s = 7 dias) → URL expira
    // antes do envio agendado. O hook deve REJEITAR com erro claro.
    const farFuture = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);

    await act(async () => {
      await result.current('Legenda', farFuture, file);
    });

    // RED (bug documentado): hoje agenda e cria URL quebrada.
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    expect(mockScheduleMessage).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('7 dias'),
        variant: 'destructive',
      })
    );
  });

  it('E39.9 pin: agendamento com mídia DENTRO de 7 dias continua funcionando', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/ok' } });
    const { result, onDone } = render();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const within7d = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

    await act(async () => {
      await result.current('Legenda', within7d, file);
    });

    expect(mockScheduleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'image', mediaUrl: 'https://signed/ok' })
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
