import type { FileValidationResult } from '@/utils/whatsappFileTypes';

/** File Message Data component. */
export interface FileMessageData {
  mediaUrl?: string;
  messageType?: string;
  [key: string]: unknown;
}

/** File Preview component. */
export interface FilePreview {
  file: File;
  validation: FileValidationResult;
  preview?: string;
}

/** Queued File component. */
export interface QueuedFile extends FilePreview {
  id: string;
  status: 'pending' | 'uploading' | 'sending' | 'done' | 'error';
  progress: number;
  error?: string;
}

/** category Order component. */
export const categoryOrder: Record<string, number> = {
  image: 0,
  video: 1,
  audio: 2,
  document: 3,
  sticker: 4,
};

/** MAX_FILES component. */
export const MAX_FILES = 10;
