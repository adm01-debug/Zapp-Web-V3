import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { autoTag } from '@/integrations/supabase/ai-router';
import { getLogger } from '@/lib/logger';

const log = getLogger('useAIAutoTags');

interface TagStat {
  name: string;
  count: number;
  avgConfidence: number;
}

export function useAITagStats() {
  return useQuery({
    queryKey: queryKeys.aiFeatures.tagStats(),
    queryFn: async (): Promise<TagStat[]> => {
      const { data } = await supabase
        .from('ai_conversation_tags')
        .select('tag_name, confidence');
      if (!data) return [];

      const tagMap = new Map<string, { count: number; avgConfidence: number }>();
      data.forEach((t) => {
        const existing = tagMap.get(t.tag_name) || { count: 0, avgConfidence: 0 };
        existing.count += 1;
        existing.avgConfidence =
          (existing.avgConfidence * (existing.count - 1) + Number(t.confidence)) / existing.count;
        tagMap.set(t.tag_name, existing);
      });

      return Array.from(tagMap.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.count - a.count);
    },
  });
}

export function useRetagRecentContacts(onSuccess: (count: number | undefined) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(20);

      if (!contacts) return;

      let processed = 0;
      for (const contact of contacts) {
        try {
          await autoTag({ contactId: contact.id });
          processed++;
        } catch (e) {
          log.error('Error tagging contact:', contact.id, e);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      return processed;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiFeatures.tagStats() });
      onSuccess(count);
    },
  });
}
