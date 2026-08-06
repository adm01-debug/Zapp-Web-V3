# Auditoria — Componentes de Mídia do Frontend (Inbox)

**Data:** 2026-08-06 · **Branch:** `audit/frontend-media` (worktree `C:/zapp-web-v3-wt-audit-ui`) · **HEAD:** a963b496f
**Escopo:** imagens/vídeos/áudios do inbox (WhatsApp/Evolution) — uso de `useMediaUrl`/`useMediaRefresh`, tratamento de erro/`failed`, fallback, retry infinito.
**Contexto do incidente:** bucket `whatsapp-media` ficou privado → `<img>`/`<video>` do inbox falharam em massa (400/404) → storm de refresh via `get-media-base64` → WARNs `media refresh failed ... unknown` no console. Fix de produção aplicado (bucket público). Esta auditoria verifica como o frontend trata os estados do hook para garantir UX correta e evitar recorrência.

---

## 1. Arquitetura de refresh (como funciona hoje)

```
<img onError> ──► useMediaRefresh(refreshKey) ──► useMediaUrl
                                                    │
  1. url inicial = originalUrl (media_url do DB)    │
  2. onError → runRefresh():                        │
     a. LRU em memória (mediaRefreshCache, 50MB/200)│
     b. media_cache no Postgres (hash da URL)       │
     c. supabase.functions.invoke('evolution-api/   │
        get-media-base64', {instanceName, message}) │
     d. sucesso → data URL (cacheia em memória+DB)  │
     e. falha → classifyError → error{reason,msg}   │
        attempts++ → failed=true após 2 tentativas  │
        toast único por mídia (anti-flood)          │
  3. failed=true → componente troca <img> por card  │
     de erro + botão "Tentar novamente" (retry      │
     zera contador)                                 │
```

**Pontos fortes já existentes** (não são gap):
- Cap de **2 tentativas** por messageKey + flag `failed` terminal → **não há retry infinito** em `useMediaUrl`.
- Dedupe in-flight (`inFlightRef`), `mountedRef` (sem setState/log pós-unmount), toast único por mídia.
- LRU em memória + persistência `media_cache` por `buildFileHash(originalUrl)` (F4-20/F4-21).
- Skip-list `UNREFRESHABLE_MESSAGE_TYPES` (sticker, ephemeral, ptv, viewOnce, vcard, contact, location, reaction, poll) — desliga refresh para tipos que nunca produzem base64.
- `messageType` propagado no `refreshKey` (FIX 2026-08-03, Gap 4) — **mas só em 2 dos 3 caminhos de bubble** (ver GAP-01).
- Áudio: signed URL com TTL 7d + HEAD check externo com cache (1 HEAD/URL/sessão) e **concorrência limitada a 2** — anti-rajada.
- Fallback com `failed`: MessageImage e VideoPreview trocam o elemento por card de erro com botão de retry manual.

---

## 2. Tabela — Componente × Hook × Erro × Fallback × Gap

| # | Componente / arquivo | Usa hook de refresh? | Trata error/failed? | Fallback? | GAP |
|---|---|---|---|---|---|
| 1 | **MessageImage** — `inbox/components/ImagePreview.tsx` (L112) | ✅ `useMediaRefresh` (L115) | ✅ `refresh.failed` → card erro + retry manual (L135–162) | ✅ spinner "Baixando imagem...", card `ImageOff` + botão | ⚠️ Sem `refreshKey` → `useMediaRefresh` devolve **noop** → `<img onError>` mudo → **img quebrada silenciosa** (GAP-02). `isLoaded` não reseta quando `effectiveSrc` muda (pulse overlay some cedo) |
| 2 | **ImagePreview (lightbox)** — `ImagePreview.tsx` (L91) | ❌ | ❌ | ❌ | Só alcançável com `effectiveSrc` OK — risco baixo (GAP-08) |
| 3 | **VideoPreview** — `inbox/components/MediaPreview.tsx` (L127) | ✅ `useMediaRefresh` (L135) | ✅ `refresh.failed` → card + retry (L156–191) | ✅ spinner + card `VideoOff` | Mesmos GAP-02/GAP-08 |
| 4 | **VideoFullscreen** — `VideoFullscreen.tsx` | ❌ | ❌ | ❌ | `<video>` sem `onError` (GAP-08, baixo risco) |
| 5 | **AudioMessagePlayer** — `AudioMessagePlayer.tsx` + `useAudioPlayer` (`hooks/useAudioManagement.ts` L467) | ✅ `refreshKey` → resolveAudioUrl (signed URL 7d → HEAD → `get-media-base64` L586–614) | ✅ `hasError` → "Erro ao carregar — toque para tentar" + retry no clique | ✅ toast de erro | ❌ Não usa `useMediaUrl`: **sem cap de tentativas, sem classificação de erro, sem media_cache**; retry é click-driven (não loop), mas duplica lógica (GAP-06). `get-media-base64` só é chamado se `urlExpired` (HEAD 410/403/404) |
| 6 | **StickerPreview / `<img>` sticker** — `messageBubbleParts.tsx` L159–165, `MediaPreview.tsx` L286 | ❌ (intencional: sticker na skip-list) | ❌ | ❌ | **Img quebrada silenciosa** sem placeholder (GAP-03) |
| 7 | **DocumentPreview** — `MediaPreview.tsx` L46 | ❌ | n/a | n/a | Não renderiza mídia (download bloqueado por política) — ok |
| 8 | **ReplyQuote (thumbnail de citação)** — `ReplyQuote.tsx` L61–66 | ❌ | ❌ | ❌ | `<img>` cru sem onError → **thumb quebrada silenciosa** (GAP-04) |
| 9 | **InteractiveMessage (header com imagem)** — `InteractiveMessage.tsx` L78 | ❌ | ❌ | ❌ | `<img>` cru sem onError (GAP-05, menos comum) |
| 10 | **MediaGallery → MediaCard** — `media-gallery/MediaCard.tsx` L58 | ❌ | ✅ `onError` → ícone fallback (L60) | ✅ | Sem refresh/retry na galeria (GAP-07) |
| 11 | **MediaGallery → MediaPreviewDialog** — `media-gallery/MediaPreviewDialog.tsx` L33–35 | ❌ | ❌ | ❌ | `<img>`/`<video>`/`<audio>` crus → **modal com mídia quebrada** (GAP-07) |
| 12 | **MediaGallery → MediaGalleryListView** | ❌ | n/a | n/a | Só ícones/nomes — ok |
| 13 | **SharedMediaAccordionItem** | ❌ | n/a | n/a | Só contagem + botão — ok |
| 14 | **StoryViewer (status)** — `contact-details/StoryViewer.tsx` L104 | ✅ `useEvolutionApi().getMediaBase64` direto | ✅ `mediaError` → fallback texto (L107–111, L173/181) | ✅ | Instância **hardcoded** `DEFAULT_INSTANCE_NAME`; sem retry manual na falha (GAP-09) |
| 15 | **Avatar (bubble)** — `chat/MessageBubble.tsx` L166 | ❌ | ✅ remove `src` → fallback iniciais | ✅ | ok |
| 16 | **LinkPreview** — `LinkPreview.tsx` | ❌ | ✅ `onError` → esconde imagem | ✅ | Fora do escopo (links, não mídia WhatsApp) — ok |
| 17 | **ChatMessageBubble** — `chat/ChatMessageBubble.tsx` L96–107 | ✅ monta `refreshKey` **com** `messageType` | via componentes | via componentes | ✅ ok — **mas não é usado pela lista principal** |
| 18 | **VirtualMessageBubble** — `VirtualMessageBubble.tsx` L53–62 | ✅ monta `refreshKey` **com** `messageType` | via componentes | via componentes | ✅ ok — exportado no index, uso residual |
| 19 | **MessageBubble** — `chat/MessageBubble.tsx` L107–113 | ✅ monta `refreshKey` — **GAP-01 corrigido nesta auditoria** (messageType adicionado, mesmo padrão do ChatMessageBubble) | via componentes | via componentes | ✅ (antes: 🔴 sem `messageType` — era o componente renderizado por `ChatMessagesArea` (L25/L407), lista principal da inbox!) |

**Caminho ativo de produção:** `ChatMessagesArea` → `MessageBubble` (chat/) → `MessageBubbleBody` (`messageBubbleParts.tsx`) → `MessageImage`/`VideoPreview`/`AudioMessagePlayer` com `mediaRefreshKey`. O FIX Gap 4 (messageType) havia sido aplicado apenas em ChatMessageBubble/VirtualMessageBubble; **nesta auditoria foi propagado ao MessageBubble (GAP-01)** — agora os 3 caminhos propagam `messageType`.

---

## 3. Hooks — verificação

### `src/features/inbox/hooks/useMediaUrl.ts` (canônico)
- Estados expostos: `url`, `isRefreshing`, `error` (classificado: `expired | not_found | network | unsupported | unknown`, com mensagem pt-BR), `failed`, `attempts`, `onError`, `retry`/`refresh`.
- Proteções: `mountedRef` (L176–182), dedupe `inFlightRef` (L198), cap `maxAttempts` default 2 (L135, L310–321), toast único via `toastedKeys` (L315–318), LRU `mediaRefreshCache` (L27, L206), cache persistente `media_cache` por hash (L215–239, L265–287), skip-list por `messageType` (L201–203).
- `onError` respeita `failed` (L337–340) → **sem loop**.
- ✅ Conforme. Coberto por `hooks/__tests__/useMediaUrl.test.ts` e `mediaRefreshCache.test.ts`.

### `src/features/inbox/hooks/useMediaRefresh.ts` (wrapper)
- Sem `refreshKey` → retorna `{url:null, isRefreshing:false, error:null, failed:false, onError:noop}` (L52–62) — **o componente continua com o `src` original e ignora erros silenciosamente** (comportamento documentado no próprio arquivo, L8–10). É exatamente isso que causa o GAP-02: não há como o componente distinguir "sem refreshKey" de "URL ok".

### `src/hooks/useAudioManagement.ts` (useAudioPlayer — áudio do inbox)
- `resolveAudioUrl` (L534–619): ① `createSignedUrl` 7d para URLs `/storage/v1/` dos buckets `whatsapp-media`/`audio-messages` (funciona mesmo com bucket privado); ② HEAD check externo com cache por URL + **máx. 2 concorrentes** (L31–80); ③ fallback `get-media-base64` via `refreshKey` **somente se `urlExpired`** (L586).
- Erro: `hasError` (L657–662) → UI "Erro ao carregar — toque para tentar" + retry no clique (L695–709) + toasts. **Retry é manual/click-driven — não há loop infinito.**
- GAP-06: não usa `useMediaUrl` → sem cap, sem classificação, sem cache LRU/DB. Duplicação de lógica com o hook canônico.

### `src/hooks/useEvolutionApiManagement.ts` (getMediaBase64, L1095–1099)
- Apenas wrapper de `callApi` (com retries via `dynCfg.maxRetries`). **Não é usado pelos players do inbox** (estes chamam `supabase.functions.invoke('evolution-api/get-media-base64')` direto). Usado por **StoryViewer** (trata erro → fallback de texto). ✅ conforme; GAP-09 menor (instância hardcoded).

---

## 4. GAPs priorizados

### 🔴 P0 — Nenhum
Não há retry infinito nem falha catastrófica de UX no caminho crítico **quando o refreshKey existe**. O storm do incidente foi contido no frontend por cap 2 + dedupe + toast único.

### 🟠 P1

**GAP-01 — `MessageBubble` (caminho principal) não propaga `messageType` no refreshKey** — ✅ **CORRIGIDO nesta auditoria** (fix trivial aplicado em `src/features/inbox/components/chat/MessageBubble.tsx` L107–120; diff no worktree `audit/frontend-media`, não commitado).
- Antes: mensagens `ptv`/`viewOnce`/`ephemeral`/`sticker` com `mediaUrl` disparavam refresh `get-media-base64` que **sempre falha** → WARN `media refresh failed ... unknown` + toast "Mídia indisponível" desnecessário para tipos não-recarregáveis. **Parte do ruído do incidente persistia por causa disso** (o fix de 2026-08-03 só existia em ChatMessageBubble/VirtualMessageBubble, que não são usados pela lista principal).

**GAP-02 — Sem `refreshKey` ⇒ img/vídeo quebrado silencioso (sem fallback)**
- `MessageImage`/`VideoPreview`: quando `instanceName`, `contactJid` ou `external_id` faltam (mensagens antigas, envios otimistas, mensagens do DB sem external_id), `useMediaRefresh` vira noop → `<img onError>` mudo → ícone de imagem quebrada do browser, sem card, sem retry.
- Fix sugerido: `useMediaRefresh` (ou o componente) deve sinalizar "sem refreshKey" — ex.: retornar `failed=true`/`error={reason:'unknown'}` quando `src` falhar SEM refreshKey, ou expor `refreshKeyProvided` para o componente renderizar o card de erro (sem botão de retry, ou com retry que depende do caller).

**GAP-03 — Modal da galeria de mídia sem tratamento de erro**
- `media-gallery/MediaPreviewDialog.tsx` L33–35: `<img>`/`<video>`/`<audio>` crus — mídia expirada/404 aparece quebrada no modal, sem fallback nem mensagem.
- Fix sugerido: `onError` → estado de erro com ícone + mensagem ("Mídia expirada ou indisponível"), e para imagens reusar o padrão de fallback do `MediaCard`.

### 🟡 P2

**GAP-04 — Thumbnail de citação (`ReplyQuote.tsx` L61–66)** — `<img>` cru sem onError → thumb quebrada silenciosa. Fix: `onError` → esconder a thumb (decorativa).

**GAP-05 — Header de imagem em `InteractiveMessage.tsx` L78** — idem; `onError` → fallback de ícone.

**GAP-06 — Duplicação de lógica de refresh de áudio** — `useAudioPlayer` repete `get-media-base64` sem cap/classificação/cache. Fix: consolidar em `useMediaUrl` (ou extrair o resolve de storage/HEAD para um helper compartilhado), mantendo o HEAD-check com concurrency 2 e o TTL 7d.

**GAP-07 — Galeria sem refresh/retry** — `MediaCard` tem fallback de ícone, mas sem "Tentar novamente"; para o usuário, mídia expirada na galeria é permanentemente quebrada até reabrir a conversa. Fix: reusar `useMediaRefresh` no `MediaCard` (imagens) ou ao menos botão de retry por item.

**GAP-08 — `ImagePreview`/`VideoFullscreen` sem onError** — risco baixo (só alcançáveis com URL que já carregou), mas 1 linha cada: `onError` → estado de erro/close.

**GAP-09 — `StoryViewer` com instância hardcoded e sem retry** — `DEFAULT_INSTANCE_NAME` (L104); falha → fallback texto sem "Tentar novamente". Menor (status view).

**GAP-10 — Fan-out de refresh em falha em massa (recomendação de resiliência)**
- Hoje: cap de 2 por mensagem + dedupe in-flight + LRU **por mensagem**. Mas numa falha em massa (incidente 2026-08-06), N mensagens quebram juntas → até **2×N chamadas simultâneas** a `get-media-base64` (o WARN `unknown` do incidente). Não há semáforo global nem cooldown por falha.
- Fix sugerido (padrão já usado no áudio): **semáforo global de refresh** (ex.: máx. 4–5 concorrentes) + **cooldown por instanceName** (ex.: se `unknown`/`network` em lote, pausar novos refreshes por 30–60s — espelha o cooldown 60s do `frontend-resilience-patterns`). Isso impede o frontend de amplificar degradação do backend.

**GAP-11 — `isLoaded` não reseta ao trocar `effectiveSrc`** — `MessageImage`/`VideoPreview` mantêm `isLoaded=true` após refresh → overlay pulse não reaparece (cosmético).

---

## 5. Resumo executivo

| Dimensão | Status |
|---|---|
| Retry infinito | ❌ Não existe no caminho com refreshKey (cap 2 + `failed` terminal + dedupe) |
| Fallback com erro + retry manual (imagem/vídeo) | ✅ MessageImage / VideoPreview |
| Fallback de áudio | ✅ hasError + retry no clique (sem cap, mas manual) |
| Img quebrada silenciosa | ⚠️ Sticker, ReplyQuote, InteractiveMessage, MediaPreviewDialog, e qualquer mídia sem refreshKey |
| Storm de refresh em falha em massa | ⚠️ Contido por mensagem, **sem contenção global** (GAP-10) |
| Skip-list por tipo de mensagem | ✅ Aplicada nos 3 caminhos de bubble (GAP-01 corrigido nesta auditoria) |
| Cobertura de testes do hook | ✅ useMediaUrl.test.ts + mediaRefreshCache.test.ts |

**Ações recomendadas (ordem):**
1. **P1/GAP-01** — adicionar `messageType` no `mediaRefreshKey` de `chat/MessageBubble.tsx` (1 linha; elimina refresh inútil e WARNs para ptv/ephemeral na lista principal).
2. **P1/GAP-02** — sinalizar ausência de refreshKey nos componentes para nunca ter img quebrada muda.
3. **P1/GAP-03** — onError + fallback no `MediaPreviewDialog`.
4. **P2/GAP-10** — semáforo global + cooldown por falha no `useMediaUrl` (anti-storm em incidentes futuros).
5. **P2/GAP-04..09** — onError nos `<img>` restantes e consolidação do refresh de áudio.

---

## 6. Arquivos auditados (referência)

- `src/features/inbox/hooks/useMediaUrl.ts` (370 linhas — hook canônico)
- `src/features/inbox/hooks/useMediaRefresh.ts` (77 linhas — wrapper noop)
- `src/features/inbox/hooks/mediaRefreshCache.ts` (LRU 50MB/200)
- `src/hooks/useAudioManagement.ts` (L452–817 — useAudioPlayer)
- `src/hooks/useEvolutionApiManagement.ts` (L1095–1099 — getMediaBase64)
- `src/features/inbox/components/ImagePreview.tsx` (MessageImage L112)
- `src/features/inbox/components/MediaPreview.tsx` (VideoPreview L127, DocumentPreview L46, StickerPreview L286, MediaMessage L319)
- `src/features/inbox/components/AudioMessagePlayer.tsx`
- `src/features/inbox/components/VideoFullscreen.tsx`
- `src/features/inbox/components/chat/MessageBubble.tsx` (L107 — GAP-01), `ChatMessageBubble.tsx` (L96 — ok), `messageBubbleParts.tsx` (L109–166), `ChatMessagesArea.tsx` (L25/L407 — caminho ativo)
- `src/features/inbox/components/VirtualMessageBubble.tsx` (L53 — ok)
- `src/features/inbox/components/ReplyQuote.tsx` (L61 — GAP-04), `InteractiveMessage.tsx` (L78 — GAP-05)
- `src/features/inbox/components/MediaGallery.tsx`, `media-gallery/MediaCard.tsx`, `media-gallery/MediaPreviewDialog.tsx` (GAP-03), `media-gallery/MediaGalleryListView.tsx`
- `src/features/inbox/components/contact-details/StoryViewer.tsx` (L104), `SharedMediaAccordionItem.tsx`
- `src/types/mediaRefresh.ts` (MediaRefreshKey)
