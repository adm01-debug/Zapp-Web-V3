import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  PRESETS,
  CSS_VARS_TO_APPLY,
  STORAGE_KEY,
  DEFAULT_PRESET_ID,
  normalizeStoredPresetId,
} from './presets';
import type { ThemePreset, ThemeModeColors } from './presets';
import { useTheme } from '@/hooks/useTheme';

interface ThemeConfig {
  borderRadius?: number;
  cacheMode?: 'light' | 'dark';
  cachePreset?: string;
  cssVarsCache?: Record<string, string>;
  preset?: string;
}

export function useThemePreset() {
  const { resolvedTheme } = useTheme();
  const [activePreset, setActivePreset] = useState<string>(DEFAULT_PRESET_ID);
  const [borderRadius, setBorderRadius] = useState<number>(8);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback((presetId: string, radius: number) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ preset: normalizeStoredPresetId(presetId), borderRadius: radius }),
    );
  }, []);

  const applyPresetColors = useCallback((preset: ThemePreset, mode: 'light' | 'dark') => {
    const colors: ThemeModeColors = mode === 'dark' ? preset.dark : preset.light;
    const root = document.documentElement;
    for (const key of CSS_VARS_TO_APPLY) {
      root.style.setProperty(`--${key}`, colors[key]);
    }
    // Fonte por skin: aplica no token global ou volta ao default
    // (o tokens.css define o fallback em :root).
    if (preset.font) {
      const currentComputed = getComputedStyle(root).getPropertyValue('--font-sans').trim();
      if (currentComputed !== preset.font) {
        root.style.setProperty('--font-sans', preset.font);
        root.style.setProperty('--font-display', preset.font);
      }
    } else {
      // Remove apenas se houver estilo inline, permitindo que o CSS (:root) tome conta
      if (root.style.getPropertyValue('--font-sans')) {
        root.style.removeProperty('--font-sans');
      }
      if (root.style.getPropertyValue('--font-display')) {
        root.style.removeProperty('--font-display');
      }
    }
  }, []);

  const applyBorderRadius = useCallback((radius: number) => {
    document.documentElement.style.setProperty('--radius', `${radius / 16}rem`);
  }, []);

  const applyPresetById = useCallback((presetId: string, notify = true) => {
    const preset = PRESETS.find(p => p.id === presetId);
    if (!preset) return;

    const root = document.documentElement;
    root.classList.add('theme-transitioning');

    applyPresetColors(preset, resolvedTheme);
    setActivePreset(presetId);

    // Skins podem sugerir um border-radius próprio (ex.: Opera GX usa
    // cantos retos). Quando o usuário escolhe explicitamente um skin,
    // aplicamos o radius sugerido — ele continua editável depois pelo
    // controle de Border Radius.
    const nextRadius = preset.borderRadius ?? borderRadius;
    if (preset.borderRadius != null && preset.borderRadius !== borderRadius) {
      setBorderRadius(preset.borderRadius);
      applyBorderRadius(preset.borderRadius);
    }

    if (notify) {
      save(presetId, nextRadius);
      toast.success(`Tema "${preset.name}" aplicado!`);
    }

    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 350);
  }, [applyPresetColors, resolvedTheme, borderRadius, save, applyBorderRadius]);

  // Initialize from localStorage. Color application is intentionally omitted
  // here — the second effect below re-applies colors whenever resolvedTheme or
  // activePreset changes, so it handles both the initial paint and theme toggles.
  // applyBorderRadius and save both have stable [] dep arrays.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: ThemeConfig = JSON.parse(saved);
        const presetId = normalizeStoredPresetId(parsed.preset);
        const radius = parsed.borderRadius ?? 8;

        setActivePreset(presetId);
        setBorderRadius(radius);
        applyBorderRadius(radius);

        if (
          parsed.preset !== presetId ||
          parsed.cssVarsCache ||
          parsed.cacheMode ||
          parsed.cachePreset
        ) {
          save(presetId, radius);
        }
      } catch {
        setActivePreset(DEFAULT_PRESET_ID);
        setBorderRadius(8);
        applyBorderRadius(8);
        save(DEFAULT_PRESET_ID, 8);
      }
    } else {
      setActivePreset(DEFAULT_PRESET_ID);
      setBorderRadius(8);
      applyBorderRadius(8);
      save(DEFAULT_PRESET_ID, 8);
    }
  }, [applyBorderRadius, save]);

  useEffect(() => {
    const preset = PRESETS.find(p => p.id === activePreset);
    if (preset) {
      applyPresetColors(preset, resolvedTheme);
    }
  }, [resolvedTheme, activePreset, applyPresetColors]);

  const handleBorderRadiusChange = useCallback((value: number[]) => {
    const radius = value[0];
    setBorderRadius(radius);
    applyBorderRadius(radius);
    save(activePreset, radius);
  }, [activePreset, applyBorderRadius, save]);

  const resetTheme = useCallback(() => {
    const corporate = PRESETS.find(p => p.id === DEFAULT_PRESET_ID);
    const root = document.documentElement;
    
    if (corporate) {
      applyPresetColors(corporate, resolvedTheme);
    }

    // Explicitly clear any font overrides to let tokens.css take over
    root.style.removeProperty('--font-sans');
    root.style.removeProperty('--font-display');

    setActivePreset(DEFAULT_PRESET_ID);
    setBorderRadius(8);
    root.style.setProperty('--radius', '0.5rem');
    save(DEFAULT_PRESET_ID, 8);
    toast.success('Tema restaurado ao padrão!');
  }, [applyPresetColors, resolvedTheme, save]);

  const exportTheme = useCallback(() => {
    const config: ThemeConfig = { preset: activePreset, borderRadius };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skin-${activePreset}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Tema exportado!');
  }, [activePreset, borderRadius]);

  const importTheme = useCallback((onThemeChange?: (theme: string) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const config = JSON.parse(text);
        if (config.preset) applyPresetById(config.preset);
        if (config.borderRadius != null) {
          setBorderRadius(config.borderRadius);
          applyBorderRadius(config.borderRadius);
        }
        if (config.theme && onThemeChange) onThemeChange(config.theme);
        toast.success('Tema importado!');
      } catch {
        toast.error('Arquivo de tema inválido');
      }
    };
    input.click();
  }, [applyPresetById, applyBorderRadius]);

  return {
    activePreset,
    borderRadius,
    applyPreset: applyPresetById,
    handleBorderRadiusChange,
    resetTheme,
    exportTheme,
    importTheme,
  };
}
