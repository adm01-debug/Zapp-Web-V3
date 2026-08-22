/**
 * Adversarial Matrix — gerador automático de casos de teste por campo,
 * a partir da introspecção do schema Zod real de cada contrato.
 *
 * Bloco 6 do PLANO-100-CONTRATOS-EDGE (etapas 63-67): dado um schema Zod
 * (ZodObject, ZodDiscriminatedUnion ou ZodEffects envolvendo um dos dois),
 * deriva automaticamente:
 *   - um payload MÍNIMO VÁLIDO (synthesizeObject) — sem precisar de fixture
 *     manual por contrato;
 *   - casos adversariais por campo: obrigatório ausente, tipo trocado,
 *     string vazia (quando o schema já exige min-length), enum inválido;
 *   - caso de campo extra desconhecido (rejeitado em .strict(), aceito em
 *     .passthrough()/.strip()).
 *
 * LIMITAÇÃO CONHECIDA (documentada, não escondida — "no silent caps"):
 * a síntese de valor por campo usa heurísticas de nome + os `checks`
 * declarados no próprio Zod (email/uuid/url/min/max) para tentar produzir
 * um valor que passe em `.refine()`/`.superRefine()` customizados (ex.:
 * phoneOrJidField, isSafeHttpsUrl) — mas não INTROSPECTA o predicado do
 * refine em si (isso não é possível em geral). Quando a síntese falha
 * (happy-path do próprio gerador é rejeitado pelo schema real), o contrato
 * entra na lista `needsManualSeed` em vez de ser contado como coberto —
 * ver SEED_OVERRIDES abaixo para os casos já resolvidos manualmente.
 */
import { z } from "https://esm.sh/zod@3.23.8";

// ─── Introspecção: desembrulha Optional/Nullable/Default/Effects ──────────

interface Unwrapped {
  type: z.ZodTypeAny;
  typeName: string;
  required: boolean;
  hasDefault: boolean;
}

function unwrap(schema: z.ZodTypeAny): Unwrapped {
  let current = schema;
  let required = true;
  let hasDefault = false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // deno-lint-ignore no-explicit-any
    const def = (current as any)._def;
    if (def.typeName === "ZodOptional") {
      required = false;
      current = def.innerType;
      continue;
    }
    if (def.typeName === "ZodNullable") {
      // .nullable() SEM .optional() ainda exige a CHAVE presente no payload
      // (aceita null como valor, mas não omissão) — Zod.isOptional() também
      // trata assim. Só desembrulha pro tipo base, não mexe em `required`.
      current = def.innerType;
      continue;
    }
    if (def.typeName === "ZodDefault") {
      required = false;
      hasDefault = true;
      current = def.innerType;
      continue;
    }
    if (def.typeName === "ZodEffects") {
      // refine/superRefine em cima de um tipo base — desembrulha pro tipo
      // real, mas preserva que a validação final pode ser mais estrita
      // (não introspectável).
      current = def.schema;
      continue;
    }
    break;
  }
  // deno-lint-ignore no-explicit-any
  return { type: current, typeName: (current as any)._def.typeName, required, hasDefault };
}

/** Acha o ZodObject real por trás de wrappers ZodEffects (superRefine no objeto todo). */
function unwrapToObject(schema: z.ZodTypeAny): z.ZodObject<z.ZodRawShape> | null {
  // deno-lint-ignore no-explicit-any
  let current: any = schema;
  while (current?._def?.typeName === "ZodEffects") current = current._def.schema;
  if (current?._def?.typeName === "ZodObject") return current as z.ZodObject<z.ZodRawShape>;
  return null;
}

/** Acha o ZodDiscriminatedUnion real por trás de wrappers ZodEffects. */
function unwrapToDiscriminatedUnion(
  schema: z.ZodTypeAny,
  // deno-lint-ignore no-explicit-any
): any | null {
  // deno-lint-ignore no-explicit-any
  let current: any = schema;
  while (current?._def?.typeName === "ZodEffects") current = current._def.schema;
  if (current?._def?.typeName === "ZodDiscriminatedUnion") return current;
  return null;
}

// ─── Síntese de valor plausível por campo ──────────────────────────────────

/**
 * Heurísticas por nome de campo — cobre os validators customizados deste
 * repo (phoneOrJidField, isSafeHttpsUrl, etc.) que um `_def.checks` genérico
 * não revela. Ordem importa: primeiro match vence.
 */
// ID-like SEMPRE checado primeiro — "contactId"/"contact_id"/"contactIds"/
// "workspace_id" etc. têm prioridade sobre qualquer outra heurística
// (evita "contact_id" cair no padrão de telefone só por conter "contact").
const ID_LIKE = /(^id$)|(_ids?$)|([a-z]ids?$)/i;

const NAME_HEURISTICS: Array<[RegExp, unknown]> = [
  [/url$/i, "https://example.com/resource"],
  [/jid$/i, "5511999999999@s.whatsapp.net"],
  [/^(phone|number|to|sender_phone)$/i, "5511999999999"],
  [/email/i, "test@example.com"],
  [/token|secret|key/i, "test-token-value"],
  [/name/i, "Teste"],
  [/content|message|text|body|html/i, "conteúdo de teste"],
];

function synthesizeString(fieldName: string, checks: Array<{ kind: string; value?: number }>): string {
  // Prioridade: o que o PRÓPRIO campo declara (.email()/.uuid()/.url()) vale
  // mais que qualquer heurística de nome — evita colisão tipo "to" (destino
  // de WhatsApp = telefone, mas destino de e-mail = endereço) resolvida
  // errado só pelo nome.
  for (const check of checks) {
    if (check.kind === "email") return "test@example.com";
    if (check.kind === "uuid") return "11111111-1111-4111-8111-111111111111";
    if (check.kind === "url") return "https://example.com/resource";
  }
  if (ID_LIKE.test(fieldName)) return "11111111-1111-4111-8111-111111111111";
  for (const [pattern, value] of NAME_HEURISTICS) {
    if (pattern.test(fieldName)) return value as string;
  }
  const minCheck = checks.find((c) => c.kind === "min");
  const minLen = minCheck?.value ?? 1;
  return "x".repeat(Math.max(minLen, 3));
}

/** Sintetiza um valor plausível pro tipo (já desembrulhado) do campo. */
// deno-lint-ignore no-explicit-any
function synthesizeValue(fieldName: string, unwrapped: Unwrapped): any {
  const { type, typeName } = unwrapped;
  switch (typeName) {
    case "ZodString": {
      // deno-lint-ignore no-explicit-any
      const checks = (type as any)._def.checks ?? [];
      return synthesizeString(fieldName, checks);
    }
    case "ZodNumber": {
      // deno-lint-ignore no-explicit-any
      const checks = (type as any)._def.checks ?? [];
      const minCheck = checks.find((c: { kind: string; value?: number }) => c.kind === "min");
      return typeof minCheck?.value === "number" ? Math.max(minCheck.value, 1) : 1;
    }
    case "ZodBoolean":
      return true;
    case "ZodEnum": {
      // deno-lint-ignore no-explicit-any
      const values = (type as any)._def.values as string[];
      return values[0];
    }
    case "ZodLiteral":
      // deno-lint-ignore no-explicit-any
      return (type as any)._def.value;
    case "ZodArray": {
      // deno-lint-ignore no-explicit-any
      const def = (type as any)._def;
      const minLen = def.minLength?.value ?? 0;
      if (minLen === 0) return [];
      const elUnwrapped = unwrap(def.type);
      return [synthesizeValue(fieldName, elUnwrapped)];
    }
    case "ZodObject":
      return synthesizeObject(type as z.ZodObject<z.ZodRawShape>);
    case "ZodRecord":
      return {};
    case "ZodUnion": {
      // deno-lint-ignore no-explicit-any
      const options = (type as any)._def.options as z.ZodTypeAny[];
      return synthesizeValue(fieldName, unwrap(options[0]));
    }
    case "ZodAny":
    case "ZodUnknown":
      return "x";
    default:
      return undefined;
  }
}

/** Sintetiza um payload mínimo válido pra um ZodObject: só campos obrigatórios. */
export function synthesizeObject(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [fieldName, fieldSchema] of Object.entries(schema.shape)) {
    const uw = unwrap(fieldSchema as z.ZodTypeAny);
    if (!uw.required) continue; // opcional/nullable/default — não entra no mínimo
    out[fieldName] = synthesizeValue(fieldName, uw);
  }
  return out;
}

// ─── Geração de casos adversariais ─────────────────────────────────────────

export interface AdversarialCase {
  axis: "missing_required" | "wrong_type" | "empty_string" | "invalid_enum" | "extra_field" | "happy_path";
  fieldName?: string;
  payload: unknown;
  /** true = o schema deve REJEITAR este payload; false = deve ACEITAR. */
  expectReject: boolean;
}

/** Resultado de tentar achar um valor de "tipo errado" pra um campo. */
export interface WrongTypeResult {
  supported: boolean;
  value?: unknown;
  /** Só presente quando supported=false — por que não há valor de tipo errado. */
  reason?: string;
}

/**
 * Auditoria pós-Bloco 6 (2026-08-21, MEDIUM): o switch original só cobria
 * String/Number/Boolean/Enum/Array/Object — ZodUnion e ZodRecord (que TÊM
 * forma real e testável) caíam no default e o eixo wrong_type era omitido
 * SEM sinal nenhum no resumo do teste, violando o "no silent caps" que o
 * cabeçalho deste arquivo declara pra outra limitação (refine/superRefine).
 * Confirmado contra os 127 contratos reais: 33+ campos sem wrong_type,
 * incluindo `to` (união e-mail/array) em zapp-email-send, `variables`
 * (record) em evolution-templates, etc. Agora ZodUnion/ZodRecord/ZodLiteral
 * são suportados; ZodAny/ZodUnknown continuam sem wrong_type de propósito
 * (não existe "tipo errado" pra um campo que aceita qualquer tipo) — e essa
 * exclusão intencional é reportada explicitamente pelo chamador (ver
 * buildCasesForObject/contract-field-matrix.test.ts), não escondida.
 */
const UNTESTABLE_TYPES = new Set(["ZodAny", "ZodUnknown"]);

/** Forma JS aproximada aceita por um node Zod já desembrulhado — usado só
 * pra achar um antagonista de ZodUnion (não precisa ser exaustivo). */
function jsShapeOf(uw: Unwrapped): string {
  switch (uw.typeName) {
    case "ZodString":
    case "ZodEnum":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodArray":
      return "array";
    case "ZodObject":
    case "ZodRecord":
      return "object";
    case "ZodLiteral": {
      // deno-lint-ignore no-explicit-any
      return typeof (uw.type as any)._def.value;
    }
    default:
      return "unknown";
  }
}

const WRONG_TYPE_CANDIDATES: Array<{ jsShape: string; value: unknown }> = [
  { jsShape: "boolean", value: true },
  { jsShape: "number", value: 987654321 },
  { jsShape: "array", value: ["__wrong_type_probe__"] },
  { jsShape: "object", value: { __wrong_type_probe__: true } },
  { jsShape: "string", value: "__wrong_type_probe__" },
];

function wrongTypeValueFor(typeName: string, node: z.ZodTypeAny): WrongTypeResult {
  // Escolhe um valor de tipo JS diferente do esperado — Zod rejeita por tipo
  // ANTES de rodar refine/superRefine customizado, então é robusto mesmo
  // pra campos com validação de negócio complexa.
  switch (typeName) {
    case "ZodString":
      return { supported: true, value: 12345 };
    case "ZodNumber":
      return { supported: true, value: "not-a-number" };
    case "ZodBoolean":
      return { supported: true, value: "not-a-boolean" };
    case "ZodEnum":
      return { supported: true, value: 999 };
    case "ZodArray":
      return { supported: true, value: "not-an-array" };
    case "ZodObject":
      return { supported: true, value: "not-an-object" };
    case "ZodRecord":
      return { supported: true, value: "not-a-record" };
    case "ZodLiteral": {
      // deno-lint-ignore no-explicit-any
      const litValue = (node as any)._def.value;
      const jsType = typeof litValue;
      if (jsType === "string") return { supported: true, value: 12345 };
      if (jsType === "number") return { supported: true, value: "not-a-number" };
      if (jsType === "boolean") return { supported: true, value: "not-a-boolean" };
      return { supported: false, reason: `ZodLiteral com tipo de valor não mapeado (${jsType})` };
    }
    case "ZodUnion": {
      // deno-lint-ignore no-explicit-any
      const options = (node as any)._def.options as z.ZodTypeAny[];
      const acceptedShapes = new Set(options.map((opt) => jsShapeOf(unwrap(opt))));
      const antagonist = WRONG_TYPE_CANDIDATES.find((c) => !acceptedShapes.has(c.jsShape));
      if (antagonist) return { supported: true, value: antagonist.value };
      return { supported: false, reason: "ZodUnion cujas opções cobrem todos os formatos JS candidatos testados" };
    }
    default:
      if (UNTESTABLE_TYPES.has(typeName)) {
        return { supported: false, reason: `${typeName} aceita qualquer tipo — não existe "tipo errado" pra testar` };
      }
      return { supported: false, reason: `typeName não mapeado no gerador: ${typeName}` };
  }
}

/** Campo cujo eixo wrong_type foi omitido de propósito ou por lacuna real. */
export interface UnsupportedWrongType {
  fieldName: string;
  typeName: string;
  reason: string;
}

/** Resultado de buildCasesForObject: os casos gerados + o que ficou de fora do eixo wrong_type. */
export interface BuildCasesResult {
  cases: AdversarialCase[];
  unsupportedWrongType: UnsupportedWrongType[];
}

/** Gera os casos adversariais pra um ZodObject dado um payload-base válido. */
export function buildCasesForObject(
  schema: z.ZodObject<z.ZodRawShape>,
  validBase: Record<string, unknown>,
): BuildCasesResult {
  const cases: AdversarialCase[] = [];
  const unsupportedWrongType: UnsupportedWrongType[] = [];
  cases.push({ axis: "happy_path", payload: validBase, expectReject: false });

  for (const [fieldName, fieldSchema] of Object.entries(schema.shape)) {
    const uw = unwrap(fieldSchema as z.ZodTypeAny);

    if (uw.required) {
      const { [fieldName]: _drop, ...rest } = validBase;
      cases.push({ axis: "missing_required", fieldName, payload: rest, expectReject: true });
    }

    const wrongType = wrongTypeValueFor(uw.typeName, uw.type);
    if (wrongType.supported) {
      cases.push({
        axis: "wrong_type",
        fieldName,
        payload: { ...validBase, [fieldName]: wrongType.value },
        expectReject: true,
      });
    } else {
      unsupportedWrongType.push({ fieldName, typeName: uw.typeName, reason: wrongType.reason! });
    }

    if (uw.typeName === "ZodString") {
      // deno-lint-ignore no-explicit-any
      const checks = (uw.type as any)._def.checks ?? [];
      const minCheck = checks.find((c: { kind: string; value?: number }) => c.kind === "min");
      if (typeof minCheck?.value === "number" && minCheck.value >= 1) {
        cases.push({
          axis: "empty_string",
          fieldName,
          payload: { ...validBase, [fieldName]: "" },
          expectReject: true,
        });
      }
    }

    if (uw.typeName === "ZodEnum") {
      cases.push({
        axis: "invalid_enum",
        fieldName,
        payload: { ...validBase, [fieldName]: "__INVALID_ENUM_VALUE__" },
        expectReject: true,
      });
    }
  }

  // deno-lint-ignore no-explicit-any
  const unknownKeys = (schema as any)._def.unknownKeys as string | undefined;
  if (unknownKeys === "strict" || unknownKeys === "passthrough") {
    cases.push({
      axis: "extra_field",
      payload: { ...validBase, __unexpected_extra_field__: "x" },
      // .strict() rejeita; .passthrough() aceita — o teste que consome isso
      // decide o que checar com base no unknownKeys real do schema.
      expectReject: unknownKeys === "strict",
    });
  }

  return { cases, unsupportedWrongType };
}

/**
 * Overrides manuais pros contratos cuja síntese automática não consegue
 * satisfazer lógica CROSS-FIELD (superRefine condicional — "X obrigatório
 * só se Y ausente" não é introspectável por campo isolado). Documentado
 * aqui em vez de escondido — cada contrato listado tem o motivo no
 * comentário ao lado.
 */
export const SEED_OVERRIDES: Record<string, Record<string, unknown>> = {
  // superRefine: to/subject/html só são obrigatórios se accountId ausente.
  "send-email": { to: "test@example.com", subject: "Assunto de teste", html: "<p>Corpo de teste</p>" },
  // superRefine: pelo menos um de html/text é obrigatório.
  "zapp-email-send": { to: "test@example.com", subject: "Assunto de teste", html: "<p>Corpo de teste</p>" },
  // superRefine (Bloco 2, etapa 23, 2026-08-21): to (array não vazio),
  // subject e pelo menos um de text/html são obrigatórios — E, diferente de
  // zapp-email-send acima, este objeto (branch "default", não discriminated
  // union) faz REPLACE do base sintetizado, não merge (buildAdversarialCases
  // linha ~344) — por isso id/from (também obrigatórios no schema) precisam
  // entrar aqui também, senão o happy_path falha por campo errado.
  "zapp-email-inbound-webhook": {
    id: "test-message-id",
    from: "sender@example.com",
    to: ["test@example.com"],
    subject: "Assunto de teste",
    html: "<p>Corpo de teste</p>",
  },
};

/**
 * Contratos que esperam multipart/form-data (campo File real), não JSON —
 * fora do denominador desta matriz por natureza. Cobertos separadamente por
 * um harness dedicado (etapa 72):
 * `_shared/__tests__/contract-multipart-matrix.test.ts`, com um `File` real
 * construído à mão em vez de sintetizado (o sintetizador genérico deste
 * arquivo não consegue produzir um `File` válido — `z.custom<File>` vira
 * ZodAny na introspecção, e a síntese de ZodAny é a string `"x"`, que falha
 * o `instanceof File` do refine).
 */
export const MULTIPART_CONTRACTS = new Set<string>([
  "file-security-scanner",
  "secure-upload",
  "voice-changer",
]);

export type ContractSchemaKind = "object" | "discriminated_union" | "unsupported";

export function classifySchema(schema: z.ZodTypeAny): ContractSchemaKind {
  if (unwrapToObject(schema)) return "object";
  if (unwrapToDiscriminatedUnion(schema)) return "discriminated_union";
  return "unsupported";
}

/**
 * Gera os casos adversariais pra QUALQUER schema de contrato (ZodObject,
 * ZodDiscriminatedUnion, ou um dos dois envolto em ZodEffects). Pra
 * discriminatedUnion, gera um payload válido POR BRANCH (usando o literal
 * do discriminador) e roda a matriz completa em cada branch.
 */
export function buildAdversarialCases(
  schema: z.ZodTypeAny,
  seedOverride?: Record<string, unknown>,
): { branch: string; cases: AdversarialCase[]; unsupportedWrongType: UnsupportedWrongType[] }[] {
  const asObject = unwrapToObject(schema);
  if (asObject) {
    const base = seedOverride ?? synthesizeObject(asObject);
    const result = buildCasesForObject(asObject, base);
    return [{ branch: "default", cases: result.cases, unsupportedWrongType: result.unsupportedWrongType }];
  }

  const asDU = unwrapToDiscriminatedUnion(schema);
  if (asDU) {
    // asDU já é `any` (retorno de unwrapToDiscriminatedUnion) — os casts
    // abaixo só dão forma a um valor já-any, não introduzem `any` novo
    // (por isso nenhum precisa de deno-lint-ignore no-explicit-any).
    const options = asDU._def.options as z.ZodObject<z.ZodRawShape>[];
    return options.map((opt) => {
      const discriminatorKey = asDU._def.discriminator as string;
      const base = seedOverride
        ? { ...synthesizeObject(opt), ...seedOverride }
        : synthesizeObject(opt);
      // deno-lint-ignore no-explicit-any
      const literalValue = (opt.shape[discriminatorKey] as any)._def.value;
      const result = buildCasesForObject(opt, { ...base, [discriminatorKey]: literalValue });
      return {
        branch: String(literalValue),
        cases: result.cases,
        unsupportedWrongType: result.unsupportedWrongType,
      };
    });
  }

  return [];
}
