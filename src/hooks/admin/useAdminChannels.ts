/**
 * useAdminChannels — Wave 3 batch-3 (2026-07-06)
 * Camada de dados extraída de AdminChannelsPage (5 RPCs + 2 selects).
 * Bônus da regen de types (PR #243): 4 cast-workarounds de RPC removidos —
 * as Functions agora são tipadas pelo banco real. save/runAction retornam
 * boolean para o componente resetar view-state (paridade de comportamento).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { useMountedRef } from '@/hooks/useMountedRef';

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

export function useAdminChannels(statusFilter: string, search: string) {
  const [channels, setChannels] = useState<ServiceChannel[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [wppConns, setWppConns] = useState<WppConnOption[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useMountedRef();
  const loadIdRef = useRef(0);

  const load = async () => {
    const myId = ++loadIdRef.current;
    setLoading(true);
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
      setQueues((qRes.data ?? []) as QueueOption[]);
      setWppConns((wRes.data ?? []) as WppConnOption[]);
    } catch (e) {
      if (myId !== loadIdRef.current) return;
      log.error('Load service channels failed', e);
      toast({
        title: 'Erro ao carregar canais',
        description: (e as Error).message,
        variant: 'destructive',
      });
    } finally {
      if (myId === loadIdRef.current && mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const filteredChannels = useMemo(() => {
    if (!search.trim()) return channels;
    const q = search.toLowerCase();
    return channels.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || (c.display_name?.toLowerCase().includes(q) ?? false)
    );
  }, [channels, search]);

  const save = async (editing: Partial<ServiceChannel> | null): Promise<boolean> => {
    if (!editing) return false;
    if (!editing.name?.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
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
      toast({ title: editing.id ? 'Canal atualizado' : 'Canal criado' });
      load();
      return true;
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: (e as Error).message, variant: 'destructive' });
      return false;
    }
  };

  const runAction = async (
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
      const { error } = await safeClient.rpc(rpcName, args); // dinâmico legítimo (3 RPCs, mesma shape)
      if (error) throw new Error(error.message);
      toast({
        title:
          kind === 'pause'
            ? 'Canal pausado'
            : kind === 'disable'
              ? 'Canal desativado'
              : 'Sticky removido',
      });
      load();
      return true;
    } catch (e) {
      toast({ title: 'Erro', description: (e as Error).message, variant: 'destructive' });
      return false;
    }
  };

  const reactivate = async (channel: ServiceChannel) => {
    try {
      const { error } = await safeClient.rpc('rpc_reactivate_service_channel', {
        p_id: channel.id,
      });
      if (error) throw new Error(error.message);
      toast({ title: 'Canal reativado' });
      load();
    } catch (e) {
      toast({ title: 'Erro', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return {
    channels,
    filteredChannels,
    queues,
    wppConns,
    loading,
    load,
    save,
    runAction,
    reactivate,
  };
}
