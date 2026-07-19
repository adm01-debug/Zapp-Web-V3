/** CATEGORY_LABELS component. */
export const CATEGORY_LABELS: Record<string, { emoji: string; label: string }> = {
  risada: { emoji: '😂', label: 'Risada' },
  aplausos: { emoji: '👏', label: 'Aplausos' },
  suspense: { emoji: '🎭', label: 'Suspense' },
  vitória: { emoji: '🏆', label: 'Vitória' },
  falha: { emoji: '💥', label: 'Falha' },
  surpresa: { emoji: '😱', label: 'Surpresa' },
  triste: { emoji: '😢', label: 'Triste' },
  raiva: { emoji: '😡', label: 'Raiva' },
  romântico: { emoji: '💕', label: 'Romântico' },
  medo: { emoji: '👻', label: 'Medo' },
  deboche: { emoji: '😏', label: 'Deboche' },
  narração: { emoji: '🎙️', label: 'Narração' },
  bordão: { emoji: '💬', label: 'Bordão' },
  'efeito sonoro': { emoji: '🔊', label: 'Efeito Sonoro' },
  viral: { emoji: '🔥', label: 'Viral' },
  cumprimento: { emoji: '👋', label: 'Cumprimento' },
  despedida: { emoji: '👋', label: 'Despedida' },
  animação: { emoji: '🤩', label: 'Animação' },
  drama: { emoji: '🎬', label: 'Drama' },
  gospel: { emoji: '⛪', label: 'Gospel' },
  outros: { emoji: '📦', label: 'Outros' },
};

/** ALL_CATEGORIES component. */
export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);
