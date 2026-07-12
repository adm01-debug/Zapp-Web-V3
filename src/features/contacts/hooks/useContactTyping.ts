import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('ContactTyping');

/**
 * Tempo (ms) para auto-limpar o estado "digitando…" caso não venha novo
 * evento `composing`. Configurável por instância via env
 * `VITE_TYPING_AUTO_CLEAR_MS` (ex.: 3000, 5000, 8000). Clamp: 1s–30s.
 * Default: 5000ms.
 */
const DEFAULT_AUTO_CLEAR_MS = 5000;
const MIN_AUTO_CLEAR_MS = 1000;
const MAX_AUTO_CLEAR_MS = 30000;

function resolveAutoClearMs(): number {
  const raw = (import.meta.env?.VITE_TYPING_AUTO_CLEAR_MS as string | undefined)?.trim();
  if (!raw) return DEFAULT_AUTO_CLEAR_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_AUTO_CLEAR_MS;
  return Math.min(MAX_AUTO_CLEAR_MS, Math.max(MIN_AUTO_CLEAR_MS, Math.round(n)));
}

export const TYPING_AUTO_CLEAR_MS = resolveAutoClearMs();

/**
 * Debounce do STOP (`isTyping=false`) para evitar flicker quando o WhatsApp
 * alterna rapidamente entre `composing` → `paused` → `composing`. O START
 * (`true`) é aplicado imediatamente; o STOP só é confirmado após
 * `VITE_TYPING_STOP_DEBOUNCE_MS` ms sem reativação. Clamp: 100ms–5s.
 * Default: 600ms.
 */
const DEFAULT_STOP_DEBOUNCE_MS = 600;
const MIN_STOP_DEBOUNCE_MS = 100;
const MAX_STOP_DEBOUNCE_MS = 5000;

function resolveStopDebounceMs(): number {
  const raw = (import.meta.env?.VITE_TYPING_STOP_DEBOUNCE_MS as string | undefined)?.trim();
  if (!raw) return DEFAULT_STOP_DEBOUNCE_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_STOP_DEBOUNCE_MS;
  return Math.min(MAX_STOP_DEBOUNCE_MS, Math.max(MIN_STOP_DEBOUNCE_MS, Math.round(n)));
}

export const TYPING_STOP_DEBOUNCE_MS = resolveStopDebounceMs();

/**
 * Resultado expandido para grupos: além de `isTyping`, expõe quem está
 * digitando (`participant` JID). Para chats 1:1, `participant` é sempre null.
 */
export interface ContactTypingState {
  isTyping: boolean;
  participant: string | null;
}

export interface UseContactTypingOptions {
  /** Habilita/desabilita o subscribe (gating por viewport). Default true. */
  enabled?: boolean;
  /**
   * Permite assinar JIDs `@g.us` (grupos). Default false — listas/preview
   * continuam ignorando grupos para evitar ruído. Ative apenas quando o
   * chat aberto for de grupo.
   */
  allowGroups?: boolean;
}

/**
 * Hook leve read-only para escutar o broadcast `contact_typing` no canal
 * `typing:${remoteJid}`. Usado em listas (ConversationItem,
 * VirtualizedRealtimeList) onde queremos mostrar "digitando…" sem o overhead
 * de presence/track do hook completo `useTypingPresence`.
 *
 * Auto-clear configurável via `VITE_TYPING_AUTO_CLEAR_MS` (default 5000ms).
 * Stop-debounce configurável via `VITE_TYPING_STOP_DEBOUNCE_MS` (default 600ms).
 *
 * Defesa: ignora `@broadcast` sempre. Ignora `@g.us` por padrão; passe
 * `allowGroups=true` para assinar grupos (somente quando o chat aberto é
 * o próprio grupo). Em grupos, o payload inclui `participant` (quem digita).
 *
 * Otimização: passe `enabled=false` para suspender a subscrição (ex.: cards
 * fora do viewport em listas longas).
 *
 * Compat: aceita o segundo argumento como `boolean` (legacy) ou
 * `UseContactTypingOptions`.
 */
export function useContactTyping(
  remoteJid?: string | null,
  enabledOrOptions: boolean | UseContactTypingOptions = true,
): boolean {
  return useContactTypingState(remoteJid, enabledOrOptions).isTyping;
}

/**
 * Versão expandida do hook que retorna `{ isTyping, participant }`.
 * Use em headers de chat de grupo para exibir "<nome> está digitando…".
 */
export function useContactTypingState(
  remoteJid?: string | null,
  enabledOrOptions: boolean | UseContactTypingOptions = true,
): ContactTypingState {
  const opts: UseContactTypingOptions =
    typeof enabledOrOptions === 'boolean' ? { enabled: enabledOrOptions } : enabledOrOptions;
  const enabled = opts.enabled !== false;
  const allowGroups = opts.allowGroups === true;

  const [isTyping, setIsTyping] = useState(false);
  const [participant, setParticipant] = useState<string | null>(null);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !remoteJid) {
      setIsTyping(false);
      setParticipant(null);
      return;
    }
    if (remoteJid.endsWith('@broadcast')) {
      setIsTyping(false);
      setParticipant(null);
      return;
    }
    if (remoteJid.endsWith('@g.us') && !allowGroups) {
      setIsTyping(false);
      setParticipant(null);
      return;
    }

    const clearAutoClear = () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
        clearTimeoutRef.current = null;
      }
    };
    const clearStopDebounce = () => {
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
    };

    const channel = supabase.channel(`typing:${remoteJid}`);

    channel.on('broadcast', { event: 'contact_typing' }, ({ payload }) => {
      const p = payload as { isTyping?: boolean; participant?: string | null } | undefined;
      const typing = p?.isTyping === true;
      const who = p?.participant ?? null;

      if (typing) {
        clearStopDebounce();
        clearAutoClear();
        setIsTyping(true);
        setParticipant(who);

        clearTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
          setParticipant(null);
          clearTimeoutRef.current = null;
        }, TYPING_AUTO_CLEAR_MS);
        return;
      }

      clearStopDebounce();
      stopTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        setParticipant(null);
        stopTimeoutRef.current = null;
        clearAutoClear();
      }, TYPING_STOP_DEBOUNCE_MS);
    });

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        log.warn('Typing channel error for', remoteJid);
      }
    });

    return () => {
      clearAutoClear();
      clearStopDebounce();
      supabase.removeChannel(channel);
    };
  }, [remoteJid, enabled, allowGroups]);

  return { isTyping, participant };
}
