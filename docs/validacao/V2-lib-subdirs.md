# V2 — Validação adversarial de 34-lib-subdirs-utils-types.md

> Validado em: 2026-08-16 | Achados testados: 12/12 (A1..A12) + alegação de conformidade Realtime
> Sem banco, sem toolchain (`node_modules` ausente) — análise estática somente leitura.
> Branch: `claude/validar-levantamento-sistema-uxonxc` @ `aca8bec9d`
> Postura: refutar por padrão. Cada veredito abaixo foi reproduzido do zero, sem
> reaproveitar as evidências citadas pelo documento auditado.

---

## 1. Placar

| veredito | qtd | achados |
|---|---|---|
| **CONFIRMADO** | 9 | A1 (com ressalva de causalidade), A4, A5, A6, A7, A8, A9, A11, A12 |
| **SUPERDIMENSIONADO** | 2 | A2 (fato correto, severidade inflada), A3 (exposição real, consequência falsa) |
| **REFUTADO** | 1 | A10 |
| **NAO_VERIFICAVEL** | 0 | — |

**Alegação de conformidade Realtime (0 violações): CONFIRMADA** após reteste com 10 padrões
alternativos (§4).

**Defeitos de contagem fora do bloco de Achados: 5** — nenhum altera veredito, mas dois
são erros de leitura reais e não arredondamentos (§5.2).

Resultado líquido: o documento é substancialmente sólido. Os dois achados que o briefing
mandou escrutinar (A1 e A2) **não** repetem o padrão de superdimensionamento das rodadas
anteriores — A1 se sustenta inteiro e A2 se sustenta no fato. O erro real está em **A10**,
que foi construído sobre uma premissa que não existe no código, e em **A3**, cuja segunda
metade não sobrevive à verificação do consumidor.

---

## 2. Veredito por achado

| # | afirmação | veredito | evidência que eu verifiquei (caminho:linha) | nota |
|---|---|---|---|---|
| **A1** | Refactor abandonado: monólito redeclara tudo, 4 módulos com zero importador, semântica divergiu | **CONFIRMADO** | `crossTabDedupe.ts:36` (LS_LOCK_PREFIX), `:341` (ensureTransport), `:448` (readLock), `:467` (writeLock), `:507` (readPersistedResult), `:645` (broadcast) — todas as 6 linhas citadas conferem exatamente. Divergência: `BroadcastMessage` monólito `:74-85` tem `version`(via `VersionedPayload:56-58`), `sequence`, `masterClockOffset`, tipo `'clock-tick'`; `crossTabDedupeTypes.ts:37-46` não tem nenhum. `LockPayload` `:60-65` (com `version`+`sequence`) vs `Types:30-34` (3 campos). Importadores dos 4: grep global em `*.ts/tsx/js/json/md` → só `Transport.ts:9`, `Cache.ts:7`, `Lock.ts:1` importando `Types`; **zero de fora** | Ver §3.1. Ressalva: a *causalidade* ("criados para substituí-lo") é inferência — ver §3.1 |
| **A2** | Cabeçalho vs comentários inline se contradizem; 25 importadores; inline errados | **SUPERDIMENSIONADO** | Contradição literal confirmada: cabeçalho `:8-11` (wpp2 PRODUTIVA / wpp_pink_test TESTE archived) vs inline `:25-26` ("wpp2 = legada") e `:27-28` ("wpp_pink_test = ATIVA atual"). Constantes `:41` e `:47` = `'wpp2'`. 25 arquivos importam (24 prod + 1 teste) | Fato **integralmente correto**; severidade ALTA não se sustenta. Ver §3.2 |
| **A3** | `SELECTABLE` expõe `wpp_pink_test` na UI e selecioná-la reproduz o incidente de sidebar zerada | **SUPERDIMENSIONADO** | `whatsappInstances.ts:56-58` filtra só `'default'` → `wpp_pink_test` fica selecionável: **verdadeiro**. Mas o **único** consumidor é `src/pages/admin-webhook-secret-status/InstanceFilterSelect.tsx:9,39` — filtro de uma página admin de status de webhook, com opção default "Todas as instâncias". Nenhum seletor de instância da Inbox consome `SELECTABLE` | A 2ª metade do achado é **falsa**: essa UI não alimenta a sidebar da Inbox. Ver §5.1 |
| **A4** | `isValidUUID` vs `isValidUuid`: regex idêntica, `trim()` só num, adoção assimétrica | **CONFIRMADO** | `utils/uuid.ts:20` regex ≡ `lib/types/branded.ts:53` (idênticas caractere a caractere). `uuid.ts:26` assinatura `string\|null\|undefined`, sem trim; `branded.ts:85` assinatura `unknown`, com `.trim()`. `utils/uuid` = 69 importadores; `lib/types/branded` = **0** (grep global, inclusive testes) | — |
| **A5** | Dois `useAudioPlayer`; o de `lib/audio/` tem 0 importadores | **CONFIRMADO** | `lib/audio/useAudioPlayer.ts` → 0 referências em todo `src/`. Vivo: `hooks/useAudioManagement.ts:467`, consumido em `features/inbox/components/AudioMessagePlayer.tsx:7,56` | — |
| **A6** | Fontes de env divergentes + `supabaseForUser` duplicado literalmente | **CONFIRMADO** | `mcp/index.ts:6-10` usa `import.meta.env.VITE_SUPABASE_URL` com `throw`; `tools/list-connections.ts:6-7` e `tools/list-contacts.ts:6-7` usam `process.env.SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_ANON_KEY` com cast `as string` e zero validação. `diff` das linhas 5-17 dos dois arquivos de tool: **byte-idênticas** | Duplicação verificada por diff, não por leitura |
| **A7** | Docstring do badge diz 15s; hook real usa 60s | **CONFIRMADO** | `useEvoApiAlertsBadge.ts:17` ("15s refetch") vs `hooks.ts:23` `useActiveAlerts(refetchMs = 60_000)` + `staleTime: 60_000` (`:39`) e o comentário `hooks.ts:33` documentando "60s (antes 15s)" | Linha `:23` citada está exata |
| **A8** | Efeito colateral no import; patches não vazam p/ PROD, leitura de localStorage e global vazam | **CONFIRMADO** | `validationLogger.ts:19-24` constructor guardado por `typeof window !== 'undefined'` (**não** por `PROD`) → `loadPersistedEvents()` (`:26-28`, faz `JSON.parse` de localStorage) roda em produção. `setupInterceptors:38-39` tem `if (import.meta.env.PROD) return`. `:147` instancia no módulo; `:149-151` grava `window.__zappValidationLogger` | Testei a hipótese oposta (guarda PROD no constructor) e ela é falsa — o achado está certo |
| **A9** | Clock skew compensation é no-op | **CONFIRMADO** | Todas as 7 ocorrências de `masterClockOffset` em `crossTabDedupe.ts`: decl. `:84`, init `0` `:104`, leitura `:108`, atribuição a partir de msg recebida `:396-398`, emissão **hardcoded `0`** `:655`, reset `0` `:882`. Não existe nenhum ponto de cálculo de desvio → `getNormalizedTime()` (`:107-108`) ≡ `Date.now()` sempre | Enumerei todas as escritas; não há caminho que produza offset ≠ 0 |
| **A10** | Export stubs lançam sempre e há **3 importadores de produção** recebendo exceção garantida | **REFUTADO** | Os 3 importadores citados importam **apenas o tipo**: `queues/SLADashboard.tsx:17`, `reports/ExportButton.tsx:9`, `features/sla/.../SLAHistoryDashboard.tsx:19` → todos `import { ReportData }`. Grep global de `exportToPDF`/`exportToExcel`: **só testes** (`src/__tests__/security-and-performance.test.ts:118,130`, `utils/__tests__/exportReport.test.ts`). `ExportButton.tsx:29` nem chama nada — dispara um `toast` "Exportação Bloqueada". O `exportToCSV` de `crm360TabsConfig.ts:53` é função local homônima, sem relação | Ver §5.1 |
| **A11** | `deduplicateMessages` com chave assimétrica; `undefined` no Set descarta recebidos | **CONFIRMADO** | `chatOptimizations.ts:20-23`: Set montado com `message_id ?? id` (1 chave/item), filtro testa **as duas** chaves. Caso 2 (Set com `undefined` → todo recebido sem `message_id` é descartado) reproduzido logicamente e correto. Caso 1 é correto sob a leitura "id do recebido = id do existente que também possui message_id" | Fraseado do caso 1 é ambíguo: se o `id` do recebido igualar o `message_id` do existente, **dedupica** normalmente. Ver §5.2 |
| **A12** | `src/lib/realtime/` não contém Supabase Realtime | **CONFIRMADO** | Reteste com 10 padrões (§4): 0 `.channel(`, 0 `.on(`, 0 `subscribe(`, 0 `removeChannel`, 0 `RealtimeChannel`, 0 `presence` no diretório. Conteúdo real: dedup cross-tab (BroadcastChannel/localStorage/IndexedDB) + `edgeEvents.ts` (parser de rótulo Mermaid) | — |

---

## 3. Escrutínio de A1 (refactor abandonado) e A2 (constante contraditória)

### 3.1 A1 — tentei derrubar por quatro vias; três falharam, uma qualificou o achado

**Via 1 — "os 4 módulos têm algum importador que o auditor não viu?"**
Rodei grep global (não só `src/`) em `*.ts, *.tsx, *.js, *.json, *.md`, excluindo
`node_modules`, para os quatro nomes. Resultado fora do próprio diretório:

```
graphify-out/GRAPH_REPORT.md, graphify-out/manifest.json, .graphify_labels.json
```

Ou seja: **só artefatos do grafo de conhecimento**, que indexam arquivos por existirem,
não por serem usados. Nenhum `import`. Dentro do diretório, o único acoplamento é
`Types` → importado por `Lock.ts:1`, `Cache.ts:7`, `Transport.ts:9`. Os três consumidores
de `Types` são eles próprios órfãos, então o bloco inteiro é um componente desconectado.
**A alegação de zero importador resiste.**

**Via 2 — "o monólito é mesmo o que roda?"**
Sim, e com precisão maior que a do documento. Importadores de `@/lib/realtime/crossTabDedupe`:

- `src/hooks/useExternalEvolution.ts:23` — `import { dedupedFetch, subscribeDedupe }`
- `src/hooks/useExternalApiManagement.ts:374` — idem
- (+ `src/hooks/__tests__/useExternalEvolution.reconcile.test.ts:42`, que o **mocka**)

Armadilha que verifiquei e descartei: existe um `src/lib/crossTabSendDedupe.ts` (raiz de
`lib`, fora deste escopo) exportando uma função chamada `crossTabDedupe`, usada por
`evolutionSendRetry.ts:19,201`. É **outro módulo**, com outro propósito. Um grep ingênuo
por `crossTabDedupe` mistura os dois e infla a contagem de importadores do monólito —
o documento auditado **não** caiu nessa; separou corretamente.

**Via 3 — "a divergência semântica alegada existe mesmo?"**
Existe, e é maior do que o documento afirma. Comparação campo a campo:

| tipo | monólito | `crossTabDedupeTypes.ts` | divergência |
|---|---|---|---|
| `BroadcastMessage` | `:74-85` — `version`, `sequence`, `masterClockOffset`, `type` inclui `'clock-tick'` | `:37-46` — nenhum dos quatro | confirmada (4 diferenças) |
| `LockPayload` | `:60-65` — `version`, `sequence` | `:30-34` — nenhum | confirmada |
| `ResultPayload` | `:67-72` — `version`, `payloadHash`, `sequence` | `:59-62` — só `value`+`expiresAt` | **não citada pelo documento** — divergência adicional |

O documento subdimensiona aqui, não superdimensiona: há um terceiro tipo divergente que
ele não listou. O risco descrito ("editar o módulo modular e não mudar nada em produção")
é real e maior que o enunciado.

**Via 4 — "a narrativa causal se sustenta?" → aqui o achado precisa de ressalva.**
`git log --follow` retorna **um único commit** (`8e9361c06`, 2026-08-14) para os cinco
arquivos — histórico squashado. Não há cronologia que prove quem veio primeiro. E os
quatro módulos **não declaram intenção alguma**: seus docstrings são placeholders
autogerados (`/** read Lock. */`, `/** L S_ L O C K_ P R E F I X constant. */`), sem
cabeçalho dizendo "substitui X". Portanto:

- **"4 órfãos duplicando semântica divergente do módulo que roda"** → provado.
- **"criados para substituí-lo" / "refactor abandonado pela metade"** → **inferência
  plausível mas NAO_VERIFICAVEL**. Poderia igualmente ser uma extração antiga que o
  monólito ultrapassou. O rótulo importa pouco para a ação (os 4 saem de qualquer forma),
  mas a narrativa não deveria ser apresentada como fato.

**Veredito A1: CONFIRMADO** — severidade ALTA justificada (código morto que se parece com
código vivo é armadilha ativa, e são 297 linhas). Ressalva única: trocar "criados para
substituí-lo" por "duplicam, com semântica defasada, partes do monólito".

### 3.2 A2 — a conclusão do agente irmão está certa; testei por quatro fontes independentes

Não me apoiei no raciocínio dele (nem no do documento). Perguntei: **que evidência, fora
dos comentários, diz qual instância é a produtiva?**

| # | fonte independente | o que diz | sustenta |
|---|---|---|---|
| 1 | Constantes executáveis: `whatsappInstances.ts:41` `DEFAULT_WHATSAPP_INSTANCE='wpp2'` e `:47` `ACTIVE_WHATSAPP_INSTANCE='wpp2'`; `coerceWhatsAppInstance:70` cai em `wpp2` | wpp2 é a ativa | **cabeçalho** |
| 2 | Teste de regressão `lib/constants/__tests__/whatsappInstances.test.ts:62-64`: `expect(ACTIVE_WHATSAPP_INSTANCE).not.toBe('wpp_pink_test')`, com comentário "teste arquivada (`wpp_pink_test`, is_active=false, 0 mensagens)" | wpp_pink_test é a arquivada | **cabeçalho** |
| 3 | `src/integrations/datasource/rpcCatalog.ts:111,124,136,156,339,475`: "O DB tem DEFAULT `'wpp_pink_test'`, mas o TypeScript deve forçar a escolha… NÃO omitir em produção… Passe `ACTIVE_WHATSAPP_INSTANCE` explicitamente" | o default do DB apontar p/ wpp_pink_test é tratado como **armadilha a evitar** | **cabeçalho** |
| 4 | `CLAUDE.md`: partição `wpp2` em `zapp.evolution_messages`; `evo.evolution_messages_wpp2_archive`; `infra/evolution/SETTINGS.md` = "Configs Evolution **wpp2**" | infra de produção é wpp2 | **cabeçalho** |

Quatro fontes independentes, zero contra. **Os comentários inline `:25-28` estão errados** —
conclusão do agente irmão **reproduzida e confirmada**, por caminho diferente do dele.

**Por que ainda assim marco SUPERDIMENSIONADO:** o achado está classificado **ALTA** e
descrito como "exatamente a armadilha que o cabeçalho documenta como já tendo causado
incidente". Mas:

- Nenhum dos 25 importadores lê os comentários — todos consomem as constantes, que estão
  **corretas**. O impacto em runtime hoje é **zero**.
- O erro está protegido por um teste que falha se alguém "corrigir" o código na direção
  errada (fonte 2 acima). Um agente que acreditasse nos inline e trocasse
  `ACTIVE_WHATSAPP_INSTANCE` para `wpp_pink_test` **quebraria o CI antes de chegar à prod**.
- Um defeito só de comentário, com regressão testada, não é par de A1 (297 linhas de código
  morto ativamente enganoso, sem nenhuma guarda).

**Recomendação: A2 → MÉDIA**, com o texto corrigido para registrar que existe um teste
guardando o comportamento. O fato permanece 100% válido e a correção (apagar/inverter os
dois comentários) continua devida.

---

## 4. Reteste da alegação de conformidade Realtime (ausência)

Alegação de ausência é a mais fácil de errar por escolha de padrão, então refiz a varredura
do zero. Primeiro reconstruí o conjunto de arquivos:

```
find src/lib -mindepth 2 -name '*.ts' ! -path '*__tests__*'   → 27
find src/utils -name '*.ts' ! -path '*__tests__*' ! -name '*.test.ts' → 11
find src/types -name '*.ts'                                    →  9
                                                          total = 47  ✓ bate com o escopo declarado
```

Depois rodei **10 padrões**, incluindo os 4 alternativos exigidos pelo briefing
(`.on(`, `subscribe(`, `removeChannel`, `realtime`) e mais 3 que escolhi por conta própria
(`RealtimeChannel`, `presence`, `supabase.`):

| padrão | arquivos com hit | é violação? |
|---|---|---|
| `\.channel\(` | **0** | — |
| `\.on\(` | **0** | — |
| `subscribe\(` | **0** | — (nota: `subscribeDedupe` não casa com `subscribe(`; verifiquei manualmente — é API de pub/sub interno em memória, não Supabase) |
| `removeChannel` | **0** | — |
| `RealtimeChannel` | **0** | — |
| `presence` | **0** | — |
| `postgres_changes` | 2: `lib/realtime/edgeEvents.ts:3`, `types/incomingCall.ts:3` | **NÃO** — ambos em docstring. `edgeEvents.ts` inteiro (26 linhas) é regex sobre string de rótulo Mermaid; `incomingCall.ts` é uma `interface` de 9 campos, sem código executável |
| `realtime` | 6 arquivos | **NÃO** — nomes de tipo/comentários (`evoApiHealth/types.ts`, `evolutionExternal.ts`, `messageStatus.ts`) |
| `broadcast` | 6 arquivos | **NÃO** — todos `BroadcastChannel` (Web API de aba↔aba). Nenhum `channel.send({type:'broadcast'})` do Supabase |
| `supabase\.` | 3: `onboarding/checklistSteps.ts`, `utils/normalizeMediaUrl.ts`, `utils/validationLogger.ts` | **NÃO** — `checklistSteps.ts` faz 6 `.from()` (`:30 profiles`, `:46 whatsapp_connections`, `:66/:106/:126 user_settings`, `:86 quick_replies`) — todas tabelas `zapp` de aplicação, nenhuma `evolution_*`, nenhum `.schema()`, nenhuma subscription |

Confirmei também as duas declarações de schema: `mcp/tools/list-connections.ts:12` e
`list-contacts.ts:12`, ambas `db: { schema: 'zapp' }`. Zero `schema: 'evo'` / `.schema('evo')`.

**Veredito: alegação de zero violações CONFIRMADA.** Não encontrei nenhum padrão que o
documento tenha deixado passar. A ressalva de nomenclatura (A12) e o encaminhamento de
`useIncomingCallListener` para o dono de `src/hooks/` estão corretamente marcados como
fora de escopo / `NAO_VERIFICADO` — não tentei cobri-los.

---

## 5. Achados que eu rebaixaria

### 5.1 Rebaixamentos com consequência

**A10 → REFUTADO (era BAIXA/informativo; a recomendação deve ser deletada, não rebaixada).**
O achado pede "confirmar que os 3 importadores de produção tratam o throw como caminho
esperado". Essa verificação é impossível porque **nenhum dos três chama as funções**:

```
src/components/queues/SLADashboard.tsx:17          import { ReportData } from '@/utils/exportReport';
src/components/reports/ExportButton.tsx:9          import { ReportData } from '@/utils/exportReport';
src/features/sla/components/SLAHistoryDashboard.tsx:19  import { ReportData } from '@/utils/exportReport';
```

Os três importam **só a interface**. `exportToPDF`/`exportToExcel` não aparecem em nenhum
arquivo de produção do repositório — apenas em dois testes. E `ExportButton.tsx:29`, o
candidato óbvio a chamador, resolve o bloqueio por conta própria:

```tsx
onClick={() => toast({ title: '🔒 Exportação Bloqueada', description: 'Proteção de dados ativa', ... })}
```

O status na tabela de arquivos (`exportReport.ts | EM_USO (3)`) é literalmente verdadeiro,
mas induz a leitura errada: as **três funções** que lançam têm **zero chamadores de
produção**; só o tipo `ReportData` é consumido. Texto correto: "tipo `ReportData` em uso
por 3 componentes; as 3 funções de export são código morto guardado por testes". Não há
risco de exceção não tratada em produção — o achado inventava um risco inexistente.

**A3 → SUPERDIMENSIONADO (MÉDIA → BAIXA).** A primeira metade é verdadeira e vale registro:
`SELECTABLE_WHATSAPP_INSTANCES` (`:56-58`) realmente inclui `wpp_pink_test`. A segunda
metade — "selecionar essa opção reproduz o incidente de sidebar zerada descrito em `:13-15`"
— é **falsa**. Segui o único consumidor:

`src/pages/admin-webhook-secret-status/InstanceFilterSelect.tsx` é um `<Select>` de filtro
de uma **página administrativa de status de secret de webhook**, com default "Todas as
instâncias" (`ALL_VALUE`) e que ainda concatena instâncias dinâmicas vindas dos logs
(`:44-51`). Ele não alimenta a Inbox, não alimenta a sidebar, e não escreve em
`ACTIVE_WHATSAPP_INSTANCE`. O incidente citado no cabeçalho foi causado por
`ACTIVE_WHATSAPP_INSTANCE` apontar para `wpp_pink_test` **por default em todo o app** —
situação estruturalmente diferente de um filtro admin opt-in. Redação honesta: "expõe uma
instância arquivada como opção de filtro numa página admin; ruído de UX, sem relação com o
incidente de `:13-15`".

**A2 → severidade ALTA → MÉDIA.** Justificativa completa em §3.2 (fato confirmado por 4
fontes independentes; impacto de runtime zero; regressão coberta por teste).

### 5.2 Defeitos de precisão fora do bloco de Achados

Não mudam veredito nenhum, mas dois são erro de leitura, não arredondamento:

| # | onde | documento diz | medido | natureza |
|---|---|---|---|---|
| 1 | Tabela `evoApiHealth` e §3 "Chamado Por" | `hooks.ts` → **EM_USO (10)** / "10 arquivos (AdminEvoApiHealthPage e sidebar)" | **1** arquivo externo de produção (`pages/admin/AdminEvoApiHealthPage.tsx:32`) + 1 irmão no escopo (`useEvoApiAlertsBadge.ts:2`) + 1 teste | **erro de leitura**: `AdminEvoApiHealthPage.tsx:22-32` importa **10 símbolos** num único `import` — 10 nomes foram contados como 10 arquivos |
| 2 | Cabeçalho de `src/utils/` | 11 não-teste = **1.043 linhas** | **994** | a própria tabela do documento soma 994 (29+211+185+161+151+115+71+37+22+2+10); o total do cabeçalho está errado |
| 3 | Resumo quantitativo | "~5.863 linhas não-teste auditadas" | **5.814** (3.327 + 994 + 1.493) | consequência do item 2 |
| 4 | A2 / tabela | "25 importadores" | 25 arquivos, dos quais **24 produção + 1 teste** (`hooks/__tests__/useExternalEvolution.reconcile.test.ts`) | imprecisão menor |
| 5 | Tabela `src/types/` | `evolutionExternal.ts` EM_USO (13) | 14 (13 prod + 1 teste) | imprecisão menor |

Contagens que **testei e confirmam** o documento (para registro de que não é varredura
seletiva): 47 arquivos no escopo ✓ · 27 arquivos em `lib/*/` ✓ · 3.327 linhas em `lib/*/` ✓ ·
1.493 em `types/` ✓ · `utils/uuid` = 69 importadores ✓ · `types/chat` = 63 prod ✓ ·
`ticketStore` = 5 prod, com as 5 linhas exatas ✓ · `dedupeTelemetry` = 1 importador
(`crossTabDedupe.ts:32`) ✓ · `pttLimits` 3 ✓ · `queryErrors` 5 ✓ · `rlsError` 2 ✓ ·
`checklistSteps` 1 ✓ · `whatsappFileTypes` 6 ✓.

Os 10 órfãos da §5 do documento: **todos os 10 reconfirmados** por grep independente
(incluindo imports relativos, que meu primeiro grep por alias teria perdido —
`chatOptimizations` é importado por `lib/inbox/__tests__/chatOptimizations.test.ts:7` via
`'../chatOptimizations'`, consistente com o veredito "só o próprio teste"). Os vereditos
SEGURO/VERIFICAR/NAO_REMOVER me parecem bem calibrados; em particular `edgeEvents.ts`
como **NAO_REMOVER** está certo — o cabeçalho `:1-7` declara o propósito de teste
explicitamente e há 2 suítes dependendo dele.

---

*Nenhum arquivo além deste foi criado ou modificado. Nenhum acesso a banco. Nenhum comando
de build/teste executado.*
