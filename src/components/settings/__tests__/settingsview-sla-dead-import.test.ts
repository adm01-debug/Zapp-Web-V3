import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Z4 (resíduo E67.3): SettingsView NÃO pode mais importar SLASettings.
 *
 * E67 removeu a aba SLA de SettingsView (dono único = SLADashboard com CRUD
 * de sla_configurations; a seção SLASettings escrevia thresholds write-only
 * em user_settings que nenhum consumidor lia). O import ficou morto →
 * erro de lint `@typescript-eslint/no-unused-vars` (SettingsView.tsx:52).
 *
 * RED esperado (Z4): o import `SLASettings` ainda existe no fonte.
 * GREEN: import removido (o componente SLASettings permanece vivo para
 * ConversationContextMenu — só o import em SettingsView é resíduo).
 */
const testDir = dirname(fileURLToPath(import.meta.url));

const settingsViewSource = readFileSync(
  resolve(testDir, '../SettingsView.tsx'),
  'utf8'
);

describe('Z4 — SettingsView sem import morto de SLASettings (resíduo E67)', () => {
  it('não importa SLASettings', () => {
    expect(settingsViewSource).not.toMatch(
      /import\s*\{[^}]*\bSLASettings\b[^}]*\}\s*from\s*['"]@\/components\/settings\/SLASettings['"]/
    );
    expect(settingsViewSource).not.toContain('<SLASettings');
  });
});
