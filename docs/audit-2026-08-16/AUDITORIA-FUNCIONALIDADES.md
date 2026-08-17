# AUDITORIA EXAUSTIVA — ZAPP WEB V3 (Promo Brindes / AtomicaBR)
**Data:** 2026-08-16 · **Maestro:** Hermes (DeepSeek) · **Método:** 2 ondas × 22 agentes read-only + evidência de banco vivo via Supabase MCP
**Escopo:** docs/ (584 .md, 11MB) do repo `adm01-debug/zapp-web-v3` @ main `72ea9fbe7` + schema `zapp` em produção

---

## 0. Metodologia

1. Worktree isolado read-only em `hermes-workspaces/audit-zapp-20260816/wt-docs` (origin/main).
2. Onda 1 (12 agentes): `docs/estado/` — 43 arquivos de inventário funcional (16.418 linhas).
3. Onda 2 (10 agentes): `docs/decouple/` (88), raiz de `docs/` (188), `decisions/`, `adr/`, `architecture/`, `arquitetura/`, `edge/`, `db/`, `security/`, `audit*/`, `reconciliation/`, `history/`, `cutover/`, `dados/`, `testing/`, `validacao/`, `infra/`, `ops/`, `observability/`, `ci/`, `playbooks/`, `runbooks/`, `incident/`, `_archive/`.
4. Evidência de produção (read-only): 340+ tabelas em `zapp`, 955 funções, 657 migrations aplicadas.

## 1. Linha de base — evidência de produção (Supabase MCP)

| Métrica | Valor | Significado |
|---|---|---|
| Tabelas schema `zapp` | ~340 | Muito além das 56 declaradas no README (doc desatualizado) |
| Funções schema `zapp` | 955 | Backend massivo (BPM, filas, LGPD, alertas, DLQ, webhooks, pipeline evo, email/Gmail, stickers, dashboards...) |
| Migrations aplicadas | 657 | DB-as-source ativo |
| Tabelas com dados vivos | webhook_events_processed 334k (369MB), webhook_audit_log 71k (76MB), app_notifications 14k, evolution_* | Pipeline de produção operando |
| Contas WhatsApp | whatsapp_connections: 3 | wpp2 + extras |


## 1b. Itens com evidência de runtime (🧪 VERIFICADO — medição viva nesta auditoria)

| Item | Evidência |
|---|---|
| Backend DB massivo | 340+ tabelas, 955 funções, 657 migrations aplicadas (Supabase MCP, 16 ago) |
| Pipeline de webhooks ativo | webhook_events_processed 334 mil linhas (369 MB), webhook_audit_log 71 mil, webhook_rate_limits 186 |
| Notificações ativas | app_notifications 14 mil linhas |
| Conexões WhatsApp | whatsapp_connections 3 (wpp2 + extras) |
| Grupos/presença | evolution_groups 221, evolution_group_participants 10.733 |
| Monitoria viva | fn_health_score_history 837, vault_healthcheck_log 75, warroom_alerts 61, evolution_alerts 1.189 |
| Observabilidade DB | _db_size_snapshots 22, restore_test_log 24, license_heartbeat_log 30 |
| RLS aplicado em massa | has_rls=true em ~340 tabelas medidas; 386/386 policies e search_path íntegros (docs/estado/37) |
| Telemetria de mídia | evolution_media 19 MB, evolution_whatsapp_status 18 MB |

## 2. Classificação por status

| Símbolo | Significado |
|---|---|
| ✅ PRESENTE | Código implementado (análise estática) — **runtime NÃO comprovado** na maioria (docs declaram `Runtime: NAO_VERIFICADO`) |
| 🧪 VERIFICADO | Implementado **e** comprovado em runtime (banco vivo, publication, logs, teste com assertiva real) — evidência citada |
| 🟡 PARCIAL | Existe mas incompleto / TODOs / bugs conhecidos |
| ❌ NÃO INICIADA | Planejado, nunca implementado |
| 📋 PLANO | Sugerido em planos/roadmap (decisão pendente) |
| 🤔 INFERIDO | Status não explícito nos docs — **bucket separado, fora do total** |

> **Régua de validação (após reprovação da camada VALIDA):** `✅ PRESENTE` ≠ `🧪 VERIFICADO`. Achados como realtime morto, fila offline, stubs e testes fantasma provam que código presente pode estar morto em produção. A categoria ✅ foi rebaixada semanticamente: é presença de código, não prova de funcionamento. O que tem evidência viva está na seção 1b.
## 3. Matriz consolidada de funcionalidades

| Finding | Domínio | ✅ TOTAL | 🟡 PARCIAL | ❌ NÃO INICIADA | 📋 PLANO | 🤔 INFERIDO |
|---|---|---|---|---|---|---|
| 01 | Frontend + Features Batch 1/2 | 59 | 23 | 1 | 1 | 3 |
| 02 | Auth + Admin | 60 | 21 | 1 | 1 | 6 |
| 03 | Inbox Hooks + Services | 59 | 62 | 1 | 1 | 3 |
| 04 | Inbox Chat/Contatos/IA | 69 | 21 | 0 | 0 | 1 |
| 05 | Inbox Raiz A-Z | 134 | 21 | 2 | 1 | 5 |
| 06 | UI/Settings/Contacts/Connections/Dashboard | 102 | 46 | 5 | 1 | 6 |
| 07 | TeamChat/Monitoring/Security/Queues/Integrações | 37 | 25 | 11 | 2 | 4 |
| 08 | Layout/Gamificação/TalkX/Catálogo/Email/Voice/CRM360 | 88 | 39 | 6 | 9 | 3 |
| 09 | Componentes médios/pequenos + Hooks raiz 1-2 | 184 | 15 | 1 | 3 | 1 |
| 10 | Hooks raiz 3-4 + testes de hooks | 230 | 41 | 6 | 9 | 7 |
| 11 | Lib + testes residuais | 170 | 44 | 7 | 11 | 6 |
| 12 | Backend Edge/DB/Infra/E2E | 23 | 44 | 27 | 8 | 5 |
| 13 | Decouple: planos 100 etapas + ADRs | 91 | 0 | 1 | 0 | 0 |
| 15 | Decouple: baselines/fronteira/contratos | 10 | 0 | 12 | 0 | 0 |
| 16-22 | Decouple handoffs + auditorias/ADRs/edge/subdirs | 58 | 12 | 8 | 0 | 0 |
| **TOTAL** | **22 findings / 584 docs** | **1.364** | **414** | **89** | **47** | **50** |

> Nota: ✅ = PRESENTE (código existe; análise estática). Execução de UI/runtime não comprovada na maioria dos itens. Os 50 🤔 inferidos estão FORA do total — soma real classificada = 1.914 itens. O banco vivo confirma o backend (340+ tabelas, 955 funções, 657 migrations), mas a execução de UI/runtime continua não comprovada na maioria dos itens.

### Falsos positivos / erratas detectadas na auditoria
- ERRATA-TOPOLOGIA: achados A1/A2 do doc 31 estão INVERTIDOS (topologia física é `evo`, não view `zapp`) — 6 correções propostas nunca aplicadas; 24 falsos positivos.
- Contradição inter-docs: INFRA (2026-08-06) diz "0 policies USING(true)" × AUDIT_REPORT_2026-08-06 diz "48 USING(true)" — mesma data.
- Doc 36 achado A8 (docblocks evo.*) contaminado por premissa invertida — descartar.
- README "56 tabelas / 20 EFs / 55 migrations" está 6-12x desatualizado (real: ~340 tabelas, 111 EFs, 337 migrations no repo / 657 no DB).



## 4. Pendências globais (união do que não está concluído)

## 4. Pendências globais (consolidadas — as que mais doem)

### 🔴 Críticas de produção (risco ativo HOJE)
1. **Realtime morto**: `evolution_messages`/`evolution_conversations` fora da publication `supabase_realtime` — inbox não recebe eventos novos.
2. **Fila offline quebrada (ADR-005)**: tag `send-queued-messages` ≠ `send-messages` escutada pelo SW; handler `sw.js:152` é `console.log` vazio.
3. **3 bypasses do gateway Evolution** (2 enviam WhatsApp via vault direto): `evolution-templates` (401 em 100%), `evolution-notification-dispatcher`, `connection-health-check`.
4. **Secrets expostos**: ACCESS_KEY commitada no `migrate-helper` (vivo no cloud), JWT_SECRET em 33 commits históricos, MCP_QUERY_SECRET vazado sem rotação, `VAULT_ENC_KEY` placeholder no supavisor.
5. **Buckets PII públicos**: `whatsapp-media` (9,56 GB) e `recibos-entrega` sem assinatura.
6. **`evolution-templates` 401 em 100%** das chamadas do browser (falha silenciosa) + `email-imap-bridge` STUB + deploy DRAFT concorrente com produção.

### 🟠 Alto impacto (dados falsos / features enganosas)
- Dashboards com dados hardcoded: SatisfactionMetrics (`dataUnavailable=true`), gamificação fictícia (XP=1250/coins=89/streak=7), ConversationHeatmap zeros, SicoobBridge stub.
- Stubs sem feature flag em produção: GoogleCalendar, N8n, Sentry, AutoExportManager, useLatestAnalysis, useSyncToCRM, CRMAutoSync.
- 33/46 serviços órfãos (~2.900 linhas nunca integradas); externalProxy vivo com suíte desligada.
- Testes fantasma: 270 team-chat + 52 RLS com `expect(true)`; 6/13 specs e2e sem asserção; webhookStatusPriority testando cópia divergente.

### 🟡 RLS/permissividade (correção cirúrgica necessária)
- 272+141 policies `USING(true)`; 78 `true/true` para authenticated; 18 tabelas sem policy (incl. `_lgpd_payload`); 1.131 SECDEF expostas a authenticated; ~49 SECDEF sem `search_path` fixo; 7 views sem `security_invoker`.
- Team-chat: INSERT em `team_messages` sem membership check; sem DELETE policy em `team_conversations`.

### 📋 Decisões do dono (bloqueiam execução)
- Ensaio real Evolution→Cloud (E92): aguarda credenciais Meta (`WHATSAPP_CLOUD_PHONE_ID`/`TOKEN`).
- Congelamento formal das tabelas `evo` + destino das 115 funções PUBLIC.
- EVO_RETIREMENT (25 tabelas frias) e INDICES_CLEANUP (13 índices).
- Remoção do `evolution-proxy` + migração ZappWebbDemoPage (ADR-011).
- Google OAuth, isolamento multi-tenant, avatar migration (1.066 avatares).


## 5. Veredito por domínio

## 5. Veredito por domínio

| Domínio | Veredito |
|---|---|
| Frontend base (rotas, páginas, UI kit) | ✅ Maduro — mas 128 páginas órfãs e 5 sistemas paralelos de EmptyState |
| Inbox (chat/contatos/IA) | 🟡 Amplo mas frágil — núcleo realtime sem testes; stubs de UI visíveis (tags, hover toolbar, vídeo) |
| Mensageria (hooks/services) | 🟡 61/121 itens parciais; retry/throttle/mark-read com defeitos conhecidos |
| Auth/Admin | 🟡 Sólido com furos: bypass dev em prod, MFA catch silencioso, backup codes sem persistência |
| Backend DB (RLS/RPCs/funções) | ✅ Massivo (955 fns) com 🟡 RLS permissiva demais + drift migrations (657 DB × 337 repo) |
| Edge Functions | 🟡 111 fns; 3 quebradas em produção; deploy manual sem versionamento |
| Integrações (Email/SIP/Bitrix/AI/Gmail) | 🟡 50% funcional; SIP inseguro (credenciais compartilhadas, 8 gaps VoIP); Gmail parcial |
| Features de negócio (TalkX/Campanhas/CRM360/Catálogo) | 🟡 Construídas mas incompletas: campanhas sem RLS de escrita, CRM sync stub, agendamento sem cron |
| Dashboards/Relatórios/SLA | ❌ Parcialmente fictícios — dados hardcoded, métricas zeradas, SLA duplicado |
| Desacoplamento Evo×Zapp (V4) | 🟡 ~80% concluído; pendências grandes: cloud real, roles, congelamento, gates |
| Infra/Ops | 🟡 Operando (657 migrations, pipeline ativo) com dívidas: OOM do purge, secrets não montados, deploy concorrente |
| Documentação | 🟡 584 docs ricos porém com drift: README 6-12x desatualizado, ERRATA não aplicada, citações deslocadas |

