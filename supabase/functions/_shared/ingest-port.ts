/**
 * ingest-port.ts — Porta de Entrada Canônica
 *
 * E55 do Plano de Desacoplamento 100 Etapas.
 * Ponto único de ingestão de mensagens, agnóstico de provider.
 * Tanto o webhook Evolution quanto o webhook Cloud devem ingerir por aqui.
 *
 * NÃO importar supabase.from('evolution_messages') fora deste arquivo
 * em edge functions de ingestão.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface IngestMessage {
  provider: 'evolution' | 'cloud';
  instanceRef: string;       // instance_name (Evolution) ou phone_number_id (Cloud)
  remoteJid: string;         // remote_jid (Evolution) ou wamid normalized (Cloud)
  messageId: string;
  messageType: string;
  content: string;
  fromMe: boolean;
  timestamp: Date;
  contactRef?: string;       // push_name / wa_id
  mediaUrl?: string;
  rawPayload?: Record<string, unknown>;
}

export interface IngestResult {
  ok: boolean;
  messageId?: string;
  contactId?: string;
  error?: string;
}

/**
 * Ingere uma mensagem via RPC canônica (rpc_insert_message).
 * Idempotente por messageId + instanceRef.
 */
export async function ingestMessage(
  supabase: SupabaseClient,
  msg: IngestMessage,
): Promise<IngestResult> {
  try {
    const { data, error } = await supabase.rpc('rpc_insert_message', {
      p_message_id:   msg.messageId,
      p_instance:     msg.instanceRef,
      p_remote_jid:   msg.remoteJid,
      p_message_type: msg.messageType,
      p_content:      msg.content,
      p_from_me:      msg.fromMe,
      p_push_name:    msg.contactRef ?? null,
      p_media_url:    msg.mediaUrl ?? null,
      p_provider:     msg.provider,
      p_timestamp:    msg.timestamp.toISOString(),
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, messageId: data?.message_id, contactId: data?.contact_id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Ingere um contato via RPC canônica (rpc_upsert_contact).
 */
export async function ingestContact(
  supabase: SupabaseClient,
  opts: {
    provider: 'evolution' | 'cloud';
    instanceRef: string;
    remoteJid: string;
    pushName?: string;
    avatarUrl?: string;
  },
): Promise<{ ok: boolean; contactId?: string; error?: string }> {
  try {
    // rpc_upsert_contact (3-args): p_remote_jid, p_instance, p_push_name
    // p_avatar_url e p_provider serão adicionados quando rpc_upsert_contact for estendido (F6)
    const { data, error } = await supabase.rpc('rpc_upsert_contact', {
      p_remote_jid:   opts.remoteJid,
      p_instance:     opts.instanceRef,
      p_push_name:    opts.pushName ?? null,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, contactId: data?.contact_id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
