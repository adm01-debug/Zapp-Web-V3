/**
 * Evolution API v2 — Type definitions
 * Extracted from useEvolutionApi.ts for maintainability.
 */

export interface SendMessageParams {
  instanceName: string;
  number: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mimetype?: string;
  caption?: string;
  fileName?: string;
  delay?: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  locationAddress?: string;
  quoted?: {
    key: { remoteJid: string; fromMe: boolean; id: string };
    message: { conversation: string };
  };
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  /** Generate WhatsApp rich link preview when text contains a URL. */
  linkPreview?: boolean;
  /** Opção para habilitar retry e deduplicação no backend. */
  idempotencyKey?: string;
}

/**
 * Opções avançadas suportadas pelo endpoint Evolution `/message/sendText/{instance}`.
 * Conforme blueprint Evolution API v2: https://doc.evolution-api.com/v2/api-reference/message-controller/send-text
 */
export interface SendTextOptions {
  /** Atraso em ms antes do envio (server-side). */
  delay?: number;
  /** Mensagem citada (reply). */
  quoted?: SendMessageParams['quoted'];
  /** Lista de JIDs mencionados explicitamente (`@fulano`). */
  mentioned?: string[];
  /** Mencionar todos do grupo (`@everyone`). Apenas em grupos. */
  mentionsEveryOne?: boolean;
  /** Gerar link preview rich (default: true no servidor Evolution). */
  linkPreview?: boolean;
  /** Opção para habilitar retry e deduplicação no backend. */
  idempotencyKey?: string;
}

/** Parameters for group management operations via the Evolution API. */
export interface GroupParams {
  instanceName: string;
  groupJid: string;
  subject?: string;
  description?: string;
  participants?: string[];
  action?: 'add' | 'remove' | 'promote' | 'demote';
  image?: string;
  expiration?: number;
  inviteCode?: string;
}

/** Contact Card interface definition. */
export interface ContactCard {
  fullName: string;
  wuid: string;
  phoneNumber: string;
  organization?: string;
  email?: string;
  url?: string;
}

/** Poll Params interface definition. */
export interface PollParams {
  instanceName: string;
  number: string;
  name: string;
  selectableCount?: number;
  values: string[];
}

/** List Section interface definition. */
export interface ListSection {
  title: string;
  rows: { title: string; description?: string; rowId: string }[];
}

/** Button Item interface definition. */
export interface ButtonItem {
  type: 'reply';
  displayText: string;
  id: string;
}

/** Webhook Config interface definition. */
export interface WebhookConfig {
  instanceName: string;
  enabled?: boolean;
  url: string;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  events?: string[];
}

/** Settings Config interface definition. */
export interface SettingsConfig {
  instanceName: string;
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
}

/** Privacy Settings interface definition. */
export interface PrivacySettings {
  instanceName: string;
  readreceipts?: string;
  profile?: string;
  status?: string;
  online?: string;
  last?: string;
  groupadd?: string;
}

/** Typebot Config interface definition. */
export interface TypebotConfig {
  instanceName: string;
  enabled?: boolean;
  url: string;
  typebot: string;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  triggerType?: string;
  triggerOperator?: string;
  triggerValue?: string;
}

/** Open A I Config interface definition. */
export interface OpenAIConfig {
  instanceName: string;
  enabled?: boolean;
  openAiApiKey: string;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  speechToText?: boolean;
  botType?: 'chatCompletion' | 'assistant';
  assistantId?: string;
  model?: string;
  systemMessage?: string;
  maxTokens?: number;
  temperature?: number;
  triggerType?: string;
  triggerOperator?: string;
  triggerValue?: string;
  functionUrl?: string;
}

/** Dify Config interface definition. */
export interface DifyConfig {
  instanceName: string;
  enabled?: boolean;
  apiUrl: string;
  apiKey: string;
  botType?: 'chatBot' | 'textGenerator' | 'agent' | 'workflow';
  expire?: number;
  triggerType?: string;
  keywordFinish?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  speechToText?: boolean;
}

/** Flowise Config interface definition. */
export interface FlowiseConfig {
  instanceName: string;
  enabled?: boolean;
  apiUrl: string;
  apiKey?: string;
  chatflowId: string;
  expire?: number;
  triggerType?: string;
  triggerValue?: string;
}

/** Evolution Bot Config interface definition. */
export interface EvolutionBotConfig {
  instanceName: string;
  enabled?: boolean;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  triggerType?: string;
  triggerOperator?: string;
  triggerValue?: string;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  apiUrl: string;
  apiKey?: string;
}

/** Chatwoot Config interface definition. */
export interface ChatwootConfig {
  instanceName: string;
  enabled?: boolean;
  accountId: string;
  token: string;
  url: string;
  signMsg?: boolean;
  reopenConversation?: boolean;
  conversationPending?: boolean;
  nameInbox?: string;
  mergeBrazilContacts?: boolean;
  importContacts?: boolean;
  importMessages?: boolean;
  daysLimitImportMessages?: number;
  signDelimiter?: string;
  autoCreate?: boolean;
}

/** Create Instance Params interface definition. */
export interface CreateInstanceParams {
  instanceName: string;
  qrcode?: boolean;
  integration?: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS-CLOUD';
  token?: string;
  number?: string;
  businessId?: string;
  wabaId?: string;
  phoneNumberId?: string;
  webhook?: Partial<WebhookConfig>;
  chatwoot?: Partial<ChatwootConfig>;
  typebot?: Partial<TypebotConfig>;
}
