// WhatsApp supported file types and size limits
// Based on official WhatsApp Business API documentation

/** File Type Config interface definition. */
export interface FileTypeConfig {
  extensions: string[];
  mimeTypes: string[];
  maxSizeMB: number;
  category: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  label: string;
}

/** W H A T S A P P_ F I L E_ T Y P E S constant. */
export const WHATSAPP_FILE_TYPES: Record<string, FileTypeConfig> = {
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMB: 16,
    category: 'image',
    label: 'Imagem'
  },
  video: {
    extensions: ['.mp4', '.3gp'],
    mimeTypes: ['video/mp4', 'video/3gpp'],
    maxSizeMB: 16,
    category: 'video',
    label: 'Vídeo'
  },
  audio: {
    extensions: ['.aac', '.amr', '.mp3', '.ogg', '.opus', '.m4a'],
    mimeTypes: [
      'audio/aac',
      'audio/amr',
      'audio/mpeg',
      'audio/ogg',
      'audio/opus',
      'audio/mp4'
    ],
    maxSizeMB: 16,
    category: 'audio',
    label: 'Áudio'
  },
  document: {
    extensions: [
      '.pdf',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.txt',
      '.csv',
      '.zip',
      '.rar'
    ],
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'application/zip',
      'application/x-rar-compressed',
      'application/vnd.rar'
    ],
    maxSizeMB: 100,
    category: 'document',
    label: 'Documento'
  },
  sticker: {
    extensions: ['.webp'],
    mimeTypes: ['image/webp'],
    maxSizeMB: 0.5, // 500KB
    category: 'sticker',
    label: 'Sticker'
  }
};

/** Returns all file extensions accepted by WhatsApp (e.g. `.jpg`, `.mp4`, `.pdf`). */
export const getAllowedExtensions = (): string[] => {
  return Object.values(WHATSAPP_FILE_TYPES).flatMap(config => config.extensions);
};

/** Returns all MIME types accepted by WhatsApp across image, video, audio, document, and sticker categories. */
export const getAllowedMimeTypes = (): string[] => {
  return Object.values(WHATSAPP_FILE_TYPES).flatMap(config => config.mimeTypes);
};

/** Builds a comma-separated accept string for an `<input type="file">` element covering all supported WhatsApp MIME types. */
export const getFileInputAccept = (): string => {
  return getAllowedMimeTypes().join(',');
};

/** Result returned by validateFile describing whether a file is accepted, its category, and size limit. */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
  category?: FileTypeConfig['category'];
  maxSizeMB?: number;
}

/** Validates a File against supported WhatsApp MIME types and per-category size limits. Returns valid=false with a localized error message on failure. */
export const validateFile = (file: File): FileValidationResult => {
  const mimeType = file.type.toLowerCase();
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  const fileSizeMB = file.size / (1024 * 1024);

  // Find matching file type config
  for (const [_key, config] of Object.entries(WHATSAPP_FILE_TYPES)) {
    const matchesMime = config.mimeTypes.includes(mimeType);
    const matchesExt = config.extensions.includes(extension);

    if (matchesMime || matchesExt) {
      if (fileSizeMB > config.maxSizeMB) {
        return {
          valid: false,
          error: `Arquivo muito grande. O limite para ${config.label.toLowerCase()} é ${config.maxSizeMB}MB. Seu arquivo tem ${fileSizeMB.toFixed(2)}MB.`,
          category: config.category,
          maxSizeMB: config.maxSizeMB
        };
      }
      return {
        valid: true,
        category: config.category,
        maxSizeMB: config.maxSizeMB
      };
    }
  }

  return {
    valid: false,
    error: `Tipo de arquivo não suportado: ${mimeType || extension}. Formatos aceitos: imagens (JPG, PNG, WebP), vídeos (MP4, 3GP), áudios (AAC, MP3, OGG, OPUS, M4A), documentos (PDF, DOC, XLS, PPT, TXT, CSV, ZIP, RAR).`
  };
};

/** Formats a byte count as a human-readable string (e.g. "1.2 MB", "512 KB", "256 B"). */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/** Resolves a MIME type string to a WhatsApp file category (image/video/audio/document/sticker), falling back to prefix-based detection. Returns null for unsupported types. */
export const getFileCategory = (mimeType: string): FileTypeConfig['category'] | null => {
  const mime = mimeType.toLowerCase();
  
  for (const config of Object.values(WHATSAPP_FILE_TYPES)) {
    if (config.mimeTypes.includes(mime)) {
      return config.category;
    }
  }
  
  // Fallback based on MIME prefix
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('application/') || mime.startsWith('text/')) return 'document';
  
  return null;
};

/** Returns the maximum allowed file size in MB for the given WhatsApp file category. Defaults to 16 MB when the category is not found. */
export const getMaxSizeForCategory = (category: FileTypeConfig['category']): number => {
  const config = Object.values(WHATSAPP_FILE_TYPES).find(c => c.category === category);
  return config?.maxSizeMB || 16;
};

/** Extracts the file extension from a filename (e.g. "photo.jpg" → "jpg"). Returns an empty string when no extension is present. */
export const getFileExtension = (fileName: string): string => {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
};

/** Extracts the filename from a URL path (e.g. "https://…/uploads/photo.jpg" → "photo.jpg"). Returns "file" when the URL is invalid or has no path segment. */
export const getFileNameFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/');
    return segments[segments.length - 1] || 'file';
  } catch {
    return 'file';
  }
};

// Contact types for categorization
/** C O N T A C T_ T Y P E S constant. */
export const CONTACT_TYPES = [
  { value: 'cliente', label: 'Cliente', color: 'bg-primary' },
  { value: 'fornecedor', label: 'Fornecedor', color: 'bg-secondary' },
  { value: 'colaborador', label: 'Colaborador', color: 'bg-accent' },
  { value: 'prestador_servico', label: 'Prestador de Serviço', color: 'bg-info' },
  { value: 'lead', label: 'Lead', color: 'bg-warning' },
  { value: 'parceiro', label: 'Parceiro', color: 'bg-destructive' },
  { value: 'sicoob_gifts', label: 'Sicoob Gifts', color: 'bg-primary' },
  { value: 'transportadora', label: 'Transportadora', color: 'bg-secondary' },
  { value: 'outros', label: 'Outros', color: 'bg-muted' },
] as const;

/** Union type of all valid contact type values (e.g. 'cliente', 'lead', 'parceiro'). */
export type ContactType = typeof CONTACT_TYPES[number]['value'];

/** Looks up the CONTACT_TYPES entry for the given type value. Falls back to the first entry (cliente) when no match is found. */
export const getContactTypeInfo = (type: string) => {
  return CONTACT_TYPES.find(t => t.value === type) || CONTACT_TYPES[0];
};
