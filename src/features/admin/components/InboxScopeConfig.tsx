import { useState, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
const log = getLogger('InboxScopeConfig');

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Eye, Lock, Loader2, Info, Instagram, Globe, MessageSquare, Plus, Trash2, Settings2, Sparkles, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/features/auth';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const INBOX_PERMISSIONS = [
  { id: 'inbox.view_mine', label: 'Meus (Apenas as próprias)', description: 'O usuário vê apenas as conversas atribuídas a ele.' },
  { id: 'inbox.view_department', label: 'Departamento', description: 'O usuário vê todas as conversas do seu departamento.' },
  { id: 'inbox.view_all', label: 'Todos depts. (Empresa)', description: 'O usuário vê conversas de todos os departamentos da empresa.' }
];

const CHANNEL_PERMISSIONS = [
  { id: 'inbox.view_whatsapp', label: 'WhatsApp', icon: 'MessageSquare' },
  { id: 'inbox.view_instagram', label: 'Instagram', icon: 'Instagram' },
  { id: 'inbox.view_chat', label: 'Web Chat', icon: 'Globe' }
];

const ROLES = [
  { id: 'admin', label: 'Administrador', color: 'text-destructive' },
  { id: 'manager', label: 'Gerente', color: 'text-warning' },
  { id: 'supervisor', label: 'Supervisor', color: 'text-info' },
  { id: 'agent', label: 'Agente', color: 'text-whatsapp' }
];

export function InboxScopeConfig() {
  const { permissions, rolePermissions, addPermissionToRole, removePermissionFromRole, loading } = usePermissions();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState<string | null>(null);
  const [newScope, setNewScope] = useState({ label: '', description: '', name: '' });
  const [isAddingScope, setIsAddingScope] = useState(false);

  const { data: customScopes = [], isLoading: loadingScopes } = useQuery({
    queryKey: ['admin', 'inbox-custom-scopes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inbox_custom_scopes').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const handleAddScope = async () => {
    if (!newScope.label || !newScope.name) {
      toast.error('Preencha o nome e identificador do escopo');
      return;
    }

    setIsAddingScope(true);
    try {
      const { error } = await supabase.from('inbox_custom_scopes').insert([{
        label: newScope.label,
        name: newScope.name.toLowerCase().replace(/\s+/g, '_'),
        description: newScope.description,
        filter_criteria: {}
      }]);

      if (error) throw error;

      toast.success('Escopo personalizado criado!');
      setNewScope({ label: '', description: '', name: '' });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'inbox-custom-scopes'] });
    } catch (err) {
      toast.error('Erro ao criar escopo');
    } finally {
      setIsAddingScope(false);
    }
  };

  const handleDeleteScope = async (id: string) => {
    try {
      const { error } = await supabase.from('inbox_custom_scopes').delete().eq('id', id);
      if (error) throw error;
      toast.success('Escopo removido');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'inbox-custom-scopes'] });
    } catch (err) {
      toast.error('Erro ao remover escopo');
    }
  };

  // Map permission name to ID
  const permissionMap = useMemo(() => {
    return permissions.reduce((acc, p) => {
      acc[p.name] = p.id;
      return acc;
    }, {} as Record<string, string>);
  }, [permissions]);

  const hasPermission = (role: string, permissionName: string): boolean => {
    const permissionId = permissionMap[permissionName];
    if (!permissionId) return false;
    return rolePermissions.some(rp => rp.role === role && rp.permission_id === permissionId);
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
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-whatsapp/20 bg-whatsapp/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-whatsapp/10 rounded-full flex items-center justify-center text-whatsapp">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <CardTitle>Configuração de Escopo da Inbox</CardTitle>
              <CardDescription>
                Defina quais níveis de visualização cada perfil de usuário pode acessar na Caixa de Entrada
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-background/50 rounded-lg p-4 border border-border/50 flex gap-3 items-start">
            <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              As alterações aqui são aplicadas em tempo real. Usuários <strong>Agentes</strong> por padrão devem ver apenas "Meus". 
              Supervisores geralmente veem "Departamento" e Administradores veem "Todos".
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
        {ROLES.map((role) => (
          <Card key={role.id} className="overflow-hidden border-border/50 shadow-sm hover:shadow-md transition-all">
            <CardHeader className="pb-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className={`text-base font-bold ${role.color}`}>{role.label}</CardTitle>
                <div className="px-2 py-0.5 bg-background rounded-full border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Role: {role.id}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 border-b pb-1">Permissões de Escopo</div>
                {INBOX_PERMISSIONS.map((perm) => {
                  const isActive = hasPermission(role.id, perm.id);
                  const isUpdating = updating === `${role.id}-${perm.id}`;
                  const isDisabled = role.id === 'admin' || isUpdating;

                  return (
                    <div key={perm.id} className="flex items-start justify-between gap-4 p-2 rounded-lg hover:bg-muted/20 transition-all">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {isActive ? <Eye className="w-3 h-3 text-whatsapp" /> : <Lock className="w-3 h-3 text-muted-foreground/50" />}
                          <Label className="text-xs font-bold cursor-pointer">{perm.label}</Label>
                        </div>
                      </div>
                      <div className="flex items-center">
                        {isUpdating ? (
                          <Loader2 className="w-3 h-3 animate-spin text-whatsapp" />
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

                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 border-b pb-1 pt-2">Visibilidade de Canais</div>
                <div className="grid grid-cols-2 gap-2">
                  {CHANNEL_PERMISSIONS.map((chan) => {
                    const isActive = hasPermission(role.id, chan.id);
                    const isUpdating = updating === `${role.id}-${chan.id}`;
                    const isDisabled = role.id === 'admin' || isUpdating;
                    const Icon = chan.icon === 'Instagram' ? Instagram : (chan.icon === 'Globe' ? Globe : MessageSquare);

                    return (
                      <div key={chan.id} className="flex items-center justify-between p-2 rounded-lg bg-background/40 border border-border/10">
                        <div className="flex items-center gap-2">
                          <Icon className={cn("w-3 h-3", isActive ? "text-primary" : "text-muted-foreground/40")} />
                          <span className="text-[10px] font-medium">{chan.label}</span>
                        </div>
                        {isUpdating ? (
                          <Loader2 className="w-3 h-3 animate-spin text-primary" />
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
                <div className="mt-2 text-[10px] text-center text-muted-foreground bg-muted/50 py-1 rounded">
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
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Escopos Personalizados</CardTitle>
                <CardDescription>Crie novos filtros de visualização sem precisar alterar o código</CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={() => setIsAddingScope(!isAddingScope)} className="bg-primary hover:bg-primary-dark">
              {isAddingScope ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {isAddingScope ? 'Cancelar' : 'Novo Escopo'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isAddingScope && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl border bg-background space-y-4 shadow-inner">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome de Exibição</Label>
                  <Input placeholder="Ex: Urgentes" value={newScope.label} onChange={e => setNewScope({...newScope, label: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Identificador (slug)</Label>
                  <Input placeholder="Ex: urgent_tickets" value={newScope.name} onChange={e => setNewScope({...newScope, name: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input placeholder="O que este escopo filtra?" value={newScope.description} onChange={e => setNewScope({...newScope, description: e.target.value})} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="ghost" onClick={() => setIsAddingScope(false)}>Descartar</Button>
                <Button size="sm" disabled={isAddingScope} onClick={handleAddScope}>Criar Escopo</Button>
              </div>
            </motion.div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loadingScopes ? (
              <div className="col-span-full py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
            ) : customScopes.length === 0 ? (
              <div className="col-span-full py-8 text-center bg-muted/20 rounded-xl border border-dashed border-border/50">
                <p className="text-sm text-muted-foreground">Nenhum escopo personalizado definido ainda.</p>
              </div>
            ) : (
              customScopes.map(scope => (
                <div key={scope.id} className="p-3 rounded-xl border bg-background/50 hover:bg-background transition-all group relative">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="text-sm font-bold flex items-center gap-1.5">
                        <Settings2 className="w-3.5 h-3.5 text-primary" />
                        {scope.label}
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">{scope.description || 'Sem descrição'}</p>
                      <div className="inline-block px-1.5 py-0.5 rounded bg-muted text-[8px] font-mono uppercase mt-1">
                        ID: {scope.name}
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDeleteScope(scope.id)}
                      className="w-7 h-7 rounded-lg text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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