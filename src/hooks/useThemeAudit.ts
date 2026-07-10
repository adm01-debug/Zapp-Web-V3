// @ts-nocheck
import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { STORAGE_KEY, DEFAULT_PRESET_ID, PRESETS } from '@/components/settings/theme/presets';
import { getLogger } from '@/lib/logger';

const log = getLogger('useThemeAudit');

export interface AuditResult {
  oledPass: boolean;
  fontPass: boolean;
  colorPass: boolean;
  violations: string[];
}

/**
 * Hook para detecção automática de inconsistências visuais (cores fixas hardcoded)
 * que violam o padrão "Preto OLED puro" (HSL 0 0% 0%).
 * Agora também valida a integridade das fontes (Theme Safeguard).
 */
export const useThemeAudit = () => {
  const { resolvedTheme } = useTheme();
  const [result, setResult] = useState<AuditResult>({
    oledPass: true,
    fontPass: true,
    colorPass: true,
    violations: []
  });

  useEffect(() => {
    // Audit logic
    const runAudit = () => {
      const violations: string[] = [];
      let oledPass = true;
      let fontPass = true;
      let colorPass = true;

      // 1. OLED Audit (only in dark mode)
      if (resolvedTheme === 'dark') {
        const elements = document.querySelectorAll('*');
        elements.forEach((el) => {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundColor;
          
          // Detect common non-OLED dark grays that should be pure black (0,0,0) or vary close
          if (bg === 'rgb(31, 41, 55)' || bg === 'rgb(17, 24, 39)' || bg === 'rgb(9, 9, 11)') {
            oledPass = false;
            violations.push(`[OLED] Background inconsistente (${bg}) em: ${getElementPath(el)}`);
          }
        });
      }

      // 2. Font Safeguard Audit
      const root = document.documentElement;
      const computedFont = getComputedStyle(root).getPropertyValue('--font-sans').trim();
      
      const saved = localStorage.getItem(STORAGE_KEY);
      let presetId = DEFAULT_PRESET_ID;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          presetId = parsed.preset || DEFAULT_PRESET_ID;
        } catch (e) {
          // Corrupted theme preference — fall back to the default preset.
          log.warn('Failed to parse saved theme preference, using default', e);
        }
      }
      
      const preset = PRESETS.find(p => p.id === presetId);
      const shouldHaveInlineFont = !!preset?.font;

      if (!computedFont.includes('Inter') && !shouldHaveInlineFont) {
        fontPass = false;
        violations.push(`[Font] Tipografia desalinhada: --font-sans="${computedFont}" (Esperado: Inter)`);
      }

      // 3. Primary Color Alignment
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
};

function getElementPath(el: Element): string {
  const path = [];
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
