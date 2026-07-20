/** Default WhatsApp instance name used when no specific instance is configured on the contact. */
export const DEFAULT_INSTANCE = 'wpp2';

/**
 * SendError — Error enriquecido com o motivo bruto do upstream para que
 * o `SendErrorBanner` possa oferecer "Ver detalhes" sem perder a frase
 * humanizada exibida por padrão.
 */
export class SendError extends Error {
  detail: string | null;
  status?: number;
  constructor(reason: string, detail: string | null, status?: number) {
    super(reason);
    this.name = 'SendError';
    this.detail = detail;
    this.status = status;
  }
}

/** Optional overrides for the external message sender (instance, avatar, upload progress). */
export interface SendExternalOptions {
  instanceName?: string;
  contactAvatar?: string | null;
  onProgress?: (progress: number) => void;
}

/** Locally-generated message bubble displayed immediately while the external send is in flight; prefixed with `optimistic:` so reconciliation can replace it. */
export interface OptimisticMessage {
  id: string;
  contact_id: string;
  agent_id: string;
  content: string;
  sender: string;
  message_type: string;
  media_url: string | null;
  is_read: boolean;
  status: string;
  status_updated_at: string;
  created_at: string;
  updated_at: string;
  external_id: string | null;
  whatsapp_connection_id: null;
  transcription: null;
  transcription_status: null;
  is_deleted: boolean;
  contactAvatar: string | null;
  media_meta: unknown;
}

/** Return value of the external send path: the optimistic bubble to display and the canonical external ID returned by the Evolution API. */
export interface SendExternalResult {
  optimistic: OptimisticMessage;
  externalId: string | null;
}

/** Constructs an OptimisticMessage with a locally-unique `optimistic:…` id and the given content/type/media fields, ready to be inserted into the conversation before the API confirms. */
export function makeOptimisticBubble(
  remoteJid: string,
  content: string,
  opts: {
    messageType?: string;
    mediaUrl?: string | null;
    contactAvatar?: string | null;
    media_meta?: Record<string, unknown> | null;
  } = {}
): OptimisticMessage {
  const now = new Date().toISOString();
  // ID local começa com `optimistic:` pra reconciliação. O webhook insere
  // a mensagem real com outro id e o cursor/poll a substitui no merge.
  const id = `optimistic:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    contact_id: remoteJid,
    agent_id: 'system',
    content,
    sender: 'agent',
    message_type: opts.messageType ?? 'text',
    media_url: opts.mediaUrl ?? null,
    is_read: true,
    status: 'sending',
    status_updated_at: now,
    created_at: now,
    updated_at: now,
    external_id: null,
    whatsapp_connection_id: null,
    transcription: null,
    transcription_status: null,
    is_deleted: false,
    contactAvatar: opts.contactAvatar ?? null,
    media_meta: opts.media_meta ?? null,
  };
}
