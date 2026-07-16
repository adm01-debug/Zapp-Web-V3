import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ConfigurePermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigurePermissionsDialog({
  open,
  onOpenChange,
}: ConfigurePermissionsDialogProps) {
  const { data: roles = [], isLoading } = useQuery({
    queryKey: queryKeys.adminOps.userRoles(),
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('id, user_id, role');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: permissions = [] } = useQuery({
    queryKey: queryKeys.userProfile.permissionsList(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissions')
        .select('id, name, description, category');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: queryKeys.userProfile.forPermissions(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-destructive/10 text-destructive border-destructive/30',
      supervisor: 'bg-warning/10 text-warning border-warning/30',
      agent: 'bg-primary/10 text-primary border-primary/30',
    };
    const labels: Record<string, string> = {
      admin: 'Admin',
      supervisor: 'Supervisor',
      agent: 'Agente',
    };
    return (
      <Badge variant="outline" className={colors[role] || ''}>
        {labels[role] || role}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Permissões da Equipe
          </DialogTitle>
          <DialogDescription>
            Visão geral dos cargos e permissões dos membros da equipe
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-3">
              {profiles.map((profile) => {
                const userRoles = roles.filter((r) => r.user_id === profile.id);
                return (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{profile.name}</p>
                        <p className="text-xs text-muted-foreground">{profile.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {userRoles.length > 0
                        ? userRoles.map((r) => <span key={r.id}>{getRoleBadge(r.role)}</span>)
                        : getRoleBadge(profile.role || 'agent')}
                    </div>
                  </div>
                );
              })}

              {profiles.length === 0 && (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="mx-auto mb-3 h-12 w-12 opacity-50" />
                  <p>Nenhum membro encontrado</p>
                </div>
              )}
            </div>

            {permissions.length > 0 && (
              <div className="mt-6">
                <h4 className="mb-3 text-sm font-medium">Permissões Disponíveis</h4>
                <div className="grid grid-cols-2 gap-2">
                  {permissions.map((perm) => (
                    <div key={perm.id} className="rounded border border-border/30 p-2 text-xs">
                      <p className="font-medium">{perm.name}</p>
                      {perm.description && (
                        <p className="mt-0.5 text-muted-foreground">{perm.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
