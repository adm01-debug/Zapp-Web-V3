import { AnimatePresence, motion } from 'framer-motion';
import { X, Image as ImageIcon, FileText, FileVideo, FileAudio } from 'lucide-react';
import { formatFileSize } from '@/utils/whatsappFileTypes';

/** Attachment component for the chat section. */
export interface Attachment {
  id: string;
  file: File;
  preview?: string;
  category?: string;
}

interface AttachmentPreviewStripProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

/** Attachment Preview Strip component for the chat section. */
export function AttachmentPreviewStrip({ attachments, onRemove }: AttachmentPreviewStripProps) {
  return (
    <AnimatePresence>
      {attachments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-border/50 bg-background/80 px-4 py-2 backdrop-blur-sm"
        >
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <motion.div
                key={att.id}
                layout
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
              >
                {att.preview ? (
                  <img
                    src={att.preview}
                    alt="Pré-visualização do anexo"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 p-1 text-muted-foreground">
                    {att.category === 'video' ? (
                      <FileVideo className="h-6 w-6" />
                    ) : att.category === 'audio' ? (
                      <FileAudio className="h-6 w-6" />
                    ) : att.category === 'image' ? (
                      <ImageIcon className="h-6 w-6" />
                    ) : (
                      <FileText className="h-6 w-6" />
                    )}
                    <span className="max-w-full truncate text-center text-[8px]">
                      {att.file.name}
                    </span>
                  </div>
                )}
                <button type="button"
                  onClick={() => onRemove(att.id)}
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 text-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-foreground group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="backdrop-blur-xs absolute bottom-0 left-0 right-0 bg-background/60 px-1 py-0.5">
                  <span className="block truncate text-[8px] font-medium">
                    {formatFileSize(att.file.size)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
