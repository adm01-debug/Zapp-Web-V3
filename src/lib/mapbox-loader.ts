/**
 * Lazily loads mapbox-gl (JS + CSS) on first use.
 *
 * Keeps ~519 KB gz of mapbox-gl out of the initial bundle. The JS and CSS
 * are loaded together in a single dynamic import chain, cached so subsequent
 * consumers reuse the same promise.
 */
let mapboxPromise: Promise<typeof import('mapbox-gl')> | null = null;

export function loadMapbox(): Promise<typeof import('mapbox-gl')> {
  if (!mapboxPromise) {
    mapboxPromise = Promise.all([
      import('mapbox-gl'),
      import('mapbox-gl/dist/mapbox-gl.css'),
    ]).then(([mod]) => mod);
  }
  return mapboxPromise;
}
