// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactCustomFields');

export interface CustomField {
  id: string;
  contact_id: string;
  field_name: string;
  field_value: string | null;
  field_type: string;
  created_at: string;
  updated_at: string;
}

export function useContactCustomFields(contactId: string | undefined) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchFields = useCallback(async () => {
    if (!contactId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('contact_custom_fields')
        .select('*')
        .eq('contact_id', contactId)
        .order('field_name');
      if (!mountedRef.current) return;
      if (error) throw error;
      setFields((data || []) as CustomField[]);
    } catch (err) {
      log.error('Error fetching custom fields:', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void fetchFields();
  }, [fetchFields]);

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
      await fetchFields();
    } catch (err) {
      log.error('Error adding custom field:', err);
      throw err;
    }
  }, [contactId, fetchFields]);

  const removeField = useCallback(async (fieldId: string) => {
    try {
      const { error } = await supabase
        .from('contact_custom_fields')
        .delete()
        .eq('id', fieldId);
      if (error) throw error;
      setFields(prev => prev.filter(f => f.id !== fieldId));
    } catch (err) {
      log.error('Error removing custom field:', err);
      throw err;
    }
  }, []);

  return { fields, isLoading, addField, removeField, refetch: fetchFields };
}
