# Plano de Correção — 20 Etapas

**Base:** `PLANO_IMPLEMENTACAO_100.md` (200 achados, Temas 1-16) · **Criado:** 2026-08-02
**Propósito:** transformar 200 achados de auditoria em 20 unidades de trabalho executáveis, cada uma dimensionada para caber em **uma sessão de chat**, com pré-requisitos explícitos e handoff limpo.

**Como usar:** cada etapa é autossuficiente. Ao pegar uma, leia (a) esta seção da etapa, (b) os achados listados no `PLANO_IMPLEMENTACAO_100.md`, (c) a seção "Antes de começar" abaixo. Ao terminar, marque a etapa e registre o resultado em `RELATORIO_CORRECAO.md`.

---

## Parte I — Revisão crítica do backlog

Antes de dividir, revisei os 200 achados. **O backlog não está pronto para execução direta.** Cinco problemas precisam ser tratados na Etapa 1, senão contaminam tudo que vier depois.

### 1. Um achado tem diagnóstico factualmente errado

**F7-16** afirma: *"Cron 100 `analytics-log-retention` 100% falha (`dblink` não instalada)"*, com evidência `function public.dblink(text, text) does not exist` e ação `CREATE EXTENSION IF NOT EXISTS dblink;`.

Medição de hoje refuta os três pontos:
- A extensão **está instalada** (`pg_extension` → dblink v1.2).
- `ops.fn_analytics_log_retention` **já qualifica** como `zapp.dblink(...)`.
- O cron **não falha 100%**: 1 sucesso em 3 execuções no histórico atual.

A causa real é a mesma de **F9-13**: as funções `dblink` vivem no schema `zapp`, enquanto `pg_extension.extnamespace` aponta para `public` — quem não qualificar ou não tiver `zapp` no `search_path` quebra. Executar a ação de F7-16 como está seria um no-op.

**Consequência para o plano:** achados dos blocos 1-7 foram medidos há semanas. Alguns envelheceram, outros nasceram com diagnóstico incompleto. **A Etapa 1 revalida antes de qualquer correção.**

### 2. A severidade não é utilizável como está

- **102 dos 200 achados não têm severidade no título**; apenas 77 seguem o padrão `CRÍTICO/ALTO/MÉDIO/BAIXO`. Os Temas 1-4 e 7 foram escritos antes da convenção se firmar.
- Onde existe, está **inflacionada**: F5 tem 16 CRÍTICO em 30, F6 tem 15 em 30, F8 tem 9 em 17. Quando metade do bloco é crítica, a marcação perde função de ordenação.
- A inflação mistura naturezas incompatíveis: **F5-15** (RLS expõe contatos a todos os usuários — vazamento cross-tenant real) e **F5-12** (`search_contacts_cursor` sem `pg_trgm` — lentidão) têm a mesma etiqueta `CRÍTICO (P0)`.

### 3. Faltam dependências e causa-raiz explícitas

Vários achados são **sintomas do mesmo defeito** e não devem ser trabalhados isoladamente:

| Raiz | Sintomas dependentes |
|---|---|
| `F5-01` view `zapp.contacts` descarta campos | F5-02, F5-05, F5-09 — todos derivam da view incompleta |
| `F6-03/F6-04` duas fontes de verdade de instância | F6-13, F6-14, F6-16, F6-24 |
| `F9-13` `dblink` em schema não previsto | F7-16 (mesma causa, diagnóstico divergente) |
| `F9-09` DLQ com alvo errado | F9-10 é **pré-requisito** — inverter a ordem ativa bug latente |

Corrigir a raiz primeiro reduz o backlog real bem abaixo de 200.

### 4. Achados que são decisões de produto, não bugs

Estes **não podem ser "corrigidos" por um dev** — exigem decisão de Abner/Pink antes de virar tarefa:

- **F8-02** — schema `bpm` inteiro vazio (41 tabelas): ativar o módulo ou removê-lo?
- **F10-03 / F9-01 / F9-02 / F9-03** — PWA e fila offline: assumir ou remover? Há 4 specs testando a **ausência** de workbox, o que sugere remoção já decidida e não documentada.
- **F10-08** — impressão bloqueada: é proteção de PII deliberada, não defeito.
- **F8-03** — 3 sistemas SLA paralelos: qual é canônico?

Misturá-los com correção técnica trava a esteira. Vão para a **Etapa 13**, isolados.

### 5. Nenhum achado tem plano de rollback

Vários alteram RLS, triggers e views em produção com **20.445 contatos** e 17,5k mensagens ativas. O formato Origem/Evidência/Ação/Aceite é excelente para diagnóstico, mas não cobre "e se der errado". A Etapa 1 adiciona esse campo aos achados de risco alto.

### O que continua muito bom

Vale registrar: os 200 achados têm **evidência medida com números reais** e **critério de aceite binário**. Isso é raro e é o que torna este plano executável. A revisão acima é sobre *organização*, não sobre qualidade da medição.

---

## Parte II — Antes de começar (leia em toda sessão)

**Ambiente:** repo em `/workspace/repos/zapp-web-v3` (container Claude Code na VPS). Banco: `SUPABASE SELF HOSTED - MCP`, schema principal `zapp`.

**Regras duras:**
- `git push --force`, `git reset --hard` e `rebase -i` são **proibidos** — há histórico de incidente com perda de 30k commits em outro repo.
- Husky `pre-commit` tenta rodar `bun`, que não existe no container. Procedimento: `mv .husky/pre-commit .husky/pre-commit.disabled_temp` → commit → `mv` de volta. **Sempre restaurar.**
- PAT do GitHub expira com frequência. Se o push falhar com `Invalid username or token`, **pare e peça** — não invente credencial.
- `cron.job_run_details` retém **~3,5 dias**. Qualquer janela maior é cega.
- Objetos `zapp.*` frequentemente são **VIEW** de `evo.*` (`contacts`, `messages`, `evolution_guardian_heartbeat`). Confirme `relkind` antes de concluir que uma constraint ou tabela não existe — essa armadilha já derrubou duas premissas.

**Definição de pronto por etapa:**
1. Todo achado da etapa tem seu **Aceite** verificado com comando real, e a saída registrada.
2. Achados que se revelarem obsoletos são marcados `~~OBSOLETO~~` com a evidência da revalidação — não deletados.
3. Commit no padrão `fix(<escopo>): E<NN> — <resumo> (<achados>)`.
4. Seção da etapa preenchida em `RELATORIO_CORRECAO.md`.

---

## Parte III — As 20 etapas

### Fase 0 — Fundação (não toca em produção)

#### Etapa 1 — Revalidar e recalibrar o backlog
**Achados:** nenhum consumido (meta-etapa sobre o próprio plano).
**Por que primeiro:** F7-16 provou que há diagnóstico errado no backlog. Corrigir cegamente desperdiça sessões e pode causar dano.
**Escopo:**
1. Re-executar o **Aceite** de todos os 44 achados marcados `CRÍTICO` — muitos foram medidos há semanas. Marcar obsoletos.
2. Normalizar severidade nos 102 achados sem etiqueta, usando escala honesta: `SEC` (segurança/LGPD) > `QUEBRADO` (feature morta) > `RISCO` (latente) > `DEGRADADO` (perf/UX) > `HIGIENE`.
3. Adicionar campo `Depende de:` nos achados da tabela de raízes da Parte I.
4. Adicionar campo `Rollback:` nos achados que alteram RLS, trigger, view ou cron em produção.
**Pronto quando:** todo achado tem severidade normalizada e nenhum `CRÍTICO` está sem revalidação.
**Risco:** nenhum (só documentação).

#### Etapa 2 — Ligar a rede de segurança do CI
**Achados:** F1-10, F1-11, F10-02, F10-04, F10-05, F10-06, F10-09, F6-26.
**Por que agora:** as 18 etapas seguintes vão mexer em 200 pontos do sistema. Sem gate funcionando, cada correção pode introduzir regressão invisível. Hoje: `lint` tem `|| true`, `perf:budget` tem `continue-on-error`, `test:e2e` roda 13 specs em vez de 61, e 28 specs nunca executam.
**Escopo:** remover `|| true` e `continue-on-error`; apontar `test:e2e` para a config certa; coletar specs por tag em vez de lista hardcoded; registrar `addon-a11y`; ampliar `testMatch` do axe.
**Pronto quando:** um PR com erro deliberado de lint **reprova**.
**Risco:** médio — pode expor falhas pré-existentes. Se acontecer, registre como achado novo e **não desligue o gate de novo**.

### Fase 1 — Segurança (risco independente do resto)

#### Etapa 3 — Credenciais e sessão JWT
**Achados:** F9-16, F9-17, F9-18.
**Por que aqui:** único grupo cujo risco não depende de mais nada estar funcionando. Tokens válidos por **365 dias** e `jwt_secret` legível no catálogo.
**Escopo:** `jwt_exp` 31536000 → 3600; mover `jwt_secret` para variável de ambiente do GoTrue/PostgREST; rotacionar o secret; `statement_timeout` de `authenticated` 120s → 15s.
**Pronto quando:** `current_setting('app.settings.jwt_secret', true)` retorna `NULL` e a autenticação segue operando.
**Risco:** **ALTO — janela de manutenção obrigatória.** Rotacionar o secret invalida todas as sessões: os ~50 operadores refazem login. Confirmar refresh-token rotation no GoTrue **antes**, ou o corte de 1h força re-login horário.

#### Etapa 4 — Isolamento multi-tenant
**Achados:** F5-14, F5-15, F5-16, F5-20, F6-17, F6-27, F8-06.
**Escopo:** RLS que vaza entre tenants. `contacts_insert` com `WITH CHECK NULL`, `contacts_select` expondo `assigned_to IS NULL` a todos, `get_default_workspace_id()` devolvendo o workspace mais antigo, 41 tabelas `bpm.*` com `USING(true)`.
**Pronto quando:** teste com dois usuários de workspaces distintos não enxerga dados um do outro.
**Risco:** **ALTO** — apertar RLS pode esconder dados de quem legitimamente precisa. Testar com conta real de operador antes de aplicar.

#### Etapa 5 — SECURITY DEFINER e grants
**Achados:** F2-01, F2-02, F2-03, F2-04, F2-05, F6-07, F6-18, F8-11, F8-17.
**Escopo:** revogar `EXECUTE` de `authenticated` em 9 trigger functions de `public`; auditar 119 SECDEF em `zapp` + 41 em outros schemas; `search_path` frágil; remover policy `auth_secure_123` (nome de teste em produção).
**Pronto quando:** `SELECT * FROM zapp.v_security_audit WHERE status LIKE '%⚠%'` retorna 0 linhas.
**Risco:** médio — revogar EXECUTE demais quebra fluxo. Revogar em lotes, validando após cada um.

### Fase 2 — Dados de cliente e LGPD

#### Etapa 6 — View `zapp.contacts` e seus triggers (causa-raiz)
**Achados:** F5-01, F5-02, F5-03, F5-27, F5-29.
**Por que antes da Etapa 7:** a view descarta CPF, endereço, `is_blocked`, `is_favorite` e campos LGPD; os triggers INSERT/UPDATE dropam campos e o DELETE faz **hard delete**, violando o requisito de soft-delete com undo de 30 dias. Metade dos achados de contatos são sintoma disto.
**Pronto quando:** um UPDATE via view preserva todos os campos da tabela base e o DELETE marca `deleted_at` em vez de remover.
**Risco:** **MUITO ALTO** — 20.445 contatos em produção. Backup da tabela base antes. Testar em transação com `ROLLBACK`.

#### Etapa 7 — RPCs de contatos dependentes da view
**Achados:** F5-04, F5-05, F5-09, F5-10, F5-11, F5-30.
**Depende de:** Etapa 6.
**Escopo:** `merge_contacts()` que levanta `EXCEPTION 'implementacao pendente'`; `bulk_soft_delete_contacts` referenciando colunas inexistentes; `add_contact_note` descartando parâmetros; hook que bypassa a RPC com INSERT direto; `contact_notes` com 0 rows.
**Pronto quando:** merge de dois contatos reais funciona ponta a ponta e a nota persiste com `note_type`.

#### Etapa 8 — Conformidade LGPD
**Achados:** F5-06, F5-07, F5-18, F5-26, F5-28, F7-17.
**Escopo:** **20.445 contatos, zero com `lgpd_consent_at`** — não há registro de consentimento. Sem coluna CPF/CNPJ e sem `validate_cpf`/`validate_cnpj`. `rpc_get_contact` expõe dados de contatos que optaram por sair. `remote_jid` completo em query string (PII em log de acesso).
**Pronto quando:** existe trilha de consentimento e nenhum endpoint retorna dados de opted-out.
**Risco:** decisão jurídica envolvida — alinhar com Abner antes de definir o default de consentimento retroativo.

### Fase 3 — Observabilidade (enxergar o efeito das correções)

#### Etapa 9 — Silenciar o ruído e recuperar os alertas reais
**Achados:** F9-07, F9-08, F6-08, F6-22, F6-23, F7-14, F8-16.
**Por que aqui:** as próximas etapas mexem em produção, e hoje **não é possível ver o efeito**: 1.843 alertas duplicados de um guard quebrado (40,9% da tabela), 269 `evolution_alerts` sem triage, 724 `webhook_health_alerts` não resolvidos (98,6%). Sinal real soterrado na razão de 1:921.
**Escopo:** corrigir o guard de `fn_detect_401_bursts` (filtra `message`, texto está em `title`); purgar histórico redundante; política de retenção; triar backlogs.
**Pronto quando:** alertas `info` de `fn_detect_401_bursts` nas últimas 24h ≤ 1 (hoje: 96).

#### Etapa 10 — `dblink` e o deadman switch
**Achados:** F9-12, F9-13, F9-14, F7-16.
**Depende de:** Etapa 1 (F7-16 precisa do diagnóstico corrigido).
**Escopo:** `dblink` mora em `zapp`, não em `public` — qualificar chamadas ou ajustar `search_path`. Depois: o cron 193 injeta heartbeat com o **mesmo `service_name`** do guardian real a cada 5 min, tornando o deadman switch incapaz de disparar. Separar em `pg-cron-liveness`.
**Pronto quando:** existe heartbeat com `details->>'source'='dblink'` nos últimos 30 min (hoje: 0 em todo o histórico).

#### Etapa 11 — DLQ e filas de mensagem
**Achados:** F9-09, F9-10, F9-11, F9-15, F4-14, F4-23.
**⚠ Ordem interna obrigatória:** **F9-10 antes de F9-09.** O roteador está apontado para 22 tabelas legadas vazias e a DLQ nunca recebeu uma linha. Se corrigir o roteador primeiro, o primeiro alerta criado trava o canal permanentemente em `alert_already_open`, porque `fn_monitor_dlq_health` grava os timestamps mas não os booleanos do próprio WHERE.
**Pronto quando:** `evo.evolution_webhook_dlq` tem ≥ 1 linha e o evento órfão parado desde 2026-06-13 foi drenado.

#### Etapa 12 — Crons quebrados, no-op e mal escalonados
**Achados:** F2-06, F2-07, F2-08, F2-09, F2-12, F4-24, F6-09, F6-10, F7-15, F8-05, F8-09, F8-14, F8-15.
**Escopo:** 4 pares duplicados; 6 VACUUMs concorrentes em 15 min; chain logflare de 7 jobs; watchdog com **gap noturno de 6h** (23h→6h); cron 213 falhando 42,8% por schema drift; cron 198 chamando função no-op enquanto a versão real é dead code.
**Pronto quando:** nenhum cron do inventário tem taxa de falha > 5% ou retorno constante de "0 rows processadas".

### Fase 4 — Decisões (bloqueiam trabalho técnico)

#### Etapa 13 — Decisões arquiteturais com Abner/Pink
**Achados:** F8-01, F8-02, F8-03, F8-04, F8-07, F8-08, F8-13, F9-01, F9-02, F9-03, F10-03, F10-08.
**Natureza:** esta etapa **não escreve código** — produz ADRs. Cada decisão desbloqueia ou cancela achados.
**Perguntas a responder:**
1. **BPM** (41 tabelas vazias, triggers stub, RLS aberta): ativar ou remover? Enquanto indefinido, F8-04/05/06 ficam sem destino.
2. **Fila offline / PWA**: há 4 specs testando a *ausência* de workbox e um `index.html` que desregistra SWs. Parece decisão já tomada e não escrita. Assumir a remoção ou implementar de verdade?
3. **SLA canônico**: 3+ sistemas paralelos (`bpm_sla_records`, `conversation_sla`, `sla_delivery_violations`). Qual sobrevive?
4. **Impressão**: manter bloqueio de PII (com aviso ao usuário) ou criar exportação com redação?
5. **Dashboard SLA** com fallback `overallRate: 100`: qual o comportamento correto com zero dados?
**Pronto quando:** 5 ADRs em `docs/adr/`, cada achado marcado `RESOLVIDO POR DECISÃO` ou movido para etapa de implementação.

### Fase 5 — Correção funcional

#### Etapa 14 — Conexões WhatsApp: fonte única de verdade
**Achados:** F6-01, F6-02, F6-03, F6-04, F6-05, F6-06, F6-11, F6-12, F6-13, F6-14, F6-15, F6-16, F6-19, F6-20, F6-21, F6-24, F6-25, F6-28, F6-29, F6-30.
**Nota de dimensionamento:** 20 achados — **a maior etapa**. Se o contexto apertar, quebre em 14a (fonte de verdade: F6-03, F6-04, F6-13, F6-14, F6-16, F6-30) e 14b (o resto).
**Escopo:** `handleAddConnection` **não chama** `/instance/create` da Evolution — só faz INSERT no banco; pairing code 100% ausente; hardcode `wpp2`; 373 reconcile_jobs (22%) com telemetria corrompida.
**Pronto quando:** criar conexão pela UI provisiona instância real na Evolution e ambas as tabelas convergem.

#### Etapa 15 — Inbox e mensageria
**Achados:** F4-01 a F4-13, F4-15 a F4-22.
**Escopo:** `fetchConversations` sem paginação (500+1000 fixo); channel realtime com nome aleatório; `USE_EXTERNAL_DB = true` hardcoded; **8 round-trips por mensagem enviada**; memory leaks (`seededAvatarsRef`, `processedDeliveriesRef` sem cap); `media_cache.storage_path` guardando data URL base64.
**Pronto quando:** envio de mensagem cai para ≤ 3 round-trips e a lista pagina sem travar acima de 1000 conversas.

#### Etapa 16 — Autenticação e sessão
**Achados:** F3-01 a F3-12.
**Escopo:** `getSession()` fora de `useEffect` em `ProtectedRoute`; bypass `isDev` sem log de auditoria; `refreshAll` sem `AbortController`; dead code (`verifyHttpOnlyCookieAuth`, `externalSessionBridge`); `signOut` sem fallback local.
**Depende de:** Etapa 3 (não mexer em sessão antes de estabilizar o JWT).

#### Etapa 17 — Busca e performance de contatos
**Achados:** F5-08, F5-12, F5-13, F5-17, F5-19, F5-21, F5-22, F5-23, F5-24, F5-25.
**Escopo:** **5 estratégias divergentes de normalização de telefone**; busca sem `pg_trgm`; COUNT CTE duplicando custo por página; `tags.name` UNIQUE global impedindo multi-tenant; intelligence lendo só `wpp2`.
**Pronto quando:** busca por telefone formatado encontra o contato e o plano usa índice, não seq scan.

#### Etapa 18 — Admin: remover mocks e dados falsos
**Achados:** F7-01 a F7-13, F7-18 a F7-32.
**Nota:** 28 achados, mas em sua maioria **superficiais e independentes** — bom candidato a lote. Inclui `// @technical` renderizando como texto literal em 3 páginas, latência "42ms" e uptime "99.9%" hardcoded, `AuditEvidenceDashboard` inteiro mock estático, painéis sempre em zero.
**Pronto quando:** nenhuma página `/admin/*` exibe número que não venha do banco.

### Fase 6 — Transversal e fechamento

#### Etapa 19 — Resiliência unificada e cross-browser
**Achados:** F9-04, F9-05, F9-06, F9-19, F10-01, F10-07.
**Escopo:** supabase-js sem retry; **4 implementações paralelas de backoff** (1.266 linhas); **3 circuit breakers** para a mesma API com limiares 3/5/10 e cooldowns 30s/60s/30min; sem indicador de perda de conectividade; Playwright só em Chromium; Lighthouse inexistente.
**Pronto quando:** existe uma única fonte de retry/breaker e o CI roda webkit + firefox.

#### Etapa 20 — Higiene, dead code e fechamento
**Achados:** F1-01 a F1-09, F1-12, F1-13, F1-14, F2-10, F2-11, F2-13, F8-10, F8-12.
**Escopo:** arquivos temporários versionados, `__pycache__`, migration no diretório errado, `functions-legacy/`, migrations de outro projeto (`fatorx-migrations/`), 11 pages órfãs, 588.042 INSERTs unitários a consolidar em batch.
**Fechamento:** varrer os 200 achados confirmando `Aceite` verificado ou marcado obsoleto/decidido; publicar `RELATORIO_CORRECAO.md` consolidado.

---

## Parte IV — Mapa de cobertura

| Etapa | Achados | Qtd | Risco |
|---|---|---:|---|
| 1 — Revalidar backlog | (meta) | 0 | nulo |
| 2 — Gates de CI | F1-10,11 · F10-02,04,05,06,09 · F6-26 | 8 | médio |
| 3 — JWT | F9-16,17,18 | 3 | **alto** |
| 4 — Multi-tenant | F5-14,15,16,20 · F6-17,27 · F8-06 | 7 | **alto** |
| 5 — SECDEF/grants | F2-01..05 · F6-07,18 · F8-11,17 | 9 | médio |
| 6 — View contacts | F5-01,02,03,27,29 | 5 | **muito alto** |
| 7 — RPCs contatos | F5-04,05,09,10,11,30 | 6 | alto |
| 8 — LGPD | F5-06,07,18,26,28 · F7-17 | 6 | jurídico |
| 9 — Ruído de alertas | F9-07,08 · F6-08,22,23 · F7-14 · F8-16 | 7 | baixo |
| 10 — dblink/deadman | F9-12,13,14 · F7-16 | 4 | baixo |
| 11 — DLQ | F9-09,10,11,15 · F4-14,23 | 6 | médio |
| 12 — Crons | F2-06..09,12 · F4-24 · F6-09,10 · F7-15 · F8-05,09,14,15 | 13 | médio |
| 13 — Decisões (ADR) | F8-01,02,03,04,07,08,13 · F9-01,02,03 · F10-03,08 | 12 | nulo |
| 14 — Conexões WhatsApp | F6-01..06,11..16,19,20,21,24,25,28,29,30 | 20 | alto |
| 15 — Inbox | F4-01..13, 15..22 | 21 | médio |
| 16 — Auth | F3-01..12 | 12 | médio |
| 17 — Busca/contatos | F5-08,12,13,17,19,21..25 | 10 | médio |
| 18 — Admin | F7-01..13, 18..32 | 28 | baixo |
| 19 — Resiliência | F9-04,05,06,19 · F10-01,07 | 6 | baixo |
| 20 — Higiene | F1-01..09,12,13,14 · F2-10,11,13 · F8-10,12 | 17 | baixo |
| | **TOTAL** | **200** | |

### Caminho crítico (dependências rígidas)

```
Etapa 1 ──► todas as demais (revalidação)
Etapa 2 ──► rede de segurança para 3..20
Etapa 3 ──► Etapa 16 (auth depende de JWT estável)
Etapa 6 ──► Etapa 7 (RPCs dependem da view corrigida)
Etapa 1 ──► Etapa 10 (F7-16 precisa do diagnóstico certo)
Etapa 13 ──► desbloqueia/cancela achados de 14, 19
F9-10 ──► F9-09  (dentro da Etapa 11 — inverter ativa bug latente)
```

### Sugestão de sequenciamento

Etapas **1 e 2 são inegociáveis como primeiras**. Depois, **3 → 4 → 5** fecham a superfície de segurança. **9 e 10** valem vir cedo mesmo sendo baixo risco: sem elas não há como enxergar o efeito das etapas seguintes. **13** pode rodar em paralelo, pois é conversa, não código. **18** é o melhor candidato a preencher sessões curtas — 28 achados independentes e superficiais.
