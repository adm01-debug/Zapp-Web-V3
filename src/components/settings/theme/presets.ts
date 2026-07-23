/**
 * Comprehensive theme presets with FULL CSS variable coverage.
 * Each preset defines colors for BOTH light and dark modes,
 * ensuring the entire UI transforms when a skin is selected.
 */

/** Theme Mode Colors interface. */
export interface ThemeModeColors {
  // Core surfaces
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  'card-elevated': string;
  popover: string;
  'popover-foreground': string;

  // Primary
  primary: string;
  'primary-foreground': string;
  'primary-glow': string;

  // Secondary
  secondary: string;
  'secondary-foreground': string;

  // Muted
  muted: string;
  'muted-foreground': string;

  // Accent
  accent: string;
  'accent-foreground': string;

  // Borders & inputs
  border: string;
  input: string;
  ring: string;

  // Gamification
  xp: string;
  unread: string;

  // Sidebar
  'sidebar-background': string;
  'sidebar-foreground': string;
  'sidebar-primary': string;
  'sidebar-primary-foreground': string;
  'sidebar-accent': string;
  'sidebar-accent-foreground': string;
  'sidebar-border': string;
  'sidebar-ring': string;

  // Chat
  'chat-bubble-sent': string;
  'chat-bubble-sent-foreground': string;
  'chat-bubble-received': string;
  'chat-bubble-received-foreground': string;
  'chat-header': string;
  'chat-input-bg': string;

  // Status
  'status-open': string;

  // Gradients
  'gradient-primary': string;
  'gradient-secondary': string;
  'gradient-xp': string;
  'gradient-vibrant': string;
  'gradient-purple-green': string;
  'gradient-surface': string;
  'gradient-divider': string;

  // Shadows
  'shadow-glow-primary': string;
  'shadow-glow-secondary': string;
  'shadow-glow-accent': string;
  'shadow-glow-purple': string;

  // Glass
  'glass-bg': string;
  'glass-border': string;

  // Elevated
  elevated: string;
  'elevated-hover': string;

  // Charts
  'chart-1': string;
  'chart-9': string;
  'chart-status-open': string;
}

/** Theme Preset interface definition. */
export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  emoji: string;
  swatches: [string, string, string, string];
  light: ThemeModeColors;
  dark: ThemeModeColors;
  /**
   * Border-radius (em px) sugerido pelo skin. Quando definido, o helper
   * `applyPreset` aplica esse valor ao `--radius` global. Permite que
   * skins angulares (Opera GX) coexistam com skins arredondados.
   */
  borderRadius?: number;
  /**
   * Família de fonte (CSS font-family list) sugerida pelo skin. Quando
   * definida, é aplicada às variáveis globais `--font-sans` e
   * `--font-display`. Permite skins com tipografia distinta (ex.: Opera
   * GX usa uma sans-serif geométrica como Rajdhani).
   */
  font?: string;
}

/**
 * All CSS variable keys that presets will apply/remove.
 */
export const CSS_VARS_TO_APPLY: (keyof ThemeModeColors)[] = [
  'background', 'foreground',
  'card', 'card-foreground', 'card-elevated',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'primary-glow',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'border', 'input', 'ring',
  'xp', 'unread',
  'sidebar-background', 'sidebar-foreground',
  'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring',
  'chat-bubble-sent', 'chat-bubble-sent-foreground',
  'chat-bubble-received', 'chat-bubble-received-foreground',
  'chat-header', 'chat-input-bg',
  'status-open',
  'gradient-primary', 'gradient-secondary', 'gradient-xp',
  'gradient-vibrant', 'gradient-purple-green',
  'gradient-surface', 'gradient-divider',
  'shadow-glow-primary', 'shadow-glow-secondary',
  'shadow-glow-accent', 'shadow-glow-purple',
  'glass-bg', 'glass-border',
  'elevated', 'elevated-hover',
  'chart-1', 'chart-9', 'chart-status-open',
];

// ──────────── Helper ────────────
interface PresetParams {
  id: string;
  name: string;
  description: string;
  emoji: string;
  // Primary hue/sat/light
  h: number; s: number; l: number;
  // Glow hue
  gh: number;
  // Secondary hue/sat/light
  sh: number; ss: number; sl: number;
}

const buildPreset = (p: PresetParams): ThemePreset => {
  const { id, name, description, emoji, h, s, l, gh, sh, ss, sl } = p;

  const light: ThemeModeColors = {
    background: `${h} 15% 98%`,
    foreground: `${h} 20% 10%`,
    card: `0 0% 100%`,
    'card-foreground': `${h} 20% 10%`,
    'card-elevated': `0 0% 100%`,
    popover: `0 0% 100%`,
    'popover-foreground': `${h} 20% 10%`,
    primary: `${h} ${s}% ${l}%`,
    'primary-foreground': '0 0% 100%',
    'primary-glow': `${gh} ${s + 3}% ${l + 6}%`,
    secondary: `${sh} ${ss}% ${sl}%`,
    'secondary-foreground': '0 0% 100%',
    muted: `${h} 10% 94%`,
    'muted-foreground': `${h} 10% 40%`,
    accent: `${h} 50% 96%`,
    'accent-foreground': `${h} ${s}% ${l - 12}%`,
    border: `${h} 12% 92%`,
    input: `${h} 12% 94%`,
    ring: `${h} ${s}% ${l}%`,
    xp: `${h} ${s}% ${l}%`,
    unread: `${h} ${s}% ${l}%`,
    'sidebar-background': `0 0% 100%`,
    'sidebar-foreground': `${h} 20% 10%`,
    'sidebar-primary': `${h} ${s}% ${l}%`,
    'sidebar-primary-foreground': '0 0% 100%',
    'sidebar-accent': `${h} 40% 97%`,
    'sidebar-accent-foreground': `${h} ${s}% ${l - 12}%`,
    'sidebar-border': `${h} 10% 93%`,
    'sidebar-ring': `${h} ${s}% ${l}%`,
    'chat-bubble-sent': `${h} ${s}% ${l}%`,
    'chat-bubble-sent-foreground': '0 0% 100%',
    'chat-bubble-received': `${h} 10% 95%`,
    'chat-bubble-received-foreground': `${h} 20% 12%`,
    'chat-header': `0 0% 100%`,
    'chat-input-bg': `0 0% 100%`,
    'status-open': `${h} ${s}% ${l}%`,
    'gradient-primary': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(${gh} ${s - 5}% ${l + 4}%))`,
    'gradient-secondary': `linear-gradient(135deg, hsl(${sh} ${ss}% ${sl}%), hsl(${gh} ${ss - 10}% ${sl + 5}%))`,
    'gradient-xp': `linear-gradient(90deg, hsl(${h} ${s}% ${l}%), hsl(${gh} ${s - 5}% ${l + 4}%))`,
    'gradient-vibrant': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(210 90% 55%), hsl(${gh} ${s - 5}% ${l + 4}%))`,
    'gradient-purple-green': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(155 80% 48%))`,
    'gradient-surface': `linear-gradient(180deg, hsl(${h} 15% 98%), hsl(${h} 10% 96%))`,
    'gradient-divider': `linear-gradient(90deg, transparent, hsl(${h} 10% 90% / 0.4), transparent)`,
    'shadow-glow-primary': `0 6px 20px hsl(${h} ${s}% ${l}% / 0.15)`,
    'shadow-glow-secondary': `0 6px 20px hsl(${sh} ${ss}% ${sl}% / 0.12)`,
    'shadow-glow-accent': `0 6px 20px hsl(${gh} ${s - 5}% ${l + 4}% / 0.15)`,
    'shadow-glow-purple': `0 6px 20px hsl(${h} ${s}% ${l}% / 0.18)`,
    'glass-bg': `0 0% 100% / 0.7`,
    'glass-border': `${h} 15% 90% / 0.5`,
    elevated: `0 0% 100%`,
    'elevated-hover': `${h} 15% 98%`,
    'chart-1': `${h} ${s}% ${l}%`,
    'chart-9': `${gh} ${s - 5}% ${sl}%`,
    'chart-status-open': `${h} ${s}% ${l}%`,
  };

  const dark: ThemeModeColors = {
    background: `240 8% 6%`,
    foreground: `0 0% 97%`,
    card: `240 7% 11%`,
    'card-foreground': `0 0% 97%`,
    'card-elevated': `240 7% 16%`,
    popover: `240 7% 13%`,
    'popover-foreground': `0 0% 97%`,
    primary: `${h} ${s}% ${l}%`,
    'primary-foreground': '0 0% 100%',
    'primary-glow': `${gh} ${s + 3}% ${l + 6}%`,
    secondary: `${sh} ${ss}% ${sl}%`,
    'secondary-foreground': '0 0% 100%',
    muted: `240 8% 16%`,
    'muted-foreground': `${h} 25% 82%`,
    accent: `${h} 60% 22%`,
    'accent-foreground': `${h} ${s}% 80%`,
    border: `240 8% 20%`,
    input: `240 8% 16%`,
    ring: `${h} ${s}% ${l}%`,
    xp: `${h} ${s}% ${l}%`,
    unread: `${h} ${s}% ${l}%`,
    'sidebar-background': `240 8% 9%`,
    'sidebar-foreground': `0 0% 97%`,
    'sidebar-primary': `${h} ${s}% ${l}%`,
    'sidebar-primary-foreground': '0 0% 100%',
    'sidebar-accent': `${h} 50% 20%`,
    'sidebar-accent-foreground': `${h} ${s}% 80%`,
    'sidebar-border': `240 8% 18%`,
    'sidebar-ring': `${h} ${s}% ${l}%`,
    'chat-bubble-sent': `${h} ${s}% ${l}%`,
    'chat-bubble-sent-foreground': '0 0% 100%',
    'chat-bubble-received': `240 8% 16%`,
    'chat-bubble-received-foreground': `0 0% 97%`,
    'chat-header': `240 7% 11%`,
    'chat-input-bg': `240 7% 13%`,
    'status-open': `${h} ${s}% ${l}%`,
    'gradient-primary': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(${gh} ${s - 5}% ${l + 4}%))`,
    'gradient-secondary': `linear-gradient(135deg, hsl(${sh} ${ss}% ${sl}%), hsl(${gh} ${ss - 8}% ${sl + 5}%))`,
    'gradient-xp': `linear-gradient(90deg, hsl(${h} ${s}% ${l}%), hsl(${gh} ${s - 5}% ${l + 4}%))`,
    'gradient-vibrant': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(210 95% 62%), hsl(${gh} ${s - 5}% ${l + 4}%))`,
    'gradient-purple-green': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(155 80% 50%))`,
    'gradient-surface': `linear-gradient(180deg, hsl(240 7% 11%), hsl(240 8% 7%))`,
    'gradient-divider': `linear-gradient(90deg, transparent, hsl(${h} 50% 35% / 0.5), transparent)`,
    'shadow-glow-primary': `0 4px 24px hsl(${h} ${s}% ${l}% / 0.45)`,
    'shadow-glow-secondary': `0 4px 24px hsl(${sh} ${ss}% ${sl}% / 0.4)`,
    'shadow-glow-accent': `0 4px 24px hsl(${gh} ${s - 7}% ${l + 4}% / 0.4)`,
    'shadow-glow-purple': `0 4px 24px hsl(${h} ${s}% ${l}% / 0.5)`,
    'glass-bg': `240 7% 11% / 1`,
    'glass-border': `${h} 50% 30% / 1`,
    elevated: `240 7% 16%`,
    'elevated-hover': `240 7% 20%`,
    'chart-1': `${h} ${s}% ${l}%`,
    'chart-9': `${gh} ${s - 7}% ${sl}%`,
    'chart-status-open': `${h} ${s}% ${l}%`,
  };

  return {
    id,
    name,
    description,
    emoji,
    swatches: [
      `hsl(${h} ${s}% ${l}%)`,
      `hsl(${sh} ${ss}% ${sl}%)`,
      `hsl(${gh} ${s - 5}% ${l + 6}%)`,
      `hsl(${h} ${Math.round(s * 0.5)}% ${l + 15}%)`,
    ],
    light,
    dark,
  };
};

// ──────────── Opera GX dark surface palette ────────────
// Hex de referência: #251F33 (roxo escuro icônico do Opera GX).
// Aplicamos uma família de tons em torno desse hue para dar identidade
// "GX" em todas as superfícies do dark mode (background, cards, sidebar,
// chat etc.) sem depender da cor primária de cada skin.
const applyGxDarkSurfaces = (preset: ThemePreset): ThemePreset => {
  const d = preset.dark;
  d.background = '265 22% 8%';
  d.card = '265 22% 12%';
  d['card-elevated'] = '265 18% 17%';
  d.popover = '265 22% 14%';
  d.muted = '265 18% 17%';
  d.input = '265 18% 17%';
  d.border = '265 18% 22%';
  d['sidebar-background'] = '265 24% 10%';
  d['sidebar-border'] = '265 18% 20%';
  d['chat-header'] = '265 22% 12%';
  d['chat-input-bg'] = '265 22% 14%';
  d['chat-bubble-received'] = '265 18% 17%';
  d.elevated = '265 18% 17%';
  d['elevated-hover'] = '265 18% 22%';
  d['gradient-surface'] = 'linear-gradient(180deg, hsl(265 22% 12%), hsl(265 24% 8%))';
  return preset;
};

// Substitui a cor (HSL string sem alpha) de um valor "shadow-glow-*"
// preservando offset/blur/spread. Ex.:
//   '0 4px 24px hsl(347 96% 54% / 0.45)'  →  '0 4px 24px hsl(347 96% 54% / 0.7)'
const boostGlowAlpha = (shadow: string, alpha: number): string =>
  shadow.replace(/\/\s*[0-9.]+\s*\)/, `/ ${alpha})`);

// ──────────── Opera GX neon glow boost ────────────
// Reforça a intensidade das sombras/neon em torno dos elementos
// principais e amplia o brilho da borda glass para reproduzir o
// "RGB feel" do Opera GX. Aplicado tanto em light quanto em dark.
const applyGxNeonGlow = (preset: ThemePreset): ThemePreset => {
  const { light, dark } = preset;

  light['shadow-glow-primary'] = boostGlowAlpha(light['shadow-glow-primary'], 0.45);
  light['shadow-glow-secondary'] = boostGlowAlpha(light['shadow-glow-secondary'], 0.4);
  light['shadow-glow-accent'] = boostGlowAlpha(light['shadow-glow-accent'], 0.45);
  light['shadow-glow-purple'] = boostGlowAlpha(light['shadow-glow-purple'], 0.5);

  dark['shadow-glow-primary'] = boostGlowAlpha(dark['shadow-glow-primary'], 0.7);
  dark['shadow-glow-secondary'] = boostGlowAlpha(dark['shadow-glow-secondary'], 0.65);
  dark['shadow-glow-accent'] = boostGlowAlpha(dark['shadow-glow-accent'], 0.65);
  dark['shadow-glow-purple'] = boostGlowAlpha(dark['shadow-glow-purple'], 0.75);

  return preset;
};

// ──────────── Opera GX glass transparency ────────────
// Reduz drasticamente a opacidade do glass-bg e tinge a glass-border
// com a cor primária do skin para reproduzir o efeito de painéis
// translúcidos do Opera GX, onde a UI deixa transparecer o backdrop.
const applyGxGlass = (preset: ThemePreset, h: number, s: number, l: number): ThemePreset => {
  preset.light['glass-bg'] = '0 0% 100% / 0.55';
  preset.light['glass-border'] = `${h} ${s}% ${l}% / 0.35`;
  preset.dark['glass-bg'] = '265 22% 12% / 0.55';
  preset.dark['glass-border'] = `${h} ${Math.min(100, s + 5)}% ${l}% / 0.5`;
  return preset;
};

// Tipografia geométrica usada pelo Opera GX (sans-serif tech/gamer).
// Rajdhani é nativamente geométrica e largamente usada em UIs de jogos.
const GX_FONT_STACK = "'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

const buildGxPreset = (p: PresetParams): ThemePreset => {
  const preset = applyGxGlass(
    applyGxNeonGlow(applyGxDarkSurfaces(buildPreset(p))),
    p.h, p.s, p.l,
  );
  // Opera GX usa cantos quase retos em botões/cards/sidebar.
  preset.borderRadius = 4;
  // Tipografia geométrica/tech para reforçar a vibe gamer.
  preset.font = GX_FONT_STACK;
  return preset;
};

// ──────────── PRESETS ────────────
/** P R E S E T S constant. */
export const PRESETS: ThemePreset[] = [
  buildPreset({ id: 'corporate', name: 'Padrão', description: 'Azul profissional', emoji: '💼', h: 221, s: 83, l: 53, gh: 230, sh: 215, ss: 70, sl: 55 }),
  buildPreset({ id: 'purpure', name: 'Púrpure', description: 'Roxo vibrante original', emoji: '💜', h: 254, s: 92, l: 62, gh: 260, sh: 260, ss: 90, sl: 67 }),
  buildPreset({ id: 'emerald', name: 'Esmeralda', description: 'Verde sofisticado', emoji: '💎', h: 160, s: 84, l: 45, gh: 170, sh: 145, ss: 70, sl: 50 }),
  buildPreset({ id: 'sunset', name: 'Pôr do Sol', description: 'Quente e acolhedor', emoji: '🌅', h: 25, s: 95, l: 53, gh: 35, sh: 15, ss: 80, sl: 50 }),
  buildPreset({ id: 'rose', name: 'Rosé', description: 'Elegante e moderno', emoji: '🌸', h: 346, s: 77, l: 50, gh: 355, sh: 330, ss: 70, sl: 55 }),
  buildPreset({ id: 'minimal', name: 'Minimal', description: 'Clean e neutro', emoji: '⚪', h: 220, s: 15, l: 50, gh: 220, sh: 220, ss: 10, sl: 45 }),
  buildPreset({ id: 'ocean', name: 'Oceano', description: 'Azul profundo', emoji: '🌊', h: 200, s: 85, l: 55, gh: 210, sh: 190, ss: 75, sl: 50 }),
  buildPreset({ id: 'amber', name: 'Âmbar', description: 'Dourado e premium', emoji: '✨', h: 38, s: 92, l: 50, gh: 45, sh: 30, ss: 80, sl: 55 }),
  buildPreset({ id: 'cyber', name: 'Cyber', description: 'Neon futurista', emoji: '🤖', h: 180, s: 100, l: 50, gh: 300, sh: 320, ss: 100, sl: 60 }),

  // ──────────── Opera GX Edition ────────────
  // Skins inspirados nos temas oficiais do navegador Opera GX.
  buildGxPreset({ id: 'gx-classic', name: 'GX Classic', description: 'Vermelho neon assinatura do Opera GX 🦈', emoji: '🦈', h: 347, s: 96, l: 54, gh: 340, sh: 280, ss: 60, sl: 40 }),
  buildGxPreset({ id: 'gx-pink-addiction', name: 'Pink Addiction', description: 'Rosa intenso e viciante', emoji: '🍭', h: 330, s: 95, l: 60, gh: 340, sh: 300, ss: 90, sl: 55 }),
  buildGxPreset({ id: 'gx-purple-haze', name: 'Purple Haze', description: 'Roxo profundo e psicodélico', emoji: '🟣', h: 265, s: 65, l: 50, gh: 275, sh: 245, ss: 70, sl: 55 }),
  buildGxPreset({ id: 'gx-rose-quartz', name: 'Rose Quartz', description: 'Rosa quartzo cristalino', emoji: '💗', h: 345, s: 75, l: 68, gh: 355, sh: 320, ss: 60, sl: 70 }),
  buildGxPreset({ id: 'gx-ultraviolet', name: 'Ultraviolet', description: 'Violeta UV vibrante', emoji: '🔮', h: 271, s: 76, l: 53, gh: 280, sh: 255, ss: 80, sl: 55 }),
  buildGxPreset({ id: 'gx-hackerman', name: 'Hackerman', description: 'Verde Matrix de hacker', emoji: '👨‍💻', h: 127, s: 65, l: 46, gh: 135, sh: 115, ss: 60, sl: 42 }),
  buildGxPreset({ id: 'gx-frutti-di-mare', name: 'Frutti di Mare', description: 'Azul-petróleo do fundo do mar', emoji: '🐙', h: 182, s: 90, l: 42, gh: 190, sh: 200, ss: 75, sl: 45 }),
  buildGxPreset({ id: 'gx-cyberpunk', name: 'Cyberpunk', description: 'Amarelo neon de Night City', emoji: '⚡', h: 55, s: 100, l: 51, gh: 180, sh: 320, ss: 95, sl: 55 }),
  buildGxPreset({ id: 'gx-razer', name: 'Razer', description: 'Verde RGB Razer Chroma', emoji: '🐍', h: 113, s: 70, l: 51, gh: 120, sh: 100, ss: 60, sl: 48 }),

  (() => {
    // Diversity — Rainbow Pride theme 🏳️‍🌈
    // Use a vibrant magenta/pink as primary for max color pop
    const base = buildPreset({ id: 'diversity', name: 'Diversity', description: 'Orgulho e diversidade 🏳️‍🌈', emoji: '🏳️‍🌈', h: 330, s: 90, l: 58, gh: 280, sh: 160, ss: 85, sl: 50 });
    
    const rainbowGrad = 'linear-gradient(135deg, hsl(0 85% 55%), hsl(30 90% 55%), hsl(55 90% 50%), hsl(130 70% 45%), hsl(210 80% 55%), hsl(280 80% 58%))';
    const rainbowGradH = 'linear-gradient(90deg, hsl(0 85% 55%), hsl(30 90% 55%), hsl(55 90% 50%), hsl(130 70% 45%), hsl(210 80% 55%), hsl(280 80% 58%))';
    const rainbowGradSurface = 'linear-gradient(180deg, hsl(280 30% 8%), hsl(330 20% 6%))';
    const rainbowGradSurfaceLight = 'linear-gradient(180deg, hsl(330 30% 97%), hsl(280 20% 95%))';
    const rainbowDivider = 'linear-gradient(90deg, hsl(0 85% 55% / 0.4), hsl(55 90% 50% / 0.4), hsl(130 70% 45% / 0.4), hsl(210 80% 55% / 0.4), hsl(280 80% 58% / 0.4))';

    // Override ALL gradients with rainbow
    base.light['gradient-primary'] = rainbowGrad;
    base.light['gradient-secondary'] = rainbowGrad;
    base.light['gradient-xp'] = rainbowGradH;
    base.light['gradient-vibrant'] = rainbowGrad;
    base.light['gradient-purple-green'] = rainbowGrad;
    base.light['gradient-surface'] = rainbowGradSurfaceLight;
    base.light['gradient-divider'] = rainbowDivider;
    
    base.dark['gradient-primary'] = rainbowGrad;
    base.dark['gradient-secondary'] = rainbowGrad;
    base.dark['gradient-xp'] = rainbowGradH;
    base.dark['gradient-vibrant'] = rainbowGrad;
    base.dark['gradient-purple-green'] = rainbowGrad;
    base.dark['gradient-surface'] = rainbowGradSurface;
    base.dark['gradient-divider'] = rainbowDivider;

    // Make shadows colorful
    base.light['shadow-glow-primary'] = '0 4px 24px hsl(330 90% 58% / 0.3)';
    base.light['shadow-glow-secondary'] = '0 4px 24px hsl(160 85% 50% / 0.25)';
    base.light['shadow-glow-accent'] = '0 4px 24px hsl(280 80% 58% / 0.25)';
    base.light['shadow-glow-purple'] = '0 4px 24px hsl(280 80% 58% / 0.3)';
    base.dark['shadow-glow-primary'] = '0 4px 24px hsl(330 90% 58% / 0.4)';
    base.dark['shadow-glow-secondary'] = '0 4px 24px hsl(160 85% 50% / 0.35)';
    base.dark['shadow-glow-accent'] = '0 4px 24px hsl(280 80% 58% / 0.35)';
    base.dark['shadow-glow-purple'] = '0 4px 24px hsl(280 80% 58% / 0.4)';

    // Colorful accents — make secondary green/teal, accent purple
    base.dark['secondary'] = '160 85% 50%';
    base.dark['accent'] = '280 60% 25%';
    base.dark['accent-foreground'] = '280 80% 78%';
    base.dark['ring'] = '330 90% 58%';
    base.dark['xp'] = '130 70% 45%';
    base.dark['unread'] = '0 85% 55%';
    base.dark['status-open'] = '130 70% 50%';
    base.dark['sidebar-primary'] = '330 90% 58%';
    base.dark['sidebar-accent'] = '280 50% 20%';
    base.dark['sidebar-accent-foreground'] = '280 80% 78%';
    base.dark['sidebar-ring'] = '330 90% 58%';
    base.dark['chat-bubble-sent'] = '330 90% 55%';
    base.dark['glass-border'] = '330 50% 35% / 0.4';
    base.dark['chart-1'] = '330 90% 58%';
    base.dark['chart-9'] = '160 85% 50%';
    base.dark['chart-status-open'] = '130 70% 50%';

    base.light['secondary'] = '160 85% 45%';
    base.light['accent'] = '280 55% 93%';
    base.light['accent-foreground'] = '280 80% 45%';
    base.light['ring'] = '330 90% 55%';
    base.light['xp'] = '130 70% 40%';
    base.light['unread'] = '0 85% 50%';
    base.light['status-open'] = '130 70% 45%';
    base.light['sidebar-primary'] = '330 90% 55%';
    base.light['sidebar-accent'] = '330 50% 95%';
    base.light['sidebar-accent-foreground'] = '330 90% 45%';
    base.light['sidebar-ring'] = '330 90% 55%';
    base.light['chat-bubble-sent'] = '330 90% 55%';
    base.light['chart-1'] = '330 90% 55%';
    base.light['chart-9'] = '160 85% 45%';
    base.light['chart-status-open'] = '130 70% 45%';

    base.swatches = ['hsl(0 85% 55%)', 'hsl(55 90% 50%)', 'hsl(130 70% 45%)', 'hsl(280 80% 58%)'];
    return base;
  })(),
];

/** S T O R A G E_ K E Y constant. */
export const STORAGE_KEY = 'theme-custom-colors';
/** D E F A U L T_ P R E S E T_ I D constant. */
export const DEFAULT_PRESET_ID = 'corporate';

const DEPRECATED_PRESET_IDS = new Set(['default', 'purpure']);

/** normalize Stored Preset Id function. */
export function normalizeStoredPresetId(presetId?: string | null): string {
  if (!presetId || DEPRECATED_PRESET_IDS.has(presetId)) {
    return DEFAULT_PRESET_ID;
  }

  return PRESETS.some((preset) => preset.id === presetId) ? presetId : DEFAULT_PRESET_ID;
}
