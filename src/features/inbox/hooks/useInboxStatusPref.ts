/**
 * Preferência local do agente — exibir o rótulo textual do status de
 * entrega/visualização sempre visível embaixo de cada mensagem (em vez
 * de só no tooltip on hover).
 *
 * Persistido em `localStorage` e sincronizado entre componentes via
 * evento custom `inbox-status-label-change` (mesmo padrão usado por
 * `ScreenProtectionToggle`).
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'inbox-status-label-visible';
const EVENT_NAME = 'inbox-status-label-change';

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persists and synchronises the agent's preference to always show message-status labels; stored in localStorage and broadcast via a custom DOM event. */
export function useInboxStatusPref() {
  const [showLabel, setShowLabel] = useState<boolean>(read);

  useEffect(() => {
    const handler = () => setShowLabel(read());
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  const toggle = useCallback(() => {
    const next = !read();
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* storage unavailable — silent */
    }
    setShowLabel(next);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return { showLabel, toggle };
}
