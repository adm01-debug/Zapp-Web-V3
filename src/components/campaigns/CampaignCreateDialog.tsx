import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Megaphone, Loader2 } from 'lucide-react';
import { UseMutationResult } from '@tanstack/react-query';

type TargetType = 'all' | 'tag' | 'queue' | 'groups' | 'custom';

interface FormData {
  name: string;
  description: string;
  message_content: string;
  message_type: string;
  target_type: TargetType;
  send_interval_seconds: number;
}

const INITIAL_FORM: FormData = {
  name: '', description: '', message_content: '', message_type: 'text',
  target_type: 'all', send_interval_seconds: 5,
};

interface CampaignCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createCampaign: UseMutationResult<any, Error, any, unknown>;
}

export function CampaignCreateDialog({ open, onOpenChange, createCampaign }: CampaignCreateDialogProps) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);

  const handleCreate = useCallback(() => {
    createCampaign.mutate({ ...form, target_type: form.target_type as 'all' | 'custom' | 'queue' | 'tag' }, {
      onSuccess: () => {
        onOpenChange(false);
        setForm(INITIAL_FORM);
      },
    });
  }, [form, createCampaign, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            Nova Campanha
          </DialogTitle>
          <DialogDescription>Configure sua campanha de broadcast</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="campaign-name">Nome da campanha</Label>
            <Input id="campaign-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Black Friday 2024" />
          </div>
          <div>
            <Label htmlFor="campaign-description">Descrição</Label>
            <Input id="campaign-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Breve descrição..." />
          </div>
          <div>
            <Label htmlFor="campaign-message">Mensagem</Label>
            <Textarea id="campaign-message" value={form.message_content} onChange={e => setForm(f => ({ ...f, message_content: e.target.value }))}
              placeholder="Conteúdo da mensagem..." rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="campaign-msg-type">Tipo de mensagem</Label>
              <Select value={form.message_type} onValueChange={v => setForm(f => ({ ...f, message_type: v }))}>
                <SelectTrigger id="campaign-msg-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="campaign-target">Público-alvo</Label>
              <Select value={form.target_type} onValueChange={(v: string) => setForm(f => ({ ...f, target_type: v as TargetType }))}>
                <SelectTrigger id="campaign-target"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os contatos</SelectItem>
                  <SelectItem value="tag">Por etiqueta</SelectItem>
                  <SelectItem value="queue">Por fila</SelectItem>
                  <SelectItem value="groups">Grupos WhatsApp</SelectItem>
                  <SelectItem value="custom">Seleção manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="campaign-interval">Intervalo entre envios (segundos)</Label>
            <Input id="campaign-interval" type="number" value={form.send_interval_seconds}
              onChange={e => setForm(f => ({ ...f, send_interval_seconds: Number(e.target.value) }))}
              min={1} max={60} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!form.name || !form.message_content || createCampaign.isPending}>
            {createCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Criar Campanha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
