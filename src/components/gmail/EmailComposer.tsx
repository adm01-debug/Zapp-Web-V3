import { useState, useRef, useCallback, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { X, Minus, Maximize2, Minimize2, Send, Paperclip, Bold, Italic, Underline, Link2, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { emailSendMessage } from '@/hooks/gmail/gmailApi';
import { useEmailSignature } from '@/hooks/useEmailSignature';
import { useEmailDraft } from '@/hooks/useEmailDraft';

interface EmailComposerProps {
  accountId: string;
  defaultTo?: string[];
  defaultSubject?: string;
  defaultBody?: string;
  replyToThreadId?: string;
  onClose?: () => void;
  onSent?: () => void;
  className?: string;
}

function parseEmails(raw: string): string[] {
  return raw.split(/[,;]/).map(s => s.trim()).filter(s => s.includes('@'));
}

export function EmailComposer({
  accountId,
  defaultTo = [],
  defaultSubject = '',
  defaultBody = '',
  replyToThreadId,
  onClose,
  onSent,
  className,
}: EmailComposerProps) {
  const [to, setTo] = useState(defaultTo.join(', '));
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { signatures, defaultSignature } = useEmailSignature(accountId);
  const { draft, update, save: saveDraft, discard } = useEmailDraft(accountId, replyToThreadId);

  // Carrega assinatura padrão
  useEffect(() => {
    if (defaultSignature && !selectedSignatureId) {
      setSelectedSignatureId(defaultSignature.id);
      if (editorRef.current && defaultSignature.html_content) {
        editorRef.current.innerHTML = DOMPurify.sanitize((defaultBody || '') + '<br/><br/>' + (defaultSignature.html_content || ''));
      }
    } else if (editorRef.current && defaultBody) {
      editorRef.current.innerHTML = DOMPurify.sanitize(defaultBody);
    }
  }, [defaultSignature, defaultBody, selectedSignatureId]);

  const selectedSignature = signatures.find(s => s.id === selectedSignatureId);

  const execCmd = useCallback((cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => f.size <= 25 * 1024 * 1024);
    setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(',')[1] ?? '');
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  const handleSend = async () => {
    const toList = parseEmails(to);
    if (toList.length === 0) { toast.error('Informe pelo menos um destinatário'); return; }
    if (!subject.trim()) { toast.error('Informe o assunto'); return; }

    const bodyHtml = editorRef.current?.innerHTML ?? '';
    const bodyPlain = editorRef.current?.innerText ?? '';

    setIsSending(true);
    try {
      const processedAttachments = await Promise.all(
        attachments.map(async f => ({
          name: f.name,
          mimeType: f.type || 'application/octet-stream',
          data: await fileToBase64(f),
        }))
      );

      await emailSendMessage({
        accountId,
        to: toList,
        cc: parseEmails(cc),
        bcc: parseEmails(bcc),
        subject,
        bodyHtml,
        bodyPlain,
        threadId: replyToThreadId,
        attachments: processedAttachments,
      });

      await discard();
      toast.success('Email enviado!');
      onSent?.();
      onClose?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar');
    } finally {
      setIsSending(false);
    }
  };

  if (minimized) {
    return (
      <div className={cn('flex items-center gap-2 bg-card border rounded-lg px-3 py-2 shadow-lg cursor-pointer', className)} onClick={() => setMinimized(false)}>
        <span className="text-sm font-medium truncate flex-1">{subject || 'Novo email'}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={e => { e.stopPropagation(); onClose?.(); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn(
      'flex flex-col bg-card border rounded-lg shadow-xl overflow-hidden',
      maximized ? 'fixed inset-4 z-50' : 'w-[560px] max-h-[600px]',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
        <h3 className="font-semibold text-sm">{replyToThreadId ? 'Responder' : 'Novo Email'}</h3>
        <div className="flex items-center gap-1">
          {draft.isDirty && (
            <span className="text-[10px] text-muted-foreground mr-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Rascunho não salvo
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMinimized(true)}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMaximized(v => !v)}>
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { discard(); onClose?.(); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Fields */}
      <div className="border-b divide-y">
        <div className="flex items-center gap-2 px-4 py-2">
          <span className="text-xs text-muted-foreground w-8 shrink-0">Para</span>
          <Input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="email@exemplo.com"
            className="border-0 h-7 px-0 text-sm focus-visible:ring-0"
          />
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowCcBcc(v => !v)}>
            {showCcBcc ? 'Ocultar' : 'Cc/Bcc'}
          </button>
        </div>

        {showCcBcc && (
          <>
            <div className="flex items-center gap-2 px-4 py-1.5">
              <span className="text-xs text-muted-foreground w-8 shrink-0">Cc</span>
              <Input value={cc} onChange={e => setCc(e.target.value)} placeholder="cc@exemplo.com" className="border-0 h-7 px-0 text-sm focus-visible:ring-0" />
            </div>
            <div className="flex items-center gap-2 px-4 py-1.5">
              <span className="text-xs text-muted-foreground w-8 shrink-0">Bcc</span>
              <Input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="bcc@exemplo.com" className="border-0 h-7 px-0 text-sm focus-visible:ring-0" />
            </div>
          </>
        )}

        <div className="flex items-center gap-2 px-4 py-2">
          <span className="text-xs text-muted-foreground w-8 shrink-0">Assunto</span>
          <Input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Assunto do email"
            className="border-0 h-7 px-0 text-sm focus-visible:ring-0 font-medium"
          />
        </div>
      </div>

      {/* Formatting toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b bg-muted/20">
        {[
          { icon: Bold, cmd: 'bold', tip: 'Negrito' },
          { icon: Italic, cmd: 'italic', tip: 'Itálico' },
          { icon: Underline, cmd: 'underline', tip: 'Sublinhado' },
        ].map(({ icon: Icon, cmd, tip }) => (
          <Tooltip key={cmd}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={e => { e.preventDefault(); execCmd(cmd); }}>
                <Icon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{tip}</TooltipContent>
          </Tooltip>
        ))}

        <Separator orientation="vertical" className="h-4 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={e => { e.preventDefault(); const url = prompt('URL:'); if (url) execCmd('createLink', url); }}>
              <Link2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Link</TooltipContent>
        </Tooltip>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="flex-1 px-4 py-3 text-sm focus:outline-none overflow-auto min-h-[160px]"
        onInput={() => update({ bodyHtml: editorRef.current?.innerHTML ?? '' })}
      />

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t flex flex-wrap gap-1.5">
          {attachments.map((f, idx) => (
            <Badge key={idx} variant="secondary" className="gap-1 text-xs pr-1">
              <span className="max-w-24 truncate">{f.name}</span>
              <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Footer toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t bg-muted/20">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Anexar arquivo (máx 25MB)</TooltipContent>
          </Tooltip>
          <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} />

          {signatures.length > 0 && (
            <Select value={selectedSignatureId ?? 'none'} onValueChange={v => setSelectedSignatureId(v === 'none' ? null : v)}>
              <SelectTrigger className="h-8 text-xs w-32 border-0 bg-transparent">
                <SelectValue placeholder="Assinatura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem assinatura</SelectItem>
                {signatures.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={saveDraft} disabled={!draft.isDirty}>
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            Salvar rascunho
          </Button>
          <Button size="sm" className="h-8 gap-2" onClick={handleSend} disabled={isSending}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
