# V3 — Validação adversarial dos achados de teste (35 + 39)

> Validado em: 2026-08-16 | Achados testados: 20/20 | **Nenhum teste executado (sem toolchain)**
> Postura: refutar. Todo veredito abaixo vem de leitura de código-fonte e aritmética manual,
> nunca de execução. Onde afirmo divergência, mostro os dois lados e a conta.
> Escopo lido: `docs/estado/35-lib-tests.md`, `docs/estado/39-residual-tests.md`,
> os arquivos de teste citados, `supabase/functions/_shared/evolution-helpers.ts`,
> `vitest.config.ts`, `package.json`, `deno.json`, `.github/workflows/deno-contract-tests.yml`.

## 1. Placar

| Veredito | Qtd |
|---|---|
| **CONFIRMADO** | 15 |
| **SUPERDIMENSIONADO** | 4 |
| **REFUTADO** | 0 |
| **NAO_VERIFICAVEL** | 1 |

Tentei derrubar os dois documentos e não consegui derrubar nenhum achado por inteiro.
O que encontrei foram **quatro exageros**, sendo um deles de consequência real (35/A1) e três
puramente numéricos. Nenhuma alegação central se mostrou falsa.

Resumo do que mais importa:

- **A aritmética de `webhookStatusPriority` está certa** — refiz a conta e as três asserções
  apontadas realmente divergem da produção (§4).
- **9 de 9 "testes-espelho" alegados se sustentam** como espelho: nenhum importa o SUT,
  nem direto, nem indireto, nem via `vi.mock` (§3).
- **Mas o rótulo "cobertura negativa" cai em 35/A1**: existe um contract test Deno vivo que
  importa o `shouldUpdateStatus` real e cobre exatamente as regras divergentes. A regra de
  negócio **não** está desprotegida — o espelho é lixo obsoleto, não um buraco de cobertura.

## 2. Veredito por achado

| doc | # | afirmação | veredito | evidência verificada | nota |
|---|---|---|---|---|---|
| 35 | cab. | 79 arquivos, 18.573 linhas | **CONFIRMADO** | `ls` = 79 arquivos; `cat \| wc -l` = 18.573 | exato |
| 35 | cab. | 2.177 linhas sem runner | **CONFIRMADO** | 441 + 1.159 + 542 + 35 = 2.177; cada parcela conferida por `wc -l` | aritmética exata |
| 35 | §3 | zero SUT ausente em 84 pares | **CONFIRMADO** | reteste com rede **mais ampla** (108 pares, incluindo `vi.mock` e `import()` dinâmico): 0 ausentes | ver §6 |
| 35 | A1 | `webhookStatusPriority` diverge da produção | **SUPERDIMENSIONADO** | divergência aritmética 100% correta (§4), mas a consequência declarada não se sustenta | ver §5.1 |
| 35 | A2 | `externalProxy` vivo, 5 importadores, suíte comentada | **CONFIRMADO** | os 5 caminhos conferidos um a um; 621+538 = 1.159 linhas; placeholders em `:619-621` e `:536-538` | exato |
| 35 | A3 | 5 espelhos adicionais | **SUPERDIMENSIONADO** | nenhum dos 5 importa o SUT (só `vitest`); `RATE_LIMIT_MAX_EVENTS` sem hit fora de teste | soma real 925 linhas, não 934 |
| 35 | A4 | comentário do `vitest.config.ts` afirma execução inexistente | **CONFIRMADO** | workflow linha 57 = `find supabase/functions`; `paths:` 5-12 idem; sem script `deno` no `package.json`; `deno.json` sem `tasks` | ver §6 |
| 35 | A5 | `debug-dompurify-test.ts` não coletado | **CONFIRMADO** | sufixo `-test.ts` ≠ glob `*.{test,spec}.{ts,tsx}` (`vitest.config.ts:20`); e o arquivo **importa o SUT real** (`sanitizeHtml` de `../sanitize`) | teste bom, invisível |
| 35 | A6 | `healthCheck.test.ts` tautológico | **CONFIRMADO** | `assertExists(true)` l.8; `assertEquals(true,true)` l.13; `expectedTtl` vs `5000` l.18-19; `formatUptime` reimplementado l.35+; zero import do SUT | exato |
| 35 | A7 | asserções fracas em resiliência | **CONFIRMADO** | `rejects.toBeDefined()` exatamente em `whatsappConnectionsCache.test.ts:291` e `:303` | exato |
| 35 | §4.4 | `contactsDB.test.ts` roda em algum lugar fora do repo? | **NAO_VERIFICAVEL** | excluído em `vitest.config.ts:77` sob `// NEEDS-ENV`; nenhum workflow no repo o alcança | o doc já se marca assim — correto |
| 39 | cab. | 21 arquivos, 4.767 linhas | **SUPERDIMENSIONADO** | os 21 caminhos existem, mas somam **4.984** linhas | a própria tabela do doc soma 4.985 — o headline contradiz o corpo |
| 39 | §1 | os 21 são coletados pelo vitest | **CONFIRMADO** | todos casam o glob l.20 e nenhum consta no `exclude` l.21-78 | exato |
| 39 | A1 | `whatsappFileTypes` espelho integral | **CONFIRMADO** | zero import do SUT; SUT tem **exatamente 15** `export`; tautologia em l.10-14 confirmada | exato |
| 39 | A2 | 8/26 casos skip (~31%), auth do gateway desligada | **SUPERDIMENSIONADO** | os 8 skips e o conteúdo desligado estão exatos; o **denominador** não | ver §5.2 |
| 39 | A3 | asserção vácua por env indefinida | **CONFIRMADO** | `vitest.config.ts:16-19` define só `VITE_SUPABASE_URL`/`_ANON_KEY`; só existe `.env.example`; logo `ANON === undefined` nos dois lados | doc já escopa bem — ver §5.3 |
| 39 | A4 | `imageCompression` espelho integral | **CONFIRMADO** | zero referência ao SUT nos 5 casos; SUT tem **exatamente 4** exports | exato |
| 39 | A5 | comentários inline de `whatsappInstances` errados | **CONFIRMADO** | cabeçalho l.7-11, inline l.25/l.27, `DEFAULT` l.41, `ACTIVE` l.47, teste l.51-53 e l.63-65, comentário do teste l.59-62 — **todas as referências de linha batem** | achado mais bem documentado dos dois docs |
| 39 | A6 | `exportReport` espelho parcial (3 de 7) | **CONFIRMADO** | 4 casos importam o SUT dinamicamente e checam o bloqueio; 3 casos de `ReportData structure` só inspecionam a fixture local; `exportToPDF` exportado e sem caso | exato |
| 39 | A7 | placeholder vazio em `proxy.test.ts:204` | **CONFIRMADO** | `it.skip('sends schema: evo_api in the request body', async () => {});` — corpo literalmente vazio | exato |

## 3. Reteste dos "testes-espelho" (um a um)

A alegação de espelho aparece 9 vezes entre os dois documentos. Testei cada uma procurando as
três saídas que salvariam o teste: **import indireto**, **`vi.mock` que ainda carrega o real**,
e **helper compartilhado**. Nenhuma se aplicou a nenhum arquivo.

| # | arquivo | importa o SUT? | como verifiquei | veredito |
|---|---|---|---|---|
| 1 | `src/lib/__tests__/webhookStatusPriority.test.ts` | **não** | única linha de import é `from 'vitest'`; `STATUS_PRIORITY` e `shouldUpdateStatus` declarados localmente em l.5-22 | espelho **confirmado** |
| 2 | `src/lib/__tests__/rateLimiter.test.ts` | **não** | idem — só `vitest` | espelho **confirmado** |
| 3 | `src/lib/__tests__/phoneNormalization.test.ts` | **não** | idem | espelho **confirmado** |
| 4 | `src/lib/__tests__/groupsAutoSync.test.ts` | **não** | idem | espelho **confirmado** |
| 5 | `src/lib/__tests__/rlsGroupAccess.test.ts` | **não** | idem | espelho **confirmado** |
| 6 | `src/lib/__tests__/centenarias.simulacao.test.ts` | **não** | importa `vitest` (incl. `vi`), mas nenhum módulo local | espelho **confirmado** |
| 7 | `src/utils/__tests__/whatsappFileTypes.test.ts` | **não** | arquivo lido inteiro (50 linhas): único import é `vitest` | espelho **confirmado** |
| 8 | `src/utils/__tests__/imageCompression.test.ts` | **não** | arquivo lido inteiro (37 linhas): único import é `vitest` | espelho **confirmado** |
| 9 | `src/utils/__tests__/exportReport.test.ts` (parcial) | **sim, nos 4 casos reais** | `await import('@/utils/exportReport')` presente nos blocos `exportToExcel`/`exportToCSV`; ausente no bloco `ReportData structure` | espelho **parcial confirmado** |

**Placar dos espelhos: 9/9 se sustentam.** A alegação mais repetida da auditoria é sólida.

Dois reforços que encontrei e que os documentos não usaram:

- `rateLimiter.test.ts`: `grep -rn RATE_LIMIT_MAX_EVENTS src supabase` **não retorna nada fora de
  testes**. Confirma a suspeita do doc 35/A3 de que a lógica espelhada não existe mais com esse
  nome — segue **NAO_VERIFICAVEL** se foi renomeada ou removida.
- `whatsappFileTypes`: além da tautologia já apontada, o caso `rejects dangerous file types`
  (l.34-41) monta `allAllowed` a partir dos **quatro arrays locais** do próprio teste. Ou seja,
  a "barreira contra executáveis" nunca toca `WHATSAPP_FILE_TYPES` nem `validateFile()`.

## 4. Recálculo de `webhookStatusPriority` (a aritmética)

Fonte de produção: `supabase/functions/_shared/evolution-helpers.ts:320-334` (linhas conferidas).

```
PRODUÇÃO  (evolution-helpers.ts:321)
  sending:0  sent:1  delivered:2  read:3  played:4  failed:-1  deleted:99  received:1

  shouldUpdateStatus(cur, new):
    se !cur                → true
    curP = P[cur] ?? 0
    se new === 'deleted'   → true
    se new === 'failed'    → curP < P['delivered']   // = curP < 2      (l.332)
    newP = P[new] ?? 0
    → newP > curP                                                       (l.334)

TESTE     (webhookStatusPriority.test.ts:5-22)
  ...  read:3  played:3  ...                          // played DIFERE  (l.10)
  se new === 'deleted' || new === 'failed' → true     // failed INCOND. (l.18)
```

Duas divergências de **regra**; percorri as 29 asserções do arquivo e elas produzem **três**
asserções divergentes:

| linha | chamada | teste afirma | conta da produção | produção dá | diverge? |
|---|---|---|---|---|---|
| :102 | `('sending','failed')` | `true` | `curP=0`; `0 < 2` | **true** | não |
| :103 | `('sent','failed')` | `true` | `curP=1`; `1 < 2` | **true** | não |
| **:104** | `('delivered','failed')` | `true` | `curP=2`; `2 < 2` | **false** | **SIM** |
| **:105** | `('read','failed')` | `true` | `curP=3`; `3 < 2` | **false** | **SIM** |
| :109 | `('delivered','played')` | `true` | `newP=4`, `curP=2`; `4 > 2` | **true** | não |
| **:110** | `('read','played')` | `false` | `newP=4`, `curP=3`; `4 > 3` | **true** | **SIM** |
| :111 | `('played','read')` | `false` | `newP=3`, `curP=4`; `3 > 4` | **false** | não — coincidem por acaso |

As outras 22 asserções (null-current, progressão, prevenção de retrocesso, `deleted`,
`received`, status desconhecido) coincidem nos dois lados.

**Veredito da aritmética: CONFIRMADO.** Os dois casos citados no briefing
(`('delivered','failed')` e `('read','played')`) divergem, e o doc acerta ao listar também
`('read','failed')`. Note que `:111` é um falso-negativo interessante: `played` vale 3 no teste
e 4 na produção, mas ambos os lados retornam `false` — a divergência de tabela não se manifesta
nessa asserção.

## 5. Achados que eu rebaixaria

### 5.1 — 35/A1 perde o rótulo "cobertura negativa" e o de "maior lacuna"

Esta é a **correção de consequência mais importante deste relatório**.

O doc 35 conclui que o espelho "sinaliza saúde sobre uma regra de negócio que foi revertida" e
que a regra ficou sem proteção. Fui procurar quem mais toca `shouldUpdateStatus` e encontrei:

`supabase/functions/_shared/__tests__/evolution-helpers-wiring.test.ts` — **importa os símbolos
reais** (`shouldUpdateStatus`, `STATUS_PRIORITY`, l.41-42) e cobre exatamente as regras
divergentes, com a conta explícita nas mensagens de asserção:

- l.220-227 — `"failed" only allowed before delivered (priority < 2)`, incluindo
  `assertFalse(shouldUpdateStatus('delivered','failed'))` e `assertFalse(...('read','failed'))`.
- l.249-255 — escada de prioridade, incluindo `assert(shouldUpdateStatus('read','played'))`
  (`4 > 3 = true`) e `assertFalse(...('played','read'))`.
- l.269-280 — consistência da tabela: `read < played`, e `delivered === 2` fixado como o
  limiar do `failed`.

E esse arquivo **é coletado**: mora sob `supabase/functions/`, casa o
`find supabase/functions -name '*.test.ts'` do workflow (linha 57) e o `paths:` do gatilho
(linhas 5-12), com varredura diária adicional via `schedule` (linha 17).

Consequência: as três divergências são reais, mas descrevem um **espelho obsoleto que ninguém
consulta**, não um flanco aberto. Um `DROP` da regra em produção **seria** pego pelo contract
test. Eu rebaixaria 35/A1 de 🔴 Crítico para 🟡 Médio, e reescreveria a ação como "apagar o
arquivo" em vez de "importar o SUT" — a cobertura que ele fingiria dar já existe, melhor feita,
em `evolution-helpers-wiring.test.ts`. Mantê-lo só duplicaria a regra num terceiro lugar.

Por tabela, cai também o item 2 da §5 do doc 35 ("934 linhas que rodam verdes sem tocar em
`supabase/functions/`"): a soma real é **925**, e pelo menos uma das seis tem a regra coberta
em outro lugar.

### 5.2 — 39/A2: o denominador de 31% está inflado

Os 8 casos desligados estão corretos, e o **conteúdo** do que está desligado está descrito com
precisão (cache de token TTL 30 s, re-fetch, fallback anon, headers). Não mexo nisso.

O problema é o "de 26 casos totais". Esse 26 conta **declarações** `it`, e uma delas não é uma
declaração só: `proxy.test.ts:213` está dentro de `for (const errMsg of transientErrors)` com
**4 elementos** (l.210-212). Em casos de runtime:

```
declarações it        = 24 (plain) + 2 (it.skip)             = 26
casos em runtime      = 24 + 3 (extras do laço) + 2          = 29
desligados            = 2 (it.skip) + 5 (describe.skip l.355) + 1 (describe.skip l.498) = 8

8 / 26 = 30,8%   (contando declarações — o que o doc fez)
8 / 29 = 27,6%   (contando casos que o runner de fato enumeraria)
```

É uma imprecisão de definição, não um erro factual — mas "~31% da suíte desligada" é a frase
que vai ser citada, então eu escreveria "8 casos, ~28% da suíte". A severidade 🔴 Alta se
mantém: a superfície desligada é autenticação de gateway, e os dois `describe.skip` de fato não
têm comentário de justificativa (verifiquei l.353-357 e l.496-500).

### 5.3 — 39/A3: correto, mas quase generoso demais consigo mesmo

O doc está certo e, o que é raro, **se autolimita corretamente** ao dizer "nesses dois pontos".
Registro o contrapeso para quem for ler só o resumo: a asserção principal do arquivo —
`expect(init.headers.Authorization).toBe('Bearer tok-user-123')` (l.47) — é **real e forte**, e
`.not.toBe('Bearer ${ANON}')` (l.49) também tem efeito quando `ANON === undefined`. O núcleo da
guarda da issue #1000 (mandar o token da sessão, não a anon key) **está protegido**. O que é
ilusório são só a checagem do `apikey` (l.50) e o caso de fallback (l.59). Manteria 🟠 Média.

### 5.4 — headline de linhas do doc 39

`4.767` no §1 contra `4.984` reais (a própria tabela do §2 soma 4.985). Não muda nenhuma
conclusão; corrigir o número.

## 6. Notas de método (o que reforcei, o que não consegui fechar)

**Onde fui mais duro que o doc 35 e ele resistiu — §3 "zero SUT ausente".**
O doc verificou 84 pares por import `../` e `@/lib/`. Refiz com rede mais larga sobre os 79
arquivos, incluindo também `vi.mock(...)` e `await import(...)`: **108 pares, 0 ausentes**.
Depois ataquei a ressalva que o próprio doc levanta (checagem por módulo, não por símbolo) numa
amostra de 10 pares densos — `jid`, `phoneUtils`, `retry`, `sanitize`, `whatsappAdapter`,
`scanResponse`, `featureFlags`, `safeStorage`, `eventBus`, `idempotency` — totalizando **71
símbolos nomeados**: todos presentes no SUT correspondente. A ressalva continua tecnicamente
aberta (só `tsc` fecharia), mas está bem mais estreita do que o doc admite.

**Onde confirmei a alegação #4 do briefing (441 linhas sem runner).** Comando de coleta exato,
`.github/workflows/deno-contract-tests.yml:57`:

```sh
TEST_FILES=$(find supabase/functions -name '*.test.ts' -type f 2>/dev/null || true)
```

`src/lib/` está fora desse `find`. Os `paths:` (l.5-8 push, l.10-12 PR) listam apenas
`supabase/functions/**`, `deno.json` e o próprio workflow. `package.json` não tem script algum
com `deno test` (o único hit de "deno" é `clean-deno-shadow.sh` no `prebuild`). `deno.json` tem
apenas `nodeModulesDir` e `imports` — **nenhum `tasks`**. Os 4 arquivos somam exatamente
`134 + 88 + 49 + 170 = 441` linhas e todos usam `Deno.test` + `deno.land/std@0.224.0`.
Alegação **CONFIRMADA em todos os componentes**.

**Onde tentei salvar o `externalProxy` e não deu.** Procurei cobertura transitiva: o único
outro teste que menciona o módulo é
`src/features/inbox/hooks/__tests__/useFallbackContact.test.ts`, cujo SUT
(`useFallbackContact.ts:5`) de fato importa `queryExternalProxy`. Mas o teste mocka
`@/integrations/supabase/client` e faz `maybeSingle` resolver com dado válido, enquanto a
chamada ao proxy (`useFallbackContact.ts:108`) está atrás de
`if (!localResult && useExternalDb && ref.kind === 'jid')`. Com `localResult` preenchido, o ramo
não é alcançado. O módulo é **carregado**, não **exercitado** — 35/A2 se mantém.

**O que permanece NAO_VERIFICAVEL:** se `contactsDB.test.ts` roda em algum pipeline externo ao
repo (o "script de integração" citado no comentário do `vitest.config.ts:76` não existe aqui),
e se `RATE_LIMIT_MAX_EVENTS` foi renomeado ou deletado. Ambos exigiriam acesso fora do
repositório, que não tenho.
