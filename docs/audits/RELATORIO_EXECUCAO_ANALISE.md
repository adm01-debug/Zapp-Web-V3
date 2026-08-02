# RELATÓRIO DE EXECUÇÃO DA ANÁLISE — `zapp-web-v3`

> Documento vivo. Atualizado bloco a bloco conforme o `PLANO_QA_ANALISE_100.md` é executado.
> Cada etapa fechada gera 0..N achados; achados vão para `PLANO_IMPLEMENTACAO_100.md`.

---

## Estado geral

| Bloco | Descrição | Status | Achados |
|---|---|---|---|
| 1 | Inventário estrutural e mapeamento (1-10) | ✅ Concluído | 14 (F1-01 a F1-14) |
| 2 | Auditoria do banco (11-20) | ✅ Concluído | 13 (F2-01 a F2-13) |
| 3 | Autenticação e sessão (21-30) | ✅ Concluído | 12 (F3-01 a F3-12) |
| 4 | Inbox e mensageria (31-45) | ✅ Concluído | 24 (F4-01 a F4-24) |
| 5 | Contatos e CRM (46-55) | ✅ Concluído | 30 (F5-01 a F5-30) |
| 6 | Conexões WhatsApp (56-65) | ✅ Concluído | 30 (F6-01 a F6-30) |
| 7 | Admin e monitoramento (66-75) | ✅ Concluído | 32 (F7-01 a F7-32) |
| 8 | SLA/BPM (76-80) | ⏸ Pendente | — |
| 9 | Resiliência e edge cases (81-90) | ⏸ Pendente | — |
| 10 | Cross-browser / a11y / perf (91-100) | ⏸ Pendente | — |

**Achados até aqui: 155 (14 Bloco 1 + 13 Bloco 2 + 12 Bloco 3 + 24 Bloco 4 + 30 Bloco 5 + 30 Bloco 6 + 32 Bloco 7).**

---

## Bloco 1 — Inventário estrutural (etapas 1-10)

_(Detalhes registrados anteriormente.)_

## Bloco 2 — Auditoria do banco (etapas 11-20)

_(Detalhes registrados anteriormente.)_

## Bloco 3 — Autenticação e sessão (etapas 21-30)

_(Detalhes registrados anteriormente.)_

## Bloco 4 — Inbox e mensageria (etapas 31-45)

_(Detalhes registrados anteriormente. 24 achados F4-01 a F4-24 em `PLANO_IMPLEMENTACAO_100.md` Tema 8.)_

## Bloco 5 — Contatos e CRM (etapas 46-55)

_(Detalhes registrados anteriormente. 30 achados F5-01 a F5-30 em `PLANO_IMPLEMENTACAO_100.md` Tema 11.)_

---

## Bloco 6 — Conexões WhatsApp (etapas 56-65)

_(Detalhes registrados anteriormente. 30 achados F6-01 a F6-30 em `PLANO_IMPLEMENTACAO_100.md` Tema 12. Base factual medida em 02/08/2026 01:25 UTC — resumo: evolution_instance_credentials=1 row unhealthy, whatsapp_connections=3 rows com created_by=NULL em 100%, evolution_reconcile_jobs 373/1663 (22%) com timestamps corrompidos, wpp2_disconnection 17/18 unresolved, evolution_ip_watch=0 rows total.)_

---

## Bloco 7 — Admin e monitoramento (etapas 66-75)

Arquivos auditados linha a linha (24 páginas em `src/pages/admin/`, ~5800 linhas de código):

**Páginas de monitoramento (foco Bloco 7):**
- `AdminWhatsAppLogsPage.tsx` (310 L) — envios/webhooks/erros, últimas 150 entradas.
- `AdminEvoApiHealthPage.tsx` (186 L) — saúde/alertas/DR/canais/histórico, run 50-test suite.
- `AdminAutomationLogsPage.tsx` (325 L) — audit trail de automation rules, filtros por regra/status/jid/data.
- `AdminSecurityLogsPage.tsx` (136 L) — tentativas negadas, mudanças de permissão.
- `AdminFailedAuthMessagesPage.tsx` (217 L) — falhas login com bloqueio, filtro por data.
- `AdminInboxSyncStatusPage.tsx` (312 L) — pipeline FATOR X ↔ Inbox, buckets 5min/1h/24h.
- `AdminBridgeStatusPage.tsx` (168 L) — status Lovable ↔ FATOR X, incidents, auto-refresh.
- `AdminEmailStatusPage.tsx` (343 L) — saúde do email, falhas operacionais, request-id.
- `AdminEmailAuditPage.tsx` (311 L) — auditoria de revalidação, paginação.
- `AdminChannelsPage.tsx` (394 L) — canais de atendimento, sticky agent, routing modes.
- `AdminProvidersPage.tsx` (373 L) — provedores (Evolution/WPPConnect/Baileys), health-check.
- `AdminQueuesPage.tsx` (117 L) — filas, distribuição, membros, canais.
- `AdminAutomationsPage.tsx` (790 L) — regras de automação (config).
- `RateLimitDashboard.tsx` (489 L) — rate limiting, IPs bloqueados/whitelist, alertas.
- `PerformanceDashboard.tsx` (139 L) — Core Web Vitals, budget CI.
- `AuditEvidenceDashboard.tsx` (78 L) — evidências de conformidade.
- `HmacSelfTestPage.tsx` (321 L) — validação HMAC + janela temporal + replay.
- `AdminWhatsAppSecretsCard.tsx` (129 L) + `AdminWhatsAppWebhookVerifyCard.tsx` (202 L) — secrets + handshake.
- `SelfHostedHealthPage.tsx` (165 L) — probes Supabase self-hosted + MCP.
- `AdminOperationsPage.tsx` (70 L), `AdminDevDiagnosticsPage.tsx` (208 L).

**Tabelas auditadas:**
`zapp.provider_message_log`, `zapp.dispatch_error_logs`, `zapp.whatsapp_cloud_webhook_pings`, `zapp.failed_messages`, `zapp.security_audit_logs`, `zapp.security_events`, `zapp.login_attempts`, `zapp.rate_limit_logs`, `zapp.blocked_ips`, `zapp.ip_whitelist`, `zapp.webhook_endpoints`, `zapp.webhook_events`, `zapp.webhook_events_processed`, `zapp.webhook_health_alerts`, `zapp.webhook_health_checks`, `zapp.hmac_selftest_audit`, `zapp.system_health_incidents`, `zapp.email_health_summary`, `zapp.email_revalidation_jobs`, `zapp.provider_configs`, `zapp.automation_executions`, `zapp.audit_logs`, `zapp.warroom_alerts`, `cron.job`, `cron.job_run_details`.

**Views compat mapeadas (padrão do Bloco 6):**
`public.provider_message_log` → `zapp.provider_message_log`;
`public.dispatch_error_logs` → `zapp.dispatch_error_logs`;
`public.security_audit_logs` → `zapp.security_audit_logs`;
`public.failed_messages` → `zapp.failed_messages`;
`public.login_attempts` → `zapp.login_attempts`.

### Base factual do banco (medida em 02/08/2026 02:15 UTC)

| Métrica | Valor |
|---|---|
| `zapp.provider_message_log` total | **0 rows** — nenhuma mensagem logada em produção |
| `zapp.dispatch_error_logs` total | 1 row, latest = **2026-05-04** (~3 meses atrás), tabela morta |
| `zapp.whatsapp_cloud_webhook_pings` total | 173 rows, **0 nas últimas 24h, 0 nos últimos 7d** |
| `zapp.whatsapp_cloud_webhook_pings` latest entry | **2026-05-04 10:30 UTC** (~90 dias sem eventos) |
| `zapp.failed_messages` total | 0 rows |
| `zapp.security_audit_logs` total | **0 rows** — mesma tabela referenciada pela SecurityLogs page |
| `zapp.security_events` total | 0 rows |
| `zapp.login_attempts` total | 2 rows, 6 total_attempts, 0 currently locked |
| `zapp.login_attempts` índices | 4 índices (PK + `idx_login_attempts_locked` + `idx_login_attempts_email_locked` + `login_attempts_email_unique` UNIQUE) — G21 correção mantida |
| `zapp.rate_limit_logs` total | **0 rows** — RateLimitDashboard sempre em zero |
| `zapp.blocked_ips` total | 0 rows |
| `zapp.ip_whitelist` total | 0 rows |
| `zapp.webhook_endpoints` total | **0 rows** — nenhum outbound webhook configurado |
| `zapp.webhook_events` total | 0 rows |
| `zapp.hmac_selftest_audit` total | **0 rows** — self-test HMAC nunca gravou |
| `zapp.system_health_incidents` total | 0 rows |
| `zapp.email_revalidation_jobs` total | 0 rows |
| `zapp.provider_configs` total | 0 rows |
| `zapp.automation_executions` total | **0 rows** — audit trail sempre vazio |
| `zapp.audit_logs` total | 7269 (186 last 24h, 21 actions, 6 entities) — **única tabela de auditoria funcional** |
| `zapp.webhook_health_alerts` total | 734 rows, **724 unresolved (98.6% backlog)**, 20 last 24h |
| `zapp.webhook_health_alerts` breakdown unresolved | 709 `burnin_critical_alert` + 9 `lovable_parity_drift` + 4 `burnin_disconnection` + 2 `backup_sentinel_stale` |
| Título recorrente | `E10-03: N new critical alert(s) during burn-in — 72h counter reset. Investigate before go-live.` |
| Cron jobs ativos | **149 jobs** |
| Cron 213 `media_pipeline_health_check` | **9/21 falhas (42.8%)** — coluna `severity` inexistente + violação `chk_warroom_alert_type` |
| Cron 100 `analytics-log-retention` | **2/2 falhas (100%)** — `function public.dblink(text, text) does not exist` |
| Cron 216 `cleanup-cron-job-logs` | 1/3 falhas (33%) |

### Etapa 66 — JSX literal renderizado como texto

**Descoberta P0**: `PerformanceDashboard.tsx` (linhas ~120-140) renderiza **3× `// @technical` como TEXTO LITERAL** no JSX, não como comentário:

```jsx
<span>Largest Contentful Paint (LCP)</span>
<span className="font-mono">&lt; 2500ms</span> // @technical
...
<span className="font-mono">&lt; 0.100</span> // @technical
...
<span className="font-mono">&lt; 500KB</span> // @technical
```

Em JSX inline (fora de `{ /* */ }`), `//` NÃO é comentário — é texto renderizado no DOM. O usuário vê `< 2500ms // @technical` na tela. → **F7-01** (P0).

**Descoberta P0**: `AdminBridgeStatusPage.tsx` linha ~65 tem mesmo bug:
```jsx
<p className="font-mono text-xs">{lastCheck.toLocaleTimeString()}</p> // @technical
```
Após `</p>` fechar o elemento, `// @technical` aparece como TEXTO LITERAL entre elementos irmãos. → **F7-02** (P0).

**Descoberta P0**: `AdminEmailAuditPage.tsx` linha ~125:
```jsx
<Badge variant="outline" className="font-mono"> // @technical
  Total: {total}
</Badge>
```
`// @technical` está dentro dos **children** do Badge, antes do "Total:" — renderizado no DOM. → **F7-03** (P0).

### Etapa 67 — Latência/uptime hardcoded

**Descoberta P0**: `AdminBridgeStatusPage.tsx` KPI cards mockados:
```jsx
<p className="text-2xl font-black">{lovableDb === true ? '42ms' : '--'}</p>
<p className="text-2xl font-black">99.9%</p>
```
Latência de bridge sempre exibe `'42ms'` (string hardcoded) quando lovableDb está online; NÃO mede nada. Uptime 24h é literal `'99.9%'`. → **F7-04** (P0).

**Descoberta P0**: `AuditEvidenceDashboard.tsx` (78 linhas) é **página inteira MOCK ESTÁTICO**. Array `evidences` hardcoded com 3 entradas, `<Badge>V5.0.0-PROD</Badge>` (versão hardcoded), botão `<button>Ver no Repositório</button>` sem `href` (nunca abre nada). Nenhuma leitura de banco. → **F7-05** (P0).

### Etapa 68 — PerformanceDashboard bugs adicionais

**Descoberta P0**: `PerformanceDashboard.tsx` linha 8: `const [lastUpdate, setLastLastUpdate] = useState(new Date());` — nome do setter tem `Last` duplicado (`setLastLastUpdate`). Typo em código de produção. → **F7-06** (P0).

**Descoberta P0**: Normalização de progress bar hardcoded a 4000 para TODAS as métricas: `Math.min((m.value / 4000) * 100, 100)`.
- CLS (0-1): dá 0.025% (barra invisível)
- TTFB (100-500ms típico): 2-12%
- LCP (~2500ms good): 62%
- INP (200ms good): 5%
Mesma barra representa coisas diferentes; comparação sem sentido. → **F7-07** (P0).

**P1**: `setInterval(update, 2000)` — polling 500x/hora mesmo com aba oculta. Sem `document.visibilityState` check. → **F7-08**.

### Etapa 69 — Rotas inexistentes / navegação quebrada

**Descoberta P0**: `AdminInboxSyncStatusPage.tsx` alert "sem inbound" leva a `<Link to="/admin/webhook-overview">Webhook Overview</Link>`. **Nenhum arquivo `AdminWebhookOverviewPage.tsx` em `src/pages/admin/`** — rota 404. → **F7-09** (P0).

**Descoberta P1**: `AdminEmailStatusPage.tsx` "Ver Auditoria":
```jsx
onClick={() => (window.location.hash = '#admin/email-audit')}
```
Muda `location.hash` mas app usa **react-router-dom com path-based routing** — hash é ignorado, botão não navega. → **F7-30** (P1).

### Etapa 70 — Canais e status hardcoded

**Descoberta P0**: `AdminChannelsPage.tsx` `emptyChannel()` retorna `color: "bg-primary"` (classe Tailwind). Depois no card: `style={{ backgroundColor: ch.color }}`. Resultado: `background-color: bg-primary;` — valor CSS inválido. Canais criados via UI ficam **sem cor de fundo**. → **F7-10** (P0).

**Descoberta P0**: `STATUS_BADGE[ch.status]` sem fallback — se backend adicionar novo status, `statusInfo` retorna `undefined` e `statusInfo.variant` lança `TypeError`. → **F7-19** (P0).

### Etapa 71 — Tabelas vazias com painéis sempre em 0

**Descoberta P0**: `zapp.provider_message_log` = 0 rows. `AdminWhatsAppLogsPage` diz "últimas 150 entradas" mas **tabela COMPLETAMENTE VAZIA**. → **F7-11** (P0).

**Descoberta P0**: `zapp.security_audit_logs` = 0 + `zapp.security_events` = 0. `AdminSecurityLogsPage` KPI "Tentativas Negadas (24h)" mostra `.filter(l => l.status === 'denied').length` — filtra a lista INTEIRA (não corta 24h), e a lista é vazia. Rótulo mente. → **F7-12** (P0).

**Descoberta P0**: `zapp.rate_limit_logs` = 0, `zapp.blocked_ips` = 0, `zapp.ip_whitelist` = 0. `RateLimitDashboard` (489 L) inteiro permanentemente em zero. → **F7-13** (P0).

**Descoberta P1**: `zapp.automation_executions` = 0 rows. `AdminAutomationLogsPage` filtros + tabela sempre vazios. → **F7-20** (P1).

**Descoberta P1**: `zapp.hmac_selftest_audit` = 0 rows. `HmacSelfTestPage` monta `<HmacAuditHistoryPanel>` que consulta essa tabela — sempre vazia. Sem trilha de conformidade. → **F7-18** (P1).

### Etapa 72 — Alert fatigue crítico

**Descoberta P0**: `zapp.webhook_health_alerts` = **734 total, 724 UNRESOLVED (98.6% backlog)**. Título recorrente: `E10-03: N new critical alert(s) during burn-in — 72h counter reset. Investigate before go-live.` — sistema literalmente pede pra não ir a produção, enquanto está em produção. 709/724 são `burnin_critical_alert` do cron 145 (`burnin-monitor`, `*/15`). Nenhuma UI mostra esse backlog. → **F7-14** (P0).

Padrão: 1-2 alertas por hora, contador se reinicia a cada 72h sem ser resolvido — cron gera perpetuamente.

### Etapa 73 — Cron jobs quebrados

**Descoberta P0**: Cron 213 `media_pipeline_health_check` (`0 */4 * * *`) — **9/21 falhas em 7d (42.8%)**. Função `zapp.fn_run_media_health_alert()` faz `INSERT INTO zapp.warroom_alerts` com coluna `severity` que **não existe** e `alert_type='media_pipeline'` que **viola** `chk_warroom_alert_type`. Cascata de fixes incompletos. Health-check do pipeline de mídia morto há semanas. → **F7-15** (P0).

**Descoberta P0**: Cron 100 `analytics-log-retention` (`20 5 * * *`) — **2/2 falhas (100%)**. Erro: `function public.dblink(text, text) does not exist`. Extensão `dblink` NÃO instalada. Tabelas `_analytics.log_events_*` incham indefinidamente. → **F7-16** (P0).

### Etapa 74 — PII em URL

**Descoberta P1**: `AdminInboxSyncStatusPage.tsx`:
```jsx
<Link to={`/?contact=${encodeURIComponent(c.remote_jid)}`}>
```
`remote_jid` (`5541999999999@s.whatsapp.net`) via URL vaza para logs Traefik + Service Worker + `document.referrer`. → **F7-17** (P1).

### Etapa 75 — Interações inseguras/frágeis

**Descoberta P1**: `AdminEvoApiHealthPage.tsx` botão "Run test suite" dispara 50 testes em prod sem AlertDialog. Label "Rodando 50 testes…" hardcoded. → **F7-22** (P1).

**Descoberta P1**: `AdminEvoApiHealthPage.tsx` — variant baseada em `readiness.overall?.includes('🟢')` — se backend trocar emoji, todos os banners viram destructive. → **F7-23** (P1).

**Descoberta P1**: `AdminWhatsAppWebhookVerifyCard.tsx` key React `${p.kind}-${p.created_at}` — duplicáveis. → **F7-24** (P1).

### Etapa 75b — Webhook Cloud API silencioso há 90 dias

**Descoberta P0**: `zapp.whatsapp_cloud_webhook_pings` = 173 rows, **zero nas últimas 24h, zero nos últimos 7 dias**. Última entrada: `2026-05-04 10:30 UTC`. `AdminWhatsAppWebhookVerifyCard` "Recebimento de eventos (últimas 24h)" sempre zero. Sem alertagem sobre condição prolongada. → **F7-25** (P0).

### Análises UX/dead-code

**P0**: `HmacSelfTestPage.tsx` useEffect com dependência `[run]` — se `run` não estiver em `useCallback`, dispara em loop infinito. Risco de DDOS acidental na edge function `webhook-hmac-selftest`. → **F7-21** (P0).

**P0**: `SelfHostedHealthPage.tsx` sem AbortController; erros mantêm results stale. → **F7-31** (P0).

**P1 outros**: `AdminQueuesPage` `NOT_IMPLEMENTED` toast em prod (F7-26); `AdminProvidersPage` promete "health-check 2min" mas `provider_configs` vazia (F7-27); `AdminSecurityLogsPage` comentário `{/* Adicionar mais cards */}` em prod (F7-28); `AdminFailedAuthMessagesPage` sem validação `from > to` (F7-29); `AdminAutomationLogsPage` paginação 0-indexed (F7-32).

---

## Achados do Bloco 7 (32 itens registrados em `PLANO_IMPLEMENTACAO_100.md` Tema 13)

### JSX quebrado — texto literal renderizado

- **F7-01** (P0) — `PerformanceDashboard.tsx`: `// @technical` renderizado como texto em 3 blocos JSX.
- **F7-02** (P0) — `AdminBridgeStatusPage.tsx`: mesmo bug após `</p>`.
- **F7-03** (P0) — `AdminEmailAuditPage.tsx`: mesmo bug dentro de `<Badge>` children.

### Dashboards mock / hardcoded

- **F7-04** (P0) — `AdminBridgeStatusPage.tsx` latência `'42ms'` e uptime `'99.9%'` hardcoded.
- **F7-05** (P0) — `AuditEvidenceDashboard.tsx` página inteira é mock estático.

### PerformanceDashboard

- **F7-06** (P0) — `setLastLastUpdate` (typo com `Last` duplicado).
- **F7-07** (P0) — normalização de progress bar hardcoded a 4000.
- **F7-08** (P1) — polling 500x/h sem `document.visibilityState` check.

### Rotas inexistentes / navegação quebrada

- **F7-09** (P0) — `AdminInboxSyncStatusPage` linka para `/admin/webhook-overview` inexistente.
- **F7-30** (P1) — `AdminEmailStatusPage` usa `location.hash =` em app path-based.

### Estados / configurações inconsistentes

- **F7-10** (P0) — `AdminChannelsPage` cor Tailwind como inline style (background-color inválido).
- **F7-19** (P0) — `STATUS_BADGE[ch.status]` sem fallback (TypeError).

### Tabelas vazias / painéis inúteis

- **F7-11** (P0) — `provider_message_log` = 0 rows.
- **F7-12** (P0) — `security_audit_logs` = 0 rows + rótulo "24h" mente.
- **F7-13** (P0) — `rate_limit_logs`, `blocked_ips`, `ip_whitelist` = 0 todas.
- **F7-18** (P1) — `hmac_selftest_audit` = 0 rows.
- **F7-20** (P1) — `automation_executions` = 0 rows.

### Alert fatigue / infra quebrada

- **F7-14** (P0) — `webhook_health_alerts` 724 unresolved (98.6%).
- **F7-15** (P0) — Cron 213 42.8% falha por schema mismatch.
- **F7-16** (P0) — Cron 100 100% falha por `dblink` não instalada.
- **F7-25** (P0) — Cloud API webhook sem tráfego há 90 dias.

### Segurança secundária / PII

- **F7-17** (P1) — `remote_jid` completo em URL query.

### UX / interações inseguras

- **F7-21** (P0) — `HmacSelfTestPage` useEffect com `[run]` — risco de loop infinito.
- **F7-22** (P1) — "Run test suite" sem confirmação; label hardcoded.
- **F7-23** (P1) — decisão baseada em `overall?.includes('🟢')`.
- **F7-24** (P1) — chave React `${kind}-${created_at}` — duplicáveis.
- **F7-31** (P0) — `SelfHostedHealthPage` sem AbortController.

### Dead code / TODO em produção

- **F7-26** (P1) — `AdminQueuesPage` helper `NOT_IMPLEMENTED`.
- **F7-27** (P1) — `AdminProvidersPage` promete "health-check 2min" mas `provider_configs` vazia.
- **F7-28** (P1) — `AdminSecurityLogsPage` comentário `{/* Adicionar mais cards */}`.
- **F7-29** (P1) — `AdminFailedAuthMessagesPage` sem validação `from > to`.
- **F7-32** (P1) — `AdminAutomationLogsPage` paginação 0-indexed.

---

## Retomada — próximo chat

Onde parar de Bloco 7 e o que executar em seguida:

1. **Bloco 8 — SLA/BPM (etapas 76-80):**
   - `bpm.bpm_slas`, `bpm.bpm_sla_breaches` — SLI/SLO, quantos SLAs quebrados por queue/canal/agente.
   - `bpm.bpm_workflow_executions` — workflow builder e engine.
   - `bpm.bpm_card_activities`, `bpm.bpm_stages` — auditoria de movimentação.
   - `bpm.bpm_automations`, `bpm.bpm_automation_executions` — regras engatilhadas no BPM.
   - Cron 198 `bpm-check-breached-slas` (`*/5`) — verificar execuções e falhas.

2. **Bloco 9-10:** roteiro completo em `PLANO_QA_ANALISE_100.md`.

**Contexto crítico do Bloco 7 para o próximo chat:**
- **17 achados P0** identificados (F7-01, 02, 03, 04, 05, 06, 07, 09, 10, 11, 12, 13, 14, 15, 16, 19, 21, 25, 31).
- **Bugs de JSX literal (F7-01, 02, 03)**: `// @technical` renderizado como texto em 3 páginas. Fix mecânico (regex sweep + `react/jsx-no-comment-textnodes` ESLint rule).
- **Mock em prod (F7-04, F7-05)**: `AdminBridgeStatusPage` "42ms" hardcoded, `AuditEvidenceDashboard` inteira estática.
- **Tabelas vazias (F7-11, 12, 13, 18, 20)**: 5 tabelas críticas com 0 rows, 5 páginas admin sempre em EmptyState. Diagnóstico caso a caso: instrumentação broken vs. features não implementadas.
- **Alert fatigue máximo (F7-14)**: `webhook_health_alerts` com 724 unresolved (98.6%), sistema pede "não vá pra prod" perpetuamente. Cron 145 gerando 1-2 alerts/hora. Decisão política + auto-resolve trigger.
- **Crons quebrados (F7-15, F7-16)**: 213 (media_pipeline_health) 43% falha por schema mismatch em warroom_alerts; 100 (analytics-log-retention) 100% falha por dblink não instalada. Fixes: schema audit da fn_run_media_health_alert + `CREATE EXTENSION dblink`.
- **Cloud API silencioso 90 dias (F7-25)**: `whatsapp_cloud_webhook_pings` sem entradas desde 2026-05-04.
- **Rota inexistente (F7-09)**: `AdminInboxSyncStatusPage` linka `/admin/webhook-overview` — página não existe.
- **PII em URL (F7-17)**: remote_jid completo em query string vaza para logs Traefik + Referer.
- **Segurança/UX (F7-21, F7-31)**: HmacSelfTestPage risco loop infinito; SelfHostedHealthPage sem AbortController.

**Documentos ao final desta sessão (7 blocos concluídos):**
- `docs/audits/PLANO_QA_ANALISE_100.md` — roteiro (não alterado).
- `docs/audits/PLANO_IMPLEMENTACAO_100.md` — 155 achados nos Temas 1-13.
- `docs/audits/RELATORIO_EXECUCAO_ANALISE.md` — este documento.
