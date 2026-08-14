> [!NOTE] **HISTÓRICO — 2026-08-14**
> Este documento descreve o estado de 2026-08-13 e foi **SUPERSEDED** pelo [Plano V3](PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md) e pelo estado real da `main`. Leia o V3 antes de agir com base neste doc.

# Plano de desacoplamento zapp-web-v3 ↔ Evolution API — 100 etapas

**Data:** 2026-08-13 · **Baseline:** zapp-web-v3 `891b1ad73` · evolution-stack `e531ef4`
**Autor:** análise Claude Opus 5 sobre estado real (repo + Portainer + Postgres), não sobre documentação.

---

## 1. Validação da migração já executada

| Item | Estado | Evidência |
|---|---|---|
| Repo `evolution-stack` criado e populado | OK | 57 arquivos, 20 commits, 2.1 MB |
| 26 arquivos de infra removidos de zapp-web-v3 | OK | commit `b6a54a2bf`, −4234 linhas |
| 4 workflows de build migrados | OK | GHCR namespace `evolution-stack` |
| Digest em produção == digest no repo | OK | `6f9f1d35` no stack 25 e em `stacks/evolution.yml` |
| Consumer em produção no namespace novo | OK | `evolution-rabbit-consumer@75210b9f`, 2 réplicas healthy |
| 7 stacks Portainer ↔ 7 YAMLs no repo | OK | 25/113/238/239/240/225/230 |
| App rebuildado pós-split e healthy | OK | `zapp-web:production-b6a54a2bff23` |
| **Banco da Evolution já fisicamente separado** | OK | FDW `evolution_postgres` → `10.0.1.118/evolution`, 1 foreign table |

**Veredicto:** a migração de **infraestrutura** está correta e não quebrou produção. Mas ela resolveu ~15% do problema: separou os *artefatos de deploy*. O acoplamento de **aplicação** permanece 100% intacto.

### Gaps reais encontrados na migração

| # | Gap | Severidade | Evidência |
|---|---|---|---|
| G1 | `scripts/check-publish-evo-fallbacks.test.js` aponta para `infra/evolution-api-custom/Dockerfile` e `.github/workflows/publish-evolution-api-custom.yml` — ambos deletados. Teste falha com ENOENT. | Média (não está no CI, mas quebra `node --test scripts/`) | execução real: `ERR_TEST_FAILURE` |
| G2 | Os 5 Swarm configs `evo_watchdog_*_v1` são **externos e não versionados**. Editar `watchdogs/*.sh` no repo **não muda nada em produção**. | Alta — GitOps é ilusório para watchdogs | `stacks/evolution-watchdogs.yml` usa `source: evo_watchdog_*`; `swarm-configs/README.md` admite "NAO sao versionados" |
| G3 | `swarm-configs/README.md` documenta 3 configs; produção usa ≥8. | Média | README vs stacks |
| G4 | 2 serviços rodando fora de qualquer stack: `evolution-security-guardian`, `evolution-pgbackrest-backup`. | Média | `portainer_list_containers` |
| G5 | Watchdogs fazem `apk add bash postgresql-client curl jq` no boot e `exit 1` se falhar → dependência de rede externa a cada restart. | Média | `stacks/evolution-watchdogs.yml` linhas 25/62/98/133/172 |
| G6 | `drift-check` roda com `EXPECTED_DIGEST` vazio → só valida namespace, não digest. | Baixa | `watchdogs/portainer-drift-check.sh` |
| G7 | Stack 25 mapeia secret `evolution_api_key_v6_20260808` → target `evolution_api_key_v4_20260704`. Alias de nome cria confusão em rotação. | Baixa | `stacks/evolution.yml` |

---

## 2. Diagnóstico do acoplamento real

Medições sobre o código atual:

| Dimensão | Número |
|---|---|
| Arquivos citando "evolution" (src+supabase+scripts) | 587 |
| Edge functions totais | 110 |
| Edge functions `evolution-*` / `whatsapp-cloud-*` | 9 / 5 |
| Módulos `_shared/evolution-*.ts` | 9 |
| Edge functions lendo `EVOLUTION_API_URL` direto | **17** |
| Edge functions usando o proxy compartilhado | **1** (`evolution-api`) |
| Arquivos front que chamam `invoke('evolution-api')` | 21 usos / 10 arquivos |
| Arquivos front que usam `whatsappAdapter` | **6 de produção** |
| Call sites `action: 'send-*'` fora do adapter | **16** |
| Arquivos front lendo tabela `evolution_*` direto | 24 |
| Tabelas reais no schema `evo` | 165 |
| Views em `public` (compat PostgREST) | 422 |
| Views em `zapp` | 314 |

### As 4 raízes do acoplamento (em ordem de gravidade)

**R1 — O modelo canônico do sistema É o modelo da Evolution.**
`supabase/functions/_shared/whatsapp-cloud-normalizer.ts`, linha 3:
> *"Normalizes Meta WhatsApp Cloud API payloads to the unified Evolution model."*

O provider oficial da Meta foi adaptado **para** a Evolution, em vez de ambos serem adaptados para um modelo neutro do Zapp. `remote_jid`, `instance_name`, `from_me`, `push_name`, `message_type` Baileys são o vocabulário do domínio — não do provider. Enquanto isso for verdade, trocar de API significa reescrever o domínio.

**R2 — A porta de saída existe e não é usada.**
`src/lib/whatsappAdapter.ts` já é exatamente a abstração desejada: strategy com dois transports (`evolution` / `cloud`), 11 verbos implementados, seleção por modo do workspace, fallback declarado, URL de webhook por provider. **Está pronto.** Mas 10 arquivos — incluindo o caminho crítico do inbox (`externalMessageSender.ts`, `useChatMediaSending.ts`) — chamam `invoke('evolution-api')` direto, contornando-o.

**R3 — A porta de entrada existe e o caminho principal a fura.**
`whatsapp-cloud-webhook/index.ts` persiste via RPC (`rpc_upsert_contact`, `rpc_insert_message`).
`_shared/evolution-webhook-messages.ts` escreve direto: `supabase.from('evolution_messages')` em ≥3 pontos.
Assimetria: o provider secundário respeita o contrato, o primário não.

**R4 — Um gateway HTTP com 16 furos.**
`_shared/evolution-api-proxy.ts` implementa retry, timeout, idempotência, envelope versionado, telemetria de fallback. Apenas `evolution-api/index.ts` o usa. Outros 16 arquivos leem `EVOLUTION_API_URL` e fazem `fetch` próprio — sem retry, sem idempotência, sem telemetria.

### O que NÃO é acoplamento (não tocar)

- **Schema `evo` não é o banco da Evolution API.** É o schema de negócio do Zapp com nome legado. O banco real da Evolution é o database `evolution` em `10.0.1.118`, acessado por FDW, com **exatamente 1 foreign table** (`evolution_rabbit_consumer_stats_fdw`). A fronteira de dados já está limpa.
- **Renomear `evo.*` → `zapp.*` ou `evolution_messages` → `messages`** é a armadilha óbvia deste projeto: 165 tabelas, 422 views em `public`, 314 em `zapp`, 89 migrations, 24 arquivos front. Custo altíssimo, ganho puramente cosmético, risco de quebrar o PostgREST inteiro. **O plano abaixo proíbe isso explicitamente (etapa 77).**

---

## 3. Simulação de cenários de falha (feita antes de escrever o plano)

| Cenário simulado | Resultado | Consequência no plano |
|---|---|---|
| Renomear tabelas `evolution_*` | 422 views em `public` quebram → PostgREST 500 em todo o app | Proibido (E77); usar views canônicas aditivas (E78) |
| Migrar os 16 call sites de envio de uma vez | Inbox é o caminho crítico; um erro de mapeamento derruba envio de mensagem em produção | Migração 1 arquivo por vez, E40–E48, cada uma com teste |
| Trocar `rpc_insert_message` de assinatura | Cloud webhook quebra imediatamente | Extensão aditiva de parâmetros (E54) |
| Editar `watchdogs/*.sh` esperando efeito em produção | Nenhum efeito — Swarm config é a fonte real | E14–E15 fecham o loop antes de qualquer outra coisa |
| Adicionar coluna `provider` sem default | INSERTs existentes falham | `DEFAULT 'evolution'` + backfill (E79–E81) |
| Deletar `evolutionAdapter.ts` | 96 arquivos em `src/features` dependem indiretamente | Marcar legado, não remover (E37) |
| Desligar Evolution para "testar" desacoplamento | Perda de mensagens reais | Provider fake em teste, nunca em prod (E87–E90) |
| Dois agentes no mesmo repo | Já ocorreu antes (post-mortem 2026-05-10) | Branch dedicada + CODEOWNERS (E10, E22) |

---

## 4. Plano — 100 etapas

Convenção: **[R]** = reversível sem deploy · **[D]** = exige deploy · **[!]** = toca produção

### F0 · Baseline e rede de segurança (1–10)

1. **[R]** Tag `pre-decouple-v0` em zapp-web-v3 e evolution-stack — ponto único de rollback.
2. **[R]** `docs/decouple/BASELINE.md` com digests de produção: evolution `6f9f1d35`, consumer `75210b9f`, web `production-b6a54a2bff23`.
3. **[R]** Dump schema-only de `evo` + `zapp` como contrato de referência congelado.
4. **[R]** Promover `docs/BOUNDARY-evolution.md` a ADR-007 versionado (hoje é doc solto).
5. **[R]** `scripts/decouple/inventory.mjs` — conta bypasses (hoje: 10 front, 16 backend, 24 leituras diretas) e imprime delta contra baseline.
6. **[R]** Baseline de volume: mensagens/dia por caminho via `evo.v_messages_unified`.
7. **[R]** Query de paridade inbound (Evolution vs Cloud) salva como view de verificação.
8. **[R]** Rodar `e2e-evolution-vps.yml` e arquivar o resultado verde como referência.
9. **[R]** Critério de abort escrito: taxa de erro de envio >1%, DLQ >0 novos, latência p95 >2× baseline.
10. **[R]** Branch `feat/decouple-provider` + CODEOWNERS restrito — sem outro agente no mesmo repo.

### F1 · Fechar os gaps da migração de infra (11–22)

11. **[R]** Remover `scripts/check-publish-evo-fallbacks.test.js` de zapp-web-v3 (G1 — aponta para arquivos deletados, falha com ENOENT).
12. **[R]** Recriá-lo em `evolution-stack/image/tests/` com paths `image/Dockerfile`, `.github/workflows/publish-evolution-api-custom.yml`.
13. **[R]** Corrigir header de `docs/infra/evolution-stack.reconciled.DEPRECATED.yml` que ainda cita `infra/evolution/docker-compose.evolution.yml` (path removido).
14. **[D][!]** **G2 — crítico:** versionar os 5 configs `evo_watchdog_*_v1`. Hoje `watchdogs/*.sh` no repo é decorativo; produção lê Swarm config.
15. **[D]** Workflow `gitops-configs.yml`: `watchdogs/*.sh` → `docker config create evo_watchdog_<n>_<sha8>` → `service update`. Fecha o loop GitOps.
16. **[R]** Reescrever `swarm-configs/README.md` com os 8+ configs reais (G3).
17. **[D][!]** Versionar `evolution-security-guardian` e `evolution-pgbackrest-backup` como stacks (G4 — hoje rodam fora de governança).
18. **[D]** Imagem base própria para watchdogs com bash/psql/curl/jq pré-instalados (G5 — elimina `apk add` no boot).
19. **[R]** Documentar o alias `evolution_api_key_v6 → target v4` ou normalizar target no próximo ciclo (G7).
20. **[D]** Preencher `EXPECTED_DIGEST` no `evo_watchdog_portainer_drift_v1` (G6 — hoje só valida namespace).
21. **[R]** Auditar `e2e-evolution-vps.yml`: mover asserts de infra para evolution-stack, manter só os de app.
22. **[R]** CODEOWNERS + CI guard em zapp-web-v3 bloqueando recriação de `infra/evolution*`.

### F2 · Contrato canônico de domínio (23–38) — ataca R1

23. **[R]** `src/domain/messaging/types.ts`: `ChannelMessage`, `ChannelContact`, `ChannelConversation` — sem `remote_jid`, sem `instance_name`.
24. **[R]** `ChannelAddress { channel, address }` substitui `remote_jid` no domínio.
25. **[R]** `ChannelAccount { id, provider, externalRef }` substitui `instanceName`.
26. **[R]** Tabela de mapeamento `MessageType` canônico ↔ Baileys ↔ Meta (hoje só existe Baileys, em `src/adapters/evolution/messageTypes.ts`).
27. **[R]** `DeliveryStatus` canônico ↔ status Evolution ↔ statuses Meta.
28. **[R]** Zod schemas do canônico em `src/shared/` + espelho Deno em `supabase/functions/_shared/`.
29. **[R]** `ProviderCapabilities` explícito (sticker, reação, presença, template, interactive) — hoje o fallback é implícito no adapter.
30. **[R]** Testes de contrato do modelo canônico (fixtures golden).
31. **[R]** Reescrever `whatsapp-cloud-normalizer.ts` para normalizar **ao canônico**, não "ao modelo Evolution" (R1 direto).
32. **[R]** Criar `evolution-normalizer.ts` simétrico — Baileys → canônico.
33. **[R]** Golden fixtures reais: 1 payload Baileys e 1 Meta por tipo de mensagem.
34. **[R]** Teste round-trip: payload → canônico → persistência → leitura → UI shape.
35. **[R]** ADR-008 registrando o modelo canônico e por que ele não é o da Evolution.
36. **[R]** Documentar mapa coluna Postgres ↔ campo canônico.
37. **[R]** Marcar `src/adapters/evolutionAdapter.ts` como legado de leitura — **não remover** (96 arquivos em `src/features` dependem indiretamente).
38. **[R]** Gate CI: novos imports de `@/types/evolutionExternal` proibidos fora de `src/adapters/`.

### F3 · Porta de saída única (39–52) — ataca R2

39. **[R]** Estender `whatsappAdapter` com os verbos hoje só disponíveis via bypass: `getQrCode`, `restartInstance`, `connect`, `listAccounts`, `listGroups`.
40. **[R]** Migrar `src/features/inbox/hooks/realtime/externalMessageSender.ts` (send-text, send-media) — caminho crítico do inbox.
41. **[R]** Migrar `src/features/inbox/hooks/realtime/externalAudioSender.ts`.
42. **[R]** Migrar `src/features/inbox/hooks/useChatMediaSending.ts` (send-media, send-text, send-audio).
43. **[R]** Migrar `src/features/inbox/hooks/useNewConversation.ts` (send-text).
44. **[R]** Migrar `src/hooks/groups/actions.ts` (list-groups + broadcast send-text).
45. **[R]** Migrar `src/hooks/useConnectionStatusIndicator.ts` (connect).
46. **[R]** Migrar `src/components/monitoring/MonitoringConnectionsList.tsx` (get-qrcode, restart-instance).
47. **[R]** Migrar `src/features/integrations/hooks/useEvolutionApiIntegration.ts` (list-instances).
48. **[R]** Migrar `src/features/connections/data-access/whatsappConnectionRepository.ts`.
49. **[R]** Absorver `src/lib/withRequestId.ts` como decorator interno do adapter (preserva trace headers).
50. **[R]** Teste unitário por arquivo migrado, com transport mockado — nenhum merge sem teste.
51. **[R]** ESLint rule: `invoke('evolution-api')` proibido fora de `src/lib/whatsappAdapter*`.
52. **[R]** Gate: contador de bypass front = 0 (baseline era 10).

### F4 · Porta de entrada única (53–66) — ataca R3

53. **[R]** Auditar assinatura atual de `rpc_insert_message` e `rpc_upsert_contact`.
54. **[D]** Estender as RPCs com `p_provider`, `p_account_ref` — **aditivo com default**, nunca quebrando o Cloud webhook.
55. **[R]** `supabase/functions/_shared/ingest-port.ts` — função única de ingestão canônica.
56. **[R]** Migrar `_shared/evolution-webhook-messages.ts` para a porta (hoje `supabase.from('evolution_messages')` em ≥3 pontos).
57. **[R]** Migrar handlers de sticker e mídia do webhook Evolution.
58. **[R]** Migrar upsert de contato do caminho Evolution para `rpc_upsert_contact`.
59. **[R]** Unificar idempotência dentro da porta (`evolution_send_idempotency` + `evo.ingest_ledger`).
60. **[D]** `consumer.py` grava em `public.evolution_webhook_events`: manter como raw-event store, documentar que não é caminho canônico.
61. **[D]** Coluna `provider` em `evo.evolution_webhook_events_v2` (13 partições + default).
62. **[D][!]** Backfill `provider='evolution'` nas partições existentes, em lotes.
63. **[R]** Teste de ingestão dual: mesmo evento lógico por Cloud e Evolution → mesma linha canônica.
64. **[D]** DLQ discriminada por provider em `evolution_webhook_dlq`.
65. **[D]** Métrica por provider em `evolution_daily_metrics`.
66. **[R]** Gate CI: `from('evolution_messages')` proibido em edge functions fora de `ingest-port.ts`.

### F5 · Gateway HTTP único no backend (67–76) — ataca R4

67. **[R]** Promover `_shared/evolution-api-proxy.ts` → `_shared/providers/evolution/client.ts`, preservando envelope v1.
68. **[R]** `_shared/providers/registry.ts` — resolve client por conta/provider.
69. **[R]** Migrar `_shared/evolution-helpers.ts` e `_shared/evolution-media.ts`.
70. **[R]** Migrar `batch-fetch-avatars`, `fetch-whatsapp-avatar`.
71. **[R]** Migrar `connection-health-check`, `connection-test`, `health`.
72. **[R]** Migrar `evolution-sync`, `evolution-group-sync`.
73. **[R]** Migrar `migrate-media-storage`, `recover-corrupted-audios`, `reprocess-failed-messages`.
74. **[R]** Migrar `nps-scheduler`, `talkx-send`, `webhook-diagnostic`.
75. **[R]** Centralizar leitura de `EVOLUTION_API_KEY` — só no client (hoje espalhada em 20 arquivos).
76. **[R]** Gate: `Deno.env.get('EVOLUTION_API_URL')` permitido em exatamente 1 arquivo (baseline: 17).

### F6 · Camada de dados — expand/contract (77–86)

77. **[R]** **Decisão registrada: NÃO renomear tabelas nem o schema `evo`.** 165 tabelas, 422 views em `public`, 314 em `zapp`. Custo/risco desproporcional ao ganho.
78. **[D]** Views canônicas `zapp.messages`, `zapp.contacts`, `zapp.conversations` sobre `evo.*` — aditivas, sem tocar nas existentes.
79. **[D]** Coluna `provider text NOT NULL DEFAULT 'evolution'` em `evo.evolution_messages`.
80. **[D]** Idem em `evo.evolution_contacts` e `evo.evolution_conversations`.
81. **[D][!]** Backfill de `provider` derivado de `instance_name` e do caminho Cloud, em lotes com watermark.
82. **[D]** Índice parcial por provider onde houver filtro real (validar com `pg_stat_user_indexes` antes).
83. **[D]** Expor views canônicas via PostgREST (`public.messages` etc.) sem remover as legadas.
84. **[R]** Migrar leituras do frontend (24 arquivos; 22 usos de `evolution_messages`) para as views canônicas.
85. **[R]** Manter views legadas como alias por 1 ciclo completo antes de qualquer depreciação.
86. **[D]** Estender `schema-drift-guard` (stack 164) para cobrir as views canônicas.

### F7 · Prova de desacoplamento (87–94)

87. **[R]** Provider `fake` em `_shared/providers/fake/` — implementa a interface, não faz I/O.
88. **[R]** `ProviderCapabilities` do fake declarando o que não suporta.
89. **[R]** E2E: transport = fake → inbox renderiza, envia, recebe (com stub).
90. **[R]** Simulação Evolution offline: app degrada com erro explícito, não quebra render.
91. **[R]** Ambiente de teste com Cloud API como transport primário — validar paridade de tipos.
92. **[R]** Medir cobertura real: % de operações WhatsApp que passam pela porta (meta: 100%).
93. **[R]** Runbook "trocar de provider": passos concretos, tempo estimado, pontos de falha.
94. **[R]** Registrar resultado medido. Se a troca não for viável em 1 dia, dizer isso — sem sucesso fabricado.

### F8 · Governança e fechamento (95–100)

95. **[R]** ADR-009: fronteira app ↔ provider definitiva (a ADR-006 está SUPERSEDED e a BOUNDARY só cobre a fronteira física).
96. **[R]** Gate CI consolidado: bypass front = 0, bypass backend = 1, sem `from('evolution_messages')` fora da porta.
97. **[R]** Atualizar `docs/BOUNDARY-evolution.md` com a fronteira **lógica** (hoje só documenta arquivos, não contratos).
98. **[R]** Remover o wording "unified Evolution model" e o acoplamento conceitual residual.
99. **[D][!]** Após validação: limpar as ~40 tabelas `_backup_*`/`_snap_*` em `evo` (≥150 MB, incluindo `_backup_repontagem_evolution_messages_20260812` com 85 MB).
100. **[R]** Retro: rodar `inventory.mjs` contra o baseline da etapa 5 e publicar o delta medido.

---

## 5. Ordem de execução e paralelismo

- **F1 é pré-requisito de tudo.** Enquanto G2 existir, qualquer mudança em watchdog é ilusória.
- **F2 é pré-requisito de F3/F4/F5.** Sem modelo canônico, as portas só renomeiam o acoplamento.
- **F3, F4 e F5 podem correr em paralelo** — tocam camadas disjuntas (front, ingestão, egresso backend).
- **F6 depende de F2** (nomes canônicos) e habilita F7.
- **F7 é o único teste honesto** de que o desacoplamento aconteceu. Sem ele, o resto é reorganização de código.

## 6. O que este plano deliberadamente não faz

- Não renomeia tabela, coluna, schema ou edge function.
- Não remove `evolutionAdapter.ts`, `evolution-api`, nem nenhuma edge function existente.
- Não move `src/`, `supabase/functions/` ou `supabase/migrations/` para evolution-stack.
- Não desliga o caminho Evolution em produção em momento algum.
- Não toca no FDW nem no database `evolution` externo.
