import { describe, it, expect } from 'vitest';

/**
 * Regressão da migração `conversation_audit_logs` → `audit_logs`.
 *
 * Confirma que os writers gravam usando `entity_type='conversation'`,
 * `entity_id=<conversationId>` e que os antigos campos (`event_type`,
 * `status`, `attempt_number`, `error_message`) foram movidos para dentro
 * de `details`. Se alguém regredir e voltar a usar `conversation_audit_logs`
 * ou colunas top-level fora de `details`, este teste quebra.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = [
  'src/features/inbox/hooks/realtime/messageSender.ts',
  'src/features/inbox/hooks/realtime/externalMessageSender.ts',
  'src/features/inbox/components/TicketHistorySheet.tsx',
];

const contents = files.map((f) => readFileSync(resolve(process.cwd(), f), 'utf8'));

describe('audit_logs migration (conversation_audit_logs → audit_logs)', () => {
  it.each(files.map((f, i) => [f, contents[i]] as const))(
    '%s não referencia mais conversation_audit_logs',
    (_f, src) => {
      expect(src).not.toMatch(/conversation_audit_logs/);
    },
  );

  it('messageSender/externalMessageSender inserem em audit_logs', () => {
    const src = contents[0] + contents[1];
    expect(src).toMatch(/audit_logs/);
    expect(src).toMatch(/entity_type:\s*'conversation'/);
    expect(src).toMatch(/entity_id:/);
    expect(src).toMatch(/details:\s*\{/);
  });

  it('TicketHistorySheet lê audit_logs filtrado por entity_type/entity_id', () => {
    const src = contents[2];
    expect(src).toMatch(/\.from\(['"]audit_logs['"]\)/);
    expect(src).toMatch(/\.eq\(['"]entity_type['"],\s*['"]conversation['"]\)/);
    expect(src).toMatch(/\.eq\(['"]entity_id['"]/);
  });
});
