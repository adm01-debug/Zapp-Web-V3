import { handleCors, errorResponse, jsonResponse, Logger, getClientIP, checkRateLimit } from "../_shared/validation.ts";
import { DetectNewDeviceSchema, parseBody } from "../_shared/schemas.ts";
import { createZappAdminClient, createZappClient } from "../_shared/db-client.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("detect-new-device");

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    // Server-side JWT verification via auth.getUser() — cannot be forged
    const supabaseUser = createZappClient(req);
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return errorResponse("Unauthorized", 401, req);
    }

    const rl = checkRateLimit(`detect-new-device:${user.id}`, 20, 60_000);
    if (!rl.allowed) return errorResponse('Rate limit exceeded. Tente novamente em instantes.', 429, req);

    log.info("User authenticated", { userId: user.id });

    const parsed = parseBody(DetectNewDeviceSchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { device_fingerprint, browser, os, device_name } = parsed.data;
    const clientIp = getClientIP(req);

    const supabaseAdmin = createZappAdminClient();

    // Check if device exists
    const { data: existingDevice, error: deviceError } = await supabaseAdmin
      .from("user_devices")
      .select("*")
      .eq("user_id", user.id)
      .eq("device_fingerprint", device_fingerprint)
      .maybeSingle();

    if (deviceError) throw deviceError;

    let isNewDevice = false;
    let deviceId: string;

    if (!existingDevice) {
      const { data: newDevice, error: insertError } = await supabaseAdmin
        .from("user_devices")
        .insert({
          user_id: user.id,
          device_fingerprint,
          device_name,
          browser,
          os,
          ip_address: clientIp,
          is_trusted: false,
        })
        .select()
        .single();

      // 23505 = unique_violation: concurrent request already inserted this fingerprint.
      // Re-fetch the existing record and treat as known device (idempotent).
      if (insertError) {
        if ((insertError as { code?: string }).code === '23505') {
          const { data: raceDevice } = await supabaseAdmin
            .from("user_devices")
            .select("*")
            .eq("user_id", user.id)
            .eq("device_fingerprint", device_fingerprint)
            .maybeSingle();
          if (raceDevice) {
            deviceId = raceDevice.id;
            isNewDevice = false;
          } else {
            throw insertError;
          }
        } else {
          throw insertError;
        }
      } else {
        isNewDevice = true;
        log.warn("New device detected");
        deviceId = newDevice.id;
      }

      if (isNewDevice) {
        // Send email notification
        const userEmail = user.email;
        if (userEmail && RESEND_API_KEY) {
          try {
            const emailHtml = `
              <!DOCTYPE html>
              <html>
              <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Alerta de Segurança</h1>
                </div>
                <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef; border-top: none;">
                  <p style="font-size: 16px;">Detectamos um <strong>novo login</strong> na sua conta a partir de um dispositivo desconhecido.</p>
                  <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #667eea;">Detalhes do Dispositivo:</h3>
                    <table style="width: 100%; font-size: 14px;">
                      <tr><td style="padding: 8px 0; color: #666;"><strong>Dispositivo:</strong></td><td>${device_name}</td></tr>
                      <tr><td style="padding: 8px 0; color: #666;"><strong>Navegador:</strong></td><td>${browser}</td></tr>
                      <tr><td style="padding: 8px 0; color: #666;"><strong>Sistema:</strong></td><td>${os}</td></tr>
                      <tr><td style="padding: 8px 0; color: #666;"><strong>IP:</strong></td><td>${clientIp}</td></tr>
                      <tr><td style="padding: 8px 0; color: #666;"><strong>Data/Hora:</strong></td><td>${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td></tr>
                    </table>
                  </div>
                  <div style="background: #fff3cd; padding: 15px; border-radius: 8px;">
                    <p style="margin: 0; font-size: 14px; color: #856404;"><strong>⚠️ Não reconhece este acesso?</strong><br>Altere sua senha e habilite a autenticação em duas etapas (2FA).</p>
                  </div>
                </div>
              </body>
              </html>`;

            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
              body: JSON.stringify({
                from: "Segurança <security@resend.dev>",
                to: [userEmail],
                subject: "🔐 Novo dispositivo detectado na sua conta",
                html: emailHtml,
              }),
              signal: AbortSignal.timeout(15_000),
            });
            log.info("Security email sent");
          } catch (emailError) {
            log.error("Error sending email", { error: emailError instanceof Error ? emailError.message : String(emailError) });
          }
        }

        // Create security alert
        await supabaseAdmin.from("security_alerts").insert({
          user_id: user.id,
          alert_type: "new_device",
          severity: "medium",
          title: "Novo dispositivo detectado",
          description: `Login realizado a partir de ${browser} em ${os} (IP: ${clientIp})`,
          ip_address: clientIp,
          metadata: { device_fingerprint, browser, os, device_name },
        });
      }
    } else {
      deviceId = existingDevice.id;
      log.info("Known device, updating last_seen");

      await supabaseAdmin
        .from("user_devices")
        .update({ last_seen_at: new Date().toISOString(), ip_address: clientIp })
        .eq("id", deviceId);
    }

    // Create or update session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("user_sessions")
      .insert({
        user_id: user.id,
        device_id: deviceId,
        ip_address: clientIp,
        user_agent: req.headers.get("user-agent") || "unknown",
        is_active: true,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (sessionError) {
      log.error("Error creating session", { error: sessionError.message });
    }

    log.done(200);
    return jsonResponse({
      is_new_device: isNewDevice,
      device_id: deviceId,
      session_id: session?.id,
      message: isNewDevice ? "New device detected and email sent" : "Known device updated"
    }, 200, req);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message
      : (error && typeof error === "object" && "message" in error) ? String((error as { message: unknown }).message)
      : JSON.stringify(error);
    log.error("Error", { error: msg });
    return errorResponse('Internal server error', 500, req);
  }
});
