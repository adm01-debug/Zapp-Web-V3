/**
 * contract-coverage.test.ts — DEFINIÇÃO EXECUTÁVEL de "cobertura 100%".
 *
 * Para CADA edge function (supabase/functions/<fn>/index.ts):
 *   - Se o fonte LÊ BODY (`req.json()`, `req.text()`, `req.formData()` ou
 *     variantes com `request.`) OU lê QUERY STRING (`.searchParams`), então
 *     DEVE invocar o gate de contrato (`parseOrReject(` ou `parseRequestOrReject(`).
 *   - Exceções documentadas (allowlist): funções que leem body mas NÃO devem
 *     usar o gate por design — cada uma precisa de comentário no fonte e
 *     entrada aqui.
 *
 * Objetivo: impedir que uma futura edge function volte a nascer sem validação
 * (gap de 52 funções corrigido na consolidação 2026-08-04).
 *
 * Etapa 17 (Bloco 1, 2026-08-21, PLANO-100-CONTRATOS-EDGE — fecha E2): o
 * scanner só examinava leitura de BODY — 12 functions que só leem query
 * string (`.searchParams`) ficavam invisíveis pro `total`/`withGate`, mesmo
 * já tendo `parseOrReject`. Multipart já era coberto via `req.formData()`.
 * Residual conhecido, não perseguido aqui: parsing manual de `req.url` como
 * string (sem `.searchParams`) não é detectado — nenhuma function do repo
 * usa esse padrão hoje (confirmado por grep em 2026-08-21).
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/_shared/__tests__/contract-coverage.test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
import { fromFileUrl } from "https://deno.land/std@0.168.0/path/mod.ts";

const FUNCTIONS_ROOT = new URL("../../", import.meta.url);

// ─── Allowlist: funções que leem body SEM gate EFETIVO (justificativa obrigatória) ──
const ALLOWLIST: Record<string, string> = {
  // main/mcp: gate no-op documentado — o proxy NÃO pode consumir o stream do
  // body (quebraria o worker.fetch para a função alvo). O gate roda apenas
  // quando req.body === null (GET/cron/health) e nesse caso {} sempre passa
  // contra EmptyStrict — zero validação efetiva, contado como exceção, não
  // cobertura (validação Claude C3 2026-08-04).
  "main": "proxy — não pode consumir stream; gate só para req sem body (no-op)",
  "mcp": "proxy JSON-RPC — não pode consumir stream; gate só para req sem body (no-op)",
  // download-wa-status-media e transcribe-audio-internal: gate ligado em
  // 2026-08-21 (SEC-2/SEC-3, Bloco 0 do PLANO-100-CONTRATOS-EDGE) — removidas
  // da allowlist.
};

function walkDir(dir: URL): string[] {
  const out: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const p = new URL(entry.name + "/", dir);
    if (entry.isDirectory) {
      out.push(...walkDir(p));
    } else if (entry.name === "index.ts") {
      out.push(fromFileUrl(new URL(entry.name, dir)));
    }
  }
  return out;
}

Deno.test("cobertura: toda função que lê body invoca o gate de contrato (ou está na allowlist)", () => {
  const violations: string[] = [];
  let total = 0;
  let withGate = 0;

  for (const filePath of walkDir(FUNCTIONS_ROOT)) {
    // Só funções de primeiro nível (supabase/functions/<fn>/index.ts)
    const rel = filePath.split(/[\\/]/);
    if (rel.length < 2 || rel[rel.length - 3] !== "functions") continue;
    const fnName = rel[rel.length - 2];
    if (fnName.startsWith("_")) continue; // _shared etc.

    const src = Deno.readTextFileSync(filePath);
    const readsBody = /req\.json\(\)|request\.json\(\)|req\.text\(\)|request\.text\(\)|req\.formData\(\)|request\.formData\(\)|\.searchParams\b/.test(src);
    if (!readsBody) continue;

    total++;
    // Allowlist tem precedência SOBRE hasGate: main/mcp têm parseOrReject no
    // fonte (import + chamada no branch req.body===null) mas são no-op — não
    // podem contar como cobertura efetiva (validação Claude C3, 2ª rodada).
    if (ALLOWLIST[fnName]) continue;
    const hasGate = /parseOrReject\(|parseRequestOrReject\(/.test(src);
    if (hasGate) {
      withGate++;
      continue;
    }
    violations.push(
      `${fnName}/index.ts lê body mas NÃO invoca parseOrReject. ` +
      `Adicione o gate de contrato (parseOrReject com CONTRACT_SCHEMAS['${fnName}']) ` +
      `ou documente na allowlist do contract-coverage.test.ts com justificativa.`
    );
  }

  assertEquals(violations, [], `Funções lendo body sem gate (${violations.length}):\n` + violations.join("\n"));
  assert(total > 0, "nenhuma função com leitura de body encontrada — verificar scanner");
  assert(withGate >= total * 0.9, `cobertura baixa: ${withGate}/${total} com gate`);
});

Deno.test("cobertura: allowlist vazia é consistente (toda exceção tem entrada)", () => {
  // A allowlist deve estar vazia ou com entradas justificadas — nunca crescer sem revisão.
  // Teto reduzido de 4 → 2 em 2026-08-21 (Bloco 0 do PLANO-100-CONTRATOS-EDGE):
  // as 2 entradas temporárias (download-wa-status-media, transcribe-audio-internal)
  // ganharam gate real e saíram da allowlist; só main/mcp restam (no-op documentado).
  assert(Object.keys(ALLOWLIST).length <= 2, "allowlist cresceu demais — revisar antes de aceitar");
});
