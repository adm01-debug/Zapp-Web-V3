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

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { EVO_PROTOBUF_MESSAGE_TYPE_MAP } from "./evolution-event-types.ts";

export interface IngestMessage {
  provider: 'evolution' | 'cloud';
  instanceRef: string;       // instance_name (Evolution) ou phone_number_id (Cloud)
  remoteJid: string;         // remote_jid (Evolution) ou wamid normalized (Cloud)
  messageId: string;
  messageType: string;
  content: string;
  fromMe: boolean;
  timestamp: Date;
  contactRef?: string;       // legado — alias de pushName
  pushName?: string;         // push_name do remetente
  mediaUrl?: string;
  rawPayload?: Record<string, unknown>;
  // Campos ricos opcionais (F4 — ADR-004 storage + media metadata)
  contactId?: string;               // UUID do contato já resolvido (evita lookup no RPC)
  direction?: string;               // 'inbound' | 'outbound' (default derivado de fromMe)
  status?: string;                  // 'sent' | 'received' | 'delivered' | 'read'
  statusAt?: string;                // ISO timestamp do status
  quotedMessageId?: string;         // message_id da mensagem citada
  caption?: string;                 // legenda de mídia
  ingestMeta?: Record<string, unknown>;   // metadados de ingestão (provider raw)
  mediaMeta?: Record<string, unknown>;    // metadados de mídia (mimetype, duration, etc)
  mediaBucket?: string;             // bucket do storage (ADR-004)
  mediaPath?: string;               // path no bucket (ADR-004)
  mediaStatus?: string;             // 'ready' | 'pending' | 'error'
}

export interface IngestResult {
  ok: boolean;
  rowId?: string;      // id (UUID interno) da linha em evolution_messages
  messageId?: string;  // message_id (external id, e.g. Evolution/WhatsApp message ID)
  contactId?: string;  // contact_id da linha inserida
  error?: string;
}

/**
 * Ingere uma mensagem via RPC canônica (rpc_insert_message 21-arg).
 * Idempotente por messageId + instanceRef (ON CONFLICT DO NOTHING no DB).
 * Retorna rowId=undefined quando a mensagem já existia (race condition / duplicate).
 */
export async function ingestMessage(
  supabase: SupabaseClient<any, any>,
  msg: IngestMessage,
): Promise<IngestResult> {
  try {
    const { data, error } = await supabase.rpc('rpc_insert_message', {
      p_message_id:        msg.messageId,
      p_instance:          msg.instanceRef,
      p_remote_jid:        msg.remoteJid,
      p_message_type:      EVO_PROTOBUF_MESSAGE_TYPE_MAP[msg.messageType] ?? msg.messageType,
      p_content:           msg.content,
      p_from_me:           msg.fromMe,
      p_direction:         msg.direction ?? null,
      p_media_url:         msg.mediaUrl ?? null,
      p_metadata:          msg.rawPayload ?? null,
      p_provider:          msg.provider,
      p_timestamp:         msg.timestamp.toISOString(),
      // Campos ricos (F4)
      p_contact_id:        msg.contactId ?? null,
      p_quoted_message_id: msg.quotedMessageId ?? null,
      p_caption:           msg.caption ?? null,
      p_ingest_meta:       msg.ingestMeta ?? null,
      p_media_meta:        msg.mediaMeta ?? null,
      p_media_bucket:      msg.mediaBucket ?? null,
      p_media_path:        msg.mediaPath ?? null,
      p_media_status:      msg.mediaStatus ?? null,
      p_status_at:         msg.statusAt ?? null,
      p_push_name:         msg.pushName ?? msg.contactRef ?? null,
    });

    if (error) return { ok: false, error: error.message };
    // data=null significa ON CONFLICT DO NOTHING (mensagem duplicada): ok=true, rowId=undefined
    return { ok: true, rowId: data?.id, messageId: data?.message_id, contactId: data?.contact_id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Ingere um contato via RPC canônica (rpc_upsert_contact).
 */
export async function ingestContact(
  supabase: SupabaseClient<any, any>,
  opts: {
    provider: 'evolution' | 'cloud';
    instanceRef: string;
    remoteJid: string;
    pushName?: string;
    avatarUrl?: string;
  },
): Promise<{ ok: boolean; contactId?: string; error?: string }> {
  try {
    // rpc_upsert_contact: unico overload, retorna zapp.evolution_contacts (E93)
    
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
