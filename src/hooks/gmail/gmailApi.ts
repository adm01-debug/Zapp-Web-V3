import { supabase } from '@/integrations/supabase/client';
import {
  type EmailApiError,
  type EmailApiResponse,
  type EmailAttachment,
  type MarkReadParams,
  type ModifyLabelsParams,
  type SendMessageParams,
  type TrashMessageParams,
  type SaveDraftParams,
  type ListThreadsParams,
} from './gmailApiTypes';

export type {
  EmailApiError,
  EmailApiResponse,
  EmailAttachment,
  MarkReadParams,
  ModifyLabelsParams,
  SendMessageParams,
  TrashMessageParams,
  SaveDraftParams,
  ListThreadsParams,
} from './gmailApiTypes';

/** Hook: fetch Message Body. */
export async function fetchMessageBody(
  accountId: string,
  emailMessageId: string
): Promise<
  EmailApiResponse<{ bodyHtml: string; bodyText: string; attachments: EmailAttachment[] }>
> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'fetchMessageBody', accountId, messageId: emailMessageId },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/** Hook: download Attachment. */
export async function downloadAttachment(
  accountId: string,
  messageId: string,
  attachmentId: string
): Promise<EmailApiResponse<{ data: string; mimeType: string; size: number }>> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'downloadAttachment', accountId, messageId, attachmentId },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/** Hook: create Email Label. */
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

/** Hook: move Thread To Trash. */
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

/** Hook: modify Thread Labels. */
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

/** Hook: renew Email Watch. */
export async function renewEmailWatch(
  accountId: string
): Promise<EmailApiResponse<{ watchExpiry: string; historyId: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-webhook', {
    body: { action: 'renewWatch', accountId },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/** Hook: list Email Labels. */
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

/** Hook: create Draft. */
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

/** Hook: update Draft. */
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

/** Hook: send Draft. */
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

/** Hook: email Refresh Token. */
export async function emailRefreshToken(
  accountId: string
): Promise<EmailApiResponse<{ accessToken: string; expiresAt: string }>> {
  const { data, error } = await supabase.functions.invoke('gmail-token-refresh', {
    body: { accountId },
  });

  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data, error: null };
}

/** Hook: email Revoke Account. */
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

/** Hook: email Register Watch. */
export async function emailRegisterWatch(
  accountId: string
): Promise<EmailApiResponse<{ watchExpiry: string; historyId: string }>> {
  return renewEmailWatch(accountId);
}

/** Hook: is Auth Error. */
export function isAuthError(error: EmailApiError | null): boolean {
  if (!error) return false;
  return error.code === 401 || error.status === 'UNAUTHENTICATED';
}

/** Hook: build Mime Message. */
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

/** Hook: email Mark Read. */
export async function emailMarkRead(params: MarkReadParams): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'markRead', ...params },
  });
  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

/** Hook: email Modify Labels. */
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

/** Hook: email Send Message. */
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

/** Hook: email Trash Message. */
export async function emailTrashMessage(
  params: TrashMessageParams
): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'trashMessage', ...params },
  });
  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

/** Hook: email Save Draft. */
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

/** Hook: email Delete Draft. */
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

/** Hook: email List Threads. */
export async function emailListThreads(params: ListThreadsParams): Promise<
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
