import { handleCors, errorResponse, jsonResponse, Logger } from "../_shared/validation.ts";
import { ScheduledReportSchema, parseBody } from "../_shared/schemas.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const denied = requireServiceRoleOrCron(req);
  if (denied) return denied;

  const log = new Logger("send-scheduled-report");

  try {
    const supabase = createZappAdminClient();
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const parsed = parseBody(ScheduledReportSchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { reportId } = parsed.data;

    const { data: report, error: reportError } = await supabase
      .from("scheduled_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (reportError || !report || typeof report !== 'object' || Array.isArray(report)) {
      return errorResponse("Report not found", 404, req);
    }

    const reportObj = report as Record<string, unknown>;
    if (typeof reportObj.id !== 'string' || typeof reportObj.report_type !== 'string') {
      return errorResponse("Invalid report data", 400, req);
    }

    let reportData: Record<string, unknown> = {};
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    switch (reportObj.report_type) {
      case "dashboard_summary": {
        const { data: messages } = await supabase.from("messages").select("id, sender, created_at, is_read").gte("created_at", weekAgo.toISOString());
        const { data: contacts } = await supabase.from("contacts").select("id").gte("created_at", weekAgo.toISOString());
        const msgArray = Array.isArray(messages) ? messages : [];
        const contactArray = Array.isArray(contacts) ? contacts : [];
        const messagesReceived = msgArray.filter((m: unknown) =>
          typeof m === 'object' && m !== null && (m as Record<string, unknown>).sender === "contact"
        ).length;
        const messagesSent = msgArray.filter((m: unknown) =>
          typeof m === 'object' && m !== null && (m as Record<string, unknown>).sender === "agent"
        ).length;
        reportData = {
          title: "Resumo do Dashboard",
          period: `${weekAgo.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`,
          totalMessages: msgArray.length,
          messagesReceived,
          messagesSent,
          newContacts: contactArray.length,
        };
        break;
      }
      case "agent_performance": {
        const { data: agents } = await supabase.from("agent_stats").select("*, profiles(name, email)").order("xp", { ascending: false });
        const agentArray = Array.isArray(agents) ? agents : [];
        reportData = {
          title: "Performance de Agentes",
          period: `${weekAgo.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`,
          agents: agentArray
            .filter((a): a is Record<string, unknown> =>
              typeof a === 'object' && a !== null && !Array.isArray(a)
            )
            .map(a => {
              const profiles = typeof a.profiles === 'object' && a.profiles !== null && !Array.isArray(a.profiles)
                ? (a.profiles as Record<string, unknown>)
                : {};
              const messagesSent = typeof a.messages_sent === 'number' ? a.messages_sent : 0;
              const messagesReceived = typeof a.messages_received === 'number' ? a.messages_received : 0;
              return {
                name: typeof profiles.name === 'string' ? profiles.name : "N/A",
                messagesHandled: messagesSent + messagesReceived,
                resolved: a.conversations_resolved,
                avgResponseTime: a.avg_response_time_seconds,
                satisfaction: a.customer_satisfaction_score,
                level: a.level,
                xp: a.xp,
              };
            }),
        };
        break;
      }
      case "conversation_analytics": {
        const { data: analyses } = await supabase.from("conversation_analyses").select("*").gte("created_at", weekAgo.toISOString());
        const analyseArray = Array.isArray(analyses) ? analyses : [];
        const avgSentiment = analyseArray.length > 0
          ? Math.round(
              analyseArray.reduce((sum: number, a: unknown) => {
                if (typeof a !== 'object' || a === null) return sum;
                const aObj = a as Record<string, unknown>;
                const score = typeof aObj.sentiment_score === 'number' ? aObj.sentiment_score : 50;
                return sum + score;
              }, 0) / analyseArray.length
            )
          : 0;
        const avgSatisfaction = analyseArray.length > 0
          ? (
              analyseArray.reduce((sum: number, a: unknown) => {
                if (typeof a !== 'object' || a === null) return sum;
                const aObj = a as Record<string, unknown>;
                const score = typeof aObj.customer_satisfaction === 'number' ? aObj.customer_satisfaction : 3;
                return sum + score;
              }, 0) / analyseArray.length
            ).toFixed(1)
          : "N/A";
        reportData = {
          title: "Análise de Conversas",
          period: `${weekAgo.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`,
          totalAnalyses: analyseArray.length,
          avgSentiment,
          avgSatisfaction,
        };
        break;
      }
      case "sla_compliance": {
        const { data: sla } = await supabase.from("conversation_sla").select("*").gte("created_at", weekAgo.toISOString());
        const slaArray = Array.isArray(sla) ? sla : [];
        const total = slaArray.length;
        const responseBreached = slaArray.filter((s: unknown) =>
          typeof s === 'object' && s !== null && (s as Record<string, unknown>).first_response_breached === true
        ).length;
        const resolutionBreached = slaArray.filter((s: unknown) =>
          typeof s === 'object' && s !== null && (s as Record<string, unknown>).resolution_breached === true
        ).length;
        reportData = {
          title: "Cumprimento de SLA",
          period: `${weekAgo.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`,
          totalConversations: total,
          responseComplianceRate: total > 0 ? `${Math.round(((total - responseBreached) / total) * 100)}%` : "N/A",
          resolutionComplianceRate: total > 0 ? `${Math.round(((total - resolutionBreached) / total) * 100)}%` : "N/A",
          responseBreaches: responseBreached,
          resolutionBreaches: resolutionBreached,
        };
        break;
      }
    }

    const emailHtml = buildReportEmail(reportData);

    const recipients = Array.isArray(reportObj.recipients) ? reportObj.recipients : [];
    if (resendApiKey && recipients.length > 0) {
      const emailResults = await Promise.allSettled(
        recipients.filter((r): r is string => typeof r === 'string').map(async (recipient: string) => {
          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "reports@noreply.lovable.app", to: recipient,
              subject: `📊 ${reportData.title} - ${reportData.period}`, html: emailHtml,
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!emailResponse.ok) {
            const errText = await emailResponse.text();
            log.error(`Failed to send to ${recipient}`, { error: errText });
            throw new Error(`Resend API error ${emailResponse.status}`);
          }
        })
      );
      const emailFailures = emailResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (emailFailures.length > 0) {
        log.error(`${emailFailures.length} email(s) failed`, {
          errors: emailFailures.map(r => r.reason instanceof Error ? r.reason.message : String(r.reason)),
        });
      }
    }

    const frequency = typeof reportObj.frequency === 'string' ? reportObj.frequency : 'weekly';
    const nextSendAt = calculateNextSend(frequency);
    await supabase.from("scheduled_reports").update({ last_sent_at: now.toISOString(), next_send_at: nextSendAt }).eq("id", reportObj.id);

    log.done(200);
    return jsonResponse({ success: true, reportData }, 200, req);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Error sending report", { error: errorMessage });
    return errorResponse('Internal server error', 500, req);
  }
});

function calculateNextSend(frequency: string): string {
  const next = new Date();
  switch (frequency) {
    case "daily": next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); break;
    case "weekly": next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7)); next.setHours(8, 0, 0, 0); break;
    case "monthly": next.setMonth(next.getMonth() + 1, 1); next.setHours(8, 0, 0, 0); break;
  }
  return next.toISOString();
}

function buildReportEmail(data: Record<string, unknown>): string {
  const rows = Object.entries(data)
    .filter(([key]) => key !== "title" && key !== "period" && key !== "agents")
    .map(([key, value]) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;color:#333;">${formatKey(key)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">${String(value)}</td></tr>`
    ).join("");

  let agentsTable = "";
  const agents = Array.isArray(data.agents) ? data.agents : [];
  if (agents.length > 0) {
    agentsTable = `<h3 style="margin-top:24px;color:#333;">Ranking de Agentes</h3>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;">Agente</th><th style="padding:8px;text-align:center;">Mensagens</th><th style="padding:8px;text-align:center;">Resolvidas</th><th style="padding:8px;text-align:center;">Nível</th></tr>
        ${agents
          .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null && !Array.isArray(a))
          .map(a => {
            const name = typeof a.name === 'string' ? a.name : 'N/A';
            const messagesHandled = typeof a.messagesHandled === 'number' ? a.messagesHandled : 0;
            const resolved = typeof a.resolved === 'number' ? a.resolved : 0;
            const level = typeof a.level === 'string' || typeof a.level === 'number' ? String(a.level) : 'N/A';
            return `<tr><td style="padding:8px;">${name}</td><td style="padding:8px;text-align:center;">${messagesHandled}</td><td style="padding:8px;text-align:center;">${resolved}</td><td style="padding:8px;text-align:center;">${level}</td></tr>`;
          })
          .join("")}
      </table>`;
  }

  const title = typeof data.title === 'string' ? data.title : 'Relatório';
  const period = typeof data.period === 'string' ? data.period : 'Período não especificado';

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:#f9fafb;">
    <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#25D366,#128C7E);padding:24px;color:white;"><h1 style="margin:0;font-size:20px;">📊 ${title}</h1><p style="margin:4px 0 0;opacity:0.9;font-size:14px;">${period}</p></div>
      <div style="padding:24px;"><table style="width:100%;border-collapse:collapse;">${rows}</table>${agentsTable}</div>
      <div style="padding:16px 24px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">Relatório gerado automaticamente • ZAPP Web</div>
    </div></body></html>`;
}

function formatKey(key: string): string {
  const map: Record<string, string> = {
    totalMessages: "Total de Mensagens", messagesReceived: "Mensagens Recebidas", messagesSent: "Mensagens Enviadas",
    newContacts: "Novos Contatos", totalAnalyses: "Análises Realizadas", avgSentiment: "Sentimento Médio",
    avgSatisfaction: "Satisfação Média", totalConversations: "Total de Conversas",
    responseComplianceRate: "Taxa de Resposta no Prazo", resolutionComplianceRate: "Taxa de Resolução no Prazo",
    responseBreaches: "Violações de Resposta", resolutionBreaches: "Violações de Resolução",
  };
  return map[key] || key;
}
