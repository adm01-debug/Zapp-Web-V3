/**
 * contactsDB.ts — Bridge layer for contact operations on the EXTERNAL CRM database
 *
 * ARCHITECTURE:
 * - Contacts live in the EXTERNAL Supabase (GESTÃO DE CLIENTES / pgxfvjmuubtbowutlide)
 * - NOT in the Lovable Cloud DB (allrjhkpuscmgbsnmjlv)
 * - This module provides typed CRUD helpers that always use the correct database
 *
 * Tables on External DB:
 *   contacts (49 cols), contact_notes, contact_phones, contact_emails,
 *   contact_addresses, contact_social_media, contact_preferences,
 *   contact_relatives, contact_cadence, contact_time_analysis
 *
 * Usage:
 *   import { contactsDB } from '@/lib/contactsDB';
 *   const contact = await contactsDB.getById(id);
 *   await contactsDB.update(id, { first_name: 'João' });
 */
import { getExternalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ─────────────────────────────────────────────────────
export interface ExternalContact {
  id: string;
  user_id: string;
  company_id: string | null;
  bitrix_contact_id: number | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  nome_tratamento: string | null;
  apelido: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  cargo: string | null;
  departamento: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  birthday: string | null;
  sexo: string | null;
  avatar_url: string | null;
  role: string | null;
  role_title: string | null;
  notes: string | null;
  personal_notes: string | null;
  tags: string[] | null;
  tags_array: string[] | null;
  interests: string[] | null;
  interests_array: string[] | null;
  hobbies: string[] | null;
  family_info: string | null;
  relationship_stage: string | null;
  relationship_score: number | null;
  sentiment: string | null;
  behavior: Record<string, unknown> | null;
  life_events: unknown[] | null;
  linkedin: string | null;
  instagram: string | null;
  twitter: string | null;
  source: string | null;
  extra_data: Record<string, unknown> | null;
  is_duplicate: boolean | null;
  duplicate_of: string | null;
  search_vector: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactNote {
  id: string;
  contact_id: string;
  user_id: string;
  content: string;
  author_name?: string; // Virtual field for display
  note_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactPhone {
  id: string;
  contact_id: string;
  phone: string;
  phone_type: string | null;
  is_primary: boolean;
  is_whatsapp: boolean;
  created_at: string;
}

export interface ContactEmail {
  id: string;
  contact_id: string;
  email: string;
  email_type: string | null;
  is_primary: boolean;
  created_at: string;
}

// ─── Client getter with safety ────────────────────────────────
function getClient(): SupabaseClient {
  const client = getExternalSupabase();
  if (!client) {
    throw new Error(
      '[contactsDB] External Supabase not configured. ' +
        'Set VITE_EXTERNAL_SUPABASE_URL and VITE_EXTERNAL_SUPABASE_ANON_KEY. ' +
        'Contacts live on the external CRM database, not Lovable Cloud.'
    );
  }
  return client;
}

// ─── Contact CRUD ─────────────────────────────────────────────
export const contactsDB = {
  /** Check if external DB is configured */
  get isConfigured() {
    return isExternalConfigured;
  },

  /** Get contact by ID */
  async getById(contactId: string): Promise<ExternalContact | null> {
    const { data, error } = await getClient()
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data as ExternalContact | null;
  },

  /** Find contact by phone number (cleaned digits only) */
  async findByPhone(phone: string): Promise<ExternalContact | null> {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 8) return null;

    const { data, error } = await getClient()
      .from('contacts')
      .select('*')
      .or(`phone.ilike.%${cleaned}%,whatsapp.ilike.%${cleaned}%`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as ExternalContact | null;
  },

  /** Find contact by phone via contact_phones table */
  async findByPhoneTable(phone: string): Promise<ExternalContact | null> {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 8) return null;

    const { data, error } = await getClient()
      .from('contact_phones')
      .select('contact_id, contacts!inner(*)')
      .ilike('phone', `%${cleaned}%`)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return (data as typeof data & { contacts: ExternalContact }).contacts;
  },

  /** Update contact fields */
  async update(
    contactId: string,
    fields: Partial<ExternalContact>
  ): Promise<ExternalContact | null> {
    const { updated_at: _updated_at, ...rest } = fields;
    const { data, error } = await getClient()
      .from('contacts')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .select()
      .single();
    if (error) throw error;
    return data as ExternalContact;
  },

  /** Update avatar URL */
  async updateAvatar(contactId: string, avatarUrl: string): Promise<void> {
    const { error } = await getClient()
      .from('contacts')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', contactId);
    if (error) throw error;
  },

  /** Search contacts by name, email, phone */
  async search(query: string, limit = 20): Promise<ExternalContact[]> {
    const cleaned = query.trim();
    if (!cleaned) return [];

    const { data, error } = await getClient()
      .from('contacts')
      .select('*')
      .is('deleted_at', null)
      .or(
        `full_name.ilike.%${cleaned}%,` +
          `first_name.ilike.%${cleaned}%,` +
          `last_name.ilike.%${cleaned}%,` +
          `email.ilike.%${cleaned}%,` +
          `phone.ilike.%${cleaned}%,` +
          `whatsapp.ilike.%${cleaned}%,` +
          `apelido.ilike.%${cleaned}%`
      )
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ExternalContact[];
  },

  /** List contacts with pagination */
  async list(options: {
    userId: string;
    offset?: number;
    limit?: number;
    orderBy?: string;
    ascending?: boolean;
  }): Promise<{ data: ExternalContact[]; count: number | null }> {
    const { userId, offset = 0, limit = 50, orderBy = 'updated_at', ascending = false } = options;
    const { data, error, count } = await getClient()
      .from('contacts')
      .select('*', { count: 'estimated' })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order(orderBy, { ascending })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return { data: (data ?? []) as ExternalContact[], count };
  },

  // ─── Notes ──────────────────────────────────────────────────
  notes: {
    async list(contactId: string): Promise<ContactNote[]> {
      const { data, error } = await getClient()
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ContactNote[];
    },

    async create(note: {
      contact_id: string;
      user_id: string;
      content: string;
      note_type?: string;
    }): Promise<ContactNote> {
      const { data, error } = await getClient()
        .from('contact_notes')
        .insert(note)
        .select()
        .single();
      if (error) throw error;
      return data as ContactNote;
    },

    async update(noteId: string, content: string): Promise<void> {
      const { error } = await getClient()
        .from('contact_notes')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', noteId);
      if (error) throw error;
    },

    async delete(noteId: string): Promise<void> {
      const { error } = await getClient().from('contact_notes').delete().eq('id', noteId);
      if (error) throw error;
    },
  },

  // ─── Phones ─────────────────────────────────────────────────
  phones: {
    async list(contactId: string): Promise<ContactPhone[]> {
      const { data, error } = await getClient()
        .from('contact_phones')
        .select('*')
        .eq('contact_id', contactId)
        .order('is_primary', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactPhone[];
    },
  },

  // ─── Emails ─────────────────────────────────────────────────
  emails: {
    async list(contactId: string): Promise<ContactEmail[]> {
      const { data, error } = await getClient()
        .from('contact_emails')
        .select('*')
        .eq('contact_id', contactId)
        .order('is_primary', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactEmail[];
    },
  },

  // ─── Duplicates ─────────────────────────────────────────────
  duplicates: {
    async findSimilar(phone: string, name: string, limit = 5): Promise<ExternalContact[]> {
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.length < 8 && !name) return [];

      const conditions: string[] = [];
      if (cleaned.length >= 8) {
        conditions.push(`phone.ilike.%${cleaned.slice(-8)}%`);
        conditions.push(`whatsapp.ilike.%${cleaned.slice(-8)}%`);
      }
      if (name && name.length >= 3) {
        conditions.push(`full_name.ilike.%${name}%`);
        conditions.push(`first_name.ilike.%${name}%`);
      }

      if (conditions.length === 0) return [];

      const { data, error } = await getClient()
        .from('contacts')
        .select('*')
        .is('deleted_at', null)
        .or(conditions.join(','))
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ExternalContact[];
    },
  },
};

export default contactsDB;
