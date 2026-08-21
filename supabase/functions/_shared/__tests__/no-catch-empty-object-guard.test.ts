/**
 * Guard: antipadrão `req.json().catch(() => ({}))` — etapa 70 do Bloco 6
 * (PLANO-100-CONTRATOS-EDGE-20260821.md).
 *
 * Fundo (D1 / etapa 27 do Bloco 2): `req.json().catch(() => ({}))` faz
 * JSON malformado virar `{}` silenciosamente — se o schema do contrato for
 * permissivo o bastante (campos nullish/opcionais), esse `{}` passa como
 * payload VÁLIDO em vez de disparar 422 `invalid_json`.
 *
 * HISTÓRICO: em 2026-08-21, o Bloco 2 (etapa 27) dizia ter corrigido "23
 * functions", mas o antipadrão ainda estava presente em 35 no momento em
 * que este guard foi criado (allowlist `KNOWN_DEBT` documentava essa
 * dívida real, contada e visível). As 35 foram corrigidas no mesmo dia,
 * usando `readJsonBodyOrEmpty()` (`_shared/validation.ts`) em vez de um
 * simples `.catch(() => null)` — a troca ingênua quebraria os cron/
 * health-check legítimos que documentam "sem body → {} aceito", porque
 * `req.json()` sozinho NÃO distingue corpo genuinamente vazio de corpo
 * malformado (ambos lançam SyntaxError), e `parseOrReject` rejeita `null`
 * incondicionalmente mesmo quando o schema aceitaria `{}`.
 * `readJsonBodyOrEmpty()` faz essa distinção: corpo vazio → `{}` (aceito
 * pelos contratos permissivos); corpo NÃO-vazio mas malformado → `null`
 * (dispara `invalid_json` de verdade).
 *
 * `KNOWN_DEBT` fica vazio agora — o guard segue rodando pra travar
 * REGRESSÃO (function nova com o antipadrão quebra o teste).
 */
import { assertEquals } from "jsr:@std/assert";
import { fromFileUrl } from "https://deno.land/std@0.168.0/path/mod.ts";

const ANTIPATTERN = /req\.json\(\)\.catch\(\(\) => \(\{\}\)\)/;

// Vazio — as 35 functions que tinham o antipadrão em 2026-08-21 foram
// corrigidas (ver histórico acima). NÃO adicionar itens aqui sem
// justificativa: uma function nova com esse padrão deve ser corrigida com
// readJsonBodyOrEmpty(), não "permitida" de volta pra esta lista.
const KNOWN_DEBT = new Set<string>([]);

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

Deno.test("Guard: nenhuma function introduz req.json().catch(() => ({}))", () => {
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
    `Antipadrão req.json().catch(() => ({})) encontrado em function(s): ${unexpected.join(", ")}. ` +
    `Troque por readJsonBodyOrEmpty(req) (_shared/validation.ts) — NÃO por .catch(() => null), ` +
    `que quebraria cron/health-check legítimos sem body (parseOrReject rejeita null ` +
    `incondicionalmente, mesmo quando o schema aceitaria {}).`,
  );

  const fixed = [...KNOWN_DEBT].filter((f) => !found.has(f)).sort();
  if (fixed.length > 0) {
    throw new Error(
      `KNOWN_DEBT está desatualizado — ${fixed.length} function(s) já não têm mais o ` +
      `antipadrão mas ainda estão na lista (remova pra refletir o progresso real): ${fixed.join(", ")}`,
    );
  }
});
