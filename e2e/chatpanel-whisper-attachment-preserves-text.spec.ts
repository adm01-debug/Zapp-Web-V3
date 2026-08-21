import { test, expect } from './fixtures/auth';

/**
 * Follow-up E2E do PLANO-100 do ChatPanel — etapa 97.
 *
 * Regressão: em `useChatPanelHandlers`, os early-returns do modo sussurro
 * (anexo não suportado / JID externo / perfil ausente) rodavam DEPOIS de
 * `setInputValue('')` — o texto digitado era descartado nesses caminhos.
 * Etapas 24–25 moveram os 3 guards para ANTES da limpeza do input. Ver
 * ESTADO.md § "Módulo ChatPanel — plano de 100 etapas".
 */
test.describe('ChatPanel — sussurro com anexo preserva o texto digitado', () => {
  test('tentar enviar sussurro com anexo mantém o texto no campo', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    const items = page.locator(
      '[data-testid^="conversation-item-"], [data-testid="conversation-item"], [role="listitem"]'
    );
    if (!(await items.first().isVisible().catch(() => false))) {
      test.skip(true, 'Nenhuma conversa disponível para o usuário de teste');
      return;
    }
    await items.first().click();
    await expect(page.locator('[data-testid="chat-window"]')).toBeVisible({ timeout: 10_000 });

    // 1) Ativa modo sussurro
    await page.keyboard.press('Alt+w');
    const textarea = page.getByPlaceholder(/sussurro interno/i);
    await expect(textarea).toBeVisible({ timeout: 5_000 });

    // 2) Digita o texto ANTES de anexar (ordem que expunha o bug)
    const draft = `Nota interna ${Date.now()}`;
    await textarea.fill(draft);

    // 3) Anexa um arquivo — input[type=file] fica oculto atrás do Paperclip,
    //    setInputFiles funciona mesmo sem o elemento estar visível.
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'nota.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('anexo de teste e2e'),
    });

    // 4) Tenta enviar — o guard "arquivos não suportados em sussurro" deve
    //    bloquear ANTES de limpar o campo.
    await textarea.press('Enter');

    await expect(page.getByText(/arquivos.*n[aã]o s[aã]o suportados.*sussurro/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(textarea).toHaveValue(draft);
  });
});
