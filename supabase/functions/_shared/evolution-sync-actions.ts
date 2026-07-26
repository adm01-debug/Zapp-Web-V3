// Shared sync action handlers for evolution-sync/index.ts

import { instanceOrFilter } from "./evolution-helpers.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type EvolutionRawMsg = {
  conversation?: string;
  extendedTextMessage?: { text?: string } | null;
  imageMessage?: { caption?: string } | null;
  videoMessage?: { caption?: string } | null;
  audioMessage?: unknown;
  documentMessage?: { fileName?: string } | null;
  stickerMessage?: unknown;
  reactionMessage?: unknown;
  [key: string]: unknown;
};
/** evolution-sync-actions utilities and exports. */
export async function syncContacts(
  supabase: SupabaseClient, evolutionApiUrl: string, evolutionApiKey: string,
  instanceName: string, corsHeaders: Record<string, string>, page: number, offset: number
): Promise<Response> {
  console.log(`[Sync] Fetching contacts from instance ${instanceName}`);

  const contactsResponse = await fetch(
    `${evolutionApiUrl}/chat/findContacts/${instanceName}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey }, body: JSON.stringify({ where: {} }), signal: AbortSignal.timeout(10_000) }
  );

  if (!contactsResponse.ok) {
    const errText = await contactsResponse.text();
    await supabase.from('audit_logs').insert({
      action: 'contact_sync_failure',
      entity_type: 'whatsapp_connection',
      details: { instance_id: instanceName, status: contactsResponse.status, error: errText }
    });
    await supabase.from('warroom_alerts').insert({
      alert_type: 'warning',
      title: `Falha na sincronização: ${instanceName}`,
      message: `Erro ao buscar contatos da Evolution API: ${errText.slice(0, 100)}`,
      source: 'evolution_sync'
    });
    throw new Error(`Evolution API error [${contactsResponse.status}]: ${errText}`);
  }

  const contacts = await contactsResponse.json();
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return jsonRes({ success: true, message: 'No more contacts to sync', synced: 0, page }, corsHeaders);
  }

  let { data: connection } = await supabase.from('whatsapp_connections').select('id').or(instanceOrFilter(instanceName)).maybeSingle();
  if (!connection) {
    const { data: newConn } = await supabase.from('whatsapp_connections')
      .insert({ name: instanceName, instance_name: instanceName, instance_id: instanceName, status: 'connected', phone_number: '' })
      .select('id').single();
    connection = newConn;
  }
  if (!connection) throw new Error('Could not create/find WhatsApp connection');

  let synced = 0, skipped = 0;
  for (const contact of contacts) {
    const remoteJid = contact.id || contact.remoteJid || '';
    if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast') || !remoteJid.includes('@')) { skipped++; continue; }
    const phone = remoteJid.replace('@s.whatsapp.net', '');
    if (!phone || phone.length < 6) { skipped++; continue; }
    const name = contact.pushName || contact.name || contact.verifiedName || phone;

    const { error: upsertError } = await supabase.from('contacts').upsert(
      { phone, name, avatar_url: contact.profilePictureUrl || null, whatsapp_connection_id: connection.id },
      { onConflict: 'phone,whatsapp_connection_id', ignoreDuplicates: false }
    );
    if (upsertError) {
      await supabase.from('contacts').update({ name, avatar_url: contact.profilePictureUrl || null })
        .eq('phone', phone).eq('whatsapp_connection_id', connection.id);
    }
    synced++;
  }

  return jsonRes({ success: true, synced, skipped, page, totalFetched: contacts.length, hasMore: contacts.length >= offset }, corsHeaders);
}

/** sync Messages function. */
export async function syncMessages(
  supabase: SupabaseClient, evolutionApiUrl: string, evolutionApiKey: string,
  instanceName: string, contactPhone: string, corsHeaders: Record<string, string>
): Promise<Response> {
  if (!contactPhone) throw new Error('contactPhone is required');

  const remoteJid = contactPhone.includes('@') ? contactPhone : `${contactPhone}@s.whatsapp.net`;

  const messagesResponse = await fetch(
    `${evolutionApiUrl}/chat/findMessages/${instanceName}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
      body: JSON.stringify({ where: { key: { remoteJid } }, page: 1, offset: 50 }), signal: AbortSignal.timeout(10_000) }
  );
  if (!messagesResponse.ok) throw new Error(`Evolution API error [${messagesResponse.status}]: ${await messagesResponse.text()}`);

  const messagesData = await messagesResponse.json();
  const messages = Array.isArray(messagesData) ? messagesData : messagesData.messages || [];

  const { data: connection2 } = await supabase.from('whatsapp_connections').select('id').or(instanceOrFilter(instanceName)).maybeSingle();
  if (!connection2) throw new Error('WhatsApp connection not found');

  const phone = contactPhone.replace('@s.whatsapp.net', '');
  const { data: contact } = await supabase.from('contacts').select('id')
    .eq('phone', phone).eq('whatsapp_connection_id', connection2.id).maybeSingle();
  if (!contact) throw new Error(`Contact not found for phone ${phone}`);

  let synced = 0;
  for (const msg of messages) {
    const key = msg.key || {};
    const externalId = key.id;
    if (!externalId) continue;

    const { data: existing } = await supabase.from('messages').select('id').eq('external_id', externalId).maybeSingle();
    if (existing) continue;

    const { content, messageType } = parseEvolutionMessage(msg.message || {});

    const sender = key.fromMe ? 'agent' : 'contact';
    const createdAt = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : new Date().toISOString();

    const { error: insertError } = await supabase.from('messages').insert({
      contact_id: contact.id, whatsapp_connection_id: connection2.id, content,
      message_type: messageType, sender, external_id: externalId, is_read: true, status: 'read', created_at: createdAt,
    });
    if (!insertError) synced++;
  }

  return jsonRes({ success: true, synced, totalFetched: messages.length }, corsHeaders);
}

/** sync All Messages function. */
export async function syncAllMessages(
  supabase: SupabaseClient, evolutionApiUrl: string, evolutionApiKey: string,
  instanceName: string, messagesPerContact: number, corsHeaders: Record<string, string>
): Promise<Response> {
  const { data: conn } = await supabase.from('whatsapp_connections').select('id').or(instanceOrFilter(instanceName)).maybeSingle();
  if (!conn) throw new Error('WhatsApp connection not found for instance ' + instanceName);

  const { data: allContacts, error: contactsErr } = await supabase.from('contacts').select('id, phone')
    .eq('whatsapp_connection_id', conn.id).order('updated_at', { ascending: false }).limit(500);
  if (contactsErr) throw new Error('Failed to fetch contacts: ' + contactsErr.message);
  if (!allContacts?.length) return jsonRes({ success: true, message: 'No contacts found', totalSynced: 0 }, corsHeaders);

  let totalSynced = 0, totalSkipped = 0, totalErrors = 0;
  const batchSize = 20;

  for (let batchStart = 0; batchStart < allContacts.length; batchStart += batchSize) {
    const batch = allContacts.slice(batchStart, batchStart + batchSize);
    for (const contact of batch) {
      try {
        const remoteJid = `${contact.phone}@s.whatsapp.net`;
        const msgResponse = await fetch(`${evolutionApiUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
          body: JSON.stringify({ where: { key: { remoteJid } }, page: 1, offset: messagesPerContact }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!msgResponse.ok) { totalErrors++; continue; }

        const msgData = await msgResponse.json();
        const messages = Array.isArray(msgData) ? msgData : msgData.messages || [];

        for (const msg of messages) {
          const key = msg.key || {};
          if (!key.id) continue;
          const { data: existing } = await supabase.from('messages').select('id').eq('external_id', key.id).maybeSingle();
          if (existing) { totalSkipped++; continue; }

          const { content, messageType, shouldSkip } = parseEvolutionMessage(msg.message || {});
          if (shouldSkip) continue;

          const sender = key.fromMe ? 'agent' : 'contact';
          const createdAt = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : new Date().toISOString();

          const { error: insertError } = await supabase.from('messages').insert({
            contact_id: contact.id, whatsapp_connection_id: conn.id, content,
            message_type: messageType, sender, external_id: key.id, is_read: true, status: 'read', created_at: createdAt,
          });
          if (!insertError) totalSynced++;
        }
      } catch (err) { 
        totalErrors++; 
        await supabase.from('audit_logs').insert({
          action: 'message_sync_batch_failure',
          entity_type: 'whatsapp_connection',
          details: { instance_id: instanceName, error: err instanceof Error ? err.message : String(err) }
        });
      }
    }
  }

  if (totalSynced > 0 || totalErrors > 0) {
    await supabase.from('audit_logs').insert({
      action: 'message_sync_completed',
      entity_type: 'whatsapp_connection',
      details: { instance_id: instanceName, totalSynced, totalErrors, totalSkipped }
    });
  }

  return jsonRes({ success: true, totalSynced, totalSkipped, totalErrors, totalContacts: allContacts.length }, corsHeaders);
}

/** setup Webhook function. */
export async function setupWebhook(
  evolutionApiUrl: string, evolutionApiKey: string,
  instanceName: string, supabaseUrl: string, webhookUrlOverride: string | undefined, corsHeaders: Record<string, string>
): Promise<Response> {
  const webhookUrl = webhookUrlOverride || `${supabaseUrl}/functions/v1/evolution-webhook`;
  // Evolution API v4.x: body must be wrapped in { webhook: { ... } }
  const webhookResponse = await fetch(`${evolutionApiUrl}/webhook/set/${instanceName}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
    body: JSON.stringify({
      webhook: { enabled: true, url: webhookUrl, webhookByEvents: false, webhookBase64: true, events: WEBHOOK_EVENTS },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const webhookData = await webhookResponse.json().catch(() => ({}));
  return new Response(JSON.stringify({ success: webhookResponse.ok, webhook: webhookData }), {
    status: webhookResponse.ok ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** cleanup Mock function. */
export async function cleanupMock(supabase: SupabaseClient, corsHeaders: Record<string, string>): Promise<Response> {
  const { data: mockContacts } = await supabase.from('contacts').select('id').like('id', 'c1000001-%');
  if (mockContacts?.length) {
    const mockIds = mockContacts.map((c: { id: string }) => c.id);
    await supabase.from('messages').delete().in('contact_id', mockIds);
    await supabase.from('contact_tags').delete().in('contact_id', mockIds);
    await supabase.from('contact_notes').delete().in('contact_id', mockIds);
    await supabase.from('contacts').delete().in('id', mockIds);
    return jsonRes({ success: true, removed: mockIds.length }, corsHeaders);
  }
  return jsonRes({ success: true, removed: 0, message: 'No mock data found' }, corsHeaders);
}

/** full Sync function. */
export async function fullSync(
  supabase: SupabaseClient, evolutionApiUrl: string, evolutionApiKey: string,
  instanceName: string, supabaseUrl: string, corsHeaders: Record<string, string>
): Promise<Response> {
  const results: Record<string, unknown> = {};

  // Cleanup
  const { data: mockContacts } = await supabase.from('contacts').select('id').like('id', 'c1000001-%');
  if (mockContacts?.length) {
    const mockIds = mockContacts.map((c: { id: string }) => c.id);
    await supabase.from('messages').delete().in('contact_id', mockIds);
    await supabase.from('contact_tags').delete().in('contact_id', mockIds);
    await supabase.from('contact_notes').delete().in('contact_id', mockIds);
    await supabase.from('contacts').delete().in('id', mockIds);
    results.cleanup = { removed: mockIds.length };
  } else {
    results.cleanup = { removed: 0 };
  }

  // Connection
  let { data: conn } = await supabase.from('whatsapp_connections').select('id').or(instanceOrFilter(instanceName)).maybeSingle();
  if (!conn) {
    const { data: newConn } = await supabase.from('whatsapp_connections')
      .insert({ name: instanceName, instance_name: instanceName, instance_id: instanceName, status: 'connected', phone_number: '' })
      .select('id').single();
    conn = newConn;
  }

  // Import contacts
  let totalSynced = 0, totalSkipped = 0;
  try {
    const contactsResponse = await fetch(`${evolutionApiUrl}/chat/findContacts/${instanceName}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
      body: JSON.stringify({ where: {} }),
      signal: AbortSignal.timeout(10_000),
    });
    if (contactsResponse.ok) {
      const contactsList = await contactsResponse.json();
      const validContacts: { phone: string; name: string; avatar_url: string | null; whatsapp_connection_id: string }[] = [];
      for (const c of contactsList) {
        const jid = c.id || c.remoteJid || '';
        if (!jid.endsWith('@s.whatsapp.net') || c.isGroup) { totalSkipped++; continue; }
        const phone = jid.replace('@s.whatsapp.net', '');
        if (!phone || phone.length < 6) { totalSkipped++; continue; }
        validContacts.push({ phone, name: (c.pushName?.trim()) || phone, avatar_url: c.profilePicUrl || null, whatsapp_connection_id: conn!.id });
      }
      const limit = Math.min(validContacts.length, 500);
      for (let i = 0; i < limit; i++) {
        const ct = validContacts[i];
        const { error: insErr } = await supabase.from('contacts').insert(ct);
        if (!insErr) totalSynced++;
        else if (insErr.code === '23505') {
          await supabase.from('contacts').update({ name: ct.name, avatar_url: ct.avatar_url }).eq('phone', ct.phone).eq('whatsapp_connection_id', ct.whatsapp_connection_id);
          totalSynced++;
        }
      }
    }
  } catch { /* contact sync error */ }
  results.contacts = { synced: totalSynced, skipped: totalSkipped };

  // Webhook
  const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
  try {
    const webhookResponse = await fetch(`${evolutionApiUrl}/webhook/set/${instanceName}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
      body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl, webhookByEvents: false, webhookBase64: true, events: WEBHOOK_EVENTS } }),
      signal: AbortSignal.timeout(10_000),
    });
    results.webhook = { success: webhookResponse.ok, url: webhookUrl };
  } catch (e) {
    console.error('[fullSync] webhook setup error:', e instanceof Error ? e.message : String(e));
    results.webhook = { success: false, error: 'webhook setup failed' };
  }

  return jsonRes({ success: true, results }, corsHeaders);
}

// ─── Shared utilities ───

// Lista canônica de 27 eventos do webhook Evolution v2 que o roteador
// (`evolution-webhook/index.ts`) processa hoje. Mantém alinhamento entre o
// que registramos na Evolution API e o que efetivamente tratamos no backend.
// Em particular: MESSAGES_UPDATE traz ACK (SERVER_ACK/DELIVERY_ACK/READ/PLAYED)
// e CHATS_UPDATE traz a virada de unreadCount → 0 vinda do device do cliente.
/** W E B H O O K_ E V E N T S constant. */
export const WEBHOOK_EVENTS = [
  'APPLICATION_STARTUP', 'QRCODE_UPDATED', 'CONNECTION_UPDATE', 'LOGOUT_INSTANCE',
  'MESSAGES_SET', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'MESSAGES_EDITED', 'MESSAGES_REACTION',
  'SEND_MESSAGE',
  'CONTACTS_SET', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE',
  'PRESENCE_UPDATE',
  'CHATS_SET', 'CHATS_UPSERT', 'CHATS_UPDATE', 'CHATS_DELETE',
  'GROUPS_UPSERT', 'GROUP_UPDATE', 'GROUP_PARTICIPANTS_UPDATE',
  'LABELS_EDIT', 'LABELS_ASSOCIATION',
  'CALL',
  'NEW_JWT_TOKEN',
  'TYPEBOT_START', 'TYPEBOT_CHANGE_STATUS',
];

function parseEvolutionMessage(messageObj: EvolutionRawMsg): { content: string; messageType: string; shouldSkip?: boolean } {
  if (messageObj.conversation) return { content: messageObj.conversation, messageType: 'text' };
  if (messageObj.extendedTextMessage?.text) return { content: messageObj.extendedTextMessage.text, messageType: 'text' };
  if (messageObj.imageMessage) return { content: messageObj.imageMessage.caption || '[Imagem]', messageType: 'image' };
  if (messageObj.videoMessage) return { content: messageObj.videoMessage.caption || '[Vídeo]', messageType: 'video' };
  if (messageObj.audioMessage) return { content: '[Áudio]', messageType: 'audio' };
  if (messageObj.documentMessage) return { content: messageObj.documentMessage.fileName || '[Documento]', messageType: 'document' };
  if (messageObj.stickerMessage) return { content: '[Sticker]', messageType: 'sticker' };
  if (messageObj.reactionMessage) return { content: '', messageType: 'reaction', shouldSkip: true };
  return { content: '[Mensagem não suportada]', messageType: 'text' };
}

function jsonRes(data: unknown, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
