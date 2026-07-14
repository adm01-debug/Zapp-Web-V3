import { useCallback, useEffect, useState, useMemo } from 'react';
import { STORAGE_KEY, DEFAULT_PRESET_ID, PRESETS } from '@/components/settings/theme/presets';
import { getLogger } from '@/lib/logger';

const log = getLogger('useThemeAudit');

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

type Sentiment = 'positive' | 'neutral' | 'negative' | string | null | undefined;

export interface UseThemeReturn {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  cycleTheme: () => void;
  isDark: boolean;
  isLight: boolean;
  isSystem: boolean;
}

export interface AmbientColors {
  bgTint: string;
  borderAccent: string;
  className: string;
}

export interface AuditResult {
  oledPass: boolean;
  fontPass: boolean;
  colorPass: boolean;
  violations: string[];
}

interface UseZenModeReturn {
  isZen: boolean;
  toggleZen: () => void;
  exitZen: () => void;
}

type ThemeSnapshot = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THEME MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

const THEME_STORAGE_KEY = 'theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

const getStoredTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
};

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
};

const resolveTheme = (theme: Theme): ResolvedTheme => {
  return theme === 'system' ? getSystemTheme() : theme;
};

let themeState: ThemeSnapshot = {
  theme: getStoredTheme(),
  resolvedTheme: resolveTheme(getStoredTheme()),
};

const listeners = new Set<(snapshot: ThemeSnapshot) => void>();
let transitionTimeout: number | null = null;
let systemListenerAttached = false;

const notify = () => {
  listeners.forEach((listener) => listener(themeState));
};

const applyThemeToDocument = (resolvedTheme: ResolvedTheme, animate = true) => {
  if (typeof window === 'undefined') return;
  const root = window.document.documentElement;
  const body = window.document.body;

  if (animate) {
    root.style.setProperty('--theme-transition', '0.3s');
    body.classList.add('theme-transitioning');
  }

  root.classList.remove('light', 'dark');
  root.classList.add(resolvedTheme);
  root.style.colorScheme = resolvedTheme;

  if (animate) {
    if (transitionTimeout) {
      window.clearTimeout(transitionTimeout);
    }
    transitionTimeout = window.setTimeout(() => {
      root.style.removeProperty('--theme-transition');
      body.classList.remove('theme-transitioning');
      transitionTimeout = null;
    }, 300);
  }
};

const updateThemeState = (nextTheme: Theme, animate = true) => {
  themeState = {
    theme: nextTheme,
    resolvedTheme: resolveTheme(nextTheme),
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  applyThemeToDocument(themeState.resolvedTheme, animate);
  notify();
};

const handleSystemThemeChange = () => {
  if (themeState.theme !== 'system') return;
  themeState = {
    theme: 'system',
    resolvedTheme: getSystemTheme(),
  };
  applyThemeToDocument(themeState.resolvedTheme, false);
  notify();
};

const ensureSystemListener = () => {
  if (typeof window === 'undefined' || systemListenerAttached) return;
  window.matchMedia(MEDIA_QUERY).addEventListener('change', handleSystemThemeChange);
  systemListenerAttached = true;
};

const initializeTheme = () => {
  if (typeof window === 'undefined') return;
  ensureSystemListener();
  themeState = {
    theme: getStoredTheme(),
    resolvedTheme: resolveTheme(getStoredTheme()),
  };
  applyThemeToDocument(themeState.resolvedTheme, false);
};

/** Manages application theme state with persistence and cross-tab synchronization. */
export function useThemeManagement(): UseThemeReturn {
  const [snapshot, setSnapshot] = useState<ThemeSnapshot>(() => {
    if (typeof window !== 'undefined') {
      initializeTheme();
      return themeState;
    }
    return {
      theme: 'system',
      resolvedTheme: 'dark',
    };
  });

  useEffect(() => {
    initializeTheme();
    const listener = (nextSnapshot: ThemeSnapshot) => {
      setSnapshot(nextSnapshot);
    };
    listeners.add(listener);
    listener(themeState);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    document.documentElement.classList.add('theme-transitioning');
    updateThemeState(nextTheme);
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 350);
  }, []);

  const toggleTheme = useCallback(() => {
    updateThemeState(themeState.resolvedTheme === 'dark' ? 'light' : 'dark');
  }, []);

  const cycleTheme = useCallback(() => {
    const nextTheme =
      themeState.theme === 'light'
        ? 'dark'
        : themeState.theme === 'dark'
          ? 'system'
          : 'light';
    updateThemeState(nextTheme);
  }, []);

  return {
    theme: snapshot.theme,
    resolvedTheme: snapshot.resolvedTheme,
    setTheme,
    toggleTheme,
    cycleTheme,
    isDark: snapshot.resolvedTheme === 'dark',
    isLight: snapshot.resolvedTheme === 'light',
    isSystem: snapshot.theme === 'system',
  };
}

/** Component that synchronizes theme state on mount to ensure consistent styling. */
export function ThemeSync() {
  useEffect(() => {
    initializeTheme();
  }, []);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ZEN MODE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

const ZEN_MODE_STORAGE_KEY = 'zen-mode';

/** Manages zen mode state with keyboard escape exit and persistent storage. */
export function useZenModeManagement(): UseZenModeReturn {
  const [isZen, setIsZen] = useState(() => {
    try {
      return localStorage.getItem(ZEN_MODE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleZen = useCallback(() => {
    setIsZen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(ZEN_MODE_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const exitZen = useCallback(() => {
    setIsZen(false);
    try {
      localStorage.setItem(ZEN_MODE_STORAGE_KEY, 'false');
    } catch {}
  }, []);

  useEffect(() => {
    if (!isZen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitZen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isZen, exitZen]);

  return { isZen, toggleZen, exitZen };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// AMBIENT COLOR MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Returns color theme values based on sentiment classification for ambient styling. */
export function useAmbientColorManagement(sentiment: Sentiment): AmbientColors {
  return useMemo(() => {
    switch (sentiment) {
      case 'positive':
        return {
          bgTint: 'hsl(var(--success) / 0.03)',
          borderAccent: 'hsl(var(--success) / 0.15)',
          className: 'ambient-positive',
        };
      case 'negative':
        return {
          bgTint: 'hsl(var(--destructive) / 0.02)',
          borderAccent: 'hsl(var(--destructive) / 0.12)',
          className: 'ambient-negative',
        };
      case 'neutral':
      default:
        return {
          bgTint: 'transparent',
          borderAccent: 'hsl(var(--border))',
          className: 'ambient-neutral',
        };
    }
  }, [sentiment]);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THEME AUDIT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

function getElementPath(el: Element): string {
  const path: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    let name = current.tagName.toLowerCase();
    if (current.id) name += `#${current.id}`;
    if (current.className) name += `.${Array.from(current.classList).join('.')}`;
    path.unshift(name);
    current = current.parentElement;
  }
  return path.join(' > ');
}

/** Audits theme consistency checking OLED backgrounds, font settings, and color variables. */
export function useThemeAuditManagement(): AuditResult {
  const { resolvedTheme } = useThemeManagement();
  const [result, setResult] = useState<AuditResult>({
    oledPass: true,
    fontPass: true,
    colorPass: true,
    violations: [],
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const runAudit = () => {
      const violations: string[] = [];
      let oledPass = true;
      let fontPass = true;
      let colorPass = true;

      if (resolvedTheme === 'dark') {
        const elements = document.querySelectorAll('*');
        elements.forEach((el) => {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundColor;
          if (bg === 'rgb(31, 41, 55)' || bg === 'rgb(17, 24, 39)' || bg === 'rgb(9, 9, 11)') {
            oledPass = false;
            violations.push(`[OLED] Background inconsistente (${bg}) em: ${getElementPath(el)}`);
          }
        });
      }

      const root = document.documentElement;
      const computedFont = getComputedStyle(root).getPropertyValue('--font-sans').trim();
      const saved = localStorage.getItem(STORAGE_KEY);
      let presetId = DEFAULT_PRESET_ID;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          presetId = parsed.preset || DEFAULT_PRESET_ID;
        } catch (e) {
          log.warn('Failed to parse saved theme preference, using default', e);
        }
      }

      const preset = PRESETS.find(p => p.id === presetId);
      const shouldHaveInlineFont = !!preset?.font;

      if (!computedFont.includes('Inter') && !shouldHaveInlineFont) {
        fontPass = false;
        violations.push(`[Font] Tipografia desalinhada: --font-sans="${computedFont}" (Esperado: Inter)`);
      }

      const computedPrimary = getComputedStyle(root).getPropertyValue('--primary').trim();
      if (computedPrimary.includes('undefined')) {
        colorPass = false;
        violations.push(`[Color] Variável --primary está indefinida ou quebrada.`);
      }

      setResult({ oledPass, fontPass, colorPass, violations });

      if (violations.length > 0 && import.meta.env.DEV) {
        log.debug('Theme audit violations', violations);
      }
    };

    const timer = setTimeout(runAudit, 2000);
    return () => clearTimeout(timer);
  }, [resolvedTheme]);

  return result;
}
