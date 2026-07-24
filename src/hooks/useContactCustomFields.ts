import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactCustomFields');

/** Hook: Contact Custom Field. */
export interface ContactCustomField {
  id?: string;
  contact_id: string;
  field_name: string;
  field_value: string;
  field_type?: string;
}

/** Hook: use Contact Custom Fields. */
export function useContactCustomFields(contactId: string | undefined) {
  const queryClient = useQueryClient();
  const FIELDS_KEY = ['contact-custom-fields', contactId] as const;

  const { data: fields = [], isLoading, refetch } = useQuery({
    queryKey: FIELDS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_custom_fields')
        .select('*')
        .eq('contact_id', contactId!)
        .order('field_name', { ascending: true });

      if (error) {
        log.error('Error fetching custom fields:', error);
        throw error;
      }
      return (data || []) as ContactCustomField[];
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  const addField = useCallback(
    async (fieldName: string, fieldValue: string, fieldType = 'text') => {
      if (!contactId) return;
      try {
        const { error } = await supabase.from('contact_custom_fields').upsert(
          {
            contact_id: contactId,
            field_name: fieldName,
            field_value: fieldValue,
            field_type: fieldType,
          },
          { onConflict: 'contact_id,field_name' }
        );
        if (error) throw error;
        void queryClient.invalidateQueries({ queryKey: FIELDS_KEY });
      } catch (err) {
        log.error('Error adding custom field:', err);
      }
    },
    [contactId, queryClient]
  );

  const removeField = useCallback(
    async (fieldId: string) => {
      try {
        const { error } = await supabase
          .from('contact_custom_fields')
          .delete()
          .eq('id', fieldId);
        if (error) throw error;
        void queryClient.invalidateQueries({ queryKey: FIELDS_KEY });
      } catch (err) {
        log.error('Error removing custom field:', err);
      }
    },
    [queryClient, contactId]
  );

  return { fields, isLoading, addField, removeField, refetch };
}
