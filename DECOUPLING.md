# DECOUPLING.md — Desacoplamento zapp-web-v3 ↔ Evolution Stack

> **Data:** 2026-08-12/13  
> **Status:** ✅ Concluído  
> **Documentação atualizada em:** 2026-08-14 (30 etapas, 10 agentes)

Este documento é a **referência cruzada principal** do desacoplamento.
Para qualquer dúvida sobre "onde está X?", comece aqui.

---

## O que aconteceu

A infraestrutura da Evolution API foi extraída de `zapp-web-v3` para um repo dedicado:

| Antes | Depois |
|-------|--------|
| `zapp-web-v3` continha servidor Evolution, consumer, stacks Swarm e app React | `evolution-stack` = infra pura; `zapp-web-v3` = app + edge functions |
| Workflows de build da Evolution rodavam aqui | Workflows de build em `evolution-stack` (runner `vps-evo`) |
| Infra + app no mesmo ciclo de deploy | Ciclos independentes |

---

## O que foi para evolution-stack

| Item | Stack ID | Repo |
|------|----------|------|
| Servidor Evolution API (imagem custom, patches T1-T25) | 25 | evolution-stack |
| Consumer RabbitMQ → PostgreSQL | 113 | evolution-stack |
| Evolution DB Purge (cron 24h) | 238 | evolution-stack |
| WhatsApp Observer | 225 | evolution-stack |
| WhatsApp Watchdog | 230 | evolution-stack |
| Evolution Watchdogs (purge/trap/webhook) | 240 | evolution-stack |
| zapp-functions-health (renomeado) | 265 | evolution-stack |
| Evolution Security Guardian | 262 | evolution-stack |
| Evolution pgBackRest Backup | 264 | evolution-stack |
| Scripts operacionais, watchdogs, GitOps | — | evolution-stack |
| Runbooks de infra | — | evolution-stack/runbooks/ |

---

## O que ficou em zapp-web-v3

| Item | Localização |
|------|-------------|
| Edge functions `evolution-*` (9 funções) | `supabase/functions/evolution-*/` |
| Gateway HTTP (`evolutionClient`, 12 verbos) | `supabase/functions/_shared/providers/evolution/client.ts` |
| Adapters TypeScript frontend | `src/adapters/evolution*`, `src/hooks/evolution*` |
| Schema `evo` (tabelas `evolution_*`) no Postgres compartilhado | stack 35 (Supabase self-hosted) |
| Migrations de schema | `supabase/migrations/*evolution*` |
| Testes e2e | `e2e/*evolution*` |

---

## Como o app acessa a Evolution API agora

```
Frontend (React)
  └── whatsappAdapter
        └── supabase.functions.invoke('evolution-*')
              └── evolutionClient.*  ← gateway unificado
                    └── HTTP → https://evolution.atomicabr.com.br (evolution-stack)

Evolution → RabbitMQ → Consumer (stack 113) → HTTP POST → evolution-webhook edge fn
  └── fn_process_whatsapp_message (normalizer canônico)
  └── rpc_claim_outbound_message / rpc_update_incoming_message
```

**Gateway:** `supabase/functions/_shared/providers/evolution/client.ts`  
**12 verbos:** sendText, sendMedia, sendSticker, getConnectionState, getQrCode, restartInstance, listInstances, listGroups, checkWhatsApp, getProfilePicture, get<T>, post<T>  
**Invariante:** ZERO acesso direto a `EVOLUTION_API_URL`. `inventory.mjs` = 0 bypasses. CI guard: `decouple-guard.yml`.

---

## Fronteira de schema

| Schema | Proprietário | Acesso pelo outro |
|--------|-------------|-------------------|
| `evo.*` | evolution-stack (consumer) | zapp lê via 12 views de contrato em `public.*` |
| `zapp.*` | este repo (app) | evo lê apenas para monitoria (17 fns SECDEF — ADR-DB-002) |

---

## Documentação por área

| Área | Arquivo | Repo |
|------|---------|------|
| Visão geral da separação | `docs/BOUNDARY-evolution.md` + gateway | zapp |
| Visão do evo (o que o zapp consome) | `docs/BOUNDARY-zapp.md` | evolution-stack |
| Gateway pattern (ADR) | `docs/decouple/ADR-009-gateway-pattern.md` | zapp |
| Fronteira de schema | `docs/db/adrs/ADR-DB-002-fronteira-zapp-evo.md` | zapp |
| Plano de desacoplamento (100 etapas) | `docs/decouple/PLANO_DESACOPLAMENTO_V2_100_ETAPAS.md` | zapp |
| Handoff pós-desacoplamento | `docs/decouple/HANDOFF_POS_DESACOPLAMENTO_20260813.md` | zapp |
| Arquitetura evolution-stack | `docs/architecture-atomica.md` | evolution-stack |
| Runbooks de infra | `runbooks/` | evolution-stack |
| GitOps (deploy stacks) | `docs/GITOPS.md` | evolution-stack |

---

## Commits principais do desacoplamento

```
F5/E67-E88 — Gateway HTTP unificado (inventory 0)           zapp-web-v3
F3         — Egresso via Postgres (RPCs)                     zapp-web-v3  
E22        — CI guard decouple-guard.yml                     zapp-web-v3
PR #1069   — Remoção de infra/evolution* + 4 workflows       zapp-web-v3
2026-08-12 — Separação de repo, images GHCR, GitOps          evolution-stack
```

---

## O que NÃO fazer

- **Não recriar** infra Evolution neste repo (CI bloqueia)
- **Não usar** `callEvolutionApi` diretamente (removido de runtime, deprecated)
- **Não acessar** `EVOLUTION_API_URL` diretamente em edge functions
- **Não mover** edge functions `evolution-*` para evolution-stack (mesmo projeto Supabase)
