/**
 * Provider fake — apenas para testes (E71-E73 do Plano V2)
 *
 * Implementa a mesma interface do evolutionClient, mas sem I/O real.
 * NUNCA usar em produção: registry.ts verifica DENO_ENV=test.
 *
 * Uso em testes:
 *   import { fakeProvider } from '../_shared/providers/fake/index.ts';
 *   import { registry } from '../_shared/providers/registry.ts';
 *   registry.useProvider('fake', fakeProvider);
 */

export type FakeResponse<T = unknown> = { ok: boolean; data?: T; error?: string };

/** Respostas configuráveis por teste. */
const _fakes: Map<string, unknown> = new Map();

export const fakeProvider = {
  /** Define o que o fake retorna para uma action específica (ex: 'sendText'). */
  mock(action: string, response: unknown) {
    _fakes.set(action, response);
  },
  reset() {
    _fakes.clear();
  },

  // Interface do evolutionClient (todos os verbos principais)
  async sendText(_instance: string, _jid: string, _text: string) {
    return _fakes.get('sendText') ?? { ok: true, data: { key: { id: 'fake-msg-id' } } };
  },
  async sendMedia(_instance: string, _jid: string, _opts: unknown) {
    return _fakes.get('sendMedia') ?? { ok: true, data: { key: { id: 'fake-media-id' } } };
  },
  async sendAudio(_instance: string, _jid: string, _opts: unknown) {
    return _fakes.get('sendAudio') ?? { ok: true, data: { key: { id: 'fake-audio-id' } } };
  },
  async sendSticker(_instance: string, _jid: string, _url: string) {
    return _fakes.get('sendSticker') ?? { ok: true, data: { key: { id: 'fake-sticker-id' } } };
  },
  async getConnectionState(_instance: string) {
    return _fakes.get('getConnectionState') ?? { ok: true, data: { instance: { state: 'open' } } };
  },
  async getQrCode(_instance: string) {
    return _fakes.get('getQrCode') ?? { ok: true, data: { qrcode: { code: 'fake-qr' } } };
  },
  async restartInstance(_instance: string) {
    return _fakes.get('restartInstance') ?? { ok: true };
  },
  async listInstances() {
    return _fakes.get('listInstances') ?? { ok: true, data: [{ instance: { instanceName: 'wpp2' } }] };
  },
  async listGroups(_instance: string) {
    return _fakes.get('listGroups') ?? { ok: true, data: [] };
  },
  async checkWhatsApp(_instance: string, _phones: string[]) {
    return _fakes.get('checkWhatsApp') ?? { ok: true, data: [] };
  },
  async get(_path: string) {
    return _fakes.get('get') ?? { ok: true, data: {} };
  },
  async post(_path: string, _body: unknown) {
    return _fakes.get('post') ?? { ok: true, data: {} };
  },
};

/** Capabilities do fake (declara o que NÃO suporta para degrades explícitos). */
export const FAKE_CAPABILITIES = {
  sendText: true,
  sendMedia: true,
  sendAudio: true,
  sendSticker: true,
  sendReaction: false,    // não implementado no fake
  sendLocation: false,
  sendTemplate: false,
  sendInteractive: false,
  presence: false,
  qrCode: true,
  groupManagement: false,
};

/** Guard: lança erro se fora de ambiente de teste (E73 — S9 do Plano V2). */
export function assertTestEnv() {
  const env = typeof Deno !== 'undefined' ? Deno.env.get('DENO_ENV') : process?.env?.DENO_ENV;
  if (env !== 'test') {
    throw new Error('[fake-provider] Fake provider não pode ser usado fora de DENO_ENV=test');
  }
}
