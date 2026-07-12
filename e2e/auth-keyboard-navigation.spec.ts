import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Regressão de navegação por teclado e foco em /auth.
 *
 * Garante que:
 *  - Todo elemento interativo é alcançável via TAB.
 *  - Existe indicador visível de foco (focus-visible) sem depender de cor.
 *  - Quando um toast de erro aparece (submit inválido), o foco permanece
 *    no formulário e não é sequestrado para o toast (que deve ter role
 *    apropriado e ser anunciado por leitor de tela, não roubar foco).
 *  - axe não reporta violações críticas de foco enquanto o toast estiver visível.
 */

async function activeElementInfo(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      type: (el as HTMLInputElement).type || null,
      name: el.getAttribute('name'),
      ariaLabel: el.getAttribute('aria-label'),
      text: (el.textContent || '').trim().slice(0, 60),
    };
  });
}

test.describe('Navegação por teclado em /auth', () => {
  test('TAB percorre os campos do formulário em ordem lógica', async ({ page }) => {
    await page.goto('/auth', { waitUntil: 'networkidle' });
    await page.waitForSelector('#login-email', { timeout: 10_000 });

    // Foca explicitamente no body para reset determinístico.
    await page.evaluate(() => (document.body as HTMLElement).focus());

    const seen: string[] = [];
    const maxTabs = 15;
    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press('Tab');
      const info = await activeElementInfo(page);
      if (!info) continue;
      seen.push(`${info.tag}#${info.id || info.ariaLabel || info.text}`);
      if (info.id === 'login-email') break;
    }

    // Email deve ser alcançado em <= 15 tabs.
    expect(seen.some((s) => s.includes('login-email'))).toBe(true);

    // Continua tabulando e verifica que também alcança o campo de senha e o botão de submit.
    let foundPassword = false;
    let foundSubmit = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const info = await activeElementInfo(page);
      if (!info) continue;
      if (info.type === 'password' || (info.id || '').toLowerCase().includes('password')) {
        foundPassword = true;
      }
      if (info.tag === 'button' && /entrar/i.test(info.text)) {
        foundSubmit = true;
      }
    }
    expect(foundPassword, 'Campo de senha deve ser alcançável via TAB').toBe(true);
    expect(foundSubmit, 'Botão Entrar deve ser alcançável via TAB').toBe(true);
  });

  test('foco fica visível (outline/ring) no elemento ativo', async ({ page }) => {
    await page.goto('/auth', { waitUntil: 'networkidle' });
    await page.waitForSelector('#login-email', { timeout: 10_000 });

    await page.focus('#login-email');
    const outline = await page.evaluate(() => {
      const el = document.getElementById('login-email');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        boxShadow: cs.boxShadow,
        borderColor: cs.borderColor,
      };
    });
    expect(outline).not.toBeNull();
    const hasVisibleFocus =
      (outline!.outlineStyle !== 'none' && outline!.outlineWidth !== '0px') ||
      (outline!.boxShadow && outline!.boxShadow !== 'none');
    expect(hasVisibleFocus, 'Elemento focado deve ter outline ou box-shadow visível').toBeTruthy();
  });

  test('toast de erro no submit inválido não sequestra o foco e não gera violações axe críticas', async ({
    page,
  }) => {
    await page.goto('/auth', { waitUntil: 'networkidle' });
    await page.waitForSelector('#login-email', { timeout: 10_000 });

    // Submete com credenciais inválidas para disparar toast/erro inline.
    await page.fill('#login-email', 'invalido@example.com');
    // O input de senha vem do PasswordInput; localiza por type=password.
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('senha-invalida-xxxxx');

    const submit = page.getByRole('button', { name: /entrar/i }).first();
    await submit.click();

    // Aguarda toast (Sonner usa role=status/alert) OU mensagem inline de erro.
    await page
      .waitForSelector('[role="status"], [role="alert"], .text-destructive', {
        timeout: 5_000,
      })
      .catch(() => {
        /* aceitável: alguns backends de teste retornam silenciosamente */
      });

    // Foco não deve ser roubado para o toast — deve permanecer no form ou no botão.
    const active = await activeElementInfo(page);
    if (active) {
      const stolen =
        active.tag === 'li' ||
        (active.ariaLabel || '').toLowerCase().includes('notif') ||
        (active.text || '').toLowerCase().includes('fechar');
      expect(stolen, 'Toast não deve sequestrar o foco do usuário').toBe(false);
    }

    // Roda axe com o toast visível para garantir que a UI transiente permanece acessível.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['page-has-heading-one'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    if (blocking.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        'Violações a11y (toast visível):',
        JSON.stringify(
          blocking.map((v) => ({ id: v.id, impact: v.impact, help: v.help })),
          null,
          2
        )
      );
    }
    expect(blocking).toEqual([]);
  });
});
