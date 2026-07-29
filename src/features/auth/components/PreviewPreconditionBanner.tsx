import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PUBLISHED_URL = import.meta.env.VITE_PUBLISHED_URL || window.location.origin;

function isPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  // Lovable preview iframes live under *.lovable.app and *.lovableproject.com.
  // The custom domain (zappweb.app.br) and published URL stay clean.
  return /(^|\.)lovable\.app$/.test(host) || /(^|\.)lovableproject\.com$/.test(host);
}

/**
 * Discreet banner shown ONLY in the Lovable preview iframe when the
 * sandbox proxy intercepts a request and surfaces an HTTP 412 / "Failed
 * to fetch". Hidden in production. Auto-dismisses after a successful retry.
 */
export function PreviewPreconditionBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isPreviewHost()) return;

    const onPrecondition = () => {
      if (!dismissed) setVisible(true);
    };
    const onRecovered = () => setVisible(false);

    document.addEventListener('preview-precondition-error', onPrecondition);
    document.addEventListener('preview-precondition-recovered', onRecovered);

    return () => {
      document.removeEventListener('preview-precondition-error', onPrecondition);
      document.removeEventListener('preview-precondition-recovered', onRecovered);
    };
  }, [dismissed]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] max-w-xl w-[calc(100%-1rem)] rounded-lg border border-warning/40 bg-foreground shadow-none p-3 flex items-start gap-3"
    >
      <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          Preview instável
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          O proxy do iframe de preview bloqueou uma requisição (HTTP 412). Recarregue ou abra a versão publicada para continuar.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
            className="gap-1.5 h-7"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recarregar
          </Button>
          <Button
            size="sm"
            variant="default"
            asChild
            className="gap-1.5 h-7"
          >
            <a href={PUBLISHED_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
              Versão publicada
            </a>
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dispensar aviso"
        onClick={() => {
          setDismissed(true);
          setVisible(false);
        }}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
