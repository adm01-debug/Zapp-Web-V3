import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
      const { data, error } = await supabase
        .from('sla_delivery_rules')
        .select('*')
        .eq('contact_id', contactId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    }
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
        updated_at: new Date().toISOString()
      };

      if (config?.id) {
        const { error } = await supabase
          .from('sla_delivery_rules')
          .update(payload)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sla_delivery_rules')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Configurações de SLA salvas');
      queryClient.invalidateQueries({ queryKey: ['sla-delivery-config', contactId] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    }
  });

  if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin" /></div>;

  return (
    <Card className="p-4 border-dashed bg-background/40 space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <Clock className="w-3.5 h-3.5" />
        Thresholds de Entrega (min)
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="warning" className="text-[10px]">Risco (Amarelo)</Label>
          <Input 
            id="warning" 
            type="number" 
            value={warningThreshold} 
            onChange={(e) => setWarningThreshold(Number(e.target.value))}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="breach" className="text-[10px]">Violado (Vermelho)</Label>
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
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <MessageSquare className="w-3.5 h-3.5" />
          Mensagem Customizada
        </div>
        <Textarea 
          placeholder="Mensagem exibida no alerta..."
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          className="text-xs min-h-[60px] resize-none"
        />
      </div>

      <Button 
        className="w-full h-8 text-xs" 
        size="sm" 
        onClick={() => upsertMutation.mutate()}
        disabled={upsertMutation.isPending}
      >
        {upsertMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Save className="w-3 h-3 mr-2" />}
        Salvar Configuração
      </Button>

      <div className="pt-2 border-t border-border/40">
        <Button 
          variant="outline" 
          className="w-full h-8 text-[10px] border-dashed text-primary hover:bg-primary/5" 
          size="sm"
          onClick={() => {
            const current = localStorage.getItem('zappweb:sla-simulation') === 'true';
            localStorage.setItem('zappweb:sla-simulation', String(!current));
            toast.info(`Modo Simulação ${!current ? 'ATIVADO' : 'DESATIVADO'}`);
            queryClient.invalidateQueries({ queryKey: ['delivery-stats'] });
          }}
        >
          <Beaker className="w-3 h-3 mr-2" />
          {localStorage.getItem('zappweb:sla-simulation') === 'true' ? 'Desativar Simulação' : 'Testar com Dados Mock'}
        </Button>
        <p className="text-[9px] text-muted-foreground mt-1 text-center italic">Use para testar gráficos e alertas sem dados reais.</p>
      </div>
    </Card>
  );
}
