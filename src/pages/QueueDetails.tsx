import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, AlertCircle, Settings } from 'lucide-react';
import { QueueCharts } from '@/components/queues/QueueCharts';
import { QueueMetricsCards } from './queue-details/QueueMetricsCards';
import { QueueContactsTable } from './queue-details/QueueContactsTable';
import { useQueueDetails } from '@/hooks/useQueueDetails';

/** Queue Details. */
export default function QueueDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { queue, members, contacts, metrics, loading } = useQueueDetails(user ? id : undefined);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen space-y-6 bg-background p-6">
        <AuroraBorealis />
        <FloatingParticles />
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-xl font-semibold text-foreground">Fila não encontrada</h2>
          <Button onClick={() => navigate('/')}>Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AuroraBorealis />
      <FloatingParticles />
      <PageHeader
        title={queue.name}
        subtitle={queue.description || undefined}
        showBack
        onBack={() => navigate('/')}
        breadcrumbs={[
          { label: 'Filas', onClick: () => navigate('/'), href: '/' },
          { label: queue.name },
        ]}
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurar
          </Button>
        }
      />
      <div className="space-y-6 p-6">
        {metrics && <QueueMetricsCards metrics={metrics} />}
        {queue && <QueueCharts queueId={queue.id} queueColor={queue.color} />}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Equipe ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {members.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nenhum atendente nesta fila
                    </p>
                  ) : (
                    members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/20"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            src={member.profile?.avatar_url || undefined}
                            alt={member.profile?.name || ''}
                          />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {member.profile?.name?.[0] || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">
                            {member.profile?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.profile?.is_active ? 'Ativo' : 'Inativo'}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            member.profile?.is_active ? 'bg-success/10 text-success' : 'bg-muted/30'
                          }
                        >
                          {member.profile?.is_active ? 'Online' : 'Offline'}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          <QueueContactsTable contacts={contacts} />
        </div>
      </div>
    </div>
  );
}
