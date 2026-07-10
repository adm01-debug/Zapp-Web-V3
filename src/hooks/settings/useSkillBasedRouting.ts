/**
 * useSkillBasedRouting — Wave 3 (2026-07-06)
 * Camada de dados extraída de SkillBasedRoutingSettings (componente ficou 100% UI).
 * Query keys e semântica preservadas byte-a-byte; resets de formulário ficam no
 * call-site via segundo onSuccess (padrão React Query).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export function useSkillBasedRouting(selectedProfile: string, selectedQueue: string) {
  const queryClient = useQueryClient();

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-for-skills'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name').eq('is_active', true);
      return data || [];
    },
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues-for-skills'],
    queryFn: async () => {
      const { data } = await supabase.from('queues').select('id, name, color').eq('is_active', true);
      return data || [];
    },
  });

  const { data: agentSkills = [] } = useQuery({
    queryKey: ['agent-skills', selectedProfile],
    queryFn: async () => {
      if (!selectedProfile) return [];
      const { data } = await supabase
        .from('agent_skills')
        .select('*')
        .eq('profile_id', selectedProfile);
      return data || [];
    },
    enabled: !!selectedProfile,
  });

  const { data: queueSkills = [] } = useQuery({
    queryKey: ['queue-skills', selectedQueue],
    queryFn: async () => {
      if (!selectedQueue) return [];
      const { data } = await supabase
        .from('queue_skill_requirements')
        .select('*')
        .eq('queue_id', selectedQueue);
      return data || [];
    },
    enabled: !!selectedQueue,
  });

  const addSkill = useMutation({
    mutationFn: async ({ profileId, skillName, level }: { profileId: string; skillName: string; level: number }) => {
      const { error } = await supabase.from('agent_skills').insert({
        profile_id: profileId,
        skill_name: skillName,
        skill_level: level,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      toast({ title: 'Skill adicionada com sucesso!' });
    },
  });

  const removeSkill = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agent_skills').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-skills'] }),
  });

  const addQueueRequirement = useMutation({
    mutationFn: async ({ queueId, skillName, minLevel }: { queueId: string; skillName: string; minLevel: number }) => {
      const { error } = await supabase.from('queue_skill_requirements').insert({
        queue_id: queueId,
        skill_name: skillName,
        min_level: minLevel,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-skills'] });
      toast({ title: 'Requisito de skill adicionado!' });
    },
  });

  const removeQueueRequirement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('queue_skill_requirements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queue-skills'] }),
  });

  return { profiles, queues, agentSkills, queueSkills, addSkill, removeSkill, addQueueRequirement, removeQueueRequirement };
}
