/**
 * stickerUpload.ts — Fluxo canônico de UPLOAD de figurinhas compartilhadas
 * (Etapa 44 / findings-04 A8).
 *
 * Correções aplicadas:
 *  - Upload SEMPRE para o bucket `stickers` (as rows legadas apontavam para
 *    `whatsapp-media/stickers/...` ou hosts mortos do Lovable Cloud).
 *  - Validação de tipo/tamanho ANTES do upload, alinhada ao bucket real de
 *    produção: `stickers` aceita apenas image/webp, image/gif e image/png
 *    (jpeg é rejeitado pelo storage — agora o usuário vê o motivo, não um
 *    erro genérico).
 *  - URL resolvida pelo helper canônico de signed URLs (getSignedMediaUrl):
 *    bucket público → URL direta (ADR-001, sem expiração); bucket privado →
 *    signed URL real. Nenhuma URL legada/hardcoded.
 *  - Erros HONESTOS: a mensagem real do storage/DB chega ao caller (toast),
 *    nunca `catch {}` silencioso nem texto genérico.
 */
import { supabase } from '@/integrations/supabase/client';
import { getSignedMediaUrl } from '@/lib/storageSignedUrls';

/** Bucket canônico de figurinhas (público em produção). */
export const STICKER_BUCKET = 'stickers';

/** Guarda de tamanho no frontend: 500KB (limite do bucket é 5MB, mas o UI usa 500KB). */
export const MAX_STICKER_SIZE = 500 * 1024;

/**
 * Tipos aceitos pelo bucket `stickers` em produção (allowed_mime_types):
 * image/webp | image/gif | image/png. JPEG é REJEITADO pelo storage — validar
 * antes evita upload que falha com "mime type not allowed".
 */
export const ACCEPTED_STICKER_TYPES = ['image/webp', 'image/gif', 'image/png'] as const;

/** Retorna a mensagem de erro de validação, ou null se o arquivo é válido. */
export function validateStickerFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return `"${file.name}" não é uma imagem.`;
  }
  if (!(ACCEPTED_STICKER_TYPES as readonly string[]).includes(file.type)) {
    return `"${file.name}": tipo ${file.type || 'desconhecido'} não aceito pelo bucket de figurinhas (use PNG, WEBP ou GIF).`;
  }
  if (file.size > MAX_STICKER_SIZE) {
    return `"${file.name}" excede 500KB.`;
  }
  return null;
}

export type UploadStickerResult =
  | { ok: true; path: string; url: string }
  | { ok: false; error: string };

/**
 * Upload de um arquivo para o bucket `stickers` + resolução da URL de exibição
 * via helper canônico (getSignedMediaUrl). NUNCA lança: erros retornam
 * { ok: false, error } com a mensagem real.
 */
export async function uploadStickerFile(file: File): Promise<UploadStickerResult> {
  const validationError = validateStickerFile(file);
  if (validationError) return { ok: false, error: validationError };

  const ext = (file.name.split('.').pop() || 'webp').toLowerCase();
  const path = `sticker_${Date.now()}_${crypto.randomUUID()}.${ext}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from(STICKER_BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    if (uploadError) {
      return { ok: false, error: uploadError.message || 'Falha ao enviar arquivo.' };
    }

    const url = await getSignedMediaUrl(STICKER_BUCKET, path, 604800);
    if (!url) {
      // O objeto foi gravado; sem URL de exibição a figurinha seria invisível.
      void supabase.storage.from(STICKER_BUCKET).remove([path]);
      return { ok: false, error: 'Falha ao resolver a URL da figurinha enviada.' };
    }

    return { ok: true, path, url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha ao enviar figurinha.',
    };
  }
}

/** Insere a row de figurinha compartilhada na tabela `stickers`. */
export async function insertStickerRow(input: {
  name: string;
  imageUrl: string;
  category: string;
  uploadedBy?: string | null;
}): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('stickers').insert({
      name: input.name,
      image_url: input.imageUrl,
      category: input.category,
      is_favorite: false,
      use_count: 0,
      uploaded_by: input.uploadedBy || null,
    });
    if (error) return { error: error.message || 'Falha ao salvar figurinha.' };
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao salvar figurinha.' };
  }
}

/** Remove o objeto do storage (cancelamento de upload pendente / best-effort). */
export async function removeStickerObject(path: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.storage.from(STICKER_BUCKET).remove([path]);
    if (error) return { error: error.message || 'Falha ao remover arquivo.' };
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao remover arquivo.' };
  }
}
