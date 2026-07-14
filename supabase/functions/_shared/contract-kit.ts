/**
 * Contract Kit — validação de contrato unificada para webhooks e Edge Functions.
 *
 * Implementa o `parseOrReject` referenciado em `contract-versions.ts`:
 *  1. FORMATO ÚNICO DE ERRO 422 — todo endpoint que falha validação responde
 *     exatamente o mesmo envelope: { error, code, message, contract,
 *     requestId?, details: [{ path, message }] }.
 *  2. VERSIONAMENTO v1/v2 — negociação por header `x-contract-version`,
 *     campo `contract_version`/`version` no body, ou auto-detecção
 *     (tenta da versão mais nova para a mais antiga entre as `supported`).
 *  3. RETROCOMPATIBILIDADE — versões em período de sunset continuam aceitas,
 *     mas a resposta ganha `x-contract-deprecated: true` + header `sunset`.
 *
 * Regras de segurança operacional (incidente 2026-07-03, evolution-webhook):
 *  - Schemas de webhooks EXTERNOS devem ser permissivos (`.nullish()`,
 *    `.passthrough()`) — um 422 indevido em payload real do provedor causa
 *    perda de dados. Rigor total fica para endpoints internos/da UI.
 *
 * Códigos de erro canônicos:
 *  - `invalid_json`                 → body ausente, não-JSON ou não-objeto/array
 *  - `contract_violation`           → JSON válido, mas fora do schema
 *  - `unsupported_contract_version` → versão pedida não está em `supported`
 */

import { z } from "https://esm.sh/zod@3.23.8";
import { CONTRACTS, contractLabel, isDeprecatedVersion } from "./contract-versions.ts";

export { z };

// ─── Tipos do envelope ───────────────────────────────────────────────────────

export type ContractErrorCode =
  | "invalid_json"
  | "contract_violation"
  | "unsupported_contract_version";

export interface ContractErrorDetail {
  path: string;
  message: string;
}

export interface ContractErrorBody {
  error: true;
  code: ContractErrorCode;
  message: string;
  /** Label canônica `<contrato>@<versão>` (ex.: "evolution-webhook@v2"). */
  contract: string;
  requestId?: string;
  details: ContractErrorDetail[];
}

export type SchemaMap = Partial<Record<string, z.ZodTypeAny>>;

export interface ParseOk<T = unknown> {
  ok: true;
  data: T;
  /** Versão do contrato efetivamente aplicada (ex.: "v1"). */
  version: string;
  /** true quando a versão está em janela de sunset (aceita, porém deprecated). */
  deprecated: boolean;
  /** Headers a mesclar na resposta de sucesso (x-contract-version, sunset…). */
  headers: Record<string, string>;
}

export interface ParseFail {
  ok: false;
  /** Response 422 pronta, com envelope único e CORS herdado de extraHeaders. */
  response: Response;
  body: ContractErrorBody;
}

export type ParseResult<T = unknown> = ParseOk<T> | ParseFail;

export interface ParseOptions {
  requestId?: string;
  /** Headers extra (tipicamente CORS do endpoint). Content-Type é forçado. */
  extraHeaders?: Record<string, string>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normaliza aliases de versão: "2.0" → "v2", "1" → "v1", "V2" → "v2". */
export function normalizeVersion(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^v?(\d+)(?:\.\d+)?$/);
  return m ? `v${m[1]}` : s; // strings não numéricas passam cruas (rejeitadas depois)
}

/**
 * Resolve a versão explicitamente pedida pelo cliente.
 * Precedência: header `x-contract-version` > body.contract_version > body.version.
 * Retorna null quando nada foi pedido (→ auto-detecção).
 */
export function resolveRequestedVersion(req: Request | null, body: unknown): string | null {
  const fromHeader = req?.headers?.get?.("x-contract-version");
  if (fromHeader) return normalizeVersion(fromHeader);
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const b = body as Record<string, unknown>;
    if (b.contract_version != null) return normalizeVersion(b.contract_version);
    if (b.version != null) return normalizeVersion(b.version);
  }
  return null;
}

function zodIssuesToDetails(error: z.ZodError): ContractErrorDetail[] {
  return error.issues.slice(0, 25).map((i) => ({
    path: i.path.length ? i.path.join(".") : "root",
    message: i.message,
  }));
}

export function buildContractErrorBody(
  contractName: string,
  version: string | undefined,
  code: ContractErrorCode,
  message: string,
  details: ContractErrorDetail[] = [],
  requestId?: string,
): ContractErrorBody {
  return {
    error: true,
    code,
    message,
    contract: contractLabel(contractName, version),
    ...(requestId ? { requestId } : {}),
    details,
  };
}

function errorResponse422(body: ContractErrorBody, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 422,
    headers: { ...extraHeaders, "Content-Type": "application/json" },
  });
}

/** Headers de contrato para respostas de SUCESSO. */
export function contractHeaders(contractName: string, version: string): Record<string, string> {
  const spec = CONTRACTS[contractName];
  const out: Record<string, string> = { "x-contract-version": version };
  const sunset = spec?.sunset?.[version];
  if (sunset && isDeprecatedVersion(contractName, version)) {
    out["x-contract-deprecated"] = "true";
    out["sunset"] = sunset;
  }
  return out;
}

// ─── Núcleo: parseOrReject ───────────────────────────────────────────────────

/**
 * Valida `body` contra o contrato `contractName`, negociando versão.
 *
 * @param contractName nome registrado em CONTRACTS (contract-versions.ts)
 * @param schemas mapa versão→schema Zod (ex.: { v1: XV1Schema, v2: XV2Schema })
 * @param req Request original (para header x-contract-version). Pode ser null em testes.
 * @param body JSON já parseado (use `await req.json().catch(() => null)`)
 */
export function parseOrReject<T = unknown>(
  contractName: string,
  schemas: SchemaMap,
  req: Request | null,
  body: unknown,
  opts: ParseOptions = {},
): ParseResult<T> {
  const spec = CONTRACTS[contractName];
  const supported = spec?.supported ?? Object.keys(schemas);
  const current = spec?.current ?? supported[supported.length - 1] ?? "v1";
  const extra = opts.extraHeaders ?? {};

  // 1) Body precisa ser JSON estruturado (objeto ou array). null/undefined/primitivo → invalid_json.
  const isStructured = body !== null && typeof body === "object";
  if (!isStructured) {
    const eb = buildContractErrorBody(
      contractName, current, "invalid_json",
      "Body ausente ou não é um JSON estruturado (objeto/array).",
      [{ path: "root", message: "esperado objeto JSON" }],
      opts.requestId,
    );
    return { ok: false, response: errorResponse422(eb, extra), body: eb };
  }

  // 2) Versão explícita fora do suporte → unsupported_contract_version.
  const requested = resolveRequestedVersion(req, body);
  if (requested && !supported.includes(requested)) {
    const eb = buildContractErrorBody(
      contractName, requested, "unsupported_contract_version",
      `Versão '${requested}' não suportada. Suportadas: ${supported.join(", ")} (atual: ${current}).`,
      [{ path: "version", message: `use uma de: ${supported.join(", ")}` }],
      opts.requestId,
    );
    return { ok: false, response: errorResponse422(eb, extra), body: eb };
  }

  // 3) Ordem de tentativa: explícita, ou da mais NOVA para a mais antiga (retrocompat).
  const candidates = requested
    ? [requested]
    : [...supported].sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));

  let firstError: z.ZodError | null = null;
  let firstErrorVersion = current;

  for (const v of candidates) {
    const schema = schemas[v];
    if (!schema) continue;
    const result = schema.safeParse(body);
    if (result.success) {
      const deprecated = isDeprecatedVersion(contractName, v);
      return {
        ok: true,
        data: result.data as T,
        version: v,
        deprecated,
        headers: contractHeaders(contractName, v),
      };
    }
    // Guarda o erro da versão preferida (current, senão a primeira candidata)
    if (!firstError || v === current) {
      firstError = result.error;
      firstErrorVersion = v;
    }
  }

  const eb = buildContractErrorBody(
    contractName, firstErrorVersion, "contract_violation",
    `Payload não satisfaz o contrato ${contractLabel(contractName, firstErrorVersion)}.`,
    firstError ? zodIssuesToDetails(firstError) : [{ path: "root", message: "nenhum schema registrado" }],
    opts.requestId,
  );
  return { ok: false, response: errorResponse422(eb, extra), body: eb };
}

/**
 * Açúcar: parse do Request inteiro (JSON + contrato) em uma chamada.
 * Retorna ParseFail com invalid_json quando o body não é JSON válido.
 */
export async function parseRequestOrReject<T = unknown>(
  contractName: string,
  schemas: SchemaMap,
  req: Request,
  opts: ParseOptions = {},
): Promise<ParseResult<T>> {
  const body = await req.json().catch(() => null);
  return parseOrReject<T>(contractName, schemas, req, body, opts);
}
