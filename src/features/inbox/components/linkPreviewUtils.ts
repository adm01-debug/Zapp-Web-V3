// URL regex pattern
/** U R L_ R E G E X constant. */
export const URL_REGEX =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov'];

/** is Image Url function. */
export function isImageUrl(url: string): boolean {
  return IMAGE_EXTENSIONS.some((ext) => url.toLowerCase().includes(ext));
}

/** is Video Url function. */
export function isVideoUrl(url: string): boolean {
  return VIDEO_EXTENSIONS.some((ext) => url.toLowerCase().includes(ext));
}

/** is You Tube Url function. */
export function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com/watch') || url.includes('youtu.be/');
}

/** get You Tube Thumbnail function. */
export function getYouTubeThumbnail(url: string): string | null {
  let videoId: string | null = null;
  if (url.includes('youtube.com/watch')) {
    const urlParams = new URLSearchParams(url.split('?')[1]);
    videoId = urlParams.get('v');
  } else if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1]?.split('?')[0];
  }
  return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
}

/** get Domain function. */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

/**
 * Domains allowed by CSP img-src for favicon loading.
 * External favicons from other domains will fail CSP and trigger console violations.
 * The app falls back to a Globe icon via onError when favicon is empty or fails.
 *
 * @see vercel.json Content-Security-Policy img-src directive
 */
const FAVICON_SAFE_DOMAINS = new Set([
  'supabase.atomicabr.com.br',
  'zapp-media-proxy.adm01.workers.dev',
  'googleusercontent.com',
  'lh3.googleusercontent.com',
  'whatsapp.net',
  'img.youtube.com',
  'i.ytimg.com',
  'www.youtube.com',
  'youtube.com',
]);

function isFaviconSafe(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    for (const domain of FAVICON_SAFE_DOMAINS) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** get Favicon function. */
export function getFavicon(url: string): string {
  try {
    const faviconUrl = `${new URL(url).origin}/favicon.ico`;
    return isFaviconSafe(faviconUrl) ? faviconUrl : '';
  } catch {
    return '';
  }
}

/** extract Links function. */
export function extractLinks(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/** Escapes HTML entities to prevent XSS when using dangerouslySetInnerHTML */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Link Metadata interface definition. */
export interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: 'website' | 'image' | 'video' | 'article';
  favicon?: string;
}