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

/** Fetches the body, text content, and attachments of an email message. */
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

/** Downloads an email attachment by its ID and returns base64 data with MIME type. */
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

/** Creates a new email label with optional custom color for an account. */
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

/** Moves an email thread to trash. */
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

/** Adds and removes labels from an email thread. */
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

/** Renews the Gmail watch subscription to receive push notifications for new messages. */
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

/** Lists all email labels (system and user-created) for an account. */
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

/** Creates a new email draft with recipients, subject, and HTML body content. */
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

/** Updates an existing email draft's recipients, subject, or HTML body. */
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

/** Sends a draft email and returns the resulting message ID. */
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

/** Refreshes an email account's OAuth access token. */
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

/** Revokes OAuth access for an email account. */
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

/** Registers a Gmail watch subscription to receive push notifications for an account. */
export async function emailRegisterWatch(
  accountId: string
): Promise<EmailApiResponse<{ watchExpiry: string; historyId: string }>> {
  return renewEmailWatch(accountId);
}

/** Checks if an error is an authentication error (401 or UNAUTHENTICATED). */
export function isAuthError(error: EmailApiError | null): boolean {
  if (!error) return false;
  return error.code === 401 || error.status === 'UNAUTHENTICATED';
}

/** Builds a MIME-formatted email message string with headers and HTML body. */
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

/** Marks email messages or threads as read. */
export async function emailMarkRead(params: MarkReadParams): Promise<EmailApiResponse<void>> {
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { action: 'markRead', ...params },
  });
  if (error)
    return { data: null, error: { code: 500, message: error.message, status: 'INTERNAL' } };
  return { data: data ?? null, error: null };
}

/** Adds and removes labels from email messages. */
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

/** Sends an email message and returns the message and thread IDs. */
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

/** Moves email messages to trash. */
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

/** Saves an email draft, creating or updating as needed. */
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

/** Deletes an email draft. */
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

/** Lists email threads with pagination support and thread metadata. */
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
