// Event handlers: connection, contacts, presence, chats, labels, calls, startup
// Message-specific handlers moved to evolution-webhook-msg-handlers.ts

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isRecord, normalizePhone, toEventRecords, instanceOrFilter,
  getConnectionByInstance, getContactByPhone, persistProfilePicture, generatePhoneVariants,
} from "./evolution-helpers.ts";

/** evolution-webhook-handlers utilities and exports. */
export async function handleLogoutInstance(supabase: SupabaseClient, instance: string, data: unknown) {
  const payload = isRecord(data) ? data : {};
  const reasonCode = (payload.disconnectionReasonCode as number | undefined)
    ?? (payload.reasonCode as number | undefined)
    ?? null;

  const { data: prev } = await supabase.from('whatsapp_connections')
    .select('id, status, phone_number').or(instanceOrFilter(instance)).maybeSingle();

  await supabase.from('whatsapp_connections')
    .update({ status: 'logged_out', qr_code: null, updated_at: new Date().toISOString() })
    .or(instanceOrFilter(instance));

  if (prev && prev.status !== 'logged_out') {
    const phone = prev.phone_number ? ` (${prev.phone_number})` : '';
    await supabase.from('warroom_alerts').insert({
      alert_type: 'critical',
      title: `🚪 Instância ${instance} deslogada`,
      message: `WhatsApp desconectou por logout${reasonCode ? ` (code=${reasonCode})` : ''}. ` +
        `A instância${phone} precisa reautenticar via QR code.`,
      source: 'evolution-webhook',
    });
  }
  console.log(`[LOGOUT_INSTANCE] instance=${instance} reasonCode=${reasonCode ?? 'n/a'}`);
}

export async function handleGroupsUpsert(supabase: SupabaseClient, instance: string, data: unknown) {
  const groups = toEventRecords(data, ['groups']);
  if (groups.length === 0) return;
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  let upserted = 0;
  for (const g of groups) {
    const groupId = (g.id as string) || (g.remoteJid as string);
    const name = (g.subject as string) || (g.name as string);
    if (!groupId) continue;
    const participants = g.participants as unknown[] | undefined;
    const description = g.desc as string || g.description as string || null;
    const row = {
      whatsapp_connection_id: connection.id,
      group_id: groupId,
      name: name || groupId,
      description,
      participant_count: Array.isArray(participants) ? participants.length : 0,
      avatar_url: (g.pictureUrl as string) || (g.profilePictureUrl as string) || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('whatsapp_groups')
      .upsert(row, { onConflict: 'whatsapp_connection_id,group_id' });
    if (!error) upserted++;
  }
  console.log(`[groups.upsert] instance=${instance} upserted=${upserted}/${groups.length}`);
}

export async function handleGroupParticipantsUpdate(supabase: SupabaseClient, instance: string, data: unknown) {
  const payload = isRecord(data) ? data : {};
  const groupId = payload.id as string;
  const action = payload.action as string;
  const participants = (payload.participants as string[] | undefined) ?? [];
  if (!groupId) return;
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  const { data: existing } = await supabase.from('whatsapp_groups')
    .select('id, participant_count').eq('whatsapp_connection_id', connection.id).eq('group_id', groupId).maybeSingle();

  const delta = action === 'add' || action === 'promote' ? participants.length
    : action === 'remove' || action === 'demote' ? -participants.length : 0;
  const nextCount = Math.max(0, (existing?.participant_count ?? 0) + delta);

  if (existing) {
    await supabase.from('whatsapp_groups')
      .update({ participant_count: nextCount, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('whatsapp_groups').insert({
      whatsapp_connection_id: connection.id, group_id: groupId,
      name: groupId, participant_count: Math.max(0, delta),
    });
  }
  console.log(`[group.participants.update] instance=${instance} group=${groupId} action=${action} delta=${delta}`);
}

// Re-export message handlers for backward compatibility
export {
  handleSendMessage, handleMessagesUpdate, handleMessagesDelete,
  handleMessagesSet, handleMessagesEdited,
} from "./evolution-webhook-msg-handlers.ts";

export async function handleConnectionUpdate(supabase: SupabaseClient, instance: string, baseData: Record<string, unknown>) {
  // Lê estado de várias chaves possíveis
  const evoState = (baseData.state ?? baseData.status ?? baseData.connectionStatus
    ?? (baseData.data as Record<string,unknown>)?.state
    ?? (baseData.data as Record<string,unknown>)?.status
    ?? (baseData.data as Record<string,unknown>)?.connectionStatus) as string | undefined;

  const reasonCode = (baseData.reason ?? (baseData.data as Record<string, unknown>)?.reason) as number | string | undefined;

  const { data: prevConn } = await supabase.from('whatsapp_connections')
    .select('status, phone_number').or(instanceOrFilter(instance)).maybeSingle();

  // Registrar logs específicos de causa (timeline)
  if (evoState === 'close' || evoState === 'disconnected') {
    let action = 'instance_disconnected';
    let cause = 'Desconexão genérica';
    
    // Mapear códigos de erro comuns do Baileys/Evolution
    if (reasonCode === 401 || reasonCode === '401') {
      action = 'device_removed';
      cause = 'Dispositivo removido pelo celular';
    } else if (reasonCode === 409 || reasonCode === '409') {
      action = 'session_conflict';
      cause = 'Conflito de sessão (WhatsApp aberto em outro lugar)';
    } else if (reasonCode === 411 || reasonCode === '411') {
      action = 'session_expired';
      cause = 'Sessão expirada';
    }

    await supabase.from('audit_logs').insert({
      action,
      entity_type: 'whatsapp_connection',
      details: { 
        instance_id: instance, 
        cause, 
        reason_code: reasonCode,
        source: 'evolution-webhook'
      }
    });
  } else if (evoState === 'open' || evoState === 'connected') {
    if (prevConn?.status !== 'connected') {
      await supabase.from('audit_logs').insert({
        action: 'instance_reconnected',
        entity_type: 'whatsapp_connection',
        details: { 
          instance_id: instance, 
          source: 'evolution-webhook',
          previous_status: prevConn?.status
        }
      });
    }
  }

  // Delega ao RPC autoritário público.fn_apply_connection_update (single-source-of-truth):
  const event = { instance, data: { ...baseData, state: evoState } };
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('fn_apply_connection_update', { p_event: event });
  
  if (rpcErr) {
    console.error(`[connection.update] rpc_error instance=${instance} err=${rpcErr.message ?? rpcErr.code}`);
  } else {
    console.log(`[connection.update] instance=${instance} action=${(rpcRes as Record<string,unknown>)?.action} new_status=${(rpcRes as Record<string,unknown>)?.new_status}`);
  }

  // Reset QR sempre que recebermos uma transição não-pendente (open ou close).
  if (evoState === 'open' || evoState === 'close') {
    await supabase.from('whatsapp_connections').update({ qr_code: null }).or(instanceOrFilter(instance));
  }

  // Alertas warroom: olhar status do RPC retornado (autoritário) ao invés do baseData.
  const newStatus = (rpcRes as Record<string,unknown>)?.new_status as string | undefined;
  if (newStatus === 'disconnected' && prevConn?.status === 'connected') {
    const phone = prevConn.phone_number ? ` (${prevConn.phone_number})` : '';
    await supabase.from('warroom_alerts').insert({
      alert_type: 'critical',
      title: `🔴 Conexão ${instance} desconectou`,
      message: `A instância ${instance}${phone} perdeu conexão com o WhatsApp. Reconecte imediatamente para evitar perda de mensagens.`,
      source: 'evolution-webhook',
    });
  }

  if (newStatus === 'connected' && prevConn?.status !== 'connected') {
    await supabase.from('warroom_alerts').insert({
      alert_type: 'info',
      title: `🟢 Conexão ${instance} restaurada`,
      message: `A instância ${instance} reconectou com sucesso ao WhatsApp.`,
      source: 'evolution-webhook',
    });
  }
}

export async function handleContactsUpsert(supabase: SupabaseClient, instance: string, data: unknown) {
  const contacts = Array.isArray(data) ? data : [data];
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;
  for (const contact of contacts) {
    const contactData = contact as Record<string, unknown>;
    const jid = (contactData.id || contactData.remoteJid) as string;
    if (!jid) continue;

    const phone = normalizePhone(jid);
    if (!phone) continue;
    const pushName = contactData.pushName as string || contactData.name as string;
    const profilePicUrl = contactData.profilePictureUrl as string || contactData.imgUrl as string;

    if (pushName) {
      let permanentAvatarUrl: string | null = null;
      if (profilePicUrl && profilePicUrl.includes('pps.whatsapp.net')) {
        permanentAvatarUrl = await persistProfilePicture(supabase, phone, profilePicUrl);
      } else if (profilePicUrl) {
        permanentAvatarUrl = profilePicUrl;
      }

      const existing = await getContactByPhone(supabase, phone, connection.id);
      if (existing) {
        const updateData: Record<string, unknown> = { name: pushName, updated_at: new Date().toISOString() };
        if (permanentAvatarUrl) updateData.avatar_url = permanentAvatarUrl;
        await supabase.from('contacts').update(updateData).eq('id', existing.id);
      } else {
        const { error: insertErr } = await supabase.from('contacts').insert({
          phone, name: pushName, avatar_url: permanentAvatarUrl || null, whatsapp_connection_id: connection.id,
        });
        if (insertErr && insertErr.code === '23505') {
          await supabase.from('contacts').update({
            name: pushName, avatar_url: permanentAvatarUrl || null,
            updated_at: new Date().toISOString(),
          }).in('phone', generatePhoneVariants(phone)).eq('whatsapp_connection_id', connection.id);
        }
      }
    }
  }
}

export async function handlePresenceUpdate(supabase: SupabaseClient, instance: string, data: unknown) {
  const presenceData = isRecord(data) ? data : {};
  const jid = (presenceData.id as string) || (presenceData.remoteJid as string);
  const presences = presenceData.presences as Record<string, Record<string, unknown>> | undefined;

  if (jid) {
    // Defesa: ignorar broadcasts (status@broadcast, *@broadcast)
    if (jid.endsWith('@broadcast')) {
      return;
    }

    const isGroup = jid.endsWith('@g.us');
    let isComposing = false;
    // Em grupos, o WhatsApp envia presences keyed pelo participant (quem digita).
    // Capturamos o primeiro participant em estado composing para enviar no payload.
    let typingParticipant: string | null = null;

    if (presences) {
      for (const [participantJid, pState] of Object.entries(presences)) {
        if (pState?.lastKnownPresence === 'composing' || pState?.status === 'composing') {
          isComposing = true;
          typingParticipant = participantJid;
          break;
        }
      }
    } else {
      const directStatus = presenceData.status as string || presenceData.lastKnownPresence as string;
      isComposing = directStatus === 'composing';
      typingParticipant = (presenceData.participant as string) || null;
    }

    // Em grupos só faz sentido emitir se tivermos identificado o participant.
    if (isGroup && !typingParticipant) {
      return;
    }

    const timestamp = new Date().toISOString();
    const basePayload: Record<string, unknown> = { isTyping: isComposing, remoteJid: jid, timestamp };
    if (isGroup) {
      basePayload.isGroup = true;
      basePayload.participant = typingParticipant;
    }

    // Novo (FATOR X): canal por remote_jid — chave estável compartilhada entre webhook → preview → chat aberto
    const ch1 = supabase.channel(`typing:${jid}`);
    try {
      await ch1.send({ type: 'broadcast', event: 'contact_typing', payload: basePayload });
    } catch (_e) {
      // best-effort: não quebrar o webhook se broadcast falhar
    } finally {
      ch1.unsubscribe();
    }

    // Legacy (Lovable Cloud contact.id) — mantém compat durante migração.
    // Não se aplica a grupos (não há contato 1:1).
    if (!isGroup) {
      const phone = normalizePhone(jid);
      if (phone) {
        const connection = await getConnectionByInstance(supabase, instance);
        if (connection) {
          const contact = await getContactByPhone(supabase, phone, connection.id);
          if (contact) {
            const ch2 = supabase.channel(`typing:${contact.id}`);
            try {
              await ch2.send({ type: 'broadcast', event: 'contact_typing', payload: { ...basePayload, contactId: contact.id } });
            } catch (_e) {
              // best-effort
            } finally {
              ch2.unsubscribe();
            }
          }
        }
      }
    }
  }
}

export async function handleChatsUpdate(supabase: SupabaseClient, instance: string, data: unknown) {
  const chats = Array.isArray(data) ? data : [data];
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;
  for (const chat of chats) {
    const chatData = chat as Record<string, unknown>;
    const jid = chatData.id as string;
    if (!jid || jid.endsWith('@g.us') || jid.endsWith('@lid')) continue;

    const phone = normalizePhone(jid);
    if (!phone) continue;
    const unreadCount = chatData.unreadCount as number;

    if (unreadCount !== undefined) {
      const contact = await getContactByPhone(supabase, phone, connection.id);
      if (contact && unreadCount === 0) {
        await supabase.schema('evo').from('evolution_messages')
          .update({ is_read: true, updated_at: new Date().toISOString() })
          .eq('contact_id', contact.id).eq('from_me', false).eq('is_read', false)
          .eq('instance_name', instance);
      }
    }
  }
}

export async function handleLabelsEdit(supabase: SupabaseClient, instance: string, data: unknown) {
  const labelData = isRecord(data) ? data : {};
  const labelId = labelData.id as string;
  const labelName = labelData.name as string;
  const labelColor = labelData.color as string;
  const deleted = labelData.deleted as boolean;
  if (!labelId) return;

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  if (deleted) {
    await supabase.from('tags').delete().ilike('name', `wa:${labelId}:%`);
  } else {
    const tagName = labelName || `Label ${labelId}`;
    const { data: existingTag } = await supabase.from('tags').select('id').ilike('name', `wa:${labelId}:%`).maybeSingle();
    if (existingTag) {
      await supabase.from('tags').update({ name: `wa:${labelId}:${tagName}`, color: labelColor || '#3B82F6' }).eq('id', existingTag.id);
    } else {
      await supabase.from('tags').insert({ name: `wa:${labelId}:${tagName}`, color: labelColor || '#3B82F6' });
    }
  }
}

export async function handleLabelsAssociation(supabase: SupabaseClient, instance: string, data: unknown) {
  const assocData = isRecord(data) ? data : {};
  const labelId = assocData.labelId as string || (assocData.label as Record<string, unknown>)?.id as string;
  const chatId = assocData.chatId as string;
  const type = assocData.type as string;
  if (!labelId || !chatId) return;

  const phone = normalizePhone(chatId);
  if (!phone) return;
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  const contact = await getContactByPhone(supabase, phone, connection.id);
  const { data: tag } = await supabase.from('tags').select('id').ilike('name', `wa:${labelId}:%`).maybeSingle();

  if (contact && tag) {
    if (type === 'remove') {
      await supabase.from('contact_tags').delete().eq('contact_id', contact.id).eq('tag_id', tag.id);
    } else {
      const { data: existing } = await supabase.from('contact_tags').select('id')
        .eq('contact_id', contact.id).eq('tag_id', tag.id).maybeSingle();
      if (!existing) {
        await supabase.from('contact_tags').insert({ contact_id: contact.id, tag_id: tag.id });
      }
    }
  }
}

export async function handleCallEvent(supabase: SupabaseClient, instance: string, data: unknown) {
  const callData = isRecord(data) ? data : {};
  const from = callData.from as string;
  const isVideo = callData.isVideo as boolean;
  const callStatus = callData.status as string;
  if (!from) return;

  const phone = normalizePhone(from);
  if (!phone) return;
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  let contact = await getContactByPhone(supabase, phone, connection.id);
  if (!contact) {
    const { data: newContact, error: insertErr } = await supabase.from('contacts')
      .insert({ phone, name: phone, whatsapp_connection_id: connection.id, instance_name: instance, remote_jid: from })
      .select('id, avatar_url, assigned_to, name').single();
    if (insertErr && insertErr.code === '23505') {
      const phonesVariants = generatePhoneVariants(phone);
      const { data: existing } = await supabase.from('contacts').select('id, avatar_url, assigned_to, name')
        .in('phone', phonesVariants).eq('whatsapp_connection_id', connection.id).limit(1).maybeSingle();
      if (existing) {
        contact = existing;
        await supabase.from('contacts').update({ whatsapp_connection_id: connection.id, updated_at: new Date().toISOString() }).eq('id', existing.id);
      }
    } else {
      contact = newContact;
    }
  }
  if (!contact) return;

  const agentId = contact.assigned_to || null;
  await supabase.from('calls').insert({
    contact_id: contact.id, whatsapp_connection_id: connection.id, agent_id: agentId,
    direction: 'inbound', status: callStatus || 'ringing', started_at: new Date().toISOString(),
    notes: isVideo ? 'Chamada de vídeo' : 'Chamada de voz',
  });

  if (agentId) {
    const { data: agentProfile } = await supabase.from('profiles')
      .select('user_id, name').eq('id', agentId).single();
    if (agentProfile?.user_id) {
      await supabase.from('notifications').insert({
        user_id: agentProfile.user_id, type: 'incoming_call',
        title: isVideo ? '📹 Chamada de vídeo recebida' : '📞 Chamada de voz recebida',
        message: `${contact.name || phone} está ligando para você`,
        metadata: { contact_id: contact.id, phone, is_video: isVideo, call_status: callStatus, whatsapp_connection_id: connection.id, agent_profile_id: agentId },
      });
    }
  }

  // Emit realtime broadcast on FATOR X bus for sub-100ms incoming-call alert.
  // Payload is minimal (no PII besides JID); client resolves name/avatar via rpc_get_contact.
  try {
    const externalUrl = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('EXTERNAL_SUPABASE_URL'));
    const externalKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'))
      || (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY'));
    if (externalUrl && externalKey) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const externalAdmin = createClient(externalUrl, externalKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bcastChannel = externalAdmin.channel(`incoming-calls:${instance}`);
      await bcastChannel.send({
        type: 'broadcast',
        event: 'call_received',
        payload: {
          remote_jid: from,
          is_video: !!isVideo,
          call_status: callStatus || 'ringing',
          agent_profile_id: agentId,
          started_at: new Date().toISOString(),
          wa_call_id: (callData.id as string) ?? null,
        },
      });
      await bcastChannel.unsubscribe();
    }
  } catch (err) {
    console.warn('[handleCallEvent] broadcast emit failed', err);
  }
}

export async function handleChatsDelete(supabase: SupabaseClient, instance: string, data: unknown) {
  const chats = Array.isArray(data) ? data : [data];
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;
  for (const chat of chats) {
    const chatData = isRecord(chat) ? chat : {};
    const jid = (chatData.id as string) || (chatData.remoteJid as string);
    if (!jid || jid.endsWith('@g.us') || jid.endsWith('@lid')) continue;
    const phone = normalizePhone(jid);
    if (!phone) continue;
    const contact = await getContactByPhone(supabase, phone, connection.id);
    if (contact) {
      const now = new Date().toISOString();
      await supabase.schema('evo').from('evolution_messages')
        .update({ deleted_at: now, status: 'deleted', status_at: now, updated_at: now })
        .eq('contact_id', contact.id).eq('instance_name', instance);
    }
  }
}

export async function handleApplicationStartup(supabase: SupabaseClient, instance: string) {
  console.log(`Application startup event from instance: ${instance}`);
  const { data: conn } = await supabase.from('whatsapp_connections')
    .select('id, status').or(instanceOrFilter(instance)).maybeSingle();
  if (conn && conn.status === 'disconnected') {
    await supabase.from('whatsapp_connections')
      .update({ status: 'connecting', updated_at: new Date().toISOString() }).eq('id', conn.id);
  }
}

export async function handleContactsSet(supabase: SupabaseClient, instance: string, data: unknown) {
  const contacts = toEventRecords(data, ['contacts']);
  if (contacts.length === 0) return;

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  let synced = 0, skipped = 0;
  for (const contactData of contacts) {
    const jid = (contactData.id as string) || (contactData.remoteJid as string);
    if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@lid')) { skipped++; continue; }
    const phone = normalizePhone(jid);
    if (!phone) { skipped++; continue; }
    const pushName = (contactData.pushName as string) || (contactData.name as string) || (contactData.notify as string);
    if (!pushName) { skipped++; continue; }
    const existing = await getContactByPhone(supabase, phone, connection.id);
    if (existing) { skipped++; continue; }

    const { error: insertErr } = await supabase.from('contacts').insert({ phone, name: pushName, whatsapp_connection_id: connection.id, instance_name: instance, remote_jid: jid });
    if (insertErr && insertErr.code === '23505') { skipped++; continue; }
    if (insertErr) { console.warn(`[contacts.set] insert error for ${phone}:`, insertErr.message); skipped++; continue; }
    synced++;
  }
  console.log(`contacts.set: synced ${synced}, skipped ${skipped} for ${instance}`);
}

export async function handleChatsSet(supabase: SupabaseClient, instance: string, data: unknown) {
  const chats = toEventRecords(data, ['chats']);
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection || chats.length === 0) return;

  let processed = 0;
  for (const chat of chats) {
    const jid = chat.id as string;
    if (!jid || jid.endsWith('@g.us')) continue;
    const phone = normalizePhone(jid);
    if (!phone) continue;
    const unreadCount = chat.unreadCount as number;
    if (unreadCount === 0) {
      const contact = await getContactByPhone(supabase, phone, connection.id);
      if (contact) {
        await supabase.schema('evo').from('evolution_messages')
          .update({ is_read: true, updated_at: new Date().toISOString() })
          .eq('contact_id', contact.id).eq('from_me', false).eq('is_read', false)
          .eq('instance_name', instance);
        processed++;
      }
    }
  }
  console.log(`chats.set: processed ${processed} of ${chats.length} for ${instance}`);
}
