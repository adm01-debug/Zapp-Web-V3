/**
 * audioPlaybackBus — registra qual player está em playback ATIVO no chat
 * para permitir atalhos globais (ex: tecla `M` para mute) atuarem sobre ele.
 *
 * Modelo: apenas um player ativo por vez (o último a dar play). Quando esse
 * player pausa/desmonta, ele se desregistra. Atalho global pergunta ao bus
 * "tem player ativo?" e dispara `toggleMute()` via callback registrado.
 *
 * Não usamos eventos do DOM porque o player precisa expor uma API direta
 * (mute/unmute do AudioContext) — eventos genéricos perderiam contexto.
 */

/** Handle registered by an active audio player, allowing global shortcuts to call toggleMute/getVolume directly on it. */
export interface ActivePlayerHandle {
  messageId: string;
  /** Toggle entre volume 0 e o último volume não-zero. Retorna o novo estado. */
  toggleMute: () => { muted: boolean; volume: number };
  /** Volume atual (0..1). */
  getVolume: () => number;
}

let active: ActivePlayerHandle | null = null;
const listeners = new Set<(active: ActivePlayerHandle | null) => void>();

function emit() {
  for (const fn of listeners) {
    try { fn(active); } catch { /* listeners não devem quebrar */ }
  }
}

/** Singleton pub/sub for the currently playing audio player; enables keyboard shortcuts (e.g. M for mute) to target any active player without prop-drilling. */
export const audioPlaybackBus = {
  /**
   * Registra handle como o player ativo. Substitui o anterior — qualquer
   * outro player que dê play "rouba" o foco do atalho.
   */
  setActive(handle: ActivePlayerHandle): void {
    active = handle;
    emit();
  },

  /**
   * Remove o handle se ainda for o ativo. Idempotente. Use em pause/ended/
   * unmount para liberar o foco.
   */
  clearActive(messageId: string): void {
    if (active?.messageId === messageId) {
      active = null;
      emit();
    }
  },

  /** Retorna o handle ativo (ou null). */
  getActive(): ActivePlayerHandle | null {
    return active;
  },

  /**
   * Dispara o toggleMute do player ativo. Retorna `null` se não há player
   * ativo (atalho deve ser ignorado), ou o novo estado se houve toggle.
   */
  toggleMuteActive(): { muted: boolean; volume: number } | null {
    if (!active) return null;
    return active.toggleMute();
  },

  /** Subscribe a mudanças de player ativo (badges, indicadores visuais). */
  subscribe(fn: (active: ActivePlayerHandle | null) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Reset — apenas para testes. */
  _reset(): void {
    active = null;
    listeners.clear();
  },
};
