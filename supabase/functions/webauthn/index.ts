import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders } from "../_shared/validation.ts";
import { WebAuthnActionSchema, parseBody } from "../_shared/schemas.ts";

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64URLDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array.buffer);
}

function getRpId(origin: string): string {
  try { return new URL(origin).hostname; } catch { return 'localhost'; }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("webauthn");

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
    const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.json();
    const parsed = parseBody(WebAuthnActionSchema, rawBody);
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { action, userId, userEmail, userName, credential, friendlyName } = parsed.data;
    const origin = req.headers.get('origin') || 'https://localhost';
    const rpId = getRpId(origin);
    const rpName = 'ZAPP Web';

    // Verify caller identity for actions that require authentication
    const authHeader = req.headers.get('Authorization');
    let authenticatedUserId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (!claimsError && claimsData && typeof claimsData === 'object' && 'claims' in claimsData) {
        const claims = claimsData.claims;
        if (typeof claims === 'object' && claims !== null && 'sub' in claims && typeof claims.sub === 'string') {
          authenticatedUserId = claims.sub;
        }
      }
    }

    log.info("WebAuthn action", { action, rpId });

    switch (action) {
      case 'registration-options': {
        if (!userId || !userEmail) return errorResponse('userId and userEmail are required', 400, req);
        if (!authenticatedUserId || authenticatedUserId !== userId) {
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
        if (!authenticatedUserId || authenticatedUserId !== userId) {
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

        const { error: insertError } = await supabaseAdmin.from('passkey_credentials').insert({
          user_id: userId, credential_id: id, public_key: cr.attestationObject,
          counter: 0, device_type: authenticatorAttachment,
          backed_up: cr.publicKeyAlgorithm === '-7', transports,
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

        await supabaseAdmin.from('passkey_credentials')
          .update({ last_used_at: new Date().toISOString(), counter: (typeof storedObj.counter === 'number' ? storedObj.counter : 0) + 1 })
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
