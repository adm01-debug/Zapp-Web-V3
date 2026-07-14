import { useCallback } from 'react';
import type { HttpMethod } from './useEvolutionApiCore';

export function useEvolutionAiAgents(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
  // EvoAI
  const setEvoAI = useCallback(
    (
      instanceName: string,
      config: {
        enabled?: boolean;
        apiUrl: string;
        apiKey: string;
        agentId: string;
        expire?: number;
        triggerType?: string;
        triggerOperator?: string;
        triggerValue?: string;
        keywordFinish?: string;
        delayMessage?: number;
        unknownMessage?: string;
        listeningFromMe?: boolean;
        stopBotFromMe?: boolean;
        keepOpen?: boolean;
        debounceTime?: number;
        speechToText?: boolean;
      }
    ) =>
      withToast(
        'set-evoai',
        { instanceName, ...config },
        'EvoAI configurado',
        'Erro ao configurar EvoAI'
      ),
    [withToast]
  );
  const getEvoAI = useCallback(
    (instanceName: string) => callApi('get-evoai', { instanceName }, 'GET'),
    [callApi]
  );
  const deleteEvoAI = useCallback(
    (instanceName: string) =>
      withToast(
        'delete-evoai',
        { instanceName },
        'EvoAI removido',
        'Erro ao remover EvoAI',
        'DELETE'
      ),
    [withToast]
  );

  // N8N
  const setN8N = useCallback(
    (
      instanceName: string,
      config: {
        enabled?: boolean;
        webhookUrl: string;
        expire?: number;
        triggerType?: string;
        triggerOperator?: string;
        triggerValue?: string;
        keywordFinish?: string;
        delayMessage?: number;
        unknownMessage?: string;
        listeningFromMe?: boolean;
        stopBotFromMe?: boolean;
        keepOpen?: boolean;
        debounceTime?: number;
      }
    ) =>
      withToast(
        'set-n8n',
        { instanceName, ...config },
        'N8N configurado',
        'Erro ao configurar N8N'
      ),
    [withToast]
  );
  const getN8N = useCallback(
    (instanceName: string) => callApi('get-n8n', { instanceName }, 'GET'),
    [callApi]
  );
  const deleteN8N = useCallback(
    (instanceName: string) =>
      withToast('delete-n8n', { instanceName }, 'N8N removido', 'Erro ao remover N8N', 'DELETE'),
    [withToast]
  );

  return { setEvoAI, getEvoAI, deleteEvoAI, setN8N, getN8N, deleteN8N };
}
