/**
 * Provider fake — apenas para testes (E71-E73 do Plano V2)
 *
 * Implementa a mesma interface do evolutionClient (12 verbos canônicos),
 * mas sem I/O real. NUNCA usar em produção: registry.ts verifica
 * DENO_ENV=test (assertTestEnv).
 *
 * Uso em testes:
 *   import { getProviderClient } from '../_shared/providers/registry.ts';
 *
 *   // Dentro de DENO_ENV=test:
 *   //   PROVIDER_UNDER_TEST=fake  → getProviderClient() resolve fakeProvider
 *   // Ou diretamente:
 *   import { fakeProvider } from '../_shared/providers/fake/index.ts';
 *
 * Verbos canônicos (espelho do evolutionClient):
 *   sendText, sendMedia, sendSticker, getConnectionState, getQrCode,
 *   restartInstance, listInstances, listGroups, checkWhatsApp,
 *   getProfilePicture, get, post.
 * Nota: NÃO existe sendAudio no client real — áudio é coberto por sendMedia.
 *
 *   import { registry } from '../_shared/providers/registry.ts';
 *   registry.getProviderClient('fake');  // passa pelo guard DENO_ENV=test
 */

export type FakeResponse<T = unknown> = { ok: boolean; data?: T; error?: string };

/** Respostas configuráveis por teste. */
const _fakes: Map<string, unknown> = new Map();

export const fakeProvider = {
  /** Guard anti-vazamento por verbo (G1 V3): import direto em prod lança. */
  assertSafe() { assertTestEnv(); },
  /** Define o que o fake retorna para uma action específica (ex: 'sendText'). */
  mock(action: string, response: unknown) {
    _fakes.set(action, response);
  },
  reset() {
    _fakes.clear();
  },

  // Interface do evolutionClient (12 verbos canônicos)
  async sendText(_instance: string, _jid: string, _text: string) {

  assertTestEnv();    return _fakes.get('sendText') ?? { ok: true, data: { key: { id: 'fake-msg-id' } } };
  },
  async sendMedia(_instance: string, _jid: string, _opts: unknown) {

  assertTestEnv();    return _fakes.get('sendMedia') ?? { ok: true, data: { key: { id: 'fake-media-id' } } };
  },
  async sendSticker(_instance: string, _jid: string, _url: string) {

  assertTestEnv();    return _fakes.get('sendSticker') ?? { ok: true, data: { key: { id: 'fake-sticker-id' } } };
  },
  async getConnectionState(_instance: string) {

  assertTestEnv();    return _fakes.get('getConnectionState') ?? { ok: true, data: { instance: { state: 'open' } } };
  },
  async getQrCode(_instance: string) {

  assertTestEnv();    return _fakes.get('getQrCode') ?? { ok: true, data: { qrcode: { code: 'fake-qr' } } };
  },
  async restartInstance(_instance: string) {

  assertTestEnv();    return _fakes.get('restartInstance') ?? { ok: true };
  },
  async listInstances() {

  assertTestEnv();    return _fakes.get('listInstances') ?? { ok: true, data: [{ instance: { instanceName: 'wpp2' } }] };
  },
  async listGroups(_instance: string) {

  assertTestEnv();    return _fakes.get('listGroups') ?? { ok: true, data: [] };
  },
  async checkWhatsApp(_instance: string, _phones: string[]) {

  assertTestEnv();    return _fakes.get('checkWhatsApp') ?? { ok: true, data: [] };
  },
  async getProfilePicture(_instance: string, _number: string) {

  assertTestEnv();    return _fakes.get('getProfilePicture') ?? { ok: true, data: { profilePicUrl: 'fake-profile-url' } };
  },
  async get(_path: string) {

  assertTestEnv();    return _fakes.get('get') ?? { ok: true, data: {} };
  },
  async post(_path: string, _body: unknown) {

  assertTestEnv();    return _fakes.get('post') ?? { ok: true, data: {} };
  },
};

/** Capabilities do fake (declara o que NÃO suporta para degrades explícitos). */
export const FAKE_CAPABILITIES = {
  sendText: true,
  sendMedia: true,
  sendSticker: true,
  getProfilePicture: true,
  sendReaction: false,    // não implementado no fake
  sendLocation: false,
  sendTemplate: false,
  sendInteractive: false,
  presence: false,
  qrCode: true,
  groupManagement: false,
};

function getEnv(name: string): string | undefined {
  if (typeof Deno !== 'undefined') return Deno.env.get(name);
  // Fallback Node (vitest). Cast evita TS2580 no type-check do Deno.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

/** Guard: lança erro se fora de ambiente de teste (E73 — S9 do Plano V2). */
export function assertTestEnv() {
  const env = getEnv('DENO_ENV');
  if (env !== 'test') {
    throw new Error('[fake-provider] Fake provider não pode ser usado fora de DENO_ENV=test');
  }
}
