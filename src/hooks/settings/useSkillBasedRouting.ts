import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Profile {
  id: string;
  name: string;
}

interface Queue {
  id: string;
  name: string;
  color: string;
}

interface AgentSkill {
  id: string;
  skill_name: string;
  skill_level: number | null;
}

interface QueueSkillRequirement {
  id: string;
  skill_name: string;
  min_level: number;
}

export function useSkillBasedRouting(selectedProfile: string, selectedQueue: string) {
  const queryClient = useQueryClient();

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['skill-routing-profiles'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      return (data ?? []) as Profile[];
    },
  });

  const { data: queues = [] } = useQuery<Queue[]>({
    queryKey: ['skill-routing-queues'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('queues')
        .select('id, name, color')
        .order('name');
      return (data ?? []) as Queue[];
    },
  });

  const { data: agentSkills = [] } = useQuery<AgentSkill[]>({
    queryKey: ['agent-skills', selectedProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_skills')
        .select('id, skill_name, skill_level')
        .eq('profile_id', selectedProfile);
      if (error) throw error;
      return (data ?? []) as AgentSkill[];
    },
    enabled: !!selectedProfile,
  });

  const { data: queueSkills = [] } = useQuery<QueueSkillRequirement[]>({
    queryKey: ['queue-skill-requirements', selectedQueue],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queue_skill_requirements')
        .select('id, skill_name, min_level')
        .eq('queue_id', selectedQueue);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        skill_name: r.skill_name,
        min_level: r.min_level ?? 1,
      })) as QueueSkillRequirement[];
    },
    enabled: !!selectedQueue,
  });

  const addSkill = useMutation({
    mutationFn: async ({
      profileId,
      skillName,
      level,
    }: {
      profileId: string;
      skillName: string;
      level: number;
    }) => {
      const { error } = await supabase.from('agent_skills').insert({
        profile_id: profileId,
        skill_name: skillName,
        skill_level: level,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agent-skills', selectedProfile] });
    },
    onError: () => {
      toast({ title: 'Erro ao adicionar skill', variant: 'destructive' });
    },
  });

  const removeSkill = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agent_skills').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agent-skills', selectedProfile] });
    },
    onError: () => {
      toast({ title: 'Erro ao remover skill', variant: 'destructive' });
    },
  });

  const addQueueRequirement = useMutation({
    mutationFn: async ({
      queueId,
      skillName,
      minLevel,
    }: {
      queueId: string;
      skillName: string;
      minLevel: number;
    }) => {
      const { error } = await supabase.from('queue_skill_requirements').insert({
        queue_id: queueId,
        skill_name: skillName,
        min_level: minLevel,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['queue-skill-requirements', selectedQueue] });
    },
    onError: () => {
      toast({ title: 'Erro ao adicionar requisito', variant: 'destructive' });
    },
  });

  const removeQueueRequirement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('queue_skill_requirements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['queue-skill-requirements', selectedQueue] });
    },
    onError: () => {
      toast({ title: 'Erro ao remover requisito', variant: 'destructive' });
    },
  });

  return {
    profiles,
    queues,
    agentSkills,
    queueSkills,
    addSkill,
    removeSkill,
    addQueueRequirement,
    removeQueueRequirement,
  };
}
