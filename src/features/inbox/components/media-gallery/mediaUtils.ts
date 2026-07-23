/** Media Item component for the media gallery section. */
export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  created_at: string;
  message_content: string;
}

/** get Media Type component for the media gallery section. */
export const getMediaType = (url: string, messageType: string): MediaItem['type'] => {
  const extension = url.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension) || messageType === 'image') return 'image';
  if (['mp4', 'webm', 'mov', 'avi'].includes(extension) || messageType === 'video') return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'opus'].includes(extension) || messageType === 'audio' || messageType === 'ptt') return 'audio';
  return 'document';
};

/** get Filename component for the media gallery section. */
export const getFilename = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.split('/').pop() || 'arquivo';
  } catch {
    return url.split('/').pop() || 'arquivo';
  }
};
