---
name: ADR-011-egress-gateway
status: Accepted
date: 2026-08-14
---

# ADR-011: Gateway Único de Egresso — `evolution-api` como porta edge canônica

## Contexto

O app ZAPP Web possui hoje **duas edge functions de egresso** para a Evolution API,
com sobreposição de responsabilidade e superfícies diferentes:

1. **`evolution-api`** — router de egresso do app (281 linhas): auth JWT obrigatória
   (401 sem usuário), CORS, rate limit diferenciado (`evolution-poll:` 600/60s para
   ações read-only; `evolution:` 120/60s; `evolution-send:<instance>` por instância,
   default 60/min via `EVOLUTION_SEND_RATE_PER_INSTANCE`), validação de
   `instanceName` (`^[a-zA-Z0-9_-]{1,128}$`), pause de instância (`INSTANCE_PAUSED`
   503 com `Retry-After: 60`), repasse de idempotency-key, contrato
   `evolution-api@v1` validado por `parseOrReject` (JSON e multipart), envelope de
   erro `EVOLUTION_ENVELOPE_VERSION`. É o **egresso REAL do app**: 208 ocorrências em
   57 arquivos (`whatsappAdapter.ts`, `sendFunctionRouter.ts`,
   `externalMessageSender.ts`, `public-api`, `whatsappConnectionRepository`, hooks de
   UI), com **41 actions** roteadas (inventário exato do `index.ts`).
2. **`evolution-proxy`** — proxy server-side (121 linhas) com allowlist rígida de
   **6 paths** (`sendText`, `sendMedia`, `sendWhatsAppAudio`, `markChatUnread`,
   `fetchInstances`, `connectionState`), gate admin/supervisor, rate 60/min, key
   resolvida via cliente canônico `_shared/providers/evolution/client.ts` (v2,
   2026-08-14). Usado **somente** pela página demo administrativa
   `ZappWebbDemoPage` via `src/integrations/zappweb/evolutionClient.ts` — nenhum
   fluxo de negócio depende dele.

O inventário formal das 10 edge functions `evolution-*` está em
`docs/decouple/EGRESS_SURFACE_V4.md` (onda anterior), que já classificava
`evolution-api` como **PORTA OFICIAL** e `evolution-proxy` como **CANDIDATA
APOSENTAR**. Este ADR formaliza essa classificação como decisão de arquitetura
(etapa V4-FINAL #33), documenta a allowlist das 41 actions e define o ciclo de
vida da deprecação do `evolution-proxy`.

Princípio de fronteira herdado (ADR-009/ADR-010): o browser **nunca** conhece
URL/key da Evolution; só conhece `functions.invoke('evolution-api', { action })`
ou, para o SQL, os resolvers `ops.fn_evo_url()`/`ops.fn_evo_key()`.

## Decisão

### 1. `evolution-api` é a ÚNICA porta edge canônica de egresso browser → Evolution

Todo fluxo de negócio que precise falar com a Evolution API (enviar, ler,
gerenciar instância, mídia, webhook, labels, perfil) passa por
`functions.invoke('evolution-api', { action })` com JWT de usuário autenticado.
A superfície é **congelada** e documentada: as **41 actions** abaixo, agrupadas
por categoria (contagem conferida no `index.ts` em 2026-08-14).

### 2. Allowlist documentada das 41 actions — `evolution-api@v1`

| Grupo | Actions |
|---|---|
| **Envio** (15) | `send-text`, `send-media`, `send-audio`, `send-ptv`, `send-location`, `send-contact`, `send-reaction`, `send-poll`, `send-sticker`, `send-list`, `send-buttons`, `send-status`, `send-template`, `send-chat-presence`, `read-messages` |
| **Leitura conversa/chat** (7) | `find-chats`, `find-messages`, `find-contacts`, `check-numbers`, `find-status-messages`, `mark-read`, `mark-unread` |
| **Gerenciamento de conversa** (4) | `archive-chat`, `delete-message`, `handle-label`, `find-labels` |
| **Perfil** (4) | `fetch-profile`, `update-profile-name`, `update-profile-status`, `update-block-status` |
| **Mídia/config** (5) | `get-media-base64`, `get-settings`, `set-settings`, `get-webhook`, `set-webhook` |
| **Instância** (6) | `status`, `list-instances`, `instance-info`, `connect`, `create-instance`, `pairing-code` |

Regras de comportamento da allowlist (fonte: `index.ts`):

- A action vem do body (`action`) com fallback para o último segmento do path
  (`pathAction`) — aceitar tanto `evolution-api/<action>` quanto `{ action }`.
  O valor sentinela `'evolution-api'` (nome da própria função no path) também
  cai no fallback para `pathAction`.
- Ações de polling read-only (`status`, `list-instances`, `instance-info`,
  `find-status-messages`) têm rate limit próprio (600/60s por IP) e **não**
  disparam instance-pause (`READE_ONLY_INSTANCE_ACTIONS` também inclui
  `get-settings` e `get-webhook`).
- Ações `send-*` têm rate limit por instância (`EVOLUTION_SEND_RATE_PER_INSTANCE`,
  default 60/min) → 429 `INSTANCE_RATE_LIMIT` com `Retry-After: 30`.
- Instância pausada → 503 `INSTANCE_PAUSED` com `Retry-After: 60`.
- Headers de idempotência (`idempotency-key` / `x-idempotency-key`) são
  repassados ao upstream.
- Contrato `evolution-api@v1` validado por `parseOrReject` (JSON e multipart) —
  **novas actions exigem atualização de `CONTRACT_SCHEMAS` e
  `contract-versions.ts`** (congelamento de superfície).

### 3. `evolution-proxy` fica DEPRECATED formal — candidata a remoção futura

- **Nada novo** deve chamar `evolution-proxy`. Novos fluxos de egresso usam
  `evolution-api`.
- **Manutenção mínima** enquanto viva: nada além de correções críticas de
  segurança; não recebe actions novas, contratos novos nem melhorias de
  comportamento.
- **Migração da demo** (pré-requisito da remoção): `ZappWebbDemoPage` /
  `src/integrations/zappweb/evolutionClient.ts` devem passar a invocar
  `evolution-api` com as actions equivalentes da allowlist:

  | Path do `evolution-proxy` (allowlist de 6) | Action equivalente na `evolution-api` |
  |---|---|
  | `POST /message/sendText/{instance}` | `send-text` |
  | `POST /message/sendMedia/{instance}` | `send-media` |
  | `POST /message/sendWhatsAppAudio/{instance}` | `send-audio` |
  | `PUT /chat/markChatUnread/{instance}` | `mark-unread` |
  | `GET /instance/fetchInstances` | `list-instances` |
  | `GET /instance/connectionState/{instance}` | `status` |

- **Critério de remoção** (todos os itens): (1) `ZappWebbDemoPage` migrada e
  testada contra `evolution-api`; (2) `src/integrations/zappweb/evolutionClient.ts`
  e `src/_archive/evolutionClient.archived.ts` removidos; (3) contrato de
  `evolution-proxy` removido de `_shared/contract-schemas.ts` /
  `contract-versions.ts`; (4) função removida do deploy e de `supabase/config.toml`.
  Remoção de função = remover código em `src/`, `_shared`, `config.toml` e deploy —
  nunca só o deploy.
- Enquanto deprecada, o GET de `evolution-credentials` (410 Gone, sentinela de
  clientes legados) continua apontando o caminho oficial para `evolution-api`.

### 4. Superfície de egresso/ingestão consolidada (papéis das funções)

| Função | Papel (decisão) |
|---|---|
| `evolution-api` | **PORTA EDGE CANÔNICA** (egresso browser → Evolution, 41 actions) |
| `evolution-webhook` | PORTA OFICIAL P3 (ingestão de eventos, HMAC, DLQ; sunset envelope v1 em 2027-01-01) |
| `evolution-proxy` | **DEPRECATED** — candidata a remoção após migração da demo |
| `evolution-credentials` | SUPORTE (POST `save`/`delete` admin; GET = 410 sentinela) |
| `evolution-sync` | SUPORTE (porta administrativa de sync) |
| `evolution-group-sync` | SUPORTE (cron interno) |
| `evolution-bitrix-sync` | SUPORTE condicional (segredo `bitrix_webhook_url` ausente — R06-07) |
| `evolution-notification-dispatcher` | SUPORTE (cron interno) |
| `evolution-retry-metrics` | SUPORTE (leitura admin) |
| `evolution-templates` | RISCO/QUEBRADA p/ browser (401 E25) — corrigir ou aposentar (etapa #31) |

## Consequências

**Positivas:**

- Superfície de egresso única e auditável: um só router, um só contrato
  (`evolution-api@v1`), uma só política de auth/rate/instância-pause/idempotência.
- Fim da duplicação `evolution-proxy` (6 paths com gate admin) sobre o mesmo
  upstream — reduz superfície de ataque e custo de manutenção.
- A allowlist documentada das 41 actions vira contrato de governança: qualquer
  action nova passa por revisão de contrato (`CONTRACT_SCHEMAS` +
  `contract-versions.ts`).
- Coerência com o runbook de troca de provider (P1–P4): a porta P2 (edge gateway)
  tem um único ponto de egresso para migrar para `registry.getProviderClient()`.

**Negativas/Trade-offs:**

- `ZappWebbDemoPage` fica com deprecação pendente: enquanto não migrar, a função
  `evolution-proxy` permanece deployada (custo de superfície residual).
- Migrar a demo exige adaptar o cliente `evolutionClient.ts` para o envelope
  `{ action }` + JWT de usuário (o proxy usa envelope `{ method, path, body }` +
  gate admin) — trabalho pequeno, mas não-zero.
- O congelamento da allowlist pode incomodar times que queiram "uma action rápida"
  sem atualizar contrato — o processo de contrato passa a ser obrigatório.

## Alternativas consideradas

1. **Manter as duas portas** (status quo): rejeitado — sobreposição de superfície,
   duas políticas de auth/rate para o mesmo upstream, risco de deriva de contrato.
2. **Aposentar `evolution-api` e usar `evolution-proxy` como porta única**:
   rejeitado — o proxy não tem as 41 actions, não tem contrato por action, não tem
   idempotência, não tem instance-pause, e restringe a admin/supervisor (o app
   inteiro precisa de JWT de usuário comum).
3. **Fundir agora em uma função nova**: rejeitado — custo de migração de 208
   chamadas em 57 arquivos sem ganho de comportamento; `evolution-api` já é a
   porta madura e testada.

## Referência

- `docs/decouple/EGRESS_SURFACE_V4.md` — inventário das 10 edge functions
  (classificações e tabela-mestra).
- `docs/decouple/ADR-009-gateway-pattern.md` — gateway HTTP único
  (`_shared/providers/evolution/client.ts`).
- `docs/decouple/ADR-010-sql-gateway.md` — resolvers SQL
  `ops.fn_evo_url()`/`ops.fn_evo_key()` (porta P4).
- `docs/decouple/RUNBOOK_TROCA_PROVIDER.md` §2 — mapa das 4 portas (P1 front,
  P2 edge gateway, P3 ingestão, P4 SQL).
- `docs/decouple/SUBSTITUABILITY_MATRIX_V4.md` — prova de substituibilidade por
  porta (fake 12/12 + `PROVIDER_UNDER_TEST` + `contract.zod`).
- `supabase/functions/evolution-api/index.ts` e
  `supabase/functions/evolution-proxy/index.ts` — código-fonte da decisão.
- Plano V4-FINAL etapa #33 (2026-08-14).
