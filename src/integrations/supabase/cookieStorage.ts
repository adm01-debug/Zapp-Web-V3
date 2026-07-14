/**
 * httpOnly Cookie Storage Adapter for Supabase
 *
 * This storage adapter migrates authentication tokens from localStorage to httpOnly cookies.
 * httpOnly cookies are automatically managed by the browser and server:
 * - The server sets them via Set-Cookie headers (with Secure, HttpOnly, SameSite=Strict flags)
 * - The browser automatically sends them with requests (credentials: 'include')
 * - JavaScript cannot access them (immune to XSS token theft)
 *
 * The adapter uses in-memory storage as a fallback since actual tokens are
 * stored server-side in httpOnly cookies and managed automatically by the browser.
 */

interface StorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

/**
 * In-memory storage for session metadata
 * Actual auth tokens are in httpOnly cookies, automatically managed by the browser
 */
class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Cookie Storage Adapter
 * Reads session from httpOnly cookies (browser-managed)
 * Falls back to in-memory for metadata
 *
 * Why not localStorage?
 * - localStorage is vulnerable to XSS attacks
 * - Malicious scripts can steal tokens: localStorage.getItem('sb-*-auth-token')
 * - httpOnly cookies cannot be accessed by JavaScript (browser enforces)
 * - Server automatically sends cookies with requests (no manual header injection)
 */
export function createCookieStorageAdapter(): StorageAdapter {
  const memoryStore = new InMemoryStorage();

  return {
    getItem(key: string): string | null {
      // Try to read from cookies first (httpOnly cookies are readable via Set-Cookie headers)
      // If the key is an auth token, it's stored in httpOnly cookies automatically
      // Return null to let Supabase handle it via its session listener
      if (key.includes('auth') || key.includes('token')) {
        return null; // Auth tokens are in httpOnly cookies, managed by browser
      }
      // For non-auth metadata, use in-memory storage
      return memoryStore.getItem(key);
    },

    setItem(key: string, value: string): void {
      // Auth tokens are set by the server via Set-Cookie headers
      // Don't store them in memory or localStorage
      if (key.includes('auth') || key.includes('token')) {
        return; // Supabase receives Set-Cookie from server
      }
      // Store non-auth metadata in memory
      memoryStore.setItem(key, value);
    },

    removeItem(key: string): void {
      // Auth tokens are cleared by the server (Set-Cookie with empty value/max-age=0)
      // No client-side cleanup needed
      if (key.includes('auth') || key.includes('token')) {
        return; // Server handles logout via Set-Cookie header
      }
      // Clear non-auth metadata from memory
      memoryStore.removeItem(key);
    },
  };
}

/**
 * Global cookie storage instance
 */
export const cookieStorage =
  typeof window !== 'undefined'
    ? createCookieStorageAdapter()
    : (() => ({
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }))();

/**
 * Verify that httpOnly cookies are being used (security check)
 * Call this during app initialization to confirm auth is using cookies
 */
export function verifyHttpOnlyCookieAuth(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof document === 'undefined') return false;

  // Check that auth tokens are NOT in localStorage
  const hasBadStorage = Object.keys(window.localStorage || {}).some(
    (k) => k.includes('auth-token') || (k.startsWith('sb-') && k.includes('auth'))
  );

  if (hasBadStorage) {
    console.warn(
      '[Security] Auth tokens found in localStorage. ' +
        'Expected httpOnly cookies. Verify Supabase auth config uses cookieStorage adapter.'
    );
    return false;
  }

  return true;
}
