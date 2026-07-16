import { useState } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Calendar, Clock, FileText, Mail, Plus, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  performance: 'Performance',
  satisfaction: 'Satisfação',
  sla: 'Métricas SLA',
  conversations: 'Conversas',
  agents: 'Agentes',
  full: 'Completo',
};

export function ScheduledReportsManager() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('performance');
  const [formFrequency, setFormFrequency] = useState('weekly');
  const [formRecipients, setFormRecipients] = useState('');

  const { data: configs = [], isLoading } = useQuery({
    queryKey: queryKeys.scheduledReports.configs(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_report_configs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createConfig = useMutation({
    mutationFn: async () => {
      const recipients = formRecipients
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      const { error } = await supabase.from('scheduled_report_configs').insert({
        name: formName,
        report_type: formType,
        frequency: formFrequency,
        recipients,
        created_by: profile?.id,
        is_active: true,
        config: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledReports.configs() });
      toast.success('Relatório agendado criado!');
      setShowCreate(false);
      resetForm();
    },
    onError: () => toast.error('Erro ao criar relatório'),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('scheduled_report_configs')
        .update({ is_active: !isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledReports.configs() });
      toast.success('Status atualizado');
    },
    onError: () => toast.error('Erro ao atualizar status'),
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduled_report_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledReports.configs() });
      toast.success('Relatório removido');
    },
    onError: () => toast.error('Erro ao remover relatório'),
  });

  const resetForm = () => {
    setFormName('');
    setFormType('performance');
    setFormFrequency('weekly');
    setFormRecipients('');
  };

  if (isLoading) {
    return (
      <Card className="border border-border/60">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Relatórios Agendados
              </CardTitle>
              <CardDescription>Configure relatórios automáticos enviados por email</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Relatório
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm font-medium">Nenhum relatório agendado</p>
              <p className="mt-1 text-xs">Crie relatórios automáticos para receber por email</p>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className={cn(
                    'flex items-center justify-between rounded-xl border p-4 transition-all',
                    config.is_active
                      ? 'border-border/60 bg-card hover:border-primary/30'
                      : 'border-border/30 bg-muted/30 opacity-60'
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                        config.is_active
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{config.name}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <Badge variant="outline" className="px-1.5 text-[10px]">
                          {REPORT_TYPE_LABELS[config.report_type] || config.report_type}
                        </Badge>
                        <Badge variant="secondary" className="px-1.5 text-[10px]">
                          <Clock className="mr-1 h-3 w-3" />
                          {FREQUENCY_LABELS[config.frequency] || config.frequency}
                        </Badge>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {config.recipients?.length || 0} destinatários
                        </span>
                      </div>
                      {config.last_sent_at && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Último envio:{' '}
                          {formatDistanceToNow(new Date(config.last_sent_at), {
                            locale: ptBR,
                            addSuffix: true,
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <Switch
                      checked={config.is_active}
                      onCheckedChange={() =>
                        toggleActive.mutate({ id: config.id, isActive: config.is_active })
                      }
                    />
                    <Button
                      aria-label="Excluir relatório agendado"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteConfig.mutate(config.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Relatório Agendado</DialogTitle>
            <DialogDescription>Configure um relatório para envio automático</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome do relatório</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Relatório semanal de performance"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REPORT_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Select value={formFrequency} onValueChange={setFormFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Destinatários (emails separados por vírgula)</Label>
              <Input
                value={formRecipients}
                onChange={(e) => setFormRecipients(e.target.value)}
                placeholder="email1@empresa.com, email2@empresa.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => createConfig.mutate()}
              disabled={!formName || !formRecipients || createConfig.isPending}
            >
              {createConfig.isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Criar Relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
