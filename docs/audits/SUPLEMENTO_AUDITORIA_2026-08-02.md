# SUPLEMENTO AO PLANO DE IMPLEMENTAÇÃO — Re-auditoria 2026-08-02

> Achados descobertos durante a re-auditoria dos Blocos 1-2 executada no chat de 2026-08-02.
> Estes achados são **suplementares** ao `PLANO_IMPLEMENTACAO_100.md` (que já contém 155 achados dos Blocos 1-7 executados em sessões anteriores).
>
> **Descoberto durante a re-auditoria:** re-examinei etapas dos Blocos 1-2 sob a lente correta de "descoberta de bugs" e encontrei 10 achados genuinamente novos (não duplicados) + 1 correção crítica ao F2-13.

**Data:** 2026-08-02
**Autor:** Claude (chat de re-auditoria)

---

## 🔧 Correção do F2-13 no plano principal

### F2-13 (REVISADO) — Índice parcial em `evo.evolution_messages` (NÃO em `zapp.messages`)

- **Descoberta que motiva a correção:** `zapp.messages` **é uma VIEW compat** sobre `evo.evolution_messages` (particionada), não uma tabela. A versão original do F2-13 propunha criar índice em `zapp.messages` — impossível em view.
- **Evidência:**
  ```sql
  SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='messages';
  -- retorna 'v' (view)
  ```
  Definition da view mostra `SELECT em.* FROM evo.evolution_messages em ...` com CASE/COALESCE/LIKE.
- **Ação correta:**
  ```sql
  -- Aplicar na tabela particionada real:
  CREATE INDEX CONCURRENTLY idx_evo_msg_unread_inbound
    ON evo.evolution_messages (direction, is_read)
    WHERE is_read = false AND direction = 'inbound';
  ```
  Verificar se aplicar na master ou em cada partição (23 partições) conforme estratégia PG.
- **Impacto:** o query real que sofre é PostgREST hitando `zapp.messages` (view), que expande para full-scan de `evo.evolution_messages`. Índice na tabela base resolve.

---

## Achados suplementares (10 novos)

### 🆕 Tema 2 — Gates de CI e qualidade

#### F1-15 — tsconfig exclui 11 arquivos de teste do type-check

- **Origem:** Re-auditoria da Etapa 9 (Bloco 1).
- **Evidência:** `tsconfig.app.json` seção `exclude`:
  ```json
  "exclude": [
    "src/**/*simulacao*.test.ts",
    "src/**/*simulation*.test.ts",
    "src/**/*exhaustive*.test.ts",
    "src/__tests__/resolve-jid-exhaustive.test.ts",
    "src/__tests__/security-simulations.test.ts",
    "src/shared/__tests__/validation.test.ts",
    "src/lib/__tests__/healthCheck.test.ts",
    "src/lib/__tests__/sanitize-extra.test.ts",
    "src/lib/__tests__/clientRateLimiter.test.ts",
    "src/lib/__tests__/queryTimeout.test.ts",
    "src/hooks/__tests__/useAudioRecorder.cleanup.test.ts"
  ]
  ```
  **Crítico:** `security-simulations.test.ts` e `validation.test.ts` estão nessa lista — testes que rodam com erros TypeScript não detectados. Se a validação de segurança quebrar por type error, ninguém sabe.
- **Ação:**
  1. Corrigir type errors em cada teste um por vez.
  2. Remover do `exclude` do `tsconfig.app.json`.
  3. Documentar em ADR se algum teste precisa mesmo ficar fora do type-check (`@ts-nocheck` explícito no topo do arquivo é preferível a exclude global).
- **Aceite:** `tsconfig.app.json` sem `exclude` de arquivos `.test.ts`; `bun run tsc` passa incluindo todos os testes.

#### F1-16 — `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters` desligados

- **Origem:** Re-auditoria da Etapa 9 (Bloco 1).
- **Evidência:**
  ```json
  "noImplicitReturns": false,
  "noUnusedLocals": false,
  "noUnusedParameters": false,
  ```
  Permite funções sem return em paths e código morto silencioso.
- **Ação:**
  1. Ligar `noImplicitReturns: true`, corrigir functions faltando return.
  2. Ligar `noUnusedLocals: true`, remover variáveis/imports não usados.
  3. Ligar `noUnusedParameters: true`, prefixar parâmetros intencionalmente não usados com `_`.
- **Aceite:** as 3 flags ligadas; TS build passa.

### 🆕 Tema 5 — Consolidação de cron jobs

#### F2-14 — Cron `link-orphan-messages` (jobid 76) falhou 31/07 — mensagens órfãs

- **Origem:** Re-auditoria da Etapa 16 (Bloco 2).
- **Evidência:** `cron.job_run_details WHERE status='failed'` retornou 1 falha em `link-orphan-messages` em 31/07/2026 18:59.
- **Contexto:** este cron liga `evo.evolution_webhook_events` → `zapp.messages` (via view sobre `evo.evolution_messages`). Falha pode ter deixado mensagens órfãs no webhook_events sem link para conversation.
- **Ação:**
  1. Verificar `evo.evolution_webhook_events` por linhas com `processed_at IS NULL` desde 31/07.
  2. Investigar log do run que falhou: `SELECT * FROM cron.job_run_details WHERE jobid=76 AND status='failed' ORDER BY start_time DESC LIMIT 5;`
  3. Se houver órfãos, rodar reconciliação manual.
- **Aceite:** zero linhas órfãs; job estável nos últimos 7 dias.

### 🆕 Tema 6 — Frontend: router, navegação, arquitetura

#### F1-17 — 20+ itens de menu sem `requiredRoles` (visibility mismatch)

- **Origem:** Re-auditoria da Etapa 3 (Bloco 1).
- **Evidência:** `src/components/layout/sidebarNavConfig.ts` — dos 71 itens totais, 20+ sensíveis SEM `requiredRoles`:
  - `security` (Segurança), `privacy` (LGPD), `admin`, `themes`, `docs`
  - `audit-logs`, `auto-export`, `transcriptions`, `diagnostics`, `performance`
  - `telemetry`, `webhook-events`, `webhook-secret`, `ai-usage`, `public-api`
  - `email-webhook`, `media-migration`, `sicoob-bridge`, `evolution-monitor`, `instance-pauses`
- **Impacto:** os links aparecem para qualquer `authenticated`. `<ProtectedRoute>` bloqueia no clique, mas: (a) UX ruim — usuário clica e vê "Acesso negado"; (b) risco de que rotas via `?view=X&tab=Y` (padrão duplo, F1-14) não passem pelo `ProtectedRoute`.
- **Ação:**
  1. Auditar cada item: se rota tem `<ProtectedRoute requiredRoles>`, adicionar mesmo `requiredRoles` no menu.
  2. Para itens que hoje entram via `?view=X`, criar guard equivalente em `Index.tsx` / `ViewRouter.tsx`.
  3. Componente `<SidebarNavItem>` esconde itens sem role satisfeita.
- **Aceite:** menu só mostra itens acessíveis; guard dupla (menu + rota) validada.

#### F1-18 — `campaigns` duplicado em `primaryNav` e `automationNav`

- **Origem:** Re-auditoria da Etapa 3 (Bloco 1).
- **Evidência:** `sidebarNavConfig.ts`:
  - `primaryNav`: `{ id: 'campaigns', icon: Megaphone, label: 'Campanhas' }`
  - `automationNav`: `{ id: 'campaigns', icon: Megaphone, label: 'Campanhas Clássicas' }`
  Mesmo `id`, labels diferentes.
- **Ação:** decidir: (a) manter só em um grupo, ou (b) usar ids diferentes se são views diferentes.
- **Aceite:** cada `id` aparece uma única vez na config global.

#### F1-19 — 248 arquivos em `src/hooks/` (excesso patológico)

- **Origem:** Re-auditoria da Etapa 6 (Bloco 1).
- **Evidência:** listagem de `src/hooks/` retornou 248 arquivos + 21 subpastas (`admin/`, `campaigns/`, `catalog/`, `connections/`, `dashboard/`, `email/`, `evolution/`, `feedback/`, `followup/`, `gmail/`, `groups/`, `media-library/`, `messaging/`, `meta-capi/`, `monitoring/`, `omnichannel/`, `pipeline/`, `settings/`, `shortcuts/`, `sla/`, `sticker-picker/`, `team-chat/`).
- **Impacto:** difícil manutenção; alta chance de duplicatas semânticas (ver F1-21).
- **Ação:**
  1. Migrar hooks específicos de domínio para `src/features/<slice>/hooks/`.
  2. Manter em `src/hooks/` apenas hooks utilitários genéricos (`useDebounce`, `useDeviceDetection`, `useInViewport`, etc.).
  3. Meta: reduzir raiz de `src/hooks/` para < 30 arquivos.
- **Aceite:** `src/hooks/` com < 30 arquivos utilitários genéricos + subpastas de domínio movidas para `features/`.

#### F1-20 — God-hooks de 20-51 KB violam Single Responsibility

- **Origem:** Re-auditoria da Etapa 6 (Bloco 1).
- **Evidência:** top 8 hooks por tamanho em `src/hooks/`:
  | Arquivo | Tamanho |
  |---|---:|
  | `useEvolutionApiManagement.ts` | **51 KB** |
  | `useExternalApiManagement.ts` | 42,5 KB |
  | `useEmailManagement.ts` | 41 KB |
  | `useAudioManagement.ts` | 38,5 KB |
  | `useExternalEvolution.ts` | 30,8 KB |
  | `useEmail.ts` | 25,8 KB |
  | `useUIInteractionManagement.ts` | 25,5 KB |
  | `useAutomationManagement.ts` | 22 KB |
- **Impacto:**
  1. Todo componente que usa qualquer função do god-hook re-renderiza quando qualquer state interno muda.
  2. Impossível de testar isoladamente.
  3. Impossível de code-split — carrega tudo.
- **Ação:** para cada god-hook, extrair sub-hooks especializados por responsabilidade. Ex: `useEvolutionApiManagement` → `useEvolutionInstance`, `useEvolutionQR`, `useEvolutionMessages`, `useEvolutionWebhook`.
- **Aceite:** cada hook < 8 KB; god-hooks originais viram re-exports temporários (`export * from './useEvolutionInstance'`) até serem removidos.

#### F1-21 — Duplicatas semânticas em 7+ áreas de hooks

- **Origem:** Re-auditoria da Etapa 6 (Bloco 1).
- **Evidência:** grupos de hooks com nomes semelhantes (semelhança de nome não implica funcionalmente idêntico — precisa comparação):
  - **Connections:** `useConnections`, `useConnectionManagement`, `useChannelConnections`, `useConnectionsHealth`, `useConnectionHealthLogs`
  - **UI:** `useUIInteractionManagement`, `useUIManagement`, `useKeyboardManagement`
  - **Evolution:** `useEvolutionApi`, `useEvolutionApiManagement`, `useEvolutionApiLogs`, `useEvolutionAutoReconnect`, `useEvolutionAutoSync`, `useExternalEvolution`, `useEvolutionFallbackStats`
  - **Email:** `useEmail`, `useEmailManagement`, `useEmailDraft`, `useEmailSearch`
  - **Contacts:** `useContactAssignment`, `useContactCustomFields`, `useContactData`, `useContactEnrichedData`, `useContactIntelligence`, `useContactNotes`, `useContactTyping`, `useContactsSearch`
  - **Automation:** `useAutomationLogs`, `useAutomationManagement`, `useAutomationSuggestions`, `useAutomations`
  - **SLA:** `useSLAHistory`, `useSLAMetrics`, `useSLARulesCounts`, `useSLAScopeNames`, `useQueueSlaPanel`
- **Ação:** para cada grupo, ler todos e classificar:
  1. **Duplicata pura** — deletar o mais antigo/menos usado.
  2. **Responsabilidade diferente** — renomear para clareza (ex: `useConnectionsList` vs `useConnectionsRealtime`).
  3. **Wrapper conveniente** — manter mas documentar dependência.
- **Aceite:** matriz de decisão em `docs/audits/hooks-inventory.csv` com veredicto por hook.

#### F1-22 — Arquitetura dupla: service/repository vs god-hooks

- **Origem:** Re-auditoria da Etapa 7 (Bloco 1).
- **Evidência:** `src/services/` tem 8 subpastas com padrão `<name>Repository.ts + <name>Service.ts + useXQueries.ts + useXMutations.ts + index.ts` (bem estruturado). Simultaneamente, `src/hooks/` tem god-hooks de 51 KB que fazem chamadas Supabase diretamente sem passar por Repository/Service. Coexistência de dois padrões arquiteturais gera:
  - Inconsistência para novos devs.
  - Duplicação de lógica de acesso a dados.
  - Cache TanStack Query inconsistente (query keys diferentes para mesma entidade).
- **Ação:**
  1. Escolher padrão canônico: **Repository + Service + useXQueries/Mutations** (o que está em `src/services/`).
  2. Migrar god-hooks progressivamente: extrair chamadas Supabase → Repository, lógica → Service, hooks TanStack Query fatiados.
  3. ADR documentando decisão + roadmap de migração.
- **Aceite:** ADR aprovado; 3 god-hooks migrados como POC (`useEvolutionApiManagement`, `useEmailManagement`, `useAudioManagement`).

### 🆕 Tema 4 — Performance / arquitetura de banco

#### F2-17 — `zapp.*` é view-layer compat sobre `evo.*` e outras schemas base

- **Origem:** Re-auditoria da Etapa 20 (Bloco 2).
- **Evidência:**
  - `zapp` tem 321 tabelas + 407 views + 6 MVs = **734 objetos**.
  - `zapp.messages` é VIEW (relkind='v'), não tabela — puxa de `evo.evolution_messages` com CASE/COALESCE/LIKE.
  - View re-executa a cada consulta PostgREST → explica as "3 top queries `pgrst_source` em `zapp.messages` 13-14 s cada" citadas no levantamento.
- **Impacto:**
  1. Toda vez que o frontend carrega inbox, PostgREST hitea `zapp.messages` (view), que expande em SELECT de `evo.evolution_messages` (23 partições) + processamento de `media_url` em cada linha.
  2. RLS aplicada 2x (view + tabela base).
  3. Índices em `evo.evolution_messages` funcionam, mas planner pode escolher mal se view for complexa.
- **Ação:**
  1. **Curto prazo:** aplicar F2-13 na tabela base `evo.evolution_messages` (não em `zapp.messages`).
  2. **Médio prazo:** criar MV `zapp.mv_messages_hot` refreshed a cada 30s com apenas mensagens dos últimos 30 dias — inbox lê da MV.
  3. **Longo prazo:** decidir se o schema `zapp` (view compat) faz sentido ou se o frontend deve consumir `evo.*` diretamente via PostgREST.
- **Aceite:** MV `zapp.mv_messages_hot` criada; badge unread inbound cai de 1,4 s para < 20 ms; PostgREST não mais aparece em top-10 slow queries.

---

## Status atualizado do Plano B

**Achados totais catalogados após esta re-auditoria:**

| Bloco | Achados originais | Novos | Total |
|---|---:|---:|---:|
| 1 | 14 (F1-01..14) | +8 (F1-15..22) | **22** |
| 2 | 13 (F2-01..13) | +2 (F2-14, F2-17) | **15** |
| 3 | 12 | 0 | 12 |
| 4 | 24 | 0 | 24 |
| 5 | 30 | 0 | 30 |
| 6 | 30 | 0 | 30 |
| 7 | 32 | 0 | 32 |
| 8 | 0 | 0 | 0 |
| 9 | 0 | 0 | 0 |
| 10 | 0 | 0 | 0 |
| **TOTAL** | **155** | **+10** | **165** |

**Achados que investigei mas já existiam no plano (não duplicados):**
- `media_pipeline_health_check` falhas → já em F4-24 e F7-15 (com root cause: schema drift `warroom_alerts.severity` + `chk_warroom_alert_type` violation).
- `analytics-log-retention` falhas → já em F7-16 (com root cause: `dblink` não instalada).

**Correção honesta do meu chat anterior:** eu reportei "27 achados" nas mensagens iniciais desta sessão porque não estava consultando o arquivo completo — só contava os que eu mesmo tinha criado. O trabalho anterior (Blocos 3-7) já estava lá com 128 achados adicionais. Agora o total real é 165.

---

## Próximo chat — o que executar

**Blocos ainda não iniciados** (bugs desconhecidos):
- **Bloco 8** (76-80) — SLA/BPM: 5 etapas
- **Bloco 9** (81-90) — Resiliência e edge cases: 10 etapas
- **Bloco 10** (91-100) — Cross-browser, a11y, performance: 10 etapas

**Recomendação:** avançar para o Bloco 8. Os Blocos 1-7 têm descoberta em ~90%; pendências restantes são entregáveis (CSVs, snapshots) que pertencem à fase de correção, não de descoberta.
