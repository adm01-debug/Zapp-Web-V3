/**
 * Sanitização adicional para casos não cobertos pelo sanitize.ts principal.
 *
 * Complementa:
 * - Phone normalization/validation BR
 * - Email validation avançada
 * - File upload validation (MIME, extension, size)
 * - JSON sanitization recursiva
 * - Log sanitization (PII removal)
 *
 * sanitize.ts principal já cobre HTML sanitization com DOMPurify.
 */

const EMAIL_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Valida e normaliza email.
 * Retorna lowercase ou null se inválido.
 */
export function sanitizeEmail(email: string): string | null {
  if (!email || typeof email !== 'string') return null;

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length === 0 || trimmed.length > 254) return null;
  if (!EMAIL_REGEX.test(trimmed)) return null;

  // Validações extras
  if (trimmed.includes('..')) return null; // Consecutivos
  if (trimmed.startsWith('.') || trimmed.endsWith('.')) return null;

  return trimmed;
}

/**
 * Normaliza telefone brasileiro.
 * Aceita: (11) 99999-8888, 11999988888, +5511999998888
 * Retorna: 5511999998888 (sem máscara, com código do país)
 */
export function normalizePhoneBR(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null;

  const digits = phone.replace(/\D/g, '');

  if (digits.length < 10 || digits.length > 13) return null;

  // Adiciona código do país se necessário
  if (digits.length <= 11) {
    return `55${digits}`;
  }

  return digits;
}

/**
 * Mascara telefone para exibição.
 */
export function maskPhoneBR(phone: string): string {
  if (!phone) return '';

  const digits = phone.replace(/\D/g, '');

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return phone;
}

/**
 * Valida MIME type contra whitelist.
 */
export function validateMimeType(mime: string, allowed: readonly string[]): boolean {
  if (!mime || typeof mime !== 'string') return false;
  return allowed.includes(mime.toLowerCase());
}

/**
 * Valida extensão de arquivo contra whitelist.
 */
export function validateFileExtension(
  filename: string,
  allowed: readonly string[]
): boolean {
  if (!filename || typeof filename !== 'string') return false;

  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return false;

  const ext = filename.slice(lastDot + 1).toLowerCase();
  return allowed.includes(ext);
}

/**
 * Sanitiza filename removendo path traversal e caracteres perigosos.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') return '';

  let clean = filename
    .replace(/\.\./g, '') // Remove path traversal
    .replace(/[\/\\]/g, '') // Remove separadores
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control chars

  // Limit length (filesystem max ~255)
  if (clean.length > 255) {
    const ext = clean.slice(clean.lastIndexOf('.'));
    clean = clean.slice(0, 255 - ext.length) + ext;
  }

  return clean;
}

/**
 * Sanitiza URL bloqueando protocols perigosos.
 */
export function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim().toLowerCase();

  // Block dangerous protocols
  const dangerous = ['javascript:', 'vbscript:', 'data:', 'file:'];
  for (const proto of dangerous) {
    if (trimmed.startsWith(proto)) return null;
  }

  // Allow safe protocols
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  ) {
    return url;
  }

  return null;
}

/**
 * Sanitiza JSON removendo campos sensíveis (recursive).
 */
export function sanitizeJson<T>(obj: T, maxDepth = 10): T {
  if (maxDepth <= 0) return obj;
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') return obj as T;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeJson(item, maxDepth - 1)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive fields
    if (/password|secret|token|api[_-]?key|private[_-]?key/i.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeJson(value, maxDepth - 1);
    }
  }
  return sanitized as T;
}

/**
 * Sanitiza log messages removendo PII.
 */
export function sanitizeLogMessage(message: string): string {
  if (!message || typeof message !== 'string') return '';

  let clean = message;

  // CPF: 123.456.789-00
  clean = clean.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[CPF]');

  // CNPJ: 12.345.678/0001-00
  clean = clean.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '[CNPJ]');

  // Email
  clean = clean.replace(
    /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[EMAIL]'
  );

  // Bearer tokens
  clean = clean.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [TOKEN]');

  // OpenAI/Anthropic API keys
  clean = clean.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-[REDACTED]');
  clean = clean.replace(/sk-ant-[a-zA-Z0-9-]{20,}/g, 'sk-ant-[REDACTED]');

  // JWT (3 segmentos base64)
  clean = clean.replace(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    '[JWT]'
  );

  return clean;
}

/**
 * Trunca string com ellipsis.
 */
export function truncate(text: string, maxLength: number, ellipsis = '...'): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Valida tamanho de arquivo.
 */
export function validateFileSize(
  sizeBytes: number,
  maxBytes: number
): { valid: boolean; error?: string } {
  if (sizeBytes <= 0) {
    return { valid: false, error: 'Arquivo vazio' };
  }
  if (sizeBytes > maxBytes) {
    const maxMB = (maxBytes / 1024 / 1024).toFixed(1);
    const actualMB = (sizeBytes / 1024 / 1024).toFixed(1);
    return {
      valid: false,
      error: `Arquivo muito grande: ${actualMB}MB (máximo: ${maxMB}MB)`,
    };
  }
  return { valid: true };
}
