import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Ban, Loader2, Smartphone } from 'lucide-react';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { supabase } from '@/integrations/supabase/client';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import { isValidUUID } from '@/utils/uuid';

interface BlockContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: { id: string; name: string; phone: string } | null;
}

/**
 * Dialog de bloqueio de contato no WhatsApp (CONTATOS-16).
 * Conecta useEvolutionApi.updateBlockStatus → edge evolution-api (update-block-status)
 * → POST /chat/updateBlockStatus/{instance}. A instância é resolvida no padrão do
 * inbox (contacts.whatsapp_connection_id → whatsapp_connections.instance_name, com
 * fallback para a primeira conexão conectada).
 */
export function BlockContactDialog({ open, onOpenChange, contact }: BlockContactDialogProps) {
  const { updateBlockStatus } = useEvolutionApi();
  const [resolving, setResolving] = useState(false);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);

  const resolveInstance = useCallback(async (contactId: string): Promise<string | null> => {
    try {
      const { data: contactRow } = await supabase
        .from('contacts')
        .select('whatsapp_connection_id')
        .eq('id', contactId)
        .maybeSingle();

      if (contactRow?.whatsapp_connection_id) {
        const { data: conn } = await supabase
          .from('whatsapp_connections')
          .select('instance_id, instance_name')
          .eq('id', contactRow.whatsapp_connection_id)
          .maybeSingle();
        const resolved = conn ? evolutionInstanceName(conn) : null;
        if (resolved) return resolved;
        // Conexão específica existe mas sem nome roteável (UUID-only) — não usar fallback.
        return null;
      }

      const { data: fallbackConn } = await supabase
        .from('whatsapp_connections')
        .select('id, instance_id, instance_name')
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle();

      return fallbackConn ? evolutionInstanceName(fallbackConn) : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (open && contact) {
      setBlocking(false);
      setInstanceName(null);
      if (isValidUUID(contact.id)) {
        setResolving(true);
        void resolveInstance(contact.id)
          .then(setInstanceName)
          .finally(() => setResolving(false));
      }
    }
  }, [open, contact, resolveInstance]);

  const handleBlock = async () => {
    if (!contact || !instanceName) return;
    const number = contact.phone.replace(/\D/g, '');
    if (!number) {
      return;
    }
    setBlocking(true);
    try {
      await updateBlockStatus(instanceName, number, 'block');
      onOpenChange(false);
    } catch {
      // Toast de erro já é exibido pelo withToast do hook — mantém o dialog aberto.
    } finally {
      setBlocking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Bloquear contato
          </DialogTitle>
          <DialogDescription>
            {contact?.name ?? 'Este contato'} não poderá mais enviar mensagens para esta
            conversa após o bloqueio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 rounded-lg bg-muted/20 p-2.5">
            <Smartphone className="h-3.5 w-3.5 text-primary" />
            <span className="truncate">{contact?.phone}</span>
          </div>
          {resolving ? (
            <div className="flex items-center gap-2 px-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Resolvendo instância WhatsApp...
            </div>
          ) : instanceName ? (
            <p className="px-1">
              Instância: <span className="font-medium text-foreground">{instanceName}</span>
            </p>
          ) : (
            <p className="px-1 text-destructive/80">
              Nenhuma conexão WhatsApp disponível para bloquear este contato.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={blocking}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleBlock()}
            disabled={blocking || resolving || !instanceName}
          >
            {blocking ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Ban className="mr-1 h-3.5 w-3.5" />}
            Bloquear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
