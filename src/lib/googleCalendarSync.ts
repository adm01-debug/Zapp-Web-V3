/**
 * Client helper para a edge function `zapp-google-calendar-sync` (contrato
 * Google Calendar real desligado — G1, 2026-08-17).
 *
 * A edge responde SEMPRE 200 — nunca 500. Razões canônicas:
 *   'not_configured'  → sem config em zapp.google_calendar_config
 *   'disabled'        → config existe mas enabled=false
 *   'not_implemented' → config habilitada, sync real ainda não implementado
 *   'error'           → falha interna (rede/DB)
 *
 * Este helper nunca lança: falhas de rede viram { synced:false, reason:'error' }.
 */
import { supabase } from '@/integrations/supabase/client';

/** Razões canônicas do contrato zapp-google-calendar-sync. */
export type GoogleCalendarSyncReason =
  | 'not_configured'
  | 'disabled'
  | 'not_implemented'
  | 'error';

/** Resposta do contrato zapp-google-calendar-sync (sempre 200). */
export interface GoogleCalendarSyncStatus {
  synced: boolean;
  reason: GoogleCalendarSyncReason | string;
  message?: string;
  checked_at: string;
}

/** Consulta o status real da integração Google Calendar. */
export async function getGoogleCalendarSyncStatus(): Promise<GoogleCalendarSyncStatus> {
  const { data, error } = await supabase.functions.invoke('zapp-google-calendar-sync', {
    method: 'GET',
  });
  if (error) {
    return {
      synced: false,
      reason: 'error',
      message: error.message,
      checked_at: new Date().toISOString(),
    };
  }
  // ignore-audit: narrows Supabase invoke result to the local contract interface
  return (data ?? {
    synced: false,
    reason: 'error',
    checked_at: new Date().toISOString(),
  }) as GoogleCalendarSyncStatus;
}
