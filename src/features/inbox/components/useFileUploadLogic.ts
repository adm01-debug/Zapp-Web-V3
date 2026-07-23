import { useState, useRef, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('useFileUploadLogic');
import { supabase } from '@/integrations/supabase/client';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { toast } from 'sonner';
import { validateFile } from '@/utils/whatsappFileTypes';
import { compressImage, formatCompressionInfo } from '@/utils/imageCompression';
import { extractEvolutionMessageId } from '@/lib/evolutionMessageId';
import { parseScanInvocation, ScanBlockedError } from '@/lib/scanResponse';
import { useScanResponseHandler } from '@/hooks/useScanResponseHandler';
import { dbFrom } from '@/integrations/datasource/db';
import {
  type FileMessageData,
  type FilePreview,
  type QueuedFile,
  categoryOrder,
  MAX_FILES,
} from './useFileUploadLogicTypes';
/** Re-exported module members. */
export type { FileMessageData, FilePreview, QueuedFile } from './useFileUploadLogicTypes';

function buildFileMessageData(
  result: unknown,
  mediaUrl: string,
  messageType?: string
): FileMessageData {
  return {
    ...(typeof result === 'object' && result !== null ? result : {}),
    mediaUrl,
    messageType,
  };
}

/** use File Upload Logic component. */
export function useFileUploadLogic(opts: {
  instanceName?: string;
  recipientNumber?: string;
  contactId?: string;
  connectionId?: string;
  onFileSelect?: (file: File, category: string) => void;
  onFileSent?: (messageData: FileMessageData) => void;
  showDialog?: boolean;
}) {
  const {
    instanceName,
    recipientNumber,
    contactId,
    connectionId,
    onFileSelect,
    onFileSent,
    showDialog = true,
  } = opts;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const [isMultiMode, setIsMultiMode] = useState(false);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, _setUploadProgress] = useState(0);
  const [uploadStage, _setUploadStage] = useState<'uploading' | 'sending' | null>(null);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { sendMediaMessage, sendAudioMessage, isLoading: apiLoading } = useEvolutionApi();
  const { handleScanResult } = useScanResponseHandler();

  const processFilesToQueue = useCallback((files: File[]): QueuedFile[] => {
    const processed = files.slice(0, MAX_FILES).map((file, index) => {
      const validation = validateFile(file);
      let preview: string | undefined;
      if (
        validation.valid &&
        (validation.category === 'image' || file.type === 'application/pdf')
      ) {
        preview = URL.createObjectURL(file);
      }
      return {
        id: `${Date.now()}-${index}`,
        file,
        validation,
        preview,
        status: 'pending' as const,
        progress: 0,
      };
    });
    return processed.sort(
      (a, b) =>
        (categoryOrder[a.validation.category || 'document'] ?? 99) -
        (categoryOrder[b.validation.category || 'document'] ?? 99)
    );
  }, []);

  const uploadFileToStorage = useCallback(async (file: File): Promise<string> => {
    let fileToUpload = file;
    if (file.type.startsWith('image/') && file.type !== 'image/gif') {
      try {
        const result = await compressImage(file);
        if (result.wasCompressed) {
          log.debug(
            'Image compressed:',
            formatCompressionInfo(result.originalSize, result.compressedSize)
          );
          fileToUpload = result.file;
        }
      } catch (err) {
        log.warn('Image compression failed:', err);
      }
    }

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('bucket', 'whatsapp-media');
    const { data, error } = await supabase.functions.invoke('secure-upload', {
      body: formData,
    });

    // Normalize ANY response (success, FunctionsHttpError body, transport
    // failure) into a single ScanResult so the caller can branch on `code`.
    const result = await parseScanInvocation({
      data: data as Record<string, unknown> | null | undefined, // ignore-audit: narrows Supabase query result to local interface
      error,
    });

    if (result.status === 'success') {
      const url = result.payload.url ?? result.payload.path;
      if (typeof url !== 'string' || !url) {
        throw new Error('Upload concluído sem URL retornada.');
      }
      return url;
    }

    // All non-success paths (MALWARE_DETECTED, SUSPICIOUS_FILE, timeouts,
    // network errors, etc.) bubble up as a structured error so the UI layer
    // decides how to render — toast with retry, hard block, etc.
    throw new ScanBlockedError(result);
  }, []);

  const handleClose = useCallback(() => {
    if (filePreview?.preview) URL.revokeObjectURL(filePreview.preview);
    fileQueue.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    setFilePreview(null);
    setFileQueue([]);
    setIsMultiMode(false);
    setCaption('');
    setCurrentQueueIndex(0);
    setIsDialogOpen(false);
  }, [filePreview, fileQueue]);

  const sendFileViaApi = useCallback(
    async (file: File, category: string | undefined, cap?: string) => {
      if (!instanceName || !recipientNumber) return null;
      const mediaUrl = await uploadFileToStorage(file);
      const messageContent =
        category === 'document'
          ? file.name
          : cap ||
            `[${category === 'image' ? 'Imagem' : category === 'video' ? 'Vídeo' : category === 'audio' ? 'Áudio' : 'Arquivo'}]`;

      const apiPromise =
        category === 'audio'
          ? sendAudioMessage(instanceName, recipientNumber, mediaUrl)
          : sendMediaMessage({
              instanceName,
              number: recipientNumber,
              mediaUrl,
              mediaType: category as 'image' | 'video' | 'audio' | 'document',
              caption: cap || undefined,
            });

      const dbPromise = contactId
        ? dbFrom('messages')
            .insert({
              contact_id: contactId,
              whatsapp_connection_id: connectionId || null,
              content: messageContent,
              message_type: category || 'document',
              media_url: mediaUrl,
              sender: 'agent',
              status: 'sending',
            })
            .select('id')
            .maybeSingle() // ✅ fix: maybeSingle evita PGRST116
        : Promise.resolve(null);

      const [result, dbResult] = await Promise.all([apiPromise, dbPromise]);
      const externalId = extractEvolutionMessageId(result);
      if (dbResult?.data?.id && externalId) {
        void Promise.resolve(
          dbFrom('messages')
            .update({ external_id: externalId, status: 'sent' })
            .eq('id', dbResult.data.id)
        ).then(
          () => {},
          () => {}
        );
      }
      return { result, mediaUrl, category };
    },
    [
      instanceName,
      recipientNumber,
      contactId,
      connectionId,
      uploadFileToStorage,
      sendMediaMessage,
      sendAudioMessage,
    ]
  );

  const handleSendFile = useCallback(async () => {
    if (!filePreview || !filePreview.validation.valid) return;
    if (!instanceName || !recipientNumber) {
      onFileSelect?.(filePreview.file, filePreview.validation.category || 'document');
      handleClose();
      return;
    }
    const file = filePreview.file;
    const category = filePreview.validation.category;
    const currentCaption = caption;
    handleClose();

    // Wrapped so onRetry can replay the exact same attempt with the same closure vars.
    const attempt = async () => {
      toast.info('Enviando arquivo...', { id: 'file-upload', duration: 30000 });
      try {
        const sent = await sendFileViaApi(file, category, currentCaption);
        toast.success('Arquivo enviado!', { id: 'file-upload' });
        if (sent) onFileSent?.(buildFileMessageData(sent.result, sent.mediaUrl, sent.category));
      } catch (err) {
        if (err instanceof ScanBlockedError) {
          handleScanResult(err.result, {
            fileName: file.name,
            toastId: 'file-upload',
            onRetry: () => {
              void attempt();
            },
          });
          return;
        }
        const error = err instanceof Error ? err : new Error('Unknown error');
        log.error('Error sending file:', error);
        toast.error(error.message || 'Erro ao enviar arquivo', { id: 'file-upload' });
      }
    };

    await attempt();
  }, [
    filePreview,
    instanceName,
    recipientNumber,
    caption,
    handleClose,
    sendFileViaApi,
    onFileSent,
    onFileSelect,
    handleScanResult,
  ]);

  const sendSingleQueueFile = useCallback(
    async (queuedFile: QueuedFile, index: number): Promise<boolean> => {
      if (!queuedFile.validation.valid || !instanceName || !recipientNumber) return false;
      setFileQueue((prev) =>
        prev.map((f, i) => (i === index ? { ...f, status: 'uploading', progress: 0 } : f))
      );
      try {
        const sent = await sendFileViaApi(
          queuedFile.file,
          queuedFile.validation.category,
          undefined
        );
        setFileQueue((prev) =>
          prev.map((f, i) => (i === index ? { ...f, status: 'done', progress: 100 } : f))
        );
        if (sent) onFileSent?.(buildFileMessageData(sent.result, sent.mediaUrl, sent.category));
        return true;
      } catch (err) {
        if (err instanceof ScanBlockedError) {
          const errorMsg = err.result.status === 'error' ? err.result.message : 'Erro';
          handleScanResult(err.result, {
            fileName: queuedFile.file.name,
            toastId: `file-upload-${queuedFile.id}`,
            onRetry: () => {
              void sendSingleQueueFile(queuedFile, index);
            },
          });
          setFileQueue((prev) =>
            prev.map((f, i) => (i === index ? { ...f, status: 'error', error: errorMsg } : f))
          );
          return false;
        }
        const error = err instanceof Error ? err : new Error('Unknown error');
        log.error('Error sending queued file:', error);
        setFileQueue((prev) =>
          prev.map((f, i) => (i === index ? { ...f, status: 'error', error: error.message } : f))
        );
        return false;
      }
    },
    [instanceName, recipientNumber, sendFileViaApi, onFileSent, handleScanResult]
  );

  const handleSendAllFiles = useCallback(async () => {
    if (fileQueue.length === 0) return;
    setUploading(true);
    let successCount = 0,
      errorCount = 0;
    for (let i = 0; i < fileQueue.length; i++) {
      setCurrentQueueIndex(i);
      if (fileQueue[i].validation.valid) {
        const success = await sendSingleQueueFile(fileQueue[i], i);
        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
        if (i < fileQueue.length - 1) await new Promise((r) => setTimeout(r, 500));
      } else {
        errorCount++;
      }
    }
    setUploading(false);
    if (successCount > 0) toast.success(`${successCount} arquivo(s) enviado(s) com sucesso!`);
    if (errorCount > 0) toast.error(`${errorCount} arquivo(s) falharam ao enviar`);
    setTimeout(handleClose, 1000);
  }, [fileQueue, sendSingleQueueFile, handleClose]);

  const handleExternalFile = useCallback((file: File) => {
    const validation = validateFile(file);
    let preview: string | undefined;
    if (validation.valid && (validation.category === 'image' || file.type === 'application/pdf'))
      preview = URL.createObjectURL(file);
    setFilePreview({ file, validation, preview });
    setIsMultiMode(false);
    setFileQueue([]);
    setCaption('');
    setIsDialogOpen(showDialog);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExternalFiles = useCallback(
    (files: File[]) => {
      if (files.length > MAX_FILES) toast.warning(`Limite de ${MAX_FILES} arquivos por vez.`);
      if (files.length === 1) {
        handleExternalFile(files[0]);
      } else {
        setFileQueue(processFilesToQueue(files));
        setIsMultiMode(true);
        setFilePreview(null);
      }
      setCaption('');
      setCurrentQueueIndex(0);
      setIsDialogOpen(showDialog);
    },
    [handleExternalFile, processFilesToQueue] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateFile(file);
    let preview: string | undefined;
    if (validation.valid && (validation.category === 'image' || file.type === 'application/pdf'))
      preview = URL.createObjectURL(file);
    setFilePreview({ file, validation, preview });
    setCaption('');
    setIsDialogOpen(showDialog);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const removeFromQueue = useCallback((id: string) => {
    setFileQueue((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const canSend = !!(instanceName && recipientNumber);
  const validFilesCount = fileQueue.filter((f) => f.validation.valid).length;
  const totalQueueProgress =
    fileQueue.length > 0
      ? Math.round(fileQueue.reduce((acc, f) => acc + f.progress, 0) / fileQueue.length)
      : 0;

  return {
    isDialogOpen,
    filePreview,
    fileQueue,
    isMultiMode,
    caption,
    setCaption,
    uploading,
    uploadProgress,
    uploadStage,
    currentQueueIndex,
    fileInputRef,
    apiLoading,
    canSend,
    validFilesCount,
    totalQueueProgress,
    handleClose,
    handleSendFile,
    handleSendAllFiles,
    handleFileChange,
    handleExternalFile,
    handleExternalFiles,
    removeFromQueue,
  };
}
