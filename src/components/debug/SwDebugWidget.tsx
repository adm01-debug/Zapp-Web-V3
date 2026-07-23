import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bug, RefreshCw, X } from 'lucide-react';

/**
 * SW Debug Widget — floating panel that surfaces the active Service Worker
 * version/signature and the current CacheStorage keys, so the kill-switch
 * (no Workbox, push-only /sw.js) can be confirmed at a glance.
 *
 * Activation (opt-in — never rendered by default):
 *   - URL param `?debug=sw`
 *   - localStorage flag `zapp:debug:sw` = '1'
 *   - Body attribute `data-debug-sw` (set by devtools/E2E)
 *
 * Reads the SW build id stamped by `stampSwVersionPlugin` (banner line
 * `ZAPP_SW_BUILD_ID=<ts>`) plus a workbox signature scan on the served
 * `/sw.js` file, so a stale precache SW is obvious.
 */

type SwSnapshot = {
  scriptUrl: string | null;
  scope: string | null;
  state: string;
  buildId: string | null;
  isWorkbox: boolean;
  fetchedAt: number;
};

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('debug') === 'sw') return true;
    if (localStorage.getItem('zapp:debug:sw') === '1') return true;
    if (document.body?.dataset?.debugSw === '1') return true;
  } catch {
    /* noop */
  }
  return false;
}

async function readSwSnapshot(): Promise<SwSnapshot> {
  const snapshot: SwSnapshot = {
    scriptUrl: null,
    scope: null,
    state: 'unsupported',
    buildId: null,
    isWorkbox: false,
    fetchedAt: Date.now(),
  };
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      const reg = regs[0];
      const worker = reg?.active ?? reg?.waiting ?? reg?.installing ?? null;
      snapshot.scriptUrl = worker?.scriptURL ?? null;
      snapshot.scope = reg?.scope ?? null;
      snapshot.state = worker?.state ?? (reg ? 'registered' : 'none');
    } catch {
      snapshot.state = 'error';
    }
  }
  // Fingerprint the served /sw.js: build id banner + workbox signature.
  try {
    const res = await fetch(`/sw.js?ts=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (res.ok) {
      const body = await res.text();
      const m = body.match(/ZAPP_SW_BUILD_ID=(\S+)/);
      if (m) snapshot.buildId = m[1];
      snapshot.isWorkbox =
        /workbox/i.test(body) ||
        /precacheAndRoute|__WB_MANIFEST|workbox-precaching/.test(body);
    }
  } catch {
    /* offline / SW not served */
  }
  return snapshot;
}

export function SwDebugWidget() {
  const [enabled, setEnabled] = useState<boolean>(() => isEnabled());
  const [open, setOpen] = useState<boolean>(true);
  const [snap, setSnap] = useState<SwSnapshot | null>(null);
  const [caches_, setCaches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [s, keys] = await Promise.all([
        readSwSnapshot(),
        typeof caches !== 'undefined'
          ? caches.keys().catch(() => [] as string[])
          : Promise.resolve([] as string[]),
      ]);
      setSnap(s);
      setCaches(keys);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  if (!enabled) return null;

  const hasWorkboxCache = caches_.some((k) => /workbox/i.test(k));
  const killSwitchOk =
    snap !== null &&
    !snap.isWorkbox &&
    !hasWorkboxCache &&
    (!snap.scriptUrl || snap.scriptUrl.endsWith('/sw.js'));

  return (
    <div
      role="complementary"
      aria-label="Diagnóstico do Service Worker"
      className="fixed bottom-4 right-4 z-[9999] w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background/95 p-3 text-xs shadow-lg backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Bug className="h-3.5 w-3.5" />
          SW Debug
          <span
            className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              killSwitchOk
                ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                : 'bg-red-500/15 text-red-700 dark:text-red-400'
            }`}
          >
            {killSwitchOk ? 'kill-switch OK' : 'atenção'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={open ? 'Recolher' : 'Expandir'}
        >
          {open ? <X className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
            <dt className="font-medium text-foreground">Build</dt>
            <dd className="truncate font-mono">{snap?.buildId ?? '—'}</dd>

            <dt className="font-medium text-foreground">Estado</dt>
            <dd className="font-mono">{snap?.state ?? '…'}</dd>

            <dt className="font-medium text-foreground">Script</dt>
            <dd className="truncate font-mono text-[10px]">
              {snap?.scriptUrl ?? '—'}
            </dd>

            <dt className="font-medium text-foreground">Scope</dt>
            <dd className="truncate font-mono text-[10px]">{snap?.scope ?? '—'}</dd>

            <dt className="font-medium text-foreground">Workbox no sw.js</dt>
            <dd
              className={`font-mono ${snap?.isWorkbox ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}
            >
              {snap ? (snap.isWorkbox ? 'detectado' : 'não') : '…'}
            </dd>

            <dt className="font-medium text-foreground">Caches ({caches_.length})</dt>
            <dd
              className={`font-mono break-all ${
                hasWorkboxCache ? 'text-red-500' : ''
              }`}
            >
              {caches_.length === 0 ? 'nenhuma' : caches_.join(', ')}
            </dd>
          </dl>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Atualizar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker
                      .getRegistrations()
                      .catch(() => []);
                    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
                  }
                  if (typeof caches !== 'undefined') {
                    const keys = await caches.keys().catch(() => [] as string[]);
                    await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
                  }
                  await refresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Purgar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                try {
                  localStorage.removeItem('zapp:debug:sw');
                } catch {
                  /* noop */
                }
                setEnabled(false);
              }}
            >
              Ocultar
            </Button>
          </div>

          <p className="mt-2 text-[10px] opacity-70">
            Ativar em qualquer página com <code>?debug=sw</code> ou{' '}
            <code>localStorage.setItem('zapp:debug:sw','1')</code>.
          </p>
        </>
      )}
    </div>
  );
}

export default SwDebugWidget;
