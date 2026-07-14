// Re-export from consolidated useEvolutionApiManagement module (ETAPA 18 consolidation)
export { useEvolutionApiManagement as useEvolutionApi } from './useEvolutionApiManagement';

export type {
  SendMessageParams, ContactCard, PollParams, ListSection, ButtonItem,
  WebhookConfig, SettingsConfig, PrivacySettings, TypebotConfig, OpenAIConfig,
  DifyConfig, FlowiseConfig, EvolutionBotConfig, ChatwootConfig, CreateInstanceParams,
  SendTextOptions,
} from './evolutionApi.types';
