/**
 * useAdminQueues — Wave 3 (2026-07-06)
 * Camada de dados+estado extraída de AdminQueuesPage (page ficou 100% JSX).
 * Semântica preservada: Promise.all de 7 tabelas, RPCs de pausa/vínculo de canal,
 * confirm()/prompt() e toasts idênticos.
 */
import { useEffect, useState } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useToast } from '@/hooks/use-toast';

export type QueueStatus = "active" | "paused" | "archived";
export type DistAlgo = "round_robin" | "least_busy" | "longest_idle" | "manual_pull";

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

export interface Profile { id: string; name: string; avatar_url: string | null }
export interface QueueMember { id: string; queue_id: string; profile_id: string; profile?: Profile }
export interface QueueSkill { id: string; queue_id: string; skill_name: string; min_level: number }
export interface Department { id: string; name: string }
export interface ServiceChannel { id: string; name: string; channel_type: string; default_queue_id: string | null }
export interface ChannelQueue { id: string; channel_id: string; queue_id: string; priority: number; is_active: boolean }

export const ALGO_LABEL: Record<DistAlgo, string> = {
  round_robin: "Round-robin",
  least_busy: "Menos ocupado",
  longest_idle: "Mais ocioso",
  manual_pull: "Puxar manualmente",
};

export function useAdminQueues() {
  const { toast } = useToast();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [members, setMembers] = useState<QueueMember[]>([]);
  const [skills, setSkills] = useState<QueueSkill[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [channels, setChannels] = useState<ServiceChannel[]>([]);
  const [channelQueues, setChannelQueues] = useState<ChannelQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Queue> | null>(null);
  const [memberDialog, setMemberDialog] = useState<Queue | null>(null);
  const [newSkill, setNewSkill] = useState<{ name: string; level: number }>({ name: "", level: 1 });
  const [newMemberId, setNewMemberId] = useState<string>("");
  const [newChannelId, setNewChannelId] = useState<string>("");

  const mountedRef = useMountedRef();

  const load = async () => {
    setLoading(true);
    const [q, m, s, p, d, c, cq] = await Promise.all([
      safeClient.from<Queue>('queues', query => query.select("*").order("priority", { ascending: false })),
      safeClient.from<QueueMember>('queue_members', query => query.select("id,queue_id,profile_id,profile:profiles(id,name,avatar_url)")),
      supabase.from('queue_skill_requirements').select("*"),
      supabase.from('profiles').select("id,name,avatar_url").eq("is_active", true).order("name"),
      supabase.from('departments').select("id,name").order("name"),
      safeClient.from<ServiceChannel>('service_channels', query => query.select("id,name,channel_type,default_queue_id").neq("status", "archived").order("name")),
      safeClient.from<ChannelQueue>('channel_queues', query => query.select("*")),
    ]);
    if (!mountedRef.current) return;
    setQueues(q.data ?? []);
    setMembers((m.data ?? []) as QueueMember[]);
    setSkills((s.data ?? []) as QueueSkill[]);
    setProfiles((p.data ?? []) as Profile[]);
    setDepartments((d.data ?? []) as Department[]);
    setChannels(c.data ?? []);
    setChannelQueues(cq.data ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing?.name) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    const payload = {
      name: editing.name,
      description: editing.description ?? null,
      color: editing.color ?? "#3B82F6",
      is_active: editing.is_active ?? true,
      priority: editing.priority ?? 0,
      max_wait_time_minutes: editing.max_wait_time_minutes ?? 30,
      distribution_algorithm: editing.distribution_algorithm ?? "least_busy",
      department_id: editing.department_id ?? null,
      max_queue_size: editing.max_queue_size ?? null,
      max_wait_seconds: editing.max_wait_seconds ?? null,
      max_per_queue_per_agent: editing.max_per_queue_per_agent ?? null,
      overflow_queue_id: editing.overflow_queue_id ?? null,
    };
    const { error } = editing.id
      ? await safeClient.from('queues', q => q.update(payload).eq("id", editing.id!))
      : await safeClient.from('queues', q => q.insert(payload));
    if (error) {
      toast({ title: "Erro ao salvar fila", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing.id ? "Fila atualizada" : "Fila criada" });
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta fila? Membros, regras e vínculos serão removidos.")) return;
    const { error } = await safeClient.from('queues', q => q.delete().eq("id", id));
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const togglePause = async (q: Queue) => {
    const fn = q.status === "paused" ? "rpc_resume_queue" : "rpc_pause_queue";
    const args = q.status === "paused"
      ? { p_queue_id: q.id }
      : { p_queue_id: q.id, p_reason: prompt("Motivo da pausa (opcional)") || null };
    const { error } = await safeClient.rpc(fn, args);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: q.status === "paused" ? "Fila retomada" : "Fila pausada" });
    load();
  };

  const addMember = async () => {
    if (!memberDialog || !newMemberId) return;
    const { error } = await safeClient.from('queue_members', q => q.insert({
      queue_id: memberDialog.id, profile_id: newMemberId,
    }));
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNewMemberId("");
    load();
  };

  const removeMember = async (id: string) => {
    await safeClient.from('queue_members', q => q.delete().eq("id", id));
    load();
  };

  const addSkill = async () => {
    if (!memberDialog || !newSkill.name.trim()) return;
    const { error } = await safeClient.from('queue_skill_requirements', q => q.insert({
      queue_id: memberDialog.id, skill_name: newSkill.name.trim(), min_level: newSkill.level,
    }));
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNewSkill({ name: "", level: 1 });
    load();
  };

  const removeSkill = async (id: string) => {
    await safeClient.from('queue_skill_requirements', q => q.delete().eq("id", id));
    load();
  };

  const linkChannel = async () => {
    if (!memberDialog || !newChannelId) return;
    const { error } = await safeClient.rpc("rpc_link_channel_queue", {
      p_channel_id: newChannelId, p_queue_id: memberDialog.id, p_priority: 0, p_is_active: true,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNewChannelId("");
    load();
  };

  const unlinkChannel = async (channelId: string) => {
    if (!memberDialog) return;
    const { error } = await safeClient.rpc("rpc_unlink_channel_queue", {
      p_channel_id: channelId, p_queue_id: memberDialog.id,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  return {
    queues, members, skills, profiles, departments, channels, channelQueues, loading,
    editing, setEditing, memberDialog, setMemberDialog,
    newSkill, setNewSkill, newMemberId, setNewMemberId, newChannelId, setNewChannelId,
    load, save, remove, togglePause, addMember, removeMember, addSkill, removeSkill, linkChannel, unlinkChannel,
  };
}