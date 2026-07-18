import { useEffect } from 'react';
import {
  PRESETS,
  CSS_VARS_TO_APPLY,
  STORAGE_KEY,
  DEFAULT_PRESET_ID,
  normalizeStoredPresetId,
} from '@/components/settings/theme/presets';
import type { ThemeModeColors } from '@/components/settings/theme/presets';
import { useTheme } from '@/hooks/useTheme';

import { getLogger } from '@/lib/logger';
const log = getLogger('ThemeInitializer');

type ThemeDebugInfo = {
  presetId: string;
  presetName: string;
  hasPresetFont: boolean;
  fontOrigin: string;
  activeFont: string;
  mode: string;
  timestamp: string;
};

type StoredThemeConfig = {
  borderRadius?: number;
  cacheMode?: 'light' | 'dark';
  cachePreset?: string;
  cssVarsCache?: Record<string, string>;
  preset?: string;
};

/**
 * Global theme initializer — must be mounted at the app root.
 * Restores saved skin (preset + border-radius) on every page load
 * and re-applies when light/dark mode changes.
 * Also caches computed CSS vars in localStorage for the inline
 * flash-prevention script in index.html.
 */
export function ThemeInitializer() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    let presetId = DEFAULT_PRESET_ID;
    let radius = 8;
    let storedConfig: StoredThemeConfig = {};

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as StoredThemeConfig;
        storedConfig = parsed;
        presetId = normalizeStoredPresetId(parsed.preset);
        if (parsed.borderRadius != null) radius = parsed.borderRadius;
      } catch {
        storedConfig = {};
      }
    }

    const preset =
      PRESETS.find((p) => p.id === presetId) || PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
    if (preset) {
      const colors: ThemeModeColors = resolvedTheme === 'dark' ? preset.dark : preset.light;
      const root = document.documentElement;
      const cssVarsCache: Record<string, string> = {};

      // If we are on the DEFAULT preset, we skip forcing core colors that should come from tokens.css
      // unless we are in dark mode (where we need to ensure the OLED black wins).
      const isDefaultPreset = presetId === DEFAULT_PRESET_ID;

      for (const key of CSS_VARS_TO_APPLY) {
        const value = colors[key];

        // Only apply inline if it's not the default preset OR if we are in dark mode
        // This allows tokens.css to be the source of truth for the default Light theme.
        if (!isDefaultPreset || resolvedTheme === 'dark') {
          root.style.setProperty(`--${key}`, value);
        } else {
          // Clean up any previously set inline styles when returning to default light theme
          root.style.removeProperty(`--${key}`);
        }
        cssVarsCache[key] = value;
      }

      // Font Handling: Standardize on "Inter" if no specific font is provided by the preset
      const targetFont = preset.font || '"Inter", sans-serif';
      root.style.setProperty('--font-sans', targetFont);
      root.style.setProperty('--font-display', targetFont);

      // Debug registry for the ThemeDebugTooltip
      (window as Window & { __THEME_DEBUG__?: ThemeDebugInfo }).__THEME_DEBUG__ = {
        presetId: preset.id,
        presetName: preset.name,
        hasPresetFont: !!preset.font,
        fontOrigin: preset.font ? 'Preset Override' : 'CSS tokens.css',
        activeFont: getComputedStyle(root).getPropertyValue('--font-sans').trim(),
        mode: resolvedTheme,
        timestamp: new Date().toISOString(),
      };

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...storedConfig,
            borderRadius: radius,
            cacheMode: resolvedTheme,
            cachePreset: presetId,
            cssVarsCache,
            presetFont: preset.font ?? null,
            preset: presetId,
          })
        );
      } catch (err) {
        log.error('Unexpected error in ThemeInitializer:', err);
      }
    }

    document.documentElement.style.setProperty('--radius', `${radius / 16}rem`);
  }, [resolvedTheme]);

  return null;
}
