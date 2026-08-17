// csat-dispatch v1.0 — Dispatch de surveys CSAT agendados (SIM-CSAT E2-6/E2-7)
// Cron pg_cron a cada 1 min (job csat-dispatch-tick, migration 20260817210000)
// — implementa "após X minutos da resolução" de forma confiável: o delay vira
// send_at no banco (csat-auto-send), e este dispatcher envia quando vence.
//
// Requer service-role bearer OU x-cron-secret (padrão nps-scheduler).
// POST body: { limit?, dryRun? } — cron chama sem body ({} aceito).
//
// Flow:
//   1. requireServiceRoleOrCron + contrato zod
//   2. rpc_claim_csat_due → claim atômico (FOR UPDATE SKIP LOCKED) dos surveys
//      status='scheduled' AND send_at <= now(), LIMIT 50 (reabre 'sending'
//      órfão >10min dentro do RPC — F9)
//   3. Para cada survey claimado: envio DIRETO evolutionClient.sendText
//      (instance_name da conexão, phone do contato, message_text renderizado
//      na criação) — NUNCA evolution_message_queue (F2: fila sem consumidor)
//   4. Sucesso → status='sent'; falha → status='failed' + attempts+1 +
//      last_error + failed_messages (error_code='CSAT_SEND_FAILED')
//   5. Retorna { claimed, sent, failed }
import { createZappAdminClient } from "../_shared/db-client.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { evolutionClient } from "../_shared/providers/evolution/index.ts";

const DEFAULT_LIMIT = 50;

interface ClaimedSurvey {
  survey_id: string;
  contact_id: string;
  agent_id: string | null;
  conversation_id: string | null;
  whatsapp_connection_id: string | null;
  message_text: string | null;
  phone: string | null;
  instance_name: string | null;
  send_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Cron chama sem body; {} é aceito. Contrato csat-dispatch@v1.
  const parsed = parseOrReject("csat-dispatch", CONTRACT_SCHEMAS["csat-dispatch"], req, await req.json().catch(() => ({})), {
    extraHeaders: getCorsHeaders(req),
  });
  if (parsed.ok === false) return parsed.response;

  const { limit, dryRun } = parsed.data as { limit?: number; dryRun?: boolean };
  const supabase = createZappAdminClient();

  try {
    // ── 1. Claim atômico dos surveys vencidos ─────────────────────────────────
    const { data: claimed, error: claimErr } = await supabase.rpc("rpc_claim_csat_due", {
      p_limit: limit ?? DEFAULT_LIMIT,
    });

    if (claimErr) {
      console.error("[csat-dispatch] rpc_claim_csat_due error:", claimErr.message);
      return json(req, { error: "claim_failed" }, 500);
    }

    const surveys = (claimed ?? []) as ClaimedSurvey[];
    if (surveys.length === 0) {
      return json(req, { claimed: 0, sent: 0, failed: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const survey of surveys) {
      // Guards de integridade do claim (G5/F8): sem instância ou sem texto,
      // o survey não pode ser enviado — marca failed com diagnóstico claro.
      if (!survey.instance_name) {
        await markFailed(supabase, survey, "connection_missing", "whatsapp_connection não resolvida");
        failed++;
        continue;
      }
      if (!survey.phone) {
        await markFailed(supabase, survey, "contact_without_phone", "contato sem phone");
        failed++;
        continue;
      }
      if (!survey.message_text) {
        await markFailed(supabase, survey, "empty_template", "message_text vazio (template não renderizado)");
        failed++;
        continue;
      }

      try {
        if (dryRun) {
          console.log(`[csat-dispatch][dry-run] survey=${survey.survey_id} instance=${survey.instance_name} phone=${survey.phone}`);
          // Devolve o survey ao estado 'scheduled' (não foi enviado)
          const { error: resetErr } = await supabase
            .from("csat_surveys")
            .update({ status: "scheduled", updated_at: new Date().toISOString() })
            .eq("id", survey.survey_id);
          if (resetErr) {
            console.error(`[csat-dispatch][dry-run] reset error survey=${survey.survey_id}:`, resetErr.message);
          }
          sent++;
          continue;
        }

        const resp = await evolutionClient.sendText(survey.instance_name, survey.phone, survey.message_text, {
          timeoutMs: 15_000,
        });

        if (!resp.ok) {
          const txt = resp.error ?? "evolution_send_failed";
          await markFailed(supabase, survey, "CSAT_SEND_FAILED", txt.slice(0, 500), resp.status ?? null);
          failed++;
          continue;
        }

        // ── 2. Sucesso: status='sent' ──────────────────────────────────────────
        const { error: updErr } = await supabase
          .from("csat_surveys")
          .update({ status: "sent", updated_at: new Date().toISOString() })
          .eq("id", survey.survey_id);

        if (updErr) {
          console.error(`[csat-dispatch] mark-sent error survey=${survey.survey_id}:`, updErr.message);
          // Mensagem enviada mas status não persistiu — conta como enviado
          // (o re-claim poderia duplicar envio; melhor manter 'sending' p/ auditoria)
        }
        sent++;
        console.log(
          `[csat-dispatch] sent — survey=${survey.survey_id} contact=${survey.contact_id} instance=${survey.instance_name}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await markFailed(supabase, survey, "CSAT_SEND_EXCEPTION", msg.slice(0, 500));
        failed++;
      }
    }

    return json(req, { claimed: surveys.length, sent, failed, dryRun: dryRun ?? false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[csat-dispatch] unhandled error:", msg);
    return json(req, { error: "internal_error" }, 500);
  }
});

/** Marca survey como failed + registra failed_messages (padrão nps-scheduler).
 *  attempts já foi incrementado no claim (rpc_claim_csat_due). */
async function markFailed(
  supabase: ReturnType<typeof createZappAdminClient>,
  survey: ClaimedSurvey,
  errorCode: string,
  errorMessage: string,
  httpStatus: number | null = null,
): Promise<void> {
  const { error: updErr } = await supabase
    .from("csat_surveys")
    .update({
      status: "failed",
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", survey.survey_id);

  if (updErr) {
    console.error(`[csat-dispatch] mark-failed error survey=${survey.survey_id}:`, updErr.message);
  }

  const { error: fmErr } = await supabase.from("failed_messages").insert({
    instance_name: survey.instance_name ?? null,
    remote_jid: survey.phone ? `${survey.phone}@s.whatsapp.net` : null,
    payload: {
      __path: "/message/sendText",
      survey_id: survey.survey_id,
      contact_id: survey.contact_id,
      conversation_id: survey.conversation_id ?? null,
      text: survey.message_text ?? null,
    },
    http_status: httpStatus,
    error_message: errorMessage.slice(0, 500),
    error_code: errorCode,
  });

  if (fmErr) {
    console.error(`[csat-dispatch] failed_messages insert error survey=${survey.survey_id}:`, fmErr.message);
  }
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
