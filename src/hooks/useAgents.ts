/**
 * useAgents.ts
 * AI Agents hook using the agents table (real schema + agent_status enum).
 * Provides CRUD, status management, and smart assignment.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { sanitizeText } from '@/lib/sanitize';
import { getLogger } from '@/lib/logger';

const log = getLogger('useAgents');

// ── Types ──────────────────────────────────────────────────────────────────

export interface Agent {
  id:                string;
  user_id:           string | null;
  name:              string;
  mission:           string | null;
  persona:           string | null;
  avatar_emoji:      string;
  avatar_url?:       string | null;
  model:             string | null;
  status:            string;
  is_active?:        boolean;
  activeChats?:      number;
  max_chats?:        number;
  version:           number;
  config:            Record<string, unknown>;
  tags:              string[];
  is_template:       boolean;
  template_category: string | null;
  workspace_id:      string | null;
  created_at:        string;
  updated_at:        string;
}

// Valid agent_status enum values:
// draft | configured | testing | staging | review | production | monitoring | deprecated | archived

export const AGENT_STATUS_FLOW = [
  'draft', 'configured', 'testing', 'staging', 'review', 'production', 'monitoring',
] as const;

export const AGENT_STATUS_LABELS: Record<string, string> = {
  draft:        '📝 Rascunho',
  configured:   '⚙️ Configurado',
  testing:      '🧪 Em teste',
  staging:      '🎭 Homologação',
  review:       '👀 Em revisão',
  production:   '🚀 Produção',
  monitoring:   '📊 Monitorando',
  deprecated:   '⚠️ Descontinuado',
  archived:     '📦 Arquivado',
};

export const AGENT_STATUS_COLORS: Record<string, string> = {
  draft:        'bg-muted text-muted-foreground',
  configured:   'bg-primary/20 text-primary',
  testing:      'bg-accent text-accent-foreground',
  staging:      'bg-secondary text-secondary-foreground',
  review:       'bg-primary/10 text-primary/80',
  production:   'bg-primary text-primary-foreground',
  monitoring:   'bg-success/10 text-success',
  deprecated:   'bg-destructive/10 text-destructive',
  archived:     'bg-muted text-muted-foreground/50',
};

// ── Hook ───────────────────────────────────────────────────────────────────

export function useAgents(workspaceId?: string) {
  const { toast } = useToast();
  const [agents,  setAgents]  = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  const mapRow = (row: Record<string, unknown>): Agent => ({
    id:                String(row.id),
    user_id:           row.user_id as string | null,
    name:              sanitizeText(row.name as string),
    mission:           row.mission ? sanitizeText(row.mission as string) : null,
    persona:           row.persona ? sanitizeText(row.persona as string) : null,
    avatar_emoji:      String(row.avatar_emoji ?? '🤖'),
    avatar_url:        row.avatar_url as string | null,
    model:             row.model as string | null,
    status:            String(row.status ?? 'draft'),
    is_active:         row.status === 'production' || row.status === 'monitoring',
    activeChats:       0,
    max_chats:         5,
    version:           Number(row.version ?? 1),
    config:            (row.config as Record<string, unknown>) ?? {},
    tags:              Array.isArray(row.tags) ? row.tags as string[] : [],
    is_template:       Boolean(row.is_template ?? false),
    template_category: row.template_category as string | null,
    workspace_id:      row.workspace_id as string | null,
    created_at:        String(row.created_at ?? ''),
    updated_at:        String(row.updated_at ?? ''),
  });

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      let q: any = (supabase as any)
        .from('agents')
        .select('id,user_id,name,mission,persona,avatar_emoji,model,status,version,config,tags,is_template,template_category,workspace_id,created_at,updated_at')
        .not('status', 'in', '("deprecated","archived")')
        .order('updated_at', { ascending: false });

      if (workspaceId) q = q.eq('workspace_id', workspaceId);

      const { data, error } = await q;
      if (error) throw error;
      setAgents((data ?? []).map((r: any) => mapRow(r)));
    } catch (err) {
      log.error('Error loading agents', err);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  // ── Promote to production ────────────────────────────────────────────

  const promoteToProduction = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from('agents')
      .update({ status: 'production', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    setAgents((prev) => prev.map((a) => a.id === id ? { ...a, status: 'production' } : a));
    toast({ title: '🚀 Agente em produção!', duration: 3_000 });
  }, [toast]);

  // ── Deprecate ────────────────────────────────────────────────────────

  const deprecateAgent = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from('agents')
      .update({ status: 'deprecated', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    setAgents((prev) => prev.filter((a) => a.id !== id));
    toast({ title: '⚠️ Agente descontinuado', duration: 3_000 });
  }, [toast]);

  // ── Smart assign ─────────────────────────────────────────────────────

  const smartAssignToConversation = useCallback(async (conversationId: string) => {
    const { data, error } = await (supabase as any).rpc('smart_assign_conversation', {
      p_conversation_id: conversationId,
      p_workspace_id:    workspaceId ?? null,
    });
    if (error) throw error;
    const result = data as Record<string, unknown>;
    if (result?.error) throw new Error(String(result.error));
    toast({ title: '🤖 Atribuído automaticamente!', description: `Agente com menor carga alocado.`, duration: 3_000 });
    return result;
  }, [workspaceId, toast]);

  // Computed: production agents
  const productionAgents = agents.filter((a) => a.status === 'production');

  return {
    agents, loading, productionAgents,
    loadAgents,
    promoteToProduction, deprecateAgent,
    smartAssignToConversation,
  };
}
