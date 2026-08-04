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
  code: number;
  message: string;
  status: string;
}

export interface EmailApiResponse<T> {
  data: T | null;
  error: EmailApiError | null;
}

// ── Funções de API (via Edge Functions) ─────────────────────────────────────

/**
 * Busca o conteúdo completo de uma mensagem (body_html + body_plain).
 *
 * gmail-sync@v1 NÃO possui action fetchMessageBody (enum fechado:
 * listThreads/syncFull/syncLabels — qualquer outra action → 400). O corpo
 * completo já é persistido por syncFull na tabela gmail_messages, então a
 * leitura é direto no banco (mesma fonte que gmail-sync grava).
 */
export async function fetchMessageBody(
  accountId: string,
  emailMessageId: string
): Promise<
  EmailApiResponse<{ bodyHtml: string; bodyText: string; attachments: EmailAttachment[] }>
> {
  try {
    const { data, error } = await supabase
      .from('gmail_messages')
      .select('body_html, body_plain')
      .eq('message_id', emailMessageId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (error)
      return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
    if (!data)
      return {
        data: null,
        error: { code: 404, message: 'Mensagem não encontrada', status: 'NOT_FOUND' },
      };

    const row = data as unknown as { body_html?: string | null; body_plain?: string | null };
    return {
      data: {
        bodyHtml: row.body_html ?? '',
        bodyText: row.body_plain ?? '',
        // gmail-sync não persiste o payload dos anexos (apenas has_attachments).
        attachments: [],
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: {
        code: 500,
        message: err instanceof Error ? err.message : String(err),
        status: 'INTERNAL',
      },
    };
  }
}

/**
 * Baixa um anexo Email.
 *
 * TODO(EMAIL-04): gmail-sync não persiste o payload dos anexos (só o flag
 * has_attachments), e não existe action downloadAttachment na edge (400).
 * Para baixar de verdade seria preciso adicionar a action na edge chamando
 * GET /gmail/v1/users/me/messages/{id}/attachments/{attachmentId} — fora do
 * escopo desta rodada. Retorna erro estruturado em vez de 400 silencioso.
 */
export async function downloadAttachment(
  accountId: string,
  messageId: string,
  attachmentId: string
): Promise<EmailApiResponse<{ data: string; mimeType: string; size: number }>> {
  void accountId;
  void messageId;
  void attachmentId;
  return {
    data: null,
    error: {
      code: 501,
      message:
        'Download de anexos não suportado: gmail-sync não persiste payload de anexos (TODO EMAIL-04)',
      status: 'NOT_IMPLEMENTED',
    },
  };
}

/**
 * Cria uma label no Email
 */
export async function createEmailLabel(
  accountId: string,
  name: string,
  color?: { backgroundColor: string; textColor: string }
): Promise<EmailApiResponse<{ labelId: string; name: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'createLabel', accountId, name, color },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Move thread para a lixeira
 */
export async function moveThreadToTrash(
  accountId: string,
  emailThreadId: string
): Promise<EmailApiResponse<{ success: boolean }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'moveToTrash', accountId, threadId: emailThreadId },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Aplica/remove labels em uma thread
 */
export async function modifyThreadLabels(
  accountId: string,
  emailThreadId: string,
  addLabels: string[],
  removeLabels: string[]
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

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Atualiza o Pub/Sub watch de uma conta Email.
 * Contrato gmail-webhook@v1: action é 'registerWatch' (não existe 'renewWatch')
 * e a resposta é { ok, historyId, expiresAt }.
 */
export async function renewEmailWatch(
  accountId: string
): Promise<EmailApiResponse<{ expiresAt: string; historyId: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-webhook', {
    body: { action: 'registerWatch', accountId },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  const raw = (data ?? {}) as { expiresAt?: string | null; historyId?: string | null };
  return {
    data: { expiresAt: raw.expiresAt ?? '', historyId: raw.historyId ?? '' },
    error: null,
  };
}

/**
 * Lista labels do Email via API
 */
export async function listEmailLabels(
  accountId: string
): Promise<
  EmailApiResponse<Array<{ id: string; name: string; type: 'system' | 'user'; color?: unknown }>>
> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'listLabels', accountId },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Cria um rascunho no Email
 */
export async function createDraft(
  accountId: string,
  params: {
    to: string[];
    cc?: string[];
    subject: string;
    bodyHtml: string;
    threadId?: string;
  }
): Promise<EmailApiResponse<{ draftId: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'createDraft', accountId, ...params },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Atualiza um rascunho existente
 */
export async function updateDraft(
  accountId: string,
  draftId: string,
  params: {
    to?: string[];
    cc?: string[];
    subject?: string;
    bodyHtml?: string;
  }
): Promise<EmailApiResponse<{ success: boolean }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'updateDraft', accountId, draftId, ...params },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Envia um rascunho existente
 */
export async function sendDraft(
  accountId: string,
  draftId: string
): Promise<EmailApiResponse<{ messageId: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'sendDraft', accountId, draftId },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Renova o access_token Email via refresh_token armazenado.
 * Edge function: gmail-token-refresh action=refreshSingle (aceita JWT de usuário;
 * sem action o default é refreshAll, restrito a service-role/cron → 401).
 */
export async function emailRefreshToken(
  accountId: string
): Promise<EmailApiResponse<{ success: boolean; newExpiry: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-token-refresh', {
    body: { action: 'refreshSingle', accountId },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Revoga a conta Email (tokens + watch) e remove credenciais armazenadas.
 */
export async function emailRevokeAccount(
  accountId: string
): Promise<EmailApiResponse<{ success: boolean }>> {
  const { data, error } = await supabase.functions.invoke('gmail-oauth', {
    body: { action: 'revoke', accountId },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/**
 * Registra/renova o Pub/Sub watch da conta Email.
 * Alias semântico de renewEmailWatch para clareza no fluxo de OAuth.
 */
export async function emailRegisterWatch(
  accountId: string
): Promise<EmailApiResponse<{ expiresAt: string; historyId: string }>> {
  return renewEmailWatch(accountId);
}

// ── Tipos de Anexo ───────────────────────────────────────────────────

export interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

// ── Helper: verificar se error é de autenticação ────────────────────────

export function isAuthError(error: EmailApiError | null): boolean {
  if (!error) return false;
  return error.code === 401 || error.status === 'UNAUTHENTICATED';
}

// ── Helper: construir MIME message para Email API ──────────────────────────

export function buildMimeMessage(params: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
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
  accountId: string;
  messageIds: string[];
  read: boolean;
}

/**
 * Marca mensagens como lidas/não-lidas no Email.
 * Edge function: email-send action=markRead
 */
export async function emailMarkRead(params: MarkReadParams): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'markRead', ...params },
  });
  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

interface ModifyLabelsParams {
  accountId: string;
  messageId?: string;
  threadId?: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

/**
 * Adiciona/remove labels em mensagem ou thread.
 * Edge function: email-send action=modifyLabels
 */
export async function emailModifyLabels(
  params: ModifyLabelsParams
): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'modifyLabels', ...params },
  });
  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

interface SendMessageParams {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyPlain?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{
    name: string;
    mimeType: string;
    data: string; // base64
  }>;
}

/**
 * Envia uma mensagem nova ou reply.
 * Edge function: email-send action=send
 */
export async function emailSendMessage(
  params: SendMessageParams
): Promise<EmailApiResponse<{ id: string; threadId: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'send', ...params },
  });
  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

interface TrashMessageParams {
  accountId: string;
  messageId: string;
}

/**
 * Move uma mensagem específica para a lixeira.
 * Edge function: gmail-send action=trash (NÃO 'trashMessage' — enum fechado).
 */
export async function emailTrashMessage(
  params: TrashMessageParams
): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'trash', ...params },
  });
  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

interface SaveDraftParams {
  accountId: string;
  draftId?: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  threadId?: string;
}

/**
 * Cria ou atualiza rascunho. Se draftId existe, atualiza; senão, cria.
 * Wrapper sobre createDraft/updateDraft para manter compatibilidade com
 * call-sites em useEmailDraft.ts que esperam interface unificada.
 */
export async function emailSaveDraft(
  params: SaveDraftParams
): Promise<EmailApiResponse<{ draftId: string }>> {
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
export async function emailDeleteDraft(
  accountId: string,
  draftId: string
): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'deleteDraft', accountId, draftId },
  });
  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

interface ListThreadsParams {
  accountId: string;
  q?: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
}

/**
 * Lista threads do Email com filtros opcionais.
 * Edge function: email-sync action=listThreads
 */
export async function emailListThreads(
  params: ListThreadsParams
): Promise<
  EmailApiResponse<{
    threads: Array<{ id: string; snippet: string; historyId: string }>;
    nextPageToken?: string;
  }>
> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'listThreads', ...params },
  });
  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}
