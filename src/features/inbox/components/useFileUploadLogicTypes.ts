import type { FileValidationResult } from '@/utils/whatsappFileTypes';

export interface FileMessageData {
  mediaUrl?: string;
  messageType?: string;
  [key: string]: unknown;
}

export interface FilePreview {
  file: File;
  validation: FileValidationResult;
  preview?: string;
}

export interface QueuedFile extends FilePreview {
  id: string;
  status: 'pending' | 'uploading' | 'sending' | 'done' | 'error';
  progress: number;
  error?: string;
}

export const categoryOrder: Record<string, number> = {
  image: 0,
  video: 1,
  audio: 2,
  document: 3,
  sticker: 4,
};

export const MAX_FILES = 10;
