import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { createMockSupabase } from '@/test/mocks/supabase';
import { useEvolutionApiIntegration } from '../useEvolutionApiIntegration';

type MockClient = ReturnType<typeof createMockSupabase>;

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMocks }));

const supabaseMock = vi.hoisted(() => ({
  client: null as unknown as MockClient,
  credsRows: [] as unknown[],
  logsRows: [] as unknown[],
  confirmSpy: vi.fn(),
}));

// Mock do client: view zapp.evolution_instance_credentials (SEM api_key) + health logs.
vi.mock('@/integrations/supabase/client', async () => {
  const { createMockSupabase } =
    await vi.importActual<typeof import('@/test/mocks/supabase')>('@/test/mocks/supabase');
  supabaseMock.client = createMockSupabase({
    tables: {
      evolution_instance_credentials: { data: supabaseMock.credsRows },
      evolution_health_logs: { data: supabaseMock.logsRows },
    },
  });
  return { supabase: supabaseMock.client };
});

const CRED_ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  instance_name: 'wpp2',
  api_url: 'https://evolution.atomicabr.com.br',
  is_active: true,
  health_status: 'healthy',
  last_health_check: null,
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  supabaseMock.credsRows.length = 0;
  supabaseMock.credsRows.push(
    { ...CRED_ROW },
    { ...CRED_ROW, id: '00000000-0000-4000-8000-000000000002', instance_name: 'wpp3' }
  );
  supabaseMock.logsRows.length = 0;
  supabaseMock.logsRows.push({
    id: '00000000-0000-4000-8000-000000000011',
    instance_name: 'wpp2',
    status: 'success',
    error_message: null,
    response_time_ms: 120,
    online_instances: 1,
    total_instances: 1,
    performed_at: '2026-08-04T12:00:00Z',
  });

  supabaseMock.client.from.mockClear();
  supabaseMock.client.schema.mockClear();
  supabaseMock.client.functions.invoke.mockReset();
  supabaseMock.client.functions.invoke.mockResolvedValue({
    data: { ok: true, id: 'new-id' },
    error: null,
  });
  toastMocks.error.mockClear();
  toastMocks.success.mockClear();
  toastMocks.warning.mockClear();

  // happy-dom não implementa window.confirm — define um spy controlável.
  supabaseMock.confirmSpy.mockReset();
  supabaseMock.confirmSpy.mockReturnValue(true);
  Object.defineProperty(window, 'confirm', {
    writable: true,
    configurable: true,
    value: supabaseMock.confirmSpy,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useEvolutionApiIntegration (fix: credenciais via view zapp + edge function)', () => {
  it('carrega credenciais da view zapp SEM expor api_key e sem .schema("evo")', async () => {
    const { result } = renderHook(() => useEvolutionApiIntegration());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.credentials).toHaveLength(2);
    expect(result.current.healthLogs).toHaveLength(1);

    // A view omite api_key — nunca vem da listagem
    expect(result.current.credentials[0]).not.toHaveProperty('api_key');
    expect(result.current.credentials[0].api_key).toBeUndefined();

    // Leitura direta na view (PGRST_DB_SCHEMAS expõe zapp) — sem .schema('evo')
    expect(supabaseMock.client.from).toHaveBeenCalledWith('evolution_instance_credentials');
    expect(supabaseMock.client.from).toHaveBeenCalledWith('evolution_health_logs');
    expect(supabaseMock.client.schema).not.toHaveBeenCalled();
  });

  it('handleSave valida campos obrigatórios antes de chamar a edge function', async () => {
    const { result } = renderHook(() => useEvolutionApiIntegration());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSave();
    });

    expect(toastMocks.error).toHaveBeenCalledWith('Preencha todos os campos obrigatórios');
    expect(supabaseMock.client.functions.invoke).not.toHaveBeenCalled();
  });

  it('handleSave escreve via invoke("evolution-credentials", POST action save) — nunca via .schema', async () => {
    const { result } = renderHook(() => useEvolutionApiIntegration());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setFormData({
        instance_name: 'wpp2',
        api_url: 'https://evolution.atomicabr.com.br',
        api_key: 'secret-key',
        show_key: false,
        is_editing: null,
      });
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(supabaseMock.client.schema).not.toHaveBeenCalled();
    expect(supabaseMock.client.functions.invoke).toHaveBeenCalledWith('evolution-credentials', {
      method: 'POST',
      body: expect.objectContaining({
        action: 'save',
        instance_name: 'wpp2',
        api_url: 'https://evolution.atomicabr.com.br',
        api_key: 'secret-key',
      }),
    });
    expect(toastMocks.success).toHaveBeenCalledWith('Novas credenciais salvas');
  });

  it('handleDelete escreve via invoke("evolution-credentials", POST action delete)', async () => {
    const { result } = renderHook(() => useEvolutionApiIntegration());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleDelete('00000000-0000-4000-8000-000000000001', 'wpp2');
    });

    expect(supabaseMock.confirmSpy).toHaveBeenCalled();
    expect(supabaseMock.client.functions.invoke).toHaveBeenCalledWith('evolution-credentials', {
      method: 'POST',
      body: { action: 'delete', id: '00000000-0000-4000-8000-000000000001' },
    });
    expect(toastMocks.success).toHaveBeenCalledWith('Credenciais excluídas');
    expect(supabaseMock.client.schema).not.toHaveBeenCalled();
  });

  it('erro da edge function vira toast de erro (sem crash)', async () => {
    supabaseMock.client.functions.invoke.mockResolvedValue({
      data: null,
      error: new Error('edge fn boom'),
    });
    const { result } = renderHook(() => useEvolutionApiIntegration());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setFormData({
        instance_name: 'wpp2',
        api_url: 'https://evolution.atomicabr.com.br',
        api_key: 'secret-key',
        show_key: false,
        is_editing: null,
      });
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(toastMocks.error).toHaveBeenCalledWith(expect.stringContaining('Erro ao salvar'));
  });

  it('handleTestConnection usa o proxy evolution-api (nunca fetch direto com chave no cliente)', async () => {
    supabaseMock.client.functions.invoke.mockResolvedValue({
      data: [{ connectionStatus: 'open' }],
      error: null,
    });
    const { result } = renderHook(() => useEvolutionApiIntegration());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleTestConnection({
        id: '00000000-0000-4000-8000-000000000001',
        instance_name: 'wpp2',
        api_url: 'https://evolution.atomicabr.com.br',
        api_key: 'secret-key',
      });
    });

    expect(supabaseMock.client.functions.invoke).toHaveBeenCalledWith('evolution-api', {
      body: { action: 'list-instances' },
    });
    expect(toastMocks.success).toHaveBeenCalledWith('Teste bem-sucedido para wpp2');
    // health log gravado via RPC canônica (F3 ingest-port), não via insert direto
    expect(supabaseMock.client.rpc).toHaveBeenCalledWith('rpc_log_evolution_health', {
      p_instance_name: 'wpp2',
      p_status: 'success',
      p_error_message: null,
      p_response_time_ms: expect.any(Number),
      p_online_instances: 1,
      p_total_instances: 1,
    });
  });
});
