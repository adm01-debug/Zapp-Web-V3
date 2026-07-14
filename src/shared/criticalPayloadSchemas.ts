export const ContractErrorCode = {
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
  EMPTY_MESSAGE: 'EMPTY_MESSAGE',
  INVALID_INSTANCE: 'INVALID_INSTANCE',
} as const;

export type ContractErrorCode = typeof ContractErrorCode[keyof typeof ContractErrorCode];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodLike = any; // ignore-audit — Zod's builder API has no simple structural equivalent without importing the full library

type ValidationIssue = {
  path?: Array<string | number>;
  message?: string;
};

export function createCriticalPayloadSchemas(z: ZodLike) {
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
    instanceName: z.string().trim().min(1, 'Instância é obrigatória.').max(120, 'Instância inválida.'),
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
