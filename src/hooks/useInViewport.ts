import { useEffect, useState, type RefObject } from 'react';

/**
 * Observa se o elemento referenciado está (ou esteve recentemente) dentro
 * da viewport, com `rootMargin` configurável para ativar gating um pouco
 * antes do card aparecer. Útil para otimizações como assinar canais
 * Realtime apenas para itens visíveis numa lista grande.
 *
 * - SSR-safe: retorna `false` quando `IntersectionObserver` não existe.
 * - Sticky opcional (`keepVisibleMs`): mantém `true` por X ms após sair do
 *   viewport, evitando churn em scroll rápido (subscribe/unsubscribe loop).
 */
export interface UseInViewportOptions {
  /** Margem ao redor do root para antecipar a entrada/saída. Default '200px'. */
  rootMargin?: string;
  /** Threshold do IntersectionObserver. Default 0. */
  threshold?: number | number[];
  /** Mantém `true` por X ms após sair do viewport. Default 1500ms. */
  keepVisibleMs?: number;
  /** Desativa o observer (sempre retorna `false`). */
  disabled?: boolean;
}

export function useInViewport(
  ref: RefObject<Element | null>,
  options: UseInViewportOptions = {},
): boolean {
  const {
    rootMargin = '200px',
    threshold = 0,
    keepVisibleMs = 1500,
    disabled = false,
  } = options;

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (disabled) {
      setVisible(false);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    let stickyTimeout: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (stickyTimeout) {
              clearTimeout(stickyTimeout);
              stickyTimeout = null;
            }
            setVisible(true);
          } else if (keepVisibleMs > 0) {
            // Adia o `false` para evitar churn em scroll rápido.
            if (stickyTimeout) clearTimeout(stickyTimeout);
            stickyTimeout = setTimeout(() => {
              setVisible(false);
              stickyTimeout = null;
            }, keepVisibleMs);
          } else {
            setVisible(false);
          }
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(el);
    return () => {
      if (stickyTimeout) clearTimeout(stickyTimeout);
      observer.disconnect();
    };
  }, [ref, rootMargin, threshold, keepVisibleMs, disabled]);

  return visible;
}
