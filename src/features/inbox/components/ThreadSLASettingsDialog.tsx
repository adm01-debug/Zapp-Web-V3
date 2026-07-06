import { useState } from 'react';
import { getLogger } from '@/lib/logger';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ShieldAlert, AlertTriangle, Save, Loader2 } from 'lucide-react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from 'sonner';

const log = getLogger('ThreadSLASettingsDialog');

interface ThreadSLASettingsDialogProps {
  threadId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: {
    sla_warning_threshold_minutes: number;
    sla_critical_threshold_minutes: number;
    sla_notification_message: string;
    sla_enabled: boolean;
  };
  onSuccess?: () => void;
}

export function ThreadSLASettingsDialog({
  threadId,
  isOpen,
  onOpenChange,
  initialData,
  onSuccess
}: ThreadSLASettingsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    sla_warning_threshold_minutes: initialData?.sla_warning_threshold_minutes ?? 30,
    sla_critical_threshold_minutes: initialData?.sla_critical_threshold_minutes ?? 60,
    sla_notification_message: initialData?.sla_notification_message ?? '',
    sla_enabled: initialData?.sla_enabled ?? true,
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await safeClient.from('conversation_threads', (q) => q.update({
        sla_warning_threshold_minutes: formData.sla_warning_threshold_minutes,
        sla_critical_threshold_minutes: formData.sla_critical_threshold_minutes,
        sla_notification_message: formData.sla_notification_message,
        sla_enabled: formData.sla_enabled,
      }).eq('id', threadId));

      if (error) throw error;

      toast.success('Configurações de SLA atualizadas para esta conversa.');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      log.error('Error updating SLA settings', error);
      toast.error('Erro ao salvar configurações de SLA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-foreground border-border shadow-none">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <DialogTitle>SLA da Conversa</DialogTitle>
          </div>
          <DialogDescription>
            Ajuste os thresholds de alerta e a mensagem de notificação específica para este contato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="sla-enabled" className="text-sm font-medium">SLA Ativo</Label>
            <Switch
              id="sla-enabled"
              checked={formData.sla_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, sla_enabled: checked })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="warning-threshold" className="text-xs flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-warning-foreground" />
                Risco (min)
              </Label>
              <Input
                id="warning-threshold"
                type="number"
                value={formData.sla_warning_threshold_minutes}
                onChange={(e) => setFormData({ ...formData, sla_warning_threshold_minutes: parseInt(e.target.value) || 0 })}
                disabled={!formData.sla_enabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="critical-threshold" className="text-xs flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-destructive-foreground" />
                Violação (min)
              </Label>
              <Input
                id="critical-threshold"
                type="number"
                value={formData.sla_critical_threshold_minutes}
                onChange={(e) => setFormData({ ...formData, sla_critical_threshold_minutes: parseInt(e.target.value) || 0 })}
                disabled={!formData.sla_enabled}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sla-message" className="text-sm font-medium">Mensagem de Notificação</Label>
            <Textarea
              id="sla-message"
              placeholder="Mensagem para alertas desta conversa..."
              value={formData.sla_notification_message}
              onChange={(e) => setFormData({ ...formData, sla_notification_message: e.target.value })}
              disabled={!formData.sla_enabled}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
