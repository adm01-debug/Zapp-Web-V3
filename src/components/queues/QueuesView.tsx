import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Clock, BarChart3, AlertTriangle } from 'lucide-react';
import { useQueues, QueueWithMembers } from '@/hooks/useQueues';
import { useQueueGoals, QueueAlert, QueueGoal } from '@/hooks/useQueueGoals';
import { CreateQueueDialog } from './CreateQueueDialog';
import { AddMemberDialog } from './AddMemberDialog';
import { QueueGoalsDialog } from './QueueGoalsDialog';
import { QueueAlertsDisplay } from './QueueAlertsDisplay';
import { QueueCard } from './QueueCard';

/** Queues View component for the queues section. */
export function QueuesView() {
  const navigate = useNavigate();
  const { queues, loading, createQueue, deleteQueue, addMember, removeMember } = useQueues();
  const { goals } = useQueueGoals();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [goalsDialogOpen, setGoalsDialogOpen] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<QueueWithMembers | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [queueToDelete, setQueueToDelete] = useState<QueueWithMembers | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const alerts = useMemo<QueueAlert[]>(() => {
    const allAlerts: QueueAlert[] = [];
    const goalsByQueue: Record<string, QueueGoal> = {};
    (goals as QueueGoal[]).forEach((g) => { if (g.queue_id) goalsByQueue[g.queue_id] = g; });
    queues.forEach(queue => {
      const queueGoal = goalsByQueue[queue.id];
      if (!queueGoal || !queueGoal.alerts_enabled) return;
      const activeMembers = queue.members.filter(m => m.is_active).length;
      const assignmentRate = queue.waiting_count + activeMembers > 0 ? Math.round((activeMembers / (queue.waiting_count + activeMembers)) * 100) : 100;
      const maxWaiting = queueGoal.max_waiting_contacts ?? 10;
      const minAssign = queueGoal.min_assignment_rate ?? 80;
      if (queue.waiting_count > maxWaiting) {
        const alertKey = `${queue.id}-waiting_contacts`;
        if (!dismissedAlerts.has(alertKey)) allAlerts.push({ type: 'waiting_contacts', queueId: queue.id, queueName: queue.name, queueColor: queue.color, message: `${queue.waiting_count} contatos aguardando atendimento`, severity: queue.waiting_count > maxWaiting * 1.5 ? 'critical' : 'warning', currentValue: queue.waiting_count, threshold: maxWaiting });
      }
      if (assignmentRate < minAssign && queue.waiting_count > 0) {
        const alertKey = `${queue.id}-assignment_rate`;
        if (!dismissedAlerts.has(alertKey)) allAlerts.push({ type: 'assignment_rate', queueId: queue.id, queueName: queue.name, queueColor: queue.color, message: 'Taxa de atribuição abaixo do esperado', severity: assignmentRate < minAssign * 0.5 ? 'critical' : 'warning', currentValue: assignmentRate, threshold: minAssign });
      }
    });
    return allAlerts;
  }, [queues, goals, dismissedAlerts]);

  const getQueueAlertCount = useCallback(
    (queueId: string) => alerts.filter((a) => a.queueId === queueId).length,
    [alerts],
  );

  const handleAddMember = useCallback((q: QueueWithMembers) => {
    setSelectedQueue(q);
    setAddMemberDialogOpen(true);
  }, []);

  const handleRemoveMember = useCallback(
    (queueId: string, profileId: string) => removeMember(queueId, profileId),
    [removeMember],
  );

  const handleSetGoals = useCallback((q: QueueWithMembers) => {
    setSelectedQueue(q);
    setGoalsDialogOpen(true);
  }, []);

  const handleDeleteQueue = useCallback((q: QueueWithMembers) => {
    setQueueToDelete(q);
    setDeleteDialogOpen(true);
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background"><AuroraBorealis /><FloatingParticles />
        <div className="flex items-center justify-between"><div><Skeleton className="h-8 w-64 mb-2" /><Skeleton className="h-4 w-96" /></div><Skeleton className="h-10 w-32" /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{[1,2,3].map(i => <Card key={i} className="border border-secondary/20 bg-card"><CardContent className="space-y-4 p-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>)}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background">
      <AuroraBorealis /><FloatingParticles />
      <PageHeader title="Filas de Atendimento" subtitle="Organize e distribua os atendimentos por departamento"
        breadcrumbs={[{ label: 'Gestão' }, { label: 'Filas' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-border/30 hover:bg-muted/30" onClick={() => navigate('/sla')}><Clock className="w-4 h-4 mr-2" />Dashboard SLA</Button>
            <Button variant="outline" className="border-border/30 hover:bg-muted/30" onClick={() => navigate('/queues/comparison')}><BarChart3 className="w-4 h-4 mr-2" />Comparar Filas</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => setCreateDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Nova Fila</Button>
          </div>
        }
      />

      {alerts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Alertas Ativos ({alerts.length})</h2>
          <QueueAlertsDisplay alerts={alerts} onDismiss={(a) => setDismissedAlerts(prev => new Set([...prev, `${a.queueId}-${a.type}`]))} onNavigate={(queueId) => navigate(`/queue/${queueId}`)} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {queues.map((queue) => (
          <QueueCard key={queue.id} queue={queue} alertCount={getQueueAlertCount(queue.id)}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            onSetGoals={handleSetGoals}
            onDelete={handleDeleteQueue}
          />
        ))}
        <Card role="button" tabIndex={0} aria-label="Adicionar Nova Fila" className="border border-dashed border-border/40 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors bg-transparent" onClick={() => setCreateDialogOpen(true)} onKeyDown={(e) => e.key === 'Enter' && setCreateDialogOpen(true)}>
          <CardContent className="flex flex-col items-center justify-center h-full min-h-[280px] text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3"><Plus className="w-6 h-6" /></div>
            <p className="font-medium">Adicionar Nova Fila</p><p className="text-sm">Clique para criar</p>
          </CardContent>
        </Card>
      </div>

      <CreateQueueDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSubmit={createQueue} />
      {selectedQueue && <AddMemberDialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen} queueId={selectedQueue.id} existingMemberIds={selectedQueue.members.map(m => m.profile_id)} onAddMember={(profileId) => addMember(selectedQueue.id, profileId)} />}
      {selectedQueue && <QueueGoalsDialog open={goalsDialogOpen} onOpenChange={setGoalsDialogOpen} queueId={selectedQueue.id} queueName={selectedQueue.name} queueColor={selectedQueue.color} />}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border/30">
          <AlertDialogHeader><AlertDialogTitle className="text-foreground">Excluir Fila</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir a fila "{queueToDelete?.name}"? Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-muted-foreground">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (queueToDelete) { deleteQueue(queueToDelete.id); setQueueToDelete(null); setDeleteDialogOpen(false); } }} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}