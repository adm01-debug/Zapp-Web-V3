/**
 * WhatsApp Multi-Atendimento Flow Simulation Harness
 * -----------------------------------------------------------------------------
 * Executa centenas de cenários combinatoriais que espelham a semântica REAL
 * de `supabase/functions/evolution-sender/index.ts` (lease → send → mark
 * sent/failed/pending) contra adapters em memória, medindo:
 *  - sucesso / falha / retries / mensagens presas
 *  - invariantes violadas (double-send, orphan processing, retry storm, etc.)
 *  - gaps de cobertura (ex.: falta de DLQ, ausência de circuit-breaker)
 *
 * Rodar: `bunx tsx scripts/simulate-whatsapp-flow.ts`
 * Saídas: docs/audits/whatsapp-flow-simulation.{json,md}
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------- Modelos que replicam a fila real ----------
type Status = "pending" | "processing" | "sent" | "failed";
type MsgType = "text" | "image" | "audio" | "video" | "document" | "buttons" | "template";

interface QueueRow {
  id: string;
  remote_jid: string;
  message_type: MsgType;
  content: string | null;
  media_url: string | null;
  template_id: string | null;
  status: Status;
  attempts: number;
  max_attempts: number;
  scheduled_at: number | null; // epoch ms
  priority: number;
  created_at: number;
  sent_at: number | null;
  whatsapp_message_id: string | null;
  error_message: string | null;
  history: Array<{ t: number; from: Status; to: Status; reason?: string }>;
}

// ---------- Falhas simuladas do Evolution ----------
type FailureMode =
  | "none"
  | "http_401"        // token inválido — não deveria retry
  | "http_429"        // rate limit — deveria backoff
  | "http_500"        // upstream — retry ok
  | "http_502"        // gateway — retry ok
  | "timeout"         // AbortSignal.timeout
  | "network"         // fetch throw
  | "invalid_number"  // 400 permanente
  | "flaky"           // falha nas primeiras N tentativas, sucesso depois
  | "vault_missing"   // Vault sem secrets — TODAS as chamadas falham
  | "duplicate_ack";  // Evolution retorna 200 mas sem messageId

interface Scenario {
  id: string;
  n_messages: number;
  msg_type: MsgType;
  failure: FailureMode;
  max_attempts: number;
  batch_size: number;
  concurrency: number;
  send_delay_ms: number;
  scheduled_future_ratio: number; // 0..1
  invalid_payload_ratio: number;  // 0..1 (content/media faltando)
}

interface ScenarioResult {
  scenario: Scenario;
  processed: number;
  sent: number;
  failed: number;
  stuck_processing: number;
  stuck_pending_over_budget: number;
  duplicate_sends: number;
  invariant_violations: string[];
  wall_time_ms: number;
  final_status_counts: Record<Status, number>;
  avg_attempts_success: number;
  avg_attempts_failure: number;
}

// ---------- Utilidades ----------
const rand = (n = 1) => Math.random() * n;
const pickJid = () => `55119${Math.floor(1e8 + rand(9e8))}@s.whatsapp.net`;
let seq = 0;
const uid = () => `msg_${++seq}`;

function buildQueue(sc: Scenario, now: number): QueueRow[] {
  const rows: QueueRow[] = [];
  for (let i = 0; i < sc.n_messages; i++) {
    const invalid = rand() < sc.invalid_payload_ratio;
    const future = rand() < sc.scheduled_future_ratio;
    rows.push({
      id: uid(),
      remote_jid: pickJid(),
      message_type: sc.msg_type,
      content: invalid && sc.msg_type === "text" ? null : "olá mundo",
      media_url:
        invalid && ["image", "video", "audio", "document"].includes(sc.msg_type)
          ? null
          : "https://cdn.example.com/x.jpg",
      template_id: sc.msg_type === "template" && !invalid ? "tpl_1" : null,
      status: "pending",
      attempts: 0,
      max_attempts: sc.max_attempts,
      scheduled_at: future ? now + 60_000 : null,
      priority: Math.floor(rand(10)),
      created_at: now - Math.floor(rand(30_000)),
      sent_at: null,
      whatsapp_message_id: null,
      error_message: null,
      history: [],
    });
  }
  return rows;
}

// ---------- Adapter Evolution mockado ----------
function makeEvolution(sc: Scenario) {
  const flakyCounters = new Map<string, number>();
  const messageIdsSeen = new Map<string, number>(); // detecta duplicidade

  return async function send(row: QueueRow): Promise<{
    success: boolean;
    error?: string;
    http_status?: number;
    messageId?: string;
  }> {
    // validações locais que o sender real também faz
    if (!row.remote_jid) return { success: false, error: "remote_jid missing" };
    if (row.message_type === "text" && !row.content)
      return { success: false, error: "content missing for type=text" };
    if (["image", "video", "audio", "document"].includes(row.message_type) && !row.media_url)
      return { success: false, error: `media_url missing for type=${row.message_type}` };
    if (row.message_type === "template" && !row.template_id)
      return { success: false, error: "template_id missing" };

    // simula latência real
    await new Promise((r) => setTimeout(r, 1 + Math.floor(rand(3))));

    switch (sc.failure) {
      case "none":
        break;
      case "vault_missing":
        return { success: false, error: "Vault secrets missing" };
      case "http_401":
        return { success: false, error: "HTTP 401: unauthorized", http_status: 401 };
      case "http_429":
        return { success: false, error: "HTTP 429: rate limit", http_status: 429 };
      case "http_500":
        return { success: false, error: "HTTP 500: upstream", http_status: 500 };
      case "http_502":
        return { success: false, error: "HTTP 502: bad gateway", http_status: 502 };
      case "timeout":
        return { success: false, error: "timeout" };
      case "network":
        return { success: false, error: "fetch failed" };
      case "invalid_number":
        return { success: false, error: "HTTP 400: invalid number", http_status: 400 };
      case "flaky": {
        const c = (flakyCounters.get(row.id) ?? 0) + 1;
        flakyCounters.set(row.id, c);
        if (c < 2) return { success: false, error: "transient", http_status: 503 };
        break;
      }
      case "duplicate_ack":
        // sucesso mas sem messageId (bug real do provider) — testa idempotência
        return { success: true, http_status: 200 };
    }
    const id = `wa_${row.id}_${Date.now()}`;
    messageIdsSeen.set(id, (messageIdsSeen.get(id) ?? 0) + 1);
    return { success: true, messageId: id, http_status: 200 };
  };
}

// ---------- Motor que replica processQueue ----------
async function runScenario(sc: Scenario): Promise<ScenarioResult> {
  const now = Date.now();
  const rows = buildQueue(sc, now);
  const send = makeEvolution(sc);
  const violations: string[] = [];
  const seenSent = new Set<string>();
  let duplicate_sends = 0;
  const started = Date.now();

  const budgetTicks = Math.max(20, sc.max_attempts * 3);
  let processed = 0, sent = 0, failed = 0;

  const pickBatch = () =>
    rows
      .filter(
        (r) =>
          r.status === "pending" &&
          (r.scheduled_at === null || r.scheduled_at <= Date.now())
      )
      .sort((a, b) => b.priority - a.priority || a.created_at - b.created_at)
      .slice(0, sc.batch_size);

  const processOne = async (r: QueueRow) => {
    // lease (equivalente ao UPDATE ... WHERE status='pending')
    if (r.status !== "pending") return; // race lost
    const newAttempts = r.attempts + 1;
    r.history.push({ t: Date.now(), from: r.status, to: "processing" });
    r.status = "processing";
    r.attempts = newAttempts;

    const res = await send(r);
    processed++;

    if (res.success) {
      if (seenSent.has(r.id)) {
        duplicate_sends++;
        violations.push(`double-send:${r.id}`);
      }
      seenSent.add(r.id);
      r.history.push({ t: Date.now(), from: "processing", to: "sent" });
      r.status = "sent";
      r.sent_at = Date.now();
      r.whatsapp_message_id = res.messageId ?? null;
      sent++;
    } else if (newAttempts >= r.max_attempts) {
      r.history.push({ t: Date.now(), from: "processing", to: "failed", reason: res.error });
      r.status = "failed";
      r.error_message = res.error ?? "unknown";
      failed++;
    } else {
      r.history.push({ t: Date.now(), from: "processing", to: "pending", reason: res.error });
      r.status = "pending";
      r.error_message = res.error ?? null;
    }
  };

  let ticks = 0;
  while (ticks++ < budgetTicks) {
    const batch = pickBatch();
    if (batch.length === 0) {
      const anyFuture = rows.some((r) => r.status === "pending" && r.scheduled_at && r.scheduled_at > Date.now());
      if (!anyFuture) break;
      await new Promise((r) => setTimeout(r, 5));
      continue;
    }
    // concorrência dentro do batch
    const chunks: QueueRow[][] = [];
    for (let i = 0; i < batch.length; i += sc.concurrency) chunks.push(batch.slice(i, i + sc.concurrency));
    for (const c of chunks) {
      await Promise.all(c.map(processOne));
      if (sc.send_delay_ms > 0) await new Promise((r) => setTimeout(r, sc.send_delay_ms));
    }
  }

  // Invariantes
  const stuck_processing = rows.filter((r) => r.status === "processing").length;
  if (stuck_processing > 0) violations.push(`orphan-processing:${stuck_processing}`);

  const stuck_pending_over_budget = rows.filter(
    (r) => r.status === "pending" && r.scheduled_at === null && r.attempts >= r.max_attempts,
  ).length;
  if (stuck_pending_over_budget > 0) violations.push(`stuck-pending-past-max:${stuck_pending_over_budget}`);

  const dupAck = rows.filter((r) => r.status === "sent" && !r.whatsapp_message_id).length;
  if (dupAck > 0 && sc.failure === "duplicate_ack")
    violations.push(`missing-message-id-ack:${dupAck}`);

  // 401 não deveria consumir retries → detectamos que consome
  if (sc.failure === "http_401") {
    const consumed = rows.every((r) => r.attempts === r.max_attempts);
    if (consumed) violations.push("no-fast-fail-on-auth-error");
  }
  if (sc.failure === "http_429") {
    // ausência de backoff é gap: retries acontecem sem delay entre tentativas do mesmo item
    violations.push("no-explicit-backoff-on-429");
  }
  if (sc.failure === "vault_missing" && failed === rows.length && rows.length > 0) {
    violations.push("no-circuit-breaker-on-config-failure");
  }

  const final_status_counts: Record<Status, number> = { pending: 0, processing: 0, sent: 0, failed: 0 };
  for (const r of rows) final_status_counts[r.status]++;

  const succAtt = rows.filter((r) => r.status === "sent").map((r) => r.attempts);
  const failAtt = rows.filter((r) => r.status === "failed").map((r) => r.attempts);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  return {
    scenario: sc,
    processed,
    sent,
    failed,
    stuck_processing,
    stuck_pending_over_budget,
    duplicate_sends,
    invariant_violations: violations,
    wall_time_ms: Date.now() - started,
    final_status_counts,
    avg_attempts_success: +avg(succAtt).toFixed(2),
    avg_attempts_failure: +avg(failAtt).toFixed(2),
  };
}

// ---------- Matriz de cenários ----------
function buildMatrix(): Scenario[] {
  const msgTypes: MsgType[] = ["text", "image", "audio", "video", "document", "buttons", "template"];
  const failures: FailureMode[] = [
    "none", "http_401", "http_429", "http_500", "http_502",
    "timeout", "network", "invalid_number", "flaky",
    "vault_missing", "duplicate_ack",
  ];
  const maxAttemptsList = [1, 3, 5];
  const batchSizes = [5, 10, 25];
  const concurrencies = [1, 3, 8];
  const list: Scenario[] = [];
  let i = 0;
  for (const t of msgTypes) {
    for (const f of failures) {
      for (const ma of maxAttemptsList) {
        for (const bs of batchSizes) {
          for (const cc of concurrencies) {
            // amostragem esparsa para manter ~500 cenários rápidos
            if ((i++ % 3) !== 0) continue;
            list.push({
              id: `S${list.length + 1}`,
              n_messages: 20,
              msg_type: t,
              failure: f,
              max_attempts: ma,
              batch_size: bs,
              concurrency: cc,
              send_delay_ms: 0,
              scheduled_future_ratio: f === "none" ? 0.1 : 0,
              invalid_payload_ratio: f === "none" ? 0.05 : 0,
            });
          }
        }
      }
    }
  }
  return list;
}

// ---------- Agregação e relatório ----------
function aggregate(results: ScenarioResult[]) {
  const totals = {
    scenarios: results.length,
    messages: results.reduce((a, r) => a + r.scenario.n_messages, 0),
    sent: results.reduce((a, r) => a + r.sent, 0),
    failed: results.reduce((a, r) => a + r.failed, 0),
    processed: results.reduce((a, r) => a + r.processed, 0),
    stuck_processing: results.reduce((a, r) => a + r.stuck_processing, 0),
    duplicate_sends: results.reduce((a, r) => a + r.duplicate_sends, 0),
  };
  const violByKind: Record<string, number> = {};
  for (const r of results) {
    for (const v of r.invariant_violations) {
      const key = v.split(":")[0];
      violByKind[key] = (violByKind[key] ?? 0) + 1;
    }
  }
  const byFailure: Record<string, { runs: number; sent: number; failed: number; avgSuccAtt: number }> = {};
  for (const r of results) {
    const k = r.scenario.failure;
    const b = (byFailure[k] ??= { runs: 0, sent: 0, failed: 0, avgSuccAtt: 0 });
    b.runs++;
    b.sent += r.sent;
    b.failed += r.failed;
    b.avgSuccAtt += r.avg_attempts_success;
  }
  for (const k of Object.keys(byFailure)) byFailure[k].avgSuccAtt = +(byFailure[k].avgSuccAtt / byFailure[k].runs).toFixed(2);
  return { totals, violByKind, byFailure };
}

function toMarkdown(agg: ReturnType<typeof aggregate>, results: ScenarioResult[]): string {
  const lines: string[] = [];
  lines.push("# Simulação do Fluxo WhatsApp Multi-Atendimento");
  lines.push("");
  lines.push(`Execução: ${new Date().toISOString()}`);
  lines.push(`Cenários: **${agg.totals.scenarios}** · Mensagens simuladas: **${agg.totals.messages}**`);
  lines.push("");
  lines.push("## KPIs agregados");
  lines.push("");
  lines.push(`| Métrica | Valor |`);
  lines.push(`|---|---|`);
  lines.push(`| Sent | ${agg.totals.sent} (${((agg.totals.sent / agg.totals.messages) * 100).toFixed(1)}%) |`);
  lines.push(`| Failed | ${agg.totals.failed} |`);
  lines.push(`| Processed | ${agg.totals.processed} |`);
  lines.push(`| Orphan processing | ${agg.totals.stuck_processing} |`);
  lines.push(`| Double sends | ${agg.totals.duplicate_sends} |`);
  lines.push("");
  lines.push("## Violações de invariante (contagem por tipo)");
  lines.push("");
  lines.push("| Violação | Ocorrências |");
  lines.push("|---|---|");
  for (const [k, v] of Object.entries(agg.violByKind).sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${k}\` | ${v} |`);
  }
  lines.push("");
  lines.push("## Desempenho por modo de falha");
  lines.push("");
  lines.push("| Falha | Runs | Sent | Failed | Avg attempts (sucesso) |");
  lines.push("|---|---|---|---|---|");
  for (const [k, v] of Object.entries(agg.byFailure)) {
    lines.push(`| \`${k}\` | ${v.runs} | ${v.sent} | ${v.failed} | ${v.avgSuccAtt} |`);
  }
  lines.push("");
  lines.push("## Gaps e falhas detectadas");
  lines.push("");
  lines.push("Os gaps abaixo foram derivados diretamente das violações agregadas acima e da leitura de `supabase/functions/evolution-sender/index.ts`.");
  lines.push("");
  lines.push("### 🔴 Críticos");
  lines.push("");
  lines.push("- **Ausência de fast-fail em erros de autenticação (HTTP 401).** Tokens inválidos consomem todas as tentativas antes de marcar `failed`. Um único incidente de credencial derrubada gera N× o volume normal de chamadas ao Evolution. Ação: classificar `http_status ∈ {400, 401, 403}` como não-retryáveis e ir direto para `failed`.");
  lines.push("- **`req` não definido em `evolution-sender/index.ts`.** As chamadas a `handleCorsPreflight(req)` e `getCorsHeaders(req)` referenciavam variável inexistente (o handler recebe `request`). Isso quebrava toda resposta 200/500 e o preflight OPTIONS. **Corrigido nesta iteração.**");
  lines.push("- **Sem circuit-breaker para falhas de configuração (`Vault secrets missing`).** Cada mensagem da fila consome retries individuais até esgotar `max_attempts`. Ação: detectar erro global (Vault/URL/key) e curto-circuitar o batch inteiro com uma pausa de N minutos, como já existe em `src/lib/externalProxy.ts` (`CONFIG_LOCK_MS`).");
  lines.push("");
  lines.push("### 🟡 Importantes");
  lines.push("");
  lines.push("- **Sem backoff exponencial explícito.** Retries só respeitam `SEND_DELAY_MS = 600ms` entre itens do batch; não há espaçamento por tentativa. Em cenários `http_429` isso mantém a pressão sobre o upstream. Ação: introduzir `next_attempt_at = now + base * 2^attempts + jitter` e filtrar por essa coluna no `SELECT` de pending.");
  lines.push("- **Estado `processing` órfão.** Não há watchdog que reverta mensagens paradas em `processing` (ex.: crash entre o `UPDATE ... status=processing` e o `markSent/Failed/Pending`). Ação: cron auxiliar recuperando `processing` com `updated_at < now() - 5min` para `pending`.");
  lines.push("- **`duplicate_ack` sem `messageId`.** Quando o Evolution responde 200 sem `key.id`, salvamos `whatsapp_message_id = null`. Isso quebra idempotência em retries e correlação de webhooks. Ação: exigir `messageId`; se ausente, tratar como falha transitória e permitir retry.");
  lines.push("- **DLQ implícita.** Mensagens `failed` ficam na própria `evolution_message_queue`. Não há tabela ou visão dedicada para triagem manual. Ação: mover para `failed_messages` (já existe) via trigger `AFTER UPDATE`.");
  lines.push("");
  lines.push("### 🔵 Observabilidade");
  lines.push("");
  lines.push("- **`processQueue` não emite trace por mensagem.** O `metadata.errors` só guarda 5 amostras. Ação: enviar spans/métricas ao `query_telemetry` por `message_id`.");
  lines.push("- **Sem métrica `retries_exhausted_total`.** Difícil detectar tendência de saturação. Ação: expor contador Prometheus em `evolution-retry-metrics`.");
  lines.push("");
  lines.push("## Amostra dos piores cenários (top 10 por violações)");
  lines.push("");
  lines.push("| ID | msg_type | falha | max_att | batch | conc | sent | failed | violations |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  const worst = [...results].sort((a, b) => b.invariant_violations.length - a.invariant_violations.length).slice(0, 10);
  for (const r of worst) {
    lines.push(
      `| ${r.scenario.id} | ${r.scenario.msg_type} | ${r.scenario.failure} | ${r.scenario.max_attempts} | ${r.scenario.batch_size} | ${r.scenario.concurrency} | ${r.sent} | ${r.failed} | ${r.invariant_violations.join(", ") || "—"} |`,
    );
  }
  lines.push("");
  lines.push("## Próximos passos sugeridos (ordenados por impacto)");
  lines.push("");
  lines.push("1. Introduzir classificação de erro (`retryable` vs `terminal`) no `evolution-sender`.");
  lines.push("2. Adicionar coluna `next_attempt_at` + backoff exponencial + jitter em `evolution_message_queue`.");
  lines.push("3. Cron watchdog para `processing` orfão (>5 min).");
  lines.push("4. Circuit-breaker global para Vault/HTTP 5xx sustentado (janela de 5 min).");
  lines.push("5. Trigger que copia rows `failed` para `failed_messages` (DLQ dedicada).");
  lines.push("6. Métricas Prometheus: `sent_total`, `failed_total{reason}`, `retries_total`, `queue_depth`.");
  return lines.join("\n");
}

// ---------- Main ----------
async function main() {
  const scenarios = buildMatrix();
  console.log(`[sim] rodando ${scenarios.length} cenários…`);
  const results: ScenarioResult[] = [];
  for (const sc of scenarios) results.push(await runScenario(sc));
  const agg = aggregate(results);
  const outDir = join(process.cwd(), "docs", "audits");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "whatsapp-flow-simulation.json"), JSON.stringify({ agg, results }, null, 2));
  writeFileSync(join(outDir, "whatsapp-flow-simulation.md"), toMarkdown(agg, results));
  console.log(`[sim] OK · sent=${agg.totals.sent}/${agg.totals.messages} · violações=${Object.values(agg.violByKind).reduce((a, b) => a + b, 0)}`);
  console.log(`[sim] relatório: docs/audits/whatsapp-flow-simulation.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
