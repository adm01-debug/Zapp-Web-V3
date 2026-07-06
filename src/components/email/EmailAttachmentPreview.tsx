import { useState } from 'react';
import { FileText, Image as ImageIcon, Film, Archive, File, Download, Eye, Loader2 } from 'lucide-react';
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
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar')) return Archive;
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

export function EmailAttachmentPreview({ attachments, className }: EmailAttachmentPreviewProps) {
  const [preview, setPreview] = useState<EmailAttachment | null>(null);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  if (attachments.length === 0) return null;

  const handleDownload = async (att: EmailAttachment) => {
    if (!att.storage_url) return;
    setDownloading(prev => new Set([...prev, att.id]));
    try {
      const link = document.createElement('a');
      link.href = att.storage_url;
      link.download = att.filename;
      link.click();
    } finally {
      setDownloading(prev => { const next = new Set(prev); next.delete(att.id); return next; });
    }
  };

  const canPreview = (att: EmailAttachment) =>
    att.storage_url && (att.mime_type?.startsWith('image/') || att.mime_type?.includes('pdf'));

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <span>Anexos</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{attachments.length}</Badge>
      </p>

      <div className="flex flex-wrap gap-2">
        {attachments.map(att => {
          const Icon = getFileIcon(att.mime_type);
          const iconColor = getFileColor(att.mime_type);
          const isDownloading = downloading.has(att.id);

          return (
            <div
              key={att.id}
              className="group flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm hover:bg-muted/70 transition-colors max-w-56"
            >
              <Icon className={cn('h-5 w-5 shrink-0', iconColor)} />

              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium">{att.filename}</p>
                {att.size_bytes != null && (
                  <p className="text-[10px] text-muted-foreground">{formatBytesCompact(att.size_bytes)}</p>
                )}
              </div>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {canPreview(att) && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPreview(att)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                )}
                {att.storage_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleDownload(att)}
                    disabled={isDownloading}
                  >
                    {isDownloading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Download className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview modal */}
      <Dialog open={!!preview} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium truncate">{preview?.filename}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] flex items-center justify-center bg-muted/30 rounded-lg">
            {preview?.mime_type?.startsWith('image/') && preview.storage_url && (
              <img
                src={preview.storage_url}
                alt={preview.filename}
                className="max-w-full max-h-full object-contain rounded"
              />
            )}
            {preview?.mime_type?.includes('pdf') && preview.storage_url && (
              <iframe
                src={preview.storage_url}
                className="w-full h-[55vh] rounded"
                title={preview.filename}
              />
            )}
          </div>
          {preview?.storage_url && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => preview && handleDownload(preview)}>
                <Download className="h-4 w-4 mr-2" />
                Baixar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
