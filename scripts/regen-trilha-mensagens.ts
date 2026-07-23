#!/usr/bin/env bun
/**
 * regen-trilha-mensagens.ts
 *
 * Mantém src/test/fixtures/TRILHA_MENSAGENS_NAVEGAVEL.mmd em sincronia com o
 * que os hooks REALMENTE assinam em postgres_changes para a tabela 'messages'.
 *
 * Estratégia:
 *   1. ALLOWLIST (abaixo) — mapa estável id -> {label, path, role}.
 *      Define quem legitimamente pode assinar 'messages' no diagrama.
 *   2. SCAN — varre src/ procurando .on('postgres_changes', { table: 'messages' }, ...)
 *      e extrai (arquivo, evento). Ignora *.test.ts(x) e a página de debug.
 *   3. RECONCILIA — compara código vs allowlist e reporta drift:
 *        - missingInAllowlist : aparece no código, não está no diagrama
 *        - missingInCode      : marcado no diagrama, não há subscription real
 *   4. REWRITE — reescreve duas seções DELIMITADAS por marcadores no .mmd:
 *        <!-- AUTO:CLICKS:START --> ... <!-- AUTO:CLICKS:END -->
 *        <!-- AUTO:LEGEND:START --> ... <!-- AUTO:LEGEND:END -->
 *      O resto do diagrama (subgraphs, edges, narrativa) fica sob controle humano.
 *   5. --check : exit 1 se houver drift ou se o arquivo estiver fora de sync.
 *
 * Uso:
 *   bun run scripts/regen-trilha-mensagens.ts
 *   bun run scripts/regen-trilha-mensagens.ts --check
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SRC_DIR = join(ROOT, "src");
const FIXTURE = join(ROOT, "src/test/fixtures/TRILHA_MENSAGENS_NAVEGAVEL.mmd");
const TARGET_TABLE = "messages";

// ----------------------------------------------------------------------------
// 1) ALLOWLIST — quem legitimamente assina 'messages'.
// ----------------------------------------------------------------------------
interface ConsumerDef {
  id: string;             // id no Mermaid
  label: string;          // rótulo curto p/ legenda
  path: string;           // caminho real do arquivo
  description: string;    // o que ele faz com o evento
}

// NOTA (2026-07-16): Todos os consumidores migraram de postgres_changes { schema:'zapp', table:'messages' }
// para { schema:'evo', table:'evolution_messages' } (tabela-fonte real, com Realtime habilitado).
// A view zapp.messages NÃO emite CDC — subscriptions nela são silenciosas.
// A função messagesRepository.subscribeToMessages foi removida por ser dead code com subscription inválida.
// Se um novo consumidor assinar evolution_messages via postgres_changes e for relevante para este diagrama,
// adicione-o aqui com o caminho correto.
const CONSUMERS: ConsumerDef[] = [];

// Outros nós (não consumem 'messages' mas têm click links)
const EXTRA_CLICKS: { id: string; path: string }[] = [
  { id: "CIL",    path: "src/features/inbox/components/chat/useChatInputLogic.ts" },
  { id: "MS",     path: "src/features/inbox/hooks/realtime/messageSender.ts" },
  { id: "IDK",    path: "src/lib/sendIdempotency.ts" },
  { id: "FP",     path: "src/lib/sendIdempotency.ts" },
  { id: "NORM",   path: "src/lib/sendIdempotency.ts" },
  { id: "BUCKET", path: "src/lib/sendIdempotency.ts" },
  { id: "HASH",   path: "src/lib/sendIdempotency.ts" },
  { id: "KEYFP",  path: "src/lib/sendIdempotency.ts" },
  { id: "KEYROW", path: "src/lib/sendIdempotency.ts" },
  { id: "ESR",    path: "src/lib/evolutionSendRetry.ts" },
  { id: "RETRY",  path: "src/lib/retry.ts" },
  { id: "RCFG",   path: "src/lib/retryConfig.ts" },
  { id: "DLQENQ", path: "src/lib/failedMessagesEnqueue.ts" },
  { id: "DLQRP",  path: "supabase/functions/reprocess-failed-messages/index.ts" },
  { id: "EMIT",   path: "src/features/inbox/hooks/realtime/sendStatusBus.ts" },
  { id: "SUBALL", path: "src/features/inbox/hooks/realtime/sendStatusBus.ts" },
  { id: "GETST",  path: "src/features/inbox/hooks/realtime/sendStatusBus.ts" },
  { id: "UMSS",   path: "src/features/inbox/hooks/realtime/useMessageSendStatus.ts" },
  { id: "BATCH",  path: "src/features/inbox/hooks/realtime/useMessageUpdateBatcher.ts" },
  { id: "RUTL",   path: "src/features/inbox/hooks/realtime/realtimeUtils.ts" },
  { id: "URN",    path: "src/features/inbox/hooks/realtime/useRealtimeNotifications.ts" },
  { id: "MSI",    path: "src/features/inbox/components/chat/MessageStatusInline.tsx" },
  { id: "VML",    path: "src/features/inbox/components/VirtualizedMessageList.tsx" },
  { id: "MB",     path: "src/features/inbox/components/chat/MessageBubble.tsx" },
];

// ----------------------------------------------------------------------------
// 2) SCAN do código
// ----------------------------------------------------------------------------
interface Hit { file: string; events: string[] }

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

// captura blocos .on('postgres_changes', { ... }, ...)
const SUB_RE = /\.on\(\s*['"]postgres_changes['"]\s*,\s*(\{[^]{0,500}?\})/g;

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const f of walk(SRC_DIR)) {
    if (/\.(test|spec)\.tsx?$/.test(f)) continue;
    if (f.endsWith("RealtimeFanoutDebug.tsx")) continue;
    if (f.endsWith("devRealtimeLogger.ts")) continue;
    const src = readFileSync(f, "utf8");
    const evs: string[] = [];
    let m: RegExpExecArray | null;
    SUB_RE.lastIndex = 0;
    while ((m = SUB_RE.exec(src)) !== null) {
      const binding = m[1];
      if (!new RegExp(`table:\\s*(['"\`]${TARGET_TABLE}['"\`]|dbTable\\(['"\`]${TARGET_TABLE}['"\`]\\))`).test(binding)) continue;
      const evMatch = binding.match(/event:\s*['"]([^'"]+)['"]/);
      evs.push(evMatch ? evMatch[1] : "*");
    }
    if (evs.length) hits.push({ file: relative(ROOT, f), events: evs });
  }
  return hits;
}

// ----------------------------------------------------------------------------
// 3) RECONCILIAÇÃO
// ----------------------------------------------------------------------------
interface Drift {
  missingInAllowlist: Hit[];
  missingInCode: ConsumerDef[];
  brokenPaths: { id: string; path: string }[];
}

function reconcile(hits: Hit[]): Drift {
  const allowedPaths = new Set(CONSUMERS.map(c => c.path));
  const missingInAllowlist = hits.filter(h => !allowedPaths.has(h.file));
  const hitPaths = new Set(hits.map(h => h.file));
  const missingInCode = CONSUMERS.filter(c => !hitPaths.has(c.path));
  const brokenPaths = [...CONSUMERS, ...EXTRA_CLICKS]
    .filter(n => !existsSync(join(ROOT, n.path)))
    .map(n => ({ id: n.id, path: n.path }));
  return { missingInAllowlist, missingInCode, brokenPaths };
}

// ----------------------------------------------------------------------------
// 4) REWRITE das seções delimitadas
// ----------------------------------------------------------------------------
const CLICKS_START = "  %% AUTO:CLICKS:START — gerado por scripts/regen-trilha-mensagens.ts";
const CLICKS_END   = "  %% AUTO:CLICKS:END";
const LEGEND_START = "%% AUTO:LEGEND:START — gerado por scripts/regen-trilha-mensagens.ts";
const LEGEND_END   = "%% AUTO:LEGEND:END";

function buildClicksBlock(): string {
  const all = [...EXTRA_CLICKS, ...CONSUMERS.map(c => ({ id: c.id, path: c.path }))]
    .sort((a, b) => a.id.localeCompare(b.id));
  return [
    CLICKS_START,
    ...all.map(n => `  click ${n.id} "${n.path}"`),
    CLICKS_END,
  ].join("\n");
}

function buildLegendBlock(stamp: string): string {
  const lines: string[] = [
    LEGEND_START,
    "%% Legenda das arestas:",
    "%%   -->   chamada sincrona / import",
    "%%   ==>   escrita persistente em DB",
    "%%   -.->  evento realtime / pub-sub in-memory",
    "%%   -..-> enqueue assincrona (DLQ)",
    `%% Fan-out realtime (postgres_changes '${TARGET_TABLE}'): ${CONSUMERS.length} consumidores diretos`,
  ];
  CONSUMERS.forEach((c, i) => {
    lines.push(`%%   ${i + 1}. ${c.label.padEnd(32)} — ${c.description}`);
  });
  lines.push(`%% Gerado por scripts/regen-trilha-mensagens.ts em ${stamp}`);
  lines.push(LEGEND_END);
  return lines.join("\n");
}

function ensureMarkers(content: string): string {
  let next = content;

  // CLICKS: localiza o bloco existente de "click X ..." e envolve em marcadores
  if (!next.includes(CLICKS_START)) {
    const clickLineRe = /( {2}%% Links navegaveis[^\n]*\n)((?: {2}click [^\n]+\n)+)/;
    const m = next.match(clickLineRe);
    if (m) {
      next = next.replace(m[0], `${CLICKS_START}\n${CLICKS_END}\n`);
    } else {
      // fallback: append antes da legenda
      next += `\n${CLICKS_START}\n${CLICKS_END}\n`;
    }
  }

  // LEGEND: envolve o bloco de "%% Legenda das arestas..." até a última linha "%%"
  if (!next.includes(LEGEND_START)) {
    const legendRe = /%% Legenda das arestas:[^]*?(?=\n(?!%%)| \n*$)/;
    const m = next.match(legendRe);
    if (m) {
      next = next.replace(m[0], `${LEGEND_START}\n${LEGEND_END}`);
    } else {
      next += `\n${LEGEND_START}\n${LEGEND_END}\n`;
    }
  }

  return next;
}

function rewriteSections(content: string, stamp: string): string {
  let next = ensureMarkers(content);

  next = next.replace(
    new RegExp(`${escapeRe(CLICKS_START)}[\\s\\S]*?${escapeRe(CLICKS_END)}`),
    buildClicksBlock(),
  );
  next = next.replace(
    new RegExp(`${escapeRe(LEGEND_START)}[\\s\\S]*?${escapeRe(LEGEND_END)}`),
    buildLegendBlock(stamp),
  );

  // Garante newline final
  if (!next.endsWith("\n")) next += "\n";
  return next;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------
function main() {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has("--check");

  if (!existsSync(FIXTURE)) {
    console.error(`[fatal] Fixture nao encontrada: ${FIXTURE}`);
    process.exit(1);
  }

  const hits = scan();
  const drift = reconcile(hits);

  let driftFound = false;
  if (drift.missingInAllowlist.length) {
    driftFound = true;
    console.error("\n[drift] Subscriptions de 'messages' no codigo MAS fora da ALLOWLIST:");
    for (const h of drift.missingInAllowlist) {
      console.error(`  - ${h.file}  [${h.events.join(", ")}]`);
    }
  }
  if (drift.missingInCode.length) {
    driftFound = true;
    console.error("\n[drift] Consumidores na ALLOWLIST sem subscription detectada:");
    for (const c of drift.missingInCode) {
      console.error(`  - ${c.id} (${c.path})`);
    }
  }
  if (drift.brokenPaths.length) {
    driftFound = true;
    console.error("\n[drift] Paths referenciados que NAO existem no repo:");
    for (const b of drift.brokenPaths) {
      console.error(`  - ${b.id} -> ${b.path}`);
    }
  }

  const current = readFileSync(FIXTURE, "utf8");
  const stamp = new Date().toISOString();
  const next = rewriteSections(current, stamp);

  // Para --check, normaliza o timestamp antes de comparar
  const stripStamp = (s: string) => s.replace(/em \d{4}-\d{2}-\d{2}T[^\n]+/g, "em <stamp>");

  if (checkOnly) {
    if (stripStamp(current) !== stripStamp(next)) {
      console.error("\n[check] .mmd fora de sincronia. Rode sem --check para regenerar.");
      process.exit(1);
    }
    if (driftFound) {
      console.error("\n[check] Drift entre allowlist e codigo. Atualize CONSUMERS e re-rode.");
      process.exit(1);
    }
    console.log(`OK — ${CONSUMERS.length} consumidores conferidos, diagrama em sincronia.`);
    return;
  }

  if (stripStamp(current) === stripStamp(next)) {
    console.log("Nenhuma mudanca necessaria — diagrama ja em sincronia.");
  } else {
    writeFileSync(FIXTURE, next, "utf8");
    console.log(`Atualizado: ${relative(ROOT, FIXTURE)}`);
  }

  console.log(`Hits no scan: ${hits.length} | consumidores allowlist: ${CONSUMERS.length}`);
  if (driftFound) {
    console.error("\nAtencao: regenerado, mas ha drift acima. Resolva antes de commitar.");
    process.exit(2);
  }
}

main();
