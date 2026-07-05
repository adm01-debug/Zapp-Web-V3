import { useState, useCallback } from 'react';
import { Send, Paperclip, ChevronDown, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEmail, type EmailThread } from '@/hooks/useEmail';
import { useEmailSignature } from '@/hooks/useEmailSignature';

interface EmailReplyBarProps {
  thread:          EmailThread;
  defaultTo?:      string;
  onSent?:         () => void;
  onCancel?:       () => void;
}

export function EmailReplyBar({ thread, defaultTo, onSent, onCancel }: EmailReplyBarProps) {
  const { sendEmail, isSending, activeAccountId } = useEmail();
  const { defaultSignature } = useEmailSignature(activeAccountId);
  const injectSignature = (body: string) => defaultSignature?.html_content ? `${body}\n\n${defaultSignature.html_content}` : body;

  const [to, setTo]             = useState(defaultTo ?? thread.from_email ?? '');
  const [cc, setCc]             = useState('');
  const [bcc, setBcc]           = useState('');
  const [subject, setSubject]   = useState(`Re: ${thread.subject ?? '(sem assunto)'}`);
  const [body, setBody]         = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [includeSignature, setIncludeSignature] = useState(true);

  const handleSend = useCallback(async () => {
    setError(null);
    if (!to.trim()) { setError('Destinatário é obrigatório'); return; }
    if (!body.trim()) { setError('O corpo do email não pode estar vazio'); return; }

    // Montar body com assinatura
    const finalBody = includeSignature && defaultSignature
      ? injectSignature(`<div>${body.replace(/\n/g, '<br>')}</div>`)
      : `<div>${body.replace(/\n/g, '<br>')}</div>`;

    const result = await sendEmail({
      to:       to.split(',').map(e => e.trim()).filter(Boolean),
      cc:       cc ? cc.split(',').map(e => e.trim()).filter(Boolean) : undefined,
      bcc:      bcc ? bcc.split(',').map(e => e.trim()).filter(Boolean) : undefined,
      subject,
      bodyHtml: finalBody,
      threadId: thread.email_thread_id,
      signature: false, // Já injetamos manualmente
    });

    if (result.success) {
      onSent?.();
    } else {
      setError(result.error ?? 'Falha ao enviar email');
    }
  }, [to, cc, bcc, subject, body, sendEmail, thread, includeSignature, defaultSignature, injectSignature, onSent]);

  return (
    <div className="border rounded-lg bg-background shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
        <span className="text-sm font-medium">Responder</span>
        {onCancel && (
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Para */}
        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground w-6 shrink-0">Para</Label>
          <Input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="destinatario@email.com"
            className="h-8 text-sm flex-1"
            aria-label="Destinatário"
          />
          <button
            onClick={() => setShowCcBcc(prev => !prev)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 shrink-0"
          >
            CC/BCC <ChevronDown className={`h-3 w-3 transition-transform ${showCcBcc ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* CC / BCC (colapsível) */}
        {showCcBcc && (
          <>
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-6 shrink-0">CC</Label>
              <Input
                value={cc}
                onChange={e => setCc(e.target.value)}
                placeholder="cc@email.com, outro@email.com"
                className="h-8 text-sm flex-1"
                aria-label="Com cópia"
              />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-6 shrink-0">BCC</Label>
              <Input
                value={bcc}
                onChange={e => setBcc(e.target.value)}
                placeholder="bcc@email.com"
                className="h-8 text-sm flex-1"
                aria-label="Com cópia oculta"
              />
            </div>
          </>
        )}

        {/* Assunto */}
        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground w-6 shrink-0">Ass.</Label>
          <Input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="h-8 text-sm flex-1"
            aria-label="Assunto"
          />
        </div>

        {/* Corpo */}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Escreva sua resposta aqui..."
          rows={5}
          className="w-full text-sm border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          aria-label="Corpo do email"
        />

        {/* Assinatura */}
        {defaultSignature && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="include-signature"
              checked={includeSignature}
              onChange={e => setIncludeSignature(e.target.checked)}
              className="h-3.5 w-3.5 rounded"
            />
            <label htmlFor="include-signature" className="text-xs text-muted-foreground cursor-pointer">
              Incluir assinatura "{defaultSignature.name}"
            </label>
          </div>
        )}

        {/* Erro */}
        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* Ações */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSend}
              disabled={isSending || !to.trim() || !body.trim()}
              size="sm"
              className="gap-2"
            >
              <Send className="h-3.5 w-3.5" />
              {isSending ? 'Enviando...' : 'Enviar'}
            </Button>
            <Button variant="ghost" size="sm" className="gap-2" disabled>
              <Paperclip className="h-3.5 w-3.5" />
              Anexar
            </Button>
          </div>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
              Cancelar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmailReplyBar;
