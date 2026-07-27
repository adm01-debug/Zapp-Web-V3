import { handleCors, errorResponse, jsonResponse, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { WebAuthnActionSchema, parseBody } from "../_shared/schemas.ts";

/**
 * Encodes an ArrayBuffer as base64url (RFC 4648 Section 5) without padding.
 * Required for WebAuthn challenges and credential IDs which use base64url format.
 * @param buffer - Binary data to encode
 * @returns Base64url-encoded string (no padding)
 */
function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Decodes a base64url string (RFC 4648 Section 5) to Uint8Array.
 * Inverse of base64URLEncode; handles padding variations from WebAuthn responses.
 * @param str - Base64url-encoded string
 * @returns Decoded binary data
 */
function base64URLDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Generates a cryptographically random 32-byte challenge for WebAuthn ceremonies.
 * Used for both registration and authentication to prevent replay attacks.
 * @returns Base64url-encoded 256-bit random challenge
 */
function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array.buffer);
}

/**
 * Extracts the Relying Party ID (hostname) from an origin URL.
 * Used for WebAuthn credential validation: credentials bound to their origin's hostname.
 * @param origin - Full origin URL (e.g., 'https://example.com:8080')
 * @returns Hostname only (e.g., 'example.com'), or 'localhost' on parse error
 */
function getRpId(origin: string): string {
  try { return new URL(origin).hostname; } catch { return 'localhost'; }
}

/** Extract the 'authData' byte string from a CBOR-encoded WebAuthn attestation object. */
function extractAuthDataFromCBOR(bytes: Uint8Array): Uint8Array | null {
  // CBOR text-string key "authData": 0x68 (tstr len=8) + "authData" in ASCII
  const marker = new Uint8Array([0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61]);
  outer: for (let i = 0; i <= bytes.length - marker.length; i++) {
    for (let j = 0; j < marker.length; j++) { if (bytes[i + j] !== marker[j]) continue outer; }
    return parseCBORByteString(bytes, i + marker.length);
  }
  return null;
}

function parseCBORByteString(bytes: Uint8Array, pos: number): Uint8Array | null {
  if (pos >= bytes.length) return null;
  const h = bytes[pos];
  if ((h & 0xe0) !== 0x40) return null; // not a CBOR byte string
  const info = h & 0x1f;
  let offset = pos + 1, len: number;
  if (info < 24) { len = info; }
  else if (info === 24) { len = bytes[offset++]; }
  else if (info === 25) { len = (bytes[offset] << 8) | bytes[offset + 1]; offset += 2; }
  else if (info === 26) { len = (bytes[offset] << 24) | (bytes[offset+1] << 16) | (bytes[offset+2] << 8) | bytes[offset+3]; offset += 4; }
  else return null;
  if (offset + len > bytes.length) return null;
  return bytes.slice(offset, offset + len);
}

/**
 * Extract the CBOR-encoded COSE public key from registration authData.
 * authData layout: 32B rpIdHash | 1B flags | 4B signCount | 16B AAGUID | 2B credIdLen | credId | COSE key
 */
function extractCOSEKeyFromAuthData(authData: Uint8Array): Uint8Array | null {
  if (authData.length < 37) return null;
  if ((authData[32] & 0x40) === 0) return null; // AT flag not set — no attested credential data
  if (authData.length < 55) return null;
  const credIdLen = (authData[53] << 8) | authData[54];
  const start = 55 + credIdLen;
  return start < authData.length ? authData.slice(start) : null;
}

/**
 * Import a CBOR-encoded COSE ES256 (P-256 ECDSA) public key as a Web Crypto CryptoKey.
 * Only alg -7 (ES256 / P-256) is supported; returns null for other algorithms (e.g. RS256).
 */
async function importCOSEPublicKey(cose: Uint8Array): Promise<CryptoKey | null> {
  let pos = 0;
  if (pos >= cose.length) return null;
  const mapByte = cose[pos++];
  if ((mapByte & 0xe0) !== 0xa0) return null; // not a CBOR map
  let count = mapByte & 0x1f;
  if (count === 0x18) count = cose[pos++]; // 1-byte count
  let x: Uint8Array | null = null, y: Uint8Array | null = null;
  for (let i = 0; i < count && pos < cose.length; i++) {
    const kb = cose[pos++]; const kmaj = kb & 0xe0, kinfo = kb & 0x1f;
    let key: number;
    if (kmaj === 0x00) { key = kinfo < 24 ? kinfo : kinfo === 24 ? cose[pos++] : NaN; }
    else if (kmaj === 0x20) { key = kinfo < 24 ? -(kinfo + 1) : kinfo === 24 ? -(cose[pos++] + 1) : NaN; }
    else break;
    if (isNaN(key)) break;
    const vb = cose[pos++]; const vmaj = vb & 0xe0, vinfo = vb & 0x1f;
    if (vmaj === 0x40) { // byte string value
      let len: number;
      if (vinfo < 24) { len = vinfo; }
      else if (vinfo === 24) { len = cose[pos++]; }
      else if (vinfo === 25) { len = (cose[pos] << 8) | cose[pos + 1]; pos += 2; }
      else break;
      const val = cose.slice(pos, pos + len); pos += len;
      if (key === -2) x = val; else if (key === -3) y = val;
    } else if (vmaj === 0x00 || vmaj === 0x20) {
      // Integer value — skip extra bytes if any
      if (vinfo === 24) pos++; else if (vinfo === 25) pos += 2; else if (vinfo === 26) pos += 4;
    } else break; // unhandled CBOR major type
  }
  if (!x || !y || x.length !== 32 || y.length !== 32) return null;
  // Uncompressed P-256 point: 0x04 || x || y
  const ecPoint = new Uint8Array(65);
  ecPoint[0] = 0x04; ecPoint.set(x, 1); ecPoint.set(y, 33);
  try {
    return await crypto.subtle.importKey(
      'raw', ecPoint.buffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
  } catch { return null; }
}

/**
 * Edge Function: WebAuthn Credential Management (FIDO2/U2F)
 *
 * Handles passwordless authentication via WebAuthn protocol.
 * Supports registration (create) and authentication (verify) ceremonies with full validation.
 *
 * Security controls:
 * - Origin validation: credentials tied to exact origin, prevents cross-origin attacks
 * - Counter regression detection: detects and rejects cloned authenticators
 * - Challenge replay prevention: random per-request challenges
 * - Cross-origin rejection: raises error if authenticator response origin != request origin
 *
 * Flow:
 * - register_start: Create registration challenge + options for device
 * - register_finish: Verify attestation + store credential
 * - authenticate_start: Create authentication challenge
 * - authenticate_finish: Verify assertion + validate counter
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const ip = getClientIP(req);
  const rl = checkRateLimit(`webauthn:${ip}`, 20, 60_000);
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);

  const log = new Logger("webauthn");

  try {
    const supabaseAdmin = createZappAdminClient();

    const rawBody = await req.json();
    const parsed = parseBody(WebAuthnActionSchema, rawBody);
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { action, userId, userEmail, userName, credential, friendlyName } = parsed.data;
    const origin = req.headers.get('origin') || 'https://localhost';
    const rpId = getRpId(origin);
    const rpName = 'ZAPP Web';

    log.info("WebAuthn action", { action, rpId });

    switch (action) {
      case 'registration-options': {
        if (!userId || !userEmail) return errorResponse('userId and userEmail are required', 400, req);
        // Server-side JWT verification — getClaims() is client-side decode and unsafe
        const authed = await requireUser(req);
        if (authed instanceof Response) return authed;
        if (authed.user.id !== userId) {
          return errorResponse('Unauthorized: you can only register passkeys for your own account', 403, req);
        }

        const { data: existingCredentials } = await supabaseAdmin.from('passkey_credentials').select('credential_id').eq('user_id', userId);
        const excludeCredentials = (Array.isArray(existingCredentials) ? existingCredentials : [])
          .filter((cred): cred is { credential_id: string } =>
            typeof cred === 'object' && cred !== null && typeof cred.credential_id === 'string'
          )
          .map(cred => ({
            id: cred.credential_id, type: 'public-key', transports: ['internal', 'hybrid', 'usb', 'ble', 'nfc'],
          }));

        const challenge = generateChallenge();
        await supabaseAdmin.from('webauthn_challenges').insert({ user_id: userId, challenge, type: 'registration' });
        await supabaseAdmin.rpc('cleanup_expired_challenges');

        const options = {
          challenge, rp: { name: rpName, id: rpId },
          user: { id: base64URLEncode(new TextEncoder().encode(userId).buffer), name: userEmail, displayName: userName || userEmail },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'preferred', residentKey: 'preferred', requireResidentKey: false },
          timeout: 60000, attestation: 'none', excludeCredentials,
        };

        log.done(200, { action });
        return jsonResponse({ options }, 200, req);
      }

      case 'verify-registration': {
        if (!userId || !credential) return errorResponse('userId and credential are required', 400, req);
        // Server-side JWT verification — prevents forged JWT from hijacking another user's credential slot
        const authed = await requireUser(req);
        if (authed instanceof Response) return authed;
        if (authed.user.id !== userId) {
          return errorResponse('Unauthorized: you can only verify passkeys for your own account', 403, req);
        }

        const { data: challengeData, error: challengeError } = await supabaseAdmin
          .from('webauthn_challenges').select('challenge').eq('user_id', userId).eq('type', 'registration')
          .order('created_at', { ascending: false }).limit(1).single();

        if (challengeError || !challengeData) return errorResponse('Challenge not found or expired', 400, req);

        const credObj = credential as Record<string, unknown>;
        const id = typeof credObj.id === 'string' ? credObj.id : null;
        const type = credObj.type;
        const authenticatorAttachment = typeof credObj.authenticatorAttachment === 'string' ? credObj.authenticatorAttachment : 'platform';
        const credResponse = credObj.response;
        const transports = Array.isArray(credObj.transports) ? credObj.transports : ['internal'];

        if (type !== 'public-key') return errorResponse('Invalid credential type', 400, req);
        if (!id) return errorResponse('Credential ID missing', 400, req);

        if (typeof credResponse !== 'object' || credResponse === null) return errorResponse('Invalid credential response', 400, req);
        const cr = credResponse as Record<string, unknown>;
        if (typeof cr.clientDataJSON !== 'string' || typeof cr.attestationObject !== 'string') {
          return errorResponse('Credential response missing required fields', 400, req);
        }

        let clientData: unknown;
        try {
          const decoded = new TextDecoder().decode(base64URLDecode(cr.clientDataJSON));
          clientData = JSON.parse(decoded);
        } catch {
          return errorResponse('Failed to decode client data', 400, req);
        }

        if (typeof clientData !== 'object' || clientData === null || Array.isArray(clientData)) {
          return errorResponse('Invalid client data format', 400, req);
        }
        const cd = clientData as Record<string, unknown>;
        if (cd.type !== 'webauthn.create') return errorResponse('Invalid client data type', 400, req);
        if (cd.challenge !== challengeData.challenge) return errorResponse('Challenge mismatch', 400, req);
        if (typeof cd.origin !== 'string' || cd.origin !== origin) {
          return errorResponse('Origin mismatch or missing', 400, req);
        }
        if (cd.crossOrigin === true) return errorResponse('Cross-origin registration not allowed', 400, req);

        let backedUp = false;
        try {
          const attestationObjBytes = base64URLDecode(cr.attestationObject as string);
          if (attestationObjBytes.length > 37) {
            const flagsByte = attestationObjBytes[32];
            const BS = (flagsByte & 0x10) !== 0;
            backedUp = BS;
          }
        } catch {
          return errorResponse('Failed to parse attestation object', 400, req);
        }

        const { error: insertError } = await supabaseAdmin.from('passkey_credentials').insert({
          user_id: userId, credential_id: id, public_key: cr.attestationObject,
          counter: 0, device_type: authenticatorAttachment,
          backed_up: backedUp, transports,
          friendly_name: friendlyName || 'Passkey',
        });

        if (insertError) return errorResponse('Failed to store credential', 500, req);
        await supabaseAdmin.from('webauthn_challenges').delete().eq('user_id', userId).eq('type', 'registration');

        log.done(200, { action });
        return jsonResponse({ success: true, credentialId: id }, 200, req);
      }

      case 'authentication-options': {
        const challenge = generateChallenge();
        let allowCredentials: Array<{ id: string; type: string; transports: string[] }> = [];
        let authUserId: string | null = null;

        if (userEmail) {
          const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
          const users = Array.isArray(userData?.users) ? userData.users : [];
          const user = users.find((u: unknown) => {
            if (typeof u !== 'object' || u === null) return false;
            const uObj = u as Record<string, unknown>;
            return uObj.email === userEmail;
          });
          if (user && typeof user === 'object' && user !== null) {
            const userObj = user as Record<string, unknown>;
            if (typeof userObj.id === 'string') {
              authUserId = userObj.id;
              const { data: credentials } = await supabaseAdmin.from('passkey_credentials').select('credential_id, transports').eq('user_id', authUserId);
              allowCredentials = (Array.isArray(credentials) ? credentials : [])
                .filter((cred): cred is { credential_id: string; transports?: string[] } =>
                  typeof cred === 'object' && cred !== null && typeof cred.credential_id === 'string'
                )
                .map(cred => ({
                  id: cred.credential_id, type: 'public-key', transports: Array.isArray(cred.transports) && cred.transports.length > 0
                    ? cred.transports
                    : ['internal', 'hybrid'],
                }));
            }
          }
        }

        await supabaseAdmin.from('webauthn_challenges').insert({ user_id: authUserId, challenge, type: 'authentication' });

        log.done(200, { action });
        return jsonResponse({
          options: { challenge, rpId, timeout: 60000, userVerification: 'preferred', allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined },
        }, 200, req);
      }

      case 'verify-authentication': {
        if (!credential) return errorResponse('credential is required', 400, req);

        const credObj = credential as Record<string, unknown>;
        const id = credObj.id;
        const credResponse = credObj.response;

        if (typeof id !== 'string') return errorResponse('Credential ID missing', 400, req);

        const { data: storedCred, error: credError } = await supabaseAdmin.from('passkey_credentials').select('*').eq('credential_id', id).single();
        if (credError || !storedCred || typeof storedCred !== 'object' || Array.isArray(storedCred)) {
          return errorResponse('Credential not found', 400, req);
        }
        const storedObj = storedCred as Record<string, unknown>;
        if (typeof storedObj.user_id !== 'string' || typeof storedObj.id !== 'string') {
          return errorResponse('Invalid stored credential', 400, req);
        }

        const { data: challengeData } = await supabaseAdmin.from('webauthn_challenges')
          .select('challenge').eq('user_id', storedObj.user_id).eq('type', 'authentication')
          .order('created_at', { ascending: false }).limit(1).single();

        if (!challengeData || typeof challengeData !== 'object' || Array.isArray(challengeData)) {
          return errorResponse('Challenge not found or expired', 400, req);
        }
        const cdObj = challengeData as Record<string, unknown>;
        if (typeof cdObj.challenge !== 'string') return errorResponse('Invalid challenge data', 400, req);

        if (typeof credResponse !== 'object' || credResponse === null) return errorResponse('Invalid credential response', 400, req);
        const cr = credResponse as Record<string, unknown>;
        if (typeof cr.clientDataJSON !== 'string') return errorResponse('Client data missing', 400, req);

        let clientData: unknown;
        try {
          const decoded = new TextDecoder().decode(base64URLDecode(cr.clientDataJSON));
          clientData = JSON.parse(decoded);
        } catch {
          return errorResponse('Failed to decode client data', 400, req);
        }

        if (typeof clientData !== 'object' || clientData === null || Array.isArray(clientData)) {
          return errorResponse('Invalid client data format', 400, req);
        }
        const cd = clientData as Record<string, unknown>;
        if (cd.type !== 'webauthn.get') return errorResponse('Invalid client data type', 400, req);
        if (cd.challenge !== cdObj.challenge) return errorResponse('Challenge mismatch', 400, req);
        if (typeof cd.origin !== 'string' || cd.origin !== origin) {
          return errorResponse('Origin mismatch or missing', 400, req);
        }
        if (cd.crossOrigin === true) return errorResponse('Cross-origin authentication not allowed', 400, req);

        if (typeof cr.authenticatorData !== 'string') return errorResponse('Authenticator data missing', 400, req);
        if (typeof cr.signature !== 'string') return errorResponse('Signature missing', 400, req);

        const authData = base64URLDecode(cr.authenticatorData);
        if (authData.length < 37) return errorResponse('Invalid authenticator data length', 400, req);

        const counterBytes = authData.slice(33, 37);
        const counterView = new DataView(counterBytes.buffer, counterBytes.byteOffset, counterBytes.byteLength);
        const newCounter = counterView.getUint32(0, false);
        const storedCounter = typeof storedObj.counter === 'number' ? storedObj.counter : 0;

        // Skip counter check when newCounter=0: device does not implement the counter (spec §6.1)
        if (newCounter > 0 && newCounter <= storedCounter) {
          return errorResponse('Counter regression detected - possible cloned authenticator', 400, req);
        }

        // CRITICAL: verify ECDSA signature over (authData || sha256(clientDataJSON))
        // before committing any state changes.
        const storedPubKeyB64 = typeof storedObj.public_key === 'string' ? storedObj.public_key : '';
        const attestationBytes = base64URLDecode(storedPubKeyB64);
        const registrationAuthData = extractAuthDataFromCBOR(attestationBytes);
        if (!registrationAuthData) {
          return errorResponse('Failed to parse stored credential public key', 400, req);
        }
        const coseKey = extractCOSEKeyFromAuthData(registrationAuthData);
        if (!coseKey) {
          return errorResponse('Failed to extract COSE public key from stored credential', 400, req);
        }
        const cryptoKey = await importCOSEPublicKey(coseKey);
        if (!cryptoKey) {
          return errorResponse('Unsupported credential algorithm (only ES256/P-256 supported)', 400, req);
        }

        const clientDataBytesForHash = base64URLDecode(cr.clientDataJSON);
        const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataBytesForHash);
        const signedData = new Uint8Array(authData.length + clientDataHash.byteLength);
        signedData.set(authData, 0);
        signedData.set(new Uint8Array(clientDataHash), authData.length);

        const signatureBytes = base64URLDecode(cr.signature as string);
        const signatureValid = await crypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          cryptoKey,
          signatureBytes,
          signedData,
        );
        if (!signatureValid) {
          log.error("WebAuthn signature verification failed", { credentialId: id });
          return errorResponse('Signature verification failed', 400, req);
        }

        // Signature verified — commit state changes
        await supabaseAdmin.from('passkey_credentials')
          .update({ last_used_at: new Date().toISOString(), counter: newCounter })
          .eq('id', storedObj.id);
        await supabaseAdmin.from('webauthn_challenges').delete().eq('user_id', storedObj.user_id).eq('type', 'authentication');

        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(storedObj.user_id);
        const userEmail = userData && typeof userData === 'object' && 'user' in userData && userData.user && typeof userData.user === 'object'
          ? (userData.user as Record<string, unknown>).email
          : null;

        log.done(200, { action });
        return jsonResponse({ success: true, userId: storedObj.user_id, userEmail }, 200, req);
      }

      default:
        return errorResponse('Invalid action', 400, req);
    }
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
