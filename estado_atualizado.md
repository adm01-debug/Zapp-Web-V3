# estado_atualizado.md — Estado do ZAPP-WEB

> **Entregável da Fase 8** do `PLANO-ESTADO.md`. Consolida a trilha `docs/estado/` (Fases 1–5).
> Produzido em 2026-08-16 por uma onda de 12 agentes paralelos + verificação independente do orquestrador.
>
> **Este documento roteia e sintetiza. O detalhe vive nos 40 documentos de `docs/estado/`.**
>
> Simulação de falhas prévia: `docs/simulation/2026-08-16_inventario_estado_10_agentes_failure_simulation.md`

---

## 0. Como ler este documento (e os outros três)

O repositório tem **quatro inventários com perguntas diferentes**. Confundi-los é a causa da
maior parte das contradições encontradas. Cada um responde uma pergunta e só uma:

| Artefato | Pergunta que responde | Confiabilidade |
|---|---|---|
| `FEATURE_REGISTRY.md` | *Que capacidade de negócio existe?* | ⚠️ evidência parcialmente fabricada — ver §4 |
| `ESTADO.md` | *O que está ligado e quem chama?* | boa, com falsos-negativos — ver §5 |
| `docs/estado/` (40 docs) | *Que arquivos existem, quem importa quem?* | alta — 100% de `src/` auditado |
| `docs/decouple/` | *Qual o grau de separação evo × zapp?* | alta e corrente |

`docs/audit-2026-08-06/` é **snapshot histórico congelado** — não usar como estado atual.

---

## 1. Veredito em uma tela

| Dimensão | Estado |
|---|---|
| Inventário estático de `src/` | ✅ **100%** — 2.042 arquivos em 11 diretórios |
| Inventário de backend | ✅ 107 edge functions + 524 objetos de banco |
| Infra e CI | ✅ 44 workflows, 110 scripts, 30 arquivos de infra |
| Validação de runtime | 🟨 **parcial** — banco verificado ao vivo; n8n, Swarm e Cloudflare não |
| Reprodutibilidade do ambiente | 🔴 **produção não é reconstruível a partir do repo** |
| Postura de segurança do banco | ✅ RLS 100%, zero `SECURITY DEFINER` sem `search_path` |
| Prontidão funcional real | 🟨 **≈49%** (≈88 de 181 features), não os ~35% Full declarados |

---

## 2. O que mudou nesta onda

A trilha estava parada desde 2026-08-09 no bloco 1D, com cobertura real de 81% de `src/` e
**zero** de backend. Medição por recontagem de nomes de arquivo contra a árvore, não por
auto-relato:

| Bloco | Antes | Depois |
|---|---|---|
| `src/` (11 diretórios) | 81% | **100%** |
| `src/services` · `lib` · `utils` · `types` | ≈0% | **100%** |
| Edge functions | 0 | **107/107** |
| Banco (migrations, RPCs, triggers, views, RLS, cron) | 0 | **524 objetos declarados × ~2.600 vivos** |
| Infra e CI | 0 | **184 arquivos** |
| Runtime verificado ao vivo | 0 achados | **banco inteiro + 4 verificações do orquestrador** |

Saídas novas: `31`–`40`, `_ERRATA-TOPOLOGIA.md`, `_RECONCILIACAO-INVENTARIOS.md`.

---

## 3. Riscos estruturais (ordem de gravidade)

### 3.1 🔴 Produção não é reconstruível a partir do repositório
`schema_migrations` tem **648 versões**; `supabase/migrations/` tem **325 arquivos**.
- **387 aplicadas sem arquivo** — 160 com rótulo alfanumérico (`20260809G32`), aplicadas via MCP fora do fluxo
- **64 arquivos sem registro de aplicação** — mas com objetos comprovadamente vivos, ou seja aplicados fora de banda
- **822 funções, 398 triggers e 207 cron jobs vivos sem qualquer declaração no repo**

Consequência: um deploy limpo a partir do repo não reproduz produção, e essa superfície inteira
é invisível a code review e a qualquer gate de CI. *Detalhe: `docs/estado/37`.*

### 3.2 🔴 Evidência fabricada no inventário funcional
Amostra de 18 nomes da coluna "Evidência Camada UI" do `FEATURE_REGISTRY.md`: **6 não existem
em `src/`** (zero ocorrências por busca livre). As fabricações concentram-se nas linhas de
*feature de negócio* — `Contact360View`, `CampaignABView`, `AgentSkillsPanel` — enquanto as
páginas `Admin*` têm lastro real. O documento promete na linha 9 que toda linha tem evidência
concreta. *Detalhe: `docs/estado/_RECONCILIACAO-INVENTARIOS.md` §D3 + correção no topo.*

### 3.3 🟠 Realtime de mensagens degradado para polling
Verificado ao vivo. A inbox assina `evo.evolution_messages` — **schema correto**, pois é a
tabela física hoje. Mas `evolution_messages` e `evolution_conversations` **não constam da
publication `supabase_realtime`** (que tem 14 relations). A subscription é válida sobre relação
não publicada: zero eventos CDC.

Existe fallback de **polling a 15 s** (`evolutionFetchers.ts:12-17` → `useExternalEvolution.ts:513`).
Portanto **a inbox não está quebrada** — degrada. Custo: até 15 s de latência onde deveria ser
push, e refetch periódico por cliente conectado para suprir um canal que seria gratuito.

Correção provável (**não aplicada** — toca produção, exige dono e janela):
`ALTER PUBLICATION supabase_realtime ADD TABLE evo.evolution_messages;`
Validar antes: `publish_via_partition_root` e impacto de WAL nas 2 partições ativas.

### 3.4 🟠 Documentação canônica ensinando o inverso da realidade
O `CLAUDE.md` — primeiro arquivo que todo agente lê — descreve a topologia **invertida**, e a
regra 4 (Realtime) instrui o oposto do correto. Causa: a migration `20260816250003` (ADR-I4)
devolveu as tabelas físicas a `evo` em 2026-08-16 11:50Z, e o documento não acompanhou.

Verdade medida ao vivo:

| objeto | `evo` | `zapp` |
|---|---|---|
| `evolution_messages` | **tabela particionada** | VIEW |
| `evolution_conversations` | **tabela particionada** | VIEW |
| `evolution_contacts` | **tabela** | VIEW |

Mais 14 divergências de contagem (`zapp` 323→386, `evo` 136→70, `ops` 20→51, crons 218→222).
**Este erro contaminou o briefing que dei aos 10 agentes** e quase produziu uma "correção" que
teria apontado subscriptions para views. Detectado pelo agente de errata e por verificação ao
vivo. *Detalhe: `docs/estado/_ERRATA-TOPOLOGIA.md`.*

> **A topologia mudou 3 vezes em 7 dias.** Nenhuma afirmação de schema deve ser aplicada sem
> revalidar `relkind` ao vivo no momento da ação.

### 3.5 🟠 A lista de "candidatas a arquivar" tem 4 falsos-negativos — e 2 são chamadas por cron ativo

`ESTADO.md` classifica 18 edge functions como "sem chamador". **Pelo menos 4 têm chamador real**
(verificado na validação de 2026-08-16):

| função | chamador real | por que escapou do critério |
|---|---|---|
| `login-attempts` | `src/lib/loginAttempts.ts:88` | `invoke<T>()` com genérico |
| `followup-bridge` | — | idem |
| `client-observability` | `src/lib/webVitals.ts:44,98` | nome vem de **variável** (`OBS_FUNCTION`) |
| `evolution-retry-metrics` | `useRetryMetrics.ts:75-76` | multi-linha + template literal |

Mais grave: **`evolution-group-sync` e `evolution-notification-dispatcher` são chamadas por 3 cron
jobs ativos** — jobids **476** (`sync-groups-daily`), **477** (`check-whatsapp-numbers`) e **478**
(`notif-dispatcher`), todos `active: true`, verificados em `cron.job`. São grupo **C**, não
candidatas a arquivar. Isso também contradiz a afirmação do `ESTADO.md` de que apenas
`nps-daily-trigger` chama edge function.

> **⚠️ Correção de 2026-08-16 (validação):** a versão original afirmava que *"arquivar
> `login-attempts` quebraria a autenticação"*. **Falso.** `src/lib/loginAttempts.ts:118-145` mostra
> que as três funções exportadas capturam qualquer erro e retornam `DEFAULT_LOCK_STATUS`
> (`blocked:false`), e `useAuthForm.ts:181` segue para o `signIn`. É **fail-open**: arquivá-la
> **degrada** — desliga silenciosamente lockout de força bruta, blocklist/whitelist de IP e
> geo-blocking — mas não derruba o login. Severidade mantida 🟠 pelo risco de segurança silencioso.
>
> A que **de fato derruba uma tela** ao ser arquivada é `evolution-retry-metrics`: cadeia viva
> `ViewRouter:138 → EvolutionMonitoringDashboard → MonitoringWebhookPanel:133 → RetryMetricsPanel`,
> com `throw error` sem fallback — e essa a auditoria não tinha visto.

### 3.6 🟠 Deploy duplicado e alertas mudos
- `deploy-vps-selfhosted.yml`, rotulado *"DRAFT — NÃO ativar"*, dispara em **todo push na main**,
  com `concurrency group` diferente do pipeline oficial: dois deploys disputam o mesmo stack.
- `post-deploy-check.yml` e `notify-ci-failure.yml` escutam `workflow_run` por **nome de arquivo**
  em vez de nome do workflow — **nunca disparam**. Falha de deploy em produção não gera alerta.
*Detalhe: `docs/estado/38`.*

### 3.7 🟡 Cron jobs com falha — intermitentes, não determinísticos

> **⚠️ Corrigido em 2026-08-16 (validação).** A versão original dizia "cinco cron jobs quebrados,
> três com bug de SQL **determinístico**, não intermitência". O histórico de execução de 7 dias
> **contradiz** essa caracterização: um bug determinístico falharia em 100% das execuções, e a taxa
> real está entre 0,4% e 12,5%.

Taxas medidas em `cron.job_run_details` (7 dias), todos os jobs `active`:

| job | falhas / execuções | taxa |
|---|---|---|
| `whatsapp_reconcile_dispatch` | 90 / 720 | **12,5%** |
| `auto_resolve_alerts` | 19 / 117 | 16% — **já corrigido** (ver abaixo) |
| `monitor-ingestion-persistence-gap` | 15 / 251 | 6,0% |
| `ops-notify-critical-alerts` | 5 / 711 | 0,7% |
| `backfill-contact-id-ongoing` | 3 / 354 | 0,8% |
| `wal_slot_lag_check` | 3 / 708 | 0,4% |

Três observações que mudam a leitura:

1. **`auto_resolve_alerts` já foi corrigido por outra lane.** As 19 falhas
   (`function zapp.fn_auto_resolve_alerts() is not unique`) são históricas — última em 11:00Z, e a
   correção está registrada em `docs/decouple/AGENTES_LANES.md`. Hoje executa com sucesso.
2. **Duas falhas foram colaterais da migração I4**, não bugs: `queue-autoassign-tick` (1 em 1.409)
   e `backfill-contact-id-ongoing` falharam às 11:47Z e 11:52Z com
   `relation "zapp.evolution_contacts" does not exist` e `column m2.ctid does not exist` — exatamente
   a janela em que a tabela virou view. **View não tem `ctid`**: vale conferir se
   `backfill-contact-id-ongoing` precisa passar a apontar para `evo`.
3. O único com taxa alta e persistente é **`whatsapp_reconcile_dispatch` (12,5%)** — esse merece
   investigação real.

---

## 4. Prontidão funcional — a resposta à pergunta original

A pergunta que originou esta trilha foi *"que funcionalidades o sistema deveria ter × o que foi
de fato implementado"*.

O `FEATURE_REGISTRY.md` diz "~131 features, ~35% Full". **O corpo dele tem 181 linhas, 110
marcadas Full** — o próprio sumário erra por 2,4×. Descontando as linhas sem lastro, a contagem
honesta é **≈88 de 181 prontas (~49%)**.

**As falhas não são aleatórias.** Concentram-se em SLA, filas, dashboards e automações
agendadas — exatamente as features que falham *sem erro visível*, e por isso nunca viram
chamado:

- SLA marcado `Full` e dormente: **10 tabelas de SLA e CSAT com zero linhas** (`sla_rules`,
  `sla_violations`, `sla_history`, `conversation_sla`, `csat_surveys`, `csat_responses`,
  `csat_auto_config` e outras — contagem exata, não estimativa). Não há cron de CSAT em produção.

> **⚠️ Correção de 2026-08-16 (validação):** a versão original desta linha afirmava também
> *"0 de 20.743 contatos atribuídos"*, tratando **filas** como dormente junto com SLA. **Isso está
> errado.** O subsistema de filas foi ligado em 2026-08-09 e está operando: `zapp.queues` = 1
> (Atendimento Geral), `queue_members` = 14, cron `queue-autoassign-tick` (jobid 335) ativo a cada
> minuto, e **21.934 de 21.945 contatos com `assigned_to`**, distribuídos uniformemente (~1.870 por
> agente). `queue_positions` = 0 porque tudo foi atribuído, não porque nada acontece.
>
> O número "0/20.743" veio de um handoff de 2026-08-09, anterior à ativação, e foi repassado sem
> reverificação. **Filas: ✅ funcionando. SLA e CSAT: 🟦 dormentes.**
>
> **Causa raiz do erro, registrada para não se repetir:** `pg_stat_user_tables.n_live_tup` é
> *estimativa* e retornou 0 para `queues` (1 real) e `queue_members` (14 reais) — tabelas pequenas
> nunca analisadas. Concluir "tabela vazia ⇒ feature dormente" a partir dela produz falso positivo.
> Confirmar sempre com `count(*)` exato antes de declarar dormência.
- Dashboard principal: XP, coins e streak **hardcoded**; `satisfaction` sempre zero
- `transferred_by: 'Support Agent'` **literal** — falsifica a auditoria de transferência
- 2FA marcado `Full`: backup codes sem persistência e `catch` silencioso que contorna o segundo fator
- 9 features citam evidência inexistente (edge `onboarding` e `sla-alert`; crons
  `csat-auto-send` e `nps-scheduler`)

---

## 5. Qualidade da suíte de testes

Nenhum teste foi executado (sem `node_modules` no ambiente) — **análise estática apenas**.
O padrão dominante não é falta de teste, é **teste que não protege**:

- **Teste-espelho** (9 casos, todos verificados por validação adversarial): reimplementa a lógica
  localmente em vez de importar o SUT, fica verde testando a si mesmo. `webhookStatusPriority.test.ts`
  **diverge da produção em 3 casos** (`delivered→failed`, `read→failed`, `read→played`) — a produção
  mudou deliberadamente e o teste congelou o comportamento antigo. `rlsGroupAccess` "valida RLS"
  testando quatro `if`s escritos no próprio arquivo: um `DROP POLICY` não o quebraria.

  > **⚠️ Correção de 2026-08-16 (validação):** a versão original afirmava 2 casos divergentes e
  > tratava o achado como 🔴 crítico, sugerindo que a regra de negócio estaria desprotegida. **São
  > 3 casos, e a regra NÃO está desprotegida.** Existe
  > `supabase/functions/_shared/__tests__/evolution-helpers-wiring.test.ts` (802 linhas) que
  > **importa o `shouldUpdateStatus` real** e cobre exatamente as três regras divergentes
  > (`:225`, `:226`, `:254`), com os valores corretos de produção — e é coletado pelo workflow
  > (`find supabase/functions -name '*.test.ts'`). O espelho é **lixo obsoleto, não buraco de
  > cobertura**: a ação certa é apagá-lo, não "fazer ele importar o SUT". Rebaixado 🔴 → 🟡.
- **Suítes desligadas**: `externalProxy.test.ts` (601 linhas) comentada em bloco sob premissa de
  remoção que nunca ocorreu — o módulo tem **5 importadores vivos**, incluindo a inbox. ~31% de
  `evoApiHealth/proxy.test.ts` em `describe.skip` cobrindo justamente a autenticação do gateway.
- **Asserção vacuamente verdadeira**: `VITE_SUPABASE_PUBLISHABLE_KEY` não é definida em lugar
  nenhum, então `expect(headers.apikey).toBe(ANON)` vira `expect(undefined).toBe(undefined)` — a
  guarda anti-regressão da issue #1000 é ilusória.
- **441 linhas em `Deno.test` sem runner**: o comentário do `vitest.config.ts` afirma que rodam
  em suíte separada; não há script `deno test` nem task no `deno.json`.
- **E2E: 1.092 linhas de spec descartadas em silêncio.** Os specs *têm* runner (`ci.yml:455`,
  `quality-gate.yml:152`), mas só **3 dos 13** exercitam o build do PR. Causa raiz de metade:
  `vite.config.ts:116` serve em **8080** e `playwright.config.ts:24` sobe o webServer em **5173** —
  4 specs hardcodam 8080 e caem em `test.skip` gracioso. Outros 4 dependem de `RUN_INBOX_E2E`,
  que não existe em workflow nenhum. E `no-workbox-after-reload.spec.ts` aponta para
  `https://zapp-web-v3.vercel.app/`: valida o deploy de produção, não o PR — e como `page.goto()`
  não rejeita em 404, uma página de erro satisfaz a asserção vacuamente.
- **A mesma asserção vale coisas diferentes em workflows diferentes**: `ci.yml:26` define
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `quality-gate.yml:17-22` não — e ambos rodam a mesma suíte
  vitest no mesmo commit. Corrigível com uma linha em `test.env`.
- **A guarda de segurança do Sprint 1 valida texto, não banco**: `sprint1-security-hardening.test.ts`
  faz asserção sobre o conteúdo do arquivo de migration. Com 387 versões aplicadas sem arquivo e
  822 funções vivas sem declaração (§3.1), ela pode passar enquanto a função em produção foi
  redefinida fora de banda — exatamente a regressão que existe para pegar.

---

## 6. O que está bom (para não distorcer o quadro)

- **RLS**: 386/386 tabelas de `zapp` com RLS ativo, 866 policies. `evo` e `ops` também 100%.
  Zero `SECURITY DEFINER` sem `search_path`.
- **Gateway Evolution**: `callEvolutionApi` de fato removido do runtime; zero `axios`.

  > **⚠️ Correção de 2026-08-16 (validação): não é 1 violação, são 3 em bypass total.** Além de
  > `connection-health-check` (que usa `EVOLUTION_API_URL` e por isso foi encontrada),
  > **`evolution-templates:53,81`** e **`evolution-notification-dispatcher:257,270`** resolvem a
  > base URL pelo **vault** (`fn_get_vault_secret('evolution_api_url')`) e escaparam do grep. Ambas
  > fazem `POST /message/sendText` — **envio de WhatsApp em produção fora do gateway**, mais grave
  > que o caso original, que era leitura. Mais 2 bypasses parciais (`evolution-group-sync`,
  > `evolution-api`: `getBaseUrl()` + `fetch` cru).
  >
  > Lição de método: procurar violação de gateway apenas pelo nome da variável de ambiente é
  > insuficiente — o segredo pode vir do vault, de RPC ou de variável intermediária.
- **Hooks**: taxa de órfão de 0–2 por lote em 389 arquivos — é a camada de lógica e está de fato em uso.
- **Desacoplamento evo × zapp**: 6/9 invariantes PASS (nota C), medido online por CI a cada PR.

---

## 7. O que esta onda NÃO fechou

Declarado, não escondido:

- **Fases 6 e 7** (grafo de dependências e veredito por componente) — dependem destas saídas
- **Runtime fora do Postgres**: 138 workflows n8n ativos, Swarm/Portainer, Cloudflare, Vercel
- **207 cron jobs sem declaração** foram contados, não catalogados um a um
- **Classificação dos ~122 órfãos** de 1C só-tagueados segue como backlog
- **`scripts/` e `migrations/`** foram inventariados por objeto, não linha a linha
- **Nenhum teste executado** e nenhuma verificação de build/tipo — toolchain ausente

---

## 8. Próximos passos recomendados (ordem de valor)

1. **Corrigir o `CLAUDE.md`** — é o primeiro arquivo que todo agente lê e hoje ensina topologia
   invertida. Custo baixo, risco de não fazer alto: cada agente novo repete o erro que eu cometi.
2. **Decidir sobre a publication** — publicar `evo.evolution_messages` restaura push e remove o
   polling de 15 s. Uma linha, mas toca produção: exige dono e janela.
3. **Retirar `login-attempts` da lista de arquiváveis** e reprocessar a lista com regex que
   cubra `invoke<T>()`, antes que alguém arquive por engano.
4. **Desarmar o `deploy-vps-selfhosted.yml`** e corrigir os dois `workflow_run` mudos — hoje há
   deploy duplicado e nenhum alerta de falha.
5. **Gate `evidência-ou-vazio` no `FEATURE_REGISTRY`** — toda célula cita `caminho:linha` ou nome
   de objeto, validado em CI, ou a linha cai para `Suggested`. Teria bloqueado 12 das 22
   divergências na origem.
6. **Reconciliar `schema_migrations`** com o repo, ou assumir explicitamente que o banco é
   gerido fora do versionamento — hoje o repo aparenta uma reprodutibilidade que não tem.
