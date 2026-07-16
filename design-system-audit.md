
# Design System Audit Report
Generated on: 7/16/2026, 3:23:58 PM

Total violations found: 143

| File | Line | Type | Content |
|------|------|------|---------|
| src/App.css | 15 | Hardcoded Hex Color | `filter: drop-shadow(0 0 2em #646cffaa);` |
| src/App.css | 18 | Hardcoded Hex Color | `filter: drop-shadow(0 0 2em #61dafbaa);` |
| src/App.css | 41 | Hardcoded Hex Color | `color: #888;` |
| src/components/ThemeInitializer.tsx | 76 | Hardcoded Font Family | `root.style.setProperty('--font-sans', targetFont);` |
| src/components/ThemeInitializer.tsx | 85 | Hardcoded Font Family | `activeFont: getComputedStyle(root).getPropertyValu...` |
| src/components/catalog/__tests__/sendProductUtils.test.ts | 102 | Hardcoded Hex Color | `const v = makeVariant({ color_name: 'Vermelho', co...` |
| src/components/catalog/__tests__/sendProductUtils.test.ts | 106 | Hardcoded Hex Color | `expect(groups[0].colorHex).toBe('#FF0000');` |
| src/components/catalog/__tests__/sendProductUtils.test.ts | 256 | Hardcoded Hex Color | `const variant: VariantGroup = { colorName: 'Azul M...` |
| src/components/catalog/__tests__/sendProductUtils.test.ts | 303 | Hardcoded Hex Color | `const variant: VariantGroup = { colorName: 'Verde'...` |
| src/components/connections/ConnectionAuditDialog.tsx | 158 | Hardcoded Font Family | `<pre className="overflow-x-auto whitespace-pre-wra...` |
| src/components/connections/DegradedQuickActions.tsx | 136 | Hardcoded Font Family | `className={cn('h-4 gap-1 px-1.5 font-mono text-[10...` |
| src/components/connections/InstanceSettingsDialog.tsx | 441 | Hardcoded Font Family | `<p className="truncate font-mono text-destructive"...` |
| src/components/connections/QrCodeDialog.tsx | 189 | Hardcoded Font Family | `<pre className="max-h-40 overflow-x-auto rounded b...` |
| src/components/connections/bridge/BridgeInfoRow.tsx | 11 | Hardcoded Font Family | `<div className={`text-sm text-foreground break-all...` |
| src/components/dashboard/ConversationHeatmap.tsx | 67 | Hardcoded Hex Color | `colorScale: ['#f0fdf4', '#86efac', '#22c55e', '#15...` |
| src/components/dashboard/ConversationHeatmap.tsx | 73 | Hardcoded Hex Color | `colorScale: ['#fef9c3', '#fde047', '#facc15', '#ea...` |
| src/components/dashboard/ConversationHeatmap.tsx | 79 | Hardcoded Hex Color | `colorScale: ['#fef2f2', '#fecaca', '#f87171', '#ef...` |
| src/components/debug/BuildValidationOverlay.tsx | 64 | Hardcoded Font Family | `<div className="text-[10px] text-destructive bg-de...` |
| src/components/debug/ThemeDebugger.tsx | 35 | Hardcoded Font Family | `'--font-sans',` |
| src/components/docs/FontUsageGuide.tsx | 26 | Hardcoded Font Family | `<p><strong>Herança:</strong> É a fonte padrão do s...` |
| src/components/docs/FontUsageGuide.tsx | 56 | Hardcoded Font Family | `<p className="font-sans text-destructive">Redundan...` |
| src/components/docs/FontUsageGuide.tsx | 57 | Hardcoded Font Family | `<code className="text-xs">&lt;p className="font-sa...` |
| src/components/docs/FontUsageGuide.tsx | 66 | Hardcoded Font Family | `<p className="font-mono text-destructive">Texto co...` |
| src/components/docs/FontUsageGuide.tsx | 67 | Hardcoded Font Family | `<code className="text-xs">&lt;span className="font...` |
| src/components/docs/FontUsageGuide.tsx | 77 | Hardcoded Hex Color | `<Badge variant="outline">ID: #45829</Badge>` |
| src/components/docs/FontUsageGuide.tsx | 81 | Hardcoded Hex Color | `<Badge variant="outline" className="font-mono text...` |
| src/components/docs/FontUsageGuide.tsx | 81 | Hardcoded Font Family | `<Badge variant="outline" className="font-mono text...` |
| src/components/docs/FontUsageGuide.tsx | 91 | Hardcoded Font Family | `<span className="text-2xl font-bold font-mono">12....` |
| src/components/docs/FontUsageGuide.tsx | 101 | Hardcoded Font Family | `O build do projeto falhará no CI se novas ocorrênc...` |
| src/components/docs/FontUsageGuide.tsx | 101 | Hardcoded Font Family | `O build do projeto falhará no CI se novas ocorrênc...` |
| src/components/docs/TypographyGuide.tsx | 32 | Hardcoded Font Family | `<li>Corpo de texto: Usa <code>--font-sans</code></...` |
| src/components/queues/CreateQueueDialog.tsx | 21 | Hardcoded Hex Color | `'#3B82F6', // blue` |
| src/components/queues/CreateQueueDialog.tsx | 22 | Hardcoded Hex Color | `'#10B981', // green` |
| src/components/queues/CreateQueueDialog.tsx | 23 | Hardcoded Hex Color | `'#F59E0B', // amber` |
| src/components/queues/CreateQueueDialog.tsx | 24 | Hardcoded Hex Color | `'#EF4444', // red` |
| src/components/queues/CreateQueueDialog.tsx | 25 | Hardcoded Hex Color | `'#8B5CF6', // purple` |
| src/components/queues/CreateQueueDialog.tsx | 26 | Hardcoded Hex Color | `'#EC4899', // pink` |
| src/components/queues/CreateQueueDialog.tsx | 27 | Hardcoded Hex Color | `'#06B6D4', // cyan` |
| src/components/queues/CreateQueueDialog.tsx | 28 | Hardcoded Hex Color | `'#84CC16', // lime` |
| src/components/settings/theme/useThemePreset.ts | 42 | Hardcoded Font Family | `const currentComputed = getComputedStyle(root).get...` |
| src/components/settings/theme/useThemePreset.ts | 44 | Hardcoded Font Family | `root.style.setProperty('--font-sans', preset.font)...` |
| src/components/settings/theme/useThemePreset.ts | 49 | Hardcoded Font Family | `if (root.style.getPropertyValue('--font-sans')) {` |
| src/components/settings/theme/useThemePreset.ts | 50 | Hardcoded Font Family | `root.style.removeProperty('--font-sans');` |
| src/components/settings/theme/useThemePreset.ts | 152 | Hardcoded Font Family | `root.style.removeProperty('--font-sans');` |
| src/components/tags/TagsView.tsx | 38 | Hardcoded Hex Color | `'#ef4444', // red` |
| src/components/tags/TagsView.tsx | 39 | Hardcoded Hex Color | `'#f97316', // orange` |
| src/components/tags/TagsView.tsx | 40 | Hardcoded Hex Color | `'#eab308', // yellow` |
| src/components/tags/TagsView.tsx | 41 | Hardcoded Hex Color | `'#22c55e', // green` |
| src/components/tags/TagsView.tsx | 42 | Hardcoded Hex Color | `'#06b6d4', // cyan` |
| src/components/tags/TagsView.tsx | 43 | Hardcoded Hex Color | `'#3b82f6', // blue` |
| src/components/tags/TagsView.tsx | 44 | Hardcoded Hex Color | `'#8b5cf6', // violet` |
| src/components/tags/TagsView.tsx | 45 | Hardcoded Hex Color | `'#ec4899', // pink` |
| src/components/tags/TagsView.tsx | 46 | Hardcoded Hex Color | `'#6b7280', // gray` |
| src/components/talkx/TalkXAnalytics.tsx | 75 | Hardcoded Hex Color | `'#f59e0b',` |
| src/components/talkx/TalkXAnalytics.tsx | 76 | Hardcoded Hex Color | `'#6366f1',` |
| src/components/ui/chart.tsx | 52 | Hardcoded Hex Color | `"flex aspect-video justify-center text-xs [&_.rech...` |
| src/components/ui/micro-interactions/buttons.tsx | 255 | Hardcoded Hex Color | `mask: 'linear-gradient(#fff 0 0) content-box, line...` |
| src/components/ui/stories/Button.stories.tsx | 64 | Literal Tailwind Color (bg-slate-900) | `<div className="flex flex-wrap gap-4 rounded-xl bg...` |
| src/components/ui/stories/Card.stories.tsx | 76 | Literal Tailwind Color (bg-slate-950) | `<Card variant="neon" className="bg-slate-950">` |
| src/features/admin/components/AIUsageDashboard.tsx | 197 | Hardcoded Hex Color | `<Cell key={entry.name} fill={FUNCTION_COLORS[entry...` |
| src/features/admin/components/AIUsageDashboard.tsx | 211 | Hardcoded Hex Color | `style={{ backgroundColor: FUNCTION_COLORS[f.name] ...` |
| src/features/admin/components/InboxScopeConfig.tsx | 348 | Hardcoded Font Family | `<div className="mt-1 inline-block rounded bg-muted...` |
| src/features/admin/components/RateLimitLogDetails.tsx | 86 | Hardcoded Font Family | `<div className={mono ? 'font-mono text-sm break-al...` |
| src/features/admin/components/RateLimitLogDetails.tsx | 216 | Hardcoded Font Family | `<p className="font-mono">{ua.browser}</p>` |
| src/features/admin/components/RateLimitLogDetails.tsx | 220 | Hardcoded Font Family | `<p className="font-mono">{ua.os}</p>` |
| src/features/admin/components/RateLimitLogDetails.tsx | 224 | Hardcoded Font Family | `<p className="font-mono">{ua.device}</p>` |
| src/features/admin/components/RateLimitLogDetails.tsx | 229 | Hardcoded Font Family | `<p className="font-mono text-xs break-all">{log.us...` |
| src/features/admin/hooks/useAdminManagement.ts | 495 | Hardcoded Hex Color | `p_color: editing.color ?? '#3B82F6',` |
| src/features/inbox/components/__tests__/linkPreviewUtils.test.ts | 237 | Hardcoded Hex Color | `it('escapes single quotes to &#039;', () => {` |
| src/features/inbox/components/__tests__/linkPreviewUtils.test.ts | 238 | Hardcoded Hex Color | `expect(escapeHtml("it's")).toBe('it&#039;s');` |
| src/features/inbox/components/linkPreviewUtils.ts | 60 | Hardcoded Hex Color | `.replace(/'/g, '&#039;');` |
| src/features/inbox/components/template-utils.ts | 17 | Hardcoded Hex Color | `{ key: 'protocolo', label: 'Protocolo', icon: Hash...` |
| src/hooks/__tests__/useDashboardData.test.tsx | 26 | Hardcoded Hex Color | `data: [{ id: 'q1', name: 'Support', color: '#3B82F...` |
| src/hooks/__tests__/useExternalCatalog.test.ts | 92 | Hardcoded Hex Color | `color_hex: '#4169E1',` |
| src/hooks/__tests__/useExternalCatalog.test.ts | 603 | Hardcoded Hex Color | `expect(variant.color_hex).toBe('#4169E1');` |
| src/hooks/__tests__/useExternalCatalog.test.ts | 827 | Hardcoded Hex Color | `color_hex: '#4169E1',` |
| src/hooks/__tests__/useExternalCatalog.test.ts | 833 | Hardcoded Hex Color | `color_hex: '#EF941B',` |
| src/hooks/__tests__/useExternalCatalog.test.ts | 849 | Hardcoded Hex Color | `expect(fetched!.variants![0].color_hex).toBe('#416...` |
| src/hooks/__tests__/useQueuesComparison.test.tsx | 30 | Hardcoded Hex Color | `{ id: 'q1', name: 'Suporte', color: '#3B82F6' },` |
| src/hooks/__tests__/useQueuesComparison.test.tsx | 31 | Hardcoded Hex Color | `{ id: 'q2', name: 'Vendas', color: '#10B981' },` |
| src/hooks/__tests__/useTags.test.tsx | 48 | Hardcoded Hex Color | `color: '#ef4444',` |
| src/hooks/__tests__/useTags.test.tsx | 57 | Hardcoded Hex Color | `color: '#f59e0b',` |
| src/hooks/useUIManagement.ts | 341 | Hardcoded Font Family | `const computedFont = getComputedStyle(root).getPro...` |
| src/hooks/useUIManagement.ts | 358 | Hardcoded Font Family | `violations.push(`[Font] Tipografia desalinhada: --...` |
| src/index.css | 23 | Hardcoded Font Family | `font-family: var(--font-sans);` |
| src/lib/__tests__/sanitize-v2.test.ts | 90 | Hardcoded Hex Color | `test('2.4: Decodes numeric entities &#123;', () =>...` |
| src/lib/__tests__/sanitize-v2.test.ts | 91 | Hardcoded Hex Color | `const result = sanitizeHtml('&#60;&#115;&#99;');` |
| src/lib/__tests__/utils.test.ts | 37 | Literal Tailwind Color (text-red-500) | `const result = cn('text-red-500', 'text-blue-500')...` |
| src/lib/__tests__/utils.test.ts | 37 | Literal Tailwind Color (text-blue-500) | `const result = cn('text-red-500', 'text-blue-500')...` |
| src/lib/__tests__/utils.test.ts | 38 | Literal Tailwind Color (text-blue-500) | `expect(result).toBe('text-blue-500');` |
| src/lib/devRealtimeLogger.ts | 90 | Hardcoded Hex Color | `const STYLE_REG = 'color:#888;font-weight:600';` |
| src/lib/devRealtimeLogger.ts | 91 | Hardcoded Hex Color | `const STYLE_HOOK = 'color:#3b82f6;font-weight:700'...` |
| src/lib/devRealtimeLogger.ts | 92 | Hardcoded Hex Color | `const STYLE_EVENT_INSERT = 'color:#16a34a;font-wei...` |
| src/lib/devRealtimeLogger.ts | 93 | Hardcoded Hex Color | `const STYLE_EVENT_UPDATE = 'color:#d97706;font-wei...` |
| src/lib/devRealtimeLogger.ts | 94 | Hardcoded Hex Color | `const STYLE_EVENT_DELETE = 'color:#dc2626;font-wei...` |
| src/lib/devRealtimeLogger.ts | 95 | Hardcoded Hex Color | `const STYLE_DIM = 'color:#888';` |
| src/pages/Auth.tsx | 351 | Hardcoded Hex Color | `fill="#4285F4"` |
| src/pages/Auth.tsx | 355 | Hardcoded Hex Color | `fill="#34A853"` |
| src/pages/Auth.tsx | 359 | Hardcoded Hex Color | `fill="#FBBC05"` |
| src/pages/Auth.tsx | 363 | Hardcoded Hex Color | `fill="#EA4335"` |
| src/pages/DesignSystem.tsx | 14 | Hardcoded Font Family | `} function ColorSwatch({ name, hex, description, c...` |
| src/pages/admin/AdminBridgeStatusPage.tsx | 303 | Hardcoded Font Family | `<p className="font-mono text-xs">{lastCheck.toLoca...` |
| src/pages/admin/AdminChannelsPage.tsx | 57 | Hardcoded Hex Color | `color: "#3B82F6",` |
| src/pages/admin/AdminChannelsPage.tsx | 342 | Hardcoded Hex Color | `<Input id="ch-color" type="color" value={editing.c...` |
| src/pages/admin/AdminEmailAuditPage.tsx | 129 | Hardcoded Font Family | `<Badge variant="outline" className="font-mono">` |
| src/pages/admin/AdminEmailAuditPage.tsx | 226 | Hardcoded Font Family | `<code className="rounded bg-muted px-1.5 py-0.5 fo...` |
| src/pages/admin/AdminQueuesPage.tsx | 54 | Hardcoded Hex Color | `color: '#3B82F6',` |
| src/pages/admin/PerformanceDashboard.tsx | 118 | Hardcoded Font Family | `<span className="font-mono">&lt; 2500ms</span>` |
| src/pages/admin/PerformanceDashboard.tsx | 124 | Hardcoded Font Family | `<span className="font-mono">&lt; 0.100</span>` |
| src/pages/admin/PerformanceDashboard.tsx | 130 | Hardcoded Font Family | `<span className="font-mono">&lt; 500KB</span>` |
| src/pages/admin/ZappWebbDemoPage.tsx | 187 | Hardcoded Font Family | `Instância: <span className="font-mono">{ZAPPWEB_IN...` |
| src/pages/admin/ZappWebbDemoPage.tsx | 367 | Hardcoded Font Family | `<span className="font-mono">{contact.lead_score}/1...` |
| src/pages/admin/bridge-status/BridgeCoreServicesCard.tsx | 51 | Hardcoded Font Family | `<p className="mt-1 font-mono text-[10px] opacity-6...` |
| src/pages/admin/bridge-status/BridgeCoreServicesCard.tsx | 78 | Hardcoded Font Family | `<p className="mt-1 font-mono text-[10px] opacity-6...` |
| src/pages/admin/bridge-status/BridgeCoreServicesCard.tsx | 109 | Hardcoded Font Family | `<span className="font-mono text-xs">{recentTraffic...` |
| src/pages/admin/bridge-status/BridgeDiagnosticsDialog.tsx | 88 | Hardcoded Font Family | `<pre className="mt-2 max-h-32 overflow-x-auto roun...` |
| src/pages/admin/connections/ConnectionsExternalDbTab.tsx | 73 | Hardcoded Font Family | `className="font-mono text-xs"` |
| src/pages/admin/connections/ConnectionsExternalDbTab.tsx | 91 | Hardcoded Font Family | `className="font-mono text-xs"` |
| src/pages/admin/connections/ConnectionsMcpTab.tsx | 46 | Hardcoded Font Family | `className="font-mono text-[10px]"` |
| src/pages/admin/connections/ConnectionsMcpTab.tsx | 73 | Hardcoded Font Family | `<div className="overflow-x-auto whitespace-pre rou...` |
| src/pages/admin/queues/QueueEditDialog.tsx | 83 | Hardcoded Hex Color | `value={editing?.color ?? '#3B82F6'}` |
| src/stories/Header.tsx | 23 | Hardcoded Hex Color | `fill="#FFF"` |
| src/stories/Header.tsx | 27 | Hardcoded Hex Color | `fill="#555AB9"` |
| src/stories/Header.tsx | 31 | Hardcoded Hex Color | `fill="#91BAF8"` |
| src/stories/Page.tsx | 64 | Hardcoded Hex Color | `fill="#999"` |
| src/stories/button.css | 11 | Hardcoded Hex Color | `background-color: #555ab9;` |
| src/stories/button.css | 17 | Hardcoded Hex Color | `color: #333;` |
| src/stories/header.css | 30 | Hardcoded Hex Color | `color: #333;` |
| src/stories/page.css | 5 | Hardcoded Hex Color | `color: #333;` |
| src/stories/page.css | 42 | Hardcoded Hex Color | `background: #e7fdd8;` |
| src/stories/page.css | 44 | Hardcoded Hex Color | `color: #357a14;` |
| src/stories/page.css | 67 | Hardcoded Hex Color | `fill: #1ea7fd;` |
| src/styles/base.css | 24 | Hardcoded Font Family | `font-family: var(--font-sans);` |
| src/styles/base.css | 121 | Hardcoded Font Family | `font-family: var(--font-mono);` |
| src/styles/tokens.css | 6 | Hardcoded Font Family | `--font-sans: "Inter", -apple-system, BlinkMacSyste...` |
| src/styles/tokens.css | 8 | Hardcoded Font Family | `--font-mono: 'JetBrains Mono', 'Fira Code', ui-mon...` |
| src/styles/tokens.css | 234 | Hardcoded Hex Color | `--primary-foreground: 221 50% 8%; /* Dark navy — W...` |
| src/styles/utilities.css | 40 | Hardcoded Font Family | `font-family: var(--font-sans);` |
| src/styles/utilities.css | 45 | Hardcoded Font Family | `font-family: var(--font-sans);` |
| src/styles/utilities.css | 50 | Hardcoded Font Family | `font-family: var(--font-sans);` |
| src/styles/utilities.css | 55 | Hardcoded Font Family | `font-family: var(--font-sans);` |
| src/styles/utilities.css | 60 | Hardcoded Font Family | `font-family: var(--font-mono);` |
| src/utils/emailMappers.test.ts | 121 | Hardcoded Hex Color | `color: '#ff0000',` |
