export interface EmailApiError {
  code: number;
  message: string;
  status: string;
}

export interface EmailApiResponse<T> {
  data: T | null;
  error: EmailApiError | null;
}

export interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface MarkReadParams {
  accountId: string;
  messageIds: string[];
  read: boolean;
}

export interface ModifyLabelsParams {
  accountId: string;
  messageId?: string;
  threadId?: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

export interface SendMessageParams {
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
    data: string;
  }>;
  signature?: boolean;
}

export interface TrashMessageParams {
  accountId: string;
  messageId: string;
}

export interface SaveDraftParams {
  accountId: string;
  draftId?: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  threadId?: string;
}

export interface ListThreadsParams {
  accountId: string;
  q?: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
}
