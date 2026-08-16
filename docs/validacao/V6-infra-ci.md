# V6 — Validação adversarial de 38-infra-ci-scripts.md

> Validado em: 2026-08-16 | Achados testados: 10/15 | CI não executado
> Postura: refutar. Nenhum acesso a banco. Nenhum workflow foi disparado — não se afirma
> aqui que qualquer gate passa ou falha, apenas o que está declarado nos arquivos.
> Branch: `claude/validar-levantamento-sistema-uxonxc` (HEAD `aca8bec9d`).

---

## 1. Placar

| veredito | qtd | achados |
|---|---|---|
| CONFIRMADO | 5 | A3, A4a, A4b (pré-verificados pelo orquestrador), A6, A5 |
| CONFIRMADO com ressalva | 1 | "83% de `scripts/` é um dump" (números com deriva de ~0,01%) |
| SUPERDIMENSIONADO | 1 | **A2** (fatos estruturais certos, consequência 🔴 não sustentada) |
| REFUTADO | 1 | **"44 workflows"** — são **45** `.yml` + 1 `.md` |
| SUBDIMENSIONADO | 1 | A13 / cobertura de `scripts/` (2 arquivos fora do inventário) |
| NAO_VERIFICAVEL | 1 | efeito real de qualquer required check (exige API do GitHub) |
| Não reaberto | 1 | A1 (rebaixado por correção do orquestrador) |

Amostra de 8 "órfãos" reauditada: **0 de 8 têm chamador executável.**

---

## 2. Veredito por achado

| # | afirmação | veredito | evidência verificada (caminho:linha) | nota |
|---|---|---|---|---|
| **A2** | `security-invoker-gate.yml` é required, só dispara em 3 paths, logo PR fora deles trava em "Waiting for status" | **SUPERDIMENSIONADO** | `.github/workflows/security-invoker-gate.yml:3-8` (paths), `:20-22` (job único, `name: Verify security_invoker on all views`), 181 ln sem 2º job; `branch-protection-sentinel.yml:152`; **`infra/github/branch-protection-main.md:5-13`** | Os três fatos estruturais que testei **se confirmam**: (a) o `paths:` existe; (b) o nome do job consta do `EXPECTED_CONTEXTS`; (c) **não há `if: always()` nem job de fallback** — o workflow tem exatamente 1 job e nenhuma condicional, então o contexto realmente não é reportado. Mas a **consequência** ("merge bloqueado para sempre", 🔴 Crítica) depende de o contexto estar de fato configurado na proteção de `main` — e a única evidência in-repo sobre o estado real diz o oposto: `enforcement_level:"off"`, `"contexts": []`, com o checklist de ativação **todo desmarcado**. `EXPECTED_CONTEXTS` é uma lista de *desejo* do sentinel, não a configuração vigente. Rebaixar para 🟠 e reescrever como risco condicional ("se/quando os required checks forem ativados"). |
| A2-sub | "é o único dos 10 required com filtro de path" | **CONFIRMADO** | blocos `on:` dos 10 workflows da seção 2.1 | Nenhum outro dos 10 tem `paths:` em `pull_request`. Ressalva do outro lado: o doc **subestima** a classe — 5 dos 10 (`edge-auth-smoke`, `edge-drift-check`, `migration-uniqueness`, `codeql`, `security-invoker-gate`) têm `branches:[main]`, logo também não reportam contexto em PR para `develop`. Mesmo mecanismo, não mencionado. |
| **A6** | `check-column-map.mjs` e `decouple/phys-refs-gate.mjs` são anunciados como bloqueio ativo e nenhum CI os executa | **CONFIRMADO** | `src/integrations/supabase/README.md:20,30`; `src/integrations/supabase/columnMap.ts:11`; `scripts/decouple/phys-refs-gate.mjs:3,17` | Retestei a ausência com `rg` sobre **todo o repo** (`--hidden`, incl. `.github/`, `.husky/`, `package.json`, `Dockerfile`, `infra/`, `scripts/`, `docs/`). `check-column-map`: 4 ocorrências fora de docs/grafo — todas o próprio arquivo, o `README.md` e o `columnMap.ts`; **zero** invocações. `phys-refs-gate`: 4 ocorrências, **todas dentro do próprio script** (cabeçalho de uso). Confirmado também contra a lista completa de scripts invocados por workflow (`rg -o "scripts/[...]" .github/workflows/` → 39 caminhos, nenhum dos dois) e contra os 55 scripts de `package.json` + o único hook `.husky/pre-commit` (que roda apenas `lint-staged` e `check-schema-usage.mjs`). Achado sobrevive integralmente. |
| **A5** | sentinel enumera **10** contextos (não 11) e o job é fail-open sem `BRANCH_PROT_PAT` | **CONFIRMADO** | `branch-protection-sentinel.yml:152` (array com 10 itens), `:61-62` (`BRANCH_PROT_PAT \|\| github.token`), **`:75-84`** (403/401 sem PAT → `::warning` + `exit 0`) | 10 contextos contados um a um. Fail-open literal: `"Verificacao pulada (sem token admin) — isto NAO e uma falha"` seguido de `exit 0`. **Correção de referência:** o doc cita `:157` e `:82-88`; os números reais são `:152` e `:75-84`. |
| **"44 workflows"** | 44 `.yml` + 1 `.md` extraviado = 45 arquivos, 5.237 linhas | **REFUTADO** | `.github/workflows/` = **46 arquivos: 45 `.yml` + 1 `.md`**, 5.312 linhas de `.yml` | O ausente do inventário é **`.github/workflows/score-ratchet.yml`** (71 ln, "score-ratchet — advisory (E98)", `on: pull_request`, `continue-on-error: true`). Não aparece em nenhuma das 4 tabelas da seção 2 nem é citado no doc — a única menção a "score-ratchet" é ao **script** `.mjs`, na linha 221. Não é achado de janela temporal: verifiquei `git ls-tree` no **próprio commit do doc** (`81f3f7c04`) — já havia 46 arquivos ali. O `.md` extraviado (A9) existe e tem 329 ln: essa parte procede. |
| "83% das 81.341 ln de `scripts/` é um dump" | dump = `zapp_schema_snapshot.sql` | **CONFIRMADO (com deriva numérica)** | `scripts/decouple/snapshots/zapp_schema_snapshot.sql` = **67.949** ln; `scripts/` = 110 arquivos / **81.332** ln | Proporção real **83,5%** — a tese está certa. Os absolutos do doc (67.960 / 81.341) estão ~11 e ~9 linhas acima do medido; irrelevante para a conclusão. `infra/` bate exato: 30 arquivos / 3.579 ln. |
| A13 / cobertura | "184/184 arquivos cobertos", "~19 órfãos" | **SUBDIMENSIONADO** | ver §3.1 | Aritmética do próprio doc não fecha (44+1+110+30 = 185, declarado 184; o real é 45+1+110+30 = **186**). Dois arquivos de `scripts/` não aparecem em nenhuma tabela nem na seção 4 — ver §3.1. |
| A3 | `deploy-vps-selfhosted.yml` DRAFT ativo, concurrency divergente | CONFIRMADO | pré-verificado pelo orquestrador | registrado, não reauditado |
| A4a | `post-deploy-check.yml` escuta nome de arquivo, nunca dispara | CONFIRMADO | pré-verificado pelo orquestrador | registrado, não reauditado |
| A4b | `notify-ci-failure.yml`: 5 de 6 nomes errados | CONFIRMADO | pré-verificado pelo orquestrador | registrado, não reauditado |
| A1 | INV-5 enforça schema errado | rebaixado (não reaberto) | correção do orquestrador no topo do doc | fora do escopo por instrução |
| efeito real dos required checks | qualquer afirmação sobre merge bloqueado hoje | **NAO_VERIFICAVEL** | exige `GET /repos/.../branches/main/protection` | sem execução de CI e sem API, o estado vigente é indecidível pelo repo; o único registro estático (2026-08-01) diz `contexts: []` |

---

## 3. Reteste da amostra de scripts órfãos (8 casos)

Método: `rg -n --hidden -g '!node_modules' -g '!graphify-out' -g '!docs/estado' <basename> .`
— cobre `.github/`, `package.json`, `.husky/`, outros `scripts/`, `docs/`, runbooks, `infra/`,
`Dockerfile`, `docker-compose.yml`. Cruzado com a lista canônica de scripts invocados por
workflow e com os 55 entries de `package.json:scripts`.

| script | busca que fiz | tem chamador? | veredito |
|---|---|---|---|
| `scripts/decouple/verb-contract-gate.mjs` | rg repo-wide | **não** — self (5) + `coverage-report.mjs:94` (menção em comentário) + 5 docs de plano/cenário | ORFAO confirmado |
| `scripts/decouple/run-all-gates.mjs` | rg repo-wide | **não** — self (3) + 4 docs de plano + `ADR-010-sql-gateway.md:50,91` | ORFAO confirmado |
| `scripts/decouple/score-ratchet.mjs` | rg repo-wide | **não** — self (7) + `VALIDACAO_EXECUCAO_PLANO_20260815.md:182` | ORFAO confirmado — **e agravado**: existe agora `.github/workflows/score-ratchet.yml` que **reimplementa a lógica inline em `node - <<EOF`** em vez de chamar o script de 342 ln. Duplicação, não wiring. |
| `scripts/decouple/coverage-report.mjs` | rg repo-wide | **não** — self (3) + 2 docs V4 + o próprio `COVERAGE_V4.md:3` (que ele gera) | ORFAO confirmado |
| `scripts/audit-semaphore-sim.mjs` | rg repo-wide | **não** — **zero** ocorrências fora de `graphify-out/` e do próprio doc 38 | ORFAO confirmado (o mais limpo dos 8) |
| `scripts/query-fingerprint.mjs` | rg repo-wide | **não** — self (4) + `docs/REFACTOR_PLAN.md:54,97` + doc de simulação | ORFAO confirmado. Ressalva ao veredito "REMOVER": `REFACTOR_PLAN.md:54` o chama de *"ferramenta permanente"* e `:97` o prescreve como passo 1 de procedimento de refactor — é doc de método, não de plano concluído. Trocar REMOVER por AVALIAR. |
| `scripts/render-seed-report.mjs` | rg repo-wide | **não** — self (2), nem docs | ORFAO confirmado |
| `scripts/residuos-sweep.sh` | rg repo-wide | **não** — self (3); o runbook `POLITICA_ANTI_RESIDUOS.md` de fato não o cita | ORFAO confirmado |

**Resultado: 0 de 8 têm chamador.** A alegação de ausência resistiu em 100% da amostra.
Nenhum dos 8 é alcançado por glob de workflow: a lista de tudo que os 45 `.yml` invocam
sob `scripts/` tem 39 caminhos e nenhum deles é glob executável (`scripts/sql/` e
`scripts/decouple/snapshots/` aparecem apenas como caminho de artefato/upload).

### 3.1 O que a seção 4 deixou de fora (contra-achado meu)

Cruzei `git ls-files scripts` (110) com os basenames citados no doc. Fora os 11 de
`scripts/preview/` e os `.sql` pareados (cobertos em bloco por 4.3/4.4), sobram **dois
arquivos que não aparecem em nenhuma tabela nem na seção 4**:

- **`scripts/extract_cron_schedules.py`** — citado só em `docs/ops/CRON-MATRIX.md:6,155`.
  Pela regra do próprio doc ("menção em `docs/` não conta como chamador"), é **órfão não
  inventariado**, e da mesma família do `fwdref_scan.py` (Python one-shot).
- **`scripts/sql/media-bucket-verification.sql`** — não é órfão puro: `docs/watchdog-bucket-public-20260806.md:41,134`
  descreve que ele é **copiado para `/opt/watchdog-bucket-public/` na VPS** e montado `:ro`
  num container. É a mesma classe do A10 (`check-functions-health.sh`): artefato cujo
  consumidor vive fora do repo. Merecia linha própria, não silêncio.

Consequência: "~19 órfãos" é piso, não teto, e "184/184 arquivos cobertos" é falso em dois
sentidos (o denominador está errado e a cobertura não é integral).

---

## 4. Achados que eu rebaixaria

1. **A2: 🔴 Crítica → 🟠 Alta, com a redação corrigida.** Os fatos estruturais estão
   corretos e são um risco real de configuração; a afirmação de que **hoje** um PR trava
   em "Waiting for status" não está demonstrada e é contrariada pelo único registro
   estático do estado da proteção (`infra/github/branch-protection-main.md`: `contexts: []`,
   `enforcement_level: "off"`, checklist desmarcado). Redação sugerida: *"quando os required
   checks forem efetivamente ativados, `security-invoker-gate` é o único com `paths:` e
   travará PRs fora dos 3 caminhos — corrigir antes de ligar o enforcement"*.
   Efeito colateral: A2 e A5 são **o mesmo problema visto de dois lados** (ninguém sabe o
   estado real da proteção porque o sentinel é fail-open); deveriam ser fundidos ou
   referenciados mutuamente.

2. **A9 / cabeçalho: número errado.** "44 workflows / 5.237 linhas" → **45 / 5.312**.
   A9 acerta que o `.md` extraviado inflou uma contagem anterior, mas a contagem
   corrigida também está errada, por omissão de `score-ratchet.yml`. Corrigir o cabeçalho
   (linha 28), a tabela 1 (linha 40) e acrescentar `score-ratchet.yml` à seção 2.2
   (PR · advisory · `continue-on-error: true` · não obrigatório).

3. **A13: subestimado.** Elevar de "~19" para "≥21" e listar
   `scripts/extract_cron_schedules.py` e `scripts/sql/media-bucket-verification.sql`.
   Ajustar "184/184" — o universo é 186 arquivos e a cobertura não é 100%.

4. **§4.2, `query-fingerprint.mjs`: REMOVER → AVALIAR.** `docs/REFACTOR_PLAN.md` o
   prescreve como ferramenta de procedimento vigente, não como resíduo de plano concluído.

5. **§4.1, `score-ratchet.mjs`: agravar o veredito.** Deixou de ser "órfão a avaliar" e
   passou a ser "órfão com sósia": o workflow `score-ratchet.yml` faz o trabalho inline,
   ignorando o script. Ou o workflow passa a chamá-lo, ou o script sai.

6. **Referências de linha imprecisas** (não altera veredito, mas quebra rastreabilidade):
   A2 cita `security-invoker-gate.yml:20-24` para o `paths:` — o `paths:` está em `:3-8`;
   `:20-24` é o bloco `jobs:`. A5 cita `branch-protection-sentinel.yml:157` e `:82-88` —
   o array está em `:152` e o fail-open em `:75-84`.
