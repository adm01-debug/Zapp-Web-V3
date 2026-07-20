import { useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Archive,
  File,
  Download,
  Eye,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type EmailAttachment } from '@/hooks/gmail/gmailTypes';
import { formatBytesCompact } from '@/lib/formatters';

interface EmailAttachmentPreviewProps {
  attachments: EmailAttachment[];
  className?: string;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (mimeType.startsWith('video/')) return Film;
  if (mimeType.includes('pdf')) return FileText;
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar'))
    return Archive;
  return FileText;
}

function getFileColor(mimeType: string | null): string {
  if (!mimeType) return 'text-muted-foreground';
  if (mimeType.startsWith('image/')) return 'text-primary';
  if (mimeType.startsWith('video/')) return 'text-primary';
  if (mimeType.includes('pdf')) return 'text-destructive-foreground';
  if (mimeType.includes('zip') || mimeType.includes('tar')) return 'text-warning-foreground';
  return 'text-muted-foreground';
}

/** Email Attachment Preview component for the email section. */
export function EmailAttachmentPreview({ attachments, className }: EmailAttachmentPreviewProps) {
  const [preview, setPreview] = useState<EmailAttachment | null>(null);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  if (attachments.length === 0) return null;

  const handleDownload = async (att: EmailAttachment) => {
    if (!att.storage_url) return;
    setDownloading((prev) => new Set([...prev, att.id]));
    try {
      const link = document.createElement('a');
      link.href = att.storage_url;
      link.download = att.filename;
      link.click();
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(att.id);
        return next;
      });
    }
  };

  const canPreview = (att: EmailAttachment) =>
    att.storage_url && (att.mime_type?.startsWith('image/') || att.mime_type?.includes('pdf'));

  return (
    <div className={cn('space-y-2', className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>Anexos</span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {attachments.length}
        </Badge>
      </p>

      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => {
          const Icon = getFileIcon(att.mime_type);
          const iconColor = getFileColor(att.mime_type);
          const isDownloading = downloading.has(att.id);

          return (
            <div
              key={att.id}
              className="group flex max-w-56 items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted/70"
            >
              <Icon className={cn('h-5 w-5 shrink-0', iconColor)} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{att.filename}</p>
                {att.size_bytes != null && (
                  <p className="text-[10px] text-muted-foreground">
                    {formatBytesCompact(att.size_bytes)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {canPreview(att) && (
                  <Button
                    aria-label="Visualizar anexo"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setPreview(att)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                )}
                {att.storage_url && (
                  <Button
                    aria-label="Baixar anexo"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleDownload(att)}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview modal */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate text-sm font-medium">{preview?.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[60vh] items-center justify-center overflow-auto rounded-lg bg-muted/30">
            {preview?.mime_type?.startsWith('image/') && preview.storage_url && (
              <img
                src={preview.storage_url}
                alt={preview.filename}
                className="max-h-full max-w-full rounded object-contain"
              />
            )}
            {preview?.mime_type?.includes('pdf') && preview.storage_url && (
              <iframe
                src={preview.storage_url}
                className="h-[55vh] w-full rounded"
                title={preview.filename}
              />
            )}
          </div>
          {preview?.storage_url && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => preview && handleDownload(preview)}
              >
                <Download className="mr-2 h-4 w-4" />
                Baixar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
