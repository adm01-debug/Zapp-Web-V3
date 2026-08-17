/**
 * useFollowupBridge — vitest (AUTOMACOES-09 / construção FollowUp)
 *
 * Hook: src/hooks/useFollowupBridge.ts
 * Contrato:
 *   const { triggerSequence, isPending, isSuccess, isError, error, data } = useFollowupBridge();
 *   await triggerSequence({ sequence_id, contact_jid, instance_name, trigger_event? })
 *     → Promise<TriggerSequenceResult>  (mutateAsync por baixo)
 *
 * Cobertura (eixos da tarefa):
 *   1. LISTA  — superfície retornada pelo hook (campos/funções) + lista de
 *      etapas VAZIA (steps_queued === 0) → toast.info "não tem etapas ativas"
 *   2. CONCLUIR — disparo bem-sucedido: invoke() com nome/body corretos,
 *      resultado retornado, toasts de sucesso (plural 3 etapas / singular 1 etapa),
 *      estados isPending/isSuccess/data
 *   3. ERRO   — invoke devolve { error } → throw + toast.error + isError/error;
 *      error sem message → fallback 'followup-bridge call failed';
 *      invoke devolve sem data → throw 'followup-bridge returned no data';
 *      rejeição propaga para o chamador (mutateAsync)
 *
 * NOTA (react-query v5.101): o notify do MutationObserver é agendado em
 * microtask — asserts de ESTADO pós-mutação usam waitFor(); asserts de
 * callback (toast.*) são síncronos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { useFollowupBridge, type TriggerSequenceParams, type TriggerSequenceResult } from '@/hooks/useFollowupBridge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const mockInvoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;
const mockToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const baseParams: TriggerSequenceParams = {
  sequence_id: '0f2c5f0e-1111-4222-8333-444455556666',
  contact_jid: '5511999999999@s.whatsapp.net',
  instance_name: 'wpp2',
};

const successResult: TriggerSequenceResult = {
  success: true,
  steps_queued: 3,
  sequence_name: 'Pós-venda',
  contact_resolved: true,
  message: '3 etapas agendadas',
};

describe('useFollowupBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ data: successResult, error: null });
  });

  // ═══════════════════════════════════════════════════════════════
  // 1. LISTA — superfície do hook + lista de etapas vazia
  // ═══════════════════════════════════════════════════════════════
  describe('API surface (lista)', () => {
    it('expõe triggerSequence como função e estados iniciais zerados', () => {
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      expect(typeof result.current.triggerSequence).toBe('function');
      expect(result.current.isPending).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
      // react-query v5: data inicial é undefined (não null)
      expect(result.current.data).toBeUndefined();
      expect(result.current.mutation).toBeDefined();
    });

    it('steps_queued === 0 → toast.info "não tem etapas ativas" (sem toast.success)', async () => {
      mockInvoke.mockResolvedValue({
        data: { success: true, steps_queued: 0, sequence_name: 'Boas-vindas' },
        error: null,
      });
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.triggerSequence(baseParams);
      });

      expect(mockToast.info).toHaveBeenCalledTimes(1);
      expect(mockToast.info).toHaveBeenCalledWith(
        'Sequência "Boas-vindas" não tem etapas ativas',
      );
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockToast.error).not.toHaveBeenCalled();
      // Resultado ainda é devolvido ao chamador
      await waitFor(() => {
        expect(result.current.data?.steps_queued).toBe(0);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. CONCLUIR — disparo bem-sucedido da sequência
  // ═══════════════════════════════════════════════════════════════
  describe('Sucesso (concluir)', () => {
    it('invoca a edge function followup-bridge com o body completo', async () => {
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      const params: TriggerSequenceParams = {
        ...baseParams,
        trigger_event: 'conversation_closed',
      };
      await act(async () => {
        await result.current.triggerSequence(params);
      });

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith('followup-bridge', { body: params });
    });

    it('envia params sem trigger_event quando omitido', async () => {
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.triggerSequence(baseParams);
      });

      expect(mockInvoke).toHaveBeenCalledWith('followup-bridge', { body: baseParams });
    });

    it('retorna o resultado da edge function ao chamador', async () => {
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      let returned: TriggerSequenceResult | undefined;
      await act(async () => {
        returned = await result.current.triggerSequence(baseParams);
      });

      expect(returned).toEqual(successResult);
      await waitFor(() => {
        expect(result.current.data).toEqual(successResult);
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.isError).toBe(false);
      });
    });

    it('toast.success com plural — "3 etapas agendadas"', async () => {
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.triggerSequence(baseParams);
      });

      expect(mockToast.success).toHaveBeenCalledTimes(1);
      expect(mockToast.success).toHaveBeenCalledWith(
        'Sequência "Pós-venda" iniciada — 3 etapas agendadas',
      );
    });

    it('toast.success com singular — "1 etapa agendada"', async () => {
      mockInvoke.mockResolvedValue({
        data: { success: true, steps_queued: 1, sequence_name: 'Cobrança' },
        error: null,
      });
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.triggerSequence(baseParams);
      });

      expect(mockToast.success).toHaveBeenCalledWith(
        'Sequência "Cobrança" iniciada — 1 etapa agendada',
      );
    });

    it('isPending fica true durante o voo da requisição', async () => {
      let resolveInvoke!: (v: { data: TriggerSequenceResult; error: null }) => void;
      mockInvoke.mockReturnValue(
        new Promise<{ data: TriggerSequenceResult; error: null }>((resolve) => {
          resolveInvoke = resolve;
        }),
      );
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      let promise!: Promise<TriggerSequenceResult>;
      act(() => {
        promise = result.current.triggerSequence(baseParams);
      });
      // notify do observer é agendado via setTimeout(0) → waitFor
      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      await act(async () => {
        resolveInvoke({ data: successResult, error: null });
        await promise;
      });
      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. ERRO — falhas da edge function
  // ═══════════════════════════════════════════════════════════════
  describe('Erro', () => {
    /**
     * Armadilha do act (react-query v5): se a rejeição do mutateAsync vazar
     * para fora do callback do act, o React NÃO faz flush do estado do
     * observer (isError nunca chega). Capturar o erro DENTRO do act e
     * assertir a rejeição via variável capturada.
     */
    async function runAndCatchError(result: { current: ReturnType<typeof useFollowupBridge> }): Promise<Error> {
      let caught: unknown;
      await act(async () => {
        try {
          await result.current.triggerSequence(baseParams);
        } catch (e) {
          caught = e;
        }
      });
      expect(caught).toBeInstanceOf(Error);
      return caught as Error;
    }

    it('invoke com error → rejeita com a mensagem + toast.error + isError', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: { message: 'sequence not active' },
      });
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      const err = await runAndCatchError(result);
      expect(err.message).toBe('sequence not active');

      expect(mockToast.error).toHaveBeenCalledTimes(1);
      expect(mockToast.error).toHaveBeenCalledWith(
        'Erro ao iniciar sequência de follow-up: sequence not active',
      );
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
        expect(result.current.error?.message).toBe('sequence not active');
        expect(result.current.isSuccess).toBe(false);
      });
    });

    it('invoke com error sem message → fallback "followup-bridge call failed"', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: {} });
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      const err = await runAndCatchError(result);
      expect(err.message).toBe('followup-bridge call failed');

      expect(mockToast.error).toHaveBeenCalledWith(
        'Erro ao iniciar sequência de follow-up: followup-bridge call failed',
      );
      await waitFor(() => {
        expect(result.current.error?.message).toBe('followup-bridge call failed');
      });
    });

    it('invoke sem data e sem error → rejeita com "followup-bridge returned no data"', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: null });
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      const err = await runAndCatchError(result);
      expect(err.message).toBe('followup-bridge returned no data');

      expect(mockToast.error).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it('invoke rejeitando (exceção) → propaga e marca isError', async () => {
      mockInvoke.mockRejectedValue(new Error('network down'));
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      const err = await runAndCatchError(result);
      expect(err.message).toBe('network down');

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
        expect(result.current.error?.message).toBe('network down');
      });
      expect(mockToast.error).toHaveBeenCalledWith(
        'Erro ao iniciar sequência de follow-up: network down',
      );
    });

    it('não chama toast.success nem toast.info em falha', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
      const { result } = renderHook(() => useFollowupBridge(), { wrapper: createWrapper() });

      await runAndCatchError(result);

      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockToast.info).not.toHaveBeenCalled();
    });
  });
});
