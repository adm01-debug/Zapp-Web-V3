import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { WhatsAppConnection } from '@/features/connections';

interface ConnectionDisconnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: WhatsAppConnection;
  onDisconnect: (c: WhatsAppConnection) => Promise<void>;
}

export function ConnectionDisconnectDialog({
  open,
  onOpenChange,
  connection,
  onDisconnect,
}: ConnectionDisconnectDialogProps) {
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desconectar "{connection.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação encerrará a sessão do WhatsApp. Você precisará escanear o QR Code novamente
            para reconectar e poderá perder o recebimento de novas mensagens até lá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDisconnecting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={async (e) => {
              e.preventDefault();
              setIsDisconnecting(true);
              try {
                await onDisconnect(connection);
                onOpenChange(false);
              } finally {
                setIsDisconnecting(false);
              }
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Desconectando...
              </>
            ) : (
              'Sim, desconectar'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
