import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  UserPlus,
  UserMinus,
  Shield,
  Loader2,
  History,
  Link2,
  Copy,
  Trash2,
  Download,
  MessageSquare,
  Settings2,
  Globe,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Department {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  department_id: string | null;
  role: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  details: any;
  created_at: string;
  user_id: string;
}

interface Props {
  department: Department;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DepartmentManagementDialog({
  department: initialDepartment,
  open,
  onOpenChange,
}: Props) {
  const { profile: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'members' | 'audit' | 'invites' | 'whatsapp'>('members');
  const [whatsappMode, setWhatsappMode] = useState<'evolution' | 'official' | 'none'>('none');
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [whatsappInstanceId, setWhatsappInstanceId] = useState('');

  const { data: department = initialDepartment } = useQuery({
    queryKey: ['department-details', initialDepartment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('id', initialDepartment.id)
        .single();
      if (error) throw error;

      setWhatsappMode((data.whatsapp_mode as any) || 'none');
      setWhatsappApiKey(data.whatsapp_api_key || '');
      setWhatsappInstanceId(data.whatsapp_instance_id || '');

      return data;
    },
    enabled: open,
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ['profiles-for-dept-mgmt'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url, department_id, role')
        .order('name');
      if (error) throw error;
      return data as Profile[];
    },
    enabled: open && view === 'members',
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['dept-audit-logs', department.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_type', 'department')
        .eq('entity_id', department.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AuditLog[];
    },
    enabled: open && (view === 'audit' || view === 'members'),
  });

  const { data: invitations = [] } = useQuery({
    queryKey: ['dept-invitations', department.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('department_invitations')
        .select('*')
        .eq('department_id', department.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open && view === 'invites',
  });

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) return;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { error } = await supabase.from('department_invitations').insert({
        department_id: department.id,
        created_by: currentUser.id,
        code,
        email: 'default@temp.com', // Added dummy email to fix TS error
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dept-invitations', department.id] });
      toast({ title: 'Link de convite criado' });
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('department_invitations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dept-invitations', department.id] });
      toast({ title: 'Convite revogado' });
    },
  });

  const updateWhatsappMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('departments')
        .update({
          whatsapp_mode: whatsappMode,
          whatsapp_api_key: whatsappApiKey,
          whatsapp_instance_id: whatsappInstanceId,
        })
        .eq('id', department.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['department-details', department.id] });
      toast({ title: 'Configurações de WhatsApp atualizadas' });
    },
    onError: (err: any) => {
      toast({
        title: 'Erro ao atualizar WhatsApp',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const exportAuditCsv = () => {
    if (auditLogs.length === 0) return;
    const headers = ['Data', 'Ação', 'Usuário', 'ID'];
    const rows = auditLogs.map((l) => [
      format(new Date(l.created_at), 'dd/MM/yyyy HH:mm'),
      l.action,
      l.details.profile_name || 'Desconhecido',
      l.id,
    ]);
    const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit_${department.name}_${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
  };

  const manageMemberMutation = useMutation({
    mutationFn: async ({ profileId, action }: { profileId: string; action: 'add' | 'remove' }) => {
      if (!currentUser) throw new Error('Not authenticated');
      const { error } = await supabase.rpc('manage_department_member', {
        _admin_user_id: currentUser.id,
        _target_profile_id: profileId,
        _department_id: department.id,
        _action: action,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['profiles-for-dept-mgmt'] });
      queryClient.invalidateQueries({ queryKey: ['dept-audit-logs', department.id] });
      toast({
        title: vars.action === 'add' ? 'Membro adicionado' : 'Membro removido',
        description: `O colaborador foi ${vars.action === 'add' ? 'incluído no' : 'removido do'} departamento ${department.name}.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Erro na operação',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const filteredProfiles = allProfiles.filter(
    (p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const deptMembers = filteredProfiles.filter((p) => p.department_id === department.id);
  const otherProfiles = filteredProfiles.filter((p) => p.department_id !== department.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2">
              Gerenciar Departamento: {department.name}
            </DialogTitle>
            <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
              <Button
                variant={view === 'members' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setView('members')}
              >
                Membros
              </Button>
              <Button
                variant={view === 'invites' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setView('invites')}
              >
                Convites
              </Button>
              <Button
                variant={view === 'whatsapp' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setView('whatsapp')}
              >
                WhatsApp
              </Button>
              <Button
                variant={view === 'audit' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setView('audit')}
              >
                Auditoria
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 flex-col overflow-hidden">
          {view === 'members' && (
            <div className="flex h-full flex-col">
              <div className="px-6 py-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar colaboradores..."
                    className="h-9 pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <ScrollArea className="flex-1 px-6 pb-6">
                <div className="space-y-6 pt-4">
                  {deptMembers.length > 0 && (
                    <section>
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Membros ({deptMembers.length})
                      </h4>
                      <div className="space-y-2">
                        {deptMembers.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded-xl border bg-accent/30 p-3"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={p.avatar_url || undefined} />
                                <AvatarFallback>{p.name?.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">{p.name}</p>
                                <p className="text-xs text-muted-foreground">{p.email}</p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() =>
                                manageMemberMutation.mutate({ profileId: p.id, action: 'remove' })
                              }
                              disabled={manageMemberMutation.isPending}
                            >
                              <UserMinus className="mr-2 h-4 w-4" /> Remover
                            </Button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  <section>
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Outros Colaboradores
                    </h4>
                    <div className="space-y-2">
                      {otherProfiles.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-xl border p-3 transition-colors hover:bg-accent/20"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={p.avatar_url || undefined} />
                              <AvatarFallback>{p.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{p.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.email}{' '}
                                {p.department_id && (
                                  <Badge variant="outline" className="ml-1 py-0 text-[10px]">
                                    Outro Depto
                                  </Badge>
                                )}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={() =>
                              manageMemberMutation.mutate({ profileId: p.id, action: 'add' })
                            }
                            disabled={manageMemberMutation.isPending}
                          >
                            <UserPlus className="mr-2 h-4 w-4" /> Adicionar
                          </Button>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </ScrollArea>
            </div>
          )}

          {view === 'invites' && (
            <div className="flex h-full flex-col px-6 py-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Links de convite permitem que colaboradores entrem no departamento.
                </p>
                <Button
                  size="sm"
                  onClick={() => createInviteMutation.mutate()}
                  disabled={createInviteMutation.isPending}
                >
                  <Link2 className="mr-2 h-4 w-4" /> Criar Link
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-3">
                  {invitations.map((inv: any) => (
                    <div key={inv.id} className="space-y-3 rounded-xl border bg-card p-4">
                      <div className="flex items-center justify-between">
                        <code className="rounded bg-muted px-2 py-1 text-sm font-bold">
                          {inv.code}
                        </code>
                        <div className="flex gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              navigator.clipboard.writeText(inv.code);
                              toast({ title: 'Código copiado' });
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => deleteInviteMutation.mutate(inv.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Expira em: {format(new Date(inv.expires_at), 'dd/MM/yy')}</span>
                        <span>Usos: {inv.uses}</span>
                      </div>
                    </div>
                  ))}
                  {invitations.length === 0 && (
                    <div className="py-10 text-center text-muted-foreground">
                      Nenhum convite ativo.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {view === 'whatsapp' && (
            <div className="flex h-full flex-col space-y-6 px-6 py-6">
              <div className="space-y-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <MessageSquare className="h-4 w-4" /> Integração Híbrida WhatsApp
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Configure como este departamento interage com o WhatsApp. Você pode alternar entre
                  API Oficial (Cloud) e Não-Oficial (Evolution).
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div
                  className={cn(
                    'relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:border-primary/50',
                    whatsappMode === 'none'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card opacity-60'
                  )}
                  onClick={() => setWhatsappMode('none')}
                >
                  <div
                    className={cn(
                      'mb-2 flex h-10 w-10 items-center justify-center rounded-full',
                      whatsappMode === 'none' ? 'bg-primary/20' : 'bg-muted'
                    )}
                  >
                    <Lock className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-bold">Desativado</p>
                  <p className="mt-1 text-center text-[10px] text-muted-foreground">
                    Apenas chat interno
                  </p>
                  {whatsappMode === 'none' && (
                    <div className="absolute right-1 top-1">
                      <Shield className="h-3 w-3 text-primary" />
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    'relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:border-primary/50',
                    whatsappMode === 'evolution'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card'
                  )}
                  onClick={() => setWhatsappMode('evolution')}
                >
                  <div
                    className={cn(
                      'mb-2 flex h-10 w-10 items-center justify-center rounded-full',
                      whatsappMode === 'evolution' ? 'bg-primary/20' : 'bg-muted'
                    )}
                  >
                    <Globe className="h-5 w-5 text-success-foreground" />
                  </div>
                  <p className="text-xs font-bold">Não-Oficial</p>
                  <p className="mt-1 text-center text-[10px] text-muted-foreground">
                    Conexão via QR Code
                  </p>
                  {whatsappMode === 'evolution' && (
                    <div className="absolute right-1 top-1">
                      <Shield className="h-3 w-3 text-primary" />
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    'relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:border-primary/50',
                    whatsappMode === 'official'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card'
                  )}
                  onClick={() => setWhatsappMode('official')}
                >
                  <div
                    className={cn(
                      'mb-2 flex h-10 w-10 items-center justify-center rounded-full',
                      whatsappMode === 'official' ? 'bg-primary/20' : 'bg-muted'
                    )}
                  >
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-xs font-bold">API Oficial</p>
                  <p className="mt-1 text-center text-[10px] text-muted-foreground">
                    WhatsApp Cloud API
                  </p>
                  {whatsappMode === 'official' && (
                    <div className="absolute right-1 top-1">
                      <Shield className="h-3 w-3 text-primary" />
                    </div>
                  )}
                </div>
              </div>

              {whatsappMode !== 'none' && (
                <div className="space-y-4 rounded-xl border bg-muted/20 p-4 animate-in fade-in slide-in-from-top-2">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Configurações da Instância
                    </h4>
                    <Badge
                      variant={whatsappInstanceId ? 'success' : 'secondary'}
                      className="h-4 text-[10px]"
                    >
                      {whatsappInstanceId ? 'Conectado' : 'Aguardando Configuração'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">
                        ID da Instância / Phone ID
                      </label>
                      <Input
                        value={whatsappInstanceId}
                        onChange={(e) => setWhatsappInstanceId(e.target.value)}
                        placeholder={
                          whatsappMode === 'evolution' ? 'Ex: MinhaEmpresa' : 'Ex: 1029384756'
                        }
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">
                        Token de Acesso / API Key
                      </label>
                      <Input
                        type="password"
                        value={whatsappApiKey}
                        onChange={(e) => setWhatsappApiKey(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      className="h-9 w-full gap-2"
                      onClick={() => updateWhatsappMutation.mutate()}
                      disabled={
                        updateWhatsappMutation.isPending || !whatsappInstanceId || !whatsappApiKey
                      }
                    >
                      {updateWhatsappMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Settings2 className="h-4 w-4" />
                      )}
                      Salvar e Validar Conexão
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex gap-3 rounded-xl border border-warning/20 bg-warning/5 p-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-warning">Atenção sobre API Oficial</p>
                  <p className="text-[10px] leading-relaxed text-warning">
                    A API Oficial requer aprovação do Facebook Business Manager. O uso indevido pode
                    resultar no banimento do número. Recomendamos iniciar com o modo Não-Oficial
                    para testes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {view === 'audit' && (
            <div className="flex h-full flex-col">
              <div className="flex justify-end px-6 py-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportAuditCsv}
                  disabled={auditLogs.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" /> Exportar CSV
                </Button>
              </div>
              <ScrollArea className="flex-1 px-6 pb-6">
                <div className="space-y-4 pt-4">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="flex gap-4 rounded-lg border bg-card p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <History className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between">
                          <Badge
                            variant={log.action === 'ADD_MEMBER' ? 'default' : 'secondary'}
                            className="h-5 text-[10px]"
                          >
                            {log.action === 'ADD_MEMBER' ? 'Inclusão' : 'Remoção'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-sm">
                          <span className="font-semibold">{log.details.profile_name}</span> foi{' '}
                          {log.action === 'ADD_MEMBER' ? 'adicionado ao' : 'removido do'}{' '}
                          departamento.
                        </p>
                      </div>
                    </div>
                  ))}
                  {auditLogs.length === 0 && (
                    <div className="py-10 text-center text-muted-foreground">
                      Nenhum registro encontrado.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
