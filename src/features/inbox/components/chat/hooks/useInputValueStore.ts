import { useRef, useSyncExternalStore } from 'react';

/**
 * Store externo minúsculo para o texto do input do chat (Bloco 6, etapas 57–60
 * do plano ChatPanel).
 *
 * Motivação: `inputValue` como useState dentro do useChatPanelHandlers fazia
 * CADA TECLA re-renderizar o ChatPanel inteiro (header, dialogs, CRMAutoSync,
 * barras). Com o valor num store assinado via useSyncExternalStore, apenas
 * quem assina (ChatInputArea) re-renderiza por tecla; escritas vindas de
 * templates/sugestões/slash viram operações imperativas sem custo de render
 * no painel. O textarea permanece CONTROLADO — muda apenas onde o estado mora.
 */
export interface InputValueStore {
  get: () => string;
  set: (next: string) => void;
  subscribe: (listener: () => void) => () => void;
}

/** Cria um store independente (também usado em testes). */
export function createInputValueStore(initial = ''): InputValueStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: string) => {
      if (next === value) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Instancia o store UMA vez no dono do estado (useChatPanelHandlers). */
export function useCreateInputValueStore(): InputValueStore {
  const ref = useRef<InputValueStore | null>(null);
  if (ref.current === null) ref.current = createInputValueStore();
  return ref.current;
}

/**
 * Assina o valor vivo — usar APENAS em componentes que PRECISAM re-renderizar
 * por tecla (hoje: ChatInputArea). Assinar isto no ChatPanel desfaz o ganho.
 */
export function useInputValue(store: InputValueStore): string {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
