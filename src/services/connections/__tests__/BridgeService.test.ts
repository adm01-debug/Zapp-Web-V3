/**
 * Tests for BridgeService — F6-26 / Etapa 2.
 *
 * O `checkHealth` é o probe de conectividade com o Supabase externo (Evolution DB).
 * Tem três desfechos que a UI trata de formas diferentes — offline por cliente
 * ausente, online-com-tabela-faltando e offline por erro real — e nenhum deles
 * estava coberto. O caso do 42P01 é o mais sutil: banco alcançável apesar do
 * erro, e reportar 'offline' aí seria um falso alarme na tela.
 *
 * Coberto:
 *   - cliente externo não configurado → offline com mensagem explícita
 *   - ping bem-sucedido → online, sem erro
 *   - tabela inexistente por código 42P01 → online (banco alcançável)
 *   - tabela inexistente por mensagem "does not exist" → online
 *   - outro erro do Postgrest → offline com a mensagem do erro
 *   - exceção lançada pelo client → offline com a mensagem da exceção
 *   - erro não-Error → offline com mensagem padrão
 *   - o probe consulta `contacts` com limit 1 (consulta barata)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { limitMock, externalRef } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  externalRef: { current: null as unknown },
}));

vi.mock('@/integrations/supabase/externalClient', () => ({
  get externalSupabase() {
    return externalRef.current;
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { BridgeService } from '../BridgeService';

const selectMock = vi.fn(() => ({ limit: limitMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

beforeEach(() => {
  vi.clearAllMocks();
  externalRef.current = { from: fromMock };
  selectMock.mockReturnValue({ limit: limitMock });
  fromMock.mockReturnValue({ select: selectMock });
  limitMock.mockResolvedValue({ data: [], error: null });
});

describe('BridgeService.checkHealth', () => {
  it('cliente externo não configurado → offline com mensagem explícita', async () => {
    externalRef.current = null;
    await expect(BridgeService.checkHealth()).resolves.toEqual({
      health: null,
      error: 'Cliente externo não configurado.',
      status: 'offline',
    });
  });

  it('ping bem-sucedido → online sem erro', async () => {
    await expect(BridgeService.checkHealth()).resolves.toEqual({
      health: null,
      error: null,
      status: 'online',
    });
  });

  it('usa um probe barato: contacts, select id, limit 1', async () => {
    await BridgeService.checkHealth();
    expect(fromMock).toHaveBeenCalledWith('contacts');
    expect(selectMock).toHaveBeenCalledWith('id');
    expect(limitMock).toHaveBeenCalledWith(1);
  });

  it('tabela inexistente (código 42P01) → online: o banco está alcançável', async () => {
    limitMock.mockResolvedValue({ data: null, error: { code: '42P01', message: 'oops' } });
    const out = await BridgeService.checkHealth();
    expect(out.status).toBe('online');
    expect(out.error).toBeNull();
  });

  it('tabela inexistente pela mensagem "does not exist" → online', async () => {
    limitMock.mockResolvedValue({
      data: null,
      error: { message: 'relation "contacts" does not exist' },
    });
    const out = await BridgeService.checkHealth();
    expect(out.status).toBe('online');
  });

  it('outro erro do Postgrest → offline com a mensagem do erro', async () => {
    limitMock.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('permission denied for table contacts'), {
        code: '42501',
      }),
    });
    const out = await BridgeService.checkHealth();
    expect(out.status).toBe('offline');
    expect(out.error).toBe('permission denied for table contacts');
  });

  it('exceção lançada pelo client → offline com a mensagem da exceção', async () => {
    limitMock.mockRejectedValue(new Error('fetch failed'));
    const out = await BridgeService.checkHealth();
    expect(out).toEqual({ health: null, error: 'fetch failed', status: 'offline' });
  });

  it('erro não-Error → offline com mensagem padrão', async () => {
    limitMock.mockRejectedValue('kaput');
    const out = await BridgeService.checkHealth();
    expect(out.error).toBe('Falha ao verificar.');
    expect(out.status).toBe('offline');
  });
});
