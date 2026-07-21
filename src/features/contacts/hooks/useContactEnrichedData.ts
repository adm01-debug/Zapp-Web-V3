import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { sanitizePostgrestFilter } from '@/lib/sanitize';
import { dbFrom } from '@/integrations/datasource/db';
import { isValidUUID } from '@/utils/uuid';

/** Enriched Contact Data interface definition. */
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

/** A I Conversation Tag interface definition. */
export interface AIConversationTag {
  id: string;
  tag_name: string;
  confidence: number | null;
  source: string | null;
}

/** S L A Info interface definition. */
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
 * Resolves the local `zapp.contacts.id` (UUID) for a given identifier that may be either:
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

/** use Contact Enriched Data function. */
export function useContactEnrichedData(contactId: string) {
  // Step 1 — resolve the FATOR X identifier into a local Lovable Cloud UUID.
  // Without this, JIDs were being passed straight into UUID columns, triggering 22P02 errors.
  const { data: localId } = useQuery({
    queryKey: queryKeys.contactDetails.localId(contactId),
    queryFn: () => resolveLocalContactId(contactId),
    enabled: !!contactId,
    staleTime: 5 * 60 * 1000, // 5min — phone→uuid mapping is essentially immutable
  });

  // Fetch enriched contact fields from DB
  const enrichedQuery = useQuery({
    queryKey: queryKeys.contactDetails.enriched(localId),
    queryFn: async () => {
      if (!localId) return null;
      const { data, error } = await dbFrom('contacts')
        .select('company, job_title, nickname, surname, contact_type, ai_sentiment, ai_priority, channel_type')
        .eq('id', localId)
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

      if (error) {
        log.error('Error fetching enriched contact data:', error);
        throw error;
      }
      if (!data) return null;
      const normalized: EnrichedContactData = {
        company: data.company ?? null,
        job_title: data.job_title ?? null,
        nickname: data.nickname ?? null,
        surname: data.surname ?? null,
        contact_type: data.contact_type ?? null,
        ai_sentiment: data.ai_sentiment ?? null,
        ai_priority: data.ai_priority ?? null,
        channel_type: data.channel_type ?? null,
      };
      return normalized;
    },
    enabled: !!localId,
    staleTime: 3 * 60 * 1000,
  });

  // Fetch AI conversation tags
  const aiTagsQuery = useQuery({
    queryKey: queryKeys.contactDetails.aiTags(localId),
    queryFn: async () => {
      if (!localId) return [] as AIConversationTag[];
      const { data, error } = await supabase
        .from('ai_conversation_tags')
        .select('id, tag_name, confidence, source')
        .eq('contact_id', localId)
        .order('confidence', { ascending: false });

      if (error) {
        log.error('Error fetching AI tags:', error);
        throw error;
      }
      // Normaliza cada tag — nenhum campo pode chegar como `undefined` aos consumidores.
      const rows = (data ?? []) as Array<Partial<AIConversationTag>>;
      return rows
        .filter((r) => typeof r?.id === 'string' && typeof r?.tag_name === 'string')
        .map<AIConversationTag>((r) => ({
          id: r.id as string,
          tag_name: r.tag_name as string,
          confidence: typeof r.confidence === 'number' ? r.confidence : null,
          source: typeof r.source === 'string' ? r.source : null,
        }));
    },
    enabled: !!localId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch SLA info
  const slaQuery = useQuery({
    queryKey: queryKeys.sla.contact(localId),
    queryFn: async () => {
      if (!localId) return null;
      const { data, error } = await supabase
        .from('conversation_sla')
        .select('first_response_breached, resolution_breached, first_response_at, resolved_at')
        .eq('contact_id', localId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        log.error('Error fetching SLA info:', error);
        throw error;
      }
      if (!data) return null;
      // Normaliza — booleans/datas nunca vêm como `undefined`.
      const normalized: SLAInfo = {
        first_response_breached:
          typeof data.first_response_breached === 'boolean' ? data.first_response_breached : null,
        resolution_breached:
          typeof data.resolution_breached === 'boolean' ? data.resolution_breached : null,
        first_response_at:
          typeof data.first_response_at === 'string' ? data.first_response_at : null,
        resolved_at: typeof data.resolved_at === 'string' ? data.resolved_at : null,
      };
      return normalized;
    },
    enabled: !!localId,
    staleTime: 2 * 60 * 1000,
  });

  // aiTags é SEMPRE um array (nunca undefined) — contrato garantido para consumidores da Inbox.
  const aiTags: AIConversationTag[] = aiTagsQuery.data ?? [];
  const slaInfo: SLAInfo | null = slaQuery.data ?? null;

  return {
    enrichedData: enrichedQuery.data ?? null,
    aiTags,
    slaInfo,
    // Estados de carregamento — expostos para placeholders/skeletons na Inbox.
    isLoadingEnriched: enrichedQuery.isLoading,
    isLoadingAITags: aiTagsQuery.isLoading,
    isLoadingSLA: slaQuery.isLoading,
    // Erros — expostos para banners de erro discretos.
    enrichedError: enrichedQuery.error as Error | null,
    aiTagsError: aiTagsQuery.error as Error | null,
    slaError: slaQuery.error as Error | null,
    // Retry helpers para o botão "Tentar novamente".
    refetchAITags: aiTagsQuery.refetch,
    refetchSLA: slaQuery.refetch,
  };
}