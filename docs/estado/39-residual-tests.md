# Estado: testes residuais (`__tests__` aninhados de `src/lib`, `src/utils`, 1 de `features`)

> Runtime: NAO_VERIFICADO | Auditado em: 2026-08-16 | Arquivos lidos: 21/21
> LIMITAÇÃO: sem `node_modules` — análise estática, nenhum teste executado.

## 1. Visão Geral

Fechamento da costura deixada pelo fatiamento da onda: os `__tests__` **aninhados
dentro de subdiretórios** de `src/lib` (13 arquivos), os testes de `src/utils`
(7 arquivos) e 1 teste de `src/features/inbox/components`. Total: **21 arquivos,
4.767 linhas**.

Todos os 21 caminhos do escopo foram confirmados por `Glob`/`ls` — nenhum estava em
subpasta diferente da declarada. Nenhum arquivo do escopo consta na lista de
quarentena de `vitest.config.ts` (linhas 21-78), e todos casam com o glob
`src/**/*.{test,spec}.{ts,tsx}` (linha 20). **Os 21 são coletados pelo vitest.**

Resultado do exame de conteúdo:

| Categoria | Qtd | Arquivos |
|---|---|---|
| Reais (importam e exercitam o SUT) | 18 | — |
| **Testes-espelho** (reimplementam a lógica localmente) | **2** | `imageCompression`, `whatsappFileTypes` |
| Real, porém com bloco parcialmente espelho | 1 | `exportReport` (3 de 7 casos) |
| SUT ausente | 0 | — |
| Arquivo sem nenhum `expect` / `it.todo` | 0 | — |
| Não coletados pelo vitest | 0 | — |

O padrão dominante da onda (**teste-espelho**) **se repete aqui**, mas concentrado:
apenas em `src/utils`, e nos dois arquivos justamente cujo SUT é o mais rico em
superfície pública (15 e 4 exports, respectivamente, todos sem cobertura).

Achado adicional não previsto no briefing: **8 casos desligados via `.skip`** em
`evoApiHealth/proxy.test.ts`, incluindo a seção inteira de cache de token de
autenticação — ver §4 e A2.

## 2. Tabela de Suítes

| arquivo | linhas | SUT | importa o SUT? | SUT existe? | tipo | coletado pelo vitest? |
|---|---|---|---|---|---|---|
| `src/lib/onboarding/__tests__/checklistSteps.test.ts` | 259 | `../checklistSteps` | sim (l.33) | sim | real | sim |
| `src/lib/realtime/__tests__/crossTabDedupe.test.ts` | 389 | `../crossTabDedupe` | sim (l.2-10) | sim | real | sim |
| `src/lib/realtime/__tests__/dedupeTelemetry.test.ts` | 370 | `../dedupeTelemetry` | sim (l.2-10) | sim | real | sim |
| `src/lib/evoApiHealth/__tests__/hooks.test.ts` | 290 | `../hooks` | sim (l.38-48) | sim | real | sim |
| `src/lib/evoApiHealth/__tests__/proxy.test.ts` | 516 | `../proxy` (`evoApi`) | sim (l.121) | sim | real, **8 casos skip** | sim (parcial) |
| `src/lib/evoApiHealth/__tests__/useEvoApiAlertsBadge.test.ts` | 178 | `../useEvoApiAlertsBadge` | sim (l.19) | sim | real | sim |
| `src/lib/audio/__tests__/pttLimits.test.ts` | 363 | `../pttLimits` | sim (l.2-8) | sim | real | sim |
| `src/lib/errors/__tests__/rlsError.test.ts` | 241 | `../rlsError` | sim (l.2-6) | sim | real | sim |
| `src/lib/auth/__tests__/roleMapping.test.ts` | 162 | `../roleMapping` | sim (l.2-9) | sim | real | sim |
| `src/lib/schemas/__tests__/supabase.test.ts` | 347 | `../supabase` | sim (l.2-8) | sim | real | sim |
| `src/lib/inbox/__tests__/ticketStore.test.ts` | 496 | `../ticketStore` | sim (dinâmico, l.14) | sim | real | sim |
| `src/lib/mcp/__tests__/tools.test.ts` | 298 | `../tools/{whoami,list-connections,list-contacts}` | sim (l.27-29) | sim (3/3) | real | sim |
| `src/lib/constants/__tests__/whatsappInstances.test.ts` | 218 | `../whatsappInstances` | sim (l.2-10) | sim | real | sim |
| `src/utils/__tests__/exportReport.test.ts` | 99 | `@/utils/exportReport` | sim (dinâmico, l.55+) | sim | real + espelho parcial | sim |
| `src/utils/__tests__/imageCompression.test.ts` | 37 | `../imageCompression` | **NÃO** | sim (4 exports) | **espelho** | sim |
| `src/utils/__tests__/normalizeMediaUrl.test.ts` | 94 | `../normalizeMediaUrl` | sim (l.2) | sim | real | sim |
| `src/utils/__tests__/notificationSounds.test.ts` | 266 | `@/utils/notificationSounds` | sim (l.36-41) | sim | real | sim |
| `src/utils/__tests__/soundConfigs.test.ts` | 133 | `../soundConfigs` | sim (l.2) | sim | real | sim |
| `src/utils/__tests__/uuid.test.ts` | 118 | `../uuid` | sim (l.2) | sim | real | sim |
| `src/utils/__tests__/whatsappFileTypes.test.ts` | 50 | `../whatsappFileTypes` | **NÃO** | sim (15 exports) | **espelho** | sim |
| `src/features/inbox/components/__tests__/TextToAudioButton.auth.test.tsx` | 61 | `../TextToAudioButton` | sim (l.3) | sim | real, **asserção vacua** | sim |

## 3. Testes-espelho (validam cópia local — cobertura negativa)

### 3.1 `src/utils/__tests__/whatsappFileTypes.test.ts` — espelho integral

O arquivo **nunca importa** `src/utils/whatsappFileTypes.ts`. Declara suas próprias
constantes locais (l.5-8) e as testa contra si mesmas:

```ts
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
it('accepts valid image types', () => {
  ALLOWED_IMAGE_TYPES.forEach(type => {
    expect(ALLOWED_IMAGE_TYPES.includes(type)).toBe(true);   // tautologia
  });
});
```

O caso `accepts valid image types` (l.10-14) é uma **tautologia pura**: itera um
array e afirma que cada elemento pertence ao próprio array. Nunca pode falhar.

Enquanto isso o SUT real expõe **15 símbolos**, nenhum coberto — entre eles
`validateFile()`, `getFileCategory()`, `getMaxSizeForCategory()`,
`getAllowedMimeTypes()`, `formatFileSize()`, `getFileExtension()`,
`getFileNameFromUrl()`. O agravante: a tabela real `WHATSAPP_FILE_TYPES` (l.14 do
SUT) pode divergir das constantes copiadas no teste sem que nada acuse — inclusive
o caso `rejects dangerous file types` (l.34-41), que hoje dá a impressão de haver
uma barreira de segurança testada contra executáveis, mas testa apenas um array
literal do próprio arquivo de teste.

### 3.2 `src/utils/__tests__/imageCompression.test.ts` — espelho integral

Mesmo padrão, ainda mais degenerado. Não importa
`src/utils/imageCompression.ts` (4 exports: `compressImage`,
`createImagePreview`, `formatCompressionInfo`, `CompressionOptions`). Os 5 casos
testam apenas aritmética de literais declarados no próprio teste:

```ts
it('validates max file size constants', () => {
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  expect(MAX_FILE_SIZE).toBe(5242880);   // testa a calculadora do JS
});
it('validates compression quality range', () => {
  const quality = 0.8;
  expect(quality).toBeGreaterThan(0);    // literal local
});
```

Nenhum dos 5 casos referencia o SUT. Cobertura efetiva do módulo: **zero**.
`compressImage()` é uma função assíncrona de 130+ linhas totalmente não exercitada.

### 3.3 `src/utils/__tests__/exportReport.test.ts` — espelho parcial (3 de 7)

Os 4 casos dos blocos `exportToExcel`/`exportToCSV` (l.53-76) são **reais e bons**:
importam dinamicamente o SUT e verificam o bloqueio por política LGPD, coerente
com `src/utils/exportReport.ts` (l.19-37), onde as três funções lançam
`BLOCKED_MESSAGE`.

Já o bloco `ReportData structure` (l.78-98) tem 3 casos que só inspecionam o
objeto `mockData` declarado no próprio teste (l.29-46) — `expect(mockData.title)
.toBeTruthy()` etc. São espelho: validam a fixture, não o SUT.

Observação menor: `exportToPDF` é exportado pelo SUT e **não tem nenhum caso**,
embora seja bloqueado igual aos outros dois.

## 4. Placeholders, skips e não-coletados

**Não coletados: nenhum.** Todos os 21 casam com `include: ['src/**/*.{test,spec}.{ts,tsx}']`
e nenhum aparece no bloco `exclude`/quarentena de `vitest.config.ts`.

**`it.todo`: nenhum.** **Arquivos sem `expect`: nenhum.**

**Skips: 8 casos, todos em `src/lib/evoApiHealth/__tests__/proxy.test.ts`**
(de 26 casos totais no arquivo → **~31% da suíte desligada**):

| local | forma | casos | conteúdo |
|---|---|---|---|
| l.185 | `it.skip` | 1 | corpo vazio, só comentário `SUPERSEDED` |
| l.204 | `it.skip` | 1 | **corpo literalmente vazio** `async () => {}` — placeholder |
| l.355-423 | `describe.skip` | 5 | `getAuthHeader() — session token caching` (corpo real e completo) |
| l.498-516 | `describe.skip` | 1 | `call() — request headers` (corpo real e completo) |

Os dois `describe.skip` são o ponto sensível: contêm **código de teste íntegro e
escrito**, não esqueletos. Cobrem exatamente a superfície de autenticação —
uso do Bearer da sessão, cache de token com TTL de 30 s, re-fetch após expiração,
e fallback para a anon key quando não há sessão — além da conferência dos headers
`apikey`/`Authorization`/`x-correlation-id`. Diferente dos `it.skip` (marcados
como superados por mudança de arquitetura), estes **não têm comentário
justificando o desligamento**, o que impede distinguir "quarentena temporária" de
"desligado e esquecido".

## 5. Veredito sobre `whatsappInstances` (qual comentário está errado)

**O teste está do lado do cabeçalho. Os comentários inline (l.25-28 do SUT) são os
errados.**

A contradição em `src/lib/constants/whatsappInstances.ts` é real:

- **Cabeçalho (l.7-11):** `wpp2` = instância **PRODUTIVA** (`is_active=true`,
  12.527 conversas); `wpp_pink_test` = instância de **TESTE**
  (`is_active=false`, `status='archived'`, 0 mensagens).
- **Comentários inline (l.25-28):** afirmam o **inverso** — `wpp2` é
  "Instância legada — dados históricos até Maio 2026" e `wpp_pink_test` é
  "Instância ATIVA atual — dados de Maio 2026 em diante".

Três evidências independentes convergem contra os comentários inline:

1. **O código executável.** `ACTIVE_WHATSAPP_INSTANCE = 'wpp2'` (l.47) e
   `DEFAULT_WHATSAPP_INSTANCE = 'wpp2'` (l.41). Se o inline estivesse certo,
   `ACTIVE` apontaria para `wpp_pink_test`.
2. **O teste (`whatsappInstances.test.ts`).** Afirma `ACTIVE_WHATSAPP_INSTANCE`
   é `'wpp2'` (l.51-53) e, de forma decisiva, codifica o invariante explícito
   `never points to the archived test instance` →
   `expect(ACTIVE_WHATSAPP_INSTANCE).not.toBe('wpp_pink_test')` (l.63-65). O teste
   trata `wpp_pink_test` como **arquivada**, exatamente como o cabeçalho.
3. **O comentário do próprio teste (l.59-62).** Registra a história:
   *"Ate 2026-07-26 este teste exigia ACTIVE !== DEFAULT. A premissa caiu: a unica
   instancia viva no banco e `wpp2`"*, e descreve `wpp_pink_test` como
   *"instancia de teste arquivada (is_active=false, 0 mensagens)"*.

Isso casa com o aviso do cabeçalho (l.13-15): até 2026-07-26
`ACTIVE_WHATSAPP_INSTANCE` de fato apontava para `wpp_pink_test`, o que zerava a
sidebar da Inbox. Os comentários inline são **resíduo daquele estado pré-correção**
— não foram atualizados junto com o valor da constante. São um risco de
manutenção: descrevem `wpp_pink_test` como a instância ativa, convidando um futuro
editor a "corrigir" `ACTIVE_WHATSAPP_INSTANCE` de volta ao bug que derrubou a Inbox.

Correção indicada (fora do escopo deste agente — somente leitura): trocar os
comentários das l.25-28 para refletir `wpp2` = produtiva e `wpp_pink_test` =
teste arquivada.

## 6. Achados

| ID | Caminho:linha | Severidade | Achado |
|---|---|---|---|
| **A1** | `src/utils/__tests__/whatsappFileTypes.test.ts:1-50` | 🔴 Alta | **Teste-espelho integral.** Não importa o SUT; declara constantes locais e as testa contra si mesmas. `accepts valid image types` (l.10-14) é tautologia (`ALLOWED_IMAGE_TYPES.includes(type)` sobre o próprio array). Os 15 exports de `src/utils/whatsappFileTypes.ts` — incluindo `validateFile()` e `getFileCategory()` — ficam com cobertura zero, enquanto a suíte aparenta cobrir validação de upload e bloqueio de executáveis. Cobertura negativa. |
| **A2** | `src/lib/evoApiHealth/__tests__/proxy.test.ts:355-423, 498-516` | 🔴 Alta | **Toda a cobertura de autenticação do gateway `evoApi` está desligada** via dois `describe.skip` com corpo íntegro (6 casos): cache de token com TTL 30 s, re-fetch pós-expiração, fallback para anon key sem sessão, e conferência dos headers `apikey`/`Authorization`/`x-correlation-id`. Sem comentário justificando — impossível distinguir quarentena de esquecimento. Com os 2 `it.skip`, 8 de 26 casos (~31%) do arquivo não rodam. |
| **A3** | `src/features/inbox/components/__tests__/TextToAudioButton.auth.test.tsx:16,50,59` | 🟠 Média | **Asserção vacuamente verdadeira por env var indefinida.** `ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` (l.16), mas `vitest.config.ts` (l.16-19) define apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`; não há `.env` no repo (só `.env.example`). Logo `ANON === undefined` no teste **e** no componente (`TextToAudioButton.tsx:81-82`). Consequência: `expect(init.headers.apikey).toBe(ANON)` (l.50) vira `expect(undefined).toBe(undefined)` — passa independentemente do comportamento real. E o caso do fallback (l.59) `expect(...Authorization).toBe('Bearer undefined')` só passa porque ambos os lados degradam juntos: não prova o fallback para a anon key. A guarda anti-regressão da issue #1000/PR #1002 é, nesses dois pontos, ilusória. |
| **A4** | `src/utils/__tests__/imageCompression.test.ts:1-37` | 🟠 Média | **Teste-espelho integral.** Nenhum dos 5 casos referencia o SUT; testam aritmética de literais locais (`expect(5*1024*1024).toBe(5242880)`). `compressImage()` (função async de ~130 linhas), `createImagePreview()` e `formatCompressionInfo()` ficam sem cobertura alguma. Severidade menor que A1 por ser um módulo de UI, não de validação de segurança. |
| **A5** | `src/lib/constants/whatsappInstances.ts:25-28` | 🟠 Média | **Comentários inline autocontraditórios e factualmente errados** (ver §5): descrevem `wpp2` como "legada" e `wpp_pink_test` como "ATIVA atual", contrariando o cabeçalho (l.7-11), o código (`ACTIVE = 'wpp2'`, l.47) e o teste (l.63-65). São resíduo do estado anterior a 2026-07-26, quando apontar para `wpp_pink_test` zerava a Inbox. Risco de induzir uma regressão que já ocorreu uma vez. O teste está correto e protege contra ela. |
| **A6** | `src/utils/__tests__/exportReport.test.ts:78-98` | 🟡 Baixa | Bloco `ReportData structure` (3 casos) é espelho parcial: valida a fixture `mockData` local, não o SUT. Os outros 4 casos do arquivo são reais e corretos. Adicionalmente, `exportToPDF` — exportado e bloqueado igual a `exportToExcel`/`exportToCSV` — não tem nenhum caso. |
| **A7** | `src/lib/evoApiHealth/__tests__/proxy.test.ts:204` | 🟡 Baixa | Placeholder puro: `it.skip('sends schema: evo_api in the request body', async () => {});` — corpo literalmente vazio, sem comentário. O par em l.185 ao menos documenta `SUPERSEDED`. Ou se escreve o caso, ou se remove a linha. |
