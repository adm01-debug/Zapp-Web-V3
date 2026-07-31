/**
 * BUG-05 — Regression tests for sendInteractive in the WhatsApp adapter.
 *
 * Verifica o roteamento por transport:
 *   - evolution: acoes send-buttons / send-list da edge function evolution-api
 *     (proxy Evolution v2 — /message/sendButtons/{instance} e
 *     /message/sendList/{instance});
 *   - cloud: payload interactive do schema Cloud API (ainda nao aceito pelo
 *     zod da whatsapp-cloud-send — falha explicita, sem falso sucesso).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendInteractive } from '@/lib/whatsappAdapter';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

const mockResolveTransport = vi.fn();
vi.mock('@/lib/whatsappAdapterTransport', () => ({
  resolveTransport: (...args: unknown[]) => mockResolveTransport(...args),
  getWhatsAppMode: vi.fn(),
  invalidateWhatsAppModeCache: vi.fn(),
  invalidateTransportCache: vi.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('whatsappAdapter — sendInteractive (BUG-05)', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    mockResolveTransport.mockReset();
    mockResolveTransport.mockResolvedValue({
      transport: 'evolution',
      requestedMode: 'unofficial',
      degraded: false,
    });
  });

  it('type buttons em modo evolution chama a acao send-buttons com numero limpo', async () => {
    await sendInteractive({
      remoteJid: '+55 (11) 99988-7766@s.whatsapp.net',
      instance: 'wpp2',
      type: 'buttons',
      body: 'Escolha uma opcao:',
      header: { type: 'text', text: 'Promocao' },
      footer: 'Toque em um botao',
      buttons: [{ id: 'b1', title: 'Sim' }],
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('evolution-api', {
      body: {
        action: 'send-buttons',
        instanceName: 'wpp2',
        number: '5511999887766',
        text: 'Escolha uma opcao:',
        header: 'Promocao',
        footer: 'Toque em um botao',
        buttons: [{ buttonId: 'b1', buttonText: { displayText: 'Sim' } }],
        list: undefined,
      },
    });
  });

  it('type list em modo evolution chama a acao send-list com sections mapeadas', async () => {
    await sendInteractive({
      remoteJid: '5511999887766@s.whatsapp.net',
      type: 'list',
      body: 'Escolha um sabor:',
      footer: 'Toque para ver as opcoes',
      listButtonText: 'Opcoes',
      sections: [
        {
          title: 'Sabores',
          rows: [
            { id: 'r1', title: 'Chocolate', description: 'Ao leite' },
            { id: 'r2', title: 'Morango' },
          ],
        },
      ],
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('evolution-api', {
      body: {
        action: 'send-list',
        instanceName: 'wpp2',
        number: '5511999887766',
        text: 'Escolha um sabor:',
        header: undefined,
        footer: 'Toque para ver as opcoes',
        buttons: undefined,
        list: {
          title: 'Escolha um sabor:',
          description: 'Toque para ver as opcoes',
          buttonText: 'Opcoes',
          sections: [
            {
              title: 'Sabores',
              rows: [
                { rowId: 'r1', title: 'Chocolate', description: 'Ao leite' },
                { rowId: 'r2', title: 'Morango' },
              ],
            },
          ],
        },
      },
    });
  });

  it('type cta_url sem sections cai em send-buttons (sem list)', async () => {
    await sendInteractive({
      remoteJid: '5511999887766@s.whatsapp.net',
      type: 'cta_url',
      body: 'Acesse nosso site:',
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('evolution-api', {
      body: {
        action: 'send-buttons',
        instanceName: 'wpp2',
        number: '5511999887766',
        text: 'Acesse nosso site:',
        header: undefined,
        footer: undefined,
        buttons: undefined,
        list: undefined,
      },
    });
  });

  it('modo cloud monta o payload interactive do schema Cloud API', async () => {
    mockResolveTransport.mockResolvedValue({
      transport: 'cloud',
      requestedMode: 'official',
      degraded: false,
    });

    await sendInteractive({
      remoteJid: '5511999887766@s.whatsapp.net',
      type: 'buttons',
      body: 'Escolha uma opcao:',
      header: { type: 'text', text: 'Promocao' },
      footer: 'Toque em um botao',
      buttons: [{ id: 'b1', title: 'Sim' }],
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('whatsapp-cloud-send', {
      body: expect.objectContaining({
        to: '5511999887766',
        type: 'interactive',
        interactive: expect.objectContaining({
          type: 'button',
          header: { type: 'text', text: 'Promocao' },
          body: { text: 'Escolha uma opcao:' },
          footer: { text: 'Toque em um botao' },
          action: {
            buttons: [{ type: 'reply', reply: { id: 'b1', title: 'Sim' } }],
          },
        }),
      }),
    });
  });
});
