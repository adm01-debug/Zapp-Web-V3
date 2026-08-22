/**
 * Testes da política de pós-sunset (Bloco 5, etapa 55/61/62).
 *
 * Contexto: antes desta etapa, `isDeprecatedVersion` retornava `false` tanto
 * para "sem sunset" quanto para "sunset já expirou" — sem distinguir os dois
 * casos, uma versão continuava aceita silenciosamente para sempre depois do
 * sunset passar. Esta suíte cobre a transição implementada:
 *
 *  1. `isSunsetExpired` distingue os 3 estados possíveis de uma versão com
 *     `sunset` configurado: futuro (deprecated, ainda aceita), passado
 *     (expirado) e ausente (nunca expira).
 *  2. `parseOrReject` rejeita com 410 Gone (`contract_version_sunset`) quando
 *     o CHAMADOR PEDE EXPLICITAMENTE (header/body) uma versão cujo sunset já
 *     passou.
 *  3. `parseOrReject` NÃO aplica esse bloqueio na auto-detecção (payload sem
 *     versão explícita, reconhecido só pelo formato) — decisão deliberada
 *     documentada em contract-kit.ts: bloquear aí reproduziria em definitivo
 *     o incidente 2026-07-03 (422/410 indevido em payload real de webhook
 *     externo = perda de dados), já que Meta/Sicoob/evolution-stack nunca
 *     setam `x-contract-version`.
 *  4. Canário sobre o registro REAL: todas as datas de sunset em produção
 *     (CONTRACTS) ainda estão no futuro — se este teste falhar um dia, é
 *     sinal de que um sunset real passou e precisa de decisão humana (não
 *     é um bug a corrigir silenciosamente).
 *
 * Padrão de teste (não usado em outros arquivos deste diretório até agora):
 * como CONTRACTS não expõe um parâmetro de data injetável, os testes que
 * exercitam o estado "expirado" fazem monkey-patch temporário de UMA entrada
 * sintética (`__sunset_selftest__`) no objeto CONTRACTS compartilhado, sempre
 * dentro de try/finally síncrono (Deno roda os testes de um arquivo em série
 * por padrão — sem `t.step` concorrente aqui), restaurando o estado anterior
 * antes do teste terminar. Não requer registrar nada em CONTRACT_SCHEMAS
 * porque os schemas de `parseOrReject` são passados por parâmetro, não
 * resolvidos a partir do registro global.
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/contract-sunset-policy.test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
import { z } from "https://esm.sh/zod@3.23.8";
import { parseOrReject } from "../contract-kit.ts";
import { CONTRACTS, isDeprecatedVersion, isSunsetExpired } from "../contract-versions.ts";

const SYNTH = "__sunset_selftest__";
const SCHEMAS = {
  v1: z.object({ legacy_field: z.string() }),
  v2: z.object({ legacy_field: z.string(), version: z.string() }),
};

function withSyntheticContract(sunset: string | undefined, fn: () => void): void {
  const before = CONTRACTS[SYNTH];
  CONTRACTS[SYNTH] = {
    current: "v2",
    supported: ["v1", "v2"],
    ...(sunset ? { sunset: { v1: sunset } } : {}),
  };
  try {
    fn();
  } finally {
    if (before === undefined) delete CONTRACTS[SYNTH];
    else CONTRACTS[SYNTH] = before;
  }
}

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://edge.local/fn", { method: "POST", headers });
}

// ─── isSunsetExpired: os 3 estados ──────────────────────────────────────────

Deno.test("Sunset: isSunsetExpired = false quando não há sunset configurado", () => {
  withSyntheticContract(undefined, () => {
    assertEquals(isSunsetExpired(SYNTH, "v1"), false);
    assertEquals(isDeprecatedVersion(SYNTH, "v1"), false);
  });
});

Deno.test("Sunset: isSunsetExpired = false / isDeprecatedVersion = true quando sunset está no futuro", () => {
  withSyntheticContract("2099-01-01", () => {
    assertEquals(isSunsetExpired(SYNTH, "v1"), false);
    assertEquals(isDeprecatedVersion(SYNTH, "v1"), true);
  });
});

Deno.test("Sunset: isSunsetExpired = true / isDeprecatedVersion = false quando sunset já passou", () => {
  withSyntheticContract("2020-01-01", () => {
    assertEquals(isSunsetExpired(SYNTH, "v1"), true);
    assertEquals(isDeprecatedVersion(SYNTH, "v1"), false);
  });
});

Deno.test("Sunset: contrato desconhecido nunca é 'expirado' (guarda anti-crash)", () => {
  assertEquals(isSunsetExpired("__contrato_inexistente__", "v1"), false);
});

// ─── parseOrReject: versão explícita + sunset expirado → 410 ───────────────

Deno.test("Sunset: header x-contract-version pedindo versão com sunset expirado → 410 contract_version_sunset", () => {
  withSyntheticContract("2020-01-01", () => {
    const result = parseOrReject(
      SYNTH,
      SCHEMAS,
      req({ "x-contract-version": "v1" }),
      { legacy_field: "ok" },
    );
    assertEquals(result.ok, false);
    if (result.ok === false) {
      assertEquals(result.response.status, 410);
      assertEquals(result.body.code, "contract_version_sunset");
      assertEquals(result.body.contract, `${SYNTH}@v1`);
      assert(result.body.message.includes("2020-01-01"), "mensagem deve citar a data de sunset");
      assert(result.body.message.includes("v2"), "mensagem deve apontar a versão atual");
      assertEquals(result.body.details.length, 1);
      assertEquals(result.body.details[0].path, "version");
    }
  });
});

Deno.test("Sunset: body.version (\"1\") pedindo versão com sunset expirado → 410", () => {
  withSyntheticContract("2020-01-01", () => {
    const result = parseOrReject(SYNTH, SCHEMAS, null, {
      legacy_field: "ok",
      version: "1",
    });
    assertEquals(result.ok, false);
    if (result.ok === false) {
      assertEquals(result.response.status, 410);
      assertEquals(result.body.code, "contract_version_sunset");
    }
  });
});

Deno.test("Sunset: versão current (v2) do mesmo contrato continua funcionando normalmente após v1 expirar", () => {
  withSyntheticContract("2020-01-01", () => {
    const result = parseOrReject(
      SYNTH,
      SCHEMAS,
      req({ "x-contract-version": "v2" }),
      { legacy_field: "ok", version: "2.0" },
    );
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.version, "v2");
      assertEquals(result.deprecated, false);
    }
  });
});

// ─── parseOrReject: auto-detecção NÃO é bloqueada pelo sunset expirado ─────

Deno.test("Sunset: payload v1 SEM versão explícita (auto-detecção) continua aceito mesmo com sunset expirado", () => {
  withSyntheticContract("2020-01-01", () => {
    // Payload no formato v1 (sem campo `version`) — nenhum header também.
    // Este é o caminho real de um webhook externo que nunca migrou de shape.
    const result = parseOrReject(SYNTH, SCHEMAS, null, { legacy_field: "ok" });
    assertEquals(result.ok, true, "auto-detecção não deve ser bloqueada pelo sunset (ver comentário em contract-kit.ts)");
    if (result.ok) {
      assertEquals(result.version, "v1");
    }
  });
});

// ─── Canário: sunsets REAIS ainda não passaram ─────────────────────────────
// Se este teste falhar, um sunset de produção passou de fato — decida
// deliberadamente (manter auto-detecção permissiva é o padrão; migrar o
// contrato para exigir header explícito é uma mudança de produto à parte)
// em vez de deixar o teste vermelho ser "corrigido" ajustando a data.

Deno.test("Sunset: nenhum contrato real em CONTRACTS tem sunset já expirado", () => {
  const expired: string[] = [];
  for (const [name, spec] of Object.entries(CONTRACTS)) {
    if (!spec.sunset) continue;
    for (const version of Object.keys(spec.sunset)) {
      if (isSunsetExpired(name, version)) {
        expired.push(`${name}@${version} (sunset ${spec.sunset[version]})`);
      }
    }
  }
  assertEquals(
    expired,
    [],
    `Sunset expirado para: ${expired.join(", ")}. Auto-detecção continua aceitando normalmente ` +
    `(ver contract-kit.ts) — isto só afeta chamadores que pedem a versão explicitamente. ` +
    `Decida se o contrato precisa de ação (nenhuma, ou passar a exigir versão explícita).`,
  );
});
