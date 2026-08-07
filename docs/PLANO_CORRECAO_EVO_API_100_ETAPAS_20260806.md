# PLANO DE CORREÇÃO E MELHORIAS — EVOLUTION API (100 ETAPAS)

> **Rodada:** 2026-08-06 (auditoria exaustiva multi-agente)
> **Escopo:** Evolution API completa — Docker/Swarm/Portainer · Core EVO (imagem custom) · PostgreSQL 14 (evolution) · Supabase self-hosted PG15 (schema evo/zapp) · RabbitMQ/consumer bridge · Storage R2/Supabase/MinIO · Edge Functions/webhook · Segurança/exposição · Callers/401 · Repo×runtime
> **Método:** 10 agentes especializados em paralelo (23m15s, ~300 chamadas MCP/exec read-only) + verificação independente das âncoras críticas (chaves, uptime, crons, git) + refutação empírica de 1 falso positivo
> **Relatórios-fonte:** `.hermes/auditoria-evo-api-20260806/A1..A10-*.md` (evidência por achado)
> **Regra:** etapas em ordem de fase; itens P0 < 24h, P1 < 72h, P2 < 1 semana, P3 contínuo. Nada de DDL/DML/deploy sem branch própria + PR (AGENTS.md).

---

## SCORECARD DA RODADA

| Severidade | Qtde | Destaques |
|---|---|---|
| 🔴 **P0** | 2 | RLS OFF em 5 tabelas `zapp.evolution_*` (68.989 msgs expostas) · `apikey: ***` literal no source E no bundle de produção |
| 🟠 **P1** | 13 | Baileys rc.9 (CVE-2026-48063 + enforcement) · edge fn cloud com chave stale 401 a cada 5/15min · job 176 morto · uptime 24h 38,62% · backlog 600 alertas · purge v6 com nome errado · crowdsec detection-only · workflow não parametrizado · compose legacy · IMAGE_DIGEST ausente · consumer v6 perde 4xx · 7 policies USING:true · consumer sem healthcheck |
| 🟡 **P2** | ~30 | 13.572 objetos órfãos R2 (~17GB) · MinIO órfão · sequences fora de sync · vault 5 stale + duplicata · webhook_source NULL · rede flat · disco 83% · disconnectionAt stale · CORS_ORIGIN=* · etc. |
| ⚪ **P3** | ~40 | Higiene, docs, índices, rótulos, lixo de repo |
| ✅ **Verificados OK** | 25+ | Cadeia de chaves v5 íntegra (swarm→file→env→vault→edge, md5 `0d658c…` nos 4) · T1–T6 no runtime · /manager 403 fail-closed · 0 portas expostas · TLS até 23/10 · Redis db8 sem dados sensíveis · 34 consumers ativos · filas em 0 · dedup 0 duplicatas (242.963) · partições OK · 57 migrations Prisma íntegras · sessão viva no PG (creds 17.313 B) · consumer.py byte-idêntico repo×runtime · edge fns 106/106 sem drift · worker CF saudável · cadeia de alertas 73→84→205 funcional |

**Falso positivo refutado com prova ao vivo:** achado A7-S1 ("secret file stale, 401") — o teste original usou o sha256 como chave; o conteúdo cru do arquivo `evolution_api_key_v4_20260704` autentica **200 OK** na API, o env do edge-runtime é **SAME** ao arquivo (fp `69fca44365d5` nos dois), e `md5(arquivo) == md5(vault) == 0d658c…` (v5, atualizado 06/08 14:07Z). **Nenhuma rotação necessária** — a cadeia v5 está íntegra. Evidência: `chk_key.sh`/`chk_key2.sh` na pasta de auditoria.

---

# FASE 0 — GOVERNANÇA & REPO (etapas 1–10)

### 1. Versionar os 3 docs críticos untracked
Commit de `docs/INCIDENTE-EVOLUTION-20260806.md`, `docs/PLANO-B-BAILEYS-6.7.24.md`, `docs/RUNBOOK_401_WORKERS_EVOLUTION_20260806.md` (hoje `??` no git — conhecimento crítico fora de controle de versão). **Evidência:** A10-24.

### 2. Arquivar docs obsoletas do mecanismo runtime
Mover para `docs/_archive/`: `AUDITORIA_EVO_API_2026-07-10.md`, `AUDITORIA_EVO_API_2026-07-12.md`, `AUDITORIA_EXAUSTIVA_2026-07-12/16.md`, `AUDIT_*_2026-07-*` (mecanismo logpatch runtime substituído por build-time T1–T6). **Evidência:** A10-23.

### 3. Criar `AUDITORIA_TRACKING_EVO_20260806.md`
Herdar pendências do tracking anterior (`.hermes/auditoria-infra/AUDITORIA_TRACKING.md`, 100 itens): CORS wildcard (item 3 PARCIAL), consumer v7 (item 18), gap sync nativo→espelho 351k×67k (item 15), wa-version-monitor (item 23), unicidade de sessão (item 22), rotação x-webhook-secret+SENTRY (item 9), colapsar 3 tabelas de webhook (item 13).

### 4. Sincronizar `infra/evolution/docker-compose.evolution.yml` com o stack 25 real
Imagem custom `ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:9d110bc7…`, entrypoint custom, secrets `v5_20260805→v4`, healthcheck CORS-aware (`/manager/health` + Origin), rate limit 200/100/1m, `watchtower.enable=false`. **O compose atual do repo é LEGACY integral (imagem oficial 6b195676 + logpatch runtime) — usá-lo reverte produção.** Alternativa: apontar para `docs/infra/evolution-stack.reconciled.yml` como fonte única. **Evidência:** A10-16 (P1), A10-17.

### 5. Sincronizar artefatos T1–T6 no git
`build-patches.mjs`/`Dockerfile`/`docker-entrypoint.sh` estão na variante T1–T5 (banner sem T6, entrypoint 1.642 B); produção roda T1–T6 (bundle 487.045 B, banner `evolution-api-custom 2.3.7 | patches T1-T6 build-time`, entrypoint 3.365 B com auditoria A-8). Rebuild com os artefatos atuais **regrediria patches**. **Evidência:** A2-3 (P2), A2 §2.1/§2.4.

### 6. Corrigir labels da imagem custom
`org.opencontainers.image.source` → `https://github.com/adm01-debug/zapp-web-v3/tree/main/infra/evolution-api-custom` (hoje aponta para repo **404**); adicionar `LABEL org.opencontainers.image.revision=${{github.sha}}` (via ARG — hoje herdado do commit da base oficial 2025-12) e `com.atomicabr.baileys`. **Evidência:** A2-4 (P2), A10-07 (P1).

### 7. Corrigir `ARG BASE_IMAGE` (build-arg morto)
O workflow passa `build-args: BASE_IMAGE` mas o Dockerfile tem `FROM` hardcoded — no Plano B (base diferente) o input é ignorado silenciosamente. Adicionar `ARG BASE_IMAGE` + `FROM ${BASE_IMAGE}` ou remover o arg. **Evidência:** A10-13 (P1).

### 8. Criar `.dockerignore` em `infra/evolution-api-custom`
Ausente (audit A-8). Excluir `main.js`, `main.patched.js`, `*.md`, `__pycache__` do context do build — cache do buildx poluído hoje. **Evidência:** A10-06 (P2).

### 9. Higiene do repo (lixo de sessões)
Remover: `src/integrations/supabase/types.ts.new` (2,2 MB, resto do validate-supabase-types), `infra/evolution-consumer/__pycache__/consumer.cpython-311.pyc`, `.hermes/__pycache__/`, `agent-0..4-report.md`, `check_output.txt`, `diff-786.txt`, `exd/exe/exf/exf2/exg.json`, `canon_vs_prod_*`, `init_body.txt`, `init_headers.txt`, `ptools.json`, `cf_scan_out/`. **Evidência:** A10-28/31/34 (P2/P3).

### 10. Gate de CI anti-`apikey: ***`
Adicionar ao CI: falhar o build se `grep -rn '\*\*\*' src/ supabase/functions/` casar header literais (padrão do bug PR #894 que já quebrou 3 arquivos e o bundle de produção). **Evidência:** A8-P0-2.

---

# FASE 1 — SEGURANÇA (etapas 11–20)

### 11. **P0** — Habilitar RLS nas 5 tabelas `zapp.evolution_*` expostas
`evolution_messages` (68.989 linhas), `evolution_media` (39.419), `evolution_contacts` (20.672), `evolution_alerts` (664), `evolution_audit_log` (407): **RLS OFF + grants SELECT/INSERT/UPDATE/DELETE para `anon` e `authenticated`** — qualquer usuário logado (e potencialmente anon via PostgREST `Content-Profile: zapp`) lê/altera mensagens e mídias WhatsApp. Aplicar policies `auth_workspace_*` (padrão do schema) e revogar grants DML de `anon`. Migration versionada + teste. **Evidência:** A8-P0-1 (prova por catálogo: relrowsecurity=false + role_table_grants).

### 12. **P0** — Corrigir `apikey: ***` literal (3 arquivos + bundle)
`src/features/inbox/hooks/voice/logVoiceCommand.ts:39-40`, `src/pages/admin/Connections.tsx:202`, `src/components/team-chat/department-management/DepartmentWhatsAppView.tsx:25-26` — redação incompleta do commit a219582bc: o runtime envia `apikey: ***` → **401 garantido para sempre** (voice command logs e teste de conexão admin nunca funcionam). Substituir por `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` + Bearer real, rebuild + redeploy. **Evidência:** A8-P0-2 (4 ocorrências no bundle `playTtsAudio-aIGB7M6U.js`).

### 13. **P1** — Corrigir 7 policies RLS `USING: true` (permissive) p/ `authenticated`
`alert_dispatch_state`, `processed_webhook_events` (payloads de mensagens!), `webhook_health_alerts`, `restore_test_log`, `rpc_rate_limits` (`auth_full_access`) + `cookie_probe_log`/`cookie_probe_pending` (`rls_cookie_probe_service_only` — **nome diz service-only mas role=authenticated** — bug de role). Restringir a admin/service_role. **Evidência:** A8-P1-1.

### 14. **P1** — Decisão crowdsec: anexar bouncer OU desativar
Engine detecta (2,35M linhas processadas, 12 bans ativos) mas **nenhum bloqueio é aplicado** (bouncer sem pull desde 15/07; middleware definido, não anexado). ⚠️ **O IP do escritório 186.207.138.55 está BANIDO agora** (expira ~4h) — `cscli decisions delete` + whitelist em `evo-mgr` e no crowdsec antes de anexar. **Evidência:** A8-P1-2.

### 15. **P2** — Mover `CROWDSEC_BOUNCER_API_KEY` para secret Swarm
Literal `"atomicabr-traefik-bouncer-2026"` no compose do stack 154 (stacks 25/113 estão limpos). **Evidência:** A8-P2-2.

### 16. **P2** — Overlay dedicada `evolution_internal` (Internal=true)
Evolution+consumer+redis+rabbitmq+postgres na `AtomicaBRNet` aberta com ~90 peers (n8n, openclaw, github-runner, minio…): qualquer container comprometido alcança o core. Mitigação atual: 0 portas publicadas + cap_drop ALL + read_only. Criar overlay isolada e mover o tier EVO; expor só via Traefik. **Evidência:** A8-P2-1/A1-P2-5.

### 17. **P2** — Revisar `CORS_ORIGIN=*` (decisão documentada)
Com `CORS_CREDENTIALS=false` o risco é baixo (matriz: reflete origem, sem credentials, preflight 204), mas a allowlist restrita (manager/UI) reduz superfície. Decidir e documentar — **não** reverter sem plano de rollback (já causou outage F2-07b). **Evidência:** A2-6, A8 matriz CORS.

### 18. **P3** — Verificar `gmaps_scraper` publicando `*:9090->8080`
Única porta publicada não-Traefik do swarm. Confirmar intencionalidade ou restringir. **Evidência:** A8 P3.

### 19. **P3** — Limpar `.env` da imagem base (valores de exemplo)
300+ chaves com valores placeholder em `/evolution/.env` — superfície de confusão sem segredo real identificado. Documentar ou remover do build. **Evidência:** A2-7.

### 20. Verificação pós-hardening
`supabase_get_advisors` (0 warns novos em evo/zapp), prova por **request real** como anon (leitura de `zapp.evolution_messages` deve retornar 401/403), `rg 'apikey: \*\*\*' src/` = 0, re-teste da matriz /manager. Gate D-8: `SELECT count(*) FROM evo.v_security_audit WHERE status LIKE '%⚠%'` = 0.

---

# FASE 2 — CORE EVO & BAILEYS (etapas 21–30)

### 21. **P1** — Mergear workflow parametrizado (`f2/plano-b-baileys-6724` → main)
`publish-evolution-api-custom.yml` desta branch NÃO tem inputs `baileys_version`/`evolution_ref`/`base_image`, não tem smoke Design B′, não tem `actions/setup-node` (pitfall 18e — node antigo do runner). O parametrizado existe na branch do Plano B — mergear com os 3 componentes (setup-node, smoke na imagem final, build do source). **Evidência:** A10-12 (P1), A10-13.

### 22. **P1** — Executar o Plano B: rebuild com baileys corrigido
Produção roda **baileys 7.0.0-rc.9** (vulnerável **CVE-2026-48063**: spoofing/app-state corruption; e é o driver do enforcement #2248). Alvo: `7.0.0-rc.12+` (ou 6.7.24 estável). Pré-requisitos: etapa 5 (artefatos T1–T6 sincronizados), re-extração dos literais minificados **do bundle que será patcheado** (geração esbuild muda os nomes), `npm install baileys@<ver> --save-exact` + `npx tsup` (typecheck falha com 6.7.24 — esperado), swap de `node_modules/baileys` (Design B′). **Evidência:** A2-1 (P1), A2 §2.2, PLANO-B docs.

### 23. **P1** — Publicar GHCR + repin do stack 25
Rollback garantido antes: digest atual `9d110bc7…` existe no GHCR (token anônimo). Deploy stop-first + `failure_action: rollback` + monitor 180s já configurados. Tags: `:<sha12>` + `:2.3.7-baileys-<ver>` + label `com.atomicabr.baileys`.

### 24. **P1** — Validar pós-deploy do Plano B
`evo_status` (open), logs sem erro crítico, verificação runtime dos patches T1–T6 no bundle novo, consumer processando, `_prisma_migrations` inalterado (57), WhatsApp sem logout nas 24h seguintes (monitorar connection_history).

### 25. **P2** — Tratar `disconnectionAt` stale
DB `Instance` mantém `disconnectionAt=2026-08-06T12:52:23.968Z/401` com instância `open` (nunca limpo pós-reconexão — comportamento conhecido AG-EX-05 #16). Job ou fix na app para limpar após reconexão; senão o campo vira fonte de falso alarme. **Evidência:** A2-5.

### 26. **P2** — Injetar `IMAGE_DIGEST` no stack 25
Entrypoint lê `OCI_DIGEST` mas nenhum env existe → auditoria A-8 grava `image_digest=''` para sempre (gap F2-14). Adicionar `IMAGE_DIGEST=<digest do pin>` ao compose (fonte da verdade, zero drift) + fallback GHCR no entrypoint. **Evidência:** A10-04/18 (P1), A8 P3.

### 27. **P2** — Rotacionar/remover a chave v4 stale
Fonte histórica dos 401s (`627×401 vs 326×200` em connectionState). A v5 está íntegra em todos os consumidores (verificado); a v4 não deve mais existir como credencial. Auditar referências remanescentes antes. **Evidência:** A2-2 (P1).

### 28. **P2** — Re-apontar callers com chave stale
UI manager (186.207.138.55 — relogar, 15×401 pós-fix) e edge fn cloud (etapa 31). **Evidência:** A9-P3.

### 29. **P3** — Tag semântica no GHCR para o digest atual
`9d110bc7…` está sem tag (pin por digest); tags existentes (`2.3.7`, `d950fc194301`, etc.) não apontam para ele. Facilitar rollback rastreável. **Evidência:** A2-8.

### 30. **P3** — Teste real de restore da sessão
`Session.creds` (17.313 B, viva no PG14) — testar restore a partir do pg_dump (`postgres-backup-daily` → R2) em ambiente descartável + reconnect do wpp2 (pendência AG-EX-05 #24). Documentar RTO/RPO.

---

# FASE 3 — CALLERS 401 & INTEGRAÇÕES (etapas 31–40)

### 31. **P1** — Corrigir edge fn cloud `evolution-health` (projeto `match`)
Caller 401 ativo (432 hits pós-fix do vault): `supabase link --project-ref gwopzfulndgjtujbmxzj` → `supabase secrets set EVOLUTION_API_KEY=<v5> EVOLUTION_API_URL=https://evolution.atomicabr.com.br EVOLUTION_INSTANCE_NAME=wpp2` → `supabase functions deploy evolution-health evolution-api`. ⚠️ `instance_name` hoje = a URL (erro de config — causa `connectionState/https://evolution…/` 404). Validar: probe `fetch_instances.status=200` + próximo tick no Traefik 200. **Evidência:** A9-A1 (P1) — prova ao vivo 20:45:23Z, cadência 5/15min, rajada ~100 sendText em 6s.

### 32. **P1** — Ressuscitar job 176 (`fn_v2_pipeline_heartbeat`)
Morto desde 18:03Z (42 runs/24h, último start 15:03:00-03, nenhum run depois; pg_cron vivo — demais jobs rodam). Heartbeat sintético `v2_pipeline_mirror_heartbeat` (2/h) parado → observabilidade do mirror cega. Investigar ativo/schedule e reativar. **Evidência:** A9-A2 (P1).

### 33. **P1** — Acompanhar episódio de SLA (uptime 24h = 38,62%)
`v_wpp2_uptime_24h`: connects 16, disconnects 7, pico 83,58% (thresholds 99/95). Episódio `wpp2_uptime_sla_breach` 19:21Z escalado/notificado, aberto. Instância `open` agora — garantir auto-resolução do alerta (padrão AG-EX-19) e monitorar 24h estáveis. **Evidência:** A9-A3.

### 34. **P2** — Re-apontar `fn_detect_401_bursts` (job 173) para fonte real
Disparou `warroom_critical` "401 BURST: 4 signals" com **0×401 real** no audit log (fonte errada: webhook_audit_log mede rejeições da edge fn, não 401 da API) + mensagem com texto stale ("Chave atual: evolution_api_key_v4_20260704"). Fonte correta: connection_history/Traefik. **Evidência:** A9-A4 (P2).

### 35. **P2** — Investigar gap de 2h20m do watchdog-baileys
Sem checks 16:12–18:32Z (retomou sem restart) — janela cega durante instabilidade pós-re-pareamento. Coletar logs completos da janela; se loop travou, adicionar watchdog-do-watchdog (job 188 já cobre guardian — estender). **Evidência:** A9-A5.

### 36. **P2** — Corrigir swarm-task-guardian (sem heartbeat desde 02/08)
5.648 min sem heartbeat em `zapp/evo.evolution_guardian_heartbeat` → guardião de replica_drift/duplicate/reconnect_storm **cego há 4 dias**. Verificar dblink/config do stack 120 (container Up 6 dias mas não escreve). **Evidência:** A9-A6, A9-A4.

### 37. **P3** — Relogar UI do manager (chave stale no browser)
15×401 pós-fix do IP do escritório em `fetchInstances?instanceId=` — assinatura de localStorage com chave antiga. **Evidência:** A9-P3.

### 38. **P3** — wa-version-monitor: gravar DB + corrigir uptimeMs
`_wa_web_version_history` sem registros desde 31/07 (monitor não grava quando a versão não muda — observabilidade parcial); worker CF loga `uptimeMs=1.786e12` (~56 anos — bug de cálculo). **Evidência:** A9-A11.

### 39. **P3** — Higiene de `instance_auth_events`
2.493 falhas de auth acumuladas p/ `instance='unknown'` (2.528 total), 31 eventos com `event_type NULL` — adicionar retenção, tipagem e agrupamento. **Evidência:** A7-S6, A4-E20.

### 40. **P3** — Investigar 22 rejected/24h no webhook
8 Invalid signature + 8 Missing + 4 Invalid shared secret + 2 invalid_json (0,04%). Correlação suspeita com vault `webhook_secret` stale (03/05) — validar alinhamento vault×instância×edge (o secret da instância está correto: `promo-brindes-evolution-4d4565…`). **Evidência:** A4-E11, A7 §4.

---

# FASE 4 — SUPABASE PG15 / SCHEMA EVO (etapas 41–50)

### 41. **P1** — Triagem/purga do backlog de 600 alertas abertos
512 critical no `evo.evolution_alerts` (pipeline_gap 210, consumer_halt 104, ddl_drop_alert 73, warroom_critical 60, guardian_heartbeat_missing 46, ingestion_persistence_gap 41, pipeline_dead_man 27, wpp2_disconnection 25). Estender o job 65 (purge) para tipos abertos >90d (mesmo padrão do purge 4) + auditar os ~100 recentes (falsos positivos vs incidentes reais) antes de fechar. **Evidência:** A4-E1 (P1).

### 42. **P2** — Corrigir drift do `instance_registry` (job 96)
`status='connected'` mas `connection_status='disconnected'` (colunas gêmeas nunca reconciliadas; `last_connected_at` NULL). Alinhar a função de sync. **Evidência:** A4-E2.

### 43. **P2** — Investigar 572 ciclos connecting/qr_pending/24h do wpp2
294 connecting + 278 qr_pending + 16 connected + 4 disconnected + 3 logged_out — churn alto mesmo com estado atual open; correlacionar com o enforcement #2248 e a janela do watchdog (etapa 35). **Evidência:** A4-E3.

### 44. **P2** — Religar ou aposentar `evolution_health_logs`
1 linha total (01/07) — 36 dias morta; `fn_wpp2_uptime_kpi` (job 163) computa de connection_history e não grava. Decidir: gravar health log no KPI ou declarar órfã junto da etapa 45. **Evidência:** A4-E4.

### 45. **P2** — Remover fantasmas do schema evo
`evolution_webhook_metrics` (0 linhas, sem trigger), `evolution_ip_watch` (0 linhas, sem trigger), `v_401_observability` (view cega — lê ip_watch) — após ajustar a doc do `v_kpi_overview` (referencia ip_watch) e confirmar que nenhuma edge fn consome. Migration versionada. **Evidência:** A4-E5/E6.

### 46. **P2** — Rotação/limpeza do Vault
5 secrets stale desde **03/05** (`api_url`, `instance_name`, `postgres_dsn`, `postgres_password`, `webhook_secret`) + **duplicata** `evolution_pg_password` == `evolution_postgres_password` (md5 `1b3468d4…` idêntico, updated_at divergentes 11/07×03/05). Atualizar os vivos, eliminar a duplicata (ou documentar consumidor). Backup do vault antes (padrão F2-09). **Evidência:** A4-E8/E9.

### 47. **P2** — Popular `webhook_source` (+`idempotency_key`) no `markEventProcessed`
100% NULL em 242.951 linhas — proveniência (webhook nativo × consumer) impossível de auditar no dado. Patch cirúrgico na edge fn (coluna já existe). **Evidência:** A4-E10, A7-S4.

### 48. **P2** — Remover funções órfãs do schema evo
`fn_get_401_payload`, `fn_peak_hours_sla_check` (sem job), `fn_get_401_payload_v2` (benigna), `fn_detect_external_401_bursts` — nenhuma referenciada por cron/pg_rewrite. **Evidência:** A4-E7.

### 49. **P3** — Unificar overload `fn_log_api_401` (3/4 args)
Verificar qual variante o caller usa; a 3-arg sem status pode ser resquício. **Evidência:** A4-E19.

### 50. **P3** — Revisar 9 warnings do advisor em `public` (EXECUTE a authenticated)
`evo_logpatch_audit_ins`, `generate_transfer_ticket`, `get_contact_intelligence_by_phone`, `handle_new_user_settings`, `is_instance_paused`, `on_role_change`, `rpc_get_contact` (×2), `trg_fn_set_transfer_ticket` — avaliar necessidade de EXECUTE amplo. **Evidência:** A4-E16.

---

# FASE 5 — POSTGRES 14 EVOLUTION (etapas 51–60)

### 51. **P1** — Corrigir purge v6 (nome + política)
Trocar `evolution_guardian_events` → **`_swarm_guardian_events`** (3.555 linhas, **100% `resolved_at IS NULL`** — nem corrigindo o nome, a condição "resolved" deletaria algo: decidir política `detected_at < 30d` ou marcar resolved). Adicionar ao ciclo: `_audit_destructive` (90d — 4.667 linhas/13 MB acumulando) e `_consumer_dlq(resolved)` (30d — 198 retidos). **Evidência:** A3-F1/F2/F4 (P1/P2).

### 52. **P2** — `setval` das sequences fora de sync
`evolution_webhook_events_id_seq` −22 (1.344.997 vs max 1.345.019) e `_audit_outbound_trap_id_seq` −2 — risco de colisão de PK na tabela mais quente. Fix: `setval` em janela curta (escopo write — autorização necessária). **Evidência:** A3-F3.

### 53. **P3** — Single-flight do purge
Roda 2×/dia (19:24 + 19:31 — task antiga exit 137 + nova): ciclo duplicado, VACUUM concorrente, churn amplificado do IsOnWhatsapp (ciclo 1 removeu 0, ciclo 2 removeu 5.916). Rodar por cron/flock, não no start de cada task. **Evidência:** A3-F5/F10.

### 54. **P3** — Retomar logging em `_purge_runs`
Sem registros desde 05/07 (seq parada em 60) — telemetria histórica do purge perdida (hoje só logs do container). **Evidência:** A3-F6.

### 55. **P3** — Revogar `CREATE` no schema public p/ `n8n_app` + alinhar grants
`n8n_app` tem USAGE+CREATE (CREATE desnecessário) e `warroom_alerts` tem DELETE do purge mas grant só SELECT — inconsistência de usuário no stack file do purge (verificar). **Evidência:** A3-F7, A3 §8.

### 56. **P3** — Avaliar `idx_media_instance` (248 kB) a drop
Único candidato real entre 13 índices `idx_scan=0`. **Nunca** dropar `idx_sge_kind` (serve o purge de _swarm_guardian_events) nem PK/UNIQUE/FK. **Evidência:** A3-F8.

### 57. **P3** — Documentar decisão: `evolution_webhook_events` plana
188.122 linhas/108 MB, sem partições (relkind r), estável com purge 14d. Documentar como decisão consciente + gatilho para particionar (>500 MB ou >1M linhas). **Evidência:** A3-F9.

### 58. **P3** — Retenção das tabelas pequenas não cobertas
`_wa_web_version_history` (21), `_mirror_consistency_log` (2), `_mcp_health_events` (18), `_audit_watchdog` (0) — volumes insignificantes hoje; incluir no ciclo v6+ para teto. **Evidência:** A3 §7.3.

### 59. **P3** — Revisar roles/connlimits
`postgres` com atributo **replication** + connlimit 20; `n8n_app` connlimit 30; sem slots (pg_dump-only — ok). Documentar perfil de acesso do PG14. **Evidência:** A3 §8/§11.

### 60. **P3** — Plano de crescimento do banco (713 MB)
Message = 403 MB (349k linhas) — com retenção 90d + job 88 (archive wpp2 12m) o volume é controlado; reavaliar trimestralmente. **Evidência:** A3 §1.1.

---

# FASE 6 — RABBITMQ & CONSUMER BRIDGE (etapas 61–70)

### 61. **P1** — Implementar fix v7 do consumer (perdas 4xx)
16 msgs perdidas em ~4,7h (5×429 + 4×429 + 7×404 gateway `404 page not found` = Traefik). v7: 429 → **nack+retry respeitando Retry-After** (a edge faz rollback de idempotência para reentrega — C-1); 4xx do gateway (body não-JSON) → nack+retry com backoff; drop definitivo só para 4xx JSON da edge (400/401/403/422). **Evidência:** A5-F1 (P1).

### 62. **P1** — Deploy do consumer v7
Publicar GHCR (tag `<sha12>` + `:v2`), repin do stack 113 (2 réplicas), validar banner v7 + `[STATS]` sem drops 4xx/429 em 24h + prova de failover (etapa 69). **Evidência:** A5.

### 63. **P2** — Replay das 4 msgs pending na `_consumer_dlq`
`chats.upsert` ×2 + `messages.update` ×2 (19:25:31Z — dados REAIS do burst 502/404). Replay idempotente via runbook `references/dlq-replay.md` (assinatura HMAC do payload, rate 10/s). **Evidência:** A5-F2.

### 64. **P2** — Healthcheck + `failure_action: rollback` no consumer
Hoje: **NONE** + `pause` (tier critical, 2 réplicas, sem detecção de loop silencioso; deploy quebrado deixa pausado sem sinal). **Evidência:** A1-P2-3.

### 65. **P3** — Limpar política fantasma `dlq-protect`
3 políticas no mesmo pattern `^wpp2\.dlq$` (dlq-retention p20 efetiva + dlq-protect p10 + wpp2-dlq-policy p10 inertes) — se a efetiva cair, a config muda silenciosamente. Manter 1 por pattern. **Evidência:** A5-F3.

### 66. **P3** — Recriar binding `wpp2 → wpp2.groups.update` (rk curto)
16/17 binds curtos presentes (faltou groups.update); consumer.py não declara binds — origem externa. Confirmar routing key do publisher (longa vs curta) e recriar. **Evidência:** A5-F4.

### 67. **P3** — Cobertura do `unroutable.audit` no dlq-alert-guard
Fila sem consumidor e fora das checagens F2-23/25 — acumula silenciosamente se eventos ficarem unroutable. **Evidência:** A5-F5.

### 68. **P3** — Persistir stats do consumer em tabela
`[STATS]` é só log (memória) — KPI de drop/backlog não é SELECT-ável. Criar `evo.evolution_rabbit_consumer_stats` e gravar no v7. **Evidência:** rabbitmq-ops skill.

### 69. **P3** — Prova de failover real (2 réplicas)
Matar 1 réplica em janela controlada: validar absorção pela outra, redelivery absorvido pelo dedup (`webhook_events_processed` UNIQUE), restauração. **Evidência:** A5 §4.

### 70. **P3** — Teste de DR do RabbitMQ
Validar restore do volume `rabbitmq_data` (backup gpg → R2 14d) + import de definitions em broker descartável. **Evidência:** A5, AG-EX-15.

---

# FASE 7 — STORAGE & MÍDIA (etapas 71–80)

### 71. **P2** — Lifecycle/limpeza do R2 (13.572 objetos órfãos ~17 GB)
Prefixos `evolution-api/<uuid-morto>/`: `9f148b81` (5.334 obj/5,1 GB), `d8e07e44` (6.170/4,9 GB), `7676538d` (1.952/6,7 GB), `a422ee94` (93/136 MB), `f957389a` (23/3 MB), `backfill-stickers` (88/17 MB). Política: archive → delete >90d; vincular limpeza ao evento de recriação de instância (UUID muda). **Evidência:** A6-A3 (P2).

### 72. **P2** — Descomissionar MinIO (stack 19)
Órfão: 0 referências a `minio:9000`/`s3.atomicabr.com.br` em 96 containers; dados migrados p/ R2 em 05/03 (`minio-archive/` no R2 = 12,6 GB). Checklist: (a) validar zero tráfego externo no access log do Traefik p/ `s3.*`/`minio.*`; (b) remover labels Traefik; (c) remover de `CRITICAL_SERVICES` do infra-boot-guard; (d) reter `minio-archive/` como backup histórico. **Evidência:** A6-A4, A1-P2-4.

### 73. **P2** — Dívida ADR-001: produtores gravarem `media_bucket`+`media_path`
8.988 URLs públicas persistidas em `zapp.evolution_messages` (`/object/public/…`) — dependência de `public=true` no display; classe do incidente 06/08 (18.494 objetos quebrados na re-privatização). Mitigado pelo guard `trg_guard_media_buckets_public`, não eliminado. Produtores: `persistMediaToStorage`/`persistMediaViaApi` (`_shared/evolution-media.ts:104/205`). **Evidência:** A6-A7 (P2).

### 74. **P2** — `classify-sticker`: definir `AI_GATEWAY_KEY` ou desativar
4 erros `[Configuration Error]` por janela (cada invocação falha). **Evidência:** A6-A8.

### 75. **P3** — Higiene do bucket de produção
Remover `s3check-1786018256709.txt` (artefato de teste) + corrigir `scripts/s3-diagnose.js` (prefixo `_tmp/` + remove em finally). **Evidência:** A6-A10.

### 76. **P3** — `audio-memes` com 0 objetos
Produtores ativos (E10 voice-changer/F3/F4) mas bucket vazio — confirmar feature em uso ou desativar produtores; checar `voice_conversion_queue`. **Evidência:** A6-A5-obs.

### 77. **P3** — Validar cadeia de backups do DB evolution
R2 `backups/evolution-db` com apenas 1 objeto (dump 05/04) — dumps atuais vão para `promo-brindes-backups`. Confirmar cobertura/rotação 14d do `postgres-backup-daily` (stack 112) e validar restore (etapa 30). **Evidência:** A6 P3.

### 78. **P3** — Auditoria de custo R2
17 GB órfãos (etapa 71) + `minio-archive/` 12,6 GB + 37.022 objetos ativos — dimensionar custo e definir política de tiering. **Evidência:** A6.

### 79. **P3** — Verificar volume `/var/lib/storage` (storage-api)
Tamanho em disco, backup e integridade (19.211+2.654 objetos file-based — não coberto pelo volume-backup? confirmar). **Evidência:** A6 §5.

### 80. **P3** — Documentar topologia de mídia final
R2 `zapp-whatsapp-media` (Evolution S3, 981 uploads/dia) × Supabase Storage file (app) × buckets públicos — fluxograma + donos + política de TTL. **Evidência:** A6 §1.

---

# FASE 8 — EDGE FUNCTIONS & WEBHOOK (etapas 81–90)

### 81. **P2** — Decisão formal sobre `EVOLUTION_WEBHOOK_ALLOW_SHARED_SECRET`
Fallback deprecated = **caminho majoritário real** (2.492 warns/36min ≈ 50% das requests — Evolution nativa envia `x-webhook-secret`; HMAC só no consumer). Opções: manter true documentando como caminho oficial do produtor nativo + telemetria dos warns; ou proxy assinador. **Evidência:** A7-S2.

### 82. **P2** — Atualizar documentação de rate limits da edge fn
Implementado ≠ documentado: `EVENT_RATE_LIMITS` por event-type via RPC (`chats.update` 2000, `contacts.update` 1000, `messages.update/upsert/groups.upsert` 600, default 300/min, janela 60s) — **sem limite por IP, sem 60/min send**. 0×429 real → sem urgência, mas corrigir docs/estado conhecido (evita diagnóstico errado). **Evidência:** A7-S3.

### 83. **P2** — Remover 11 edge fns candidatas a órfãs (wave2 parcial)
`elevenlabs-dialogue/scribe-token/sfx/tts-stream/tts/voice`, `evolution-bitrix-sync/credentials/retry-metrics/sync/templates` ainda tracked — cruzar com A7/AG-EX-13 e runtime (106/106 sem drift de presença) antes de remover. **Evidência:** A10-19 (P1).

### 84. **P3** — Avaliar `GROUPS_UPSERT` no webhook wpp2
10 eventos configurados sem GROUPS_UPSERT → rate limit `groups.upsert` (600) inócuo; grupos hoje só via fila. Decidir se o app precisa de eventos de grupo no webhook. **Evidência:** A7-S8.

### 85. **P3** — Monitorar isolates do edge-runtime
31 wall-clock + 62 early termination/36min, 0×502 correlacionado — reavaliar após upgrade do edge-runtime (v1.74.0). **Evidência:** A7-S7.

### 86. **P3** — Investigar 20×401/24h do webhook com `recheck-webhook-signature`
8 Invalid + 8 Missing + 4 Invalid shared secret — fonte não identificada (probe/scanner/consumer com header errado). **Evidência:** A7-S5.

### 87. **P3** — Log de sucesso HMAC
Sucesso não loga (0 strings de sucesso no hmac-validation) — invisibilidade do split consumer×nativo. Adicionar log de sucesso (rate-limited). **Evidência:** A7 §3.

### 88. **P3** — Teste de auto-pause end-to-end
Simular spike de falhas (10/60s) com `x-evolution-instance: runtime-selftest` — validar pausa 15min + retomada + contador limpo. **Evidência:** A7 §2.

### 89. **P3** — Dashboard de invocações por edge fn
Contagem `serving the request` por função (hoje só evolution-webhook monitorado) — painel de uso/custo. **Evidência:** A7 §5.

### 90. **P3** — Inventário de donos das 106 edge fns
Catalogar função→dono→uso (as 11 candidatas da etapa 83 dependem disso); arquivo de referência para futuras ondas de limpeza. **Evidência:** A7/A10.

---

# FASE 9 — OBSERVABILIDADE & FECHAMENTO (etapas 91–100)

### 91. **P1** — Corrigir/confirmar o KPI de uptime (38,62%)
Episódio aberto `wpp2_uptime_sla_breach` — garantir auto-resolução ao voltar a OK (padrão AG-EX-19: 1 alerta por episódio + auto-resolução) e janela de 24h estável ≥99% pós-repair. **Evidência:** A9-A3.

### 92. **P2** — Fechar o gap do `image_digest=''` na auditoria A-8
Após etapa 26 (IMAGE_DIGEST no compose), validar `evo.evolution_logpatch_audit` com digests reais nos próximos boots. **Evidência:** A8 P3.

### 93. **P2** — Fonte real de %401 para o KPI
`pct_401_24h` NULL no `v_kpi_overview` (ip_watch vazia — etapa 45 remove). Integrar contagem do Traefik access log (grep DownstreamStatus=401) ao KPI, ou criar view sobre uma tabela alimentada por coleta periódica. **Evidência:** A4-E6, v_kpi_overview notas.

### 94. **P2** — Automação de análise do access log do Traefik
Rotação diária (traefik-log-rotate) + job de sumário (401s por host/path/cadência) — hoje a forense é manual. **Evidência:** A9 método.

### 95. **P3** — Monitorar disco do host (83%)
33,7 GB livres de 193,6 GB — gatilho de ação em 85% (host-disk-guard 166 já alerta; definir plano de expansão/limpeza). **Evidência:** A1-P2-2.

### 96. **P3** — Housekeeping: incluir imagens órfãs na janela
`gotenberg <none>` 1,83 GB (dangling) + `postgres:15-alpine` 283 MB + `postgres:16-alpine` 276 MB (refs=0) + 12 outras (6,75 GB reclaimable total). **Evidência:** A1-P2-2.

### 97. **P3** — Validar Sentry ponta a ponta
DSN + traces 0.05 do bundle (T3) + consumer (Sentry 4xx fora de 404/422, 7/6 eventos na janela) — confirmar eventos chegando no projeto Sentry. **Evidência:** A2 §5, A5 §6.

### 98. **P3** — Teste end-to-end da cadeia de alertas
Disparo → job 73 (escala) → job 84 (notifica wpp2/n8n/Bitrix24) → job 205 (verifica entrega) → warroom mirror — com alerta sintético e rollback imediato. **Evidência:** A4-E12 (0 falhas/24h hoje).

### 99. **P3** — Runbook de DR consolidado + teste real agendado
Restore evolution-db (pg_dump→R2), Session.creds (etapa 30), redis-data, rabbitmq definitions (etapa 70), R2 media — RTO/RPO documentados e exercitados trimestralmente.

### 100. **P3** — Re-auditoria programada (mensal) + fechamento
Rodar o roteiro D-12 (7 fases) mensalmente; atualizar este plano (status por etapa: ✅/🔄/⏳); scorecard final 10/10 por categoria (Segurança · Estabilidade · Dados · Observabilidade · Governança); fechar com merge das branches de correção + deploy validado (padrão do fluxo pós-onda).

---

## ANEXO A — Mapa de severidade consolidado (resumo por fonte)

| Fonte | P0 | P1 | P2 | P3 | INFO |
|---|---|---|---|---|---|
| A1 Docker/Swarm | 0 | 0 | 5 (pinagem, disco, HC consumer, minio, rede flat) | 5 | — |
| A2 Core EVO | 0 | 2 (baileys, 401s) | 4 (artefatos, label, disconnectionAt, CORS) | 4 | — |
| A3 PG14 | 0 | 1 (purge nome errado) | 3 (audit_destructive, seq, dlq) | 7 | — |
| A4 Supabase | 0 | 1 (backlog alertas) | 9 (registry, instabilidade, health_logs, fantasmas, vault, source, rejected) | 7 | 5 |
| A5 RabbitMQ | 0 | 1 (perdas 4xx) | 1 (pending replay) | 3 (dlq-protect, binding, unroutable) | 4 |
| A6 Storage | 0 | 0 | 4 (órfãos R2, minio, URLs públicas, classify-sticker) | 4 | — |
| A7 Edge fns | 0 | 0* (1 refutado) | 3 (shared-secret, rate limits, source NULL) | 5 | — |
| A8 Segurança | 2 (RLS, apikey ***) | 2 (policies USING:true, crowdsec) | 2 (rede, plaintext) | 3 | — |
| A9 Callers | 0 | 3 (edge fn cloud, job 176, SLA) | 3 (job 173, watchdog gap, guardian) | 3 | — |
| A10 Repo | 0 | 5 (compose, workflow, BASE_IMAGE, IMAGE_DIGEST, labels, 11 fns) | 5 (secrets git, dockerignore, docs, lixo) | 3 | — |

*Falso positivo A7-S1 refutado com prova ao vivo (ver scorecard).

## ANEXO B — Referências

- Relatórios A1–A10: `.hermes/auditoria-evo-api-20260806/A{1..10}-*.md` + evidências JSON/scripts no mesmo diretório
- Auditoria anterior (100 itens): `.hermes/auditoria-infra/AUDITORIA_TRACKING.md` + `AG-EX-01..20`
- Incidente 05/08: `docs/INCIDENTE-EVOLUTION-20260806.md` · Plano B: `docs/PLANO-B-BAILEYS-6.7.24.md` · Runbook 401: `docs/RUNBOOK_401_WORKERS_EVOLUTION_20260806.md`
- Reconcilição container×Supabase: `docs/audit-2026-08-06/` (98/100 ✅)
- Skills: `evolution-runtime-diagnostics`, `evolution-api-custom-image-ops`, `rabbitmq-ops`, `portainer-ops`, `supabase-mcp-http-fallback`, `mcp-http-jsonrpc`
