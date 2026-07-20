import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactCustomFields');

/** Hook: Custom Field. */
export interface CustomField {
  id: string;
  contact_id: string;
  field_name: string;
  field_value: string | null;
  field_type: string;
  created_at: string;
  updated_at: string;
}

/** Hook: use Contact Custom Fields. */
export function useContactCustomFields(contactId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['contact-custom-fields', contactId] as const;

  const { data: fields = [], isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<CustomField[]> => {
      const { data, error } = await supabase
        .from('contact_custom_fields')
        .select('*')
        .eq('contact_id', contactId!)
        .order('field_name');
      if (error) {
        log.error('Error fetching custom fields:', error);
        throw error;
      }
      return (data || []) as CustomField[];
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  const addField = useCallback(async (fieldName: string, fieldValue: string, fieldType = 'text') => {
    if (!contactId) return;
    try {
      const { error } = await supabase
        .from('contact_custom_fields')
        .upsert({
          contact_id: contactId,
          field_name: fieldName,
          field_value: fieldValue,
          field_type: fieldType,
        });
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      log.error('Error adding custom field:', err);
      throw err;
    }
  }, [contactId, queryClient, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeField = useCallback(async (fieldId: string) => {
    try {
      const { error } = await supabase
        .from('contact_custom_fields')
        .delete()
        .eq('id', fieldId);
      if (error) throw error;
      queryClient.setQueryData<CustomField[]>(queryKey, prev => (prev ?? []).filter(f => f.id !== fieldId));
    } catch (err) {
      log.error('Error removing custom field:', err);
      throw err;
    }
  }, [queryClient, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { fields, isLoading, addField, removeField, refetch };
}
