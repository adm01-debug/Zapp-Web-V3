# Runbook — WARN `[useMediaUrl] media refresh failed … unknown` + 400 em `evolution-api/get-media-base64`

**Incidente de referência:** 2026-08-06 — WARN repetido no console F12:
`[useMediaUrl] media refresh failed for <instance>::<jid>::<msgid>: unknown — Edge Function returned a non-2xx status code`
acompanhado de respostas **400** na edge function `evolution-api` (ação `get-media-base64`).

**Causa raiz (dupla):**
- **(A) Bucket privado** — a migration LGPD P0-4 (`20260801060001`, aplicada 04/08) tornou o bucket
  `whatsapp-media` **privado** (`public=false`); o BUG-38 restaurou `audio-messages` mas não
  `whatsapp-media` → **18.494 objetos** inacessíveis via URL pública → `<img>/<video>` com `onError`
  em massa → storm de refresh. **Fix aplicado:** migration `20260806193000_whatsapp_media_bucket_public.sql`
  (`public=true` + policy `public_read_whatsapp_media` para `anon`).
- **(B) Mídia expirada no WhatsApp** — mídia antiga cuja URL assinada expirou / nunca foi baixada;
  a Evolution retorna **400 `Failed to fetch stream`**. Comportamento **legítimo** do WhatsApp, não é bug.

**Arquivos-chave:**
| Arquivo | Papel |
|---|---|
| `src/features/inbox/hooks/useMediaUrl.ts` | Hook que dispara o refresh e classifica o erro (origem do WARN) |
| `src/features/inbox/hooks/useMediaRefresh.ts` | Wrapper no-op / delegador para `useMediaUrl` |
| `supabase/functions/evolution-api/index.ts` | Edge fn proxy; rate limits (`evolution:${ip}` 120/min, `evolution-poll:${ip}` 600/min, `evolution-send:${instance}` 60/min) |
| `supabase/functions/_shared/validation.ts` | `checkRateLimit` (linha ~407) — limiter **in-memory por isolate** |
| `supabase/migrations/20260806193000_whatsapp_media_bucket_public.sql` | Fix da causa A (bucket público) |

---

## 1. Como o WARN é gerado (fluxo da falha)

1. `<img>`/`<video>` carrega uma URL assinada do WhatsApp que falha (410/403/erro de rede) → `onError`.
2. `useMediaUrl.runRefresh()` chama
   `POST supabase.functions.invoke('evolution-api/get-media-base64')` com
   `body: { instanceName, message: { key: { remoteJid, fromMe, id } } }`
   (dedupe in-flight + **máx. 2 tentativas** por `messageKey` — `DEFAULT_MAX_ATTEMPTS = 2`).
3. A edge fn valida `message.key` e faz proxy para a Evolution
   `POST /chat/getBase64FromMediaMessage/<instance>` (timeout 30s).
4. Se a Evolution responde erro, a edge fn **re-emite o status HTTP real** (400/403/404/410/504) com envelope JSON.
5. O frontend classifica: `410/403/expired/gone → expired` · `404 → not_found` ·
   `network/fetch/timeout → network` · `empty media payload/mimetype → unsupported` ·
   **qualquer outra coisa → `unknown`** (é aqui que o WARN nasce).
6. Esgotadas as 2 tentativas → `failed=true` + toast único por mídia (anti-flood).

> ⚠️ **Nuance crítica de diagnóstico:** o `cause.message` do WARN é a mensagem **genérica do supabase-js**
> (`Edge Function returned a non-2xx status code`) — o classificador NÃO vê o corpo do 400.
> Para ler o erro real do upstream (ex.: `Bucket not found` vs `Failed to fetch stream` vs
> `Rate limit exceeded`), abra o **Network tab → request `get-media-base64` → Response body**.
> Um **400** (e também um **429** da própria edge fn) cai em `unknown` — WARNs `unknown` NÃO significam
> necessariamente causa desconhecida: significam "status não classificado pelo hook".

---

## 2. Diagnóstico passo a passo

### Passo 0 — Coletar o WARN e o corpo do 400
1. Console F12 → filtrar `media refresh failed`. Anotar `instance::jid::msgid`, `reason`
   (`unknown | expired | not_found | network | unsupported`) e a mensagem do cause.
2. Network tab → filtrar `get-media-base64` → abrir uma request **400** → copiar o **Response body**
   (envelope JSON com `code`/`message` reais do upstream).

**Tabela de interpretação rápida do Response body:**
| Body do 400 | Diagnóstico | Ação |
|---|---|---|
| `{"error":true,"status":404,"message":"Bucket not found"}` (ou similar) | **Causa A — bucket privado** | Passo 1 |
| `400 … "Failed to fetch stream"` / `410 Gone` / `403` | **Causa B — mídia expirada** (legítimo) | Passo 2 |
| `{"error":"Rate limit exceeded"}` com status 429 | **Causa C — rate limit da edge fn** | §4 |
| `401 Unauthorized` | Chave da Evolution errada/defasada | Runbook 401 (referência no §5) |
| `404 … instance does not exist` | Instância errada/offline | Verificar `connectionState` da instância |
| 504/timeout após 30s | Evolution lenta/sobrecarregada | Checar container Evolution |

### Passo 1 — Causa A: bucket privado (verificar se o fix segue aplicado)

```bash
# 1) Testar uma URL pública do bucket whatsapp-media.
#    Extraia o path do <img src> que falhou (Network tab) ou do media_url da mensagem.
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://supabase.atomicabr.com.br/storage/v1/object/public/whatsapp-media/<path-do-media_url>"
```

- **200** → bucket OK, causa A descartada → vá ao Passo 2.
- **400/404** com `Bucket not found` → bucket privado (ou policy anon removida). Confirmar no banco:

```sql
SELECT name, public FROM storage.buckets
WHERE name IN ('whatsapp-media','audio-messages');
```

- `whatsapp-media.public = false` → **reaplicar o fix** da migration `20260806193000`:
  1. `UPDATE storage.buckets SET public = true WHERE name = 'whatsapp-media';`
  2. Criar a policy `public_read_whatsapp_media` (SELECT p/ `anon` em `storage.objects` onde `bucket_id='whatsapp-media'`).
- Checar também se **nenhuma migration posterior re-privatizou** o bucket:
  `grep -rn "public.*false" supabase/migrations/ | grep -i bucket` (ou `whatsapp-media`).
- **Assinatura típica da causa A:** WARN em massa (todas as mídias de todos os inboxes falham, não só as antigas).

### Passo 2 — Causa B: mídia expirada no WhatsApp (reproduzir o upstream)

Reproduzir manualmente a chamada que a edge fn faz, **dentro do container Evolution** (VPS):

```bash
# Exec no container do serviço evolution (via docker exec ou Portainer → Console)
K=$(cat /run/secrets/evolution_api_key_v4_20260704)   # confirme o secret atual: ls /run/secrets/

# Forma 1 — curl:
curl -s -X POST "http://localhost:8080/chat/getBase64FromMediaMessage/<instance>" \
  -H "apikey: $K" -H "Content-Type: application/json" \
  -d '{"message":{"key":{"id":"<msgid>","remoteJid":"<jid>","fromMe":false}}}'

# Forma 2 — node -e (equivalente, reproduz o fluxo original do diagnóstico):
K=$(cat /run/secrets/evolution_api_key_v4_20260704) node -e '
const K = process.env.K;
fetch("http://localhost:8080/chat/getBase64FromMediaMessage/<instance>", {
  method: "POST",
  headers: { apikey: K, "Content-Type": "application/json" },
  body: JSON.stringify({ message: { key: { id: "<msgid>", remoteJid: "<jid>", fromMe: false } } }),
}).then(async (r) => { console.log("HTTP", r.status); console.log((await r.text()).slice(0, 400)); });
'
```

Interpretação:
- **200 com `base64`** → mídia ainda disponível no WhatsApp; o problema NÃO é a mídia → revisitar Passo 1 / checar instância e chave.
- **400 `Failed to fetch stream` / 410 / 403** → **mídia expirada ou indisponível no WhatsApp** — comportamento legítimo (TTL de mídia não baixada, mensagem muito antiga, view-once). **Não é bug de infra.**
  - Ação correta é no frontend: classificar como `expired` e exibir fallback (ver recomendação R-3 no §4).
- **401** → chave errada/defasada → ver runbook de 401 (§5).
- **404 instance** → instância errada/offline.

### Passo 3 — Saúde do refresh: contagem de invocações da edge fn

O objetivo é detectar **storm** (muitas invocações/min de `get-media-base64`):

```bash
# No VPS — logs do Traefik (proxy público; ajuste o nome do serviço p/ seu ambiente):
docker service logs traefik_traefik --since 10m 2>&1 | grep -c 'get-media-base64'

# Pico por minuto (storm?): agrupar por minuto
docker service logs traefik_traefik --since 10m 2>&1 \
  | grep 'get-media-base64' | grep -oE '[0-9]{2}:[0-9]{2}' | uniq -c

# 429s da própria edge fn (rate limit estourado) no mesmo período:
docker service logs traefik_traefik --since 10m 2>&1 | grep -c '" 429 '
```

Também nos logs do edge-runtime (Supabase self-hosted):
```bash
docker service logs supabase_edge-runtime --since 10m 2>&1 | grep -i 'get-media-base64' | tail -50
```

**Interpretação:**
- Até ~20 invocações/min → tráfego normal de refresh.
- **> 60 invocações/min ou picos > 100/min** → storm (causa A recorrente ou inbox com muitas mídias quebradas) → ver §4 (rate limit).
- Presença de **429** (`Rate limit exceeded`) → o bucket `evolution:${ip}` (120/min) foi estourado → ver §4.

### Passo 4 — Quando escalar

| Situação | Escalar para | Com quê |
|---|---|---|
| WARN em massa (> dezenas/min) persistindo após bucket OK | Infra (VPS/Supabase) | Evidência do Passo 3 + verificar se a migration `20260806193000` está aplicada em produção (`supabase_migrations.schema_migrations`) |
| `unknown` + body `Rate limit exceeded` | Infra + dev frontend | Análise do §4 (bucket 120/min estourado) |
| 401 da Evolution nos 400s | Infra (chave/secret) | Runbook 401 (§5) |
| 100% das mídias falham (inclusive recentes) | Infra | Suspeitar causa A (storage) ou Evolution fora — checar `connectionState` da instância |
| 504/timeout em massa | Infra | Evolution/container sobrecarregado |

---

## 3. Análise de risco — rate limit da edge fn `evolution-api` (120/min/IP) × storms de refresh

### 3.1 Como o rate limit funciona hoje

Em `supabase/functions/evolution-api/index.ts` (linhas ~27-32):

```ts
const READ_ONLY_POLL_ACTIONS = new Set(['status', 'list-instances', 'instance-info', 'find-status-messages']);
const isPollAction = READ_ONLY_POLL_ACTIONS.has(pathAction);
const rl = isPollAction
  ? checkRateLimit(`evolution-poll:${ip}`, 600, 60_000)   // polling leve: 600/min
  : checkRateLimit(`evolution:${ip}`, 120, 60_000);        // tudo o mais: 120/min
```

- **`get-media-base64` NÃO é poll action** → cai no bucket **`evolution:${ip}` = 120 req/min**.
- O bucket é **compartilhado por IP** com todas as outras ações não-poll da edge fn
  (send-*, read-messages, connect, set-webhook, create-instance…). Envios têm bucket extra
  `evolution-send:${instance}` (60/min), mas o restante compete no mesmo 120.
- `checkRateLimit` é **in-memory por isolate** (Map em `_shared/validation.ts`; reseta em cold start).
  Com N isolates ativos, o teto efetivo real é ≈ N×120 — ou seja, o limite é **frouxo e não-determinístico**,
  mas quando um isolate individual estoura, o 429 sai com `Retry-After: 60`.
- **Um 429 da edge fn também vira WARN `unknown` no frontend** (o classificador não conhece 429),
  o que polui o console e confunde o diagnóstico.

### 3.2 Modelo de custo do refresh

- 1 mídia quebrada = **1 POST** `get-media-base64` por `onError` (dedupe in-flight);
  **2 tentativas máx** por `messageKey` → pior caso **N mídias quebradas = 2N POSTs**.
- O cap anti-storm no frontend **ainda não está em HEAD** (em implementação em outra branch) —
  hoje não há teto global de refreshes por sessão, apenas o dedupe por mídia.
- Cada falha 400 retorna rápido (centenas de ms) → um inbox com muitas mídias quebradas
  **esgota 120 POSTs em segundos**, não em minutos.

### 3.3 Cenários calculados (bucket `evolution:${ip}` = 120/min)

| Cenário | POSTs/min (pior caso 2N) | Folga no bucket 120 | Verdict |
|---|---|---|---|
| Inbox com 10 mídias quebradas | até 20 | ~100 livres | ✅ OK |
| Inbox com 30 mídias quebradas | até 60 | ~60 livres | ⚠️ Apertado com tráfego normal |
| Inbox com 40 mídias quebradas | até 80 | ~40 livres | ⚠️ Risco com inbox ativo (sends/reads no mesmo bucket) |
| Inbox com **50 mídias quebradas** | até **100** | **20 livres** | 🔴 **429 provável em minuto de uso ativo** |
| Inbox com 60+ mídias quebradas | 120+ | 0 | 🔴 **429 garantido** (sozinho, sem outro tráfego) |
| Incidente causa A (bucket privado): todas as mídias de todos os inboxes | centenas/min | — | 🔴 **429 massivo + WARN flood** (foi o cenário de 06/08) |

**Conclusão: SIM, o limite de 120/min é estourável por um inbox normal.**
- 50 mídias quebradas é realista em conversas longas (mídias antigas expiradas acumuladas);
  o limite prático de estouro cai para **~35–45 mídias quebradas/min** quando há tráfego normal
  (envios, leituras, webhooks) consumindo o mesmo bucket por IP.
- **Agravante:** o bucket é **por IP** — todos os agentes/abas atrás do mesmo NAT (escritório, VPS)
  somam no mesmo 120/min. Um agente com inbox cheio de mídias quebradas derruba o refresh
  de todos os outros atrás do mesmo IP.
- **Atenuante:** poll actions (600/min) têm bucket separado — o polling de status não compete.
- **Atenuante parcial:** por ser in-memory por isolate, o 429 nem sempre aparece no mesmo minuto
  em todos os isolates — mas isso é sorte, não controle.

### 3.4 Recomendações (proposta documentada — **NÃO aplicar sem aprovação**)

> Propostas abaixo são de design; **nenhuma mudança foi feita** no `index.ts` nem no frontend.

- **R-1 (recomendada) — bucket de rate limit separado para mídia:**
  usar `checkRateLimit(\`evolution-media:${ip}\`, 300, 60_000)` para a ação `get-media-base64`
  (e, idealmente, para as demais ações que fazem proxy de download pesado — `evolution-sync`,
  `migrate-media-storage`).
  - Efeito: storm de mídia **não rouba cota** de send/read (e vice-versa); teto de 300/min
    acomoda ~150 mídias quebradas com margem. Mudança de 1 bloco no `index.ts`.
- **R-2 (alternativa mais simples) — elevar o bucket geral de 120 → 300:**
  menor mudança, mas mantém o acoplamento mídia×demais ações (um storm de mídia ainda pode
  sufocar sends/reads de todos os usuários do IP).
- **R-3 (frontend — já em andamento em outra branch) — cap anti-storm + classificação:**
  1. fila de refreshes com concorrência limitada (ex.: 4–6 em voo) e teto por sessão
     (ex.: 40 refreshes/min);
  2. classificar `400`/`Failed to fetch stream` como **`expired`** (hoje cai em `unknown` e gera
     WARN falso-positivo em comportamento legítimo);
  3. classificar **429** como `rate_limited` (nova reason) para o diagnóstico parar de confundir
     `unknown` com rate limit.
- **R-4 (opcional, fora de escopo agora) — limiter rígido multi-isolate:**
  mover o counter do `checkRateLimit` para Postgres/Redis se limites precisos forem necessários
  (hoje o teto efetivo é ≈ N isolates × 120, não-determinístico).

**Decisão recomendada: R-1 + R-3.** O bucket separado é a mudança de menor risco e maior efeito
no backend; o cap anti-storm + classificação no frontend é a defesa principal contra auto-DoS
e contra WARN flood em comportamento legítimo (mídia expirada).

---

## 4. Timeline do incidente 2026-08-06 (referência)

| # | Momento | Evento |
|---|---|---|
| 1 | 04/08 | Migration LGPD P0-4 (`20260801060001`) privatiza `whatsapp-media` E `audio-messages` |
| 2 | ~04/08 | BUG-38 re-aplica `public=true` em `audio-messages` — `whatsapp-media` **fica privado** |
| 3 | 06/08 | Frontend: `onError` em massa nas mídias (URLs públicas 404 `Bucket not found`) → **storm de refresh** |
| 4 | 06/08 | Storm → centenas de POSTs `get-media-base64` → 400 do upstream (mídia expirada) → WARN flood `unknown` |
| 5 | 06/08 | **Fix A:** migration `20260806193000_whatsapp_media_bucket_public.sql` (`public=true` + policy anon) — aplicada |
| 6 | pendente | **Fix B (frontend):** classificar 400 como `expired`; cap anti-storm (outra branch) |
| 7 | pendente | **Fix C (backend):** bucket de rate limit separado para mídia (R-1) |

---

## 5. Referências

- Hook frontend: `src/features/inbox/hooks/useMediaUrl.ts` (classificador, cap 2 tentativas, dedupe, toast anti-flood)
- Edge fn: `supabase/functions/evolution-api/index.ts` (validação `message.key`, proxy 30s, rate limits, re-emissão de status)
- Rate limiter: `supabase/functions/_shared/validation.ts` → `checkRateLimit` (~linha 407; in-memory por isolate)
- Fix bucket: `supabase/migrations/20260806193000_whatsapp_media_bucket_public.sql` (BUG-MEDIA-20260806)
- Runbook 401 (chave/secret): `docs/RUNBOOK_401_WORKERS_EVOLUTION_20260806.md`
- Testes da ação: `supabase/functions/evolution-api/__tests__/get-media-base64.test.ts`
- Segredo Evolution: `evolution_api_key_v4_20260704` (confirmar nome atual em `/run/secrets/` do container; houve rotação v5 em 05/08)
