> **Nota histórica**: Este documento refere-se ao banco 'FATOR X' (projeto Supabase `tdprnylgyrogbbhgdoik`), descomissionado em 2026-07-15. O termo foi mantido para rastreabilidade histórica.

# PLANO EXAUSTIVO DE ANÁLISE, TESTES E SIMULAÇÃO — 100 ETAPAS

> **Escopo:** zapp-web-v3 (WhatsApp/omnichannel CRM) + Supabase self-hosted (`supabase.atomicabr.com.br`, schema canônico `zapp`) + Evolution API (evolution-mcp.adm01.workers.dev) + Lovable project 22c0b518-7895-4f4f-9ea0-978457a2c37a.
>
> **Base factual do levantamento (01/08/2026):**
> - Banco 1,6 GB, PostgreSQL 15.8, cache hit 99,84%, 29 conexões (5 ativas).
> - Schema `zapp`: 321 tabelas / 407 views / 993 funções (**691 SECURITY DEFINER**).
> - Schema `evo`: 190 tabelas / 68 funções.
> - Schema `public`: 1 tabela + **539 views** (compat layer).
> - RLS: 100% habilitado nas 682 tabelas dos schemas de aplicação. Zero advisor de severidade `error`.
> - **935 advisors `warn`** (429 em `zapp` + 506 em outros) — quase todos são funções SECURITY DEFINER chamáveis por `authenticated` (bypass RLS) + views sem `security_invoker=on`.
> - **149 cron jobs ativos**, alguns duplicados (`evo_cleanup_expired_contact_ids` e `cleanup_expired_contact_ids`).
> - Top slow query: 52,75% do tempo é WAL replication (esperado); em seguida **3 queries `pgrst_source` em `zapp.messages` com média 13-14 s cada** — full scan via PostgREST sem filtro seletivo.
> - Pipeline evolução: **0 webhooks processados na última hora** e 19 mensagens `received` nas últimas 24 h — sinal amarelo.
> - Front: React 18.3.1 + Vite 6.4.3 + Vitest 4.1.10 + TS 5.9.3 + Sentry 10.68.0 + supabase-js 2.110.0 + Zod 4 (breaking) + react-router-dom 7.
> - `package.json`: `lint` roda com `|| true` e `--max-warnings 999` → **mascara falhas de ESLint e do design-system checker**.
> - Raiz do repo poluída: `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`, `__pycache__/`, `ci_cost_analysis.py`, `gen_insert.cjs`, `lgpd_deploy.sql`, 8 relatórios `.md`, `playwright.e2e.config.fixed.ts` (duplicata).
> - `supabase/`: convivem `functions/`, `functions-legacy/`, `migrations/`, `migrations-from-lovable/`, `migrations-snapshot/`, `fatorx-migrations/` (**projeto errado!**), `manual-rollbacks/`.
> - 5 pastas de teste diferentes: `src/__tests__/`, `src/test/`, `src/tests/`, `src/features/*/__tests__/`, `e2e/`, `tests/`.

---

## Bloco 1 — Inventário estrutural e mapeamento (1-10)

1. **Contar arquivos por extensão** em `src/` (`.tsx`, `.ts`, `.css`) e comparar com `bun.lock` de dependências para detectar imports órfãos.
2. **Mapear todas as rotas React Router** (`src/pages/lazyViews.ts` + `App.tsx` + `ViewRouter.tsx`) e cruzar com componentes `AdminXPage.tsx` para achar pages sem rota e rotas sem page.
3. **Extrair menu de navegação completo** (sidebar + top bar + admin submenu) e mapear cada item para o handler React responsável, catalogando permissões requeridas.
4. **Inventariar componentes de UI**: separar Radix primitives, wrappers `shadcn`, e componentes de domínio; anotar cobertura Storybook por componente.
5. **Mapear todas as pages** (46+ `.tsx` em `src/pages/` + subpastas), gerando tabela `page → rota → feature-slice → hooks usados → services chamados`.
6. **Mapear hooks customizados** de `src/hooks/` e `src/features/*/hooks/`, identificando duplicatas semânticas.
7. **Mapear services** em `src/services/` e `src/features/*/services/`, catalogando cada chamada a Supabase RPC (`fn_send_message`, `rpc_get_contact`, etc.).
8. **Mapear contexts/providers**: `AuthProvider`, `ThemeProvider`, `QueryClientProvider`, tenant/workspace context, feature flags.
9. **Verificar tsconfig paths e barrel exports** (`bun run check:barrels`) — encontrar barrels quebrados e ciclos de import.
10. **Executar `bun run check:deadcode`** e cruzar com git blame — cada arquivo dead-code é candidato a exclusão com justificativa.

## Bloco 2 — Auditoria do banco (11-20)

11. **Confirmar zero tabela sem RLS** (já validado: 682/682 com RLS). Registrar snapshot em `docs/audits/rls-snapshot-YYYYMMDD.md`.
12. **Auditar as 429 funções SECURITY DEFINER `zapp.*`** com `authenticated` no EXECUTE — listar em `docs/audits/secdef-zapp.csv`, marcando cada uma como (a) segura por design, (b) precisa `SET search_path`, (c) revogar acesso.
13. **Auditar as 506 SECDEF dos outros schemas** (`evo`, `ops`, `bpm`, `ai`, `email_app`, `vendas`, `financeiro`, `artes`, `logistica`, `public`).
14. **Auditar 30+ views sem `security_invoker=on`** — cada uma vaza privilégios do dono; marcar tratamento (alterar view ou dropar).
15. **Auditar as 149 cron jobs** (`cron.job`): tabela `jobname → schedule → owner → depende de → SLO`; identificar overlaps de horário e duplicatas.
16. **Cron failures rolling 7d**: `SELECT jobname, count(*) FROM cron.job_run_details WHERE status='failed' AND start_time > NOW()-INTERVAL '7 days' GROUP BY 1 ORDER BY 2 DESC` — zero nas últimas 24 h, precisa expandir janela.
17. **EXPLAIN ANALYZE das 15 queries mais lentas** de `pg_stat_statements` — foco especial nas 3 top queries `pgrst_source` em `zapp.messages`.
18. **Índices ausentes em FKs** de `zapp` e `evo` via `hypopg + index_advisor` (extensões já instaladas).
19. **Índices duplicados/não usados** via `pg_stat_user_indexes` — os índices particionados em `pidx_msgs_starred`, `idx_messages_reply_to_id` (23 partições cada) precisam validação de uso.
20. **Auditoria de partições**: `zapp.messages` e `evo.evolution_messages` têm 23 partições — verificar se `auto-create-monthly-partitions` (cron 64) está gerando corretamente 2026-08+.

## Bloco 3 — Autenticação e sessão (21-30)

21. **Login email+senha (happy path)** — validar contra `AuthProvider.tsx`, `AuthContext.ts`, `cookieStorage.ts` (histórico de bug: silenciamento de chaves `auth`/`token`).
22. **Magic Link** — validar redirect após clique, invalidar link após uso.
23. **SSO** (`SSOCallback.tsx`) — testar 3 provedores (se configurados) + fallback quando IdP retorna erro.
24. **2FA/TOTP enrollment** (`TwoFactorAuth.tsx`) — QR code + código de recuperação.
25. **2FA login** — verificar tolerância de skew, replay attack (código usado 2x deve falhar).
26. **Reset password** (`ForgotPassword.tsx` → `ResetPassword.tsx`) — token único, expiração 1 h.
27. **Verify email** (`VerifyEmail.tsx`) — testar reenvio, expiração, e-mail já verificado.
28. **Session refresh** — rotação de token, sincronização entre tabs (BroadcastChannel).
29. **Multi-device logout** — logout em uma sessão deve invalidar refresh em todas (`auth.sessions` do Supabase).
30. **Lockout após brute force** — validar constraint UNIQUE em `login_attempts.email` + escalação de lockout (histórico de bug).

## Bloco 4 — Inbox e mensageria (31-45)

31. **Abrir conversa** (`ChatPanel.tsx`) — sequência descrita em `FLUXO_CLIQUE_CHATPANEL.md`, validar cada passo.
32. **Enviar mensagem de texto** — otimistic UI, ACK do Evolution, atualização de `status` em `zapp.messages`.
33. **Enviar mídia** (imagem, vídeo, áudio, documento, sticker) — upload → R2 → Evolution → ACK.
34. **Recepção via webhook** — `evo.evolution_webhook_events_v2_2026_07` → `zapp.messages` (validar `link-orphan-messages` cron 76).
35. **Reactions em real-time** — canal Supabase Realtime, testar dois clientes simultâneos.
36. **Editar mensagem** — validar propagação para outros clientes e para o WhatsApp.
37. **Deletar mensagem** (soft delete) — `deleted_at` set, UI oculta, real-time propaga.
38. **Reply/quote** — link `reply_to_id` (index `idx_messages_reply_to_id` particionado).
39. **Forward** — múltiplos destinatários, race condition ao encaminhar 50+.
40. **Stickers/emojis** — cron `refresh-top-stickers` (11) e `audio_meme_favorites` view.
41. **Typing indicator** — debounce, TTL, propagação real-time.
42. **Read receipts** — atualização de `read_at`, batch update quando marca 100+ como lidas.
43. **Notificações in-app** — `zapp.app_notifications` (12.5k linhas atuais), cron `cleanup-old-notifications` (71), `purge-app-notifications-90d` (212).
44. **Search em conversas** — full-text search em `zapp.messages`, testar acentuação (`unaccent`).
45. **Filtros de inbox** — unread / starred (`pidx_msgs_starred`) / tagged / assigned to me.

## Bloco 5 — Contatos e CRM (46-55)

46. **Criar contato** — validação CPF/CNPJ, número WhatsApp normalizado.
47. **Editar contato** — trigger de audit em `zapp.audit_logs`.
48. **Merge de duplicatas** (`bulk_auto_merge_duplicates`) — regra de precedência, LGPD (mesclar sem perder consentimento).
49. **Bulk soft-delete** (`bulk_soft_delete_contacts`) — LGPD, undo em 30 dias.
50. **Bulk tag** (`bulk_add_tag`) — 1000 contatos por lote.
51. **Contact intelligence** — `zapp.contact_intelligence` (20k linhas), health score, cron `refresh-health-score-cache` (148).
52. **Notes** (`add_contact_note`) — versionamento, autor.
53. **Timeline** — merge de eventos de mensagem + call + note em ordem cronológica.
54. **Empresa vinculada** — `zapp.empresas` (51k linhas), validar FK cascade em delete.
55. **Contact search** — `pg_trgm` (extensão instalada), fuzzy, teste com nomes duplicados.

## Bloco 6 — Conexões WhatsApp (56-65)

56. **Criar instância Evolution** — POST `/instance/create`, gravar `evo.evolution_instance_credentials`.
57. **QR code** — expira em 60 s, retry limitado (cron `qr-attempts-expire-15min` 101).
58. **Pairing code** — 8 dígitos, alternativa a QR.
59. **Reconexão automática** — cron `whatsapp_reconcile_dispatch` (27) + `whatsapp_reconcile_apply` (30) + `whatsapp_reconcile_reaper` (68).
60. **Disconnection alerts** — cron `wpp2_disconnection_watchdog` (104), `whatsapp_connection_drift_alert` (32).
61. **Multi-instância** — mesma conta Supabase, N instâncias Evolution.
62. **Logout** (`evo_instance_logout`) — preserva credenciais, permite reconectar.
63. **Delete de instância** (`evo_instance_delete`) — cascade em contatos importados, purge R2.
64. **Instance drift detection** (`sync-instance-registry-status` cron 96) — instância existe em `evo.evolution_instance_credentials` mas não no servidor.
65. **401 burst** (`evo-detect-401-bursts` cron 173, `evo-401-glitchtip-feed` 161) — 5+ 401 em 5 min = alerta.

## Bloco 7 — Admin e monitoramento (66-75)

66. **Admin webhook overview** (`AdminWebhookOverviewPage.tsx`) — cards com total, pending, failed, processed em janelas de 1 h / 24 h / 7 d.
67. **Admin webhook events** (`AdminWebhookEventsPage.tsx`) — busca por `remoteJid`, filtro por tipo, paginação virtual (171k eventos).
68. **Admin webhook secret status** (`AdminWebhookSecretStatusPage.tsx`) — validar assinatura HMAC, secret rotation.
69. **Admin failed messages** (`AdminFailedMessagesPage.tsx`) — retry individual, retry em lote, root cause tag.
70. **Admin alert history** (`AdminAlertHistoryPage.tsx`) — filtro por severidade, canal (Slack/e-mail/PagerDuty).
71. **Admin dispatch errors** (`AdminDispatchErrorsHistoryPage.tsx`) — cross-ref com `evo.evolution_alerts`.
72. **Admin Evolution API logs** (`AdminEvolutionApiLogsPage.tsx`) — filtro por status HTTP (foco 401/429/500).
73. **Admin realtime monitor** (`AdminRealtimeMonitorPage.tsx`) — canais ativos, mensagens/s, lag do WAL sender.
74. **Admin telemetria** (`AdminTelemetriaPage.tsx`) — SLI/SLO, error budget.
75. **Admin search insights** (`AdminSearchInsightsPage.tsx`) — termos mais buscados, zero-result queries.

## Bloco 8 — SLA/BPM (76-80)

76. **SLA dashboard** (`SLADashboard.tsx`) — cumprimento por fila, por operador.
77. **SLA history** (`SLAHistory.tsx`) — timeline de breach, análise root cause.
78. **SLA alert preferences** (`SLAAlertPreferences.tsx`) — canal, threshold, silence hours.
79. **BPM workflow trigger** — cron `bpm-check-breached-slas` (198).
80. **SLA breach notification** — verificar entrega em cada canal via `verify-alert-delivery-10min` (205).

## Bloco 9 — Resiliência e edge cases (81-90)

81. **Rede offline durante envio** — Service Worker enfileira, sincroniza ao voltar (`useOnlineStatus`).
82. **Rede intermitente** — perda de 30% de pacotes, retry exponencial no supabase-js.
83. **Supabase down + reconexão** — banner de status, jitter no reconnect, filas locais.
84. **Evolution API 401 sustentado** — `evo-detect-401-bursts` (173), instância marcada `disconnected`, alerta.
85. **Fila cheia (DLQ)** — cron `route-failed-webhooks-to-dlq` (87), `dlq-poison-guard` (146), `monitor-dlq-health` (91).
86. **Deadman switch** — `guardian-heartbeat-sync` (131), `guardian-db-heartbeat-resilient` (193), `check-guardian-alive` (188).
87. **Race condition em envio simultâneo** — mesmo `contact_id`, 2 abas, 2 clicks — validar `uq_msg_msgid_instance`.
88. **Idempotência** — reenvio do mesmo `messageId` do WhatsApp — validar `webhook_events_processed` (171k linhas).
89. **Timeout > 30 s** — `statement_timeout` no PostgREST role, cancelamento gracioso no cliente.
90. **Circuit breaker** — edge function que chama Evolution API deve abrir circuito após 5 falhas em 10 s.

## Bloco 10 — Cross-browser, mobile, a11y, performance (91-100)

91. **Chrome desktop** (latest) + **Chrome Android** (>= 12).
92. **Safari desktop** (latest) + **iOS Safari** 17+.
93. **Firefox desktop** (latest ESR).
94. **Edge desktop** (Chromium latest).
95. **PWA install + offline** — `vite-plugin-pwa`, service worker Cache-First (histórico de rewrite).
96. **Keyboard-only** — `Tab`, `Shift+Tab`, `Enter`, `Esc`; hotkeys de `react-hotkeys-hook` documentados.
97. **Screen reader** — VoiceOver (macOS/iOS) + NVDA (Windows); Playwright a11y config (`playwright.a11y.config.ts`) rodando `@axe-core/playwright` já existe.
98. **Contraste WCAG AA** — Storybook `@storybook/addon-a11y` já habilitado; ratchet no CI.
99. **Print stylesheet** — impressão de transcript de conversa, redação de PII.
100. **Bundle + Lighthouse** — `rollup-plugin-visualizer` já configurado; ratchet `perf:budget` no CI, budget por bundle.

---

## Como executar o plano

- **Ordem**: blocos 1-2 antes de qualquer outro (levantamento estrutural + banco). Blocos 3-8 podem paralelizar por time. Blocos 9-10 no fim, gate de release.
- **Rastreabilidade**: cada etapa gera um issue no GitHub com label `qa-100`, milestone `Excelência 10/10`.
- **Automação**: converter cada etapa em teste Vitest / Playwright / SQL check quando aplicável; catalogar em `tests/qa-100/`.
- **Definição de pronto**: etapa fechada só quando (a) evidência anexada (screenshot, log, query, teste verde), (b) revisor humano validou, (c) run em CI passa sem `|| true`.

## Referências cruzadas

- Documentos existentes que este plano substitui/consolida: `audit-summary.md`, `RLS_AUDIT_REPORT.md`, `VALIDATION_REPORT_PHD.md`, `REGRESSION_SIMULATION_REPORT.md`, `evolution-api-audit-report.md`, `auditoria_tabelas_zapp.md`, `auditoria-edge-functions.md`, `health-check-banco-2026-07-30.md`, `zero-success-rate-workflows.md`, `data-loss-simulation-report.md`, `QUALITY_METRICS_REPORT.md`, `PLANO_CORRECOES_CI_CD.md`, `CI_COST_ANALYSIS_REPORT.md`, `FLUXO_CLIQUE_CHATPANEL.md`.
- **Ver plano de implementação**: `docs/audits/PLANO_IMPLEMENTACAO_100.md`.
