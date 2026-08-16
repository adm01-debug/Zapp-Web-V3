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

### 3.5 🟠 Arquivar por lista pode quebrar o login
`ESTADO.md` classifica `login-attempts` como "sem chamador — candidata a arquivar". Ela é
chamada por `src/lib/loginAttempts.ts:88` → `useAuthForm` → `Auth.tsx`. Causa: o critério de
detecção casa `invoke('nome')` mas **não** `invoke<T>('nome')` com genérico — logo há mais
falsos-negativos na mesma lista. *Detalhe: `docs/estado/36`.*

### 3.6 🟠 Deploy duplicado e alertas mudos
- `deploy-vps-selfhosted.yml`, rotulado *"DRAFT — NÃO ativar"*, dispara em **todo push na main**,
  com `concurrency group` diferente do pipeline oficial: dois deploys disputam o mesmo stack.
- `post-deploy-check.yml` e `notify-ci-failure.yml` escutam `workflow_run` por **nome de arquivo**
  em vez de nome do workflow — **nunca disparam**. Falha de deploy em produção não gera alerta.
*Detalhe: `docs/estado/38`.*

### 3.7 🟡 Cinco cron jobs quebrados
Três com bug de SQL determinístico, não intermitência: `monitor-ingestion-persistence-gap`
(referencia `evo.evolution_audit_log`, inexistente), `backfill-contact-id-ongoing` (alias fora
de escopo; falhou 2026-08-16 11:52Z), `wal_slot_lag_check` (UPDATE em coluna gerada). Mais
`whatsapp_reconcile_dispatch` falhando 13% por saturação de workers e `ops-notify-critical-alerts`
falhando ao decodificar `evolution_api_key` do vault.

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

- SLA/filas marcado `Full`: 11 tabelas de SLA vazias, **0 de 20.743 contatos atribuídos**
- Dashboard principal: XP, coins e streak **hardcoded**; `satisfaction` sempre zero
- `transferred_by: 'Support Agent'` **literal** — falsifica a auditoria de transferência
- 2FA marcado `Full`: backup codes sem persistência e `catch` silencioso que contorna o segundo fator
- 9 features citam evidência inexistente (edge `onboarding` e `sla-alert`; crons
  `csat-auto-send` e `nps-scheduler`)

---

## 5. Qualidade da suíte de testes

Nenhum teste foi executado (sem `node_modules` no ambiente) — **análise estática apenas**.
O padrão dominante não é falta de teste, é **teste que não protege**:

- **Teste-espelho** (7+ casos): reimplementa a lógica localmente em vez de importar o SUT, fica
  verde testando a si mesmo. `webhookStatusPriority.test.ts` chegou a **divergir da produção em
  2 casos** — a produção mudou deliberadamente e o teste congelou o comportamento antigo.
  `rlsGroupAccess` "valida RLS" testando quatro `if`s escritos no próprio arquivo: um
  `DROP POLICY` não o quebraria.
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
- **Gateway Evolution**: 1 única violação em 107 edge functions (`connection-health-check`).
  `callEvolutionApi` de fato removido do runtime.
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
