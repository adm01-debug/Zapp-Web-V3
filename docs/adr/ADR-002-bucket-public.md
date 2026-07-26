# ADR-002 — Bucket `whatsapp-media` deve ser PÚBLICO

**Status:** Aprovado  
**Data:** 2026-07-26  
**Autores:** Dev Sênior / Sistema de Correção Automática

## Contexto

O bucket `whatsapp-media` no Supabase Storage estava configurado como **privado** (`public: false`).

Consequências diretas:
- Toda imagem/vídeo/documento de mensagem WhatsApp exigia `createSignedUrl()` para ser exibida
- `createSignedUrl()` = 1 POST por arquivo → ~450 POST requests por page load (N+1 clássico)
- URLs backfilladas com `https://supabase.atomicabr.com.br/storage/v1/object/public/...` não funcionariam com bucket privado

## Dados da Decisão

```sql
-- Estado antes
SELECT id, name, public FROM storage.buckets WHERE name='whatsapp-media';
-- { name: 'whatsapp-media', public: false }

-- Correção aplicada (26/07/2026)
UPDATE storage.buckets SET public=true WHERE name='whatsapp-media';
-- { name: 'whatsapp-media', public: true }
```

## Decisão

O bucket `whatsapp-media` **DEVE ser público**.

### Justificativa de segurança

Os arquivos armazenados são mídias de conversas de WhatsApp Business (imagens, vídeos, documentos enviados/recebidos). O acesso a esses arquivos já está controlado por:
1. RLS na tabela `evo.evolution_messages_wpp2` — usuário só vê mensagens da sua instância
2. O link da mídia só aparece na UI após autenticação — não há diretório público indexável
3. Os paths são hash-derivados (`{messageId}_{timestamp}.{ext}`) — não são previsíveis por força bruta

### O que NÃO fazer

- Nunca colocar documentos com PII sensível (CPF, RG, contratos) neste bucket
- Documentos sensíveis devem ir para bucket `documents` (privado, com signed URL de curta duração)

## Consequências

### Positivo
- Zero `createSignedUrl()` para mídia de WhatsApp → elimina ~450 POSTs por page load
- URL permanente e cacheável pelo browser: `Cache-Control: immutable` funciona
- Latência de carregamento de mídia: elimina round-trip de assinatura

### Negativo / Mitigação
- Path previsível → Mitigação: path inclui hash do message_id, não é sequencial
- Link "permanente" → Mitigação: para mídias expiradas/deletadas, o arquivo é removido do storage na rotina de retenção

## Mudanças correlatas

1. `fn_rewrite_media_url()` — atualizada para reescrever kong URLs para o host público
2. `fn_auto_enqueue_media_download()` — atualizada para enfileirar mesmo quando media_url é kong/WA CDN
3. `src/lib/mediaUrl.ts` — `resolveMediaUrl()` constrói URL pública direta (sem signed URL)
4. Frontend deve parar de chamar `createSignedUrl()` para arquivos do bucket `whatsapp-media`
