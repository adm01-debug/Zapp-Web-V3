import { useState, useRef, useCallback, useEffect } from 'react';
import DOMPurify from 'dompurify';
import {
  Send,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Signature,
  X,
  Loader2,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { emailSendMessage } from '@/hooks/gmail/gmailApi';
import { MessageTemplates } from '@/features/inbox/components/MessageTemplates';
import { useEmailSignature } from '@/hooks/useEmailSignature';
import { useEmailDraft } from '@/hooks/useEmailDraft';
import { useEmailSLA } from '@/hooks/useEmailSLA';

interface EmailChatReplyBarProps {
  accountId: string;
  threadId: string;
  threadEmailId: string;
  toEmails: string[];
  subject: string;
  onSent?: () => void;
  className?: string;
}

export function EmailChatReplyBar({
  accountId,
  threadId,
  threadEmailId,
  toEmails,
  subject,
  onSent,
  className,
}: EmailChatReplyBarProps) {
  const [isSending, setIsSending] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [_showSignaturePicker, _setShowSignaturePicker] = useState(false);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { signatures, defaultSignature } = useEmailSignature(accountId);
  const { draft, update, save: saveDraft, discard } = useEmailDraft(accountId, threadId);
  const { markReplied } = useEmailSLA(accountId);

  // Seleciona assinatura padrão automaticamente
  useEffect(() => {
    if (defaultSignature && !selectedSignatureId) {
      setSelectedSignatureId(defaultSignature.id);
    }
  }, [defaultSignature, selectedSignatureId]);

  const selectedSignature = signatures.find((s) => s.id === selectedSignatureId);

  // Sincroniza textarea com draft
  const bodyHtml = draft.bodyHtml;
  const setBody = useCallback(
    (html: string) => {
      update({ bodyHtml: html });
    },
    [update]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const oversized = files.filter((f) => f.size > 25 * 1024 * 1024);
    if (oversized.length) {
      toast.error(`${oversized.length} arquivo(s) acima de 25MB ignorados`);
    }
    setAttachments((prev) => [...prev, ...files.filter((f) => f.size <= 25 * 1024 * 1024)]);
    e.target.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Converte File para base64
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        res(result.split(',')[1] ?? '');
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

  const handleSend = async () => {
    const plainText = bodyHtml.replace(/<[^>]*>/g, '').trim();
    if (!plainText && attachments.length === 0) {
      toast.error('Escreva uma resposta ou anexe um arquivo');
      return;
    }

    setIsSending(true);
    try {
      // Converte anexos
      const processedAttachments = await Promise.all(
        attachments.map(async (f) => ({
          name: f.name,
          mimeType: f.type || 'application/octet-stream',
          data: await fileToBase64(f),
        }))
      );

      const toList = toEmails.filter(Boolean);
      const ccList = cc
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const bccList = bcc
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await (emailSendMessage as any)({
        accountId,
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        bodyHtml,
        bodyPlain: plainText,
        threadId: threadEmailId,
        attachments: processedAttachments as any,
        signature: true,
      });

      // Registra resposta no SLA
      markReplied(threadEmailId);

      // Descarta rascunho
      await discard();

      // Reset
      setAttachments([]);
      setCc('');
      setBcc('');

      toast.success('Email enviado!');
      onSent?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar';
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className={cn('sticky bottom-0 z-20 border-t bg-background/80 backdrop-blur-md', className)}
    >
      <div className="space-y-4 px-5 py-4">
        {/* Header: Para + CC/BCC toggle */}
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-primary/60">
              Para:
            </span>
            <span className="truncate text-[12px] font-semibold text-muted-foreground">
              {toEmails.join(', ')}
            </span>
          </div>
          <button
            className="flex shrink-0 items-center gap-1 transition-colors hover:text-foreground"
            onClick={() => setShowCcBcc((v) => !v)}
          >
            {showCcBcc ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {showCcBcc ? 'Ocultar' : 'Cc/Bcc'}
          </button>
        </div>

        {/* CC / BCC */}
        {showCcBcc && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">Cc:</span>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="email1@ex.com, email2@ex.com"
                className="h-7 border-0 bg-muted/30 text-xs focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">Bcc:</span>
              <Input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="email@exemplo.com"
                className="h-7 border-0 bg-muted/30 text-xs focus-visible:ring-0"
              />
            </div>
          </div>
        )}

        {/* Textarea */}
        <div className="group/input relative rounded-2xl border border-border/5 bg-background/50 p-4 transition-all duration-300 focus-within:border-primary/20 focus-within:bg-background focus-within:shadow-2xl focus-within:shadow-primary/5">
          <Textarea
            value={bodyHtml.replace(/<[^>]*>/g, '')}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva sua resposta comercial..."
            className="scrollbar-thin scrollbar-thumb-primary/10 min-h-[160px] resize-none border-0 bg-transparent px-0 text-[16px] font-medium leading-relaxed selection:bg-primary/20 placeholder:text-muted-foreground/30 focus-visible:ring-0"
          />
        </div>

        {/* Assinatura preview */}
        {selectedSignature && (
          <div className="border-t pt-2">
            <p className="mb-1 text-[10px] text-muted-foreground">
              — Assinatura: {selectedSignature.name}
            </p>
            <div
              className="max-h-16 overflow-hidden text-xs text-muted-foreground opacity-70"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(selectedSignature.html_content),
              }}
            />
          </div>
        )}

        {/* Anexos */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((file, idx) => (
              <Badge key={idx} variant="secondary" className="gap-1 pr-1 text-[11px]">
                <span className="max-w-32 truncate">{file.name}</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Draft auto-save indicator */}
        {draft.isDirty && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Rascunho não salvo</span>
            <button onClick={saveDraft} className="ml-1 underline hover:text-foreground">
              Salvar agora
            </button>
          </div>
        )}
        {draft.lastSaved && !draft.isDirty && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Rascunho salvo {draft.lastSaved.toLocaleTimeString()}
          </p>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {/* Attachment */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground transition-colors hover:text-primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Anexar arquivo</TooltipContent>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Template picker */}
            <MessageTemplates
              onSelectTemplate={(content) => {
                const el = bodyHtml.replace(/<[^>]*>/g, '');
                const newContent = el ? el + '\n\n' + content : content;
                setBody(newContent);
              }}
            />

            {/* Signature picker */}
            {signatures.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Select
                      value={selectedSignatureId ?? 'none'}
                      onValueChange={(v) => setSelectedSignatureId(v === 'none' ? null : v)}
                    >
                      <SelectTrigger className="h-8 w-8 border-0 bg-transparent p-0 focus:ring-0 [&>svg]:hidden">
                        <Signature className="h-4 w-4 text-muted-foreground transition-colors hover:text-primary" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem assinatura</SelectItem>
                        {signatures.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Assinatura</TooltipContent>
              </Tooltip>
            )}
          </div>

          <Button
            size="sm"
            className="h-[42px] gap-2.5 rounded-xl bg-primary px-6 font-black uppercase tracking-widest text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:scale-[1.03] hover:shadow-primary/30 active:scale-[0.97]"
            onClick={handleSend}
            disabled={isSending}
          >
            {isSending ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <Send className="h-4.5 w-4.5 fill-current" />
            )}
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
