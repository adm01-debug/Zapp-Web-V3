# PROMPT — Etapa 2: ligar a rede de segurança do CI

> Cole o conteúdo abaixo num chat novo. Este arquivo existe para não depender do histórico de conversa.
> Gerado em 2026-08-02, ao fim da Etapa 1 (commit `b9b2addd9`).

---

## Missão

Executar a **Etapa 2** do `docs/audits/PLANO_CORRECAO_20_ETAPAS.md`: fazer os gates de CI reprovarem de verdade. São **8 achados**: F1-10, F1-11, F6-26, F10-02, F10-04, F10-05, F10-06, F10-09.

É a **última etapa antes de tocar produção**. As 18 seguintes vão mexer em ~200 pontos do sistema; sem gate funcionando, cada correção pode introduzir regressão invisível.

## Leia primeiro, nesta ordem

Via `CLAUDE CODE - VPS - MCP` (`code_read_file`, caminhos relativos a `/workspace`), repo `repos/zapp-web-v3`:

1. `docs/audits/PLANO_CORRECAO_20_ETAPAS.md` — **Parte II** (regras duras do ambiente + os 6 procedimentos de rollback canônicos) e **Parte III → Etapa 2**. A Etapa 1 está encerrada; não reabrir.
2. Os corpos dos 8 achados em `docs/audits/PLANO_IMPLEMENTACAO_100.md`. Cada achado tem os campos `Sev:`, `Depende de:`, `Raiz de:` e `Rollback:` gravados na Etapa 1 — **use-os para ordenar**.
3. `docs/audits/REVISAO_BACKLOG_172.md` — só se precisar do veredito de algum achado específico. Os 172 dos Blocos 1-8 foram revisados; F9-*/F10-* já vinham revisados da origem.

Não repito aqui a metodologia desses documentos.

## Estado do backlog (contexto, não escopo)

Etapa 1 concluída em 2026-08-02, itens 1 a 5:

| Item | Resultado |
|---|---|
| 1-2 revalidação | 172/172 revisados · 121 ✅ · 17 ⚠️ · 11 🔄 · 21 📝 · 2 ❓ · taxa de defeito 28/172 = 16,3% |
| 3 severidade | campo `Sev:` nos 200 — SEC 28 · QUEBRADO 46 · RISCO 43 · DEGRADADO 34 · HIGIENE 38 · obsoletos 11 |
| 4 dependências | `Depende de:` em 34 · `Raiz de:` em 15 |
| 5 rollback | `Rollback:` em 93 (6 procedimentos: R-POL, R-FN, R-VIEW, R-CRON, R-DDL, R-CODE) |

Últimos commits: `ddc49f30f` (F7) → `b9b2addd9` (itens 3-5). Branch `main` sincronizada.

## Escopo exato e ordem interna

A Etapa 1 já resolveu a ordem — **respeite**:

| Ordem | Achado | Sev | Nota |
|---|---|---|---|
| 1 | **F1-10** | `QUEBRADO` | raiz de F10-06 |
| 2 | **F10-06** | `QUEBRADO` | depende de F1-10 |
| 3 | **F10-09** | `HIGIENE` | raiz de F10-02 |
| 4 | **F10-02** | `HIGIENE` | depende de F10-09 |
| 5 | F1-11 | `HIGIENE` | ratchet do lint; só depois que o lint reprovar |
| 6 | F10-05 | `HIGIENE` | a11y scope |
| 7 | F10-04 | `HIGIENE` | storybook addon-a11y |
| 8 | F6-26 | `HIGIENE` | testes do módulo connections — o maior em esforço |

**Fora de escopo:** qualquer outro achado. Se encontrar algo alarmante, registre como achado novo no fim do relatório e siga.

## Inventário já levantado — não regrepar

### `package.json` (scripts relevantes)

```
"lint": "eslint . --max-warnings 999 || true; bun run scripts/check-design-system.ts --ci || true",
"typecheck": "bun run types:check && tsc --noEmit -p tsconfig.app.json",
"check": "bun run check:schema && bun run check:fnsync && bun run check:febesync && bun run check:deadcode && bun run check:datalayer && bun run typecheck && bun run lint && bun run build",
"verify": "bun run check",
"prebuild": "node scripts/check-deploy-secrets.mjs && bun run scripts/generate-component-registry.ts",
"test:e2e": "playwright test",
"test:e2e:reactions": "playwright test --config=playwright.e2e.config.ts e2e/whatsapp-reactions-realtime.spec.ts",
"test:a11y": "playwright test --config=playwright.a11y.config.ts",
"perf:budget": "node scripts/check-performance-budget.mjs",
"perf:budget:baseline": "node scripts/check-performance-budget.mjs --write-baseline",
"test:fuzz": "bun run scripts/fuzz-edge-functions.ts",
"test:stress": "bun run scripts/stress-test.ts",
"ds:check": "bun run scripts/check-design-system.ts --ci",
"build-storybook": "storybook build",
```

### Configs Playwright — são **4** arquivos, não 3

| Arquivo | `testDir` | Specs |
|---|---|---:|
| `playwright.config.ts` (default, usado por `test:e2e`) | `./src/tests/e2e` | **13** |
| `playwright.e2e.config.ts` | `./e2e` | **61** |
| `playwright.a11y.config.ts` | `./e2e` + `testMatch` de 2 arquivos | 2 |
| `playwright.e2e.config.fixed.ts` | `./e2e` | duplicata órfã — **é o achado F1-06** |

Distribuição real de specs no repo: `./e2e` 61 · `./src/tests/e2e` 13 · `./tests/e2e` 8 · `./tests/e2e/fuzz` 2 · `./tests` 2.

### `eslint.config.js`

Flat config. Plugins carregados: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-storybook`. **`eslint-plugin-tailwindcss` é importado mas as regras foram removidas** ("due to environment constraints") — import morto. Já existem guards valiosos: `no-restricted-imports` de domínio, INBOX READ CONTRACT e `no-restricted-syntax` anti-regressão E20 (hardcode `'wpp2'`, canal Realtime estático).

## Três descobertas que mudam o desenho dos achados

**1. `bun` não existe no container — e metade dos scripts o invoca.**
`lint`, `typecheck`, `check`, `verify`, `prebuild`, `ds:*`, `test:fuzz`, `test:stress`, `check:domain`, `check:barrels`, `report:coverage`, `regen:trilha` chamam `bun run`. Isso significa que **`npm run lint` e `npm run typecheck` não rodam localmente no container hoje** — o `|| true` do lint mascara isso. Ao remover o `|| true`, o script passa a **falhar sempre** por causa do `bun`, não por causa de erro de lint.

Consequência prática: F1-10 não é "apagar duas palavras". É (a) remover os dois `|| true`, **e** (b) trocar `bun run` por `npx tsx` ou `node` no comando do design-system. Verifique se `npx tsx` funciona no container antes de escolher.

**Pergunta em aberto que muda tudo:** o CI do GitHub instala `bun`? Se sim, os scripts funcionam lá e o problema é só local. Se não, metade dos gates já falha silenciosamente. **Resolva isso na primeira chamada** — ver recon abaixo.

**2. `playwright.e2e.config.fixed.ts` ainda existe.** É o F1-06 (Tema 1, `Sev: HIGIENE`, `Rollback: R-CODE`), fora do escopo da Etapa 2 — mas é a quarta config e vai confundir qualquer trabalho em F10-09. Decida: ou deleta junto (registrando que consumiu F1-06 fora de ordem), ou documenta a existência dele na correção de F10-09. Não deixe implícito.

**3. Existe um quarto diretório de testes.** F10-09 fala em 3 configs; os specs estão espalhados por 4 diretórios, incluindo `tests/e2e` (8 specs) e `tests/e2e/fuzz` (2), que **nenhuma das configs aponta**. O achado subestima o escopo — pode virar `⚠️ REFERÊNCIA` se a Ação como escrita não cobrir esses 10 specs.

## Recon que falta — faça primeiro, numa chamada só

Não levantei os workflows (limite de contexto da sessão anterior). Comece por aqui:

```bash
cd repos/zapp-web-v3
ls -1 .github/workflows/
grep -n "bun\|setup-bun\|oven-sh" .github/workflows/*.yml | head -20
grep -n "continue-on-error" .github/workflows/*.yml
grep -n "npm run lint\|run: npm run test:e2e\|perf:budget\|test:a11y\|storybook" .github/workflows/*.yml
grep -n "SPECS=" .github/workflows/*.yml | head
sed -n '130,150p' .github/workflows/quality-gate.yml
cat .storybook/main.ts
```

Isso responde: se o CI tem bun; quantos `continue-on-error` existem além do de performance (o achado cita `test:fuzz` como segundo); como os 4 workflows `e2e-*-vps` selecionam specs; e o estado real do Storybook.

## Ordem de execução proposta

**Bloco A — gates que mentem (F1-10 + F10-06).** O núcleo da etapa. Corrigir `lint` (dois `|| true` + `bun`), regravar o baseline de performance com `npm run perf:budget:baseline` **antes** de armar o gate, remover o `continue-on-error` do Performance Budget Gate. Avaliar também o `continue-on-error` do `test:fuzz` — o próprio F10-06 aponta que são dois gates cosméticos no mesmo arquivo.

**Bloco B — cobertura que não roda (F10-09 + F10-02).** Renomear scripts para revelar o alvo (`test:e2e:boot` vs `test:e2e:full`), fazer os jobs "E2E Tests" chamarem `--config` explícito, trocar as listas `SPECS` hardcoded por seleção via `--grep @tag`. Decidir o destino de `tests/e2e` e do `.fixed`.

**Bloco C — ratchet e a11y (F1-11 + F10-05 + F10-04).** Baixar `--max-warnings` do patamar honesto medido (não de 999 direto para 0), ampliar o `testMatch` de a11y para `**/*-accessibility.spec.ts`, registrar `addon-a11y` e `addon-docs` no `.storybook/main.ts`.

**Bloco D — testes de connections (F6-26).** Escopo real são **52 arquivos**, não ~30. É o maior item da etapa e o único que exige escrever código de teste novo. **Se o contexto apertar, pare aqui e registre** — não comece F6-26 pela metade.

## Regras duras do ambiente

- `python3` **não existe**. Use `perl`, `awk`, `sed`. Em script perl que manipule os `.md`, **não use camadas `:encoding(UTF-8)`** — trabalhe em bytes, senão os literais acentuados não casam (esse erro já custou uma rodada). E cuidado com `@` em string de aspas duplas do perl: `@technical` interpola e quebra a compilação.
- Husky `pre-commit` chama `bun`. Procedimento: `mv .husky/pre-commit .husky/pre-commit.disabled_temp` → commit → `mv` de volta. **Sempre restaurar.**
- **Proibido:** `git push --force`, `git reset --hard`, `rebase -i`. Há histórico de perda de 30k commits em outro repo.
- Se `git push` falhar com `Invalid username or token`, **pare e peça** — não invente credencial. Antes disso, confira `git config --global --list | grep -i insteadof` (deve vir vazio).
- `grep -r` global com `head` **trunca e produz falso "0 hits"**. Faça greps por arquivo.
- Ignore números de linha citados nos achados — localize por símbolo. O `PLANO_IMPLEMENTACAO_100.md` cresceu com as notas de revisão e os campos da Etapa 1.

## Definição de pronto

Da Parte II do plano, mais o específico desta etapa:

1. **Um PR com erro deliberado de lint reprova.** É o Aceite declarado da Etapa 2 — teste isso de verdade, não presuma.
2. Cada um dos 8 achados tem seu **Aceite verificado com comando real** e a saída registrada. Vários já vêm com o comando pronto (ex.: `grep -c "addon-a11y" .storybook/main.ts` deve retornar 1).
3. Achado que se revelar obsoleto ou com referência errada: marcar no `PLANO_IMPLEMENTACAO_100.md` no padrão da Etapa 1 (`~~OBSOLETO~~` no título + linha `- **Revalidado em 2026-XX-XX:**`), **nunca deletar nem renumerar**.
4. Seção da Etapa 2 preenchida em `docs/audits/RELATORIO_CORRECAO.md`.
5. Marcar a Etapa 2 como concluída na Parte III.

**Risco declarado no plano:** médio. Ligar o gate **vai expor falhas pré-existentes**. Quando acontecer, registre como achado novo — **não desligue o gate de novo**. Essa é a regra que dá sentido à etapa inteira.

## Integridade antes do commit

```bash
grep -c "^### F" docs/audits/PLANO_IMPLEMENTACAO_100.md      # 200
grep -c "^- \*\*Sev:\*\*" docs/audits/PLANO_IMPLEMENTACAO_100.md  # 200
```
E por bloco: `F1:14 F2:13 F3:12 F4:24 F5:30 F6:30 F7:32 F8:17`.

Commit: `fix(ci): E02 — <resumo> (<achados>)`.

## O que NÃO fazer

- Não reabrir a Etapa 1 nem os vereditos dos 172.
- Não tocar em banco. Esta etapa é 100% repositório — **nenhum dos 8 achados tem campo `Rollback:` de banco**; os que têm são `R-CODE` (git revert basta).
- Não desligar gate que passou a reprovar.
- Não começar F6-26 sem ter fechado A, B e C.
- Não narrar cada passo. Meça em lote, registre, siga.
