# ADR-009 — Gateway Pattern para Evolution API

**Status:** Accepted  
**Data:** 2026-08-13  
**Contexto:** Conclusão do Plano de Desacoplamento 100 Etapas

---

## Contexto

O Plano de Desacoplamento separou o schema `evo` (propriedade do Evolution API) do schema `zapp` (lógica de negócio do Zapp Web). Como parte desse processo, as 17 edge functions que liam `EVOLUTION_API_URL` diretamente foram centralizadas em um único gateway.

## Decisão

**Toda comunicação HTTP com a Evolution API passa por `_shared/providers/evolution/client.ts`.**

```
❌ ANTES (17 edge fns):          ✅ DEPOIS (1 gateway):
fn-A → Deno.env.get(...)         fn-A ─┐
fn-B → Deno.env.get(...)         fn-B ─┤→ evolutionClient → Evolution API
fn-C → fetch(EVOLUTION_API_URL)  fn-C ─┘
```

## Arquitetura

```
supabase/functions/
  _shared/
    providers/
      evolution/
        client.ts      ← Único ponto de leitura de EVOLUTION_API_URL
        index.ts       ← Barrel export
      registry.ts      ← Resolve client por provider (E68)
```

### `evolutionClient` — 11 verbos

| Verbo | Endpoint |
|---|---|
| sendText | POST /message/sendText/{instance} |
| sendMedia | POST /message/sendMedia/{instance} |
| sendSticker | POST /message/sendSticker/{instance} |
| getConnectionState | GET /instance/connectionState/{instance} |
| getQrCode | GET /instance/connect/{instance} |
| restartInstance | DELETE /instance/restart/{instance} |
| listInstances | GET /instance/fetchInstances |
| listGroups | GET /group/fetchAllGroups/{instance} |
| checkWhatsApp | POST /chat/whatsappNumbers/{instance} |
| getProfilePicture | POST /chat/fetchProfilePictureUrl/{instance} |
| get / post | Genérico para casos não cobertos |

### Características

- **Retry automático**: max 2 tentativas, backoff exponencial (500ms, 1s, 2s, 4s max)
- **Timeout configurável**: default 30s
- **API Key centralizada**: lida uma única vez, passada via header `apikey`
- **Type-safe**: `EvolutionClientConfig`, `EvolutionResponse<T>`

## Consequências

**Positivas:**
- Trocar a URL/key do servidor é uma mudança em 1 ponto (env secret)
- Retry e timeout são uniformes em todas as funções
- `inventory.mjs` detecta 0 bypasses
- Futuros providers (Meta Cloud API) podem ser adicionados via `registry.ts`

**Negativas/Trade-offs:**
- Funções que precisam de comportamento customizado de retry podem precisar usar `evolutionFetch` direto (mas ainda centralizado)

## Referência

- E67-E87 do `docs/decouple/PLANO_DESACOPLAMENTO_100_ETAPAS.md`
- Ondas de migração: E69-E72 (Onda 1A), E73-E76 (1B), E77-E82 (2), E83-E87 (3)
