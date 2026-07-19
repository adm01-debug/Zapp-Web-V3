import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactCustomFields');

export interface ContactCustomField {
  id?: string;
  contact_id: string;
  field_name: string;
  field_value: string;
  field_type?: string;
}

export function useContactCustomFields(contactId: string | undefined) {
  const [fields, setFields] = useState<ContactCustomField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchFields = useCallback(async () => {
    if (!contactId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('contact_custom_fields')
        .select('*')
        .eq('contact_id', contactId)
        .order('field_name', { ascending: true });

      if (error) throw error;
      if (mountedRef.current) setFields(data || []);
    } catch (err) {
      log.error('Error fetching custom fields:', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [contactId]);

  const addField = useCallback(
    async (fieldName: string, fieldValue: string, fieldType = 'text') => {
      if (!contactId) return;

      const requestedId = contactId;
      try {
        const { error } = await supabase.from('contact_custom_fields').upsert(
          {
            contact_id: requestedId,
            field_name: fieldName,
            field_value: fieldValue,
            field_type: fieldType,
          },
          { onConflict: 'contact_id,field_name' }
        );

        if (error) throw error;
        if (mountedRef.current && contactId === requestedId) await fetchFields();
      } catch (err) {
        log.error('Error adding custom field:', err);
      }
    },
    [contactId, fetchFields]
  );

  const removeField = useCallback(async (fieldId: string) => {
    try {
      const { error } = await supabase
        .from('contact_custom_fields')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;
      if (mountedRef.current) setFields((prev) => prev.filter((f) => f.id !== fieldId));
    } catch (err) {
      log.error('Error removing custom field:', err);
    }
  }, []);

  useEffect(() => {
    if (contactId) fetchFields();
    else {
      setFields([]);
      setIsLoading(false);
    }
  }, [contactId, fetchFields]);

  return { fields, isLoading, addField, removeField, refetch: fetchFields };
}
