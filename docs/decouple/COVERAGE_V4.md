# COVERAGE_V4 — Cobertura real do desacoplamento de mensageria WhatsApp

> **Gerado por** `scripts/decouple/coverage-report.mjs` — não editar manualmente.
> **Data:** 2026-08-14 · **Commit:** 56de9f2c3 · **Branch:** docs/hermes-h713641-v4-onda3

## Veredito

| Métrica | Valor |
|---|---|
| Actions do router (`supabase/functions/evolution-api/index.ts`) | 41 |
| Verbos com contrato Zod (`contract.zod.ts`) | 12 |
| Verbos do fake (`providers/fake/index.ts`) | 12/12 |
| **Cobertura de contrato** | **8/41 = 19,5%** |

🔴 **Cobertura < 100%** — ver [Gaps conhecidos](#gaps-conhecidos).

## Fórmula

```
cobertura_contrato = verbos_com_zod / actions_totais
                   = 8 / 41
                   = 19,5%
```

- **`actions_totais`** (denominador): TODAS as operações reais roteadas pelo router da edge function `evolution-api` (`if (action === '...')` em `supabase/functions/evolution-api/index.ts`). São 41 — a métrica NÃO usa só os 12 verbos do client (seria inflar).
- **`verbos_com_zod`** (numerador): actions cuja operação tem verbo **equivalente** no contrato Zod do gateway (`providers/evolution/contract.zod.ts` — 12 verbos). Equivalência por endpoint da Evolution API, auditada contra `providers/evolution/client.ts` (tabela `ACTION_TO_VERB` do script). Os verbos genéricos `get`/`post` do contrato NÃO contam para actions específicas — são escape hatch do `evolution-proxy`, não contrato de operação (sem inflar).

### Métricas auxiliares (para não inflar)

| Métrica | Valor | Significado |
|---|---|---|
| Cobertura efetiva de roteamento | 0/41 (0%) | Actions que HOJE roteiam pelo `evolutionClient` contratado. Todas usam `proxyToEvolution` direto (`_shared/evolution-api-proxy.ts`) — o contrato cobre a OPERAÇÃO, mas o router ainda não roteia pela porta contratada. |
| Verbos contratados sem action no router | 5 | `restartInstance`, `listGroups`, `getProfilePicture`, `get`, `post` — contrato existe, mas o router não expõe a operação (ex.: consumidos por outra edge function/evolução futura). |

## Cobertura por action (41)

| Action | Linha | Verbo do contrato | Coberto |
|---|---|---|---|
| `read-messages` | 106 | `—` | ❌ |
| `mark-read` | 117 | `—` | ❌ |
| `mark-unread` | 118 | `—` | ❌ |
| `send-text` | 119 | `sendText` | ✅ |
| `send-media` | 120 | `sendMedia` | ✅ |
| `send-audio` | 121 | `—` | ❌ |
| `send-ptv` | 122 | `—` | ❌ |
| `send-location` | 123 | `—` | ❌ |
| `send-contact` | 124 | `—` | ❌ |
| `send-reaction` | 125 | `—` | ❌ |
| `send-poll` | 126 | `—` | ❌ |
| `send-sticker` | 127 | `sendSticker` | ✅ |
| `send-list` | 133 | `—` | ❌ |
| `send-buttons` | 134 | `—` | ❌ |
| `send-status` | 135 | `—` | ❌ |
| `send-template` | 136 | `—` | ❌ |
| `find-chats` | 137 | `—` | ❌ |
| `find-messages` | 138 | `—` | ❌ |
| `find-contacts` | 139 | `—` | ❌ |
| `check-numbers` | 140 | `checkWhatsApp` | ✅ |
| `find-status-messages` | 142 | `—` | ❌ |
| `send-chat-presence` | 152 | `—` | ❌ |
| `status` | 166 | `getConnectionState` | ✅ |
| `list-instances` | 167 | `listInstances` | ✅ |
| `instance-info` | 168 | `—` | ❌ |
| `fetch-profile` | 169 | `—` | ❌ |
| `update-profile-name` | 170 | `—` | ❌ |
| `update-profile-status` | 171 | `—` | ❌ |
| `find-labels` | 172 | `—` | ❌ |
| `handle-label` | 173 | `—` | ❌ |
| `update-block-status` | 177 | `—` | ❌ |
| `set-settings` | 178 | `—` | ❌ |
| `get-settings` | 179 | `—` | ❌ |
| `set-webhook` | 180 | `—` | ❌ |
| `get-webhook` | 181 | `—` | ❌ |
| `delete-message` | 182 | `—` | ❌ |
| `archive-chat` | 183 | `—` | ❌ |
| `get-media-base64` | 184 | `—` | ❌ |
| `create-instance` | 231 | `—` | ❌ |
| `pairing-code` | 236 | `getQrCode` | ✅ |
| `connect` | 244 | `getQrCode` | ✅ |

## Gaps conhecidos (33)

Cada operação abaixo está **fora do contrato Zod** — sem verbo equivalente na porta oficial (`contract.zod.ts`). Fechar um gap = adicionar o verbo ao contrato (request/response Zod), implementar no `evolutionClient` e no `fakeProvider`, e rotear a action por ele.

| Action | Onde |
|---|---|
| `read-messages` | `supabase/functions/evolution-api/index.ts:106` |
| `mark-read` | `supabase/functions/evolution-api/index.ts:117` |
| `mark-unread` | `supabase/functions/evolution-api/index.ts:118` |
| `send-audio` | `supabase/functions/evolution-api/index.ts:121` |
| `send-ptv` | `supabase/functions/evolution-api/index.ts:122` |
| `send-location` | `supabase/functions/evolution-api/index.ts:123` |
| `send-contact` | `supabase/functions/evolution-api/index.ts:124` |
| `send-reaction` | `supabase/functions/evolution-api/index.ts:125` |
| `send-poll` | `supabase/functions/evolution-api/index.ts:126` |
| `send-list` | `supabase/functions/evolution-api/index.ts:133` |
| `send-buttons` | `supabase/functions/evolution-api/index.ts:134` |
| `send-status` | `supabase/functions/evolution-api/index.ts:135` |
| `send-template` | `supabase/functions/evolution-api/index.ts:136` |
| `find-chats` | `supabase/functions/evolution-api/index.ts:137` |
| `find-messages` | `supabase/functions/evolution-api/index.ts:138` |
| `find-contacts` | `supabase/functions/evolution-api/index.ts:139` |
| `find-status-messages` | `supabase/functions/evolution-api/index.ts:142` |
| `send-chat-presence` | `supabase/functions/evolution-api/index.ts:152` |
| `instance-info` | `supabase/functions/evolution-api/index.ts:168` |
| `fetch-profile` | `supabase/functions/evolution-api/index.ts:169` |
| `update-profile-name` | `supabase/functions/evolution-api/index.ts:170` |
| `update-profile-status` | `supabase/functions/evolution-api/index.ts:171` |
| `find-labels` | `supabase/functions/evolution-api/index.ts:172` |
| `handle-label` | `supabase/functions/evolution-api/index.ts:173` |
| `update-block-status` | `supabase/functions/evolution-api/index.ts:177` |
| `set-settings` | `supabase/functions/evolution-api/index.ts:178` |
| `get-settings` | `supabase/functions/evolution-api/index.ts:179` |
| `set-webhook` | `supabase/functions/evolution-api/index.ts:180` |
| `get-webhook` | `supabase/functions/evolution-api/index.ts:181` |
| `delete-message` | `supabase/functions/evolution-api/index.ts:182` |
| `archive-chat` | `supabase/functions/evolution-api/index.ts:183` |
| `get-media-base64` | `supabase/functions/evolution-api/index.ts:184` |
| `create-instance` | `supabase/functions/evolution-api/index.ts:231` |

## Como ler este número

- **19,5%** é a fração das operações de mensageria expostas pelo router que **já têm porta oficial com contrato definido** (teto: mesmo roteando tudo pelo gateway contratado, o número não sobe além disso sem contratar os verbos faltantes).
- A **cobertura efetiva de roteamento (0%)** é o passo seguinte do desacoplamento: trocar `proxyToEvolution` pelo `evolutionClient` + validação Zod nas ações cobertas, e contratar os verbos dos gaps.
