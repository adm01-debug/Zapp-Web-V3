# RELATÓRIO FINAL — Auditoria de Referências à Evolution API no zapp-web-v3
## AUDIT_EVO_REFS_20260816 · 100 etapas · 2026-08-16

**Status: CONCLUÍDO** · Gate humano aprovado · Validação Claude APROVADO (ressalvas atendidas) · 3+2 PRs mergeados

---

## 1. Contagens por classe (CSV final, 1278/1278 classificados)

| Classe | Qtd | Execução |
|---|---|---|
| FICA | 1191 | permanece (contrato vivo) |
| FICA;REVISAR | 12 | permanece + reavaliação futura |
| ARQUIVA | 13 | movido → `docs/_archive/` |
| ARQUIVA;REVISAR | 72 | movido → `docs/_archive/` (com links reescritos) |
| EXCLUI | 8 | `git rm` |
| EXCLUI;REVISAR | 11 | `git rm` + edições-satélite (allowlist, BOUNDARY, ensaio-fake) |
| MIGRA | 2 | copiado p/ evolution-stack (original permanece) |
| MIGRA;REVISAR | 4 | copiado p/ evolution-stack + followups |

**Executado (post-merge, verificado em main):** 85 docs em `docs/_archive/` (+9 ts-nocheck duplicados excluídos) · 19+ arquivos excluídos · 6 docs copiados ao evolution-stack · 1 doc copiado (rabbitmq followup) · 2 runbooks restaurados (catch E97).

## 2. EXCLUI executados (todos com prova de zero consumidores vivos)

- **Working files**: 10× `.hermes/*` (auditorias/jsnapshots antigos)
- **Duplicatas de docs**: `docs/RUNBOOK_DR_EVO_20260806.md` (canônico 24KB em runbook-evolution, migrado), `docs/EVOLUTION_API_AUDIT_2026-07-10_sessao5.md` (dup do sessao8), 9× ts-nocheck (idênticos a `_archive/cutover-reports/`)
- **Código morto**: `src/_archive/evolutionClient.archived.ts`, `src/integrations/zappweb/evolutionClient.ts`, `src/hooks/useIntegrationManagement.ts`, `src/components/monitoring/hooks/index.ts` (barrel), `supabase/functions/_shared/evolution-normalizer.ts` + `ensaio-fake.test.ts`
- **YML residuais**: `docs/infra/evolution-stack.reconciled.DEPRECATED.yml`, `infra/stacks/reconcile-ops.yml` (superseded por evolution-watchdogs v11)
- **Acompanhamentos**: `scripts/dead-code-allowlist.txt` 188→184 linhas · `docs/BOUNDARY-evolution.md` (client morto → evolutionAdapter)

## 3. MIGRA origem→destino (evolution-stack)

| Origem (zapp) | Destino |
|---|---|
| docs/EVOLUTION_API_FMEA_2026-07-04.md | docs/EVOLUTION_API_FMEA.md |
| docs/INCIDENTE-EVOLUTION-20260806.md | docs/INCIDENTE-EVOLUTION-20260806.md |
| docs/RUNBOOK_401_WORKERS_EVOLUTION_20260806.md | docs/RUNBOOK_401_WORKERS_EVOLUTION_20260806.md |
| docs/PLANO_CORRECAO_EVO_API_100_ETAPAS_20260806.md | docs/history/PLANO_CORRECAO_EVO_API_100_ETAPAS_20260806.md |
| docs/ops/RUNBOOK_EVO_DB.md | docs/RUNBOOK_EVO_DB.md |
| docs/EVOLUTION_API_EXECUCAO_2026-07-04_sessao5_infra.md | docs/EVOLUTION_API_EXECUCAO_2026-07-04_sessao5_infra.md |
| docs/runbooks/evolution-restart-rabbitmq-bindings.md | docs/evolution-restart-rabbitmq-bindings.md (followup #13) |
| *3 runbooks (DR/c9-d8/kdw)* | *NÃO copiados — canônicos mais novos já em runbooks/ (simulação s5)* |

## 4. Pendências REVISAR (12 + achados)

1. **v237Fallbacks** (`src/hooks/evolution/v237Fallbacks.ts`): produção roda Evolution **2.4.0**; fallback assume 2.3.x → reavaliar remoção quando 2.4.0 completar 60d estável.
2. **contract.zod.ts** (`_shared/providers/evolution/`): comentários assumem v2.3.x; schemas permissivos toleram 2.4.0 — atualizar comentários/contrato.
3. **evolution-bitrix-sync**: deployada, 0 invocadores + `bitrix_webhook_url` ausente no vault → decidir restaurar ou aposentar (docs EGRESS_SURFACE_V4).
4. **BOUNDARY-evolution.md**: usa nomenclatura P1-P4 (não menciona I1); atualizado nesta auditoria (seção estado final).
5. **Bug bilateral consumer-stats**: consumer (evolution-stack) posta stats HTTP a cada ~30s com 404 acumulado (function responde 401 fail-closed, nunca 404) → fix do lado do consumer no evolution-stack.
6. **Rule `no-direct-evo-url.ts` NÃO plugada no CI** (0 violações atuais) → plugar via deno lint.plugins + gate.
7. **E72: 2 migrations sem registro no banco** sem explicação (20260808280000, 20260813180000) → verificar aplicação real.
8. **E74: 6 refs STALE na baseline e41** do evolution-stack (webhook_event_status, evolution_messages_v2, _consumer_dlq, evolution_retention_log_id_seq, handle_updated_at, fn_trg_quarantine_alert) → validar no banco.
9. **Dependência reversa**: funções evo chamam `zapp.fn_normalize_send_jid` (13x) e `zapp.is_admin_or_supervisor` (6x) → formalizar como contrato no BOUNDARY.
10. **Drift consumer runtime**: container roda digest `9b1a5b967...`; stack file do evostack diz `0f4b07cfb...` → reconciliar (com o dono da stack).
11. **Guard Security Invoker vermelho no CI** (7 views sem security_invoker no banco) — drift pré-existente, fora do escopo; cron autofix existe.
12. **Labels OCI version 2.3.7 no Dockerfile** (image/Dockerfile ainda builda 2.3.7/baileys 6 Plano B; produção usa Dockerfile.2.4) → decidir aposentadoria do Dockerfile 2.3.7.

## 5. Verificação pós-merge (E97/E98)

- **E97**: delta A 242→241 (35 removidos = 27 movidos + 8 excluídos; 34 adicionados = 27 _archive + 7 artefatos da auditoria) — bate com o CSV. Catch E97: 2 runbooks restaurados (PRs #1120/#13).
- **E98**: produção HTTP 200 · webhook 10 eventos/30min (último 21:24Z) · CI main: Build/Unit/Contract/quality-gate verdes; 2 fails pré-existentes documentados (fixture evolution-proxy fixada por #1118 na main; security-invoker drift de banco).

## 6. Próximos passos pós-auditoria (sugeridos)

1. Plugar `no-direct-evo-url.ts` no CI (seguro: 0 violações) — fecha o gap E78.
2. Fix do bug 404 consumer-stats no evolution-stack (rota do POST do consumer).
3. Validar as 2 migrations sem registro (20260808280000, 20260813180000) contra o banco.

---
*Artefatos: baseline.json · triagem.csv · triagem-reversa.csv · consumidores.json · gates-snapshot.json · LOG.md*
*Repos: adm01-debug/zapp-web-v3 (#1119, #1120) · adm01-debug/evolution-stack (#11, #12, #13)*
