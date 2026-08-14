# Plano de Desacoplamento V2 — 100 etapas
**Data:** 2026-08-13 · **Baseline:** main `8b2aeaf0f` · evolution-stack `ca9e1af` · web em prod `production-709489fb6ad5`
**Autor:** validação sobre estado REAL (banco vivo + Portainer + container edge-runtime + repo), não sobre docs.

---

## 0. Veredicto sobre o trabalho anterior (validado empiricamente nesta sessão)

### 0.1 Migração de infra (evolution-stack) — APROVADA
- Prod roda `ghcr.io/adm01-debug/evolution-stack/evolution-api-custom@6f9f1d35` e consumer `@75210b9f` (2 réplicas healthy). Namespace antigo zerado.
- G1 (teste órfão) removido. Gaps G2/G4 (watchdog configs não versionados, guardian/pgbackrest fora de stack) **continuam abertos** — ver F7 deste plano.

### 0.2 Migração de tabelas evo→zapp — APROVADA (com ressalva de método)
Verificado no banco em 2026-08-13/14:
- `zapp.evolution_*` = 74 tabelas; Grupo B remanescente em `evo` = **0**; `evo` = 59 tabelas (todas Grupo A/infra).
- Fns residuais apontando p/ tipos migrados = **0**; scan amplo (`evo\.evolution_`) = 59 refs, **todas** para tabelas Grupo A legítimas.
- Crons residuais = 0. Os 3 crons que falhavam pós-migração (`monitor-ingestion-persistence-gap` 15×, `ops-notify-critical-alerts` JSON quebrado, `pipeline-canary` ingest_meta) **já foram corrigidos** — últimas execuções verdes.
- [H2] REVOKE Grupo A: **feito** — 0 grants de escrita p/ authenticated/anon em `evo.evolution_*`.
- Health score `zapp.fn_system_health_score()` = **100.0 A+**. Índices inválidos = 0. Pipeline vivo: 5.069 msgs/24h, 4.775 webhooks/24h.
- Edge-runtime em prod **serve o código migrado** (verificado dentro do container `supabase_functions`: gateway `_shared/providers/evolution/client.ts` presente, `batch-fetch-avatars` sem env direta).
- Tabelas `_backup_*` grandes já limpas (maior resíduo: snapshot 4,8 MB).
- Ressalva: o plano V1 (E77) **proibia** mover tabelas; a execução moveu 74 mesmo assim. Deu certo e o resultado é superior ao planejado, mas o V1 está obsoleto como documento de referência. Este V2 o substitui.

### 0.3 O que o V1 acertou e este V2 preserva
Diagnóstico das 4 raízes (R1 modelo canônico, R2 porta de saída, R3 porta de entrada, R4 gateway HTTP); expand/contract aditivo; nunca desligar Evolution em prod; migração 1 arquivo por vez com gate.

### 0.4 O que NINGUÉM tinha visto — a 4ª porta de egresso
O **próprio Postgres** chama a Evolution API via `net.http_post` + vault (`evolution_api_url`/`evolution_api_key`) em **5 funções**:
`zapp.fn_outbound_dispatch` (caminho de ENVIO em produção, cron `outbound-queue-dispatch`), `zapp.fn_reconcile_dispatch`, `ops.fn_notify_critical_alerts`, `evo.fn_sync_lid_from_api`, `zapp.fn_validate_whatsapp_connection_url`.
Trocar de provider hoje exige editar 5 fns SQL espalhadas. F5 deste plano cria o gateway SQL único.

---

## 1. Estado residual medido (o que falta de verdade)

| Frente | Baseline V1 | Agora | Falta |
|---|---|---|---|
| Edge fns com `EVOLUTION_API_URL` direto | 17 | **3** | `connection-test`, `evolution-group-sync`, `evolution-api` (roteador) |
| Front `invoke('evolution-api')` fora do adapter | 10 | **2** | `whatsappConnectionRepository.ts`, `withRequestId.ts` |
| Edge fns com `from('evolution_messages')` fora da porta | ≥5 | **4** | `evolution-helpers`, `evolution-webhook-handlers`, `evolution-webhook-messages`, `connection-health-check` |
| Normalizers ao modelo canônico | 0 | domínio existe (`src/domain/messaging`), normalizers **não** | R1 aberto (`whatsapp-cloud-normalizer` ainda "unified Evolution model") |
| Fns Postgres chamando Evolution direto | não mapeado | **5** | 4ª porta (novo) |
| Prova de troca (fake provider / F7) | 0 | 0 | tudo |
| Watchdog configs versionados (E14/E15) | não | não | **BLOQUEADO — requer APROVADO** |
| Guardian/pgbackrest em stack (G4) | não | não | confirmado rodando fora de stack no Portainer |
| ESLint guard `invoke('evolution-api')` | não | não | criar |
| `rpc_upsert_contact` 3-args vs 14-args | — | 2 overloads | decisão de negócio pendente |

---

## 2. Simulação de cenários de falha (feita ANTES do plano)

| # | Cenário simulado | Resultado esperado se fizermos errado | Mitigação no plano |
|---|---|---|---|
| S1 | Migrar `evolution-api/index.ts` (roteador central) para o client num commit só | Qualquer regressão derruba TODO envio do front (21 call sites passam por ele) | E17–E19: migrar por action-group, com teste de contrato antes/depois, roteador por ÚLTIMO |
| S2 | Refatorar `_shared/evolution-helpers.ts` (usado por N fns) junto com a porta de ingestão | Falha silenciosa em várias fns ao mesmo tempo | E31–E33: um consumidor por commit; helpers por último; `deno check` a cada passo |
| S3 | Trocar as escritas do webhook Evolution p/ ingest-port sem paridade de idempotência | Mensagem duplicada no inbox em reentrega do RabbitMQ | E34–E36: teste de reentrega ANTES do switch; ledger + ON CONFLICT idênticos |
| S4 | Reescrever `fn_outbound_dispatch` (SQL) direto | Fila outbound para de despachar → mensagens presas | F5: wrapper novo (`ops.fn_provider_http`) criado AO LADO; fns migram 1 a 1; cron nunca fica sem função válida; rollback = `CREATE OR REPLACE` do corpo antigo (guardado em `ops.fn_bodies_backup`) |
| S5 | Normalizer canônico muda shape que a UI espera | Inbox renderiza vazio | E43–E50: canônico entra ADITIVO (campos novos), UI só migra depois de golden fixtures round-trip verdes |
| S6 | ESLint guard novo quebra CI de PRs não relacionados | Time travado | E27: regra entra como `warn` 1 ciclo, depois `error` |
| S7 | Consolidar `rpc_upsert_contact` sem decisão | Pipeline de ingestão muda comportamento (reativação de soft-deleted) | E93: ESCALADO — só com APROVADO |
| S8 | Editar watchdogs esperando efeito | Nenhum efeito (Swarm config é a fonte) | F7 inteiro é bloqueado até APROVADO; nada antes disso assume watchdog versionado |
| S9 | Fake provider vaza para prod | Mensagens reais não enviadas | E73: fake registrado APENAS sob `DENO_ENV=test`; registry recusa fake fora de teste |
| S10 | Docs antigos (HANDOFFs/V1) confundem próximo agente | Retrabalho/ação sobre estado obsoleto | E97: marcar V1 e HANDOFFs como HISTÓRICO no cabeçalho |

---

## 3. Plano — 100 etapas
Convenção: **[R]** reversível sem deploy · **[D]** exige deploy/DDL · **[!]** toca produção · **[⛔]** bloqueado, requer `APROVADO`

### F0 · Baseline desta rodada (1–8)
1. **[R]** Tag `decouple-v2-baseline` em zapp-web-v3 (main `8b2aeaf0f`) e evolution-stack (`ca9e1af`).
2. **[R]** Atualizar `scripts/decouple/inventory.mjs` para contar também: fns SQL com `evolution_api_url` (via query), `from('evolution_messages')` em edge fns, e wording "unified Evolution model". Registrar baseline: 3/2/4/5.
3. **[R]** Registrar digests de prod: evolution `6f9f1d35`, consumer `75210b9f`, web `709489fb6`.
4. **[R]** Snapshot dos corpos das 5 fns SQL da 4ª porta em `ops.fn_bodies_backup` (tabela `create if not exists`, colunas fn, body, captured_at) — rollback instantâneo por `CREATE OR REPLACE`.
5. **[R]** Critérios de abort (herdados do V1, revalidados): erro de envio >1%, DLQ com itens novos, p95 >2× baseline, health <95.
6. **[R]** Confirmar gate `ownership-gate.mjs` = 0/37/0 antes de qualquer commit.
7. **[R]** Rodar e2e existente e arquivar verde como referência.
8. **[R]** Branch `feat/decouple-v2` (não trabalhar em main; PR ao final de cada fase).

### F1 · Fechar F5 residual — egresso HTTP das edge fns (9–20)
9. **[R]** `connection-test/index.ts`: trocar os 2 usos de env por `evolutionClient` (`getConnectionState`/`get`).
10. **[R]** `deno check` + teste de contrato de `connection-test`.
11. **[R]** `evolution-group-sync/index.ts`: mapear as 4 ocorrências (fetch groups, participants, etc.) → verbos do client (`listGroups`, `get`).
12. **[R]** Teste de `evolution-group-sync` com transport mockado.
13. **[R]** Inventariar TODAS as actions de `evolution-api/index.ts` (roteador) e agrupá-las por verbo do client.
14. **[R]** Teste de contrato do roteador ANTES da mudança (golden: request→URL/headers/body gerados).
15. **[R]** Migrar roteador: grupo "send-*" para o client.
16. **[R]** Migrar roteador: grupo "instance/connection" (connect, qrcode, restart, state).
17. **[R]** Migrar roteador: grupo "find/list" e residuais via `get/post` genéricos.
18. **[R]** Golden do passo 14 re-rodado: byte-idêntico (ou diff justificado em comentário de PR).
19. **[D][!]** Deploy das edge fns migradas + verificação DENTRO do container (`grep EVOLUTION_API_URL /home/deno/functions -r` fora do gateway = 0).
20. **[R]** Gate: `EVOLUTION_API_URL` permitido em exatamente 1 arquivo (`providers/evolution/client.ts`) + testes. Inventory: 3→0.

### F2 · Fechar bypasses do front (21–28)
21. **[R]** `src/features/connections/data-access/whatsappConnectionRepository.ts`: migrar p/ `whatsappAdapter` (verbos já existem).
22. **[R]** Teste unitário do repository com adapter mockado.
23. **[R]** `src/lib/withRequestId.ts`: absorver como decorator interno do adapter (E49 do V1) — preserva trace headers; call sites passam a usar o adapter.
24. **[R]** Grep global: `invoke('evolution-api'` fora de `whatsappAdapter*` = 0.
25. **[R]** ESLint `no-restricted-syntax`: proibir `invoke('evolution-api')` fora de `src/lib/whatsappAdapter*`.
26. **[R]** ESLint idem para import de `@/types/evolutionExternal` fora de `src/adapters/` (E38 do V1, nunca implementado).
27. **[R]** Regras entram como `warn`; virar `error` no PR seguinte (S6).
28. **[R]** Gate front = 0 no inventory. Commit + PR parcial.

### F3 · Porta de ingestão única — fechar R3 (29–42)
29. **[R]** Auditar `_shared/ingest-port.ts`: cobrir os shapes usados pelos 4 arquivos que ainda escrevem direto.
30. **[R]** Teste de reentrega (S3): mesmo `message_id+instance` 2× → 1 linha (paridade de idempotência ledger/ON CONFLICT).
31. **[R]** Migrar `connection-health-check/index.ts` (menor risco) p/ leitura via RPC/porta.
32. **[R]** Migrar `_shared/evolution-webhook-messages.ts` → ingest-port (os ≥3 pontos de escrita direta).
33. **[R]** Migrar `_shared/evolution-webhook-handlers.ts` → ingest-port.
34. **[R]** `_shared/evolution-helpers.ts` por ÚLTIMO (mais consumidores): mover apenas as escritas; leituras podem ficar.
35. **[R]** `deno check` global + suite de webhook após cada arquivo.
36. **[D][!]** Deploy + soak 24h: comparar `msgs/24h` e DLQ contra baseline do passo 3.
37. **[R]** Teste dual (E63 do V1): evento lógico igual por Evolution e Cloud → mesma linha canônica.
38. **[R]** Gate: `from('evolution_messages')` em edge fns fora de `ingest-port.ts` = 0.
39. **[R]** Documentar em `ingest-port.ts` o contrato (jsdoc): entrada canônica, idempotência, erro.
40. **[R]** DLQ discriminada por provider (E64 do V1) se ainda não existir — verificar antes, não duplicar.
41. **[R]** Métrica por provider em daily_metrics (E65) — idem, verificar antes.
42. **[R]** Commit + PR parcial. Inventory: 4→0.

### F4 · Modelo canônico — fechar R1 (43–58)
43. **[R]** Auditar `src/domain/messaging/types.ts` já criado: completar `ChannelAddress`, `ChannelAccount`, `DeliveryStatus` se faltarem.
44. **[R]** Tabela de mapeamento `MessageType` canônico ↔ Baileys ↔ Meta (E26 do V1).
45. **[R]** Espelho Deno dos schemas em `supabase/functions/_shared/domain/` (Zod).
46. **[R]** Golden fixtures: 1 payload Baileys + 1 Meta por tipo de mensagem (texto, mídia, áudio, sticker, reação, localização, contato).
47. **[R]** Criar `_shared/evolution-normalizer.ts`: Baileys → canônico.
48. **[R]** Reescrever `whatsapp-cloud-normalizer.ts`: Meta → canônico (remover "unified Evolution model" — R1 morre aqui).
49. **[R]** ingest-port passa a aceitar SOMENTE o shape canônico; normalizers na borda.
50. **[R]** Teste round-trip: payload → canônico → persistência → leitura → shape da UI.
51. **[R]** `ProviderCapabilities` explícito por provider (E29 do V1) no registry.
52. **[R]** Fallback do adapter passa a consultar capabilities (não mais implícito).
53. **[R]** Mapa coluna Postgres ↔ campo canônico em `docs/decouple/CANONICAL_COLUMN_MAP.md`.
54. **[R]** ADR-008 atualizada com o modelo final (a existente é stub de 1,1 KB).
55. **[R]** Gate: wording "unified Evolution model" = 0 no repo.
56. **[R]** Front: tipos do inbox migram para os canônicos APENAS onde aditivo (sem quebrar 96 arquivos de features — `evolutionAdapter.ts` segue como legado de leitura).
57. **[D][!]** Deploy + smoke do inbox (enviar/receber texto e mídia reais na wpp2).
58. **[R]** Commit + PR parcial.

### F5 · A 4ª porta — egresso via Postgres (59–70) **[NOVO — ninguém tinha mapeado]**
59. **[R]** Snapshot dos 5 corpos já feito (etapa 4). Documentar cada fn: o que chama, qual endpoint, qual cron dispara.
60. **[D]** Criar `ops.fn_provider_http(p_verb text, p_path text, p_body jsonb)` — wrapper ÚNICO que resolve url/key do vault e chama `net.http_post`. É o "client.ts" em SQL.
61. **[D]** Migrar `zapp.fn_validate_whatsapp_connection_url` (menor risco) p/ o wrapper. Validar manualmente.
62. **[D]** Migrar `evo.fn_sync_lid_from_api`. Validar com o cron correspondente.
63. **[D]** Migrar `ops.fn_notify_critical_alerts` (Canal WhatsApp) p/ o wrapper. Testar disparo sintético.
64. **[D]** Migrar `zapp.fn_reconcile_dispatch`. Acompanhar 2 ciclos do cron.
65. **[D][!]** Migrar `zapp.fn_outbound_dispatch` (caminho de ENVIO — S4): janela de baixo tráfego, monitorar `outbound-queue` antes/depois, rollback via `ops.fn_bodies_backup` em <1 min.
66. **[R]** Gate SQL: `SELECT count(*) FROM pg_proc WHERE prosrc ~ 'evolution_api_url' AND proname <> 'fn_provider_http'` = 0.
67. **[D]** Consolidar segredos: fns leem só via wrapper; inventariar e documentar os 10 secrets `evolution_*` do vault (2 pares de key duplicados — anotar qual é canônico).
68. **[R]** Registrar no CANONICAL_COLUMN_MAP / ADR: trocar provider = trocar o corpo de `fn_provider_http` + secrets, nada mais no banco.
69. **[R]** Cron-watch 48h: 0 falhas novas nos 4 crons tocados.
70. **[R]** Commit dos scripts SQL em `db/decouple/` + PR parcial.

### F6 · Prova de desacoplamento (71–82)
71. **[R]** Provider `fake` em `_shared/providers/fake/` implementando a interface do registry, sem I/O.
72. **[R]** `ProviderCapabilities` do fake declarando limitações.
73. **[R]** Registry recusa `fake` fora de `DENO_ENV=test` (S9).
74. **[R]** Front: transport fake atrás de flag de teste no `whatsappAdapter`.
75. **[R]** E2E com fake: inbox renderiza, envia (stub), recebe (fixture) — sem Evolution no ar.
76. **[R]** Simulação Evolution offline (client retorna erro): app degrada com erro explícito, render não quebra.
77. **[R]** Paridade Cloud: rodar a suite de fixtures Meta pela porta de ingestão e pelo adapter cloud.
78. **[R]** Medir cobertura: % de operações WhatsApp (front+edge+SQL) passando pelas 3 portas. Meta: 100% — publicar número real.
79. **[R]** Runbook `docs/decouple/RUNBOOK_TROCA_PROVIDER.md`: passos, tempo estimado, pontos de falha, o que NÃO está coberto.
80. **[R]** Ensaio cronometrado da troca em teste (fake↔evolution). Registrar tempo medido.
81. **[R]** Se a troca não for viável em 1 dia, escrever isso — sem sucesso fabricado.
82. **[R]** Commit + PR parcial.

### F7 · Governança de infra — evolution-stack (83–92) **[⛔ tudo nesta fase requer APROVADO]**
83. **[⛔][D][!]** E14: versionar os 5 configs `evo_watchdog_*_v1` (fonte real dos watchdogs) no evolution-stack.
84. **[⛔][D]** E15: workflow `gitops-configs.yml` (sh → `docker config create` → `service update`).
85. **[⛔][D][!]** G4a: `evolution-security-guardian` como stack versionada (confirmado fora de stack no Portainer).
86. **[⛔][D][!]** G4b: `evolution-pgbackrest-backup` como stack versionada (idem).
87. **[⛔][D]** G6: preencher `EXPECTED_DIGEST` no drift-check (hoje só valida namespace).
88. **[⛔][D]** G5: imagem base de watchdog com bash/psql/curl/jq pré-instalados (fim do `apk add` no boot).
89. **[R]** G3: reescrever `swarm-configs/README.md` com o inventário real (o commit `ca9e1af` já listou 61 configs — consolidar).
90. **[R]** G7: normalizar alias `evolution_api_key_v6 → target v4` na próxima rotação (documentar agora).
91. **[R]** CI guard no zapp-web-v3 bloqueando recriação de `infra/evolution*` (E22 do V1, verificar se existe).
92. **[R]** Runbook DR do evolution-stack revisado pós-mudanças.

### F8 · Gates, decisões e fechamento (93–100)
93. **[⛔]** Consolidar `rpc_upsert_contact` 3-args vs 14-args — divergem em reativação de soft-deleted e campos do ON CONFLICT. Trade-off de negócio: **decisão do Joaquim**. Recomendação: manter 14-args como canônico e transformar o 3-args em wrapper que delega.
94. **[R]** Gate CI consolidado no `inventory.mjs` rodando no CI: front=0, edge-env=1, ingest-bypass=0, sql-egress=1, wording=0. Falha = PR bloqueado.
95. **[R]** ADR-009 (gateway) atualizada com as 4 portas: front adapter, edge client, ingest-port, `fn_provider_http`.
96. **[R]** `docs/BOUNDARY-evolution.md` atualizado com a fronteira LÓGICA final.
97. **[R]** Marcar como HISTÓRICO nos cabeçalhos: `PLANO_DESACOPLAMENTO_100_ETAPAS.md` (V1) e os 4 HANDOFFs de 2026-08-13 (S10 — evitar que próximo agente aja sobre estado obsoleto).
98. **[R]** Rodar `inventory.mjs` final e publicar delta contra baseline da etapa 2.
99. **[R]** PR final `feat/decouple-v2` → main; CI verde; merge.
100. **[R]** Retro em `docs/decouple/RETRO_V2.md`: números medidos, tempo real, o que ficou de fora (explícito).

---

## 4. Ordem e paralelismo
- **F1, F2, F3 são independentes** entre si (egresso edge, front, ingestão) — podem rodar em paralelo.
- **F4 depende de F3** (a porta precisa existir antes de virar canônica-only).
- **F5 é independente de tudo** e pode começar já (só banco).
- **F6 depende de F1–F5** — é o teste honesto.
- **F7 é bloqueada por APROVADO** e não bloqueia nenhuma outra.
- **F8 fecha.**

## 5. O que este plano deliberadamente NÃO faz
- Não mexe em mais nenhuma tabela/schema — a migração física está concluída e validada.
- Não remove `evolutionAdapter.ts` nem edge functions existentes.
- Não desliga o caminho Evolution em produção em momento algum.
- Não toca no FDW nem no database `evolution` externo.
- Não executa nada de F7 nem a etapa 93 sem `APROVADO` explícito.
