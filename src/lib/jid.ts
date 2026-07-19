/**
 * Canonical JID helpers — Evolution API v2 / WhatsApp.
 *
 * Centraliza todas as transformações entre número de telefone e JID
 * (`<id>@s.whatsapp.net`, `<id>@g.us`, `status@broadcast`, `<id>@newsletter`)
 * para que cada feature pare de reimplementar a mesma regex/concatenação.
 * Use estes helpers em qualquer ponto que monte payload para Evolution ou
 * interprete webhooks.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * VOCABULÁRIO
 * ──────────────────────────────────────────────────────────────────────────
 *
 * | Conceito          | Forma canônica                       | Helper        |
 * |-------------------|--------------------------------------|---------------|
 * | Telefone (E.164-) | apenas dígitos, 8–15 chars           | `toNumber`    |
 * | JID individual    | `<digits>@s.whatsapp.net`            | `toIndividualJid` / `toJid` |
 * | JID de grupo      | `<participant>-<ts>@g.us` ou `<id>@g.us` | `toGroupJid`  |
 * | Status broadcast  | `status@broadcast` (literal)         | `isStatusBroadcast` |
 * | Lista broadcast   | `<id>@broadcast`                     | `isBroadcast` |
 * | Newsletter/canal  | `<id>@newsletter`                    | `isNewsletter` |
 *
 * ──────────────────────────────────────────────────────────────────────────
 * REGRA DE ESCOLHA RÁPIDA
 * ──────────────────────────────────────────────────────────────────────────
 *
 * - Tem só telefone formatado e quero o JID? → `toJid(input)`
 * - Tenho um remoteJid vindo de webhook e só quero o número? → `toNumber(jid)`
 * - Filtro do inbox precisa separar grupos? → `isGroup(jid)`
 * - Defesa contra status do WhatsApp aparecendo como conversa? → `isStatusBroadcast(jid)`
 * - Vou enviar payload para Evolution e quero falhar cedo? → `toJidStrict` / `toPhoneStrict`
 *
 * ──────────────────────────────────────────────────────────────────────────
 * COMPORTAMENTO DETERMINÍSTICO
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Todos os helpers são puros e determinísticos:
 * - `null` / `undefined` / `''` → string vazia (variantes estritas → `null`)
 * - Idempotência: `toPhone(toPhone(x)) === toPhone(x)` e idem para `toJid`
 * - Sanitizam whitespace, NBSP, zero-width, BOM e marcas RTL
 * - Cobertura validada em `src/lib/__tests__/jid.test.ts` (129 casos)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * LEGADO vs CANÔNICO
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Os nomes `toPhone` e `isStatus` permanecem como aliases de retrocompat.
 * Em código novo prefira `toNumber` e `isStatusBroadcast` (blueprint).
 */


const INDIVIDUAL_SUFFIX = '@s.whatsapp.net';
const GROUP_SUFFIX = '@g.us';
const BROADCAST_SUFFIX = '@broadcast';
const STATUS_JID = 'status@broadcast';
const NEWSLETTER_SUFFIX = '@newsletter';

/**
 * Normaliza qualquer input "telefônico" para apenas dígitos.
 *
 * Estratégia:
 *   1. Descarta qualquer sufixo após `@` (`...@s.whatsapp.net`, `...@g.us`,
 *      `status@broadcast`, etc.)
 *   2. Remove TUDO que não for dígito (`/\D/g`) — incluindo whitespace,
 *      NBSP, zero-width, BOM, parênteses, hífens, `+` e letras.
 *
 * Garantias:
 *   - Determinístico e idempotente: `toPhone(toPhone(x)) === toPhone(x)`
 *   - `null` / `undefined` / `''` / strings só com lixo → `''`
 *
 * @example Entrada formatada (BR)
 *   toPhone('+55 (11) 99999-9999')         // → '5511999999999'
 *
 * @example JID individual
 *   toPhone('5511999999999@s.whatsapp.net') // → '5511999999999'
 *
 * @example JID de grupo (mantém o local-part inteiro, com hífens removidos)
 *   toPhone('120363021111111111-1700000001@g.us')
 *     // → '1203630211111111111700000001'
 *
 * @example DDI internacional
 *   toPhone('+1 (415) 555-0132')           // → '14155550132'
 *
 * @example Status / broadcast (não há número)
 *   toPhone('status@broadcast')            // → ''
 *
 * @example Caracteres incomuns (tab, NBSP, zero-width)
 *   toPhone('\t55\u00A011\u200B99999 9999') // → '5511999999999'
 *
 * @see toNumber — alias canônico recomendado em código novo
 * @see toPhoneStrict — versão que retorna `null` se < 8 ou > 15 dígitos
 */
export function toPhone(input: string | null | undefined): string {
  if (!input) return '';
  const stripped = String(input).split('@')[0] ?? '';
  return stripped.replace(/\D/g, '');
}

/** Garante o JID individual canônico `<digits>@s.whatsapp.net`. */
export function toIndividualJid(input: string | null | undefined): string {
  const phone = toPhone(input);
  if (!phone) return '';
  return `${phone}${INDIVIDUAL_SUFFIX}`;
}

/** Garante JID de grupo. Se input já contiver `@g.us` mantém; senão concatena. */
export function toGroupJid(input: string | null | undefined): string {
  if (!input) return '';
  const raw = String(input);
  if (raw.endsWith(GROUP_SUFFIX)) return raw;
  const stripped = raw.split('@')[0] ?? '';
  return stripped ? `${stripped}${GROUP_SUFFIX}` : '';
}

/**
 * Resolução genérica de JID: preserva sufixos conhecidos, ou assume conversa
 * individual quando o input é só um número.
 *
 * Regra de decisão:
 *   - Termina em `@s.whatsapp.net` | `@g.us` | `@broadcast` | `@newsletter`
 *     → retorna como veio (passthrough).
 *   - Caso contrário → trata como telefone e gera `<digits>@s.whatsapp.net`
 *     via `toIndividualJid`.
 *
 * Use sempre que o caller pode passar tanto telefone quanto JID
 * (ex.: `openContactInChat(remoteJidOrNumber)`).
 *
 * @example Passthrough de JIDs já canônicos
 *   toJid('5511999999999@s.whatsapp.net') // → '5511999999999@s.whatsapp.net'
 *   toJid('120363@g.us')                  // → '120363@g.us'
 *   toJid('status@broadcast')             // → 'status@broadcast'
 *   toJid('news123@newsletter')           // → 'news123@newsletter'
 *
 * @example Conversão de telefone → JID individual
 *   toJid('5511999999999')                // → '5511999999999@s.whatsapp.net'
 *   toJid('+55 (11) 99999-9999')          // → '5511999999999@s.whatsapp.net'
 *   toJid('+1 415-555-0132')              // → '14155550132@s.whatsapp.net'
 *
 * @example Inputs inválidos / vazios
 *   toJid(null)                           // → ''
 *   toJid('')                             // → ''
 *   toJid('   ')                          // → ''
 *   toJid('abc')                          // → ''
 *
 * @see toJidStrict — retorna `null` se não der pra montar um JID válido
 */
export function toJid(input: string | null | undefined): string {
  if (!input) return '';
  const raw = String(input);
  if (
    raw.endsWith(INDIVIDUAL_SUFFIX) ||
    raw.endsWith(GROUP_SUFFIX) ||
    raw.endsWith(BROADCAST_SUFFIX) ||
    raw.endsWith(NEWSLETTER_SUFFIX)
  ) {
    return raw;
  }
  return toIndividualJid(raw);
}

/**
 * Detecta se um JID representa um grupo do WhatsApp (sufixo `@g.us`).
 *
 * Regra única e barata: termina em `@g.us`. Não tenta inferir grupo a partir
 * do padrão legado `<participant>-<timestamp>` sem sufixo — para esses casos,
 * normalize antes com `toGroupJid` ou trate explicitamente no caller
 * (ver `ContactTypeFilter` para exemplo de fallback).
 *
 * Usado em todo lugar que precise separar conversas 1:1 de grupos:
 * filtros do inbox, badges de contagem, roteamento de mensagens, etc.
 *
 * @example Detecção positiva
 *   isGroup('120363021111111111-1700000001@g.us') // → true
 *   isGroup('120363999999999999@g.us')            // → true
 *
 * @example Não-grupos
 *   isGroup('5511999999999@s.whatsapp.net')       // → false
 *   isGroup('status@broadcast')                   // → false
 *   isGroup('5511999999999')                      // → false (sem sufixo)
 *   isGroup('120363-1700@example.com')            // → false (sufixo errado)
 *
 * @example Falsy
 *   isGroup(null)       // → false
 *   isGroup(undefined)  // → false
 *   isGroup('')         // → false
 */
export function isGroup(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith(GROUP_SUFFIX);
}

/** Returns true when `jid` ends with `@broadcast`, matching any broadcast list including the WhatsApp status channel. */
export function isBroadcast(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith(BROADCAST_SUFFIX);
}

/**
 * Detecta se um JID é EXATAMENTE o canal de Status do WhatsApp
 * (`status@broadcast`).
 *
 * Diferença crucial vs `isBroadcast`:
 *   - `isStatusBroadcast(jid)` → só `'status@broadcast'`
 *   - `isBroadcast(jid)`       → qualquer `<id>@broadcast` (inclui Status
 *      e listas de transmissão criadas pelo usuário)
 *
 * Pilar da defesa em três camadas contra Status do WhatsApp poluir a inbox
 * (ver `mem://features/inbox/broadcast-defense.md`). Aplicar em:
 *   1. Adapter de webhook (descartar evento)
 *   2. Hook de realtime (filtrar contato)
 *   3. Selector da lista (esconder card residual)
 *
 * @example Status oficial
 *   isStatusBroadcast('status@broadcast') // → true
 *
 * @example Não é status (mesmo sendo broadcast)
 *   isStatusBroadcast('5511900000000@broadcast') // → false (lista de transmissão)
 *   isStatusBroadcast('120363@g.us')             // → false
 *   isStatusBroadcast('5511@s.whatsapp.net')     // → false
 *
 * @example Falsy
 *   isStatusBroadcast(null)      // → false
 *   isStatusBroadcast(undefined) // → false
 *   isStatusBroadcast('')        // → false
 *
 * @see isStatus — alias legado (mesmo comportamento)
 */
export function isStatus(jid: string | null | undefined): boolean {
  return jid === STATUS_JID;
}

/**
 * Aliases canônicos públicos (nomenclatura recomendada pelo blueprint).
 *
 * Mantemos `toPhone` e `isStatus` como nomes legados para retrocompat,
 * mas TODO código novo deve preferir `toNumber` e `isStatusBroadcast` —
 * eles deixam o intent explícito no call site.
 *
 * @example Equivalência total (mesmo identidade de função)
 *   toNumber === toPhone                  // → true
 *   isStatusBroadcast === isStatus        // → true
 *
 * @example Uso preferido em código novo
 *   const phone = toNumber(remoteJid);                  // '5511999999999'
 *   if (isStatusBroadcast(remoteJid)) return;           // descarta status
 */
export const toNumber = toPhone;
export const isStatusBroadcast = isStatus;

/** Returns true when `jid` is a canonical individual-contact JID (`<digits>@s.whatsapp.net`). */
export function isIndividual(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith(INDIVIDUAL_SUFFIX);
}

/** Returns true when `jid` ends with `@newsletter`, indicating a WhatsApp channel or newsletter. */
export function isNewsletter(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith(NEWSLETTER_SUFFIX);
}

/** Aplica o padrão DDI 55 (Brasil) quando o número vier sem código de país. */
export function ensureBrazilDDI(phone: string): string {
  const digits = toPhone(phone);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

export const JID_SUFFIXES = {
  individual: INDIVIDUAL_SUFFIX,
  group: GROUP_SUFFIX,
  broadcast: BROADCAST_SUFFIX,
  newsletter: NEWSLETTER_SUFFIX,
  status: STATUS_JID,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Branded types & type guards (estrito — preferir em código novo)
// ────────────────────────────────────────────────────────────────────────────

declare const __jidBrand: unique symbol;
/** Phone type alias. */
export type Phone = string & { readonly [__jidBrand]: 'Phone' };
/** Jid type alias. */
export type Jid = string & { readonly [__jidBrand]: 'Jid' };
/** Individual Jid type alias. */
export type IndividualJid = Jid & { readonly [__jidBrand]: 'IndividualJid' };
/** Group Jid type alias. */
export type GroupJid = Jid & { readonly [__jidBrand]: 'GroupJid' };
/** Broadcast Jid type alias. */
export type BroadcastJid = Jid & { readonly [__jidBrand]: 'BroadcastJid' };
/** Newsletter Jid type alias. */
export type NewsletterJid = Jid & { readonly [__jidBrand]: 'NewsletterJid' };

const PHONE_RE = /^\d{8,15}$/;
const INDIVIDUAL_RE = /^\d{8,15}@s\.whatsapp\.net$/;
// Grupos do WhatsApp: <participantPhone>-<creationTs> ou ID longo (>=15 dígitos).
const GROUP_LOCAL_RE = /^\d{6,}(?:-\d{6,})?$/;

/** Type guard: valor é uma string de telefone normalizada (somente dígitos, 8-15). */
export function isValidPhone(value: unknown): value is Phone {
  return typeof value === 'string' && PHONE_RE.test(value);
}

/** Type guard: JID individual canônico `<digits>@s.whatsapp.net`. */
export function isValidIndividualJid(value: unknown): value is IndividualJid {
  return typeof value === 'string' && INDIVIDUAL_RE.test(value);
}

/** Type guard: JID de grupo canônico `<id>@g.us`. */
export function isValidGroupJid(value: unknown): value is GroupJid {
  if (typeof value !== 'string' || !value.endsWith(GROUP_SUFFIX)) return false;
  const local = value.slice(0, -GROUP_SUFFIX.length);
  return GROUP_LOCAL_RE.test(local);
}

/** Type guard: qualquer @broadcast (inclui `status@broadcast`). */
export function isValidBroadcastJid(value: unknown): value is BroadcastJid {
  return typeof value === 'string' && value.endsWith(BROADCAST_SUFFIX) && value.length > BROADCAST_SUFFIX.length;
}

/** Type guard: JID de newsletter `<id>@newsletter`. */
export function isValidNewsletterJid(value: unknown): value is NewsletterJid {
  return typeof value === 'string' && value.endsWith(NEWSLETTER_SUFFIX) && value.length > NEWSLETTER_SUFFIX.length;
}

/** Type guard agregado: qualquer JID válido reconhecido pelo sistema. */
export function isValidJid(value: unknown): value is Jid {
  return (
    isValidIndividualJid(value) ||
    isValidGroupJid(value) ||
    isValidBroadcastJid(value) ||
    isValidNewsletterJid(value)
  );
}

/** Lança se o valor não for um JID válido. Útil em fronteiras de I/O. */
export function assertValidJid(value: unknown, context = 'value'): asserts value is Jid {
  if (!isValidJid(value)) {
    throw new TypeError(`Invalid JID for ${context}: ${JSON.stringify(value)}`);
  }
}

/**
 * Variante estrita de `toPhone` — retorna `null` quando o input não produz
 * um telefone válido (8-15 dígitos), em vez de string vazia. Use em fluxos
 * que devem falhar cedo (envio de mensagem, criação de contato).
 */
export function toPhoneStrict(input: string | null | undefined): Phone | null {
  const phone = toPhone(input);
  return isValidPhone(phone) ? (phone as Phone) : null;
}

/**
 * Variante estrita de `toJid` — retorna `null` se não for possível derivar
 * um JID válido (telefone curto demais, lixo, etc.). Preferir em call sites
 * que enviam payload para Evolution API.
 */
export function toJidStrict(input: string | null | undefined): Jid | null {
  if (input == null) return null;
  const raw = String(input);
  if (isValidJid(raw)) return raw;
  const phone = toPhoneStrict(raw);
  if (!phone) return null;
  const candidate = `${phone}${INDIVIDUAL_SUFFIX}`;
  return isValidIndividualJid(candidate) ? (candidate as IndividualJid) : null;
}
