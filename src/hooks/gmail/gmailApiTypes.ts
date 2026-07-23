/** Hook: Email Api Error. */
export interface EmailApiError {
  code: number;
  message: string;
  status: string;
}

/** Hook: Email Api Response. */
export interface EmailApiResponse<T> {
  data: T | null;
  error: EmailApiError | null;
}

/** Hook: Email Attachment. */
export interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** Hook: Mark Read Params. */
export interface MarkReadParams {
  accountId: string;
  messageIds: string[];
  read: boolean;
}

/** Hook: Modify Labels Params. */
export interface ModifyLabelsParams {
  accountId: string;
  messageId?: string;
  threadId?: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

/** Hook: Send Message Params. */
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

/** Hook: Trash Message Params. */
export interface TrashMessageParams {
  accountId: string;
  messageId: string;
}

/** Hook: Save Draft Params. */
export interface SaveDraftParams {
  accountId: string;
  draftId?: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  threadId?: string;
}

/** Hook: List Threads Params. */
export interface ListThreadsParams {
  accountId: string;
  q?: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
}
