# 🚨 PLAYBOOK DE INCIDENTE — EVO API

**Projeto:** EVO API · VPS AtomicaBR · **Fase E — etapa 99** · **Atualizado:** 08/08/2026
**Autor:** agente de governança (execução) · **Uso:** qualquer pessoa de plantão segue as fases em ordem.
**Relacionados:** `EVOLUTION_OPS_RUNBOOK.md` (procedimentos) · `AUDITORIA_MENSAL.md` (prevenção)

---

## 1. Severidades

| Sev | Definição | Exemplos | Resposta |
|---|---|---|---|
| **P1** | WhatsApp fora / pipeline de mensagens parado / dados em risco | instância desconectada, consumer parado com DLQ crescendo, backup falho, CORS outage | Imediata — warroom + n8n + Sentry; sem janela |
| **P2** | Degradação parcial ou risco crescente | WAL lag subindo, rate-limit 429s, 401s anômalos, watchdog canary instável | < 2h |
| **P3** | Desvio sem impacto imediato | drift de edge fns, crons com falha, resíduos, falsos positivos do guardrail | Próximo ciclo (≤ 48h) |

---

## 2. Timeline do incidente (fases com SLO)

```
DETECÇÃO ──► TRIAGE ──► MITIGAÇÃO ──► VALIDAÇÃO ──► POST-MORTEM
 ≤5 min      ≤15 min     ≤60 min      contínua       ≤ 5 dias úteis
```

### FASE 0 — DETECÇÃO (alvos: ≤ 5 min)
Fontes de detecção, por ordem de confiabilidade:
1. **Guardrail (stack 226)** — loop ~15min, 8 checks:
   `docker service logs reconcile-ops_guardrail --since 30m | grep -E "RESUMO|ALERTA"`
2. **Sentry** — exceções novas/crônicas (erros do runtime evolution + edge fns)
3. **n8n warroom** — tabela `warroom_alerts`
4. **Monitores**: stack 195 (`_mcp_health_events`, 11 targets) · stack 229 (401s Traefik) ·
   stack 230 (canary wpp2 self-ping, http esperado 201) · stack 231 (keepalive realtime, heartbeat 25s)
5. **Relato humano** (zapp-web sem mensagens, usuário reclamando)

> Ao detectar, **abrir incidente imediatamente** (template §5.1) com timestamp, sintoma e evidência crua.

### FASE 1 — TRIAGE (alvos: ≤ 15 min)
Responder 3 perguntas antes de tocar qualquer coisa:
1. **O que está afetado?** (instância? pipeline? banco? infra?) — isolamento por componente
2. **Desde quando?** — logs com `--since`; tabelas com `processed_at`/`created_at`
3. **Tem risco de piorar se eu mexer?** — regra: **diagnóstico read-only primeiro, mutação depois**

Checklist de triagem rápida:
```bash
# estado geral
docker service ls | grep -E "evolution|supabase|consumer|guardrail|watchdog|realtime"
# logs recentes do serviço suspeito
docker service logs <stack>_<serviço> --since 15m | tail -100
# instância WhatsApp viva?
curl -s -H "apikey: <EVO_KEY>" https://evolution.atomicabr.com.br/instance/fetchInstances | head -c 500
# eventos recentes do mcp-health (DOWN/RECOVERED?)
# SELECT target,event,http_code,observed_at FROM public._mcp_health_events ORDER BY observed_at DESC LIMIT 10;
```

**Classificação:** P1/P2/P3 (§1) + componente (evolution | consumer | supabase | realtime | backup | infra | segurança).

### FASE 2 — MITIGAÇÃO (alvos: P1 ≤ 60 min; rollback é a 1ª escolha)
Princípios:
- **Rollback primeiro**: reaplicar compose/digest/config anterior (< 5 min) quando a mudança recente é a causa provável.
- **1 mudança = 1 verificação**: aplicar, verificar logs/efeito, só então a próxima mudança.
- **Nunca executar mutação destrutiva sem gate** (purge manual, drop de slot, rmi de imagem) —
  sempre via maestro, com DRY_RUN/gates da política anti-resíduos.
- Em P1, **comunicar** no warroom o que está sendo feito (evita retrabalho paralelo).

### FASE 3 — VALIDAÇÃO (contínua após mitigação)
- Logs do serviço afetado limpos no critério do incidente (ex.: zero `Invalid webhook signature`, zero 503)
- Guardrail retornando `OK` nos checks afetados (`grep RESUMO`)
- Tabelas de saúde voltando a avançar (timestamps recentes)
- Canary http=201 · consumer stats avançando · DLQ drenando ou estável
- **Janela de observação mínima:** 24h para P1/P2 (72h se envolveu rotação de segredo)

### FASE 4 — POST-MORTEM (≤ 5 dias úteis; template §5.2)
Todo P1/P2 exige post-mortem. P3 pode virar item de auditoria mensal.

---

## 3. Runbooks de incidente específicos

### 3.1 WhatsApp desconectado (instância offline) — P1
**Sintomas:** canary http≠201 · `evo_status` offline · mensagens não chegam · alerta Sentry/n8n.

```bash
# 1) estado da instância
curl -s -H "apikey: <EVO_KEY>" https://evolution.atomicabr.com.br/instance/fetchInstances | grep -A5 wpp2
# 2) logs da evolution (últimos 30min)
docker service logs evolution_evolution --since 30m | grep -iE "wpp2|disconnect|logout|error" | tail -50
# 3) eventos de auth (auto-pause? 10 falhas/60s → pause 15min)
# SELECT instance_name, reason, count(*) FROM public.instance_auth_events
#   WHERE created_at > now() - interval '24 hours' GROUP BY 1,2 ORDER BY 3 DESC;
```
**Ações:** (a) se auto-pause ativo → aguardar janela; investigar causa dos 401s ANTES de reativar.
(b) se logout/QR → reconectar via pairing code (`POST /instance/connect/wpp2` — MCP ou API).
(c) se container crashando → restart do serviço stack 25 e validar `RestartCount`/OOM.
**Critério de saída:** `connectionState='open'` (ou QR emitido), canary 201, mensagens fluindo.

### 3.2 WAL lag alto — P2 (P1 se teto alcançado)
**Sintomas:** guardrail `ALERTA WAL-01` (≥2000MB em 2 amostras) · `wal_status` próximo de `lost`.

```bash
# 1) inventário de slots + dono (REGRA: coluna database decide o dono, não o nome cainophile_*)
# SELECT slot_name, database, slot_type, active, wal_status, restart_lsn, confirmed_flush_lsn
#   FROM pg_replication_slots;
# 2) walsenders — backend_start pré-restart = outro container (ex.: Logflare sobreviveu ao restart)
# SELECT pid, application_name, client_addr, state, sent_lsn, backend_start FROM pg_stat_replication;
# 3) amostras de lag (3× ~60s)
# SELECT now(), slot_name, active,
#   round(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)/1048576::numeric,2) AS lag_mb
#   FROM pg_replication_slots WHERE slot_name='<slot>';
# 4) tendência: taxa = Δlag/Δt; dias até teto = (max_slot_wal_keep_size − lag)/taxa
# SELECT name, setting, unit FROM pg_settings WHERE name IN ('wal_sender_timeout','max_slot_wal_keep_size','wal_keep_size');
```
**Assinaturas:** `restart_lsn` congelado + `sent_lsn` avançando = **consumer parado** (não é órfão);
`confirmed_flush_lsn` avançando = lag transitório; `active=false` sem walsender = consumer desconectado.
**Ações:** restart do container **dono** (Realtime 2G RAM confirmado / Logflare / outro CDC) —
nunca dropar slot por nome; nunca `pg_terminate_backend` no walsender sem diagnóstico.
**Critério de saída:** lag < 2000MB e caindo; guardrail `OK WAL-01`.

### 3.3 Consumer parado / DLQ crescendo — P1
**Sintomas:** `_consumer_dlq` crescendo · `evo.evolution_rabbit_consumer_stats` parado · filas RMQ acumulando.

```bash
# 1) logs do consumer
docker service logs evolution-rabbit-consumer_consumer --since 15m | tail -100
# 2) stats
# SELECT * FROM evo.evolution_rabbit_consumer_stats ORDER BY collected_at DESC LIMIT 3;
# 3) DLQ (resolvido = status='replayed' — NÃO existe coluna resolved)
# SELECT status, count(*) FROM _consumer_dlq GROUP BY status;
```
**Ações:** (a) restart serviço (2 réplicas, start-first, parallelism 1 — zero downtime);
(b) se erros HMAC/401 → rotação de secret (§3.2 do runbook: validar `slot=0 primary`, `EVOLUTION_WEBHOOK_SECRETS`);
(c) replay do DLQ com `status='replayed'` após causa resolvida; (d) verificar filas RMQ e retries (MAX_DELIVERY=3, backoff ≤60s).
**Critério de saída:** stats avançando, DLQ estável/decrescente, guardrail sem ALERTA novo.

### 3.4 Backup falho — P1 (risco de perda de dados)
**Sintomas:** guardrail `ALERTA BACKUP-01` (dump < 60MB ou idade > 26h) · stack 124 com erro.

```bash
# 1) dumps disponíveis
docker exec <container-supabase-backup> ls -lh /backups/ | tail -10
# 2) logs do backup
docker service logs supabase-backup_<svc> --since 24h | tail -50
# 3) tamanho real do banco (sentinel 60MB — dump legítimo em 08/08: 96,5MB)
# SELECT pg_size_pretty(pg_database_size('postgres'));
```
**Ações:** rodar dump manual; se dump < sentinel: conferir se é legítimo (drops recentes) ANTES de
ajustar sentinel; nunca reduzir sentinel sem evidência. Restore: §3.6 do runbook.
**Critério de saída:** dump novo ≥ sentinel, idade < 26h, guardrail `OK BACKUP-01`.

### 3.5 CORS outage (500 `Not allowed by CORS`) — P1
**Contexto real:** outage 2026-08-06 — lista restrita derrubou consumidores sem header Origin
(curl, n8n, edge fns, MCP) porque `originCallback` roda mesmo sem Origin → 500.
**Detecção:** 500s no browser/zapp-web; logs do stack 25 com `Not allowed by CORS`.

```bash
# preflight de teste (apikey inválida basta):
curl -s -o /dev/null -D - -X OPTIONS \
  -H 'Origin: https://zapp.atomicabr.com.br' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'apikey: invalid-test-key' \
  https://evolution.atomicabr.com.br/instance/fetchInstances
# esperado: 204 + Access-Control-Allow-Origin refletida
```
**Ações:** (a) rollback imediato: CORS_ORIGIN → `*` (ou lista anterior) + reaplicar stack 25 (< 5 min);
(b) root cause: lista restrita SEM `*` exige o patch de 1 linha na imagem custom (origem ausente → allow),
ver `cors/CORS_FIX_PLAN.md`; (c) lista canônica deve incluir SEMPRE `https://evolution.atomicabr.com.br`
(healthcheck do stack 25) e as origens de zapp-web/manager/ferramentas.
**Critério de saída:** 204 no preflight para origens legítimas; zero 500 CORS por 72h.

### 3.6 Rate-limit 429 no webhook (Evolution → Supabase) — P2
**Sintomas:** `AxiosError: status code 429` nos logs · `webhook_audit_log` com `rate_limit_exceeded` · mensagens atrasadas.
**Diagnóstico:**
```sql
SELECT status, error_message, COUNT(*) FROM public.webhook_audit_log
WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY 1,2 ORDER BY 3 DESC;
SELECT instance_id, event_type, MAX(event_count) AS peak_per_minute
FROM zapp.webhook_rate_limits WHERE window_start > NOW() - INTERVAL '6 hours'
GROUP BY 1,2 ORDER BY peak_per_minute DESC;
```
**Fix (hotfix sem deploy):** multiplicador 10x na função `zapp.increment_webhook_rate_limit`
(SECURITY DEFINER, `RETURNS TABLE` — NUNCA OUT params; wrapper `public.*` dropado junto).
Referência completa: skill `supabase-webhook-rate-limit`.
**Critério de saída:** rejeições `rate_limit_exceeded` = 0 em 5 min.

---

## 4. Escalação e comunicação

| Nível | Quem | Quando |
|---|---|---|
| 1 | Operador/agente de plantão | detecção → mitigação básica |
| 2 | Maestro (deploys/mutações) | qualquer mutação destrutiva, rollback, deploy |
| 3 | Dono do serviço (Joaquim) | P1 confirmado, incerteza de causa raiz, > 60min sem mitigação |

**Canais:** warroom n8n (`warroom_alerts`) para status · Sentry para erros · chat do projeto para coordenação.
**Regra:** em P1, comunicar mitigação ANTES de executar (evita dois operadores mexendo no mesmo stack).

---

## 5. Templates

### 5.1 Abertura de incidente

```markdown
## INCIDENTE #EVO-YYYYMMDD-NN  (SEV: P1|P2|P3)
- **Detectado em:** <timestamp> · **Detectado por:** guardrail|sentry|n8n|monitor|humano
- **Sintoma:** <o que está errado, evidência crua — log/query>
- **Componente:** evolution | consumer | supabase | realtime | backup | infra | segurança
- **Impacto:** <quem é afetado, volume aproximado>
- **Timeline:**
  - <HH:MM> detecção: <evidência>
  - <HH:MM> triage: <diagnóstico>
  - <HH:MM> mitigação: <ação + verificação>
  - <HH:MM> validação: <critério de saída atingido>
- **Resolvido em:** <timestamp> · **Duração:** <min>
```

### 5.2 Post-mortem (≤ 5 dias úteis)

```markdown
## POST-MORTEM #EVO-YYYYMMDD-NN
- **Resumo:** <1 parágrafo>
- **Causa raiz:** <com evidência — source/log/query; 5 whys se preciso>
- **Gatilho / por que não foi detectado antes:** <gap de monitoramento>
- **Impacto real:** <duração, mensagens atrasadas/perdidas, usuários afetados>
- **Ações:**
  | # | Ação | Tipo (fix/prevenção/detecção) | Dono | Prazo |
  |---|---|---|---|---|
  | 1 | ... | ... | ... | ... |
- **Lições:** <3 máximas> · **Anexos:** <logs, queries, diffs>
```

---

## 6. Incidentes conhecidos (histórico — base de lições)

| Data | Sev | Incidente | Causa raiz | Fix |
|---|---|---|---|---|
| 2026-08-06 | P1 | CORS outage | lista restrita derrubou consumidores sem Origin (500) | rollback p/ `*` + patch 1 linha pendente (etapa D) |
| 2026-08-08 | P2 | Purge v9 100% quebrado (silencioso) | `DELETE ... LIMIT` inválido + coluna `resolved` inexistente + sem `set -e` | purge v10 com batch keyset + `set -eu` + validação de logs |
| 2026-08-08 | P2 | WAL lag 1006MB | consumo do realtime | 2G RAM + keepalive stack 231 + guardrail teto 2000MB |
| 2026-08-08 | P3 | Collector-401 `invalid date` (BusyBox) | `-d '5 minutes ago'` inválido | v3 epoch-safe |
| 2026-08-08 | P3 | Falsos positivos guardrail v3 (JWT-01, BACKUP-01, WAL-01) | rest sem env, sentinel 100MB, slot hardcoded | v4 parametrizado (env) |
