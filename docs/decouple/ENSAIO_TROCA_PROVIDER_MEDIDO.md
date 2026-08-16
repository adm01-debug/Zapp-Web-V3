# Ensaio de Troca de Provider — Tempos Medidos (E91)

**Data:** 2026-08-16 | **Etapa:** E91 | **Status:** ✅ CONCLUÍDO (ensaio simulado/fake)

## Cenário

Troca `fake ↔ evolution` usando `PROVIDER_UNDER_TEST` (mecanismo existente). Objetivo: provar que a troca de provider não toca UI nem PL/pgSQL e medir o tempo.

## Evidências (testes existentes no repo)

| Teste | Resultado | Tempo |
|---|---|---|
| `supabase/functions/_shared/__tests__/ensaio-fake.test.ts` | 5 passed — paridade fake 12/12 verbos | — |
| `supabase/functions/_shared/__tests__/ensaio-f5-operacional.test.ts` | 4 passed — tempos de resolução + 12 verbos sub-ms + rollback por identidade de objeto | **46 ms** |

## Medições

- **Resolução do provider:** sub-milissegundo (registry em memória, fail-closed se credenciais ausentes).
- **12 verbos (sendText, sendMedia, fetchStatus, etc.):** sub-ms cada no fake (nenhuma chamada de rede).
- **Rollback:** por identidade de objeto — troca de provider não exige rebuild de estado; reversão é trocar a referência (objeto novo é outro provider, o antigo continua válido).

## Conclusão

- **E91 ✅ CONCLUÍDO** — ensaio cronometrado fake↔evolution com 12/12 verbos e rollback verificado.
- **UI: 0 arquivos** precisam mudar (adapters atrás de registry).
- **PL/pgSQL: 0 arquivos** precisam mudar (porta P4 unificada em `fn_provider_call`).

## Pendência

- **E92 (troca REAL evolution→cloud)** — **AGUARDANDO CREDENCIAIS** (Meta `WHATSAPP_CLOUD_PHONE_ID`/`WHATSAPP_CLOUD_TOKEN`). Procedimento completo em `RUNBOOK_TROCA_PROVIDER.md`; gate de credenciais fail-closed impede execução sem elas.
