import { formatBytesCompact } from '@/lib/formatters';
/**
 * Limites de PTT (Push-to-Talk) compatíveis com WhatsApp / Evolution API.
 *
 * Estes valores são usados em DOIS pontos:
 *  1. `useAudioRecorder` — corta a gravação automaticamente ao atingir
 *     `MAX_PTT_DURATION_SEC`.
 *  2. `useRealtimeInbox.handleSendAudio` — bloqueia upload e envio caso o
 *     blob exceda tamanho/duração antes de subir para o bucket.
 */

/** Maximum PTT duration in seconds enforced by WhatsApp/Evolution API. */
export const MAX_PTT_DURATION_SEC = 16 * 60; // 16 min — limite WhatsApp
/** Maximum PTT audio file size in bytes enforced by WhatsApp/Evolution API. */
export const MAX_PTT_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB
/** Minimum PTT duration in seconds — below this, audio is treated as accidental tap. */
export const MIN_PTT_DURATION_SEC = 0.5; // < 0.5 s = áudio "vazio" (toque acidental)

/** Result of a PTT blob validation check before upload. */
export interface PttValidationResult {
  ok: boolean;
  /** Mensagem amigável pronta para `toast.error(...)`. Sempre presente quando `ok=false`. */
  message?: string;
  /** Duração medida em segundos (quando foi possível detectar). */
  durationSec?: number;
}

/** Formats a duration in seconds as a human-readable string in the form `Xm Ys` or `Ys`. */
function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Lê os metadados do blob para descobrir a duração real do áudio.
 * Retorna `undefined` quando o navegador não conseguir decodificar (ex.: codec).
 */
export function probeAudioDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    /** Removes event listeners and revokes the object URL to prevent memory leaks. */
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
      URL.revokeObjectURL(url);
    };

    /** Resolves with the detected audio duration when metadata is available, or undefined if the value is invalid. */
    const onLoaded = () => {
      const d = audio.duration;
      cleanup();
      resolve(isFinite(d) && !isNaN(d) && d > 0 ? d : undefined);
    };
    /** Resolves with undefined when the browser fails to decode the audio element. */
    const onError = () => {
      cleanup();
      resolve(undefined);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
    audio.src = url;

    // Safety net: alguns codecs travam o `loadedmetadata` em Chromium.
    setTimeout(() => {
      cleanup();
      resolve(undefined);
    }, 4000);
  });
}

/**
 * Valida tamanho e duração de um blob de PTT antes do upload.
 * Não faz upload — apenas inspeciona.
 *
 * Estratégia: tamanho é checado primeiro (síncrono e gratuito); depois
 * tentamos extrair a duração via `<audio>` para reforçar o limite de 16 min.
 */
export async function validatePttBlob(
  blob: Blob,
  /** Override opcional para testes ou contas com limites menores. */
  limits: { maxBytes?: number; maxDurationSec?: number; minDurationSec?: number } = {}
): Promise<PttValidationResult> {
  const maxBytes = limits.maxBytes ?? MAX_PTT_SIZE_BYTES;
  const maxDuration = limits.maxDurationSec ?? MAX_PTT_DURATION_SEC;
  const minDuration = limits.minDurationSec ?? MIN_PTT_DURATION_SEC;

  if (!blob || blob.size === 0) {
    return { ok: false, message: 'Áudio vazio. Tente gravar novamente.' };
  }

  if (blob.size > maxBytes) {
    return {
      ok: false,
      message: `Áudio muito grande (${formatBytesCompact(blob.size)}). Limite: ${formatBytesCompact(maxBytes)}.`,
    };
  }

  const durationSec = await probeAudioDuration(blob);

  if (durationSec !== undefined) {
    if (durationSec < minDuration) {
      return {
        ok: false,
        durationSec,
        message: 'Áudio muito curto. Mantenha o botão pressionado para gravar.',
      };
    }
    if (durationSec > maxDuration) {
      return {
        ok: false,
        durationSec,
        message: `Áudio muito longo (${formatSeconds(durationSec)}). Limite: ${formatSeconds(maxDuration)}.`,
      };
    }
  }

  return { ok: true, durationSec };
}
