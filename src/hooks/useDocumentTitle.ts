import { useEffect } from 'react';

const BASE_TITLE = 'WhatsApp Omnichannel';

/** Sets the document title dynamically with automatic restoration on unmount. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;
    return () => { document.title = prev; };
  }, [title]);
}
