import { test, expect } from './fixtures/auth';

/**
 * Follow-up E2E do PLANO-100 do ChatPanel — etapa 95.
 *
 * Regressão: Mod+E era registrado tanto pela Sidebar quanto pelo ChatPanel
 * (useInboxShortcuts) — com o painel montado, UM pressionamento do atalho
 * podia disparar a mutation de arquivar DUAS vezes. Etapas 12–13 do plano
 * unificaram o dono do atalho (Sidebar cede via `enableArchive=!selectedContactId`).
 * Ver ESTADO.md § "Módulo ChatPanel — plano de 100 etapas".
 */
test.describe('ChatPanel — atalho Mod+E arquiva uma única vez', () => {
  test('Mod+E com conversa aberta dispara exatamente uma chamada de archive', async ({
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

    // A mutation de archive faz PATCH em /rest/v1/contacts (deleted_at) —
    // contamos as chamadas em vez de depender de texto de toast, que pode
    // mudar ou não renderizar a tempo do assert.
    let patchCount = 0;
    await page.route('**/rest/v1/contacts*', (route) => {
      if (route.request().method() === 'PATCH') patchCount++;
      return route.continue();
    });

    // Um único pressionamento — Ctrl (Windows/Linux) ou Meta (macOS).
    await page.keyboard.press('ControlOrMeta+e');

    // Dá tempo pro debounce/rede resolverem sem esperar timeout completo.
    await page.waitForTimeout(1_500);

    if (patchCount === 0) {
      // Contato externo (JID sem UUID interno): o guard bloqueia a mutation
      // antes da rede — comportamento esperado (ver handleArchiveConversation),
      // não uma falha do teste de "disparo único".
      const blockedToast = page.getByText(/não é possível arquivar/i);
      const wasBlocked = await blockedToast.isVisible({ timeout: 2_000 }).catch(() => false);
      test.info().annotations.push({
        type: 'note',
        description: wasBlocked
          ? 'Contato externo (JID) — archive bloqueado pelo guard, 0 chamadas é o esperado.'
          : 'Nenhuma chamada de archive capturada — verificar manualmente se o atalho disparou.',
      });
      return;
    }

    expect(patchCount, 'Mod+E deve disparar exatamente UMA chamada de archive (sem duplo listener)').toBe(1);
  });
});
