
// Consolidated CRM & Customer Management Module (ETAPA 43)
// Consolidates: useContactIntelligence, useContactNotes, useContactEnrichedData, useContactAssignment, useContactCustomFields
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

// Escape hatch de tipos: as tabelas contact_intelligence/contact_notes/
// contact_assignments/contact_custom_fields vivem no schema `zapp` da instância
// self-hosted, mas os types gerados no ambiente Lovable (Cloud) não as expõem.
// Enquanto scripts/gen-types-zapp.mjs não rodar contra a VPS, isolamos a
// tipagem apenas na fronteira do postgrest — a superfície pública do hook
interface ContactIntelligence {
  contact_id: string;
  sentiment: string;
  engagement_score: number;
  predicted_value: number;
  risk_level: string;
}

interface ContactNote {
  id: string;
  contact_id: string;
  content: string;
  author_id: string;
  created_at: string;
}

interface ContactCustomField {
  id: string;
  contact_id: string;
  field_name: string;
  field_value: unknown;
}

export function useContactIntelligenceManagement(contactId?: string) {
  const [intelligence, setIntelligence] = useState<ContactIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchIntelligence = useCallback(async () => {
    if (!contactId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('contact_intelligence')
        .select('*')
        .eq('contact_id', contactId)
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

      if (err && err.code !== 'PGRST116') throw err;
      if (mountedRef.current) setIntelligence(data || null);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching contact intelligence:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    if (contactId) fetchIntelligence();
  }, [contactId, fetchIntelligence]);

  return { intelligence, loading };
}

export function useContactNotesManagement(contactId?: string) {
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchNotes = useCallback(async () => {
    if (!contactId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (err) throw err;
      if (mountedRef.current) setNotes(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching contact notes:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [contactId]);

  const addNote = useCallback(
    async (content: string) => {
      if (!contactId) return;

      try {
        const { error: err } = await supabase.from('contact_notes').insert({
          contact_id: contactId,
          content,
        });

        if (err) throw err;
        await fetchNotes();
      } catch (err) {
        if (mountedRef.current) {
          log.error('Error adding contact note:', err);
        }
      }
    },
    [contactId, fetchNotes, mountedRef]
  );

  useEffect(() => {
    if (contactId) fetchNotes();
  }, [contactId, fetchNotes]);

  return { notes, loading, isLoading: loading, addNote, refetch: fetchNotes }; // ✅ fix: isLoading alias
}

export function useContactEnrichedDataManagement(contactId?: string) {
  const [enrichedData, setEnrichedData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contactId) return;

    const fetchEnrichedData = async () => {
      try {
        const { data, error: err } = await supabase.rpc('enrich_contact', { contact_id: contactId });

        if (err) throw err;
        setEnrichedData(data);
      } catch (err) {
        log.error('Error enriching contact data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEnrichedData();
  }, [contactId]);

  return { enrichedData, loading };
}

export function useContactAssignmentManagement(contactId?: string) {
  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAssignment = useCallback(async () => {
    if (!contactId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('contact_assignments')
        .select('*')
        .eq('contact_id', contactId)
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

      if (err && err.code !== 'PGRST116') throw err;
      if (mountedRef.current) setAssignment(data || null);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching contact assignment:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [contactId]);

  const assignToUser = useCallback(
    async (userId: string) => {
      if (!contactId) return;

      try {
        const { error: err } = await supabase
          .from('contact_assignments')
          .upsert({ contact_id: contactId, assigned_to_user_id: userId });

        if (err) throw err;
        await fetchAssignment();
      } catch (err) {
        if (mountedRef.current) {
          log.error('Error assigning contact:', err);
        }
      }
    },
    [contactId, fetchAssignment, mountedRef]
  );

  useEffect(() => {
    if (contactId) fetchAssignment();
  }, [contactId, fetchAssignment]);

  return { assignment, loading, assignToUser, refetch: fetchAssignment };
}

export function useContactCustomFieldsManagement(contactId?: string) {
  const [fields, setFields] = useState<ContactCustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchFields = useCallback(async () => {
    if (!contactId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('contact_custom_fields')
        .select('*')
        .eq('contact_id', contactId);

      if (err) throw err;
      if (mountedRef.current) setFields(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching custom fields:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [contactId]);

  const updateField = useCallback(
    async (fieldName: string, fieldValue: unknown) => {
      if (!contactId) return;

      try {
        const { error: err } = await supabase.from('contact_custom_fields').upsert({
          contact_id: contactId,
          field_name: fieldName,
          field_value: fieldValue,
        });

        if (err) throw err;
        await fetchFields();
      } catch (err) {
        if (mountedRef.current) {
          log.error('Error updating custom field:', err);
        }
      }
    },
    [contactId, fetchFields, mountedRef]
  );

  useEffect(() => {
    if (contactId) fetchFields();
  }, [contactId, fetchFields]);

  return { fields, loading, updateField, refetch: fetchFields };
}

export type { ContactIntelligence, ContactNote, ContactCustomField };
