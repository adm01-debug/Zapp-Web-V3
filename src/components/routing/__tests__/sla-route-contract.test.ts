import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Contrato E67.7 — rota SLA ÚNICA.
 *
 * A navegação canônica do app é view-based (AppShell → ViewRouter), com
 * deep-link via `?view=<id>` (useIndexNavigation). A rota URL `/sla`
 * (AppRoutes) era a duplicata legada (pages/SLADashboard com Sidebar própria).
 * Decisão (67.2): manter ViewRouter `sla` como canônica; REMOVER `/sla` de
 * AppRoutes; componentes dentro do shell navegam via evento `navigate-view`
 * (padrão do repo: DegradedQuickActions, QrAttemptsPanel, webhookEventsDeepLink).
 * Deep-links de página standalone (ex.: `/sla/history`) permanecem em AppRoutes.
 */

// Z4 (E67 residue): `new URL(rel, import.meta.url)` quebra no Windows
// ("The URL must be of scheme file") — usar fileURLToPath + resolve
// (padrão do repo: useChatInputLogic.memory.test.ts).
const testDir = dirname(fileURLToPath(import.meta.url));

const appRoutes = readFileSync(resolve(testDir, '../../routing/AppRoutes.tsx'), 'utf8');
const viewRouter = readFileSync(resolve(testDir, '../../../pages/ViewRouter.tsx'), 'utf8');
const queuesView = readFileSync(resolve(testDir, '../../../components/queues/QueuesView.tsx'), 'utf8');
const slaDashboard = readFileSync(
  resolve(testDir, '../../../components/queues/SLADashboard.tsx'),
  'utf8'
);

describe('E67.7 — rota SLA única (canônica = view-based)', () => {
  it('AppRoutes NÃO registra mais path="/sla" nem importa pages/SLADashboard', () => {
    expect(appRoutes).not.toMatch(/path="\/sla"/);
    expect(appRoutes).not.toContain("import('@/pages/SLADashboard')");
  });

  it('ViewRouter mantém a rota canônica sla → SLADashboardView', () => {
    expect(viewRouter).toMatch(/sla: Views\.SLADashboardView/);
  });

  it('QueuesView navega para a view canônica via navigate-view (não URL /sla)', () => {
    expect(queuesView).toContain("detail: 'sla'");
    expect(queuesView).not.toContain("navigate('/sla')");
  });

  it('SLADashboard mantém deep-link de página /sla/history', () => {
    expect(slaDashboard).toContain("navigate('/sla/history')");
  });
});
