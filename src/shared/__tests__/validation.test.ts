/**
 * Tests para validation.ts - Schemas Zod centralizados
 */
import { describe, it, expect } from 'vitest';

import {
  sendMessageSchema,
  createContactSchema,
  retryConfigSchema,
  validateInput,
  safeValidateInput,
  messageContentSchema,
  contactPhoneSchema,
} from "../validation";

describe('messageContentSchema', () => {
  it('deve aceitar mensagem válida', () => {
    const result = messageContentSchema.safeParse("Olá, tudo bem?");
    expect(result.success).toEqual(true);
  });

  it('deve rejeitar mensagem vazia', () => {
    const result = messageContentSchema.safeParse("");
    expect(result.success).toEqual(false);
  });

  it('deve rejeitar mensagem muito longa', () => {
    const result = messageContentSchema.safeParse("a".repeat(5000));
    expect(result.success).toEqual(false);
  });

  it('deve rejeitar só espaços', () => {
    const result = messageContentSchema.safeParse("     ");
    expect(result.success).toEqual(false);
  });
});

describe('contactPhoneSchema', () => {
  it('deve aceitar telefone BR válido', () => {
    const result = contactPhoneSchema.safeParse("11999998888");
    expect(result.success).toEqual(true);
  });

  it('deve aceitar telefone com formatação', () => {
    const result = contactPhoneSchema.safeParse("(11) 99999-8888");
    expect(result.success).toEqual(true);
  });

  it('deve rejeitar telefone curto', () => {
    const result = contactPhoneSchema.safeParse("123");
    expect(result.success).toEqual(false);
  });
});

describe('sendMessageSchema', () => {
  it('deve aceitar payload completo válido', () => {
    const result = sendMessageSchema.safeParse({
      contactId: "123e4567-e89b-12d3-a456-426614174000",
      content: "Olá!",
      messageType: "text",
    });
    expect(result.success).toEqual(true);
  });

  it('deve rejeitar contactId inválido (não-UUID)', () => {
    const result = sendMessageSchema.safeParse({
      contactId: "not-a-uuid",
      content: "Olá!",
    });
    expect(result.success).toEqual(false);
  });

  it("deve usar messageType default 'text'", () => {
    const result = sendMessageSchema.safeParse({
      contactId: "123e4567-e89b-12d3-a456-426614174000",
      content: "Olá!",
    });
    expect(result.success).toEqual(true);
    if (result.success) {
      expect(result.data.messageType).toEqual("text");
    }
  });

  it('deve aceitar com mediaUrl', () => {
    const result = sendMessageSchema.safeParse({
      contactId: "123e4567-e89b-12d3-a456-426614174000",
      content: "Imagem",
      messageType: "image",
      mediaUrl: "https://example.com/image.jpg",
    });
    expect(result.success).toEqual(true);
  });

  it('deve aceitar mediaPayload null', () => {
    const result = sendMessageSchema.safeParse({
      contactId: "123e4567-e89b-12d3-a456-426614174000",
      content: "Test",
      mediaPayload: null,
    });
    expect(result.success).toEqual(true);
  });
});

describe('createContactSchema', () => {
  it('deve aceitar contato válido', () => {
    const result = createContactSchema.safeParse({
      name: "João Silva",
      phone: "11999998888",
      email: "joao@example.com",
      tags: [],
    });
    expect(result.success).toEqual(true);
  });

  it('deve rejeitar sem nome', () => {
    const result = createContactSchema.safeParse({
      phone: "11999998888",
    });
    expect(result.success).toEqual(false);
  });

  it('deve rejeitar mais de 50 tags', () => {
    const tags = Array(60).fill("123e4567-e89b-12d3-a456-426614174000");
    const result = createContactSchema.safeParse({
      name: "João",
      phone: "11999998888",
      tags,
    });
    expect(result.success).toEqual(false);
  });

  it('deve aceitar sem email (opcional)', () => {
    const result = createContactSchema.safeParse({
      name: "João",
      phone: "11999998888",
    });
    expect(result.success).toEqual(true);
  });

  it('deve aceitar com tags vazias', () => {
    const result = createContactSchema.safeParse({
      name: "João",
      phone: "11999998888",
      tags: [],
    });
    expect(result.success).toEqual(true);
  });
});

describe('retryConfigSchema', () => {
  it('deve aceitar config válida', () => {
    const result = retryConfigSchema.safeParse({
      maxRetries: 3,
      baseBackoffMs: 800,
      maxBackoffMs: 6000,
      timeoutMs: 30_000,
    });
    expect(result.success).toEqual(true);
  });

  it('deve rejeitar maxBackoffMs < baseBackoffMs', () => {
    const result = retryConfigSchema.safeParse({
      maxRetries: 3,
      baseBackoffMs: 800,
      maxBackoffMs: 500,
      timeoutMs: 30_000,
    });
    expect(result.success).toEqual(false);
  });

  it('deve rejeitar timeoutMs < baseBackoffMs', () => {
    const result = retryConfigSchema.safeParse({
      maxRetries: 3,
      baseBackoffMs: 800,
      maxBackoffMs: 6000,
      timeoutMs: 500,
    });
    expect(result.success).toEqual(false);
  });

  it('deve rejeitar maxRetries > 10', () => {
    const result = retryConfigSchema.safeParse({
      maxRetries: 20,
      baseBackoffMs: 800,
      maxBackoffMs: 6000,
      timeoutMs: 30_000,
    });
    expect(result.success).toEqual(false);
  });
});

describe('validateInput', () => {
  it('deve retornar data em caso de sucesso', () => {
    const data = validateInput(messageContentSchema, "Olá!");
    expect(data).toEqual("Olá!");
  });

  it('deve throw em caso de erro', () => {
    let threw = false;
    try {
      validateInput(messageContentSchema, "");
    } catch {
      threw = true;
    }
    expect(threw).toEqual(true);
  });
});

describe('safeValidateInput', () => {
  it('deve retornar ok:true em caso de sucesso', () => {
    const result = safeValidateInput(messageContentSchema, "Olá!");
    expect(result.ok).toEqual(true);
  });

  it('deve retornar ok:false sem throw', () => {
    const result = safeValidateInput(messageContentSchema, "");
    expect(result.ok).toEqual(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
  });
});
