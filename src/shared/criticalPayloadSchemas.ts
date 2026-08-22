/**
 * ADR (PLANO-100-CONTRATOS-EDGE, Bloco 9, etapas 83/94 — 2026-08-22):
 * fonte de verdade FRONTEND-ONLY para validação client-side de UX antes do
 * envio (único importador: useNewConversation.ts). O espelho backend
 * (`_shared/criticalPayloadSchemas.ts`) foi deletado no #1354 e não é
 * recriado — decisão consciente, não pendência:
 *
 * - Esta validação roda ANTES da requisição sair do browser (feedback
 *   imediato de UX: telefone/mensagem vazios ou malformados). O CONTRATO
 *   real de wire é validado separadamente, no backend, via `parseOrReject` +
 *   `CONTRACT_SCHEMAS` (contract-schemas.ts) — são dois propósitos
 *   diferentes (UX pré-envio vs. enforcement de contrato), não a mesma fonte
 *   de verdade duplicada por acidente.
 * - Por isso não há codegen: gerar este arquivo a partir do schema backend
 *   acopla um formulário de UI a detalhes de um contrato de API que pode
 *   mudar por motivos que nada têm a ver com UX (versionamento v1/v2,
 *   sunset, etc.) — o risco de acoplamento indevido supera o ganho de
 *   eliminar uma duplicação pequena e estável (2 campos: telefone/mensagem).
 * - "Etapa 94" (remover `_shared/criticalPayloadSchemas.ts` "se confirmado
 *   dead code") já estava satisfeita antes deste ADR: o arquivo backend não
 *   existe desde o #1354 — não havia nada a remover.
 */
import { z } from 'zod';

/** Contract Error Code. */
export const ContractErrorCode = {
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
  EMPTY_MESSAGE: 'EMPTY_MESSAGE',
  INVALID_INSTANCE: 'INVALID_INSTANCE',
} as const;

/** Contract Error Code. */
export type ContractErrorCode = (typeof ContractErrorCode)[keyof typeof ContractErrorCode];

type ValidationIssue = {
  path?: Array<string | number>;
  message?: string;
};

/** create Critical Payload Schemas. */
export function createCriticalPayloadSchemas() {
  const normalizedPhoneSchema = z
    .string()
    .min(6, 'Informe um número com DDI e DDD.')
    .max(30, 'Número excede o tamanho permitido.')
    .transform((value: string) => value.replace(/\D/g, ''))
    .refine((digits: string) => digits.length >= 10, {
      message: 'Número inválido. Use DDI + DDD + número.',
    });

  const messageTextSchema = z
    .string()
    .trim()
    .min(1, 'A mensagem não pode estar vazia.')
    .max(10000, 'Mensagem excede 10000 caracteres.');

  const sendTextPayloadSchema = z.object({
    instanceName: z
      .string()
      .trim()
      .min(1, 'Instância é obrigatória.')
      .max(120, 'Instância inválida.'),
    number: normalizedPhoneSchema,
    text: messageTextSchema,
  });

  const publicApiSendSchema = z.object({
    action: z.literal('send'),
    number: normalizedPhoneSchema,
    message: messageTextSchema,
    connectionId: z.string().uuid('connectionId deve ser um UUID válido.').optional(),
  });

  return {
    normalizedPhoneSchema,
    messageTextSchema,
    sendTextPayloadSchema,
    publicApiSendSchema,
  };
}

/** map Validation Issues To Contract Error. */
export function mapValidationIssuesToContractError(issues: ValidationIssue[] = []) {
  const issueByPath = (field: string) => issues.find((issue) => (issue.path || []).includes(field));

  if (issueByPath('number')) {
    return {
      code: ContractErrorCode.INVALID_PHONE_NUMBER,
      message: 'Número inválido. Verifique DDI, DDD e somente dígitos.',
    };
  }

  if (issueByPath('text') || issueByPath('message')) {
    return {
      code: ContractErrorCode.EMPTY_MESSAGE,
      message: 'Mensagem inválida. Informe um texto não vazio com até 10000 caracteres.',
    };
  }

  if (issueByPath('instanceName') || issueByPath('connectionId')) {
    return {
      code: ContractErrorCode.INVALID_INSTANCE,
      message: 'Instância/conexão inválida. Selecione uma conexão ativa.',
    };
  }

  return {
    code: ContractErrorCode.INVALID_PAYLOAD,
    message: 'Payload inválido. Revise os campos obrigatórios e tente novamente.',
  };
}
