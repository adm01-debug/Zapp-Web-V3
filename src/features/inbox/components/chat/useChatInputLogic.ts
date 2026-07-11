import { useState, useCallback, useEffect, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { validateFile } from '@/utils/whatsappFileTypes';
import { toast } from '@/hooks/use-toast';
import { FileUploaderRef } from '../FileUploader';

const DRAFT_KEY_PREFIX = 'chat_draft_';
const CHAR_LIMIT = 4096;

export interface ChatInputAttachment {
  id: string;
  file: File;
  preview?: string;
  category: string;
}

interface UseChatInputLogicParams {
  inputValue: string;
  contactId: string;
  editingMessage: { content: string } | null | undefined;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileUploaderRef: React.RefObject<FileUploaderRef | null>;
  onSend: (attachments?: File[]) => void;
  onPasteFiles?: (files: File[]) => void;
  isRecordingAudio?: boolean;
}

export function useChatInputLogic({
  inputValue,
  contactId,
  editingMessage,
  inputRef,
  fileUploaderRef,
  onSend,
  onPasteFiles: _onPasteFiles,
  isRecordingAudio,
}: UseChatInputLogicParams) {
  const [showRichToolbar, setShowRichToolbar] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [sendAnimation, setSendAnimation] = useState(false);
  const [isSendingFiles, setIsSendingFiles] = useState(false);
  const [attachments, setAttachments] = useState<ChatInputAttachment[]>([]);
  const lastErrorRef = useRef<string | null>(null);
  const isMobile = useIsMobile();

  const hasText = inputValue.trim().length > 0;
  const charCount = inputValue.length;
  const isNearLimit = charCount > CHAR_LIMIT * 0.9;
  const isOverLimit = charCount > CHAR_LIMIT;

  // Auto-grow textarea
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [inputRef]);

  useEffect(() => {
    autoResize();
  }, [inputValue, autoResize]);

  // Auto-save drafts
  useEffect(() => {
    if (!contactId || editingMessage) return;
    const timer = setTimeout(() => {
      try {
        if (inputValue.trim()) {
          localStorage.setItem(`${DRAFT_KEY_PREFIX}${contactId}`, inputValue);
        } else {
          localStorage.removeItem(`${DRAFT_KEY_PREFIX}${contactId}`);
        }
      } catch {
        /* storage unavailable */
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [inputValue, contactId, editingMessage]);

  // Restore draft on contact change
  useEffect(() => {
    if (!contactId || editingMessage) return;
    let draft: string | null = null;
    try {
      draft = localStorage.getItem(`${DRAFT_KEY_PREFIX}${contactId}`);
    } catch {
      /* storage unavailable */
    }
    if (draft && !inputValue) {
      setNativeValue(inputRef, draft);
    }
  }, [contactId]);

  const handleFileSelect = useCallback((file: File) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      toast({ title: 'Arquivo inválido', description: validation.error, variant: 'destructive' });
      return;
    }

    const preview =
      validation.category === 'image' || file.type === 'application/pdf'
        ? URL.createObjectURL(file)
        : undefined;

    setAttachments((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview,
        category: validation.category || 'document',
      },
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  // Paste images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/') || items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        files.forEach(handleFileSelect);
      }
    },
    [handleFileSelect]
  );

  // Voice dictation
  const handleVoiceDictation = useCallback(
    (text: string) => {
      const el = inputRef.current;
      if (!el) return;
      const current = el.value;
      setNativeValue(inputRef, current ? `${current} ${text}` : text);
      el.focus();
    },
    [inputRef]
  );

  // Send with animation
  const handleSendWithAnimation = useCallback(async () => {
    // If no text/attachments and not editing, we handle mic record toggle or trigger file picker
    if (!hasText && attachments.length === 0 && !editingMessage) {
      fileUploaderRef.current?.triggerFilePicker();
      return;
    }

    if (isOverLimit || isSendingFiles) return;

    setSendAnimation(true);
    setIsSendingFiles(true);
    lastErrorRef.current = null;

    try {
      try {
        localStorage.removeItem(`${DRAFT_KEY_PREFIX}${contactId}`);
      } catch {
        /* storage unavailable */
      }
      if (isMobile && navigator.vibrate) navigator.vibrate(50);

      await onSend(attachments.map((a) => a.file));
      setAttachments([]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erro ao enviar';
      lastErrorRef.current = errorMsg;
      toast({
        title: 'Falha no envio',
        description: `${errorMsg}. Tente novamente.`,
        variant: 'destructive',
      });
    } finally {
      setIsSendingFiles(false);
      setTimeout(() => setSendAnimation(false), 400);
    }
  }, [
    hasText,
    attachments,
    isOverLimit,
    isSendingFiles,
    contactId,
    isMobile,
    onSend,
    editingMessage,
    fileUploaderRef,
  ]);

  const canSend = hasText || attachments.length > 0 || !!editingMessage;
  const isMicActive = !!isRecordingAudio;

  return {
    showRichToolbar,
    setShowRichToolbar,
    showMarkdownPreview,
    setShowMarkdownPreview,
    sendAnimation,
    isMobile,
    hasText,
    charCount,
    isNearLimit,
    isOverLimit,
    CHAR_LIMIT,
    attachments,
    removeAttachment,
    handleFileSelect,
    handlePaste,
    handleVoiceDictation,
    handleSendWithAnimation,
    canSend,
    isMicActive,
  };
}

/** Helper to set textarea value via native setter (React-compatible) */
export function setNativeValue(
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string
) {
  const el = inputRef.current;
  if (!el) return;
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
