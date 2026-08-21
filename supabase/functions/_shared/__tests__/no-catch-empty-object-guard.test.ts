/**
 * Guard: antipadrão `req.json().catch(() => ({}))` — etapa 70 do Bloco 6
 * (PLANO-100-CONTRATOS-EDGE-20260821.md).
 *
 * Fundo (D1 / etapa 27 do Bloco 2): `req.json().catch(() => ({}))` faz
 * JSON malformado virar `{}` silenciosamente — se o schema do contrato for
 * permissivo o bastante (campos nullish/opcionais), esse `{}` passa como
 * payload VÁLIDO em vez de disparar 422 `invalid_json`. O fix correto é
 * `.catch(() => null)`, que faz `parseOrReject` tratar corretamente como
 * corpo ausente/malformado.
 *
 * ACHADO (auditoria desta sessão, 2026-08-21): o Bloco 2 (etapa 27) dizia
 * ter corrigido "23 functions", mas o antipadrão ainda está presente em
 * 35 — o allowlist abaixo é essa dívida REAL e ATUAL, contada e visível
 * (não escondida). Este guard não deixa a lista CRESCER: qualquer function
 * NOVA com o antipadrão quebra o teste. Reduzir o allowlist (consertar uma
 * function de cada vez, trocando por `.catch(() => null)` e confirmando que
 * o body `null` ainda é tratado corretamente pelo restante do handler) é
 * trabalho de acompanhamento — etapa 27/D1 do Bloco 2, fora do escopo deste
 * guard de regressão.
 */
import { assertEquals } from "jsr:@std/assert";
import { fromFileUrl } from "https://deno.land/std@0.168.0/path/mod.ts";

const ANTIPATTERN = /req\.json\(\)\.catch\(\(\) => \(\{\}\)\)/;

// Dívida conhecida em 2026-08-21 — NÃO adicionar itens novos aqui. Se um
// arquivo daqui for corrigido (trocado por `.catch(() => null)`), remova a
// entrada; a lista só deve encolher.
const KNOWN_DEBT = new Set([
  "auto-close-conversations/index.ts",
  "batch-fetch-avatars/index.ts",
  "cleanup-rate-limit-logs/index.ts",
  "cleanup-storage-orphans/index.ts",
  "connection-health-check/index.ts",
  "connection-test/index.ts",
  "csat-dispatch/index.ts",
  "db-health-monitor/index.ts",
  "elevenlabs-scribe-token/index.ts",
  "evolution-group-sync/index.ts",
  "evolution-notification-dispatcher/index.ts",
  "evolution-retry-metrics/index.ts",
  "evolution-sync/index.ts",
  "get-mapbox-token/index.ts",
  "get-sip-password/index.ts",
  "gmail-webhook/index.ts",
  "health-check/index.ts",
  "health/index.ts",
  "lgpd-scheduled-jobs/index.ts",
  "main/index.ts",
  "mcp-server/index.ts",
  "mcp/index.ts",
  "metrics/index.ts",
  "migrate-media-storage/index.ts",
  "nps-scheduler/index.ts",
  "provider-healthcheck/index.ts",
  "recover-corrupted-audios/index.ts",
  "reprocess-failed-messages/index.ts",
  "status/index.ts",
  "talkx-scheduler/index.ts",
  "webhook-secret-status/index.ts",
  "whatsapp-cloud-secrets-status/index.ts",
  "whatsapp-cloud-webhook-verify/index.ts",
  "zapp-get-sip-credentials/index.ts",
  "zapp-notifications-dispatch/index.ts",
]);

const FUNCTIONS_ROOT = new URL("../../", import.meta.url);

function walkIndexFiles(dir: URL): string[] {
  const out: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "_shared") continue;
    const p = new URL(entry.name + "/", dir);
    if (entry.isDirectory) {
      out.push(...walkIndexFiles(p));
    } else if (entry.name === "index.ts") {
      out.push(fromFileUrl(new URL(entry.name, dir)));
    }
  }
  return out;
}

Deno.test("Guard: nenhuma function NOVA introduz req.json().catch(() => ({}))", () => {
  const found = new Set<string>();
  for (const filePath of walkIndexFiles(FUNCTIONS_ROOT)) {
    const src = Deno.readTextFileSync(filePath);
    if (ANTIPATTERN.test(src)) {
      const relKey = filePath.split(/[\\/]/).slice(-2).join("/");
      found.add(relKey);
    }
  }

  const unexpected = [...found].filter((f) => !KNOWN_DEBT.has(f)).sort();
  assertEquals(
    unexpected,
    [],
    `Antipadrão req.json().catch(() => ({})) encontrado em function(s) NÃO listada(s) no ` +
    `allowlist de dívida conhecida: ${unexpected.join(", ")}. Troque por .catch(() => null) ` +
    `(confirma que o body null é tratado corretamente) OU, se for um caso legítimo novo, ` +
    `adicione ao KNOWN_DEBT deste teste com justificativa.`,
  );

  const fixed = [...KNOWN_DEBT].filter((f) => !found.has(f)).sort();
  if (fixed.length > 0) {
    throw new Error(
      `KNOWN_DEBT está desatualizado — ${fixed.length} function(s) já não têm mais o ` +
      `antipadrão mas ainda estão na lista (remova pra refletir o progresso real): ${fixed.join(", ")}`,
    );
  }
});
