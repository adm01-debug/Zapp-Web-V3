import { createClient } from '@supabase/supabase-js';
import { test, expect } from './fixtures/auth';

/**
 * Follow-up E2E do PLANO-100 do ChatPanel — etapa 96.
 *
 * Regressão: `useContactTyping` assinava o canal `typing:${jid}`, mas o
 * `ChatPanel` chamava o hook com `conversation.id` (UUID interno) em vez do
 * JID do WhatsApp — o canal nunca casava com o broadcast real do webhook, e
 * o indicador "digitando…" ficava morto. Etapa 3 do Bloco 0 corrigiu para
 * `contactJid` (derivado via `deriveContactJid`). Ver ESTADO.md.
 *
 * Como não há um segundo agente real disponível no ambiente de teste, este
 * spec simula o broadcast do webhook diretamente via supabase-js (mesmo
 * canal/evento/payload que `evolution-webhook` emite em produção), e observa
 * a UI reagir.
 */
test.describe('ChatPanel — indicador de digitação (broadcast simulado)', () => {
  test('broadcast em typing:${jid} liga e desliga o indicador "digitando…"', async ({
    authenticatedPage: page,
  }) => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
      test.skip(true, 'VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY ausentes no ambiente de teste');
      return;
    }

    await page.goto('/');

    const items = page.locator(
      '[data-testid^="conversation-item-"], [data-testid="conversation-item"], [role="listitem"]'
    );
    if (!(await items.first().isVisible().catch(() => false))) {
      test.skip(true, 'Nenhuma conversa disponível para o usuário de teste');
      return;
    }
    await items.first().click();

    const chatWindow = page.locator('[data-testid="chat-window"]');
    await expect(chatWindow).toBeVisible({ timeout: 10_000 });
    const jid = await chatWindow.getAttribute('data-contact-jid');
    if (!jid || jid.endsWith('@g.us')) {
      // Grupo (allowGroups é condicional) ou JID vazio: cenário fora do
      // escopo deste smoke — 1:1 é o caminho principal do bug original.
      test.skip(true, `contactJid inválido para o teste 1:1: "${jid}"`);
      return;
    }

    const admin = createClient(url, key);
    const channel = admin.channel(`typing:${jid}`);
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
    });

    try {
      // 1) START — indicador deve aparecer
      await channel.send({
        type: 'broadcast',
        event: 'contact_typing',
        payload: { isTyping: true },
      });
      await expect(page.getByText('digitando…')).toBeVisible({ timeout: 5_000 });

      // 2) STOP — indicador deve sumir (stop-debounce default 600ms + margem)
      await channel.send({
        type: 'broadcast',
        event: 'contact_typing',
        payload: { isTyping: false },
      });
      await expect(page.getByText('digitando…')).not.toBeVisible({ timeout: 3_000 });
    } finally {
      await admin.removeChannel(channel);
    }
  });
});
