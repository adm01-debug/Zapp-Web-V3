import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TextToAudioButton } from '../TextToAudioButton';

// Regressao issue #1000 item 1 (P1 seguranca/custo):
// a EF paga elevenlabs-tts deve receber o access_token da sessao no Bearer,
// NAO a anon key (VITE_SUPABASE_PUBLISHABLE_KEY). Ver PR #1002.

const mockGetSession = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
  },
}));

const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function openAndPickFirstVoice() {
  // abre o popover (botao TTS) e clica na primeira voz da lista
  fireEvent.click(screen.getByLabelText('Texto para Áudio (TTS)'));
  const voice = screen.getAllByRole('button').find((b) => /Grave/.test(b.textContent || ''));
  expect(voice, 'botao de voz nao encontrado').toBeTruthy();
  fireEvent.click(voice as HTMLElement);
}

describe('TextToAudioButton — auth da EF elevenlabs-tts (regressao #1000)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetSession.mockReset();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['x'], { type: 'audio/mpeg' }),
    }) as unknown as typeof fetch;
    // Audio() usado no auto-play do preview
    global.Audio = vi.fn().mockImplementation(() => ({ play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), onended: null, onerror: null }));
    global.URL.createObjectURL = vi.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('envia session.access_token no Bearer quando ha sessao', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-user-123' } } });
    render(<TextToAudioButton inputValue="ola mundo" onAudioReady={vi.fn()} />);
    openAndPickFirstVoice();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok-user-123');
    // NUNCA a anon key quando ha sessao
    expect(init.headers.Authorization).not.toBe(`Bearer ${ANON}`);
    // apikey continua sendo a anon (exigencia do gateway PostgREST)
    expect(init.headers.apikey).toBe(ANON);
  });

  it('cai na anon key apenas quando NAO ha sessao (rota p/ 401 limpo)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<TextToAudioButton inputValue="ola mundo" onAudioReady={vi.fn()} />);
    openAndPickFirstVoice();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Authorization).toBe(`Bearer ${ANON}`);
  });
});
