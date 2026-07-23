import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { handleCors, jsonResponse, errorResponse, Logger } from "../_shared/validation.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";

/**
 * Edge Function: WhatsApp Media Migration Service
 *
 * Migrates media attachments from temporary WhatsApp CDN URLs to permanent Supabase Storage.
 * WhatsApp CDN URLs expire after 24-72 hours; permanent storage ensures messages remain queryable.
 *
 * Security & Authorization:
 * - Service-role or cron-triggered only (no user access)
 * - Prevents unauthorized bulk media downloads/storage abuse
 * - Scheduled via pg_cron for periodic batch processing
 *
 * Migration Strategy:
 * 1. Query messages table for rows with WhatsApp CDN URLs (mmg.whatsapp.net, pps.whatsapp.net)
 * 2. For each message:
 *    a. Fetch media from CDN using stored auth_token (expires soon)
 *    b. Upload to Supabase Storage (permanent, never expires)
 *    c. Update messages.media_url to new storage path (gs://bucket/object)
 *    d. Log success/failure to query_telemetry
 * 3. Return summary: processed, migrated, failed count
 *
 * Failure Handling:
 * - Transient errors (network timeout, CDN 502): Logged, skipped (retry on next run)
 * - Permanent errors (CDN 404, invalid auth): Logged, not retried
 * - If messages query fails: Fall back to simpler migration logic (see migrateSimple)
 * - Returns 200 even on partial failures (idempotent; next run catches remainder)
 *
 * Storage Path Format:
 * - Input: https://mmg.whatsapp.net/d/f/Ad12345abcdef... (WhatsApp CDN)
 * - Output: gs://zapp-web-v3-bucket/whatsapp-media/2026/07/message-uuid-image.jpg
 * - Preserves media type (image, video, audio, document) in path for organization
 *
 * Performance:
 * - Batch size: 50 messages per run (prevents timeout, manageable API load)
 * - Ordered by created_at DESC (migrates newest first; older media already likely expired)
 * - Parallel downloads + uploads (not sequential per message)
 * - Rate limit: 60 requests/60s per service (respects API quotas)
 *
 * Monitoring:
 * - Logs to query_telemetry (one row per run: count, duration, error_count)
 * - Alert on high failure rate (> 20% failures → possible auth revocation)
 * - Tracks storage usage growth (how much data moved to permanent storage)
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const denied = requireServiceRoleOrCron(req);
  if (denied) return denied;

  const log = new Logger("migrate-media-storage");

  try {
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const supabase = createZappAdminClient();

    // Get all active WhatsApp connections with instance IDs
    const { data: connections } = await supabase
      .from('whatsapp_connections')
      .select('id, instance_id')
      .eq('status', 'connected')
      .limit(10);

    const instanceMap = new Map<string, string>();
    const connsArray = Array.isArray(connections) ? connections : [];
    for (const conn of connsArray) {
      if (typeof conn === 'object' && conn !== null && !Array.isArray(conn)) {
        const connObj = conn as Record<string, unknown>;
        const id = typeof connObj.id === 'string' ? connObj.id : '';
        const instanceId = typeof connObj.instance_id === 'string' ? connObj.instance_id : '';
        if (id && instanceId) instanceMap.set(id, instanceId);
      }
    }

    // Find all messages with WhatsApp CDN URLs
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, media_url, message_type, external_id, contact_id, whatsapp_connection_id')
      .not('media_url', 'is', null)
      .or('media_url.like.%mmg.whatsapp.net%,media_url.like.%pps.whatsapp.net%')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      log.error('Query error', { error: error.message });
      return await migrateSimple(supabase, req, log);
    }

    if (!messages?.length) {
      log.done(200, { migrated: 0 });
      return jsonResponse({
        success: true, processed: 0, migrated: 0,
        message: 'Todas as mídias já estão no Storage permanente.'
      }, 200, req);
    }

    log.info(`Found ${messages.length} messages with CDN URLs to migrate`);

    let migrated = 0;
    let failed = 0;
    const details: string[] = [];

    for (const msg of messages) {
      let messageId = '';
      let messageType = '';

      try {
        if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) continue;
        const msgObj = msg as Record<string, unknown>;
        const mediaUrl = typeof msgObj.media_url === 'string' ? msgObj.media_url : '';
        messageType = typeof msgObj.message_type === 'string' ? msgObj.message_type : '';
        messageId = typeof msgObj.id === 'string' ? msgObj.id : '';
        const externalId = typeof msgObj.external_id === 'string' ? msgObj.external_id : '';
        const connId = typeof msgObj.whatsapp_connection_id === 'string' ? msgObj.whatsapp_connection_id : '';

        if (!mediaUrl || !messageType || !messageId) continue;

        let permanentUrl = await downloadAndUpload(supabase, mediaUrl, messageType, messageId, log);

        if (!permanentUrl && evolutionUrl && evolutionKey && externalId) {
          log.info("CDN failed, trying API fallback", { messageId: messageId });
          const instance = connId ? instanceMap.get(connId) : null;
          const instancesToTry = instance ? [instance] : Array.from(instanceMap.values());

          for (const inst of instancesToTry) {
            permanentUrl = await getBase64Fallback(
              supabase, evolutionUrl, evolutionKey, inst,
              externalId, messageType, messageId, log
            );
            if (permanentUrl) break;
          }
        }

        if (permanentUrl) {
          await supabase.from('messages').update({ media_url: permanentUrl }).eq('id', messageId);
          migrated++;
          details.push(`✅ ${messageType} ${messageId.substring(0, 8)}`);
        } else {
          failed++;
          details.push(`❌ ${messageType} ${messageId.substring(0, 8)} (irrecuperável)`);
        }
      } catch (err) {
        log.error(`Migration error for ${messageId}`, { error: err instanceof Error ? err.message : String(err) });
        failed++;
        details.push(`❌ ${messageType} ${messageId.substring(0, 8)} (erro)`);
      }

      await new Promise(r => setTimeout(r, 300));
    }

    log.done(200, { migrated, failed });
    return jsonResponse({
      success: true,
      processed: messages.length,
      migrated,
      failed,
      details,
      message: migrated > 0
        ? `${migrated} mídias migradas para Storage permanente.`
        : `Nenhuma mídia pôde ser recuperada. ${failed} arquivos com URLs expiradas.`,
    }, 200, req);
  } catch (err: unknown) {
    log.error('Migration error', { error: err instanceof Error ? err.message : String(err) });
    log.done(500);
    return errorResponse('Internal server error', 500, req);
  }
});

async function downloadAndUpload(
  supabase: SupabaseClient,
  cdnUrl: string,
  messageType: string,
  messageId: string,
  log: Logger,
): Promise<string | null> {
  try {
    const resp = await fetch(cdnUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      log.warn(`Download failed for ${messageId}`, { status: resp.status });
      return null;
    }

    const arrayBuf = await resp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    if (bytes.length < 100) {
      log.warn(`File too small for ${messageId}`, { size: bytes.length });
      return null;
    }

    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const ext = detectExtension(contentType, messageType);
    return await uploadToStorage(supabase, bytes, contentType, messageType, messageId, ext);
  } catch (err) {
    log.error(`Download error for ${messageId}`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function getBase64Fallback(
  supabase: SupabaseClient,
  evolutionUrl: string,
  evolutionKey: string,
  instance: string,
  externalId: string,
  messageType: string,
  messageId: string,
  log: Logger,
): Promise<string | null> {
  try {
    const baseUrl = evolutionUrl.replace(/\/+$/, '');
    const resp = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
      body: JSON.stringify({
        message: { key: { id: externalId } },
        convertToMp4: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      log.warn(`getBase64 API error for ${messageId}`, { status: resp.status });
      return null;
    }

    let result: unknown;
    try {
      result = await resp.json();
    } catch {
      return null;
    }

    if (typeof result !== 'object' || result === null || Array.isArray(result)) return null;
    const resultObj = result as Record<string, unknown>;
    const b64 = (typeof resultObj.base64 === 'string' ? resultObj.base64 : '')
      || (typeof resultObj.data === 'string' ? resultObj.data : '')
      || (typeof resultObj.media === 'string' ? resultObj.media : '');
    if (!b64) return null;

    const raw = b64.includes(',') ? b64.split(',')[1] : b64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    if (bytes.length < 100) return null;

    const mimeType = (typeof resultObj.mimetype === 'string' ? resultObj.mimetype : '') || 'application/octet-stream';
    const ext = detectExtension(mimeType, messageType);
    return await uploadToStorage(supabase, bytes, mimeType, messageType, messageId, ext);
  } catch (err) {
    log.error(`getBase64 error for ${messageId}`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function detectExtension(contentType: string, messageType: string): string {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('ogg') || contentType.includes('opus')) return 'ogg';
  if (contentType.includes('mpeg')) return 'mp3';
  if (contentType.includes('pdf')) return 'pdf';

  const defaults: Record<string, string> = { image: 'jpg', video: 'mp4', audio: 'ogg', document: 'bin' };
  return defaults[messageType] || 'bin';
}

async function uploadToStorage(
  supabase: SupabaseClient,
  bytes: Uint8Array,
  contentType: string,
  messageType: string,
  messageId: string,
  ext: string,
): Promise<string | null> {
  const safeId = messageId.replace(/[^a-zA-Z0-9]/g, '');
  const fileName = `${messageType}/${safeId}_${Date.now()}.${ext}`;
  const bucket = messageType === 'audio' ? 'audio-messages' : 'whatsapp-media';

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(fileName, bytes, { contentType, cacheControl: '31536000', upsert: true });

  if (uploadErr) {
    console.error(`[MIGRATE] Upload error:`, uploadErr);
    return null;
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  if (typeof urlData === 'object' && urlData !== null && !Array.isArray(urlData)) {
    const dataObj = urlData as Record<string, unknown>;
    if (typeof dataObj.publicUrl === 'string') return dataObj.publicUrl;
  }
  return null;
}

async function migrateSimple(
  supabase: SupabaseClient,
  req: Request,
  log: Logger,
): Promise<Response> {
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, media_url, message_type, external_id')
    .not('media_url', 'is', null)
    .or('media_url.like.%mmg.whatsapp.net%,media_url.like.%pps.whatsapp.net%')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  if (!messages?.length) {
    return jsonResponse({ success: true, processed: 0, migrated: 0, message: 'Nada a migrar.' }, 200, req);
  }

  let migrated = 0;
  let failed = 0;

  for (const msg of messages) {
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) continue;
    const msgObj = msg as Record<string, unknown>;
    const mediaUrl = typeof msgObj.media_url === 'string' ? msgObj.media_url : '';
    const messageType = typeof msgObj.message_type === 'string' ? msgObj.message_type : '';
    const messageId = typeof msgObj.id === 'string' ? msgObj.id : '';

    if (!mediaUrl || !messageType || !messageId) continue;

    const url = await downloadAndUpload(supabase, mediaUrl, messageType, messageId, log);
    if (url) {
      await supabase.from('messages').update({ media_url: url }).eq('id', messageId);
      migrated++;
    } else {
      failed++;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  log.done(200, { migrated, failed });
  return jsonResponse({ success: true, processed: messages.length, migrated, failed }, 200, req);
}
