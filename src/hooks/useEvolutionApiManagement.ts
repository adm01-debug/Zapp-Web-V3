/**
 * Evolution API Management Hook — Unified orchestration of all Evolution API integrations.
 * Consolidates 12 domain-specific hooks into one comprehensive module.
 *
 * Sections:
 * 1. Core API — Low-level HTTP, retry logic, idempotency
 * 2. Instance Management — Create, connect, disconnect, lifecycle
 * 3. Messaging — Send messages, mark read, manage chat state
 * 4. Groups — Group creation, member management, settings
 * 5. Profile — Fetch/update profile, privacy, labels
 * 6. Chats — Find chats/messages/contacts, media retrieval
 * 7. Bots — Bot integrations (Chatwoot, Typebot, OpenAI, Dify, Flowise, EvolutionBot)
 * 8. AI Agents — AI agent settings (EvoAI, N8N)
 * 9. Streaming — Event streaming backends (RabbitMQ, SQS, Kafka, Nats, Pusher)
 * 10. Miscellaneous — Templates, blocking, catalog, proxy settings
 * 11. Orchestration — Main hook combining all domains
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { normalizeIdempotencyKey, deriveIdempotencyKey } from '@/lib/idempotency';
import { loadRetryConfig, getRetryConfigSync } from '@/lib/retryConfig';
import {
  withV237Fallback,
  fallbackFindChats,
  fallbackFindContacts,
  fallbackFetchProfile,
} from '@/hooks/evolution/v237Fallbacks';

import type {
  SendMessageParams,
  SendTextOptions,
  ContactCard,
  PollParams,
  ListSection,
  ButtonItem,
  WebhookConfig,
  SettingsConfig,
  PrivacySettings,
  TypebotConfig,
  OpenAIConfig,
  DifyConfig,
  FlowiseConfig,
  EvolutionBotConfig,
  ChatwootConfig,
  CreateInstanceParams,
} from '@/hooks/evolutionApi.types';

// ─── Type Exports ─────────────────────────────────────────────────────────
// HttpMethod and CallApiOptions are declared locally below.
/** Re-exported module members. */
export type {
  SendMessageParams,
  ContactCard,
  PollParams,
  ListSection,
  ButtonItem,
  WebhookConfig,
  SettingsConfig,
  PrivacySettings,
  TypebotConfig,
  OpenAIConfig,
  DifyConfig,
  FlowiseConfig,
  EvolutionBotConfig,
  ChatwootConfig,
  CreateInstanceParams,
  SendTextOptions,
} from '@/hooks/evolutionApi.types';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: CORE API — Low-level HTTP, retry logic, idempotency
// ═══════════════════════════════════════════════════════════════════════════

/** Http Method type alias. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Call Api Options interface definition. */
export interface CallApiOptions {
  method?: HttpMethod;
  retries?: number;
  baseBackoffMs?: number;
  timeoutMs?: number;
  idempotencyKey?: string;
}

const IDEMPOTENT_METHODS = new Set<HttpMethod>(['GET']);

interface EvolutionApiError extends Error {
  details?: unknown;
  apiStatus?: number;
  retries?: number;
  retryAfterMs?: number;
}

/** Returns true for HTTP status codes that warrant a retry (5xx, 408, 425, 429, or unknown), and false for terminal auth failures (401, 403). */
function isRetriableStatus(status?: number): boolean {
  if (status == null) return true;
  if (status === 401 || status === 403) return false;
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

/** Parses a Retry-After header value (seconds as a number/string or an HTTP-date string) into milliseconds, returning undefined when the value is absent or unparseable. */
function parseRetryAfter(raw: unknown): number | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n * 1000);
  const date = Date.parse(String(raw));
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/** Resolves after ms milliseconds, or rejects with an AbortError immediately if the provided AbortSignal is already aborted or fires during the wait. */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

// ─── v237 Fallbacks imported from evolution/v237Fallbacks ────────────────────

/** Provides low-level Evolution API HTTP calls with retry logic and idempotency. */
export function useEvolutionApiCore() {
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useMountedRef();
  const inflightRef = useRef<Map<string, Promise<unknown>>>(new Map());

  useEffect(() => {
    void loadRetryConfig();
  }, []);

  const callApi = useCallback(
    async <T = unknown>(
      action: string,
      body?: object,
      methodOrOptions: HttpMethod | CallApiOptions = 'POST'
    ): Promise<T> => {
      const opts: CallApiOptions =
        typeof methodOrOptions === 'string' ? { method: methodOrOptions } : methodOrOptions;
      const method: HttpMethod = opts.method ?? 'POST';
      const dynCfg = getRetryConfigSync();
      const baseBackoffMs = opts.baseBackoffMs ?? dynCfg.baseBackoffMs;
      const timeoutMs = 45000;

      const userKey = normalizeIdempotencyKey(opts.idempotencyKey);
      if (opts.idempotencyKey && userKey !== opts.idempotencyKey) {
        log.debug('Idempotency key sanitized', {
          originalLength: opts.idempotencyKey.length,
          sanitizedPrefix: userKey?.slice(0, 16),
        });
      }
      const derivedKey =
        !userKey && method === 'POST' ? await deriveIdempotencyKey(action, body) : undefined;
      const effectiveKey = userKey ?? derivedKey;

      const canRetry = IDEMPOTENT_METHODS.has(method) || !!userKey;
      const retries = Math.max(1, opts.retries ?? (canRetry ? dynCfg.maxRetries : 1));

      const dedupeKey = effectiveKey
        ? `${method}:${action}:${effectiveKey}`
        : IDEMPOTENT_METHODS.has(method)
          ? `${method}:${action}`
          : '';
      if (dedupeKey) {
        const existing = inflightRef.current.get(dedupeKey);
        if (existing) return existing as Promise<T>;
      }

      if (mountedRef.current) setIsLoading(true);

      const run = (async (): Promise<T> => {
        let attempt = 0;
        let lastError: EvolutionApiError | null = null;

        while (attempt < retries) {
          attempt++;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const invokeOpts: {
              method: 'POST';
              body: object;
              headers?: Record<string, string>;
              signal?: AbortSignal;
            } = {
              method: 'POST',
              body: body ?? {},
              signal: controller.signal,
            };
            if (userKey) {
              invokeOpts.headers = { 'Idempotency-Key': userKey };
            }

            const { data, error } = await supabase.functions.invoke(
              `evolution-api/${action}`,
              invokeOpts
            );
            if (error) {
              const err = Object.assign(new Error(error.message || 'Evolution API error'), {
                apiStatus: (error as { status?: number }).status,
              }) as EvolutionApiError;
              throw err;
            }
            if (data && typeof data === 'object' && (data as { error?: boolean }).error === true) {
              const d = data as {
                message?: string;
                details?: unknown;
                status?: number;
                retryAfter?: unknown;
              };
              const apiError = Object.assign(new Error(d.message || 'Evolution API error'), {
                details: d.details,
                apiStatus: d.status,
                retries: attempt,
                retryAfterMs: parseRetryAfter(d.retryAfter),
              }) as EvolutionApiError;
              throw apiError;
            }
            return data as T;
          } catch (error) {
            const err = error as EvolutionApiError;
            lastError = err;
            const status = err.apiStatus;
            if (attempt >= retries || !isRetriableStatus(status)) break;

            const backoff = err.retryAfterMs ?? baseBackoffMs * 2 ** (attempt - 1);
            const jitter = Math.floor(Math.random() * 100);
            try {
              await sleep(backoff + jitter);
            } catch {
              break;
            }
            continue;
          } finally {
            clearTimeout(timeoutId);
          }
        }

        log.error(`Evolution API error (${action}) after ${attempt} attempt(s):`, lastError);
        throw lastError ?? new Error(`Evolution API failed: ${action}`);
      })();

      const wrapped = run.finally(() => {
        if (dedupeKey) inflightRef.current.delete(dedupeKey);
        if (mountedRef.current) setIsLoading(false);
      });

      if (dedupeKey) inflightRef.current.set(dedupeKey, wrapped);
      return wrapped;
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const withToast = useCallback(
    async <T = unknown>(
      action: string,
      body: object | undefined,
      successMsg: string,
      errorMsg: string,
      methodOrOptions: HttpMethod | CallApiOptions = 'POST'
    ): Promise<T> => {
      try {
        const data = await callApi<T>(action, body, methodOrOptions);
        toast.success(successMsg);
        return data;
      } catch (error) {
        const msg = error instanceof Error ? error.message : errorMsg;
        toast.error(msg);
        throw error;
      }
    },
    [callApi]
  );

  return { isLoading, callApi, withToast };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: INSTANCE MANAGEMENT — Create, connect, disconnect, lifecycle
// ═══════════════════════════════════════════════════════════════════════════

/** Provides instance lifecycle operations: create, connect, reconnect, logout, restart, delete, and QR/pairing-code retrieval against the Evolution API. */
function useEvolutionInstance(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
  const createInstance = useCallback(
    (params: CreateInstanceParams) =>
      withToast(
        'create-instance',
        params,
        'Instância criada com sucesso',
        'Erro ao criar instância'
      ),
    [withToast]
  );

  const listInstances = useCallback(
    (instanceName?: string) =>
      callApi('list-instances', instanceName ? { instanceName } : undefined, 'GET'),
    [callApi]
  );

  const connectInstance = useCallback(
    (instanceName: string) => callApi('connect', { instanceName }),
    [callApi]
  );

  const getInstanceStatus = useCallback(
    (instanceName: string) => callApi('status', { instanceName }),
    [callApi]
  );

  const getInstanceInfo = useCallback(
    (instanceName: string) => callApi('instance-info', { instanceName }, 'GET'),
    [callApi]
  );

  const restartInstance = useCallback(
    (instanceName: string) =>
      withToast('restart-instance', { instanceName }, 'Instância reiniciada', 'Erro ao reiniciar'),
    [withToast]
  );

  const disconnectInstance = useCallback(
    (instanceName: string) =>
      withToast('disconnect', { instanceName }, 'Instância desconectada', 'Erro ao desconectar'),
    [withToast]
  );

  const deleteInstance = useCallback(
    (instanceName: string) =>
      withToast(
        'delete-instance',
        { instanceName },
        'Instância excluída',
        'Erro ao excluir instância',
        'DELETE'
      ),
    [withToast]
  );

  const setPresence = useCallback(
    (
      instanceName: string,
      presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'
    ) => callApi('set-presence', { instanceName, presence }),
    [callApi]
  );

  const setSettings = useCallback(
    (config: SettingsConfig) =>
      withToast('set-settings', config, 'Configurações salvas', 'Erro ao salvar configurações'),
    [withToast]
  );

  const getSettings = useCallback(
    (instanceName: string) => callApi('get-settings', { instanceName }, 'GET'),
    [callApi]
  );

  const setWebhook = useCallback(
    (config: WebhookConfig) =>
      withToast('set-webhook', config, 'Webhook configurado', 'Erro ao configurar webhook'),
    [withToast]
  );

  const getWebhook = useCallback(
    (instanceName: string) => callApi('get-webhook', { instanceName }, 'GET'),
    [callApi]
  );

  return {
    createInstance,
    listInstances,
    connectInstance,
    getInstanceStatus,
    getInstanceInfo,
    restartInstance,
    disconnectInstance,
    deleteInstance,
    setPresence,
    setSettings,
    getSettings,
    setWebhook,
    getWebhook,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: MESSAGING — Send messages, mark read, manage chat state
// ═══════════════════════════════════════════════════════════════════════════

/** Provides all outbound messaging operations: text, media, audio, sticker, location, contact, reaction, poll, list, button, and template sends; plus read-marking, chat archiving, muting, and message editing/deletion. */
function useEvolutionMessaging(
  callApi: (
    action: string,
    body?: object,
    methodOrOptions?: HttpMethod | CallApiOptions
  ) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    methodOrOptions?: HttpMethod | CallApiOptions
  ) => Promise<unknown>
) {
  const sendTextMessage = useCallback(
    (instanceName: string, number: string, text: string, options?: SendTextOptions) =>
      callApi(
        'send-text',
        { instanceName, number, text, ...options },
        { idempotencyKey: options?.idempotencyKey }
      ),
    [callApi]
  );

  const sendMediaMessage = useCallback(
    (params: SendMessageParams) =>
      callApi('send-media', params, { idempotencyKey: params.idempotencyKey }),
    [callApi]
  );

  const sendAudioMessage = useCallback(
    (
      instanceName: string,
      number: string,
      mediaUrl: string,
      options?: { encoding?: boolean; delay?: number; idempotencyKey?: string }
    ) =>
      callApi(
        'send-audio',
        { instanceName, number, mediaUrl, ...options },
        { idempotencyKey: options?.idempotencyKey }
      ),
    [callApi]
  );

  const sendStickerMessage = useCallback(
    (
      instanceName: string,
      number: string,
      sticker: string,
      options?: { idempotencyKey?: string }
    ) =>
      callApi(
        'send-sticker',
        { instanceName, number, sticker, ...options },
        { idempotencyKey: options?.idempotencyKey }
      ),
    [callApi]
  );

  const sendLocationMessage = useCallback(
    (params: SendMessageParams) =>
      callApi('send-location', params, { idempotencyKey: params.idempotencyKey }),
    [callApi]
  );

  const sendContactMessage = useCallback(
    (instanceName: string, number: string, contact: ContactCard[]) =>
      callApi('send-contact', { instanceName, number, contact }),
    [callApi]
  );

  const sendReaction = useCallback(
    (
      instanceName: string,
      key: { remoteJid: string; fromMe: boolean; id: string },
      reaction: string
    ) => callApi('send-reaction', { instanceName, key, reaction }),
    [callApi]
  );

  const sendPollMessage = useCallback(
    (params: PollParams) => callApi('send-poll', params),
    [callApi]
  );

  const sendListMessage = useCallback(
    (
      instanceName: string,
      number: string,
      title: string,
      description: string,
      buttonText: string,
      sections: ListSection[],
      footer?: string
    ) =>
      callApi('send-list', {
        instanceName,
        number,
        title,
        description,
        buttonText,
        sections,
        footer,
      }),
    [callApi]
  );

  const sendButtonsMessage = useCallback(
    (
      instanceName: string,
      number: string,
      title: string,
      description: string,
      buttons: ButtonItem[],
      footer?: string
    ) => callApi('send-buttons', { instanceName, number, title, description, buttons, footer }),
    [callApi]
  );

  const sendStatusMessage = useCallback(
    (instanceName: string, body: object) => callApi('send-status', { instanceName, ...body }),
    [callApi]
  );

  const sendTemplateMessage = useCallback(
    (instanceName: string, number: string, template: object) =>
      callApi('send-template', { instanceName, number, template }),
    [callApi]
  );

  const sendPtvMessage = useCallback(
    (instanceName: string, number: string, video: string, delay?: number) =>
      callApi('send-ptv', { instanceName, number, video, delay }),
    [callApi]
  );

  const sendChatPresence = useCallback(
    (
      instanceName: string,
      number: string,
      presence: 'composing' | 'recording' | 'paused',
      delay?: number
    ) => callApi('send-chat-presence', { instanceName, number, presence, delay }),
    [callApi]
  );

  const sendTextHumanized = useCallback(
    async (
      instanceName: string,
      number: string,
      text: string,
      options?: SendTextOptions & {
        pauseMs?: number;
        minLengthForPause?: number;
      }
    ) => {
      const pauseMs = options?.pauseMs ?? 1200;
      const minLength = options?.minLengthForPause ?? 40;
      const shouldSimulate = text.length >= minLength && pauseMs > 0;
      if (shouldSimulate) {
        try {
          await callApi('send-chat-presence', {
            instanceName,
            number,
            presence: 'composing',
            delay: pauseMs,
          });
        } catch {
          // Presence is best-effort
        }
        await new Promise((r) => setTimeout(r, pauseMs));
      }
      const { pauseMs: _pm, minLengthForPause: _ml, ...rest } = options ?? {};
      return callApi('send-text', { instanceName, number, text, ...rest });
    },
    [callApi]
  );

  const markMessageAsRead = useCallback(
    (instanceName: string, key: object) => callApi('mark-read', { instanceName, key }),
    [callApi]
  );

  const markMessageAsUnread = useCallback(
    (instanceName: string, key: object) => callApi('mark-unread', { instanceName, key }),
    [callApi]
  );

  const archiveChat = useCallback(
    (instanceName: string, lastMessage: object, chat: string, archive = true) =>
      callApi('archive-chat', { instanceName, lastMessage, chat, archive }),
    [callApi]
  );

  const deleteMessage = useCallback(
    (instanceName: string, id: string, remoteJid: string, fromMe: boolean) =>
      callApi('delete-message', { instanceName, id, remoteJid, fromMe }, 'DELETE'),
    [callApi]
  );

  const updateMessage = useCallback(
    (instanceName: string, number: string, key: object, text: string) =>
      callApi('update-message', { instanceName, number, key, text }),
    [callApi]
  );

  const deleteMessageForEveryone = useCallback(
    (instanceName: string, body: object) =>
      callApi('delete-for-everyone', { instanceName, ...body }, 'DELETE'),
    [callApi]
  );

  const editMessage = useCallback(
    (instanceName: string, body: object) => callApi('edit-message', { instanceName, ...body }),
    [callApi]
  );

  const pinChat = useCallback(
    (instanceName: string, remoteJid: string) =>
      withToast('pin-chat', { instanceName, remoteJid }, 'Chat fixado', 'Erro ao fixar chat'),
    [withToast]
  );

  const unpinChat = useCallback(
    (instanceName: string, remoteJid: string) =>
      withToast(
        'unpin-chat',
        { instanceName, remoteJid },
        'Chat desfixado',
        'Erro ao desfixar chat'
      ),
    [withToast]
  );

  const starMessage = useCallback(
    (
      instanceName: string,
      key: { remoteJid: string; fromMe: boolean; id: string },
      star: boolean = true
    ) =>
      withToast(
        'star-message',
        { instanceName, key, star },
        star ? 'Mensagem marcada' : 'Marcação removida',
        'Erro ao marcar mensagem'
      ),
    [withToast]
  );

  const clearChat = useCallback(
    (instanceName: string, remoteJid: string) =>
      withToast(
        'clear-chat',
        { instanceName, remoteJid },
        'Chat limpo',
        'Erro ao limpar chat',
        'DELETE'
      ),
    [withToast]
  );

  const setDisappearingMessages = useCallback(
    (instanceName: string, remoteJid: string, expiration: 0 | 86400 | 604800 | 7776000) =>
      withToast(
        'set-disappearing',
        { instanceName, remoteJid, expiration },
        expiration === 0 ? 'Mensagens temporárias desativadas' : 'Mensagens temporárias ativadas',
        'Erro ao configurar mensagens temporárias'
      ),
    [withToast]
  );

  const fetchContactProfile = useCallback(
    (instanceName: string, number: string) =>
      callApi('fetch-profile', { instanceName, number }, 'GET'),
    [callApi]
  );

  const muteChat = useCallback(
    (instanceName: string, remoteJid: string, duration: number) =>
      withToast(
        'mute-chat',
        { instanceName, remoteJid, duration },
        duration === 0 ? 'Notificações ativadas' : 'Chat silenciado',
        'Erro ao silenciar chat'
      ),
    [withToast]
  );

  return {
    sendTextMessage,
    sendMediaMessage,
    sendAudioMessage,
    sendStickerMessage,
    sendLocationMessage,
    sendContactMessage,
    sendReaction,
    sendPollMessage,
    sendListMessage,
    sendButtonsMessage,
    sendStatusMessage,
    sendTemplateMessage,
    sendPtvMessage,
    sendChatPresence,
    sendTextHumanized,
    markMessageAsRead,
    markMessageAsUnread,
    archiveChat,
    deleteMessage,
    updateMessage,
    deleteMessageForEveryone,
    editMessage,
    pinChat,
    unpinChat,
    starMessage,
    clearChat,
    setDisappearingMessages,
    fetchContactProfile,
    muteChat,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: GROUPS — Group creation, member management, settings
// ═══════════════════════════════════════════════════════════════════════════

/** Provides group lifecycle operations: create, list, fetch group info, manage participants (add/remove/promote/demote), update subject/description/picture, toggle ephemeral mode, and manage invite codes. */
function useEvolutionGroups(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
  const createGroup = useCallback(
    (instanceName: string, subject: string, description: string, participants: string[]) =>
      withToast(
        'create-group',
        { instanceName, subject, description, participants },
        'Grupo criado',
        'Erro ao criar grupo'
      ),
    [withToast]
  );

  const listGroups = useCallback(
    (instanceName: string) => callApi('list-groups', { instanceName }, 'GET'),
    [callApi]
  );

  const getGroupInfo = useCallback(
    (instanceName: string, groupJid: string) =>
      callApi('group-info', { instanceName, groupJid }, 'GET'),
    [callApi]
  );

  const getGroupParticipants = useCallback(
    (instanceName: string, groupJid: string) =>
      callApi('group-participants', { instanceName, groupJid }, 'GET'),
    [callApi]
  );

  const updateGroupName = useCallback(
    (instanceName: string, groupJid: string, subject: string) =>
      withToast(
        'update-group-name',
        { instanceName, groupJid, subject },
        'Nome do grupo atualizado',
        'Erro ao atualizar nome'
      ),
    [withToast]
  );

  const updateGroupDescription = useCallback(
    (instanceName: string, groupJid: string, description: string) =>
      withToast(
        'update-group-description',
        { instanceName, groupJid, description },
        'Descrição atualizada',
        'Erro ao atualizar descrição'
      ),
    [withToast]
  );

  const updateGroupParticipants = useCallback(
    (
      instanceName: string,
      groupJid: string,
      action: 'add' | 'remove' | 'promote' | 'demote',
      participants: string[]
    ) =>
      withToast(
        'update-participants',
        { instanceName, groupJid, action, participants },
        'Participantes atualizados',
        'Erro ao atualizar participantes'
      ),
    [withToast]
  );

  const updateGroupSetting = useCallback(
    (
      instanceName: string,
      groupJid: string,
      action: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'
    ) =>
      withToast(
        'update-group-setting',
        { instanceName, groupJid, action },
        'Configuração atualizada',
        'Erro ao atualizar configuração'
      ),
    [withToast]
  );

  const getGroupInviteCode = useCallback(
    (instanceName: string, groupJid: string) =>
      callApi('group-invite-code', { instanceName, groupJid }, 'GET'),
    [callApi]
  );

  const revokeGroupInviteCode = useCallback(
    (instanceName: string, groupJid: string) =>
      withToast(
        'revoke-invite-code',
        { instanceName, groupJid },
        'Link revogado',
        'Erro ao revogar link'
      ),
    [withToast]
  );

  const getInviteInfo = useCallback(
    (instanceName: string, inviteCode: string) =>
      callApi('invite-info', { instanceName, inviteCode }, 'GET'),
    [callApi]
  );

  const acceptInvite = useCallback(
    (instanceName: string, inviteCode: string) =>
      withToast(
        'accept-invite',
        { instanceName, inviteCode },
        'Entrou no grupo',
        'Erro ao entrar no grupo'
      ),
    [withToast]
  );

  const leaveGroup = useCallback(
    (instanceName: string, groupJid: string) =>
      withToast(
        'leave-group',
        { instanceName, groupJid },
        'Saiu do grupo',
        'Erro ao sair do grupo',
        'DELETE'
      ),
    [withToast]
  );

  const updateGroupPicture = useCallback(
    (instanceName: string, groupJid: string, image: string) =>
      withToast(
        'update-group-picture',
        { instanceName, groupJid, image },
        'Foto atualizada',
        'Erro ao atualizar foto'
      ),
    [withToast]
  );

  const toggleEphemeral = useCallback(
    (instanceName: string, groupJid: string, expiration: number) =>
      callApi('toggle-ephemeral', { instanceName, groupJid, expiration }),
    [callApi]
  );

  return {
    createGroup,
    listGroups,
    getGroupInfo,
    getGroupParticipants,
    updateGroupName,
    updateGroupDescription,
    updateGroupParticipants,
    updateGroupSetting,
    getGroupInviteCode,
    revokeGroupInviteCode,
    getInviteInfo,
    acceptInvite,
    leaveGroup,
    updateGroupPicture,
    toggleEphemeral,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: PROFILE — Fetch/update profile, privacy, labels
// ═══════════════════════════════════════════════════════════════════════════

/** Provides profile management: fetch local and remote profiles, update name/status/picture, remove profile picture, fetch business profile, update privacy settings, and manage WhatsApp labels. */
function useEvolutionProfile(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
  const fetchProfile = useCallback(
    (instanceName: string, remoteJid?: string) =>
      withV237Fallback(
        () =>
          callApi(
            'fetch-profile',
            { instanceName, ...(remoteJid ? { number: remoteJid } : {}) },
            'GET'
          ),
        () => fallbackFetchProfile(remoteJid ?? '', instanceName),
        'fetchProfile'
      ),
    [callApi]
  );

  const updateProfileName = useCallback(
    (instanceName: string, name: string) =>
      withToast(
        'update-profile-name',
        { instanceName, name },
        'Nome atualizado',
        'Erro ao atualizar nome'
      ),
    [withToast]
  );

  const updateProfileStatus = useCallback(
    (instanceName: string, status: string) =>
      withToast(
        'update-profile-status',
        { instanceName, status },
        'Status atualizado',
        'Erro ao atualizar status'
      ),
    [withToast]
  );

  const updateProfilePicture = useCallback(
    (instanceName: string, picture: string) =>
      withToast(
        'update-profile-picture',
        { instanceName, picture },
        'Foto atualizada',
        'Erro ao atualizar foto'
      ),
    [withToast]
  );

  const removeProfilePicture = useCallback(
    (instanceName: string) =>
      withToast(
        'remove-profile-picture',
        { instanceName },
        'Foto removida',
        'Erro ao remover foto',
        'DELETE'
      ),
    [withToast]
  );

  const fetchProfilePicture = useCallback(
    (instanceName: string, number: string) =>
      callApi('fetch-profile-picture', { instanceName, number }, 'GET'),
    [callApi]
  );

  const fetchBusinessProfile = useCallback(
    (instanceName: string, number: string) =>
      callApi('fetch-business-profile', { instanceName, number }),
    [callApi]
  );

  const updatePrivacySettings = useCallback(
    (settings: PrivacySettings) =>
      withToast(
        'update-privacy',
        settings,
        'Privacidade atualizada',
        'Erro ao atualizar privacidade'
      ),
    [withToast]
  );

  const findLabels = useCallback(
    (instanceName: string) => callApi('find-labels', { instanceName }, 'GET'),
    [callApi]
  );

  const handleLabel = useCallback(
    (instanceName: string, number: string, labelId: string, action: 'add' | 'remove') =>
      callApi('handle-label', { instanceName, number, labelId, action }),
    [callApi]
  );

  return {
    fetchProfile,
    updateProfileName,
    updateProfileStatus,
    updateProfilePicture,
    removeProfilePicture,
    fetchProfilePicture,
    fetchBusinessProfile,
    updatePrivacySettings,
    findLabels,
    handleLabel,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: CHATS — Find chats/messages/contacts, media retrieval
// ═══════════════════════════════════════════════════════════════════════════

/** Provides read-only access to conversation data: list chats (with v237 fallback), find messages, fetch status messages, search contacts (with v237 fallback), bulk-check WhatsApp numbers, and download media as Base64. */
function useEvolutionChats(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>
) {
  const findChats = useCallback(
    (instanceName: string, page?: number, offset?: number) =>
      withV237Fallback(
        () => callApi('find-chats', { instanceName, page, offset }, 'GET'),
        () => fallbackFindChats(instanceName, offset ?? 200),
        'findChats'
      ),
    [callApi]
  );

  const findMessages = useCallback(
    (
      instanceName: string,
      remoteJid: string,
      page?: number,
      offset?: number,
      timestampStart?: number,
      timestampEnd?: number
    ) =>
      callApi(
        'find-messages',
        { instanceName, remoteJid, page, offset, timestampStart, timestampEnd },
        'GET'
      ),
    [callApi]
  );

  const findStatusMessages = useCallback(
    (instanceName: string) => callApi('find-status-messages', { instanceName }, 'GET'),
    [callApi]
  );

  const findContacts = useCallback(
    (instanceName: string, page?: number, offset?: number) =>
      withV237Fallback(
        () => callApi('find-contacts', { instanceName, page, offset }, 'GET'),
        () => fallbackFindContacts(instanceName, offset ?? 500),
        'findContacts'
      ),
    [callApi]
  );

  const checkWhatsAppNumbers = useCallback(
    (instanceName: string, numbers: string[]) =>
      callApi('check-numbers', { instanceName, numbers }),
    [callApi]
  );

  const getMediaBase64 = useCallback(
    (instanceName: string, message: object, convertToMp4?: boolean) =>
      callApi('get-media-base64', { instanceName, message, convertToMp4 }),
    [callApi]
  );

  return {
    findChats,
    findMessages,
    findStatusMessages,
    findContacts,
    checkWhatsAppNumbers,
    getMediaBase64,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: BOTS — Bot integrations (Chatwoot, Typebot, OpenAI, etc)
// ═══════════════════════════════════════════════════════════════════════════

/** Provides CRUD and session management for all bot integrations: Chatwoot, Typebot (including session start), OpenAI, Dify, Flowise, and EvolutionBot — each with configure, retrieve, and delete operations. */
function useEvolutionBots(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
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

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: AI AGENTS — AI agent settings (EvoAI, N8N)
// ═══════════════════════════════════════════════════════════════════════════

/** Provides configure/retrieve/delete operations for AI agent integrations: EvoAI (custom AI agent endpoint) and N8N (workflow automation), each with a set/get/delete triple. */
function useEvolutionAiAgents(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
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

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: STREAMING — Event streaming backends (RabbitMQ, SQS, etc)
// ═══════════════════════════════════════════════════════════════════════════

/** Provides set/get operations for all event-streaming backends: RabbitMQ, SQS, Kafka, NATS, and Pusher — each enabling event routing from WhatsApp to external message queues. */
function useEvolutionStreaming(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>
) {
  const setRabbitMQ = useCallback(
    (instanceName: string, enabled: boolean, events?: string[]) =>
      callApi('set-rabbitmq', { instanceName, enabled, events }),
    [callApi]
  );
  const getRabbitMQ = useCallback(
    (instanceName: string) => callApi('get-rabbitmq', { instanceName }, 'GET'),
    [callApi]
  );

  const setSQS = useCallback(
    (instanceName: string, enabled: boolean, events?: string[]) =>
      callApi('set-sqs', { instanceName, enabled, events }),
    [callApi]
  );
  const getSQS = useCallback(
    (instanceName: string) => callApi('get-sqs', { instanceName }, 'GET'),
    [callApi]
  );

  const setKafka = useCallback(
    (instanceName: string, enabled: boolean, events?: string[]) =>
      callApi('set-kafka', { instanceName, enabled, events }),
    [callApi]
  );
  const getKafka = useCallback(
    (instanceName: string) => callApi('get-kafka', { instanceName }, 'GET'),
    [callApi]
  );

  const setNats = useCallback(
    (instanceName: string, enabled: boolean, events?: string[]) =>
      callApi('set-nats', { instanceName, enabled, events }),
    [callApi]
  );
  const getNats = useCallback(
    (instanceName: string) => callApi('get-nats', { instanceName }, 'GET'),
    [callApi]
  );

  const setPusher = useCallback(
    (
      instanceName: string,
      config: {
        enabled?: boolean;
        appId: string;
        key: string;
        secret: string;
        cluster: string;
        events?: string[];
      }
    ) => callApi('set-pusher', { instanceName, ...config }),
    [callApi]
  );
  const getPusher = useCallback(
    (instanceName: string) => callApi('get-pusher', { instanceName }, 'GET'),
    [callApi]
  );

  return {
    setRabbitMQ,
    getRabbitMQ,
    setSQS,
    getSQS,
    setKafka,
    getKafka,
    setNats,
    getNats,
    setPusher,
    getPusher,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: MISCELLANEOUS — Templates, blocking, catalog, proxy
// ═══════════════════════════════════════════════════════════════════════════

/** Provides miscellaneous Evolution API operations: WhatsApp message templates (create/list/delete), contact blocking/unblocking, business catalog retrieval, and HTTP proxy configuration. */
function useEvolutionMisc(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<unknown>,
  withToast: (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method?: HttpMethod
  ) => Promise<unknown>
) {
  const createTemplate = useCallback(
    (instanceName: string, templateData: object) =>
      withToast(
        'create-template',
        { instanceName, ...templateData },
        'Template criado',
        'Erro ao criar template'
      ),
    [withToast]
  );
  const findTemplates = useCallback(
    (instanceName: string) => callApi('find-templates', { instanceName }, 'GET'),
    [callApi]
  );
  const deleteTemplate = useCallback(
    (instanceName: string, templateData: object) =>
      withToast(
        'delete-template',
        { instanceName, ...templateData },
        'Template excluído',
        'Erro ao excluir template',
        'DELETE'
      ),
    [withToast]
  );

  const updateBlockStatus = useCallback(
    (instanceName: string, number: string, status: 'block' | 'unblock') =>
      withToast(
        'update-block-status',
        { instanceName, number, status },
        status === 'block' ? 'Contato bloqueado' : 'Contato desbloqueado',
        'Erro ao atualizar bloqueio'
      ),
    [withToast]
  );

  const offerCall = useCallback(
    (instanceName: string, number: string, isVideo?: boolean, callDuration?: number) =>
      callApi('offer-call', { instanceName, number, isVideo, callDuration }),
    [callApi]
  );

  const getBusinessCatalog = useCallback(
    (instanceName: string, number: string, limit?: number, cursor?: string) =>
      callApi('get-catalog', { instanceName, number, limit, cursor }),
    [callApi]
  );
  const getBusinessCollections = useCallback(
    (instanceName: string, number: string, limit?: number, cursor?: string) =>
      callApi('get-collections', { instanceName, number, limit, cursor }),
    [callApi]
  );

  const setProxy = useCallback(
    (
      instanceName: string,
      config: {
        enabled?: boolean;
        host: string;
        port: number;
        protocol: string;
        username?: string;
        password?: string;
      }
    ) =>
      withToast(
        'set-proxy',
        { instanceName, ...config },
        'Proxy configurado',
        'Erro ao configurar proxy'
      ),
    [withToast]
  );
  const getProxy = useCallback(
    (instanceName: string) => callApi('get-proxy', { instanceName }, 'GET'),
    [callApi]
  );

  return {
    createTemplate,
    findTemplates,
    deleteTemplate,
    updateBlockStatus,
    offerCall,
    getBusinessCatalog,
    getBusinessCollections,
    setProxy,
    getProxy,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11: ORCHESTRATION — Main hook combining all domains
// ═══════════════════════════════════════════════════════════════════════════

/** Orchestrates all Evolution API domains (instances, messaging, groups, profiles, chats, bots, AI agents, streaming, misc) into a unified interface. */
export function useEvolutionApiManagement() {
  const { isLoading, callApi, withToast } = useEvolutionApiCore();
  const instance = useEvolutionInstance(callApi, withToast);
  const messaging = useEvolutionMessaging(callApi, withToast);
  const groups = useEvolutionGroups(callApi, withToast);
  const profile = useEvolutionProfile(callApi, withToast);
  const chats = useEvolutionChats(callApi);
  const bots = useEvolutionBots(callApi, withToast);
  const aiAgents = useEvolutionAiAgents(callApi, withToast);
  const streaming = useEvolutionStreaming(callApi);
  const misc = useEvolutionMisc(callApi, withToast);

  return {
    isLoading,
    ...instance,
    ...messaging,
    ...groups,
    ...profile,
    ...chats,
    ...bots,
    ...aiAgents,
    ...streaming,
    ...misc,
  };
}
