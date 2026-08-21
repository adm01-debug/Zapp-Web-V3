/**
 * Contract Field Matrix — Bloco 6 do PLANO-100-CONTRATOS-EDGE (etapas 63-67).
 *
 * Complementa contract-matrix.test.ts (que cobre casos ESTRUTURAIS — body
 * ausente, não-JSON, versão não suportada, headers CORS — iguais pra todo
 * contrato). Este arquivo cobre o eixo FINO, por CAMPO: pra cada contrato
 * registrado em CONTRACT_SCHEMAS, o gerador em ../adversarial-matrix.ts
 * introspecciona o schema Zod real e deriva automaticamente:
 *
 *   - happy_path:        payload mínimo válido sintetizado — prova que o
 *                         schema aceita algo (nenhum contrato "trava
 *                         fechado" por acidente).
 *   - missing_required:  cada campo obrigatório removido, um de cada vez.
 *   - wrong_type:        cada campo trocado por um valor de tipo JS
 *                         diferente (string→number, number→string, etc.) —
 *                         Zod rejeita por tipo ANTES de rodar refine
 *                         customizado, então é robusto mesmo pra campos com
 *                         validação de negócio (isSafeHttpsUrl,
 *                         phoneOrJidField, etc.).
 *   - empty_string:       campos string com `.min(1+)` declarado, testados
 *                         com "" — só gerado quando o PRÓPRIO schema já
 *                         declara o mínimo (nunca assume).
 *   - invalid_enum:       campos z.enum(...) testados com um valor fora da
 *                         lista.
 *   - extra_field:        campo desconhecido — rejeitado em .strict(),
 *                         aceito em .passthrough()/.strip() (o teste sabe
 *                         qual esperar lendo o unknownKeys real do schema).
 *
 * Contratos com z.discriminatedUnion viram N conjuntos de teste (um por
 * branch, usando o literal do discriminador). Contratos multipart
 * (MULTIPART_CONTRACTS) ficam de fora — etapa 72 trata separado.
 *
 * "No silent caps": os 2 contratos com lógica cross-field (superRefine
 * condicional) que a síntese automática não consegue satisfazer têm seed
 * manual documentado em SEED_OVERRIDES — não são pulados silenciosamente.
 *
 * Rodar: deno test --allow-net --allow-env --allow-read
 *   supabase/functions/_shared/__tests__/contract-field-matrix.test.ts
 */
import { assertEquals } from "jsr:@std/assert";
import { parseOrReject } from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";
import {
  buildAdversarialCases,
  classifySchema,
  MULTIPART_CONTRACTS,
  SEED_OVERRIDES,
  type AdversarialCase,
} from "../adversarial-matrix.ts";

function reqForVersion(version: string): Request {
  return new Request("http://localhost", { headers: { "x-contract-version": version } });
}

let totalCases = 0;
let totalContracts = 0;
let totalMultipartSkipped = 0;
let totalUnsupported = 0;

for (const contractName of Object.keys(CONTRACT_SCHEMAS)) {
  if (MULTIPART_CONTRACTS.has(contractName)) {
    totalMultipartSkipped++;
    continue;
  }

  const versions = CONTRACT_SCHEMAS[contractName];
  for (const [version, schema] of Object.entries(versions)) {
    if (!schema) continue;

    const kind = classifySchema(schema);
    if (kind === "unsupported") {
      totalUnsupported++;
      continue;
    }
    totalContracts++;

    const branches = buildAdversarialCases(schema, SEED_OVERRIDES[contractName]);

    for (const { branch, cases } of branches) {
      for (const c of cases) {
        totalCases++;
        const label = c.fieldName ? `${c.axis}:${c.fieldName}` : c.axis;
        const branchLabel = branch === "default" ? "" : ` [${branch}]`;
        const testCase: AdversarialCase = c;

        Deno.test(
          `Field Matrix: ${contractName}@${version}${branchLabel} — ${label}`,
          () => {
            const req = reqForVersion(version);
            const result = parseOrReject(contractName, { [version]: schema }, req, testCase.payload);

            if (testCase.expectReject) {
              assertEquals(
                result.ok,
                false,
                `${contractName}@${version} [${label}]: esperado REJEITAR, payload passou. ` +
                  `Payload: ${JSON.stringify(testCase.payload)}`,
              );
            } else {
              assertEquals(
                result.ok,
                true,
                `${contractName}@${version} [${label}]: esperado ACEITAR, payload foi rejeitado. ` +
                  `Payload: ${JSON.stringify(testCase.payload)}. ` +
                  (result.ok === false ? `Erro: ${JSON.stringify(result.body.details)}` : ""),
              );
            }
          },
        );
      }
    }
  }
}

Deno.test("Field Matrix: resumo", () => {
  console.log(`\n📊 Contract Field Matrix Summary:`);
  console.log(`   Contratos cobertos (contrato@versão): ${totalContracts}`);
  console.log(`   Multipart pulados (etapa 72, fora do denominador): ${totalMultipartSkipped}`);
  console.log(`   Schemas não suportados pelo classificador: ${totalUnsupported}`);
  console.log(`   Total de casos adversariais gerados e testados: ${totalCases}\n`);
  if (totalUnsupported > 0) {
    throw new Error(
      `${totalUnsupported} schema(s) não classificados pelo gerador (nem ZodObject nem ` +
      `ZodDiscriminatedUnion) — cobertura silenciosamente incompleta. Investigar antes de mergear.`,
    );
  }
});
