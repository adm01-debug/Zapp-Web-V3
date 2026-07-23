// Consolidated CRM & Customer Management Module (ETAPA 43)
// Consolidates: useContactIntelligence, useContactNotes, useContactEnrichedData, useContactAssignment, useContactCustomFields
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

/** Fetches AI-derived sentiment, engagement score, and risk level for a contact from contact_intelligence. */
export function useContactIntelligenceManagement(contactId?: string) {
  const { data: intelligence = null, isLoading: loading } = useQuery({
    queryKey: ['contact-intelligence', contactId] as const,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('contact_intelligence')
        .select('*')
        .eq('contact_id', contactId!)
        .maybeSingle();

      if (err && err.code !== 'PGRST116') throw err;
      return (data || null) as ContactIntelligence | null;
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  return { intelligence, loading };
}

/** Loads and creates timestamped notes for a contact, resolving the author profile from the current session. */
export function useContactNotesManagement(contactId?: string) {
  const queryClient = useQueryClient();
  const NOTES_KEY = ['contact-notes', contactId] as const;

  const { data: notes = [], isLoading: loading, refetch } = useQuery({
    queryKey: NOTES_KEY,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contactId!)
        .order('created_at', { ascending: false });

      if (err) throw err;
      return (data || []) as ContactNote[];
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

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

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!profile) throw new Error('Perfil não encontrado');

        const { error: err } = await supabase.from('contact_notes').insert({
          contact_id: contactId,
          content,
          author_id: profile.id,
        });

        if (err) throw err;
        void queryClient.invalidateQueries({ queryKey: NOTES_KEY });
      } catch (err) {
        log.error('Error adding contact note:', err);
      }
    },
    [contactId, queryClient, NOTES_KEY]
  );

  return { notes, loading, isLoading: loading, addNote, refetch };
}

/** Calls the `enrich_contact` RPC to retrieve third-party enriched data (LinkedIn, company info, etc.) for a contact. */
export function useContactEnrichedDataManagement(contactId?: string) {
  const { data: enrichedData = null, isLoading: loading } = useQuery({
    queryKey: ['contact-enriched', contactId] as const,
    queryFn: async () => {
      const { data, error: err } = await supabase.rpc('enrich_contact', {
        contact_id: contactId!,
      });

      if (err) throw err;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data as any;
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });

  return { enrichedData, loading };
}

/** Manages the agent assignment record for a contact, exposing `assignToUser` to upsert an assignment. */
export function useContactAssignmentManagement(contactId?: string) {
  const queryClient = useQueryClient();
  const ASSIGNMENT_KEY = ['contact-assignment', contactId] as const;

  const { data: assignment = null, isLoading: loading, refetch } = useQuery({
    queryKey: ASSIGNMENT_KEY,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('contact_assignments')
        .select('*')
        .eq('contact_id', contactId!)
        .maybeSingle();

      if (err && err.code !== 'PGRST116') throw err;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || null) as any;
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  const assignToUser = useCallback(
    async (userId: string) => {
      if (!contactId) return;

      try {
        const { error: err } = await supabase
          .from('contact_assignments')
          .upsert({ contact_id: contactId, assigned_to_user_id: userId });

        if (err) throw err;
        void queryClient.invalidateQueries({ queryKey: ASSIGNMENT_KEY });
      } catch (err) {
        log.error('Error assigning contact:', err);
      }
    },
    [contactId, queryClient, ASSIGNMENT_KEY]
  );

  return { assignment, loading, assignToUser, refetch };
}

/** Fetches and upserts arbitrary key-value custom fields for a contact from contact_custom_fields. */
export function useContactCustomFieldsManagement(contactId?: string) {
  const queryClient = useQueryClient();
  const FIELDS_KEY = ['contact-custom-fields-mgmt', contactId] as const;

  const { data: fields = [], isLoading: loading, refetch } = useQuery({
    queryKey: FIELDS_KEY,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('contact_custom_fields')
        .select('*')
        .eq('contact_id', contactId!);

      if (err) throw err;
      return (data || []) as ContactCustomField[];
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

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
        void queryClient.invalidateQueries({ queryKey: FIELDS_KEY });
      } catch (err) {
        log.error('Error updating custom field:', err);
      }
    },
    [contactId, queryClient, FIELDS_KEY]
  );

  return { fields, loading, updateField, refetch };
}

/** Re-exported module members. */
export type { ContactIntelligence, ContactNote, ContactCustomField };
