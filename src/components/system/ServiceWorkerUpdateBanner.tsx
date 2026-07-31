import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ZappUpdateDetail {
  current: string;
  remote: string;
}

/**
 * Listens for the `sw-update-available` event dispatched by useServiceWorker
 * when a new bundle is detected. Prompts the user to reload to avoid the
 * "two frontends" symptom (different tabs/devices serving different bundle hashes).
 *
 * Also listens for `zapp-update-required` (dispatched by src/lib/buildVersion.ts)
 * when the app is stuck on an old bundle after reload (persistent mismatch).
 * In that case the reload uses a `_bv` cache-buster to bypass the stale bundle.
 */
export function ServiceWorkerUpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [forced, setForced] = useState(false);
  const [updateDetail, setUpdateDetail] = useState<ZappUpdateDetail | null>(null);

  useEffect(() => {
    const onUpdate = () => setVisible(true);
    document.addEventListener('sw-update-available', onUpdate);

    const onUpdateRequired = (event: Event) => {
      const detail = (event as CustomEvent<ZappUpdateDetail>).detail;
      setUpdateDetail(detail ?? null);
      setForced(true);
      setVisible(true);
    };
    window.addEventListener('zapp-update-required', onUpdateRequired);

    return () => {
      document.removeEventListener('sw-update-available', onUpdate);
      window.removeEventListener('zapp-update-required', onUpdateRequired);
    };
  }, []);

  const handleReload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('_bv', String(Date.now()));
    window.location.replace(url.toString());
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[calc(100%-1rem)] rounded-lg border border-primary/40 bg-card text-card-foreground shadow-lg p-3 flex items-start gap-3"
    >
      <RefreshCw className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {forced ? 'Atualização necessária' : 'Nova versão disponível'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {forced
            ? 'Uma nova versão está disponível mas o app não conseguiu recarregar sozinho.'
            : 'Recarregue para evitar inconsistências entre abas e dispositivos.'}
        </p>
        {forced && updateDetail && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Versão atual: {updateDetail.current} → {updateDetail.remote}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleReload}
            className="gap-1.5 h-7"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recarregar agora
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setVisible(false)}
            className="h-7"
          >
            Depois
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dispensar aviso"
        onClick={() => setVisible(false)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
