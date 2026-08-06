# Incidente — Bucket `whatsapp-media` privado → mídia 400/404 + storm de refresh (2026-08-06)

- **Data do incidente:** 2026-08-01/04 (aplicação do P0-4) → 2026-08-06 15:17Z (fix A aplicado)
- **Janela de exposição:** bucket `whatsapp-media` privado por ~2 dias (04/08 → 06/08 15:17Z; o header da migration P0-4 registra aplicação original já em 01/08)
- **Serviço afetado:** Supabase Storage (bucket `whatsapp-media`, **18.494 objetos**) + Edge Function `evolution-api/get-media-base64` + frontend ZAPP Web (hook `useMediaUrl`)
- **Impacto:** TODA URL pública `storage/v1/object/public/whatsapp-media/*` retornando **400/404 `Bucket not found`**; `<img>`/`<video>` com `onError` em massa → storm de refresh; mídia antiga (expirada no CDN do WhatsApp) classificada como `unknown`
- **Status:** ✅ RESOLVIDO em produção — Fix A aplicado em 2026-08-06 15:17Z (12:17 BRT); Fixes B **em andamento** (branches `fix/edge-media-expired` e `audit/frontend-media`)
- **Classificação:** indisponibilidade de mídia (não é incidente de segurança — o bucket voltou ao estado **público** documentado na ADR-002, que era a realidade de produção antes do P0-4)
- **Documentado em:** 2026-08-06 (worktree `C:/zapp-web-v3-wt-docs`, branch `docs/incidente-media` — **não commitado**)

---

## 1) Síntese

O bucket `whatsapp-media` (imagens/vídeos/documentos do WhatsApp, **18.494 objetos**) ficou
**privado** (`public=false`) por efeito colateral de uma migration de hardening LGPD, e o fix
paralelo (BUG-38) restaurou **somente** o bucket `audio-messages`. Com o bucket privado, toda
URL pública `storage/v1/object/public/whatsapp-media/*` passou a responder **400/404
`Bucket not found`**, derrubando a exibição de mídia no ZAPP Web e gerando um **storm de
refresh** no console (F12): dezenas de GET/POST repetidos para
`supabase.atomicabr.com.br/functions/v1/evolution-api/get-media-base64` e WARN
`[useMediaUrl] media refresh failed ... unknown`.

Sobreposto a isso, um segundo problema independente: mídia **antiga** (>~24h–30d) expira no
CDN do WhatsApp — o upstream Evolution retorna 400 ao buscar o stream em `mmg.whatsapp.net`
e a edge re-emite 400, que o frontend classifica como `unknown` (o body do erro não é lido).

O **Fix A** (migration versionada `20260806193000_whatsapp_media_bucket_public.sql`, aplicada
**2026-08-06 15:17Z**) restaurou `public=true` + policy anon SELECT + auth INSERT no bucket,
com verificação positiva via curl (HTTP 200, `video/mp4`, 739 KB). Os **Fixes B** (leitura do
body do erro com status **410 MEDIA_EXPIRED**, cap anti-storm, re-emissão de 410 pela edge)
seguem em andamento nas branches `fix/edge-media-expired` e `audit/frontend-media`.

## 2) Causa raiz

### Causa A — bucket `whatsapp-media` ficou privado (migrations em cadeia)

1. **P0-4 (LGPD)** — `20260801060001_buckets_privados_lgpd.sql` (auditoria P0-4 / etapa 6),
   consolidada no canonical `20260804000000_canonical_schema.sql` (seção na linha 10811),
   executou:
   ```sql
   DROP TRIGGER IF EXISTS trg_enforce_whatsapp_media_public ON storage.objects;
   DROP FUNCTION IF EXISTS storage.fn_enforce_public_buckets CASCADE;
   UPDATE storage.buckets SET public = false WHERE name IN ('whatsapp-media', 'audio-messages');
   ```
   Ou seja: removeu o trigger/função que **forçava** `public=true` e tornou **ambos** os
   buckets privados, presumindo migração do front para `createSignedUrl()` (o header da
   migration registra aplicação original em produção em 2026-08-01, "APOS o deploy do front
   com signed URLs — PR #665").
2. **BUG-38** — o fix original (`archive/20260727000000`) **nunca foi deployado**: (a) ficou
   em `archive/` em vez de `supabase/migrations/`; (b) `RAISE NOTICE` fora de bloco DO →
   erro de sintaxe → rollback silencioso da transação inteira. A re-aplicação no canonical
   (seção `20260802000001_fix_audio_messages_bucket_bug38.sql`, linha 12936) restaurou
   **apenas** `audio-messages` (`public=true` + MIME types + policies). **`whatsapp-media`
   permaneceu privado.**
3. **Efeito em produção:** toda URL pública `storage/v1/object/public/whatsapp-media/*` →
   `{"statusCode":404,"error":"Bucket not found"}` (HTTP 400 no path raiz). A stack inteira
   (edge `_shared/evolution-media.ts` via `getStoragePublicUrl` + frontend) gera/consome
   URLs **públicas** desse bucket — **nenhum produtor usa signed URLs** na prática → mídia
   toda invisível + `<img>`/`<video>` com `onError` em massa → **storm de refresh**.

### Causa B — mídia expirada no CDN do WhatsApp + classificação `unknown`

- Mídia antiga (>~24h–30d) **expira no CDN do WhatsApp**; o upstream Evolution retorna
  `400 Error: Failed to fetch stream from https://mmg.whatsapp.net/...` (reproduzido
  **dentro do container** da Evolution com a chave real da instância).
- A edge function re-emite o 400; o frontend classifica **tudo** como `unknown` porque o
  `FunctionsHttpError` do supabase-js só expõe a `message` genérica ("Edge Function returned
  a non-2xx status code") — **o body do erro não é lido** → não há como distinguir "bucket
  privado" de "mídia expirada".

## 3) Timeline

Horários em **UTC** e **BRT (UTC−3)**. Apenas marcos com hora registrada têm hora exata.

| # | Data | Hora (UTC) | Hora (BRT) | Evento |
|---|---|---|---|---|
| 1 | 01/08 | — | — | Migration LGPD **P0-4** (`20260801060001`) criada; header registra aplicação em produção em 01/08 (buckets `whatsapp-media` e `audio-messages` → `public=false`; trigger `trg_enforce_whatsapp_media_public` removido) |
| 2 | 04/08 | — | — | Canonical `20260804000000_canonical_schema.sql` aplicado em produção — **re-aplica** o P0-4 e o **BUG-38** (seção `20260802000001`); BUG-38 restaura **somente** `audio-messages`; **`whatsapp-media` fica privado** |
| 3 | 04/08 → 06/08 | — | — | Janela de exposição: URLs públicas `whatsapp-media/*` → 400/404 `Bucket not found`; mídia invisível no ZAPP Web |
| 4 | 06/08 | (hora não registrada) | (hora não registrada) | Detecção via console F12: `Failed to load resource: 400` em `.../functions/v1/evolution-api/get-media-base64` + WARN `[useMediaUrl] media refresh failed ... unknown` + dezenas de GET/POST repetidos |
| 5 | 06/08 | ~15:17Z | ~12:17 | **Fix A aplicado**: migration `20260806193000_whatsapp_media_bucket_public.sql` — `public=true` + policy anon SELECT + auth INSERT no bucket `whatsapp-media` |
| 6 | 06/08 | pós-fix | pós-fix | **Verificação positiva**: `curl` no objeto `video/3A5FF65C29C771B14CC7_1783713237642.mp4` → **HTTP 200, `video/mp4`, 739 KB** |
| 7 | 06/08 | em andamento | — | **Fixes B** (branches `fix/edge-media-expired`, `audit/frontend-media`): `classifyError` lê body → **410 MEDIA_EXPIRED**; cap anti-storm; edge re-emite 410 |

## 4) Sintomas (console F12 do ZAPP Web)

- `Failed to load resource: 400` para `supabase.atomicabr.com.br/functions/v1/evolution-api/get-media-base64` (repetido dezenas de vezes — GET/POST em loop).
- WARN do hook de mídia:
  ```
  [useMediaUrl] media refresh failed for wpp2::5511972944651@s.whatsapp.net::3A5FF65C29C771B14CC7: unknown — Edge Function returned a non-2xx status code
  ```
- Mídia (imagens/vídeos/documentos) não carrega nas conversas; `onError` em massa → storm de refresh.

## 5) Diagnóstico — evidências

| # | Evidência | Detalhe | Interpretação |
|---|---|---|---|
| E1 | `curl` no storage | `GET /storage/v1/object/public/whatsapp-media/*` → 400/404 `Bucket not found` | Bucket privado (Causa A) |
| E2 | Reprodução do upstream dentro do container | Com a chave real da instância, fetch do stream `https://mmg.whatsapp.net/...` → `400 Error: Failed to fetch stream from ...` | Mídia antiga expirada no CDN do WhatsApp (Causa B) |
| E3 | Drift de hashes `_shared` (imagem × repo) | `evolution-media.ts`: volume **3816b2dd10c0** vs repo **00f2c8c167a1**; `evolution-api-proxy.ts`: volume **815e1a18d30c** vs repo **b1ee0c22ca8b** | Containers rodando versões diferentes do repo — dificulta debug e propaga comportamento divergente |
| E4 | Contagem de mensagens com mídia | **7.430** mensagens com `media_url` em `whatsapp-media` (≈ **1.830 ready** + **5.600 unknown**) | Escala do impacto; maioria das mídias não resolvia |
| E5 | Objetos no bucket | **18.494 objetos** no bucket `whatsapp-media` | Todo o histórico de mídia do WhatsApp afetado enquanto privado |
| E6 | Migration P0-4 no canonical | Linha 10811: `UPDATE storage.buckets SET public = false WHERE name IN ('whatsapp-media','audio-messages')` | Origem do `public=false` |
| E7 | BUG-38 no canonical | Linha 12936: seção `20260802000001_fix_audio_messages_bucket_bug38.sql` restaura **apenas** `audio-messages` | Por que `whatsapp-media` ficou para trás |

## 6) Correções

### Fix A — APLICADO em produção (2026-08-06 15:17Z)

Migration versionada **`supabase/migrations/20260806193000_whatsapp_media_bucket_public.sql`**
(alinhada ao padrão do BUG-38):

1. `UPDATE storage.buckets SET public = true WHERE name = 'whatsapp-media'` (unconditional);
2. Policy **`public_read_whatsapp_media`** — SELECT para `anon` em `storage.objects` (defense-in-depth junto do flag `public`);
3. Policy **`auth_write_whatsapp_media`** — INSERT para `authenticated` (preservada, idempotente);
4. `allowed_mime_types` permanece NULL (sem restrição — como antes do P0-4).

Rollback documentado na própria migration (UPDATE `public=false` + DROP das 2 policies).

### Fixes B — EM ANDAMENTO (branches `fix/edge-media-expired` e `audit/frontend-media`)

- `classifyError` passa a **ler o body** da resposta da edge → mídia expirada vira **410 MEDIA_EXPIRED** (em vez de `unknown` genérico);
- **cap anti-storm** no refresh de mídia (limita tentativas repetidas);
- edge function re-emite **410 MEDIA_EXPIRED** para mídia expirada no upstream.

## 7) Verificação

- Após o Fix A: `curl` no objeto `video/3A5FF65C29C771B14CC7_1783713237642.mp4` →
  **HTTP 200, `Content-Type: video/mp4`, 739 KB** (URL pública volta a funcionar).
- Query de conferência do estado do bucket:
  ```sql
  SELECT name, public FROM storage.buckets WHERE name = 'whatsapp-media';
  -- esperado: public = true
  ```

## 8) Lições aprendidas

1. **Migrations de hardening (LGPD) que alteram flags de storage precisam de verificação pós-aplicação POR BUCKET** — o BUG-38 restaurou só `audio-messages` e ninguém validou `whatsapp-media` (18.494 objetos). Um check de `storage.buckets` após qualquer deploy de migration teria pego na hora.
2. **Fix que nunca deploya (BUG-38 original)** — arquivo em `archive/` em vez de `supabase/migrations/` + `RAISE NOTICE` fora de DO block → rollback silencioso. Lição dupla: migrations precisam de gate de CI (sintaxe PL/pgSQL) e de estar no diretório correto.
3. **Frontend cego ao body do erro** — `FunctionsHttpError` só expõe `message` genérica; sem ler o body, "bucket privado" e "mídia expirada" são indistinguíveis (`unknown`). O status **410 MEDIA_EXPIRED** resolve a classificação.
4. **Storm de refresh amplifica incidente** — `onError` em massa + retry sem cap transforma um erro de storage em carga alta de edge function; cap anti-storm é necessário.
5. **ADR conflitantes** — ADR-002 (bucket PÚBLICO) × ADR-004 (bucket PRIVADO): a realidade de produção antes do incidente era pública (ADR-002), e o P0-4 reverteu isso sem reconciliação da stack de produtores (que não usa signed URLs). Decisão de bucket público/privado precisa de auditoria de TODOS os produtores antes de mudar.
6. **Drift imagem × repo (`_shared`)** — hashes diferentes (E3) indicam que o deploy de edge functions não acompanhou o repo; a reconciliação de hashes deve ser parte do pipeline (edge-drift-check).

## 9) Prevenção / monitoramento

- **Alerta se o bucket ficar privado** — query de monitoramento (watchdog read-only):
  ```sql
  SELECT name, public FROM storage.buckets
  WHERE public = false AND name IN ('whatsapp-media', 'audio-messages');
  -- qualquer linha retornada = bucket de mídia privado → alertar imediatamente
  ```
- Incluir essa checagem no drift-check de edge/storage (CI ou watchdog periódico), cobrindo os dois buckets de mídia do WhatsApp.
- Mergear os **Fixes B** (410 MEDIA_EXPIRED + cap anti-storm) para eliminar o storm de refresh residual e classificar corretamente mídia expirada.
- Antes de qualquer nova migration que mexa em `storage.buckets`: auditar produtores (signed URLs vs URLs públicas) e validar TODOS os buckets afetados pós-aplicação.

---

## Referências

- `supabase/migrations/20260806193000_whatsapp_media_bucket_public.sql` (Fix A — untracked no repo, aplicada em produção)
- `supabase/migrations/20260804000000_canonical_schema.sql` — seções `20260801060001_buckets_privados_lgpd.sql` (linha 10811) e `20260802000001_fix_audio_messages_bucket_bug38.sql` (linha 12936)
- `docs/ADR-002-bucket-public.md` e `docs/ADR-004_REVOGA_BUCKET_PUBLICO.md` (decisões conflitantes de visibilidade do bucket)
- Branches de fix em andamento: `fix/edge-media-expired`, `audit/frontend-media`
