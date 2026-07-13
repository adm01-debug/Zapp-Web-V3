import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';

export interface NewConnectionData {
  name: string;
  phone_number: string;
  api_type: 'evolution' | 'official';
}

interface AddConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newConnection: NewConnectionData;
  onNewConnectionChange: (c: NewConnectionData) => void;
  isCreating: boolean;
  onAdd: () => void;
}

export function AddConnectionDialog({
  open,
  onOpenChange,
  newConnection,
  onNewConnectionChange,
  isCreating,
  onAdd,
}: AddConnectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-whatsapp text-primary-foreground hover:bg-whatsapp-dark">
          <Plus className="mr-2 h-4 w-4" />
          Conectar WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
          <DialogDescription>Configure os dados da conexão</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Nome (identificação interna)</Label>
            <Input
              aria-label="Nome da conexão (identificação interna)"
              placeholder="Ex: Vendas, SAC, Financeiro"
              value={newConnection.name}
              onChange={(e) => onNewConnectionChange({ ...newConnection, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Número do celular</Label>
            <PhoneInput
              value={newConnection.phone_number}
              onChange={(formatted) =>
                onNewConnectionChange({ ...newConnection, phone_number: formatted })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Método de conexão</Label>
            <Select
              value={newConnection.api_type}
              onValueChange={(v) =>
                onNewConnectionChange({
                  ...newConnection,
                  api_type: v as
                    | 'evolution'
                    | 'official' /* ignore-audit: Select value narrowed to union; developer controls option values */,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Como deseja conectar?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evolution">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Não-oficial (Evolution API)</span>
                    <span className="text-xs text-muted-foreground">
                      Conexão via QR Code (WhatsApp Web)
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="official">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Oficial (WhatsApp Cloud API)</span>
                    <span className="text-xs text-muted-foreground">
                      Autenticação via Meta — sem QR Code
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            {newConnection.api_type === 'official' && (
              <p className="text-xs text-muted-foreground">
                A API oficial não usa QR Code. Após criar, configure as credenciais (Phone Number
                ID, Access Token) nas configurações da conexão.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
              Cancelar
            </Button>
            <Button
              onClick={onAdd}
              className="bg-whatsapp hover:bg-whatsapp-dark"
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Adicionar'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
