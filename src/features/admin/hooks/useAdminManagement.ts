// @ts-nocheck
/**
 * Admin Management Hook — Unified orchestration of all admin panel integrations.
 * Consolidates 7 domain-specific hooks into one comprehensive module.
 *
 * Sections:
 * 1. Automations — Rule management, trigger types, channels, departments
 * 2. Channels — Service channel CRUD, routing, queue binding
 * 3. Queues — Queue management, members, skills, distribution algorithms
 * 4. Departments — Department CRUD, member counts, activation
 * 5. Roles — User role assignment, role-based access control
 * 6. Permissions — Route-level permissions, role filtering
 * 7. Security — HMAC self-tests, webhook validation, audit logging
 * 8. Orchestration — Main hook combining all domains
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient, safeFrom } from '@/integrations/supabase/safeClient';
import { toast } from 'sonner';
import { useToast } from '@/hooks/use-toast';
import { useMountedRef } from '@/hooks/useMountedRef';
import { log, getLogger } from '@/lib/logger';
import { invalidateRouteRolesCache } from '@/features/auth';
import { normalizeProfileRef, type AdminProfileRef } from '@/features/admin/utils/profileMappers';
import type { Json } from '@/integrations/supabase/schema';
import type { AppRole } from '@/features/auth';

// ─── Type Exports ────────────────────────────────────────────────────────────

// Automations
export type TriggerType =
  | 'first_response_pending'
  | 'inactivity'
  | 'tag_applied'
  | 'tag_removed'
  | 'keyword_match';

export interface Rule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_config: Json;
  actions: Json;
  priority: number;
  cooldown_seconds: number;
  channel_id: string | null;
  department_id: string | null;
}

export interface AutomationChannel {
  id: string;
  name: string;
}

export interface AutomationDepartment {
  id: string;
  name: string;
}

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  first_response_pending: 'Primeira resposta pendente',
  inactivity: 'Ausência / inatividade',
  tag_applied: 'Etiqueta aplicada',
  tag_removed: 'Etiqueta removida',
  keyword_match: 'Palavra-chave',
};

export const EMPTY_RULE: Omit<Rule, 'id'> = {
  name: '',
  description: '',
  is_active: true,
  trigger_type: 'first_response_pending',
  trigger_config: { threshold_seconds: 60 },
  actions: {
    suggest_reply: true,
    auto_send: false,
    apply_tags: [] as string[],
    ai_prompt: '',
    template: '',
    escalate_sla: { enabled: false, level: 'high', reason: '' },
  },
  priority: 100,
  cooldown_seconds: 300,
  channel_id: null,
  department_id: null,
};

// Channels
export type ChannelStatus = 'active' | 'paused' | 'disabled';

export interface ServiceChannel {
  id: string;
  name: string;
  display_name: string | null;
  channel_type: string;
  whatsapp_connection_id: string | null;
  default_queue_id: string | null;
  routing_mode: string;
  sticky_enabled: boolean;
  sticky_ttl_hours: number;
  status: ChannelStatus;
  is_default: boolean;
  description: string | null;
  color: string;
  paused_at: string | null;
  paused_reason: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
}

export interface QueueOption {
  id: string;
  name: string;
  color: string;
}

export interface WppConnOption {
  id: string;
  name: string;
  phone_number: string;
}

// Queues
export type QueueStatus = 'active' | 'paused' | 'archived';
export type DistAlgo = 'round_robin' | 'least_busy' | 'longest_idle' | 'manual_pull';

export interface Queue {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  priority: number;
  max_wait_time_minutes: number;
  status: QueueStatus;
  distribution_algorithm: DistAlgo;
  department_id: string | null;
  max_queue_size: number | null;
  max_wait_seconds: number | null;
  max_per_queue_per_agent: number | null;
  overflow_queue_id: string | null;
  paused_reason: string | null;
}

export interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface QueueMember {
  id: string;
  queue_id: string;
  profile_id: string;
  profile?: Profile;
}

export interface QueueSkill {
  id: string;
  queue_id: string;
  skill_name: string;
  min_level: number;
}

export interface QueueDepartment {
  id: string;
  name: string;
}

export interface QueueServiceChannel {
  id: string;
  name: string;
  channel_type: string;
  default_queue_id: string | null;
}

export interface ChannelQueue {
  id: string;
  channel_id: string;
  queue_id: string;
  priority: number;
  is_active: boolean;
}

export const ALGO_LABEL: Record<DistAlgo, string> = {
  round_robin: 'Round-robin',
  least_busy: 'Menos ocupado',
  longest_idle: 'Mais ocioso',
  manual_pull: 'Puxar manualmente',
};

// Departments
export interface Department {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  member_count?: number;
}

// Roles
type RoleType = 'dev' | 'admin' | 'manager' | 'supervisor' | 'agent';

export interface UserWithRole {
  id: string;
  user_id: string;
  role: RoleType;
  profile?: Pick<AdminProfileRef, 'name' | 'email' | 'avatar_url'>;
}

// Permissions
export type RoutePermission = {
  path: string;
  allowed_roles: AppRole[];
  description: string | null;
  is_system: boolean;
  updated_at: string;
};

export const ALL_ROLES: AppRole[] = ['dev', 'admin', 'manager', 'supervisor', 'agent'];

// Security
export type Phase =
  | 'config'
  | 'parse-body'
  | 'build-payload'
  | 'sign'
  | 'mutate'
  | 'request'
  | 'validate'
  | 'signature-presence'
  | 'temporal'
  | 'response';

export interface ScenarioReport {
  name: string;
  description: string;
  expected: 'accept' | 'reject';
  outcome: 'accept' | 'reject';
  passed: boolean;
  reason: string | null;
  failed_phase?: Phase | null;
  issuedAt: string;
  ageSeconds: number;
  nonce: string;
}

export interface SelfTestResult {
  ok: boolean;
  configured: boolean;
  request_id?: string;
  failed_phase?: Phase | null;
  secret_length?: number;
  duration_ms?: number;
  tolerance_seconds?: number;
  scenarios?: ScenarioReport[];
  message?: string;
  error?: string;
}

// ─── Section 1: Automations ──────────────────────────────────────────────────

/** Manages automation rules, channels, and departments for rule configuration. */
function useAdminAutomationsManagement() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [automationChannels, setAutomationChannels] = useState<AutomationChannel[]>([]);
  const [automationDepartments, setAutomationDepartments] = useState<AutomationDepartment[]>([]);
  const [automationLoading, setAutomationLoading] = useState(false);
  const mountedRef = useMountedRef();

  const loadAutomations = async () => {
    setAutomationLoading(true);
    try {
      const [{ data: rulesData, error }, { data: chs, error: chsError }, { data: deps, error: depsError }] = await Promise.all([
        supabase.from('automations').select('*').order('name', { ascending: true }),
        supabase.from('channel_connections').select('id,name').order('name'),
        supabase.from('departments').select('id,name').order('name'),
      ]);
      if (!mountedRef.current) return;
      if (error) {
        toast.error(error.message);
        return;
      }
      if (chsError) {
        toast.error('Erro ao carregar canais de automação');
        return;
      }
      if (depsError) {
        toast.error('Erro ao carregar departamentos de automação');
        return;
      }
      setRules((rulesData ?? []) as unknown as Rule[]);
      setAutomationChannels((chs ?? []) as AutomationChannel[]);
      setAutomationDepartments((deps ?? []) as AutomationDepartment[]);
    } catch (err) {
      if (!mountedRef.current) return;
      toast.error('Erro ao carregar automações');
    } finally {
      if (mountedRef.current) setAutomationLoading(false);
    }
  };

  useEffect(() => {
    void loadAutomations();
  }, []);

  const saveAutomation = async (editing: Rule | null): Promise<boolean> => {
    if (!editing) return false;
    if (!editing.name.trim()) {
      toast.error('Nome obrigatório');
      return false;
    }
    const payload = {
      name: editing.name,
      description: editing.description,
      is_active: editing.is_active,
      trigger_type: editing.trigger_type,
      trigger_config: editing.trigger_config,
      actions: editing.actions,
      priority: editing.priority ?? 100,
      cooldown_seconds: editing.cooldown_seconds ?? 300,
      channel_id: editing.channel_id || null,
      department_id: editing.department_id || null,
    };
    const op = editing.id
      ? supabase.from('automations').update(payload).eq('id', editing.id)
      : supabase.from('automations').insert(payload);
    const { error } = await op;
    if (error) {
      toast.error('Erro ao salvar regra');
      return false;
    }
    toast.success('Regra salva');
    loadAutomations();
    return true;
  };

  const removeAutomation = async (id: string) => {
    const { error } = await supabase.from('automations').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao remover');
      return;
    }
    loadAutomations();
  };

  const toggleAutomationActive = async (r: Rule) => {
    const { error } = await supabase
      .from('automations')
      .update({ is_active: !r.is_active })
      .eq('id', r.id);
    if (error) {
      toast.error('Erro ao alterar status');
      return;
    }
    loadAutomations();
  };

  const adjustAutomationPriority = async (r: Rule, delta: number) => {
    const newPriority = Math.min(999, Math.max(1, (r.priority ?? 100) + delta));
    const { error } = await supabase
      .from('automations')
      .update({ priority: newPriority })
      .eq('id', r.id);
    if (error) {
      toast.error('Erro ao ajustar prioridade');
      return;
    }
    loadAutomations();
  };

  return {
    rules,
    automationChannels,
    automationDepartments,
    automationLoading,
    loadAutomations,
    saveAutomation,
    removeAutomation,
    toggleAutomationActive,
    adjustAutomationPriority,
  };
}

// ─── Section 2: Channels ─────────────────────────────────────────────────────

/** Manages service channels, routing configuration, queue binding, and channel status. */
function useAdminChannelsManagement(statusFilter: string, search: string) {
  const [channels, setChannels] = useState<ServiceChannel[]>([]);
  const [channelQueues, setChannelQueues] = useState<QueueOption[]>([]);
  const [channelWppConns, setChannelWppConns] = useState<WppConnOption[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const mountedRef = useMountedRef();
  const loadIdRef = useRef(0);

  const loadChannels = async () => {
    const myId = ++loadIdRef.current;
    setChannelsLoading(true);
    try {
      const [chRes, qRes, wRes] = await Promise.all([
        safeClient.rpc<ServiceChannel[]>('rpc_list_service_channels', {
          p_status: statusFilter === 'all' ? null : statusFilter,
          p_search: search.trim() || null,
        }),
        supabase.from('queues').select('id,name,color').order('name'),
        supabase.from('whatsapp_connections').select('id,name,phone_number').order('name'),
      ]);
      if (myId !== loadIdRef.current || !mountedRef.current) return;
      if (chRes.error) throw new Error(chRes.error.message);
      setChannels((chRes.data ?? []) as ServiceChannel[]);
      setChannelQueues((qRes.data ?? []) as QueueOption[]);
      setChannelWppConns((wRes.data ?? []) as WppConnOption[]);
    } catch (e) {
      if (myId !== loadIdRef.current) return;
      log.error('Load service channels failed', e);
      toast.error('Erro ao carregar canais');
    } finally {
      if (myId === loadIdRef.current && mountedRef.current) setChannelsLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, [statusFilter]);

  const filteredChannels = useMemo(() => {
    if (!search.trim()) return channels;
    const q = search.toLowerCase();
    return channels.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || (c.display_name?.toLowerCase().includes(q) ?? false)
    );
  }, [channels, search]);

  const saveChannel = async (editing: Partial<ServiceChannel> | null): Promise<boolean> => {
    if (!editing) return false;
    if (!editing.name?.trim()) {
      toast.error('Nome é obrigatório');
      return false;
    }
    try {
      const { error } = await safeClient.rpc('rpc_upsert_service_channel', {
        p_id: editing.id ?? null,
        p_name: editing.name.trim(),
        p_display_name: editing.display_name?.trim() || null,
        p_channel_type: editing.channel_type ?? 'whatsapp',
        p_whatsapp_connection_id: editing.whatsapp_connection_id ?? null,
        p_default_queue_id: editing.default_queue_id ?? null,
        p_routing_mode: editing.routing_mode ?? 'manual',
        p_sticky_enabled: !!editing.sticky_enabled,
        p_sticky_ttl_hours: editing.sticky_ttl_hours ?? 24,
        p_is_default: !!editing.is_default,
        p_description: editing.description?.trim() || null,
        p_color: editing.color ?? '#3B82F6',
      });
      if (error) throw new Error(error.message);
      toast.success(editing.id ? 'Canal atualizado' : 'Canal criado');
      loadChannels();
      return true;
    } catch (e) {
      toast.error('Erro ao salvar');
      return false;
    }
  };

  const runChannelAction = async (
    actionDialog: { kind: 'pause' | 'disable' | 'purge'; channel: ServiceChannel } | null,
    actionReason: string
  ): Promise<boolean> => {
    if (!actionDialog) return false;
    const { kind, channel } = actionDialog;
    try {
      const rpcName =
        kind === 'pause'
          ? 'rpc_pause_service_channel'
          : kind === 'disable'
            ? 'rpc_disable_service_channel'
            : 'rpc_purge_channel_sticky';
      const args: Record<string, unknown> =
        kind === 'purge'
          ? { p_id: channel.id }
          : { p_id: channel.id, p_reason: actionReason.trim() || null };
      const { error } = await safeClient.rpc(rpcName, args);
      if (error) throw new Error(error.message);
      toast.success(
        kind === 'pause'
          ? 'Canal pausado'
          : kind === 'disable'
            ? 'Canal desativado'
            : 'Sticky removido'
      );
      loadChannels();
      return true;
    } catch (e) {
      toast.error('Erro');
      return false;
    }
  };

  const reactivateChannel = async (channel: ServiceChannel) => {
    try {
      const { error } = await safeClient.rpc('rpc_reactivate_service_channel', {
        p_id: channel.id,
      });
      if (error) throw new Error(error.message);
      toast.success('Canal reativado');
      loadChannels();
    } catch (e) {
      toast.error('Erro');
    }
  };

  return {
    channels,
    filteredChannels,
    channelQueues,
    channelWppConns,
    channelsLoading,
    loadChannels,
    saveChannel,
    runChannelAction,
    reactivateChannel,
  };
}

// ─── Section 3: Queues ───────────────────────────────────────────────────────

/** Manages queue creation, member assignments, skill levels, and distribution algorithms. */
function useAdminQueuesManagement() {
  const { toast } = useToast();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [queueMembers, setQueueMembers] = useState<QueueMember[]>([]);
  const [queueSkills, setQueueSkills] = useState<QueueSkill[]>([]);
  const [queueDepartments, setQueueDepartments] = useState<QueueDepartment[]>([]);
  const [queueChannels, setQueueChannels] = useState<QueueServiceChannel[]>([]);
  const [channelQueues, setChannelQueues] = useState<ChannelQueue[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [queuesLoading, setQueuesLoading] = useState(true);
  const mountedRef = useMountedRef();

  const loadQueues = async () => {
    setQueuesLoading(true);
    try {
      const [qRes, mRes, sRes, dRes, cRes, chqRes, pRes] = await Promise.all([
        supabase.from('queues').select('*'),
        supabase.from('queue_members').select('*'),
        supabase.from('queue_skills').select('*'),
        supabase.from('departments').select('*'),
        supabase.from('service_channels').select('id,name,channel_type,default_queue_id'),
        supabase.from('channel_queues').select('*'),
        supabase.from('profiles').select('id,name,avatar_url'),
      ]);

      if (!mountedRef.current) return;

      setQueues((qRes.data ?? []) as Queue[]);
      setQueueMembers((mRes.data ?? []) as QueueMember[]);
      setQueueSkills((sRes.data ?? []) as QueueSkill[]);
      setQueueDepartments((dRes.data ?? []) as QueueDepartment[]);
      setQueueChannels((cRes.data ?? []) as QueueServiceChannel[]);
      setChannelQueues((chqRes.data ?? []) as ChannelQueue[]);
      setProfiles((pRes.data ?? []) as Profile[]);
    } catch (e) {
      toast({ title: 'Erro ao carregar filas', variant: 'destructive' });
    } finally {
      if (mountedRef.current) setQueuesLoading(false);
    }
  };

  useEffect(() => {
    void loadQueues();
  }, []);

  const saveQueue = async (editing: Queue | null): Promise<boolean> => {
    if (!editing) return false;
    if (!editing.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return false;
    }
    const { error } = editing.id
      ? await supabase.from('queues').update(editing).eq('id', editing.id)
      : await supabase.from('queues').insert(editing);
    if (error) {
      toast({ title: 'Erro ao salvar fila', variant: 'destructive' });
      return false;
    }
    toast({ title: 'Fila salva' });
    await loadQueues();
    return true;
  };

  const removeQueue = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('queues').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao remover fila', variant: 'destructive' });
      return false;
    }
    toast({ title: 'Fila removida' });
    await loadQueues();
    return true;
  };

  return {
    queues,
    queueMembers,
    queueSkills,
    queueDepartments,
    queueChannels,
    channelQueues,
    profiles,
    queuesLoading,
    loadQueues,
    saveQueue,
    removeQueue,
  };
}

// ─── Section 4: Departments ──────────────────────────────────────────────────

/** Manages department CRUD operations, member assignments, and department activation. */
function useDepartmentsManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptLoading, setDeptLoading] = useState(true);
  const [deptSaving, setDeptSaving] = useState(false);
  const mountedRef = useMountedRef();
  const deptLogger = getLogger('useDepartmentsAdmin');

  const fetchDepartments = useCallback(async () => {
    setDeptLoading(true);
    const { data, error } = await supabase.from('departments').select('*').order('name');

    if (!mountedRef.current) return;

    if (error) {
      toast.error('Erro ao carregar departamentos');
      setDeptLoading(false);
      return;
    }

    const ids = (data ?? []).map((d) => d.id);
    let counts: Record<string, number> = {};
    let countsFailed = false;
    if (ids.length) {
      const { data: profilesByDept, error: profilesByDeptErr } = await supabase
        .from('profiles')
        .select('department_id')
        .in('department_id', ids);
      if (!mountedRef.current) return;
      if (profilesByDeptErr) {
        deptLogger.warn('member-count fetch failed:', profilesByDeptErr.message);
        countsFailed = true;
      } else {
        counts = (profilesByDept ?? []).reduce<Record<string, number>>((acc, p) => {
          if (p.department_id) acc[p.department_id] = (acc[p.department_id] ?? 0) + 1;
          return acc;
        }, {});
      }
    }

    setDepartments(
      (data ?? []).map((d) => ({
        ...d,
        is_active: d.is_active ?? true,
        member_count: countsFailed ? undefined : (counts[d.id] ?? 0),
      }))
    );
    setDeptLoading(false);
  }, []);

  useEffect(() => {
    void fetchDepartments();
  }, [fetchDepartments]);

  const saveDepartment = async (
    payload: { name: string; slug: string; description: string | null; is_active: boolean },
    editingId: string | null
  ): Promise<boolean> => {
    setDeptSaving(true);

    const { error } = editingId
      ? await supabase.from('departments').update(payload).eq('id', editingId)
      : await supabase.from('departments').insert(payload);

    setDeptSaving(false);

    if (error) {
      toast.error(
        error.message.includes('duplicate')
          ? 'Já existe um departamento com esse nome ou identificador'
          : 'Erro ao salvar departamento'
      );
      return false;
    }

    toast.success(editingId ? 'Departamento atualizado' : 'Departamento criado');
    void fetchDepartments();
    return true;
  };

  const removeDepartment = async (id: string): Promise<boolean> => {
    setDeptSaving(true);
    const { error } = await supabase.from('departments').delete().eq('id', id);
    setDeptSaving(false);

    if (error) {
      toast.error('Erro ao remover departamento');
      return false;
    }

    toast.success('Departamento removido');
    void fetchDepartments();
    return true;
  };

  return {
    departments,
    deptLoading,
    deptSaving,
    fetchDepartments,
    saveDepartment,
    removeDepartment,
  };
}

// ─── Section 5: Roles ────────────────────────────────────────────────────────

function useRolesManagement() {
  const [roleUsers, setRoleUsers] = useState<UserWithRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesSearch, setRolesSearch] = useState('');
  const [showAddRoleDialog, setShowAddRoleDialog] = useState(false);
  const [selectedRoleUser, setSelectedRoleUser] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleType>('agent');
  const [availableRoleUsers, setAvailableRoleUsers] = useState<
    { user_id: string; name: string; email: string }[]
  >([]);
  const [userToRemoveRole, setUserToRemoveRole] = useState<UserWithRole | null>(null);
  const [rolesUpdating, setRolesUpdating] = useState(false);

  const fetchRoleUsers = async () => {
    setRolesLoading(true);
    type RoleRow = {
      id: string;
      user_id: string;
      role: string;
      profiles: unknown;
    };
    const { data, error } = await safeClient.from<RoleRow>('user_roles', (q) =>
      q
        .select(`id, user_id, role, profiles!user_roles_user_id_fkey (name, email, avatar_url)`)
        .order('role')
    );

    if (!error && data) {
      setRoleUsers(
        data.map((u) => {
          const ref = normalizeProfileRef(u.profiles as never);
          return {
            id: u.id,
            user_id: u.user_id,
            role: u.role as RoleType,
            profile: ref
              ? { name: ref.name, email: ref.email, avatar_url: ref.avatar_url }
              : undefined,
          };
        })
      );
    }
    setRolesLoading(false);
  };

  const fetchAvailableRoleUsers = async () => {
    const { data, error: profilesErr } = await supabase.from('profiles').select('user_id, name, email').order('name');
    if (profilesErr) { log.warn('Failed to fetch profiles for role users', profilesErr); return; } // ✅ fix: error check
    if (data) {
      const usersWithRoles = roleUsers.map((u) => u.user_id);
      setAvailableRoleUsers(
        data.filter((u) => !usersWithRoles.includes(u.user_id)) as {
          user_id: string;
          name: string;
          email: string;
        }[]
      );
    }
  };

  useEffect(() => {
    void fetchRoleUsers();
  }, []);

  useEffect(() => {
    if (showAddRoleDialog) void fetchAvailableRoleUsers();
  }, [showAddRoleDialog, roleUsers]);

  const handleAddRole = async () => {
    if (!selectedRoleUser || !selectedRole) return;
    setRolesUpdating(true);
    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: selectedRoleUser, role: selectedRole });
    if (error) toast.error('Erro ao adicionar role');
    else {
      toast.success('Role adicionada com sucesso');
      setShowAddRoleDialog(false);
      setSelectedRoleUser('');
      fetchRoleUsers();
    }
    setRolesUpdating(false);
  };

  const handleRemoveRole = async () => {
    if (!userToRemoveRole) return;
    setRolesUpdating(true);
    const { error } = await supabase.from('user_roles').delete().eq('id', userToRemoveRole.id);
    if (error) toast.error('Erro ao remover role');
    else {
      toast.success('Role removida com sucesso');
      setUserToRemoveRole(null);
      fetchRoleUsers();
    }
    setRolesUpdating(false);
  };

  const filteredRoleUsers = useMemo(
    () =>
      roleUsers.filter(
        (u) =>
          u.profile?.name?.toLowerCase().includes(rolesSearch.toLowerCase()) ||
          u.profile?.email?.toLowerCase().includes(rolesSearch.toLowerCase())
      ),
    [roleUsers, rolesSearch]
  );

  const groupedRoleUsers = useMemo(
    () => ({
      dev: filteredRoleUsers.filter((u) => u.role === 'dev'),
      admin: filteredRoleUsers.filter((u) => u.role === 'admin'),
      manager: filteredRoleUsers.filter((u) => u.role === 'manager'),
      supervisor: filteredRoleUsers.filter((u) => u.role === 'supervisor'),
      agent: filteredRoleUsers.filter((u) => u.role === 'agent'),
    }),
    [filteredRoleUsers]
  );

  return {
    roleUsers,
    rolesLoading,
    rolesSearch,
    setRolesSearch,
    showAddRoleDialog,
    setShowAddRoleDialog,
    selectedRoleUser,
    setSelectedRoleUser,
    selectedRole,
    setSelectedRole,
    availableRoleUsers,
    userToRemoveRole,
    setUserToRemoveRole,
    rolesUpdating,
    handleAddRole,
    handleRemoveRole,
    groupedRoleUsers,
  };
}

// ─── Section 6: Permissions ──────────────────────────────────────────────────

function useRoutePermissionsManagement() {
  const [permissionRows, setPermissionRows] = useState<RoutePermission[]>([]);
  const [permLoading, setPermLoading] = useState(true);
  const [savingPermPath, setSavingPermPath] = useState<string | null>(null);
  const { toast } = useToast();
  const isMountedRef = useRef(true);

  async function loadPermissions() {
    setPermLoading(true);
    const { data, error } = await supabase
      .from('route_permissions')
      .select('path, allowed_roles, description, is_system, updated_at')
      .order('path', { ascending: true });
    if (!isMountedRef.current) return;
    if (error) {
      toast({
        title: 'Erro ao carregar permissões',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setPermissionRows((data ?? []) as RoutePermission[]);
    }
    setPermLoading(false);
  }

  useEffect(() => {
    void loadPermissions();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function savePermissionRow(path: string, nextRoles: AppRole[]) {
    setSavingPermPath(path);
    const { error } = await supabase
      .from('route_permissions')
      .update({ allowed_roles: nextRoles })
      .eq('path', path);
    setSavingPermPath(null);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return false;
    }
    invalidateRouteRolesCache(path);
    toast({ title: 'Permissão atualizada', description: path });
    await loadPermissions();
    return true;
  }

  async function deletePermissionRow(path: string) {
    const { error } = await supabase.from('route_permissions').delete().eq('path', path);
    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
      return false;
    }
    invalidateRouteRolesCache(path);
    toast({ title: 'Rota removida', description: path });
    await loadPermissions();
    return true;
  }

  async function createPermissionRow(newPath: string, newRoles: AppRole[], newDesc: string) {
    const path = newPath.trim();
    if (!path.startsWith('/')) {
      toast({
        title: 'Path inválido',
        description: 'Use um caminho começando com /',
        variant: 'destructive',
      });
      return false;
    }
    const { error } = await supabase.from('route_permissions').insert({
      path,
      allowed_roles: newRoles,
      description: newDesc.trim() || null,
      is_system: false,
    });
    if (error) {
      toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      return false;
    }
    invalidateRouteRolesCache();
    toast({ title: 'Rota cadastrada', description: path });
    await loadPermissions();
    return true;
  }

  return {
    permissionRows,
    permLoading,
    savingPermPath,
    loadPermissions,
    savePermissionRow,
    deletePermissionRow,
    createPermissionRow,
  };
}

// ─── Section 7: Security ─────────────────────────────────────────────────────

function useHmacSecurityManagement(instance: string, includeNegative: boolean) {
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityResult, setSecurityResult] = useState<SelfTestResult | null>(null);
  const [lastSecurityRunAt, setLastSecurityRunAt] = useState<Date | null>(null);

  const logSecurityAudit = useCallback(
    async (payload: SelfTestResult, fallbackMs: number) => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) return;
        const { error: insertError } = await safeClient.from('hmac_selftest_audit', (q) =>
          q.insert({
            instance,
            ok: !!payload.ok,
            duration_ms: payload.duration_ms ?? fallbackMs,
            error: payload.error ?? null,
            message: payload.message ?? null,
            executed_by: uid,
          })
        );
        if (insertError) {
          log.warn('audit insert failed', insertError);
        }
      } catch (e) {
        log.warn('audit insert threw', e);
      }
    },
    [instance]
  );

  const syncSecurityAlert = useCallback(
    async (payload: SelfTestResult) => {
      const source = `hmac-selftest:${instance}`;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) return;
        const { data: existing, error: existingError } = await safeFrom('warroom_alerts')
          .select('id')
          .eq('source', source)
          .is('resolved_at', null)
          .order('created_at', { ascending: false })
          .limit(1);
        if (existingError) {
          log.warn('warroom_alerts lookup failed', existingError);
          return;
        }
        const activeId = existing?.[0]?.id ?? null;
        if (!payload.ok && !activeId) {
          const failed = payload.scenarios?.filter((s) => !s.passed) ?? [];
          const phasePrefix = payload.failed_phase ? `[fase: ${payload.failed_phase}] ` : '';
          const reqSuffix = payload.request_id ? ` (req=${payload.request_id.slice(0, 8)})` : '';
          const detail =
            failed.length > 0
              ? failed
                  .map(
                    (s) =>
                      `${s.name}${s.failed_phase ? `@${s.failed_phase}` : ''}: ${s.reason ?? '—'}`
                  )
                  .join(' | ')
              : (payload.error ?? payload.message ?? 'Falha no self-test HMAC');
          const { error: insertAlertError } = await safeFrom('warroom_alerts').insert({
            alert_type: 'critical',
            title: `HMAC self-test falhou (${instance})`,
            message: `${phasePrefix}${detail}${reqSuffix}`.slice(0, 500),
            source,
          });
          if (insertAlertError) log.warn('warroom_alerts insert failed', insertAlertError);
        } else if (payload.ok && activeId) {
          const { error: resolveError } = await safeClient.from('warroom_alerts', (q) =>
            q
              .update({
                resolved_at: new Date().toISOString(),
                resolved_reason: 'Auto-resolvido: HMAC self-test voltou a OK',
                dismissed_by: uid,
                is_read: true,
              })
              .eq('source', source)
              .is('resolved_at', null)
          );
          if (resolveError) log.warn('warroom_alerts resolve failed', resolveError);
        }
      } catch (e) {
        log.warn('alert sync threw', e);
      }
    },
    [instance]
  );

  const runSecurityTest = useCallback(async () => {
    setSecurityLoading(true);
    setSecurityResult(null);
    const t0 = performance.now();
    try {
      const { data, error } = await supabase.functions.invoke('webhook-hmac-selftest', {
        body: { instance, include_negative: includeNegative },
      });
      if (error) throw error;
      const r = data as SelfTestResult;
      setSecurityResult(r);
      setLastSecurityRunAt(new Date());
      if (r.ok) toast.success('HMAC OK — secret válido');
      else toast.error(r.error ?? 'Falha no auto-teste HMAC');
      await logSecurityAudit(r, Math.round(performance.now() - t0));
      await syncSecurityAlert(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro inesperado';
      const failure: SelfTestResult = { ok: false, configured: false, error: msg };
      setSecurityResult(failure);
      toast.error(msg);
      await logSecurityAudit(failure, Math.round(performance.now() - t0));
      await syncSecurityAlert(failure);
    } finally {
      setSecurityLoading(false);
    }
  }, [instance, includeNegative, logSecurityAudit, syncSecurityAlert]);

  return {
    securityLoading,
    securityResult,
    lastSecurityRunAt,
    runSecurityTest,
  };
}

// ─── Section 8: Orchestration ────────────────────────────────────────────────

/** Unified admin panel orchestration combining automations, channels, queues, departments, roles, and security. */
export function useAdminManagement(options?: {
  channelStatusFilter?: string;
  channelSearch?: string;
  hmacInstance?: string;
  hmacIncludeNegative?: boolean;
}) {
  const automations = useAdminAutomationsManagement();
  const channels = useAdminChannelsManagement(
    options?.channelStatusFilter ?? 'all',
    options?.channelSearch ?? ''
  );
  const queues = useAdminQueuesManagement();
  const departments = useDepartmentsManagement();
  const roles = useRolesManagement();
  const permissions = useRoutePermissionsManagement();
  const security = useHmacSecurityManagement(
    options?.hmacInstance ?? '',
    options?.hmacIncludeNegative ?? false
  );

  const isLoading =
    automations.automationLoading ||
    channels.channelsLoading ||
    queues.queuesLoading ||
    departments.deptLoading ||
    roles.rolesLoading ||
    permissions.permLoading;

  return {
    // Automations
    rules: automations.rules,
    automationChannels: automations.automationChannels,
    automationDepartments: automations.automationDepartments,
    loadAutomations: automations.loadAutomations,
    saveAutomation: automations.saveAutomation,
    removeAutomation: automations.removeAutomation,
    toggleAutomationActive: automations.toggleAutomationActive,
    adjustAutomationPriority: automations.adjustAutomationPriority,
    automationLoading: automations.automationLoading,



    // Channels
    channels: channels.channels,
    filteredChannels: channels.filteredChannels,
    channelQueues: channels.channelQueues,
    channelWppConns: channels.channelWppConns,
    loadChannels: channels.loadChannels,
    saveChannel: channels.saveChannel,
    runChannelAction: channels.runChannelAction,
    reactivateChannel: channels.reactivateChannel,

    // Queues
    queues: queues.queues,
    queueMembers: queues.queueMembers,
    queueSkills: queues.queueSkills,
    queueDepartments: queues.queueDepartments,
    queueChannels: queues.queueChannels,
    channelQueuesData: queues.channelQueues,
    profiles: queues.profiles,
    loadQueues: queues.loadQueues,
    saveQueue: queues.saveQueue,
    removeQueue: queues.removeQueue,

    // Departments
    departments: departments.departments,
    fetchDepartments: departments.fetchDepartments,
    saveDepartment: departments.saveDepartment,
    removeDepartment: departments.removeDepartment,

    // Roles
    roleUsers: roles.roleUsers,
    filteredRoleUsers: roles.filteredRoleUsers,
    groupedRoleUsers: roles.groupedRoleUsers,
    rolesSearch: roles.rolesSearch,
    setRolesSearch: roles.setRolesSearch,
    showAddRoleDialog: roles.showAddRoleDialog,
    setShowAddRoleDialog: roles.setShowAddRoleDialog,
    selectedRoleUser: roles.selectedRoleUser,
    setSelectedRoleUser: roles.setSelectedRoleUser,
    selectedRole: roles.selectedRole,
    setSelectedRole: roles.setSelectedRole,
    availableRoleUsers: roles.availableRoleUsers,
    userToRemoveRole: roles.userToRemoveRole,
    setUserToRemoveRole: roles.setUserToRemoveRole,
    handleAddRole: roles.handleAddRole,
    handleRemoveRole: roles.handleRemoveRole,

    // Permissions
    permissionRows: permissions.permissionRows,
    savingPermPath: permissions.savingPermPath,
    loadPermissions: permissions.loadPermissions,
    savePermissionRow: permissions.savePermissionRow,
    deletePermissionRow: permissions.deletePermissionRow,
    createPermissionRow: permissions.createPermissionRow,

    // Security
    securityLoading: security.securityLoading,
    securityResult: security.securityResult,
    lastSecurityRunAt: security.lastSecurityRunAt,
    runSecurityTest: security.runSecurityTest,

    // Overall
    isLoading,
  };
}
