# Auditoria de Produtores de Media URL / Upload de Storage — 2026-08-06

- **Data:** 2026-08-06
- **Repo:** zapp-web-v3 — HEAD `a963b496f` (worktree `C:/zapp-web-v3-wt-audit-prod`, branch `audit/media-producers`)
- **Motivação:** incidente 2026-08-06 — bucket `whatsapp-media` ficou privado (`public=false`, migration LGPD P0-4 `20260801060001` aplicada 04/08) e **toda a stack gera URLs PÚBLICAS** (`/storage/v1/object/public/...`) para ele → 18.494 objetos quebrados. Fix em produção: `20260806193000_whatsapp_media_bucket_public.sql` (public=true + policy anon SELECT). Esta auditoria mapeia **todos** os produtores de `media_url`/upload para garantir que nenhum bucket privado receba URL pública e que não haja outro bucket na mesma situação.
- **Método:** ripgrep em `supabase/functions/**`, `src/**`, `infra/**`, `scripts/**` por `storage.from(`, `getPublicUrl`, `createSignedUrl`, `getStoragePublicUrl`, `object/public`, `media_url`, `mediaUrl`; leitura de cada ponto produtor; confronto com migrations (LGPD P0-4, BUG-38, BUG-MEDIA) e com a lista canônica de buckets do código (`src/lib/mediaUrl.ts`).
- **Observação:** a migration de fix `20260806193000_whatsapp_media_bucket_public.sql` está **untracked** no repo principal (não commitada) — precisa ser commitada para o estado "public=true" virar contrato do repo (detalhe no §7).

---

## 1) Inventário de buckets — público × privado (design × migrations)

| Bucket | Design (task/owner) | Migrations no repo | Como o CÓDIGO trata | Verdicto |
|---|---|---|---|---|
| `avatars` | público | — (nenhuma migration define) | público (`PUBLIC_BUCKETS`) | ✅ OK |
| `custom-emojis` | público | — | público | ✅ OK |
| `recibos-entrega` | público | — | público | ✅ OK |
| `stickers` | público | — | público | ✅ OK |
| `audio-messages` | público (BUG-38) | `20260802000001_fix_audio_messages_bucket_bug38` (public=true + anon SELECT), dentro da canonical `20260804000000` | **privado** no frontend (signed URL) | ✅ OK (defesa em profundidade) |
| `whatsapp-media` | público (ADR-002 + BUG-MEDIA `20260806193000`) | `20260801060001` (privado, LGPD — **causa raiz**) + `20260806193000` (public=true, fix) | **privado** no frontend (signed URL); **público** nas edge functions (`getStoragePublicUrl`) | ⚠️ OK-CONDICIONAL (ver GAP-0) |
| `audio-memes` | **privado** | — (nenhuma migration define; estado real em produção NÃO verificado nesta auditoria de código) | **público** (`PUBLIC_BUCKETS` inclui `audio-memes`) | ❌ **GAP** (ver GAP-1..4) |
| `team-chat-files` | privado | — | privado (signed URL) | ✅ OK |
| `email-attachments` | privado | — | privado (nenhuma URL gerada; grava `storage_path`) | ✅ OK |
| `comprovantes-financeiro`, `etiquetas-remessa`, `fechamentos`, `quarantine` | privado | — | sem produtores de URL/upload no repo | ✅ OK (não referenciados) |

> `docs/SCHEMA_REFERENCE.md` **não documenta buckets** (0 ocorrências de "bucket"). As fontes canônicas são: `docs/adr/ADR-002-bucket-public.md` (whatsapp-media público), `docs/adr/ADR-001-media-url-storage.md` (bucket+path, nunca URL absoluta), `src/lib/mediaUrl.ts` `PUBLIC_BUCKETS` (lista de código) e as migrations LGPD/BUG-38/BUG-MEDIA.

---

## 2) Tabela principal — produtor × bucket × tipo de URL × status

Legenda: **OK** = correto; **OK-COND** = gera URL pública para bucket público *por design*, mas é exatamente o padrão que quebrou no incidente (depende de `public=true` no storage); **GAP** = gera URL pública para bucket **privado** (ou trata privado como público).

### 2.1 Edge Functions (`supabase/functions/**`)

| # | Produtor (arquivo:linha) | Bucket | Tipo de URL gerada | Status |
|---|---|---|---|---|
| E1 | `_shared/evolution-media.ts:91-106` `persistMediaToStorage` (upload + `getStoragePublicUrl`) | `audio-messages` / `whatsapp-media` | **pública** (`/storage/v1/object/public/...`) | ⚠️ OK-COND — **vetor raiz do incidente 06/08** (18.494 objetos) |
| E2 | `_shared/evolution-media.ts:187-205` `persistMediaViaApi` (upload + `getStoragePublicUrl`) | `audio-messages` / `whatsapp-media` | **pública** | ⚠️ OK-COND — vetor raiz |
| E3 | `_shared/evolution-webhook-messages.ts:247-249, 268-269` `handleStickerMedia` (upload `stickers/` + `getStoragePublicUrl`) | `whatsapp-media` | **pública** | ⚠️ OK-COND — vetor raiz |
| E4 | `_shared/evolution-webhook-messages.ts:217, 223` (INSERT/UPDATE `media_url` em evolution_messages com URL herdada de E1/E2/E3) | `whatsapp-media` / `audio-messages` | pública (persistida) | ⚠️ OK-COND — vetor raiz |
| E5 | `_shared/evolution-helpers.ts:426-436` (upload avatar + `getStoragePublicUrl`) | `avatars` | **pública** | ✅ OK (público por design) |
| E6 | `batch-fetch-avatars/index.ts:95-100` (upload + `getStoragePublicUrl` → `contacts.avatar_url`) | `avatars` | **pública** | ✅ OK |
| E7 | `fetch-whatsapp-avatar/index.ts:151` (retorna `avatar_url`) | `avatars` | **pública** | ✅ OK |
| E8 | `migrate-media-storage/index.ts:296-305` `uploadToStorage` (cron; upload + `getStoragePublicUrl`) | `audio-messages` / `whatsapp-media` | **pública** | ⚠️ OK-COND — vetor raiz |
| E9 | `recover-corrupted-audios/index.ts:119-123` (upload + URL montada **manualmente**: `${SUPABASE_URL}/storage/v1/object/public/audio-messages/...`, `SELFHOSTED_SUPABASE_URL` → fallback `SUPABASE_URL`) | `audio-messages` | **pública** (montada à mão) | ⚠️ OK-COND + nota: se só `SUPABASE_URL` (kong:8000) estiver setado, grava host interno no banco |
| E10 | **`voice-changer/index.ts:250-256`** (upload `voice-changer/results/` + `getStoragePublicUrl` → `voice_conversion_queue.output_audio_url`) | **`audio-memes`** | **pública** | ❌ **GAP ALTO** (bucket privado por design) |
| E11 | `secure-upload/index.ts:68-69, 178-198` (allowlist `ALLOWED_BUCKETS = {whatsapp-media, audio-messages}`; upload + `createSignedUrl` 3600s) | `whatsapp-media` / `audio-messages` | **signed** (1h) | ✅ OK (TTL curto — ver §4-obs) |
| E12 | `gmail-sync/index.ts:879-905` (upload + grava `storage_path` em `email_attachments`; **nenhuma URL** gerada) | `email-attachments` | nenhuma (bucket+path) | ✅ OK (alinhado ao ADR-001) |
| E13 | `cleanup-storage-orphans/index.ts:27-109` (list/delete órfãos) | `audio-messages` / `whatsapp-media` | nenhuma (delete) | ✅ OK |
| E14 | `ai-router/index.ts:3716-3740` (download admin p/ transcrição) | `whatsapp-media` / `audio-messages` | nenhuma (download) | ✅ OK |
| E15 | `_shared/evolution-api-proxy.ts:327-344` `resolvePrivateBucketUrl` (**defesa**: reescreve URL pública → signed 300s antes de enviar ao Evolution) — usada em `evolution-api/index.ts:131` | `whatsapp-media` / `audio-messages` (default) | **signed** (5min) | ✅ OK (defesa em profundidade) |
| E16 | `_shared/storage-url.ts:31-35` `getStoragePublicUrl` (helper usado por E1-E10) | genérico | **pública** | — (helper; docstring diz "só buckets públicos", mas **não valida**) |

### 2.2 Frontend (`src/**`)

| # | Produtor (arquivo:linha) | Bucket | Tipo de URL gerada | Status |
|---|---|---|---|---|
| F1 | **`lib/mediaUrl.ts:202-208`** `PUBLIC_BUCKETS` (lista canônica) | **inclui `audio-memes`**; exclui whatsapp-media/audio-messages | — (config) | ❌ **GAP** (raiz dos GAPs F3/F4/F5 — diverge do design) |
| F2 | `lib/mediaUrl.ts:86-90, 265-269, 287-315` `resolveMediaUrl` / `resolvePublicStorageUrl` / `resolveMessageMediaUrl` (URL pública síncrona p/ `isBucketPublic`) | público (`PUBLIC_BUCKETS`) | **pública** | ❌ GAP herdado p/ `audio-memes`; ✅ OK p/ demais |
| F3 | **`hooks/useAudioManagement.ts:236`** `resolvePublicStorageUrl('audio-memes', storagePath)` (catálogo de memes) | **`audio-memes`** | **pública** | ❌ **GAP ALTO** |
| F4 | **`features/inbox/components/VoiceChangerPicker.tsx:199-203`** (upload `voice-changer/` + `resolvePublicStorageUrl('audio-memes', ...)` → `onSendAudio`) | **`audio-memes`** | **pública** | ❌ **GAP ALTO** |
| F5 | `lib/storageSignedUrls.ts:82-115` `getSignedMediaUrl` (bucket privado → `createSignedUrl` com cache; **fallback: URL pública quando a assinatura falha**) | privados (ex.: whatsapp-media, team-chat-files, audio-messages) | **signed** + fallback público | ✅ OK com **RISCO** (fallback GAP latente — ver §4) |
| F6 | `lib/useMediaUrl.ts:236-260` `useSignedMediaUrlBatch` (`createSignedUrls` 3600s, 1 chamada/bucket; público → síncrono) | privados | **signed** (1h) | ✅ OK |
| F7 | `hooks/useAudioManagement.ts:1174-1184` `uploadAudio` (upload + `createSignedUrl` 604800) | `audio-messages` | **signed** (7d) | ✅ OK |
| F8 | `hooks/useAudioManagement.ts:546, 578` `resolveAudioUrl` (re-assina `whatsapp-media`/`audio-messages`) | `whatsapp-media` / `audio-messages` | **signed** (7d) | ✅ OK |
| F9 | `hooks/useAudioRecorder.ts:374-384` (upload + `createSignedUrl` 3600) | `audio-messages` | **signed** (1h) | ✅ OK (TTL curto — ver §4) |
| F10 | `hooks/useKnowledgeBase.ts:155-160` (upload + `createSignedUrl` 86400 → `knowledge_base_files.file_url`) | `whatsapp-media` | **signed** (24h) | ✅ OK (TTL — ver §4) |
| F11 | `features/inbox/hooks/useScheduledMediaUpload.ts:44-49` (upload + `createSignedUrl` 604800) | `whatsapp-media` | **signed** (7d) | ✅ OK |
| F12 | `features/inbox/hooks/realtime/externalMessageSender.ts:140-148` `sendExternalMedia` (upload + `createSignedUrl` 604800) | `whatsapp-media` | **signed** (7d) | ✅ OK |
| F13 | `features/inbox/components/chat/hooks/useChatScheduleMessage.ts:39-43` (upload + `createSignedUrl` 604800) | `whatsapp-media` | **signed** (7d) | ✅ OK |
| F14 | `features/inbox/components/useFileUploadLogic.ts:115-116` → invoca `secure-upload` (E11); grava `media_url` em `messages` (L188) | `whatsapp-media` | **signed** (1h, via secure-upload) | ✅ OK (TTL 1h — ver §4) |
| F15 | `features/inbox/components/TeamFiles.tsx:72-90` (upload `team-files/{contactId}/` + `getSignedMediaUrl` 604800 → `whisper_files.file_url`) | `whatsapp-media` | **signed** (7d) | ✅ OK (TTL — ver §4) |
| F16 | `components/team-chat/useTeamChatPanel.ts:239-248` (upload + `getSignedMediaUrl` 604800) | `team-chat-files` | **signed** (7d) | ✅ OK |
| F17 | `hooks/useTeamChatDraft.ts:90-95` (upload + `getSignedMediaUrl` 604800) | `team-chat-files` | **signed** (7d) | ✅ OK |
| F18 | `hooks/usePersonalStickers.ts:147`, `hooks/sticker-picker/useStickerPicker.ts:263,336`, `hooks/media-library/useMediaLibraryManagement.ts:167` | `stickers` / `custom-emojis` | remove (sem URL) | ✅ OK |
| F19 | `features/admin/hooks/useDiagnosticsData.ts:179` (health check: `list`) | `whatsapp-media` | nenhuma (read-only) | ✅ OK |

---

## 3) GAPs — detalhamento

### GAP-1 (ALTO) — `audio-memes` tratado como bucket público em 4 pontos — ✅ RESOLVIDO (decisão do dono 2026-08-06)
> **Decisão do dono (Joaquim, 2026-08-06): bucket PÚBLICO.** Memes de áudio não contêm PII; a onda de segurança paralela reverteu `public=true` indevidamente (migration `20260806194000`), sem versionar. Reaplicado `public=true` em produção e adicionado ao gate fail-closed do watchdog (`scripts/sql/media-bucket-verification.sql` — seções E/G agora cobrem `audio-memes`).
`audio-memes` era **privado por design** (não deve conter PII, mas a decisão do owner é bucket privado). Porém:

- `supabase/functions/voice-changer/index.ts:256` — grava `output_audio_url` **pública** (`getStoragePublicUrl('audio-memes', ...)`) em `voice_conversion_queue`.
- `src/features/inbox/components/VoiceChangerPicker.tsx:203` — gera URL **pública** ao enviar áudio transformado.
- `src/hooks/useAudioManagement.ts:236` — catálogo de memes de áudio com URL **pública**.
- `src/lib/mediaUrl.ts:202-208` — `PUBLIC_BUCKETS` **inclui `audio-memes`** (raiz: `isBucketPublic('audio-memes') === true` faz todos os resolvedores usarem URL pública).

**Impacto se `audio-memes` estiver `public=false`:** voz transformada + memes de áudio quebram no mesmo padrão do incidente whatsapp-media (URL pública → 404 "Bucket not found"). **O estado real do bucket em produção não é definido por nenhuma migration do repo** (0 ocorrências de `audio-memes` em `supabase/migrations/`) — precisa ser verificado em `storage.buckets` e alinhado: ou (a) declarar `public=true` + anon SELECT (como BUG-38/BUG-MEDIA) se o produto exige URL pública, ou (b) migrar os 4 produtores para signed URL e remover `audio-memes` do `PUBLIC_BUCKETS`.

### GAP-2 (MÉDIO) — Fallback público no `getSignedMediaUrl` (`src/lib/storageSignedUrls.ts:97-115`) — ✅ CORRIGIDO (2026-08-06)
> **Status:** corrigido no commit da onda de fixes — o fallback agora retorna `null` + `log.error` (o caller trata null com fallback de UI; sem URL quebrada silenciosa).
Quando `createSignedUrl` falha (sessão ausente/erro), o helper **retorna a URL pública do bucket** (`resolveMediaUrl`) com `log.warn`. Isso foi escrito quando os buckets ainda eram públicos; hoje, para buckets realmente privados (`team-chat-files`, `audio-memes`, `email-attachments`), o fallback **gera URL quebrada silenciosamente**. Mitigação: retornar `null` + log de erro em vez do fallback público (o próprio `resolvePrivateMediaUrl` em `mediaUrl.ts:330-344` já faz isso corretamente).

### GAP-3 (MÉDIO/ARQUITETURAL) — ADR-001 não implementado: produtores persistem URL absoluta em `media_url`
Todos os produtores (E1-E4, E8-E10, F11-F17) gravam **URL absoluta** (pública ou signed) em `messages.media_url` / `evolution_messages.media_url` / tabelas auxiliares. O formato canônico `media_bucket` + `media_path` (ADR-001) **não é escrito por nenhum produtor** (só lido pelos resolvedores). Consequência prática: URLs públicas persistidas dependem do flag `public` no momento da *exibição*, não no momento da escrita — exatamente o que transformou o incidente em 18.494 objetos quebrados de uma vez. Signed URLs persistidas (F15/F16/F17, E11) **expirarão** e quebram no display sem re-assinatura.

### GAP-4 (BAIXO) — `recover-corrupted-audios` monta URL pública manualmente — ✅ CORRIGIDO (2026-08-06)
> **Status:** corrigido no commit da onda de fixes — agora usa `getStoragePublicUrl` (ADR-001, resolve o host público); `SUPABASE_URL` removido.
`supabase/functions/recover-corrupted-audios/index.ts:123` concatena `${SUPABASE_URL}/storage/v1/object/public/audio-messages/...`. Usa `SELFHOSTED_SUPABASE_URL` primeiro (OK), mas se o env não estiver setado cai em `SUPABASE_URL` (kong:8000 interno) e grava host interno no banco — o ADR-001 proíbe. Deveria usar `getStoragePublicUrl` (que já resolve o host público).

---

## 4) Observações e riscos (não são GAPs de visibilidade, mas merecem registro)

1. **TTLs curtos de signed URL persistida no banco:** `useAudioRecorder` e `secure-upload`/`useFileUploadLogic` geram signed URLs de **1h** que são persistidas em `messages.media_url`; `useKnowledgeBase` 24h; demais 7d. Mensagens agendadas com delay > TTL, retry-stuck-messages re-enviando `media_url` do banco, e `whisper_files.file_url`/`knowledge_base_files.file_url` lidos sem re-assinatura quebram após expirar. Alguns consumidores já re-assinam (`useAudioManagement.resolveAudioUrl`); outros não.
2. **`resolvePrivateBucketUrl` (E15) cobre só `whatsapp-media`/`audio-messages`** — se outros buckets privados entrarem no fluxo de envio Evolution (ex.: `team-chat-files`), a defesa não reescreve.
3. **`secure-upload` (E11)** — allowlist correta (whatsapp-media/audio-messages) e signed URL; é o caminho canônico de upload do chat (useFileUploadLogic).
4. **Defesa em profundidade existente:** o frontend trata `whatsapp-media`/`audio-messages` como privados (signed) mesmo com buckets públicos — se um futuro P0-4 re-privatizar, o frontend sobrevive; **as edge functions E1-E4/E8-E9 (getStoragePublicUrl) não sobrevivem** — são o elo frágil.
5. **`docs/SCHEMA_REFERENCE.md` não documenta buckets** — a matriz público/privado vive só em ADRs + código; sem teste de contrato (ex.: assertion de que `PUBLIC_BUCKETS` ⊆ buckets com `public=true` no banco), o drift volta a acontecer.

---

## 5) Recomendações (prioridade)

1. **P0 — Resolver a ambiguidade do `audio-memes`:** verificar `storage.buckets.public` em produção; se privado, converter E10/F3/F4 para signed URL (`getSignedMediaUrl`) e remover `audio-memes` de `PUBLIC_BUCKETS`; se público, criar migration declarando `public=true` + policy anon (padrão BUG-38/BUG-MEDIA).
2. **P1 — Commit da migration fix** `20260806193000_whatsapp_media_bucket_public.sql` (hoje untracked) para o contrato do repo refletir `whatsapp-media public=true`.
3. **P1 — Remover o fallback público** do `getSignedMediaUrl` (GAP-2).
4. **P1 — Teste de contrato buckets:** CI que cruza `PUBLIC_BUCKETS` (frontend) + `getStoragePublicUrl` (edge) contra o estado real dos buckets (ou contra uma migration de referência) — evita o próximo P0-4 silencioso.
5. **P2 — ADR-001 de verdade:** produtores passarem a gravar `media_bucket`/`media_path` e resolvedores montarem URL no display (mata a classe inteira de incidentes).
6. **P2 — Padronizar TTL:** signed URLs persistidas ≥ 7d (ou não persistir signed URL, apenas bucket+path).
7. **P2 — `recover-corrupted-audios`:** usar `getStoragePublicUrl` (GAP-4).

---

## 6) Anexo — comandos de varredura usados

```
rg -l 'getPublicUrl|createSignedUrl|getStoragePublicUrl' src supabase/functions
rg -l 'storage\.from\(|object/public' src supabase/functions
rg -n 'storage\.from\(|getPublicUrl|createSignedUrl|getStoragePublicUrl|object/public' src supabase/functions
rg -n -i 'storage.?buckets|public = false|public = true' supabase/migrations
rg -n -o "'(whatsapp-media|audio-messages|audio-memes|avatars|stickers|custom-emojis|recibos-entrega|team-chat-files|quarantine|comprovantes-financeiro|email-attachments|etiquetas-remessa|fechamentos)'" src supabase infra scripts
```

**Resumo executivo:** 27 produtores mapeados (16 edge functions + 19 pontos frontend, com sobreposição). **3 GAPs reais** (cadeia `audio-memes` — 4 pontos de código; fallback público em `storageSignedUrls`; URL manual em `recover-corrupted-audios`) + 1 GAP arquitetural (ADR-001 não implementado) + 1 classe de risco (TTLs de signed URL). A cadeia `whatsapp-media`/`audio-messages` (E1-E4/E8-E9) segue gerando URL pública por design (ADR-002 + fix BUG-MEDIA) — **OK após o fix de 06/08, mas é o elo que quebrou e continua sem proteção contra re-privatização**.
