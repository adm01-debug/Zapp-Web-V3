/**
 * Design System Auditor Configuration
 * 
 * HOW TO CONFIGURE:
 * - WHITELIST: Allowed tokens that should not trigger violations.
 * - VARIANTS: Tailwind variants to strip before checking patterns (e.g., hover, dark).
 * - FORBIDDEN_PATTERNS: Regex patterns for prohibited styles (hex colors, literal colors, etc.).
 * - IGNORE_DIRECTIVE: String to look for in a line to skip it (default: @ds-ignore).
 * - IGNORED_FILES/DIRS: Paths to skip during scanning.
 * 
 * HOW TO RUN:
 * - Basic Scan: `bun scripts/check-design-system.ts`
 * - Target Folder: `bun scripts/check-design-system.ts src/components`
 * - CI Mode (fails on violation): `bun scripts/check-design-system.ts --ci`
 * - Dry Run (simulates fixes): `bun scripts/check-design-system.ts --dry-run`
 * - Apply Patches (auto-fix): `bun scripts/check-design-system.ts --apply-patch`
 * - Filter Priority: `bun scripts/check-design-system.ts --min-priority=High`
 * 
 * HOW TO TEST:
 * - Run `bun test scripts/check-design-system.test.ts`
 */
export const DS_CONFIG = {

  WHITELIST: {
    colors: [
      'primary', 'primary-foreground', 'primary-glow',
      'secondary', 'secondary-foreground',
      'destructive', 'destructive-foreground',
      'muted', 'muted-foreground',
      'accent', 'accent-foreground',
      'popover', 'popover-foreground',
      'card', 'card-foreground', 'card-elevated',
      'background', 'foreground',
      'border', 'input', 'ring',
      'success', 'success-foreground',
      'warning', 'warning-foreground',
      'info', 'info-foreground',
      'xp', 'coins', 'streak',
      'rank-gold', 'rank-silver', 'rank-bronze',
      'whatsapp', 'whatsapp-dark',
      'status-online', 'status-away', 'status-offline', 'status-open', 'status-pending', 'status-resolved', 'status-waiting',
      'priority-high', 'priority-medium', 'priority-low',
      'chat-sent', 'chat-received', 'chat-header', 'chat-input-bg',
      'elevated', 'elevated-hover'
    ],
    fonts: ['sans', 'mono', 'serif'],
    spacing: ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24', '32', '40', '48', '56', '64'],
  },
  VARIANTS: [
    'dark', 'hover', 'focus', 'active', 'disabled', 
    'peer-hover', 'peer-focus', 'peer-active', 'peer-disabled',
    'group-hover', 'group-focus', 'group-active', 'group-disabled',
    'focus-within', 'focus-visible'
  ],
  FORBIDDEN_PATTERNS: [
    { pattern: /(?:bg|text|border)-(?:\[(?:#(?:[0-9a-fA-F]{3,6})|rgb|hsl|rgba|hsla)\])/, label: 'Arbitrary Color' },
    { pattern: /(?:bg|text|border)-(?:white|black(?:(?!-[0-9]))|(?:red|blue|green|yellow|slate|gray|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+)\b/, label: 'Literal Color' },
    { pattern: /font-(?:inter|sans|mono|serif)\b/, label: 'Literal Font' },
    { pattern: /(?<!linear-gradient\(|radial-gradient\(|conic-gradient\()#([0-9a-fA-F]{3,6})\b/, label: 'Raw Hex' },
  ],
  IGNORE_DIRECTIVE: '@ds-ignore',
  IGNORED_FILES: [
    'DesignSystem.tsx',
    'tailwind.config.ts',
    'index.css',
    'check-design-system.ts',
    'ds-config.ts',
    'test-audit.ts',
    'check-design-system.test.ts'
  ],
  IGNORED_DIRS: ['node_modules', '.git', 'dist', 'stories', '__tests__', '.workspace']
};
