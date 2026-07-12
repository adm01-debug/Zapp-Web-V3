# Auditoria Exaustiva ZAPP-WEB v3 — 2026-07-12

**Método:** frota de 20 agentes especializados (14 áreas concluídas antes do limite de sessão) + verificação manual contra o código atual + baterias `tsc`/`vite build`/`vitest`. Consolidado com os relatórios in-repo `QA_REPORT_2026-07-11.md` e `docs/AUDITORIA_BACKEND_SENIOR_2026-07-11.md`.

**Escopo:** todo o `src/` (React/TS/Vite), 210 edge functions Deno, ~701 migrations, CI/infra, design system, tipos.

---

## 0. Descoberta crítica desta sessão — o build estava quebrado e mascarado

A auditoria começou por um paradoxo: o CI reportava **"0 erros de tipo"**, mas dois agentes independentes acusavam `safeClient.ts` truncado. Investigação forense:

1. **`src/integrations/supabase/safeClient.ts` truncado** no commit `23a5508`: o `export const safeClient` (320 linhas) foi apagado por um refactor incompleto, restando um stub de 21 linhas. **76 arquivos** importam `{ safeClient }` → app quebrado em runtime/build.
2. **O typecheck estava cego:** `tsc` só emitia `TS2688 (vitest/globals ausente)` — um erro de configuração que **abortava a checagem e escondia 280 erros reais**. Foi exatamente por isso que a truncagem passou pelo CI sem ser notada.

### ✅ Corrigido e verificado nesta sessão (PR #292)

| # | Correção | Verificação |
|---|---|---|
| 1 | Restaurado `safeClient.ts` do último estado íntegro (com typing `FailureRecord`) | 76 importadores voltam a resolver |
| 2 | Tipagem do wrapper corrigida na raiz: callback `from()/single()` → `QueryCallbackResult` (interface comum a Query/FilterBuilder) elimina **101 TS2739**; param `query: any` (o wrapper aceita qualquer tabela) elimina **115 erros `never`**; defaults `T = any` (baseline); casts `supabase.rpc` via `unknown` | **`tsc`: 280 → 0 erros** |
| 3 | `EasterEggsProvider.children` opcional (uso standalone); removido `celebrating` morto | lint limpo |
| 4 | **Segurança:** removido Bearer token estático de `.mcp.json` → `${SELFHOSTED_SUPABASE_MCP_TOKEN}` + documentado | JSON válido |
| 5 | **Boot:** watchdog de `index.html` agora limita a 2 reloads/sessão (reset ao montar) em vez de loop infinito; elemento `#root-loading-subtitle` passou a existir | build OK |
| 6 | **CSS:** 12 tokens `hsla(var(--x), a)` (sintaxe inválida — glow nunca renderizava) → `hsl(var(--x) / a)` | build OK |

> ⚠️ **Ação de OPS obrigatória:** o token exposto em `.mcp.json` está no histórico do git e **deve ser rotacionado**. Um teste automatizado (`vitest/globals`) ausente mascarou 280 erros — o CI deve **falhar o typecheck se as devDependencies não instalarem** para impedir que esse mascaramento reapareça.

**Baseline pós-sessão:** `tsc` 0 erros · `vite build` OK (6100 módulos) · `vitest safeClient` 3/3 · Vercel preview deploy **Ready**.

---

## 1. Placar por domínio (14 áreas auditadas, 227 achados)

| Domínio | Crít. | Alta | Méd. | Nota |
|---|---|---|---|---|
| Chat/Inbox/Realtime | 2 | 6 | 9 | Duas arquiteturas convivendo; pipeline local montado à toa |
| Componentes gerais | 1 | 4 | 11 | Erros de query engolidos; dashboards fabricados |
| Design system | 0 | 5 | 8 | 5 EmptyState, 3 toasts, storybook não sobe |
| Features (admin/auth/sla) | 1 | 6 | 11 | Migração feature-folder pela metade |
| Hooks | 1 | 4 | 8 | 3 gerações de padrões; God-hooks; @ts-nocheck |
| Pages/Routing | 1 | 5 | 4 | **Dois roteadores**; guardas divergentes |
| Lib/Utils/Services | 1 | 5 | 8 | 3 caminhos de envio, 2 dedupes, 3 SHA-256 |
| Edge Functions — Segurança | 3 | 4 | 3 | BOLA, service_role exposto, passkey sem verificação |
| Edge Functions — Correção | 1 | 6 | 8 | DLQ não entrega; TOCTOU; perda de mensagens |
| DB — Migrations | 3 | 3 | 4 | Repo não é fonte da verdade; não-replayável |
| DB — RLS/SECURITY DEFINER | 2 | 3 | 4 | `CREATE POLICY IF NOT EXISTS` inválido; regressão de fix |
| Type-safety | 1 | 5 | 4 | strict nominal; gates de fachada |
| Arquitetura | 0 | 4 | 5 | Migração inacabada; god-files |
| Segurança frontend | 1 | 3 | 2 | token commitado (✅ corrigido); PII no Sentry |

**Pontos fortes reais** (não tudo é dívida): núcleo de segurança sólido em `_shared/` (auth timing-safe, HMAC rotativo, redação de PII), circuit breakers, idempotência de envio, dedupe cross-tab, 2.649 testes + 60 e2e, RLS 100% nas tabelas públicas, madge com só 7 ciclos em 1.567 arquivos.

---

## 2. Roadmap priorizado — 50 tarefas rumo a 10/10

Legenda esforço: **P** pequeno · **M** médio · **G** grande. `[DB]` requer acesso ao banco/deploy · `[ARQ]` decisão de arquitetura/produto · `[✓ FE]` verificável só com typecheck/build.

### 🔴 Onda 1 — Segurança crítica (bloqueia 10/10)

1. **[DB][P]** Reverter regressão de `prevent_role_escalation` (migration `20260711134126` desfez o fix de service_role de 07-10) → `RAISE EXCEPTION` + `log_security_event`.
2. **[DB][P]** Corrigir `CREATE POLICY IF NOT EXISTS` (sintaxe inexistente no PG) em 6 migrations de segurança — várias policies **nunca foram criadas**.
3. **[Edge][M]** `external-db-bridge` / `external-db-proxy`: qualquer `authenticated` executa CRUD/RPC arbitrário com `service_role` (bypass total de RLS). Restringir a allowlist de RPCs + `requireAdminOrSupervisor`.
4. **[Edge][G]** `webauthn/verify-authentication` **não verifica a assinatura** da asserção → bypass de passkey. Implementar verificação criptográfica real.
5. **[Edge][M]** `gmail-oauth`: BOLA (roubo de tokens) + binding de conta sem verificação de dono + XSS refletido no callback. Validar `state`/dono e escapar `code/error`.
6. **[Edge][M]** `whatsapp-webhook` público sem validação de assinatura gravando via `service_role` → aplicar HMAC como nas demais.
7. **[Edge][P]** `_shared/auth.ts:153` `requireAdminOrSupervisor` checa roles no backend **errado** no deploy self-hosted → apontar para o cliente self-hosted.
8. **[DB][M]** HIGH-1: 64 RPCs `SECURITY DEFINER` executáveis por `authenticated` sem `has_role()` interno (`pause_instance`, `manage_department_member`, `fn_*_transfer`…). Adicionar guarda no topo.
9. **[FE][P]** `src/lib/sentry.ts`: Session Replay grava PII sem máscara → habilitar mask de inputs/texto.
10. **[Infra][M]** `nginx.conf`/`nginx-prod.conf`/`vercel.json`: adicionar CSP e headers de segurança (perdidos por herança); `vercel.json` sem rewrites SPA e com anon key commitada.
11. **[✓FE][M]** `evolutionClient`/`IntegrationKeysSection`: master API key da Evolution entregue ao browser e gravada em localStorage → mover todo tráfego Evolution para proxy edge (a key nunca chega ao cliente). **[ARQ]**
12. **[DB][P]** HIGH-3: `notify_sicoob_on_reply` usa `service_role` de GUC via `http_post` → migrar para `pg_notify` + edge assinado.
13. **[Edge][P]** `bitrix-api` protegido só por header `Origin` (falsificável) → autenticação real.

### 🟠 Onda 2 — Correção de fluxo (dados/mensagens)

14. **[✓FE][P]** `useExternalEvolution.ts:572`: refetch pós-envio descarta mensagens canônicas (chat colapsa p/ 1-2) → merge por união, não substituição.
15. **[✓FE][P]** `useChatPanelHandlers.ts:65`: anexo sem legenda descartado silenciosamente → permitir envio só-mídia.
16. 🟡 **[✓FE][P]** `ContactFormV3.tsx:219`: **crash corrigido** (`37e5185`) — busca o contato completo antes de abrir o dialog em vez de forçar cast do projeto raso do detector de duplicados. `ContactMergeDialog.tsx:184` ainda mescla em 4 writes sequenciais sem transação → precisa de **RPC atômica**. **[DB]**
17. ✅ **[✓FE][P]** `useEmail.ts:462`: `startOAuth` lia `data.authUrl` mas a edge retorna `data.url` → "Conectar Gmail" sempre falhava. *(corrigido em `1d84f74`)*
18. **[Edge][M]** `reprocess-failed-messages`: path kebab-case cru vai à Evolution (DLQ nunca entrega) + sem claim/lease (duplicatas) + idempotência ilusória → normalizar path + lease + cache real.
19. **[Edge][P]** `whatsapp-cloud-webhook:230`: dedupe marcado **antes** de persistir + falha só logada → perde mensagens. Persistir-primeiro + DLQ.
20. **[Edge][M]** TOCTOU no cache de idempotência (`evolution-api-proxy:77`) + dupla-enfileiração (`enqueue-failed-message`) → chave única atômica.
21. **[✓FE][M]** `useMessageQueue`: fila do localStorage reenvia placeholder de áudio como texto; processamento disparado dentro do updater de `setQueue` (impuro) → mover efeito para fora + serializar mídia real.
22. **[✓FE][P]** `useWarRoomAlerts`/`useGoalNotifications`: monitor de SLA como "cron no browser" insere alertas duplicados → mover para edge/cron server-side. **[ARQ]**
23. 🟡 **[✓FE][P]** `ChatMessagesArea.tsx:117`: canal realtime recriado a cada mensagem → **churn corrigido** (`d54b401`, deps estabilizadas via `conversationId`+ref). A invalidação `queryKey:['messages']` segue sem efeito (nenhum `useQuery` usa essa chave) — religar corretamente exige mapear o fluxo de props entre os pipelines local/FATOR X. **[ARQ]**
24. **[✓FE][M]** `useAdminData.ts:109` `handleRoleChange`: delete+insert não atômico e `workspace_id=''` em coluna uuid → RPC transacional. **[DB]**
25. **[✓FE][M]** `useAuthForm.ts:190` passkey login navega sem sessão e mostra toast de sucesso no erro; 2FA/AAL2 nunca exigido → corrigir fluxo + guard AAL2.

### 🟡 Onda 3 — Integridade de métricas (decisões de negócio erradas)

26. **[✓FE][M]** `SatisfactionMetrics.tsx` / `DemandForecast` / `QueueDetails`: dashboards exibem `Math.random()`/hardcoded como métricas reais → derivar de dados reais ou marcar como indisponível. **[ARQ]**
27. **[✓FE][M]** `TrainingMode.tsx:116`: score `Math.random()` persistido no banco como avaliação do agente → algoritmo de score real ou não persistir. **[ARQ]**
28. **[✓FE][P]** `useLeaderboard`/`useQueuesComparison`: seletor de período é decorativo (query ignora range) → aplicar filtro temporal.
29. ✅ **[✓FE][P]** `useReportsData`: off-by-one na janela de comparação (8 vs 7 dias) inflava tendências. *(corrigido em `1d84f74`)*
30. ✅ **[✓FE][P]** `useSLAAlerts.ts:96`: dedupe persistente sem janela temporal → alerta disparava uma vez para sempre. *(corrigido em `1d84f74`)*

### 🟢 Onda 4 — Consolidação de arquitetura (remover ambiguidade)

31. **[ARQ][G]** Unificar os **dois roteadores** (AppRoutes URL × ViewRouter `?view=`): fonte única `route→roles`; a maioria das views admin hoje é acessível por deep-link a qualquer autenticado (`ViewRouter.tsx:15`).
32. **[ARQ][P]** `ProtectedRoute.tsx:94`: race no override dinâmico de roles → resolver antes do primeiro render.
33. **[ARQ][M]** Consolidar **service workers** (3 mecanismos + dois `sw.js`) — hoje push ou precache quebra.
34. **[ARQ][M]** Consolidar **command palette** (2 implementações + GlobalKeyboardProvider + hook, todos ligando Cmd+K) numa única.
35. **[ARQ][G]** Unificar os **3 caminhos de envio WhatsApp** (`sendFunctionRouter`) e os **2 sistemas de dedupe cross-tab**.
36. **[ARQ][M]** Consolidar **3 sistemas de toast** e **5 EmptyState** (2 mortos) num só; remover colisão de nomes.
37. **[ARQ][P]** `SLADashboard`/páginas standalone: sidebar com estado local não navega → `StandalonePageShell` único.
38. **[✓FE][M]** Quebrar os 7 ciclos de import e ajustar a regra ESLint de boundaries por-feature (permite deep import do próprio domínio).
39. **[ARQ][G]** Terminar a migração `features/` (contacts sem barrel; connections em 5 lugares) ou reverter à estrutura por tipo — decidir e documentar o estado-alvo.
40. **[✓FE][M]** Unificar os módulos JID/phone (3 regexes UUID, 3 vocabulários JID, `toWhatsAppJID` com `@c.us` divergente).

### 🔵 Onda 5 — Governança de banco e tipos

41. **[DB][G]** Consolidar migrations: 8 diretórios paralelos sem README de ordem; 79 arquivos fora da convenção de 14 dígitos; 30+ timestamps inválidos → snapshot + arquivo + convenção única.
42. **[DB][M]** Tornar o histórico replayável: schemas `zapp`/`vendas` nunca criados; `evo` usado antes de existir; migração admin de teste + `DISABLE TRIGGER`.
43. **[DB][M]** `DEFAULT PRIVILEGES` concede EXECUTE a `authenticated` em toda função futura (`20260703200000`) — causa-raiz do whack-a-mole → revogar.
44. **[DB][P]** Remover a gambiarra "guardian" (cron que reescreve `prosrc` de funções).
45. **[Types][M]** Regenerar `types.ts` do schema real (Onda 1 nunca executada) → elimina a classe `never` na raiz; hoje o wrapper `safeClient` a contorna com `any`.
46. **[CI][M]** Tornar reais os gates de fachada: `validate-supabase-types.sh` (compara arquivo consigo mesmo), `lint-supabase-casts.mjs` (nunca roda; 131 `as unknown as`), design-system gate (advisory), `eslint --max-warnings`.
47. **[Types][G]** Reduzir os 93 `@ts-nocheck` (SLO semanal) e ligar `noImplicitAny`/`noUncheckedIndexedAccess` progressivamente.

### ⚪ Onda 6 — Robustez e limpeza

48. **[✓FE][M]** Remover código morto confirmado: `useMessages` (295L), 5 hooks de import (~1.000L), `contactsDB.ts` (327L), `lib/stressTest/*` (394L), schemas Zod de webhook não usados.
49. **[Infra][M]** Consolidar 210 edge functions (muitas `ai-*` raras) em roteadores; unificar versões de import Deno (10 versões de supabase-js, std 0.168 deprecated).
50. **[Infra][P]** Criar scripts órfãos referenciados (`smoke-pre-deploy.sh`, `migrate-chatpanel.mjs`) ou remover as referências; consertar storybook (`main.ts` com addons ausentes).

---

## 3. Observações de método

- **Nem todo achado da auditoria estava aberto:** verificação contra o código atual mostrou que vários já foram corrigidos em sessões anteriores (`useDebounce` leading-edge, guard de `/debug/backend`) — por isso cada item foi conferido no HEAD antes de agir.
- **Fixes seguros vs. decisões:** itens `[✓FE]` são mecânicos e verificáveis nesta esteira; `[DB]` exigem banco/deploy (MCP Supabase precisa de auth nesta sessão); `[ARQ]` mudam comportamento de produto e pedem decisão do time antes de executar — não devem ser "consertados" às cegas.
- **Prioridade de execução:** Onda 1 (segurança) fecha o gap crítico para 10/10; Ondas 2-3 protegem dados e confiança nas métricas; Ondas 4-6 são dívida estrutural que reduz risco de regressão futura.
