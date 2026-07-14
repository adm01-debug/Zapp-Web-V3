import type { HttpMethod } from './useEvolutionApiCore';
import { useEvolutionProfile } from './useEvolutionProfile';
import { useEvolutionChats } from './useEvolutionChats';
import { useEvolutionBots } from './useEvolutionBots';
import { useEvolutionAiAgents } from './useEvolutionAiAgents';
import { useEvolutionStreaming } from './useEvolutionStreaming';
import { useEvolutionMisc } from './useEvolutionMisc';

export function useEvolutionIntegrations(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
  const profile = useEvolutionProfile(callApi, withToast);
  const chats = useEvolutionChats(callApi);
  const bots = useEvolutionBots(callApi, withToast);
  const aiAgents = useEvolutionAiAgents(callApi, withToast);
  const streaming = useEvolutionStreaming(callApi);
  const misc = useEvolutionMisc(callApi, withToast);

  return {
    ...profile,
    ...chats,
    ...bots,
    ...aiAgents,
    ...streaming,
    ...misc,
  };
}
