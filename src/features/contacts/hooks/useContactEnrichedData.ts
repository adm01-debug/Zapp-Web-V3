import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { sanitizePostgrestFilter } from '@/lib/sanitize';
import { dbFrom } from '@/integrations/datasource/db';
import { isValidUUID } from '@/utils/uuid';

export interface EnrichedContactData {
  company: string | null;
  job_title: string | null;
  nickname: string | null;
  surname: string | null;
  contact_type: string | null;
  ai_sentiment: string | null;
  ai_priority: string | null;
  channel_type: string | null;
}

export interface AIConversationTag {
  id: string;
  tag_name: string;
  confidence: number | null;
  source: string | null;
}

export interface SLAInfo {
  first_response_breached: boolean | null;
  resolution_breached: boolean | null;
  first_response_at: string | null;
  resolved_at: string | null;
}

/**
 * Extracts the digits from a WhatsApp JID (e.g. "5511999999999@s.whatsapp.net" -> "5511999999999").
 * Returns null when the input doesn't look like a JID.
 */
function jidToPhone(value: string): string | null {
  if (!value || !value.includes('@')) return null;
  const local = value.split('@')[0]?.split(':')[0] ?? '';
  const digits = local.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

/**
 * Resolves the local `public.contacts.id` (UUID) for a given identifier that may be either:
 *   - a real UUID (returned as-is)
 *   - a WhatsApp JID coming from FATOR X (looked up by phone)
 * Returns `null` when no local contact exists — callers must skip enriched queries in that case.
 *
 * DRY FIX: uses isValidUUID from @/utils/uuid instead of an inline UUID_REGEX.
 */
async function resolveLocalContactId(identifier: string): Promise<string | null> {
  if (!identifier) return null;
  // DRY: delegate UUID check to the canonical helper
  if (isValidUUID(identifier)) return identifier;

  const phone = jidToPhone(identifier);
  if (!phone) return null;
  const safePhone = sanitizePostgrestFilter(phone);

  // Try exact match first, then trailing-digits fallback for stored numbers with country code variations
  const { data, error } = await dbFrom('contacts')
    .select('id')
    .or(`phone.eq.${safePhone},phone.eq.+${safePhone},phone.ilike.%${safePhone.slice(-8)}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    log.warn('resolveLocalContactId lookup failed', { phone, error: error.message });
    return null;
  }
  return data?.id ?? null;
}

export function useContactEnrichedData(contactId: string) {
  // Step 1 — resolve the FATOR X identifier into a local Lovable Cloud UUID.
  // Without this, JIDs were being passed straight into UUID columns, triggering 22P02 errors.
  const { data: localId } = useQuery({
    queryKey: ['contact-local-id', contactId],
    queryFn: () => resolveLocalContactId(contactId),
    enabled: !!contactId,
    staleTime: 5 * 60 * 1000, // 5min — phone→uuid mapping is essentially immutable
  });

  // Fetch enriched contact fields from DB
  const { data: enrichedData } = useQuery({
    queryKey: ['contact-enriched', localId],
    queryFn: async () => {
      const { data, error } = await dbFrom('contacts')
        .select('company, job_title, nickname, surname, contact_type, ai_sentiment, ai_priority, channel_type')
        .eq('id', localId!)
        .single();

      if (error) {
        log.error('Error fetching enriched contact data:', error);
        return null;
      }
      return data as EnrichedContactData; // ignore-audit: narrows Supabase query result to local interface
    },
    enabled: !!localId,
  });

  // Fetch AI conversation tags
  const { data: aiTags = [] } = useQuery({
    queryKey: ['contact-ai-tags', localId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_conversation_tags')
        .select('id, tag_name, confidence, source')
        .eq('contact_id', localId!)
        .order('confidence', { ascending: false });

      if (error) {
        log.error('Error fetching AI tags:', error);
        return [];
      }
      return data as AIConversationTag[]; // ignore-audit: narrows Supabase query result to local interface
    },
    enabled: !!localId,
  });

  // Fetch SLA info
  const { data: slaInfo } = useQuery({
    queryKey: ['contact-sla', localId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_sla')
        .select('first_response_breached, resolution_breached, first_response_at, resolved_at')
        .eq('contact_id', localId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        log.error('Error fetching SLA info:', error);
        return null;
      }
      return data as SLAInfo | null; // ignore-audit: narrows Supabase query result to local interface
    },
    enabled: !!localId,
  });

  return { enrichedData, aiTags, slaInfo };
}
