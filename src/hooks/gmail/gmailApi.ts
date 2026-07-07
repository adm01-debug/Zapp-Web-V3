/**
 * emailApi.ts — Funções utilitárias para chamadas à Email API
 *
 * Todas as operações que precisam ir diretamente à Email API (não ao banco).
 * Estas funções são chamadas pelas Edge Functions, não diretamente pelo frontend.
 *
 * NOTA: O frontend NUNCA chama a Email API diretamente.
 * Todas as operações passam pelas Edge Functions:
 *   - email-oauth   → auth e tokens
 *   - email-sync    → sincronização de threads/mensagens
 *   - email-send    → envio de emails
 *   - email-webhook → Pub/Sub watch e eventos
 */

import { supabase } from '@/integrations/supabase/client';

// ── Tipos base ───────────────────────────────────────────────────────────

export interface EmailApiError {
  code:    number;
  message: string;
  status:  string;
}

export interface EmailApiResponse<T> {
  data:  T | null;
  error: EmailApiError | null;
}

// ── Funções de API (via Edge Functions) ─────────────────────────────────────

/**
 * Busca o conteúdo completo de uma mensagem (body_html + attachments)
 */
export async function fetchMessageBody(
  accountId: string,
  emailMessageId: string,
): Promise<EmailApiResponse<{ bodyHtml: string; bodyText: string; attachments: EmailAttachment[] }>> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'fetchMessageBody', accountId, messageId: emailMessageId },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Baixa um anexo Email
 */
export async function downloadAttachment(
  accountId: string,
  messageId: string,
  attachmentId: string,
): Promise<EmailApiResponse<{ data: string; mimeType: string; size: number }>> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'downloadAttachment', accountId, messageId, attachmentId },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Cria uma label no Email
 */
export async function createEmailLabel(
  accountId: string,
  name: string,
  color?: { backgroundColor: string; textColor: string },
): Promise<EmailApiResponse<{ labelId: string; name: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'createLabel', accountId, name, color },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Move thread para a lixeira
 */
export async function moveThreadToTrash(
  accountId: string,
  emailThreadId: string,
): Promise<EmailApiResponse<{ success: boolean }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'moveToTrash', accountId, threadId: emailThreadId },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Aplica/remove labels em uma thread
 */
export async function modifyThreadLabels(
  accountId: string,
  emailThreadId: string,
  addLabels: string[],
  removeLabels: string[],
): Promise<EmailApiResponse<{ success: boolean }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: {
      action: 'modifyLabels',
      accountId,
      threadId: emailThreadId,
      addLabelIds: addLabels,
      removeLabelIds: removeLabels,
    },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Atualiza o Pub/Sub watch de uma conta Email
 */
export async function renewEmailWatch(
  accountId: string,
): Promise<EmailApiResponse<{ watchExpiry: string; historyId: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-webhook', {
    body: { action: 'renewWatch', accountId },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Lista labels do Email via API
 */
export async function listEmailLabels(
  accountId: string,
): Promise<EmailApiResponse<Array<{ id: string; name: string; type: 'system' | 'user'; color?: unknown }>>> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'listLabels', accountId },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Cria um rascunho no Email
 */
export async function createDraft(
  accountId: string,
  params: {
    to:       string[];
    cc?:      string[];
    subject:  string;
    bodyHtml: string;
    threadId?: string;
  },
): Promise<EmailApiResponse<{ draftId: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'createDraft', accountId, ...params },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Atualiza um rascunho existente
 */
export async function updateDraft(
  accountId: string,
  draftId:   string,
  params: {
    to?:      string[];
    cc?:      string[];
    subject?: string;
    bodyHtml?: string;
  },
): Promise<EmailApiResponse<{ success: boolean }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'updateDraft', accountId, draftId, ...params },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Envia um rascunho existente
 */
export async function sendDraft(
  accountId: string,
  draftId:   string,
): Promise<EmailApiResponse<{ messageId: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'sendDraft', accountId, draftId },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Renova o access_token Email via refresh_token armazenado.
 * Edge function: email-token-refresh.
 */
export async function emailRefreshToken(
  accountId: string,
): Promise<EmailApiResponse<{ accessToken: string; expiresAt: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-token-refresh', {
    body: { accountId },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Revoga a conta Email (tokens + watch) e remove credenciais armazenadas.
 */
export async function emailRevokeAccount(
  accountId: string,
): Promise<EmailApiResponse<{ success: boolean }>> {
  const { data, error } = await supabase.functions.invoke('gmail-oauth', {
    body: { action: 'revoke', accountId },
  });

  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Registra/renova o Pub/Sub watch da conta Email.
 * Alias semântico de renewEmailWatch para clareza no fluxo de OAuth.
 */
export async function emailRegisterWatch(
  accountId: string,
): Promise<EmailApiResponse<{ watchExpiry: string; historyId: string }>> {
  return renewEmailWatch(accountId);
}

// ── Tipos de Anexo ───────────────────────────────────────────────────

export interface EmailAttachment {
  attachmentId: string;
  filename:     string;
  mimeType:     string;
  size:         number;
}

// ── Helper: verificar se error é de autenticação ────────────────────────

export function isAuthError(error: EmailApiError | null): boolean {
  if (!error) return false;
  return error.code === 401 || error.status === 'UNAUTHENTICATED';
}

// ── Helper: construir MIME message para Email API ──────────────────────────

export function buildMimeMessage(params: {
  from:    string;
  to:      string[];
  cc?:     string[];
  subject: string;
  html:    string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [
    `From: ${params.from}`,
    `To: ${params.to.join(', ')}`,
    ...(params.cc?.length ? [`Cc: ${params.cc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(params.subject)))}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ...(params.inReplyTo ? [`In-Reply-To: ${params.inReplyTo}`] : []),
    ...(params.references ? [`References: ${params.references}`] : []),
    '',
    params.html,
  ];

  return btoa(unescape(encodeURIComponent(lines.join('\r\n'))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}


// ───────────────────────────────────────────────────────────────────
// IMPLEMENTAÇÕES (antes eram stubs 501 que quebravam UI Email).
// Todas usam as Edge Functions já existentes (email-send, email-sync).
// Se uma action ainda não existe na edge function, supabase retorna erro
// estruturado — bem melhor que 501 silencioso.
// ───────────────────────────────────────────────────────────────────

interface MarkReadParams {
  accountId:  string;
  messageIds: string[];
  read:       boolean;
}

/**
 * Marca mensagens como lidas/não-lidas no Email.
 * Edge function: email-send action=markRead
 */
export async function emailMarkRead(params: MarkReadParams): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'markRead', ...params },
  });
  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

interface ModifyLabelsParams {
  accountId:        string;
  messageId?:       string;
  threadId?:        string;
  addLabelIds?:     string[];
  removeLabelIds?:  string[];
}

/**
 * Adiciona/remove labels em mensagem ou thread.
 * Edge function: email-send action=modifyLabels
 */
export async function emailModifyLabels(params: ModifyLabelsParams): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'modifyLabels', ...params },
  });
  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

interface SendMessageParams {
  accountId:   string;
  to:          string[];
  cc?:         string[];
  bcc?:        string[];
  subject:     string;
  bodyHtml:    string;
  bodyPlain?:  string;
  threadId?:   string;
  inReplyTo?:  string;
  references?: string;
  attachments?: Array<{
    name:     string;
    mimeType: string;
    data:     string; // base64
  }>;
  signature?: boolean;
}

/**
 * Envia uma mensagem nova ou reply.
 * Edge function: email-send action=send
 */
export async function emailSendMessage(params: SendMessageParams): Promise<EmailApiResponse<{ id: string; threadId: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'send', ...params },
  });
  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

interface TrashMessageParams {
  accountId: string;
  messageId: string;
}

/**
 * Move uma mensagem específica para a lixeira.
 * Edge function: email-send action=trashMessage
 */
export async function emailTrashMessage(params: TrashMessageParams): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'trashMessage', ...params },
  });
  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

interface SaveDraftParams {
  accountId:  string;
  draftId?:   string;
  to:         string[];
  cc?:        string[];
  subject:    string;
  bodyHtml:   string;
  threadId?:  string;
}

/**
 * Cria ou atualiza rascunho. Se draftId existe, atualiza; senão, cria.
 * Wrapper sobre createDraft/updateDraft para manter compatibilidade com
 * call-sites em useEmailDraft.ts que esperam interface unificada.
 */
export async function emailSaveDraft(params: SaveDraftParams): Promise<EmailApiResponse<{ draftId: string }>> {
  if (params.draftId) {
    const { accountId, draftId, ...rest } = params;
    const result = await updateDraft(accountId, draftId, rest);
    if (result.error) return { data: null, error: result.error };
    return { data: { draftId }, error: null };
  } else {
    const { accountId, ...rest } = params;
    return createDraft(accountId, rest);
  }
}

/**
 * Remove um rascunho do Email.
 * Edge function: email-send action=deleteDraft
 */
export async function emailDeleteDraft(accountId: string, draftId: string): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'deleteDraft', accountId, draftId },
  });
  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

interface ListThreadsParams {
  accountId:   string;
  q?:          string;
  maxResults?: number;
  pageToken?:  string;
  labelIds?:   string[];
}

/**
 * Lista threads do Email com filtros opcionais.
 * Edge function: email-sync action=listThreads
 */
export async function emailListThreads(params: ListThreadsParams): Promise<EmailApiResponse<{ threads: Array<{ id: string; snippet: string; historyId: string }>; nextPageToken?: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'listThreads', ...params },
  });
  if (error) return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}
