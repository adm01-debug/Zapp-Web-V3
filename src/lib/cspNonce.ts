/**
 * CSP Nonce Helper
 *
 * Content Security Policy nonces para scripts inline.
 * Previne XSS via scripts não autorizados.
 *
 * Como funciona:
 * 1. Servidor gera nonce único por request
 * 2. CSP header inclui: script-src 'nonce-{value}' 'self'
 * 3. Scripts inline precisam ter: <script nonce="{value}">
 *
 * Como gerar nonce (server-side, ex: nginx):
 *   add_header Content-Security-Policy "script-src 'nonce-$request_id' 'self'" always;
 *
 * No client, obtemos via meta tag ou header.
 */

let cachedNonce: string | null = null;

/**
 * Get current CSP nonce (from meta tag or server).
 */
export function getCSPNonce(): string | null {
  if (cachedNonce) return cachedNonce;

  if (typeof document === 'undefined') return null;

  // Check meta tag
  const meta = document.querySelector('meta[name="csp-nonce"]');
  if (meta) {
    cachedNonce = meta.getAttribute('content');
    return cachedNonce;
  }

  // Check header (from server-side rendering)
  // In production, this would be set by the server
  return null;
}

/**
 * Generate a new nonce (for use in client-side scripts).
 *
 * NOT recommended for production — nonces should come from server.
 * Use only in development or for testing.
 */
export function generateCSPNonce(): string {
  const arr = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return btoa(String.fromCharCode(...arr));
}

/**
 * Inject nonce into a script tag dynamically.
 */
export function applyNonceToScript(script: HTMLScriptElement): void {
  const nonce = getCSPNonce() || generateCSPNonce();
  script.setAttribute('nonce', nonce);
}

/**
 * Component wrapper that adds nonce to all inline scripts.
 */
export function withCSPNonce<T extends HTMLElement>(element: T): T {
  const nonce = getCSPNonce();
  if (!nonce) return element;

  // Find all script tags in element
  const scripts = element.querySelectorAll('script');
  scripts.forEach((script) => {
    script.setAttribute('nonce', nonce);
  });

  return element;
}

/**
 * Build CSP header value with nonce.
 */
export function buildCSPHeader(options: {
  nonce?: string;
  isDev?: boolean;
}): string {
  const { nonce, isDev = false } = options;

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      ...(nonce ? [`'nonce-${nonce}'`] : []),
      ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'", // TailwindCSS uses inline styles
    ],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': [
      "'self'",
      'https://*.supabase.co',
      'wss://*.supabase.co',
      ...(isDev ? ['ws://localhost:*'] : []),
    ],
    'media-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}
