import { queryKeys } from '@/services/api/queryKeys';
import { useState, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
const log = getLogger('InboxScopeConfig');

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Eye,
  Lock,
  Loader2,
  Info,
  Instagram,
  Globe,
  MessageSquare,
  Plus,
  Trash2,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { fetchInboxCustomScopes, createInboxCustomScope, deleteInboxCustomScopeById } from '../hooks/useInboxCustomScopesData';
import type { Json } from '@/integrations/supabase/schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/features/auth';
import { toast } from 'sonner';
import {
  INBOX_PERMISSIONS,
  CHANNEL_PERMISSIONS,
  ROLES,
  NewScopeForm,
} from './InboxScopeConfigParts';

/** Inbox Scope Config component. */
export function InboxScopeConfig() {
  const { permissions, rolePermissions, addPermissionToRole, removePermissionFromRole, loading } =
    usePermissions();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState<string | null>(null);
  const [newScope, setNewScope] = useState({ label: '', description: '', name: '' });
  const [isAddingScope, setIsAddingScope] = useState(false);

  const { data: customScopes = [], isLoading: loadingScopes } = useQuery({
    queryKey: queryKeys.adminOps.inboxScopes(),
    queryFn: fetchInboxCustomScopes,
  });

  const handleAddScope = async () => {
    if (!newScope.label || !newScope.name) {
      toast.error('Preencha o nome e identificador do escopo');
      return;
    }

    setIsAddingScope(true);
    try {
      const { error } = await createInboxCustomScope({
        label: newScope.label,
        name: newScope.name.toLowerCase().replace(/\s+/g, '_'),
        description: newScope.description,
        filter_criteria: {} as Json,
      });

      if (error) throw error;

      toast.success('Escopo personalizado criado!');
      setNewScope({ label: '', description: '', name: '' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.inboxScopes() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.contactDetails.inboxScopes() });
    } catch {
      toast.error('Erro ao criar escopo');
    } finally {
      setIsAddingScope(false);
    }
  };

  const handleDeleteScope = async (id: string) => {
    try {
      const { error } = await deleteInboxCustomScopeById(id);
      if (error) throw error;
      toast.success('Escopo removido');
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.inboxScopes() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.contactDetails.inboxScopes() });
    } catch {
      toast.error('Erro ao remover escopo');
    }
  };

  // Map permission name to ID
  const permissionMap = useMemo(() => {
    return permissions.reduce(
      (acc, p) => {
        acc[p.name] = p.id;
        return acc;
      },
      {} as Record<string, string>
    );
  }, [permissions]);

  const hasPermission = (role: string, permissionName: string): boolean => {
    const permissionId = permissionMap[permissionName];
    if (!permissionId) return false;
    return rolePermissions.some((rp) => rp.role === role && rp.permission_id === permissionId);
  };

  const handleToggle = async (role: string, permissionName: string) => {
    const permissionId = permissionMap[permissionName];
    if (!permissionId) {
      toast.error('Permissão não encontrada no sistema');
      return;
    }

    const key = `${role}-${permissionName}`;
    setUpdating(key);

    try {
      const active = hasPermission(role, permissionName);
      if (active) {
        await removePermissionFromRole(role, permissionId);
        toast.success(`Permissão ${permissionName} removida de ${role}`);
      } else {
        await addPermissionToRole(role, permissionId);
        toast.success(`Permissão ${permissionName} adicionada a ${role}`);
      }
    } catch (err) {
      log.error('InboxScopeConfig error', err);
      toast.error('Falha ao atualizar permissão');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-whatsapp/20 bg-whatsapp/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-whatsapp/10 text-whatsapp">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Configuração de Escopo da Inbox</CardTitle>
              <CardDescription>
                Defina quais níveis de visualização cada perfil de usuário pode acessar na Caixa de
                Entrada
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/50 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-info" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              As alterações aqui são aplicadas em tempo real. Usuários <strong>Agentes</strong> por
              padrão devem ver apenas "Meus". Supervisores geralmente veem "Departamento" e
              Administradores veem "Todos".
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
        {ROLES.map((role) => (
          <Card
            key={role.id}
            className="overflow-hidden border-border/50 shadow-sm transition-all hover:shadow-md"
          >
            <CardHeader className="bg-muted/30 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className={`text-base font-bold ${role.color}`}>{role.label}</CardTitle>
                <div className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Role: {role.id}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-4">
                <div className="border-b pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  Permissões de Escopo
                </div>
                {INBOX_PERMISSIONS.map((perm) => {
                  const isActive = hasPermission(role.id, perm.id);
                  const isUpdating = updating === `${role.id}-${perm.id}`;
                  const isDisabled = role.id === 'admin' || isUpdating;

                  return (
                    <div
                      key={perm.id}
                      className="flex items-start justify-between gap-4 rounded-lg p-2 transition-all hover:bg-muted/20"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <Eye className="h-3 w-3 text-whatsapp" />
                          ) : (
                            <Lock className="h-3 w-3 text-muted-foreground/50" />
                          )}
                          <Label className="cursor-pointer text-xs font-bold">{perm.label}</Label>
                        </div>
                      </div>
                      <div className="flex items-center">
                        {isUpdating ? (
                          <Loader2 className="h-3 w-3 animate-spin text-whatsapp" />
                        ) : (
                          <Switch
                            checked={isActive}
                            onCheckedChange={() => handleToggle(role.id, perm.id)}
                            disabled={isDisabled}
                            className="h-4 w-7 data-[state=checked]:bg-whatsapp"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="border-b pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  Visibilidade de Canais
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CHANNEL_PERMISSIONS.map((chan) => {
                    const isActive = hasPermission(role.id, chan.id);
                    const isUpdating = updating === `${role.id}-${chan.id}`;
                    const isDisabled = role.id === 'admin' || isUpdating;
                    const Icon =
                      chan.icon === 'Instagram'
                        ? Instagram
                        : chan.icon === 'Globe'
                          ? Globe
                          : MessageSquare;

                    return (
                      <div
                        key={chan.id}
                        className="flex items-center justify-between rounded-lg border border-border/10 bg-background/40 p-2"
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            className={cn(
                              'h-3 w-3',
                              isActive ? 'text-primary' : 'text-muted-foreground/40'
                            )}
                          />
                          <span className="text-[10px] font-medium">{chan.label}</span>
                        </div>
                        {isUpdating ? (
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        ) : (
                          <Switch
                            checked={isActive}
                            onCheckedChange={() => handleToggle(role.id, chan.id)}
                            disabled={isDisabled}
                            className="h-3 w-6 data-[state=checked]:bg-primary"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {role.id === 'admin' && (
                <div className="mt-2 rounded bg-muted/50 py-1 text-center text-[10px] text-muted-foreground">
                  Administradores possuem acesso total por padrão
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Escopos Personalizados</CardTitle>
                <CardDescription>
                  Crie novos filtros de visualização sem precisar alterar o código
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setIsAddingScope(!isAddingScope)}
              className="hover:bg-primary-dark bg-primary"
            >
              {isAddingScope ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {isAddingScope ? 'Cancelar' : 'Novo Escopo'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isAddingScope && (
            <NewScopeForm
              newScope={newScope}
              isSubmitting={isAddingScope}
              onChangeScope={setNewScope}
              onDiscard={() => setIsAddingScope(false)}
              onSubmit={handleAddScope}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loadingScopes ? (
              <div className="col-span-full py-8 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              </div>
            ) : customScopes.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-border/50 bg-muted/20 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum escopo personalizado definido ainda.
                </p>
              </div>
            ) : (
              customScopes.map((scope) => (
                <div
                  key={scope.id}
                  className="group relative rounded-xl border bg-background/50 p-3 transition-all hover:bg-background"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-sm font-bold">
                        <Settings2 className="h-3.5 w-3.5 text-primary" />
                        {scope.label}
                      </div>
                      <p className="line-clamp-2 text-[10px] text-muted-foreground">
                        {scope.description || 'Sem descrição'}
                      </p>
                      <div className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[8px] uppercase">
                        ID: {scope.name}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteScope(scope.id)}
                      className="h-7 w-7 rounded-lg text-destructive opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
                      aria-label="Excluir escopo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}