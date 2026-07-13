import { useCallback } from 'react';
import type { HttpMethod } from './useEvolutionApiCore';
import type {
  TypebotConfig,
  OpenAIConfig,
  DifyConfig,
  FlowiseConfig,
  EvolutionBotConfig,
  ChatwootConfig,
} from '../evolutionApi.types';

export function useEvolutionBots(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
  // Chatwoot
  const setChatwoot = useCallback(
    (config: ChatwootConfig) =>
      withToast('set-chatwoot', config, 'Chatwoot configurado', 'Erro ao configurar Chatwoot'),
    [withToast]
  );
  const getChatwoot = useCallback(
    (instanceName: string) => callApi('get-chatwoot', { instanceName }, 'GET'),
    [callApi]
  );
  const deleteChatwoot = useCallback(
    (instanceName: string) =>
      withToast(
        'delete-chatwoot',
        { instanceName },
        'Chatwoot removido',
        'Erro ao remover Chatwoot',
        'DELETE'
      ),
    [withToast]
  );

  // Typebot
  const setTypebot = useCallback(
    (config: TypebotConfig) =>
      withToast('set-typebot', config, 'Typebot configurado', 'Erro ao configurar Typebot'),
    [withToast]
  );
  const getTypebot = useCallback(
    (instanceName: string) => callApi('get-typebot', { instanceName }, 'GET'),
    [callApi]
  );
  const deleteTypebot = useCallback(
    (instanceName: string) =>
      withToast(
        'delete-typebot',
        { instanceName },
        'Typebot removido',
        'Erro ao remover Typebot',
        'DELETE'
      ),
    [withToast]
  );
  const getTypebotSessions = useCallback(
    (instanceName: string, typebotId?: string) =>
      callApi('typebot-sessions', { instanceName, typebotId }, 'GET'),
    [callApi]
  );
  const changeTypebotStatus = useCallback(
    (instanceName: string, remoteJid: string, status: 'opened' | 'paused' | 'closed') =>
      callApi('typebot-change-status', { instanceName, remoteJid, status }),
    [callApi]
  );
  const startTypebot = useCallback(
    (instanceName: string, remoteJid: string, url: string, typebot: string, variables?: object) =>
      callApi('start-typebot', { instanceName, remoteJid, url, typebot, variables }),
    [callApi]
  );

  // OpenAI
  const setOpenAI = useCallback(
    (config: OpenAIConfig) =>
      withToast('set-openai', config, 'OpenAI configurado', 'Erro ao configurar OpenAI'),
    [withToast]
  );
  const getOpenAI = useCallback(
    (instanceName: string) => callApi('get-openai', { instanceName }, 'GET'),
    [callApi]
  );
  const deleteOpenAI = useCallback(
    (instanceName: string) =>
      withToast(
        'delete-openai',
        { instanceName },
        'OpenAI removido',
        'Erro ao remover OpenAI',
        'DELETE'
      ),
    [withToast]
  );

  // Dify
  const setDify = useCallback(
    (config: DifyConfig) =>
      withToast('set-dify', config, 'Dify configurado', 'Erro ao configurar Dify'),
    [withToast]
  );
  const getDify = useCallback(
    (instanceName: string) => callApi('get-dify', { instanceName }, 'GET'),
    [callApi]
  );
  const deleteDify = useCallback(
    (instanceName: string) =>
      withToast('delete-dify', { instanceName }, 'Dify removido', 'Erro ao remover Dify', 'DELETE'),
    [withToast]
  );

  // Flowise
  const setFlowise = useCallback(
    (config: FlowiseConfig) =>
      withToast('set-flowise', config, 'Flowise configurado', 'Erro ao configurar Flowise'),
    [withToast]
  );
  const getFlowise = useCallback(
    (instanceName: string) => callApi('get-flowise', { instanceName }, 'GET'),
    [callApi]
  );
  const deleteFlowise = useCallback(
    (instanceName: string) =>
      withToast(
        'delete-flowise',
        { instanceName },
        'Flowise removido',
        'Erro ao remover Flowise',
        'DELETE'
      ),
    [withToast]
  );

  // Evolution Bot
  const setEvolutionBot = useCallback(
    (config: EvolutionBotConfig) =>
      withToast(
        'set-evolution-bot',
        config,
        'Evolution Bot configurado',
        'Erro ao configurar Evolution Bot'
      ),
    [withToast]
  );
  const getEvolutionBot = useCallback(
    (instanceName: string) => callApi('get-evolution-bot', { instanceName }, 'GET'),
    [callApi]
  );
  const deleteEvolutionBot = useCallback(
    (instanceName: string) =>
      withToast(
        'delete-evolution-bot',
        { instanceName },
        'Evolution Bot removido',
        'Erro ao remover Evolution Bot',
        'DELETE'
      ),
    [withToast]
  );

  return {
    setChatwoot,
    getChatwoot,
    deleteChatwoot,
    setTypebot,
    getTypebot,
    deleteTypebot,
    getTypebotSessions,
    changeTypebotStatus,
    startTypebot,
    setOpenAI,
    getOpenAI,
    deleteOpenAI,
    setDify,
    getDify,
    deleteDify,
    setFlowise,
    getFlowise,
    deleteFlowise,
    setEvolutionBot,
    getEvolutionBot,
    deleteEvolutionBot,
  };
}
