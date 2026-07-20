/**
 * playerStateStore — estado de UI do player de áudio (currentTime, paused,
 * playbackRate) keyed por message id. Vive FORA do React state porque
 * sobrevive a remontagens da bolha (essencial durante reconciliação:
 * a bolha otimista `optimistic:...` é destruída e a canônica `uuid` é
 * recriada — o player normalmente perderia posição).
 *
 * A reconciliação chama `migrate(optimisticId, canonicalId)` na mesma
 * transação em que `setMessages` substitui a bolha. Resultado:
 *   - Áudio que o usuário começou a tocar continua tocando do mesmo ponto.
 *   - Status sending → sent → delivered → read → played é promovido sem
 *     regredir.
 */

/** Playback position and rate for a single audio message, keyed by message id and stored outside React state to survive bubble remounts during reconciliation. */
export interface PlayerState {
  currentTime: number;
  paused: boolean;
  playbackRate: number;
  /** ms do epoch — usado para invalidar entradas antigas. */
  updatedAt: number;
}

const store = new Map<string, PlayerState>();

/** Listeners notificados quando um id é migrado, para forçar re-key no React. */
type Listener = (from: string, to: string) => void;
const listeners = new Set<Listener>();

const TTL_MS = 30 * 60_000; // 30 min — descarta estado órfão de áudios fechados há muito tempo.

function gc(): void {
  const now = Date.now();
  for (const [id, st] of store) {
    if (now - st.updatedAt > TTL_MS) store.delete(id);
  }
}

/** Module-level store for audio player state; persists currentTime/paused/rate across optimistic→canonical reconciliation via the `migrate` method. */
export const playerStateStore = {
  get(id: string): PlayerState | undefined {
    return store.get(id);
  },

  set(id: string, state: Partial<PlayerState>): void {
    const prev = store.get(id);
    const next: PlayerState = {
      currentTime: state.currentTime ?? prev?.currentTime ?? 0,
      paused: state.paused ?? prev?.paused ?? true,
      playbackRate: state.playbackRate ?? prev?.playbackRate ?? 1,
      updatedAt: Date.now(),
    };
    store.set(id, next);
    if (store.size > 200) gc();
  },

  /**
   * Move o estado do `from` (otimista) para o `to` (canônico) atomicamente.
   * Retorna `true` se houve estado migrado, `false` caso contrário.
   * Idempotente: chamar duas vezes é seguro.
   */
  migrate(from: string, to: string): boolean {
    if (from === to) return false;
    const state = store.get(from);
    if (!state) return false;
    store.delete(from);
    // Se o destino já tem estado mais novo, preserva o do destino.
    const existing = store.get(to);
    if (existing && existing.updatedAt > state.updatedAt) return true;
    store.set(to, { ...state, updatedAt: Date.now() });
    for (const l of listeners) {
      try { l(from, to); } catch { /* listener bug não pode quebrar o reconcile */ }
    }
    return true;
  },

  delete(id: string): void {
    store.delete(id);
  },

  /** Para tests. */
  _clear(): void {
    store.clear();
    listeners.clear();
  },

  _size(): number {
    return store.size;
  },

  onMigrate(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
