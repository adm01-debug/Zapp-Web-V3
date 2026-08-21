import { test, expect } from './fixtures/auth';

/**
 * Follow-up E2E do PLANO-100 do ChatPanel — etapa 94.
 *
 * Regressão: o ChatPanel NÃO é re-montado por `key` na troca de conversa —
 * sem o reset explícito (Bloco 0, `resetAllDialogs()` + `setHistoryOpen(false)`
 * no effect de `conversation.id`), um dialog aberto (ex.: agendar mensagem)
 * herdava o `contactId` da conversa seguinte, permitindo agendar para o
 * contato errado. Ver ESTADO.md § "Módulo ChatPanel — plano de 100 etapas".
 */
test.describe('ChatPanel — reset de dialogs na troca de conversa', () => {
  test('trocar de conversa fecha o dialog de agendamento aberto', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    const items = page.locator(
      '[data-testid^="conversation-item-"], [data-testid="conversation-item"], [role="listitem"]'
    );
    const count = await items.count();
    if (count < 2) {
      test.skip(true, 'Usuário de teste precisa de ao menos 2 conversas para este cenário');
      return;
    }

    // 1) Abre a primeira conversa
    await items.nth(0).click();
    await expect(page.locator('[data-testid="chat-window"]')).toBeVisible({ timeout: 10_000 });

    // 2) Abre o dialog de agendamento via menu "Mais ações"
    await page.getByRole('button', { name: 'Mais ações' }).click();
    await page.getByRole('menuitem', { name: /agendar mensagem/i }).click();

    const scheduleDialog = page.getByRole('dialog', { name: /agendar mensagem/i });
    await expect(scheduleDialog).toBeVisible({ timeout: 5_000 });

    // 3) Troca para a segunda conversa da lista
    await items.nth(1).click();
    await expect(page.locator('[data-testid="chat-window"]')).toBeVisible({ timeout: 10_000 });

    // 4) O dialog da conversa anterior não pode ter sobrevivido à troca —
    //    senão o agendamento herdaria o contactId da conversa nova.
    await expect(scheduleDialog).not.toBeVisible({ timeout: 5_000 });
  });
});
