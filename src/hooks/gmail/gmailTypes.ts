/**
 * emailTypes.ts — Tipos TypeScript completos para o módulo Email
 *
 * Zero uso de `as any`.
 * Alinhado com o schema do banco (email_accounts, email_threads, email_messages, etc.)
 */

// ── Conta Email ────────────────────────────────────────────────────────────

export interface EmailAccount {
  id:           string;
  user_id:      string;
  email:        string;
  display_name: string | null;
  is_active:    boolean;
  token_expiry: string | null;
  watch_expiry: string | null;
  created_at?:  string;
  updated_at?:  string;
  /** @deprecated Foto de perfil legada. */
  picture_url?: string | null;
}

export type EmailTokenStatus  = 'valid' | 'expiring_soon' | 'expired' | 'no_token';
export type EmailWatchStatus  = 'active' | 'expiring_soon' | 'expired' | 'no_watch';
export type EmailSLAStatus    = 'ok' | 'warning' | 'breached' | 'met' | null;

export interface EmailTokenInfo {
  account_id:           string;
  email:                string;
  is_active:            boolean;
  token_status:         EmailTokenStatus;
  token_expiry:         string | null;
  watch_status:         EmailWatchStatus;
  watch_expiry:         string | null;
  minutes_until_expiry: number | null;
}

// ── Thread ─────────────────────────────────────────────────────────────────

/** Email Thread interface definition. */
export interface EmailThread {
  id:               string;
  account_id:       string;
  email_thread_id:  string;
  /** @deprecated Alias legado para `email_thread_id`. */
  thread_id?:       string;
  subject:          string | null;
  snippet:          string | null;
  from_email:       string | null;
  from_name:        string | null;
  label_ids:        string[];
  unread_count:     number;
  message_count:    number;
  is_starred:       boolean;
  is_important:     boolean;
  sla_status:       EmailSLAStatus;
  assigned_to:      string | null;
  last_message_at:  string | null;
  first_reply_at:   string | null;
  created_at:       string;
  updated_at?:      string;
  /** @deprecated Lista de e-mails dos participantes (legado). */
  participant_emails?: string[];
  /** @deprecated Flag legada. */
  is_unread?:       boolean;
  /** @deprecated Contato vinculado (legado). */
  contact?:         { id?: string; name?: string | null; phone?: string | null } | null;
}

export interface EmailThreadFilters {
  accountId?:   string;
  label?:       EmailLabelId;
  query?:       string;
  isUnread?:    boolean;
  isStarred?:   boolean;
  slaStatus?:   EmailSLAStatus;
  assignedTo?:  string | null;
  limit?:       number;
  offset?:      number;
}

// ── Mensagem ───────────────────────────────────────────────────────────────

/** Email Message interface definition. */
export interface EmailMessage {
  id:              string;
  thread_id:       string;
  email_msg_id:    string;
  /** @deprecated Alias legado para `email_msg_id`. */
  message_id?:     string;
  from_email:      string | null;
  from_name:       string | null;
  to_emails:       string[] | null;
  cc_emails:       string[] | null;
  subject:         string | null;
  snippet:         string | null;
  body_html:       string | null;
  body_text:       string | null;
  /** @deprecated Alias legado para `body_text`. */
  body_plain?:     string | null;
  is_read:         boolean;
  /** @deprecated Indica se foi enviada pela conta (legado). */
  is_sent?:        boolean;
  date:            string | null;
  /** @deprecated Timestamp interno do Email (legado). */
  internal_date?:  string | null;
  has_attachments: boolean;
  in_reply_to:     string | null;
  references:      string[] | null;
  /** @deprecated Lista de label ids (legado, use a tabela própria). */
  label_ids?:      string[];
  created_at:      string;
}

// ── Anexo ─────────────────────────────────────────────────────────────────

export interface EmailAttachment {
  id:             string;
  message_id:     string;
  email_att_id:   string;
  filename:       string;
  mime_type:      string;
  size:           number;
  /** @deprecated Alias legado para `size`. */
  size_bytes?:    number;
  storage_url:    string | null;
  created_at:     string;
}

// ── Rascunho ──────────────────────────────────────────────────────────────

export interface EmailDraft {
  id:          string;
  account_id:  string;
  email_draft_id: string | null;
  to_emails:   string[];
  cc_emails:   string[];
  subject:     string | null;
  body_html:   string | null;
  thread_id:   string | null;
  auto_saved:  boolean;
  created_at:  string;
  updated_at:  string;
}

// ── Label ─────────────────────────────────────────────────────────────────

/** Email Label Id type alias. */
export type EmailLabelId = 'INBOX' | 'SENT' | 'DRAFTS' | 'STARRED' | 'IMPORTANT' | 'TRASH' | 'SPAM' | string;

/** Email Label interface definition. */
export interface EmailLabel {
  id:             string;
  account_id:     string;
  email_label_id: EmailLabelId;
  name:           string;
  type:           'system' | 'user';
  color:          string | null;
  thread_count?:  number;
  unread_count?:  number;
  created_at:     string;
}

// ── Assinatura ────────────────────────────────────────────────────────────

/** Email Signature interface definition. */
export interface EmailSignature {
  id:           string;
  account_id:   string;
  name:         string;
  html_content: string;
  is_default:   boolean;
  created_at:   string;
  updated_at:   string;
}

// ── Envio ─────────────────────────────────────────────────────────────────

/** Email Send Params interface definition. */
export interface EmailSendParams {
  to:          string | string[];
  cc?:         string | string[];
  bcc?:        string | string[];
  subject:     string;
  bodyHtml:    string;
  threadId?:   string;
  inReplyTo?:  string;
  references?: string[];
  attachments?: EmailSendAttachment[];
  signature?:  boolean;
}

/** Email Send Attachment interface definition. */
export interface EmailSendAttachment {
  name:        string;
  /** @deprecated Alias legado para `name`. */
  filename?:   string;
  mimeType:    string;
  base64Data?: string;
  /** @deprecated Alias legado para `base64Data`. */
  data?:       string;
  size?:       number;
}

export interface EmailSendResult {
  success:    boolean;
  messageId?: string;
  threadId?:  string;
  error?:     string;
}

// ── Métricas diárias ─────────────────────────────────────────────────────

/** Email Daily Metrics interface definition. */
export interface EmailDailyMetrics {
  id:                      string;
  account_id:              string;
  date:                    string;
  threads_received:        number;
  threads_replied:         number;
  avg_first_reply_minutes: number | null;
  sla_met_count:           number;
  sla_breached_count:      number;
  created_at:              string;
  updated_at:              string;
}

// ── Pub/Sub webhook payload ───────────────────────────────────────────────

/** Email Pub Sub Message interface definition. */
export interface EmailPubSubMessage {
  emailAddress:  string;
  historyId:     string;
}

/** Email History Event interface definition. */
export interface EmailHistoryEvent {
  id:              string;
  messages?:       Array<{ id: string; threadId: string }>;
  messagesAdded?:  Array<{ message: { id: string; threadId: string; labelIds: string[] } }>;
  labelsAdded?:    Array<{ message: { id: string; threadId: string }; labelIds: string[] }>;
  labelsRemoved?:  Array<{ message: { id: string; threadId: string }; labelIds: string[] }>;
}

// ── Type guards ──────────────────────────────────────────────────────────

/** is Email Thread function. */
export function isEmailThread(obj: unknown): obj is EmailThread {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'email_thread_id' in obj &&
    'account_id' in obj
  );
}

/** is Email Message function. */
export function isEmailMessage(obj: unknown): obj is EmailMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'email_msg_id' in obj &&
    'thread_id' in obj
  );
}

/** is Email Token Expired function. */
export function isEmailTokenExpired(tokenInfo: EmailTokenInfo): boolean {
  return tokenInfo.token_status === 'expired';
}

/** is Email Watch Expired function. */
export function isEmailWatchExpired(tokenInfo: EmailTokenInfo): boolean {
  return tokenInfo.watch_status === 'expired';
}
