import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Clock, MessageSquare, Save, Loader2, Beaker } from 'lucide-react';
import { toast } from 'sonner';

interface SLADeliveryConfigSectionProps {
  contactId: string;
}

export function SLADeliveryConfigSection({ contactId }: SLADeliveryConfigSectionProps) {
  const queryClient = useQueryClient();
  const [warningThreshold, setWarningThreshold] = useState<number>(30);
  const [breachThreshold, setBreachThreshold] = useState<number>(60);
  const [customMessage, setCustomMessage] = useState<string>('');

  const { data: config, isLoading } = useQuery({
    queryKey: ['sla-delivery-config', contactId],
    queryFn: async () => {
      const { data: rows, error } = await safeClient.from('sla_delivery_rules', (q) =>
        q.select('*').eq('contact_id', contactId).limit(1)
      );
      if (error) throw error;
      return rows?.[0] ?? null;
    },
  });

  useEffect(() => {
    if (config) {
      setWarningThreshold(config.warning_threshold_minutes);
      setBreachThreshold(config.breach_threshold_minutes);
      setCustomMessage(config.custom_message || '');
    }
  }, [config]);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        contact_id: contactId,
        name: `Custom SLA - ${contactId}`,
        warning_threshold_minutes: warningThreshold,
        breach_threshold_minutes: breachThreshold,
        custom_message: customMessage,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (config?.id) {
        const { error } = await safeClient.from('sla_delivery_rules', (q) =>
          q.update(payload).eq('id', config.id)
        );
        if (error) throw error;
      } else {
        const { error } = await safeClient.from('sla_delivery_rules', (q) => q.insert(payload));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Configurações de SLA salvas');
      queryClient.invalidateQueries({ queryKey: ['sla-delivery-config', contactId] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  if (isLoading)
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );

  return (
    <Card className="space-y-4 border-dashed bg-background/40 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Thresholds de Entrega (min)
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="warning" className="text-[10px]">
            Risco (Amarelo)
          </Label>
          <Input
            id="warning"
            type="number"
            value={warningThreshold}
            onChange={(e) => setWarningThreshold(Number(e.target.value))}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="breach" className="text-[10px]">
            Violado (Vermelho)
          </Label>
          <Input
            id="breach"
            type="number"
            value={breachThreshold}
            onChange={(e) => setBreachThreshold(Number(e.target.value))}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          Mensagem Customizada
        </div>
        <Textarea
          placeholder="Mensagem exibida no alerta..."
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          className="min-h-[60px] resize-none text-xs"
        />
      </div>

      <Button
        className="h-8 w-full text-xs"
        size="sm"
        onClick={() => upsertMutation.mutate()}
        disabled={upsertMutation.isPending}
      >
        {upsertMutation.isPending ? (
          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
        ) : (
          <Save className="mr-2 h-3 w-3" />
        )}
        Salvar Configuração
      </Button>

      <div className="border-t border-border/40 pt-2">
        <Button
          variant="outline"
          className="h-8 w-full border-dashed text-[10px] text-primary hover:bg-primary/5"
          size="sm"
          onClick={() => {
            const current = localStorage.getItem('zappweb:sla-simulation') === 'true';
            localStorage.setItem('zappweb:sla-simulation', String(!current));
            toast.info(`Modo Simulação ${!current ? 'ATIVADO' : 'DESATIVADO'}`);
            queryClient.invalidateQueries({ queryKey: ['delivery-stats'] });
          }}
        >
          <Beaker className="mr-2 h-3 w-3" />
          {localStorage.getItem('zappweb:sla-simulation') === 'true'
            ? 'Desativar Simulação'
            : 'Testar com Dados Mock'}
        </Button>
        <p className="mt-1 text-center text-[9px] italic text-muted-foreground">
          Use para testar gráficos e alertas sem dados reais.
        </p>
      </div>
    </Card>
  );
}
