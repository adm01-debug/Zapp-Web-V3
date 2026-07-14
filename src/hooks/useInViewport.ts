import { useEffect, useState, type RefObject } from 'react';

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

/** Detects if an element is in viewport with configurable margin and sticky visibility delay. */
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
