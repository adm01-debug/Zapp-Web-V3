/**
 * useContacts.ts — v3.2 FINAL
 * Main contacts hook using evolution_contacts table (real schema).
 * Provides: CRUD, pagination, filters, undo-delete, optimistic updates.
 *
 * Uses RPCs: soft_delete_contact, bulk_soft_delete_contacts, restore_contact
 */
import { useState, useCallback, useRef } from 'react';
import React from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { sanitizeContactFields } from '@/lib/sanitize';
import { dbFrom } from '@/integrations/datasource/db';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContacts');

// ── Types ──────────────────────────────────────────────────────────────────

export interface Contact {
  id:                   string;
  remote_jid:           string;
  phone_number:         string | null;
  full_name:            string | null;
  push_name:            string | null;
  email:                string | null;
  company:              string | null;
  lead_status:          string;
  lead_score:           number;
  tags:                 string[];
  notes:                string | null;
  instance_name:        string;
  assigned_to:          string | null;
  profile_picture_url:  string | null;
  deleted_at:           string | null;
  lgpd_consent_at:      string | null;
  lgpd_opt_out_at:      string | null;
  lgpd_consent_channel?: string | null;
  lgpd_marketing_consent?: boolean | null;
  lgpd_data_sharing?:   boolean | null;
  lgpd_profiling?:      boolean | null;
  dedup_hash:           string | null;
  last_message_at:      string | null;
  created_at:           string;
  updated_at:           string;
  version:              number;
  surname?:             string | null;
  nickname?:            string | null;
  job_title?:           string | null;
  contact_type?:        string | null;
  name?:                string | null;
  phone?:               string | null;
  avatar_url?:          string | null;
  // Optional aggregates / metadata returned by some FATOR X RPCs / views.
  total_messages?:      number | null;
  first_contact_at?:    string | null;
  merge_source_id?:     string | null;
}

export interface ContactFilters {
  search:       string;
  lead_status:  string | null;
  tags:         string[];
  assigned_to:  string | null;
  sort_field:   'last_message_at' | 'full_name' | 'created_at' | 'lead_score';
  sort_order:   'asc' | 'desc';
  instance_name: string;
}

const DEFAULT_FILTERS: ContactFilters = {
  search:       '',
  lead_status:  null,
  tags:         [],
  assigned_to:  null,
  sort_field:   'last_message_at',
  sort_order:   'desc',
  instance_name: DEFAULT_WHATSAPP_INSTANCE,
};

const PAGE_SIZE = 50;

// ── Mapper ─────────────────────────────────────────────────────────────────

function mapRow(raw: Record<string, unknown>): Contact {
  const sanitized = sanitizeContactFields(raw);
  return {
    id:                   String(raw.id),
    remote_jid:           String(sanitized.remote_jid ?? ''),
    phone_number:         sanitized.phone_number as string | null,
    full_name:            sanitized.full_name as string | null,
    push_name:            sanitized.push_name as string | null,
    email:                sanitized.email as string | null,
    company:              sanitized.company as string | null,
    lead_status:          String(raw.lead_status ?? 'novo'),
    lead_score:           Number(raw.lead_score ?? 0),
    tags:                 Array.isArray(raw.tags) ? (raw.tags as string[]).map(String) : [],
    notes:                sanitized.notes as string | null,
    instance_name:        String(raw.instance_name ?? DEFAULT_WHATSAPP_INSTANCE),
    assigned_to:          raw.assigned_to as string | null,
    profile_picture_url:  raw.profile_picture_url as string | null,
    deleted_at:           raw.deleted_at as string | null,
    lgpd_consent_at:      raw.lgpd_consent_at as string | null,
    lgpd_opt_out_at:      raw.lgpd_opt_out_at as string | null,
    lgpd_consent_channel: raw.lgpd_consent_channel as string | null,
    lgpd_marketing_consent: typeof raw.lgpd_marketing_consent === 'boolean' ? raw.lgpd_marketing_consent : null,
    lgpd_data_sharing:    typeof raw.lgpd_data_sharing === 'boolean' ? raw.lgpd_data_sharing : null,
    lgpd_profiling:       typeof raw.lgpd_profiling === 'boolean' ? raw.lgpd_profiling : null,
    dedup_hash:           raw.dedup_hash as string | null,
    last_message_at:      raw.last_message_at as string | null,
    created_at:           String(raw.created_at ?? ''),
    updated_at:           String(raw.updated_at ?? ''),
    version:              Number(raw.version ?? 1),
    surname:              sanitized.surname as string | null | undefined,
    nickname:             sanitized.nickname as string | null | undefined,
    job_title:            sanitized.job_title as string | null | undefined,
    contact_type:         sanitized.contact_type as string | null | undefined,
    name:                 sanitized.name as string | null | undefined,
    phone:                sanitized.phone as string | null | undefined,
    avatar_url:           sanitized.avatar_url as string | null | undefined,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useContacts() {
  const { toast } = useToast();
  const [contacts,    setContacts]    = useState<Contact[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [total,       setTotal]       = useState(0);
  const [filters,     setFilters]     = useState<ContactFilters>(DEFAULT_FILTERS);
  const cursorRef = useRef<string | null>(null);
  const undoTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Build query ──────────────────────────────────────────────────────────

  const buildQuery = useCallback((f: ContactFilters) => {
    let q = dbFrom('contacts')
      .select([
        'id','remote_jid','phone_number','full_name','push_name','email',
        'company','lead_status','lead_score','tags','notes','instance_name',
        'assigned_to','profile_picture_url','deleted_at','lgpd_consent_at',
        'lgpd_opt_out_at','dedup_hash','last_message_at','created_at','updated_at','version',
      ].join(','), { count: 'exact' })
      .is('deleted_at', null)
      .eq('instance_name', f.instance_name)
      .limit(PAGE_SIZE);

    if (f.lead_status)  q = q.eq('lead_status', f.lead_status);
    if (f.assigned_to)  q = q.eq('assigned_to', f.assigned_to);
    if (f.tags.length)  q = q.overlaps('tags', f.tags);
    if (f.search?.trim()) {
      const s = f.search.trim();
      q = q.or(`full_name.ilike.%${s}%,phone_number.ilike.%${s}%,email.ilike.%${s}%,push_name.ilike.%${s}%`);
    }

    q = q.order(f.sort_field, { ascending: f.sort_order === 'asc', nullsFirst: false });
    return q;
  }, []);

  // ── Load contacts ────────────────────────────────────────────────────────

  const loadContacts = useCallback(async (overrideFilters?: Partial<ContactFilters>) => {
    const f = { ...filters, ...overrideFilters };
    setLoading(true);
    setContacts([]);
    cursorRef.current = null;

    try {
      const { data, count, error } = await buildQuery(f);
      if (error) throw error;
      
      const items = (data ?? []).map(mapRow);
      const last  = items[items.length - 1];
      cursorRef.current = last ? String((last as Record<string, unknown>)[f.sort_field] ?? '') : null;
      setContacts(items);
      setTotal(count ?? items.length);
      setHasMore(items.length === PAGE_SIZE);
    } catch (err) {
      log.error('Error loading contacts', err);
      toast({ title: 'Erro ao carregar contatos', description: String(err), variant: 'destructive' });
    } finally { 
      setLoading(false); 
    }
  }, [filters, buildQuery, toast]);

  // ── Load more ────────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      let q = buildQuery(filters);
      q = filters.sort_order === 'asc'
        ? q.gt(filters.sort_field, cursorRef.current)
        : q.lt(filters.sort_field, cursorRef.current);
      const { data, error } = await q;
      if (error) throw error;
      const newItems = (data ?? []).map(mapRow);
      const last = newItems[newItems.length - 1];
      if (last) cursorRef.current = String((last as Record<string, unknown>)[filters.sort_field] ?? '');
      setContacts((prev) => [...prev, ...newItems]);
      setHasMore(newItems.length === PAGE_SIZE);
    } finally { setLoadingMore(false); }
  }, [loadingMore, hasMore, filters, buildQuery]);

  // ── Update filters ───────────────────────────────────────────────────────

  const updateFilters = useCallback((updates: Partial<ContactFilters>) => {
    const newFilters = { ...filters, ...updates };
    setFilters(newFilters);
    loadContacts(newFilters);
  }, [filters, loadContacts]);

  // ── Delete with undo (5 seconds) ─────────────────────────────────────────

  const deleteContactsWithUndo = useCallback(async (ids: string[], label: string) => {
    // Optimistic: remove from list
    setContacts((prev) => prev.filter((c) => !ids.includes(c.id)));
    setTotal((t) => Math.max(0, t - ids.length));

    const timer = undoTimerRef.current;

    toast({
      title: `🗑️ ${label} excluído`,
      description: 'Você tem 5 segundos para desfazer.',
      duration: 5_000,
      action: (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={async () => {
            // Cancel the delete
            const timerId = timer.get(ids.join(','));
            if (timerId) clearTimeout(timerId);
            timer.delete(ids.join(','));

            // Restore optimistically
            try {
              await loadContacts();
              toast({ title: '↩️ Restaurado!', duration: 2_500 });
            } catch {
              toast({ title: 'Erro ao restaurar contato', variant: 'destructive' });
            }
          }}
        >
          Desfazer
        </Button>
      ) as React.ReactElement,
    });

    // Schedule actual delete after 5s
    const timerId = setTimeout(async () => {
      timer.delete(ids.join(','));
      const { error } = await safeClient.rpc('bulk_soft_delete_contacts', {
        p_contact_ids: ids,
        p_reason:      'user_deleted',
      });
      if (error) {
        log.error('Bulk delete failed', error);
        // Reload to get correct state
        loadContacts();
      }
    }, 5_000);

    timer.set(ids.join(','), timerId);
  }, [toast, loadContacts]);

  // ── Update single contact optimistically ─────────────────────────────────

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    // Optimistic
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));

    const { error } = await dbFrom('contacts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      // Revert
      await loadContacts();
      throw error;
    }
  }, [loadContacts]);

  return {
    contacts, loading, loadingMore, hasMore, total, filters,
    loadContacts, loadMore, updateFilters,
    deleteContactsWithUndo, updateContact,
  };
}

export default useContacts;
