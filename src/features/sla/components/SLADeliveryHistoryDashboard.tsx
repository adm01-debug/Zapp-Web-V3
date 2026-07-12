import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Search, Filter, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface SLADeliveryViolation {
  id: string;
  contact_id: string;
  message_id: string;
  detected_at: string;
  delivered_at: string;
  severity: string;
  is_resolved: boolean;
  resolved_by_profile?: { display_name: string | null } | null;
}

export const SLADeliveryHistoryDashboard = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: violations, isLoading } = useQuery({
    queryKey: ['sla-delivery-violations', statusFilter],
    queryFn: async () => {
      const { data, error } = await safeClient.from<SLADeliveryViolation>('sla_delivery_violations', (q) => {
        let query = q
          .select('*, resolved_by_profile:profiles!resolved_by(display_name)')
          .order('detected_at', { ascending: false });
        if (statusFilter === 'pending') query = query.eq('is_resolved', false);
        else if (statusFilter === 'resolved') query = query.eq('is_resolved', true);
        return query;
      });
      if (error) throw error;
      return data;
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await safeClient.from('sla_delivery_violations', (q) =>
        q
          .update({
            is_resolved: true,
            resolved_at: new Date().toISOString(),
            resolved_by: user?.id,
            resolution_notes: notes,
          })
          .eq('id', id)
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Alerta marcado como resolvido');
      queryClient.invalidateQueries({ queryKey: ['sla-delivery-violations'] });
    },
  });

  const filteredViolations = violations?.filter(
    (v) =>
      v.contact_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.message_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Histórico de Alertas de Entrega</h2>
          <p className="text-muted-foreground">
            Monitore e resolva atrasos na leitura de mensagens.
          </p>
        </div>
      </header>

      <div className="flex items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por Contato ID ou Mensagem ID..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4 opacity-50" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="resolved">Resolvidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Detectado em</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Gravidade</TableHead>
              <TableHead>Atraso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary opacity-20" />
                </TableCell>
              </TableRow>
            ) : filteredViolations?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhuma violação encontrada
                </TableCell>
              </TableRow>
            ) : (
              filteredViolations?.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="text-xs font-medium">
                    {format(new Date(v.detected_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-xs opacity-70">{v.contact_id}</TableCell>
                  <TableCell>
                    <Badge
                      variant={v.severity === 'breached' ? 'destructive' : 'warning'}
                      className="text-[10px] font-bold uppercase"
                    >
                      {v.severity === 'breached' ? 'Violado' : 'Risco'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {Math.round(
                      (new Date(v.detected_at).getTime() - new Date(v.delivered_at).getTime()) /
                        60000
                    )}{' '}
                    min
                  </TableCell>
                  <TableCell>
                    {v.is_resolved ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          Resolvido
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          por {v.resolved_by_profile?.display_name || 'Agente'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-warning">
                        <Clock className="h-3 w-3" />
                        Pendente
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!v.is_resolved && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        onClick={() =>
                          resolveMutation.mutate({
                            id: v.id,
                            notes: 'Resolvido via painel de histórico',
                          })
                        }
                        disabled={resolveMutation.isPending}
                      >
                        Resolver
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
