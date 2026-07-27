# CSP + Storage 400 — Baseline Documentation
**Data:** 2026-07-27  
**Baseline commit:** `91bb6ecd5240d73b376ed3cf1dac421818ee1cda`  
**Image tag:** `zapp-web:production-latest@sha256:3c2650172b714a27d7148855db1d416b0474f7d7d00d694ff07b6be8ce0c3f9d`

---

## BUG-1: CSP img-src (~44x)
- **Sintoma:** `img-src 'self' data: blob: https:` (nginx) — aceita tudo https, mas fontes não-HTTPS ou específicas podem falhar
- **Fonte identificada:** `supabase/migrations-from-lovable/_deploy/security-headers.conf` (NGINX) + eventual Traefik middleware
- **Status:** `img-src` é permissivo demais (`https:` = qualquer domínio HTTPS)

## BUG-2: CSP media-src (~9x)
- **Sintoma:** `media-src 'self' blob: data:` — **FALTA `supabase.atomicabr.com.br`**
- **Fonte:** `security-headers.conf` linha 12
- **Impacto direto:** áudios do Supabase storage NÃO carregam por CSP

## BUG-3: Áudio .ogg → HTTP 400
- **Sintoma:** `GET .../storage/v1/object/public/audio-messages/audio/*.ogg 400`
- **Causa-raiz mais provável:** bucket `audio-messages` = **não público** (CLAUDE.md confirmed)
- **Requisição passa pelo CSP** mas retorna 400 do storage-api

## BUG-4: `Audio error` no app
- **Consequência:** BUG-2 (CSP) + BUG-3 (400) = áudio indisponível

---

## Storage Buckets (from CLAUDE.md audit 2026-07-16)

| Bucket | Público | Limite |
|--------|---------|--------|
| audio-memes | não | 5 MB |
| **audio-messages** | **não** ← CAUSA DO 400 | — |
| avatars | sim | 5 MB |
| comprobantes-financeiro | não | 20 MB |
| custom-emojis | sim | 512 KB |
| email-attachments | não | — |
| etiquetas-remessa | não | 10 MB |
| fechamentos | não | 20 MB |
| quarantine | não | — |
| recibos-entrega | sim | 10 MB |
| stickers | sim | 512 KB |
| team-chat-files | não | — |
| whatsapp-media | não | — |

---

## CSP em produção (nginx, security-headers.conf)

```
img-src 'self' data: blob: https:;
media-src 'self' blob: data:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://*.atomicabr.com.br wss://*.atomicabr.com.br;
```

**Problemas identificados:**
- `media-src` NÃO contém `https://supabase.atomicabr.com.br` → áudios bloqueados
- `img-src` com `https:` é permissivo demais
- `connect-src` usa `*.supabase.co` mas o projeto é `*.atomicabr.com.br` (self-hosted)

---

## Ação: Buscar exec no supabase-db-mcp via Bash (curl)
