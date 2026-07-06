/**
 * useEmailTracking.ts — Hook completo para rastreio de emails
 *
 * Funcionalidades:
 * - Criar tracking para email enviado (injeta pixel + links rastreados)
 * - Consultar estatísticas de rastreio
 * - Listar emails rastreados com status de abertura
 * - Ver eventos de abertura de um email específico
 * - Top contatos por engagement score
 * - Gerar URL do pixel e dos links rastreados
 */

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface TrackedEmail {
  id:               string;
  tracking_id:      string;
  recipient_email:  string;
  recipient_name:   string | null;
  sender_email:     string;
  subject:          string | null;
  delivery_status:  'sent' | 'delivered' | 'bounced' | 'deferred' | 'failed';
  open_count:       number;
  click_count:      number;
  first_opened_at:  string | null;
  last_opened_at:   string | null;
  created_at:       string;
}

export interface TrackingEvent {
  id:          string;
  event_type:  'open' | 'pixel' | 'beacon' | 'forward';
  ip_address:  string | null;
  device_type: string | null;
  browser:     string | null;
  os:          string | null;
  country:     string | null;
  city:        string | null;
  is_self_open: boolean;
  is_bot:       boolean;
  created_at:   string;
}

export interface TrackedLink {
  id:              string;
  link_id:         string;
  original_url:    string;
  display_text:    string | null;
  click_count:     number;
  first_clicked_at: string | null;
  last_clicked_at:  string | null;
}

export interface TrackingStats {
  total_tracked:       number;
  total_opens:         number;
  total_clicks:        number;
  unique_opens:        number;
  open_rate:           number;
  click_rate:          number;
  bounce_count:        number;
  avg_opens_per_email: number | null;
  period_days:         number;
}

export interface TopContact {
  email:             string;
  display_name:      string | null;
  engagement_score:  number;
  total_opens:       number;
  total_clicks:      number;
  last_interaction:  string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';

// Schema-aware client for email_app tables (module-level to avoid stale closures)
const emailDb = (supabase as unknown as SupabaseClient).schema('email_app');

/** Gera URL do pixel de rastreio */
export function getTrackingPixelUrl(trackingId: string): string {
  return `${SUPABASE_URL}/functions/v1/email-track-pixel?t=${trackingId}`;
}

/** Gera tag <img> do pixel (para inserir no HTML do email) */
export function getTrackingPixelHtml(trackingId: string): string {
  const url = getTrackingPixelUrl(trackingId);
  return `<img src="${url}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;
}

/** Gera URL de link rastreado */
export function getTrackedLinkUrl(linkId: string): string {
  return `${SUPABASE_URL}/functions/v1/email-track-link?l=${linkId}`;
}

/** Substitui links no HTML por links rastreados */
export function injectTrackedLinks(
  html: string,
  links: Array<{ link_id: string; original_url: string }>,
): string {
  let result = html;
  for (const link of links) {
    const trackedUrl = getTrackedLinkUrl(link.link_id);
    // Substitui a URL original pela rastreada (em href="...")
    result = result.replace(
      new RegExp(`href=["']${escapeRegex(link.original_url)}["']`, 'g'),
      `href="${trackedUrl}"`,
    );
  }
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Hook Principal ────────────────────────────────────────────────────────

export function useEmailTracking() {
  const [trackedEmails, setTrackedEmails] = useState<TrackedEmail[]>([]);
  const [stats, setStats]                 = useState<TrackingStats | null>(null);
  const [topContacts, setTopContacts]     = useState<TopContact[]>([]);
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // ── Criar tracking para um email enviado ───────────────────────────────
  const createTracking = useCallback(async (params: {
    accountId:      string;
    provider?:      'email' | 'outlook';
    recipientEmail: string;
    recipientName?: string;
    senderEmail:    string;
    subject:        string;
    threadId?:      string;
    emailMessageId?: string;
    bodyHtml:       string;
    trackLinks?:    boolean;
  }): Promise<{
    trackingId:   string;
    pixelHtml:    string;
    bodyWithPixel: string;
    trackedLinks: Array<{ link_id: string; original_url: string }>;
  } | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // 1. Criar registro de tracking
      const { data: tracked, error: insertErr } = await emailDb
        .from('email_tracked_messages')
        .insert({
          user_id:         user.id,
          account_id:      params.accountId,
          provider:        params.provider ?? 'email',
          recipient_email: params.recipientEmail,
          recipient_name:  params.recipientName ?? null,
          sender_email:    params.senderEmail,
          subject:         params.subject,
          thread_id:       params.threadId ?? null,
          email_message_id: params.emailMessageId ?? null,
          has_tracking_pixel: true,
          has_tracked_links:  params.trackLinks !== false,
        })
        .select('tracking_id')
        .single();

      if (insertErr || !tracked) throw new Error(insertErr?.message ?? 'Erro ao criar tracking');

      const { tracking_id: trackingId } = tracked;
      const pixelHtml = getTrackingPixelHtml(trackingId);

      // 2. Extrair e substituir links se trackLinks habilitado
      let trackedLinks: Array<{ link_id: string; original_url: string }> = [];
      let bodyWithPixel = params.bodyHtml;

      if (params.trackLinks !== false) {
        // Extrair URLs do HTML (exceto mailto: e tel:)
        const urlRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
        const urls = new Set<string>();
        let match;
        while ((match = urlRegex.exec(params.bodyHtml)) !== null) {
          urls.add(match[1]);
        }

        // Criar links rastreados no banco
        if (urls.size > 0) {
          const linksToInsert = Array.from(urls).map((url, i) => ({
            tracking_id: trackingId,
            original_url: url,
            position: i,
          }));

          const { data: links } = await emailDb
            .from('email_tracked_links')
            .insert(linksToInsert)
            .select('link_id, original_url');

          if (links) {
            trackedLinks = links;
            bodyWithPixel = injectTrackedLinks(bodyWithPixel, links);
          }

          // Atualizar contagem de links
          await emailDb
            .from('email_tracked_messages')
            .update({ tracked_link_count: urls.size })
            .eq('tracking_id', trackingId);
        }
      }

      // 3. Injetar pixel no final do body HTML
      bodyWithPixel = bodyWithPixel + pixelHtml;

      // 4. Atualizar contact score (total_sent)
      await emailDb
        .from('email_contact_scores')
        .upsert({
          user_id: user.id,
          email:   params.recipientEmail,
          display_name: params.recipientName,
          total_sent: 1,
        }, { onConflict: 'user_id,email' });

      return { trackingId, pixelHtml, bodyWithPixel, trackedLinks };

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  // ── Carregar emails rastreados ─────────────────────────────────────────
  const loadTrackedEmails = useCallback(async (limit = 50) => {
    setIsLoading(true);
    try {
      const { data, error: dbErr } = await emailDb
        .from('email_tracked_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (dbErr) throw new Error(dbErr.message);
      setTrackedEmails((data ?? []) as TrackedEmail[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Carregar estatísticas ──────────────────────────────────────────────
  const loadStats = useCallback(async (days = 30) => {
    try {
      const { data, error: rpcErr } = await safeClient.rpc<TrackingStats>('rpc_email_tracking_stats', { p_days: days });
      if (!rpcErr && data) setStats(data as TrackingStats);
    } catch { /* silencioso */ }
  }, []);

  // ── Carregar top contatos ──────────────────────────────────────────────
  const loadTopContacts = useCallback(async (limit = 10) => {
    try {
      const { data, error: rpcErr } = await safeClient.rpc<TopContact[]>('rpc_email_top_contacts', { p_limit: limit });
      if (!rpcErr && data) setTopContacts(data as TopContact[]);
    } catch { /* silencioso */ }
  }, []);

  // ── Buscar eventos de abertura de um email ─────────────────────────────
  const getOpenEvents = useCallback(async (trackingId: string): Promise<TrackingEvent[]> => {
    const { data, error } = await emailDb
      .from('email_tracking_events')
      .select('*')
      .eq('tracking_id', trackingId)
      .order('created_at', { ascending: false });
    return (data ?? []) as TrackingEvent[];
  }, []);

  // ── Buscar links rastreados de um email ────────────────────────────────
  const getTrackedLinks = useCallback(async (trackingId: string): Promise<TrackedLink[]> => {
    const { data, error } = await emailDb
      .from('email_tracked_links')
      .select('*')
      .eq('tracking_id', trackingId)
      .order('position', { ascending: true });
    return (data ?? []) as TrackedLink[];
  }, []);

  // ── Auto-carregar ao montar ────────────────────────────────────────────
  useEffect(() => {
    void loadTrackedEmails();
    void loadStats();
    void loadTopContacts();
  }, [loadTrackedEmails, loadStats, loadTopContacts]);

  // ── Realtime para novas aberturas ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('email-tracking-events')
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'email_app',
        table:  'email_tracking_events',
      }, () => {
        // Recarregar dados quando nova abertura é detectada
        loadTrackedEmails();
        loadStats();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadTrackedEmails, loadStats]);

  return {
    // Estado
    trackedEmails,
    stats,
    topContacts,
    isLoading,
    error,
    // Ações
    createTracking,
    getOpenEvents,
    getTrackedLinks,
    // Refresh
    refreshEmails:   loadTrackedEmails,
    refreshStats:    loadStats,
    refreshContacts: loadTopContacts,
    // Helpers
    getTrackingPixelUrl,
    getTrackingPixelHtml,
    getTrackedLinkUrl,
  };
}
