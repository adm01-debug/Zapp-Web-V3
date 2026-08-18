import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, MailPlus } from 'lucide-react';
import type { InviteUserPayload } from '../hooks/useAdminData';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cria o convite via invoke('invite-user'); true = sucesso. Erros honestos
   *  (duplicado 409, não-admin 403) são exibidos via toast pelo chamador. */
  onInvite: (payload: InviteUserPayload) => Promise<boolean>;
}

const roleOptions = [
  { value: 'agent', label: 'Atendente' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Administrador' },
] as const;

/** Invite User Dialog — convite por email (Etapa 57.5). */
export function InviteUserDialog({ open, onOpenChange, onInvite }: InviteUserDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'agent' | 'supervisor' | 'admin'>('agent');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setRole('agent');
    setMessage('');
    setErrorMsg(null);
  };

  const handleInvite = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Email é obrigatório');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Email inválido');
      return;
    }

    setIsSending(true);
    setErrorMsg(null);
    try {
      const ok = await onInvite({
        email: cleanEmail,
        role,
        message: message.trim() || undefined,
      });
      if (ok) {
        reset();
        onOpenChange(false);
      } else {
        setErrorMsg('Não foi possível enviar o convite. Tente novamente.');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailPlus className="h-5 w-5 text-primary" />
            Convidar Usuário
          </DialogTitle>
          <DialogDescription>
            Envie um convite por email — o convidado cria a própria conta com senha forte
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email *</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Cargo</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-message">Mensagem (opcional)</Label>
            <Input
              id="invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex: Bem-vindo ao time!"
              maxLength={500}
            />
          </div>

          {errorMsg && (
            <p role="alert" className="text-sm text-destructive">
              {errorMsg}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button onClick={handleInvite} disabled={isSending}>
            {isSending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MailPlus className="mr-2 h-4 w-4" />
            )}
            Enviar Convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
