/**
 * Media samplers — fetch random items from existing libraries to feed the stress test.
 *
 * Reuses tables `stickers` and `audio_memes`. For image/video/audio_voice/document
 * we use small public sample URLs (no third-party storage to spin up). All URLs are
 * stable and small enough to not stress the proxy itself.
 */
import { supabase } from '@/integrations/supabase/client';
import type { StressTaskType } from './types';

export interface MediaSample {
  url?: string;
  text?: string;
  caption?: string;
  fileName?: string;
  // location-only
  latitude?: number;
  longitude?: number;
  name?: string;
  detail: string;
}

// Sample URLs — público, pequenos, estáveis. Mantidos curtos.
const IMAGE_URLS = [
  'https://picsum.photos/seed/zappstress1/600/400.jpg',
  'https://picsum.photos/seed/zappstress2/600/400.jpg',
  'https://picsum.photos/seed/zappstress3/600/400.jpg',
  'https://picsum.photos/seed/zappstress4/600/400.jpg',
  'https://picsum.photos/seed/zappstress5/600/400.jpg',
];
const VIDEO_URLS = [
  'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-10s.mp4',
];
const VOICE_URLS = [
  'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
  'https://samplelib.com/lib/preview/mp3/sample-6s.mp3',
];
const DOC_URLS = [
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
];

// Goiânia ± 0.01°
const BASE_LAT = -16.6869;
const BASE_LON = -49.2648;

function pick<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length];
}

let stickersCache: { id: string; name: string; image_url: string }[] | null = null;
let memesCache: { id: string; name: string; audio_url: string }[] | null = null;

async function loadStickers() {
  if (stickersCache) return stickersCache;
  const { data, error } = await supabase
    .from('stickers')
    .select('id,name,image_url')
    .limit(200);
  if (error) throw new Error(`Falha ao carregar stickers: ${error.message}`);
  stickersCache = (data ?? []).filter((s) => s.image_url);
  if (stickersCache.length === 0) throw new Error('Nenhum sticker disponível na biblioteca');
  return stickersCache;
}

async function loadMemes() {
  if (memesCache) return memesCache;
  const { data, error } = await supabase
    .from('audio_memes')
    .select('id,name,audio_url')
    .limit(200);
  if (error) throw new Error(`Falha ao carregar áudios memes: ${error.message}`);
  memesCache = (data ?? []).filter((m) => m.audio_url);
  if (memesCache.length === 0) throw new Error('Nenhum áudio meme disponível na biblioteca');
  return memesCache;
}

/** Pré-carrega bibliotecas de mídia. Chame antes de iniciar o run pra falhar cedo. */
export async function preloadLibraries(): Promise<void> {
  await Promise.all([loadStickers(), loadMemes()]);
}

export async function sampleFor(type: StressTaskType, idx: number): Promise<MediaSample> {
  switch (type) {
    case 'text': {
      const text = `Stress test #${idx + 1} — ${new Date().toISOString()}`;
      return { text, detail: text.slice(0, 40) };
    }
    case 'image': {
      const url = pick(IMAGE_URLS, idx);
      return { url, caption: `Stress #${idx + 1}`, fileName: `img-${idx + 1}.jpg`, detail: url };
    }
    case 'video': {
      const url = pick(VIDEO_URLS, idx);
      return { url, caption: `Stress #${idx + 1}`, fileName: `vid-${idx + 1}.mp4`, detail: url };
    }
    case 'audio_voice': {
      const url = pick(VOICE_URLS, idx);
      return { url, fileName: `voice-${idx + 1}.mp3`, detail: url };
    }
    case 'audio_meme': {
      const memes = await loadMemes();
      const m = pick(memes, idx);
      return { url: m.audio_url, fileName: `${m.name}.mp3`, detail: m.name };
    }
    case 'sticker': {
      const stickers = await loadStickers();
      const s = pick(stickers, idx);
      return { url: s.image_url, detail: s.name };
    }
    case 'document': {
      const url = pick(DOC_URLS, idx);
      return { url, fileName: `doc-${idx + 1}.pdf`, caption: `Stress #${idx + 1}`, detail: url };
    }
    case 'location': {
      const dLat = ((idx % 20) - 10) * 0.001;
      const dLon = ((idx % 17) - 8) * 0.001;
      return {
        latitude: BASE_LAT + dLat,
        longitude: BASE_LON + dLon,
        name: `Ponto ${idx + 1}`,
        detail: `${(BASE_LAT + dLat).toFixed(4)}, ${(BASE_LON + dLon).toFixed(4)}`,
      };
    }
  }
}

/**
 * Constrói o plano balanceado: N // K de cada tipo, embaralhado para alternar.
 * Garante que `total === plan.length`.
 */
export function buildBalancedPlan(total: number, types: StressTaskType[]): StressTaskType[] {
  const perType = Math.floor(total / types.length);
  const remainder = total % types.length;
  const plan: StressTaskType[] = [];
  for (let i = 0; i < types.length; i++) {
    const count = perType + (i < remainder ? 1 : 0);
    for (let j = 0; j < count; j++) plan.push(types[i]);
  }
  // Fisher–Yates determinístico-leve (Math.random é ok aqui — não é segurança).
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan;
}
