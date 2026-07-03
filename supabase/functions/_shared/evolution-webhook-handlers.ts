// Event handlers: connection, contacts, presence, chats, labels, calls, startup
// Message-specific handlers moved to evolution-webhook-msg-handlers.ts

import {
  isRecord, normalizePhone, toEventRecords,
  getConnectionByInstance, getContactByPhone, persistProfilePicture, generatePhoneVariants,
} from "./evolution-helpers.ts";

// deno-lint-ignore no-explicit-any
export async function handleLogoutInstance(supabase: any, instance: string, data: unknown) {
  const payload = isRecord(data) ? data : {};
  const reasonCode = (payload.disconnectionReasonCode as number | undefined)
    ?? (payload.reasonCode as number | undefined)
    ?? null;

  // Query by instance_name — Evolution API sends instance NAME, not the internal UUID (instance_id)
  const { data: prev } = await supabase.from('whatsapp_connections')
    .select('id, status, phone_number').eq('instance_name', instance).maybeSingle();

  await supabase.from('whatsapp_connections')
    .update({ status: 'logged_out', qr_code: null, updated_at: new Date().toISOString() })
    .eq('instance_name', instance);

  if (prev && prev.status !== 'logged_out') {
    const phone = prev.phone_number ? ` (${prev.phone_number})` : '';
    await supabase.from('warroom_alerts').insert({
      alert_type: 'critical',
      title: `\uD83D\uDEAA Inst\u00e2ncia ${instance} deslogada`,
      message: `WhatsApp desconectou por logout${reasonCode ? ` (code=${reasonCode})` : ''}. ` +
        `A inst\u00e2ncia${phone} precisa reautenticar via QR code.`,
      source: 'evolution-webhook',
    });
  }
  console.log(`[LOGOUT_INSTANCE] instance=${instance} reasonCode=${reasonCode ?? 'n/a'}`);
}

// deno-lint-ignore no-explicit-any
export async function handleGroupsUpsert(supabase: any, instance: string, data: unknown) {
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

// deno-lint-ignore no-explicit-any
export async function handleGroupParticipantsUpdate(supabase: any, instance: string, data: unknown) {
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

// deno-lint-ignore no-explicit-any
export async function handleConnectionUpdate(supabase: any, instance: string, baseData: Record<string, unknown>) {
  const evoState = (baseData.state ?? baseData.status ?? baseData.connectionStatus
    ?? (baseData.data as Record<string,unknown>)?.state
    ?? (baseData.data as Record<string,unknown>)?.status
    ?? (baseData.data as Record<string,unknown>)?.connectionStatus) as string | undefined;

  const reasonCode = (baseData.reason ?? (baseData.data as Record<string, unknown>)?.reason) as number | string | undefined;

  // Query by instance_name — Evolution API sends instance NAME, not the internal UUID (instance_id)
  const { data: prevConn } = await supabase.from('whatsapp_connections')
    .select('status, phone_number').eq('instance_name', instance).maybeSingle();

  if (evoState === 'close' || evoState === 'disconnected') {
    let action = 'instance_disconnected';
    let cause = 'Desconex\u00e3o gen\u00e9rica';
    if (reasonCode === 401 || reasonCode === '401') {
      action = 'device_removed'; cause = 'Dispositivo removido pelo celular';
    } else if (reasonCode === 409 || reasonCode === '409') {
      action = 'session_conflict'; cause = 'Conflito de sess\u00e3o (WhatsApp aberto em outro lugar)';
    } else if (reasonCode === 411 || reasonCode === '411') {
      action = 'session_expired'; cause = 'Sess\u00e3o expirada';
    }
    await supabase.from('audit_logs').insert({
      action, entity_type: 'whatsapp_connection',
      details: { instance_id: instance, cause, reason_code: reasonCode, source: 'evolution-webhook' },
    });
  } else if (evoState === 'open' || evoState === 'connected') {
    if (prevConn?.status !== 'connected') {
      await supabase.from('audit_logs').insert({
        action: 'instance_reconnected', entity_type: 'whatsapp_connection',
        details: { instance_id: instance, source: 'evolution-webhook', previous_status: prevConn?.status },
      });
    }
  }

  const event = { instance, data: { ...baseData, state: evoState } };
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('fn_apply_connection_update', { p_event: event });

  if (rpcErr) {
    console.error(`[connection.update] rpc_error instance=${instance} err=${rpcErr.message ?? rpcErr.code}`);
  } else {
    console.log(`[connection.update] instance=${instance} action=${(rpcRes as Record<string,unknown>)?.action} new_status=${(rpcRes as Record<string,unknown>)?.new_status}`);
  }

  if (evoState === 'open' || evoState === 'close') {
    await supabase.from('whatsapp_connections').update({ qr_code: null }).eq('instance_name', instance);
  }

  const newStatus = (rpcRes as Record<string,unknown>)?.new_status as string | undefined;
  if (newStatus === 'disconnected' && prevConn?.status === 'connected') {
    const phone = prevConn.phone_number ? ` (${prevConn.phone_number})` : '';
    await supabase.from('warroom_alerts').insert({
      alert_type: 'critical',
      title: `\uD83D\uDD34 Conex\u00e3o ${instance} desconectou`,
      message: `A inst\u00e2ncia ${instance}${phone} perdeu conex\u00e3o com o WhatsApp. Reconecte imediatamente para evitar perda de mensagens.`,
      source: 'evolution-webhook',
    });
  }
  if (newStatus === 'connected' && prevConn?.status !== 'connected') {
    await supabase.from('warroom_alerts').insert({
      alert_type: 'info',
      title: `\uD83D\uDFE2 Conex\u00e3o ${instance} restaurada`,
      message: `A inst\u00e2ncia ${instance} reconectou com sucesso ao WhatsApp.`,
      source: 'evolution-webhook',
    });
  }
}

// deno-lint-ignore no-explicit-any
export async function handleContactsUpsert(supabase: any, instance: string, data: unknown) {
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
            name: pushName, avatar_url: permanentAvatarUrl || null, updated_at: new Date().toISOString(),
          }).eq('phone', phone).eq('whatsapp_connection_id', connection.id);
        }
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handlePresenceUpdate(supabase: any, instance: string, data: unknown) {
  const presenceData = isRecord(data) ? data : {};
  const jid = (presenceData.id as string) || (presenceData.remoteJid as string);
  const presences = presenceData.presences as Record<string, Record<string, unknown>> | undefined;

  if (jid) {
    if (jid.endsWith('@broadcast')) return;
    const isGroup = jid.endsWith('@g.us');
    let isComposing = false;
    let typingParticipant: string | null = null;

    if (presences) {
      for (const [participantJid, pState] of Object.entries(presences)) {
        if (pState?.lastKnownPresence === 'composing' || pState?.status === 'composing') {
          isComposing = true; typingParticipant = participantJid; break;
        }
      }
    } else {
      const directStatus = presenceData.status as string || presenceData.lastKnownPresence as string;
      isComposing = directStatus === 'composing';
      typingParticipant = (presenceData.participant as string) || null;
    }

    if (isGroup && !typingParticipant) return;

    const timestamp = new Date().toISOString();
    const basePayload: Record<string, unknown> = { isTyping: isComposing, remoteJid: jid, timestamp };
    if (isGroup) { basePayload.isGroup = true; basePayload.participant = typingParticipant; }

    try {
      const ch1 = supabase.channel(`typing:${jid}`);
      await ch1.send({ type: 'broadcast', event: 'contact_typing', payload: basePayload });
      supabase.removeChannel(ch1);
    } catch (_e) { /* best-effort */ }

    if (!isGroup) {
      const phone = normalizePhone(jid);
      if (phone) {
        const connection = await getConnectionByInstance(supabase, instance);
        if (connection) {
          const contact = await getContactByPhone(supabase, phone, connection.id);
          if (contact) {
            try {
              const ch2 = supabase.channel(`typing:${contact.id}`);
              await ch2.send({ type: 'broadcast', event: 'contact_typing', payload: { ...basePayload, contactId: contact.id } });
              supabase.removeChannel(ch2);
            } catch (_e) { /* best-effort */ }
          }
        }
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handleChatsUpdate(supabase: any, instance: string, data: unknown) {
  const chats = Array.isArray(data) ? data : [data];
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;
  for (const chat of chats) {
    const chatData = chat as Record<string, unknown>;
    const jid = chatData.id as string;
    if (!jid || jid.endsWith('@g.us')) continue;
    const phone = normalizePhone(jid);
    if (!phone) continue;
    const unreadCount = chatData.unreadCount as number;
    if (unreadCount !== undefined) {
      const contact = await getContactByPhone(supabase, phone, connection.id);
      if (contact && unreadCount === 0) {
        await supabase.from('messages').update({ is_read: true })
          .eq('contact_id', contact.id).eq('sender', 'contact').eq('is_read', false)
          .eq('whatsapp_connection_id', connection.id);
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handleLabelsEdit(supabase: any, instance: string, data: unknown) {
  const labelData = isRecord(data) ? data : {};
  const labelId = labelData.id as string;
  const labelName = labelData.name as string;
  const labelColor = labelData.color as string;
  const deleted = labelData.deleted as boolean;
  if (!labelId) return;
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;
  if (deleted) {
    await supabase.from('tags').delete().eq('name', `wa:${labelId}:${labelName}`);
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

// deno-lint-ignore no-explicit-any
export async function handleLabelsAssociation(supabase: any, instance: string, data: unknown) {
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

// deno-lint-ignore no-explicit-any
export async function handleCallEvent(supabase: any, instance: string, data: unknown) {
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
      .insert({ phone, name: phone, whatsapp_connection_id: connection.id })
      .select('id, avatar_url, assigned_to, name').single();
    if (insertErr && insertErr.code === '23505') {
      const phonesVariants = generatePhoneVariants(phone);
      const { data: existing } = await supabase.from('contacts').select('id, avatar_url, assigned_to, name')
        .in('phone', phonesVariants).eq('whatsapp_connection_id', connection.id).limit(1).maybeSingle();
      contact = existing ?? null;
    } else {
      contact = newContact;
    }
  }
  if (!contact) return;

  const agentId = contact.assigned_to || null;
  await supabase.from('calls').insert({
    contact_id: contact.id, whatsapp_connection_id: connection.id, agent_id: agentId,
    direction: 'inbound', status: callStatus || 'ringing', started_at: new Date().toISOString(),
    notes: isVideo ? 'Chamada de v\u00eddeo' : 'Chamada de voz',
  });

  if (agentId) {
    const { data: agentProfile } = await supabase.from('profiles')
      .select('user_id, name').eq('id', agentId).single();
    if (agentProfile?.user_id) {
      await supabase.from('notifications').insert({
        user_id: agentProfile.user_id, type: 'incoming_call',
        title: isVideo ? '\uD83D\uDCF9 Chamada de v\u00eddeo recebida' : '\uD83D\uDCDE Chamada de voz recebida',
        message: `${contact.name || phone} est\u00e1 ligando para voc\u00ea`,
        metadata: { contact_id: contact.id, phone, is_video: isVideo, call_status: callStatus, whatsapp_connection_id: connection.id, agent_profile_id: agentId },
      });
    }
  }

  // Realtime broadcast via main supabase client (FATOR X v6.1 unified single-DB architecture).
  // REMOVED: EXTERNAL_SUPABASE_URL broadcast — deprecated since FATOR X v6.1 migration.
  try {
    const bcastChannel = supabase.channel(`incoming-calls:${instance}`);
    await bcastChannel.send({
      type: 'broadcast',
      event: 'call_received',
      payload: {
        remote_jid: from, is_video: !!isVideo, call_status: callStatus || 'ringing',
        agent_profile_id: agentId, started_at: new Date().toISOString(),
        wa_call_id: (callData.id as string) ?? null,
      },
    });
    supabase.removeChannel(bcastChannel);
  } catch (err) {
    console.warn('[handleCallEvent] broadcast emit failed:', err);
  }
}

// deno-lint-ignore no-explicit-any
export async function handleChatsDelete(supabase: any, instance: string, data: unknown) {
  const chats = Array.isArray(data) ? data : [data];
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;
  for (const chat of chats) {
    const chatData = isRecord(chat) ? chat : {};
    const jid = (chatData.id as string) || (chatData.remoteJid as string);
    if (!jid || jid.endsWith('@g.us')) continue;
    const phone = normalizePhone(jid);
    if (!phone) continue;
    const contact = await getContactByPhone(supabase, phone, connection.id);
    if (contact) {
      const now = new Date().toISOString();
      // Update evo.evolution_messages directly since the INSTEAD OF UPDATE trigger now
      // handles is_deleted→deleted_at but belt-and-suspenders: also set deleted_at directly.
      await supabase.from('evo_evolution_messages_direct').upsert({}).limit(0); // no-op guard
      await supabase
        .from('messages')
        .update({ is_deleted: true, status: 'deleted', status_updated_at: now })
        .eq('contact_id', contact.id)
        .eq('whatsapp_connection_id', connection.id);
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handleApplicationStartup(supabase: any, instance: string) {
  console.log(`Application startup event from instance: ${instance}`);
  // Query by instance_name — Evolution API sends instance NAME, not the internal UUID (instance_id)
  const { data: conn } = await supabase.from('whatsapp_connections')
    .select('id, status').eq('instance_name', instance).maybeSingle();
  if (conn && conn.status === 'disconnected') {
    await supabase.from('whatsapp_connections')
      .update({ status: 'connecting', updated_at: new Date().toISOString() }).eq('id', conn.id);
  }
}

// deno-lint-ignore no-explicit-any
export async function handleContactsSet(supabase: any, instance: string, data: unknown) {
  const contacts = toEventRecords(data, ['contacts']);
  if (contacts.length === 0) return;
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;
  let synced = 0, skipped = 0;
  for (const contactData of contacts) {
    const jid = (contactData.id as string) || (contactData.remoteJid as string);
    if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) { skipped++; continue; }
    const phone = normalizePhone(jid);
    if (!phone) { skipped++; continue; }
    const pushName = (contactData.pushName as string) || (contactData.name as string) || (contactData.notify as string);
    if (!pushName) { skipped++; continue; }
    const existing = await getContactByPhone(supabase, phone, connection.id);
    if (existing) { skipped++; continue; }
    const { error: insertErr } = await supabase.from('contacts').insert({ phone, name: pushName, whatsapp_connection_id: connection.id });
    if (insertErr && insertErr.code === '23505') { skipped++; continue; }
    if (insertErr) { skipped++; continue; }
    synced++;
  }
  console.log(`contacts.set: synced ${synced}, skipped ${skipped} for ${instance}`);
}

// deno-lint-ignore no-explicit-any
export async function handleChatsSet(supabase: any, instance: string, data: unknown) {
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
        await supabase.from('messages').update({ is_read: true })
          .eq('contact_id', contact.id).eq('sender', 'contact').eq('is_read', false)
          .eq('whatsapp_connection_id', connection.id);
        processed++;
      }
    }
  }
  console.log(`chats.set: processed ${processed} of ${chats.length} for ${instance}`);
}
