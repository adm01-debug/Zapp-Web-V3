# ADR-001 — Proibir URL absoluta em campos de mídia

**Status:** Aprovado  
**Data:** 2026-07-26  
**Autores:** Dev Sênior / Sistema de Correção Automática  

## Contexto

O banco está persistindo `http://kong:8000/storage/v1/object/public/...` em campos de mídia.  
`kong` é o hostname interno do API Gateway do Supabase self-hosted (Docker network).  
O browser não resolve esse hostname → `ERR_NAME_NOT_RESOLVED` em produção.

**Volumetria do problema (26/07/2026):**
- `evo.evolution_messages_wpp2.media_url`: 2.515 registros com `kong:8000`
- `evo.evolution_media.storage_url`: 2.525 registros com `kong:8000`
- `evo.evolution_contacts.profile_picture_url`: N registros com `kong:8000`

## Decisão

### Regra de Ouro
> **O banco NUNCA armazena URL absoluta em campos de mídia.**  
> A URL é construída em runtime, em um único ponto do código (`resolveMediaUrl`).

### O que o banco armazena
- `media_bucket` — nome do bucket (`whatsapp-media`, `avatars`, etc.)
- `media_path` — path relativo dentro do bucket (`image/ABC123_1234567890.jpg`)
- `media_mime` — tipo MIME (`image/jpeg`, `video/mp4`, etc.)
- `media_status` — enum: `pending | processing | ready | failed | expired`

### O que é proibido
- `http://kong:8000/...` — host interno
- `http://localhost/...` — host local
- `http://127.0.0.1/...` — IP loopback
- Qualquer URL com schema `http:` (deve ser `https:`)

### URL pública canônica
```
https://supabase.atomicabr.com.br/storage/v1/object/public/{bucket}/{path}
```

### Função resolveMediaUrl (frontend)
```typescript
const SUPABASE_STORAGE_URL = 'https://supabase.atomicabr.com.br/storage/v1/object/public';

export function resolveMediaUrl(
  bucket: string,
  path: string,
): string {
  return `${SUPABASE_STORAGE_URL}/${bucket}/${path}`;
}
```

## Consequências

- Backfill de todos os registros com `kong:8000` substituindo pelo host correto
- Trigger de banco bloqueando qualquer INSERT/UPDATE com host interno
- Frontend usa apenas `resolveMediaUrl()` — nenhuma concatenação direta de URL
- CI gate: `grep -r 'kong:8000\|localhost' src/` falha o build se encontrar algo

## Alternativa considerada

Usar Cloudflare R2 (`zapp-media-proxy.adm01.workers.dev`) para toda mídia nova.  
**Decisão:** manter Supabase Storage (já configurado, bucket público) para evitar uma migração durante a correção. R2 pode ser adotado incrementalmente.
