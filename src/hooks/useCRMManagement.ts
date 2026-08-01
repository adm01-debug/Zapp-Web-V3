// Consolidated CRM & Customer Management Module (ETAPA 43)
// Consolidates: useContactIntelligence, useContactNotes, useContactEnrichedData, useContactAssignment, useContactCustomFields
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { isValidUUID } from '@/utils/uuid';

// Escape hatch de tipos: as tabelas contact_intelligence/contact_notes/
// contact_assignments/contact_custom_fields vivem no schema `zapp` da instância
// self-hosted, mas os types gerados no ambiente Lovable (Cloud) não as expõem.
// Enquanto scripts/gen-types-zapp.mjs não rodar contra a VPS, isolamos a
// tipagem apenas na fronteira do postgrest — a superfície pública do hook.
// ContactIntelligenceRow (types-manual) é o espelho verificado do banco
// (2026-07-31): campos abaixo são Pick de colunas REAIS — coluna inexistente
// (ex.: total_interactions) quebra o typecheck.
import type { ContactIntelligenceRow } from '@/integrations/supabase/types-manual';
type ContactIntelligence = Pick<
  ContactIntelligenceRow,
  'contact_id' | 'sentiment' | 'engagement_score' | 'predicted_value' | 'risk_level'
> & {
  sentiment: string;
  engagement_score: number;
  predicted_value: number;
  risk_level: string;
};

interface ContactNote {
  id: string;
  contact_id: string;
  content: string;
  author_id: string;
  created_at: string;
}

/**
 * ContactAssignment — espelho de zapp.contact_assignments (colunas reais da
 * migration 20260715_create_missing_schema_objects.sql:44-52).
 * UNIQUE (contact_id): no maximo 1 linha por contato.
 */
interface ContactAssignment {
  id: string;
  contact_id: string;
  assigned_to_user_id: string;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * EnrichedContactData — shape do RETURNS jsonb de zapp.enrich_contact(uuid)
 * (migration 20260724000005_fix_critical_sql_bugs.sql:149-174): objeto com
 * contact_id, enriched, source e data (row_to_json do contato).
 */
interface EnrichedContactData {
  contact_id: string;
  enriched: boolean;
  source: string;
  data: Record<string, unknown> | null;
}

/**
 * Converte o RETURNS Json de zapp.enrich_contact(uuid) para o shape
 * EnrichedContactData com guard: valores ausentes/atípicos viram defaults
 * (nunca lança — o hook só renderiza painel enriquecido quando há dados).
 */
function parseEnrichedContactData(value: unknown): EnrichedContactData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  return {
    contact_id: String(obj.contact_id ?? ''),
    enriched: Boolean(obj.enriched),
    source: String(obj.source ?? ''),
    data:
      obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)
        ? (obj.data as Record<string, unknown>)
        : null,
  };
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

  useEffect(() => {
    if (!contactId && mountedRef.current) setLoading(false);
  }, [contactId]);

  const fetchIntelligence = useCallback(async () => {
    if (!contactId || !isValidUUID(contactId)) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('contact_intelligence')
        .select('*')
        .eq('contact_id', contactId)
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

      if (err && err.code !== 'PGRST116') throw err;
      if (mountedRef.current) {
        setIntelligence(
          data
            ? {
                contact_id: data.contact_id ?? '',
                sentiment: data.sentiment ?? '',
                engagement_score: data.engagement_score ?? 0,
                predicted_value: data.predicted_value ?? 0,
                risk_level: data.risk_level ?? '',
              }
            : null
        );
      }
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

  useEffect(() => {
    if (!contactId && mountedRef.current) setLoading(false);
  }, [contactId]);

  const fetchNotes = useCallback(async () => {
    if (!contactId || !isValidUUID(contactId)) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (err) throw err;
      if (mountedRef.current) {
        setNotes(
          (data ?? []).map((n) => ({
            id: n.id ?? '',
            contact_id: n.contact_id ?? '',
            content: n.content ?? '',
            author_id: n.author_id ?? '',
            created_at: n.created_at ?? '',
          }))
        );
      }
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
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('Usuário não autenticado');
        // contact_notes.author_id is a FK to profiles.id (not profiles.user_id / auth.uid()).
        // Must look up the profile row first.
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profileErr) throw profileErr;
        if (!profile) throw new Error('Perfil não encontrado');
        const { error: err } = await supabase.from('contact_notes').insert({
          contact_id: contactId,
          content,
          author_id: profile.id,
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
  const [enrichedData, setEnrichedData] = useState<EnrichedContactData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contactId || !isValidUUID(contactId)) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchEnrichedData = async () => {
      try {
        const { data, error: err } = await supabase.rpc('enrich_contact', {
          p_contact_id: contactId,
        });

        if (cancelled) return;
        if (err) throw err;
        // Returns: Json — converte com guard para o shape EnrichedContactData.
        setEnrichedData(parseEnrichedContactData(data));
      } catch (err) {
        if (cancelled) return;
        log.error('Error enriching contact data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchEnrichedData();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return { enrichedData, loading };
}

export function useContactAssignmentManagement(contactId?: string) {
  const [assignment, setAssignment] = useState<ContactAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!contactId && mountedRef.current) setLoading(false);
  }, [contactId]);

  const fetchAssignment = useCallback(async () => {
    if (!contactId || !isValidUUID(contactId)) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('contact_assignments')
        .select('*')
        .eq('contact_id', contactId)
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

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

  useEffect(() => {
    if (!contactId && mountedRef.current) setLoading(false);
  }, [contactId]);

  const fetchFields = useCallback(async () => {
    if (!contactId || !isValidUUID(contactId)) return;

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
        // field_value é coluna text (string | null): converte valores não-string
        // com guard (null/undefined → null; demais tipos → serialização JSON).
        const serializedValue =
          fieldValue == null ? null : typeof fieldValue === 'string' ? fieldValue : JSON.stringify(fieldValue);
        const { error: err } = await supabase.from('contact_custom_fields').upsert({
          contact_id: contactId,
          field_name: fieldName,
          field_type: 'text',
          field_value: serializedValue,
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
