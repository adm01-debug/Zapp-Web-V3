import { handleCors, errorResponse, errorEnvelope, jsonResponse, Logger, sanitizeString, checkRateLimit, getClientIP, getCorsHeaders } from "../_shared/validation.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("create-user");

  const ip = getClientIP(req);
  const rl = checkRateLimit(`create-user:${ip}`, 5, 60_000);
  if (!rl.allowed) return errorEnvelope('rate_limit_exceeded', 'Rate limit exceeded', 429, req);

  try {
    const authed = await requireAdminOrSupervisor(req);
    if (authed instanceof Response) return authed;

    const adminClient = createZappAdminClient();

    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('create-user', CONTRACT_SCHEMAS['create-user'], req, raw, { extraHeaders: getCorsHeaders(req) });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as Record<string, any>;

    const { email, password, name, nickname, signature, job_title, avatar_url, role, gmail_email, google_services, dropbox_email } = body;
    const sanitizedName = sanitizeString(name) || name;

    // Create user via admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: sanitizedName },
    });

    if (createError) {
      log.error("User creation failed", { error: createError.message });
      const userFacingMsg = createError.message.toLowerCase().includes("already registered")
        ? "Email already registered"
        : "User creation failed";
      return errorResponse(userFacingMsg, 400, req);
    }

    // Upsert the role — UPDATE alone silently no-ops when the user_roles row
    // doesn't exist yet (trigger race after createUser), leaving the role unset.
    if (role && newUser.user) {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .upsert({ user_id: newUser.user.id, role }, { onConflict: 'user_id' });
      if (roleError) {
        log.error("Role assignment failed", { error: roleError.message });
        // Roll back the user creation so the caller knows the full setup failed.
        await adminClient.auth.admin.deleteUser(newUser.user!.id).catch(() => {});
        return errorResponse("User created but role assignment failed — user rolled back", 500, req);
      }
    }

    // Update profile with additional fields
    if (newUser.user) {
      const profileUpdate: Record<string, unknown> = {};
      if (nickname) profileUpdate.nickname = nickname;
      if (signature) profileUpdate.signature = signature;
      if (job_title) profileUpdate.job_title = job_title;
      if (avatar_url) profileUpdate.avatar_url = avatar_url;

      if (Object.keys(profileUpdate).length > 0) {
        await adminClient
          .from("profiles")
          .update(profileUpdate)
          .eq("user_id", newUser.user.id);
      }
    }

    // If a Gmail email was provided, create the gmail_accounts record
    if (gmail_email && newUser.user) {
      const { error: gmailError } = await adminClient
        .from("gmail_accounts")
        .insert({
          user_id: newUser.user.id,
          email_address: gmail_email,
          is_active: true,
          sync_status: "pending",
        });

      if (gmailError) {
        log.error("Gmail account creation failed", { error: gmailError.message });
      }

      // Create Google service accounts linked to same email
      if (google_services && google_services.length > 0) {
        const serviceRows = google_services.map((svc: string) => ({
          user_id: newUser.user!.id,
          service_type: svc,
          account_email: gmail_email,
          is_active: true,
        }));

        const { error: svcError } = await adminClient
          .from("user_service_accounts")
          .insert(serviceRows);

        if (svcError) {
          log.error("Service accounts creation failed", { error: svcError.message });
        }
      }
    }

    // If a Dropbox email was provided, create the service account
    if (dropbox_email && newUser.user) {
      const { error: dropboxError } = await adminClient
        .from("user_service_accounts")
        .insert({
          user_id: newUser.user.id,
          service_type: "dropbox",
          account_email: dropbox_email,
          is_active: true,
        });

      if (dropboxError) {
        log.error("Dropbox account creation failed", { error: dropboxError.message });
      }
    }

    log.done(200, { userId: newUser.user?.id });
    return jsonResponse({ success: true, user_id: newUser.user?.id }, 200, req);
  } catch (err: unknown) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return errorEnvelope('internal_error', "Internal server error", 500, req);
  }
});
