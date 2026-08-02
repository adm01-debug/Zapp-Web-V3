# PROMPT — Etapa 3: credenciais e sessão JWT

> Cole o conteúdo abaixo num chat novo. Este arquivo existe para não depender do histórico de conversa.
> Gerado em 2026-08-02, ao fim da Etapa 2 (commits `9d818bc9a` + `42a6ef0bb` + `ff04b78cb`).

---

## Missão

Executar a **Etapa 3** do `docs/audits/PLANO_CORRECAO_20_ETAPAS.md`: fechar a brecha de credenciais e sessão. São **3 achados**: **F9-16**, **F9-17**, **F9-18**.

É a **primeira etapa que toca produção**. As duas anteriores foram documentação e repositório; esta mexe em `pg_db_role_setting`, no `jwt_secret` e no ciclo de vida das sessões de todos os usuários. Um erro aqui derruba o login de todo mundo.

## Passo 0 — antes de qualquer outra coisa

**Confirmar que o primeiro run do CI com os gates armados ficou verde.** A Etapa 2 transformou 5 camadas de máscara em gate real; o commit `ff04b78cb` é o primeiro a passar por eles de verdade.

```
https://github.com/adm01-debug/zapp-web-v3/actions
```

Workflows que importam: **Quality Gate** (`quality-gate.yml`) e **CI/CD Pipeline** (`ci.yml`).

- **Verde** → siga para a Etapa 3.
- **Vermelho** → **pare e trate primeiro.** A regra da Etapa 2 é explícita e continua valendo: **o que reprovou é achado novo, não motivo para desligar o gate.** Registre em `docs/audits/RELATORIO_CORRECAO.md` (seção da Etapa 2, tabela de achados novos, continuando a numeração a partir de `E02-N09`) e corrija a causa.

Os quatro pontos onde é mais provável que reprove, em ordem de probabilidade:

| Onde | Por quê |
|---|---|
| `Design-system ratchet` (`ci.yml`) | teto congelado em **88**; se o CI contar diferente do container (paths, `IGNORED_DIRS`), reprova |
| `Lint` (`ci.yml` + `quality-gate.yml`) | teto `--max-warnings 6`; o CI instala `typescript@5.9.3` via `bun.lock`, o container local tinha 7.0.2 — números podem divergir |
| `E2E Tests` | passou a chamar `test:e2e:boot`; se o script não existir no lockfile buildado, quebra |
| `Performance Budget Gate` | perdeu o `continue-on-error`; deve passar sempre (métricas hardcoded — E02-N02), mas agora falha de verdade se o script quebrar |

Também vale conferir o workflow novo `e2e-nightly-full.yml`: o job `spec-coverage` roda em `ubuntu-latest` sem segredos e deve dar verde; o job `e2e-full` só dispara por cron/dispatch.

## Leia primeiro, nesta ordem

Via `CLAUDE CODE - VPS - MCP` (`code_read_file`, caminhos relativos a `/workspace`), repo `repos/zapp-web-v3`:

1. `docs/audits/PLANO_CORRECAO_20_ETAPAS.md` — **Parte II** (regras duras do ambiente + os 6 procedimentos de rollback canônicos: `R-POL`, `R-FN`, `R-VIEW`, `R-CRON`, `R-DDL`, `R-CODE`) e **Parte III → Etapa 3**. As Etapas 1 e 2 estão encerradas; não reabrir.
2. Os corpos de **F9-16, F9-17 e F9-18** em `docs/audits/PLANO_IMPLEMENTACAO_100.md`. Os três já vinham revisados da sessão de origem (Bloco 9B) — não passaram pela revalidação dos 172, mas **foram remedidos em 2026-08-02** (ver inventário abaixo).
3. `docs/audits/RELATORIO_CORRECAO.md` — seção da Etapa 2, para o padrão de registro e para os 9 achados novos abertos lá.

Não repito aqui a metodologia desses documentos.

## Estado do backlog (contexto, não escopo)

- **Etapa 1** ✅ concluída (revalidação dos 172 · severidade nos 200 · `Depende de:` · `Rollback:`).
- **Etapa 2** ✅ concluída **8/8** em 2026-08-02. Gates de CI passaram a reprovar de verdade; F1-06 consumido fora de ordem; F6-26 fechado com 9 arquivos de teste e 211 testes (`features/connections` 62,67% · `services/connections` 75,28%).
- **9 achados novos abertos na Etapa 2** (`E02-N01` a `E02-N09`), todos em `RELATORIO_CORRECAO.md`. Nenhum bloqueia a Etapa 3. Os que mais interessam aqui: **E02-N01** (versão de TypeScript divergente no container) e **E02-N02** (`check-performance-budget.mjs` não mede nada).
- Últimos commits em `main`: `9d818bc9a` → `42a6ef0bb` → `ff04b78cb`.

## Escopo exato e ordem interna

Os três achados são **um único deploy**, não três correções independentes. F9-16 e F9-17 compartilham a mesma janela porque **rotacionar o secret é o que torna a redução do `jwt_exp` retroativa** — sem rotação, os tokens de 365 dias já emitidos continuam válidos por 365 dias.

| Ordem | Achado | Sev | Nota |
|---|---|---|---|
| 1 | **F9-18** | `DEGRADADO` | independente, reversível, sem impacto em sessão — **faça primeiro para validar o caminho de `ALTER ROLE` + reload** |
| 2 | **F9-17** | `SEC` | mover `jwt_secret` para o ambiente **e** rotacionar |
| 3 | **F9-16** | `SEC` | `jwt_exp` 31536000 → 3600, no mesmo deploy de F9-17 |

**Fora de escopo:** qualquer outro achado. Se encontrar algo alarmante, registre como achado novo no fim do relatório e siga.

## Inventário já levantado — não regrepar

### Medições de 2026-08-02 (todas confirmam os três achados)

```
-- rodado via SUPABASE SELF HOSTED - MCP, banco `postgres`, PG 15.8
jwt_exp                     = 31536000        -- 365 dias  [F9-16 VALIDO]
jwt_secret                  = presente, 40 chars em pg_db_role_setting  [F9-17 VALIDO]
statement_timeout (cluster) = 30000 ms
idle_in_transaction (banco) = 60000 ms
anon          -> SELECT em pg_catalog.pg_db_role_setting = true
authenticated -> idem                                    = true
anon          -> EXECUTE em current_setting(text)        = true
```

### `statement_timeout` por role (medido, não citado)

| Role | `statement_timeout` | `idle_in_transaction` |
|---|---|---|
| `anon` | **5s** | 60s |
| `authenticator` | **8s** | — |
| `authenticated` | **120s** ⬅ alvo do F9-18 | 60s |
| `service_role` | **(nenhum — herda 30s)** ⬅ alvo do F9-18 item 2 | 300s |
| `postgres` | 120s | 60s |
| `supabase_auth_admin` | — | `60000` (sem unidade — vale conferir) |
| `supabase_admin`, `supabase_storage_admin`, `dashboard_user` | — | — |

### Serviços Swarm relevantes (Portainer, endpoint 1)

| Serviço | Imagem |
|---|---|
| `supabase_auth` | `supabase/gotrue:v2.189.0` |
| `supabase_rest` | `postgrest/postgrest:v14.12` |
| `supabase_db` | `supabase/postgres:15.8.1.085` |
| `supabase_kong` | `kong:3.9.1` |
| `supabase_realtime` | `supabase/realtime:v2.102.3` |
| `supabase_functions` | `supabase/edge-runtime:v1.74.0` |
| `supabase_storage` | `supabase/storage-api:v1.60.4` |
| `supabase_supavisor` | `supabase/supavisor:2.9.5` |
| `supabase_meta` | `supabase/postgres-meta:v0.96.6` |

Há também `supabase-backup_backup` e `supabase-config-backup_config-backup` — **confirme que rodaram recentemente antes de mexer no secret.**

## Três descobertas que mudam o desenho da etapa

**1. O raio de explosão é ~3x menor do que o plano diz.**
O plano e o corpo do F9-16 falam em *"~50 operadores da Promo Brindes"*. Medição de 2026-08-02 em `auth.users`:

```
usuários totais              = 18
ativos nos últimos 30 dias   = 10
sessões                      = 54
sessões tocadas em 7 dias    = 18
refresh tokens não revogados = 53
```

**Dezoito usuários, dez ativos.** A "janela de manutenção obrigatória" com ~50 pessoas refazendo login vira um re-login de dez pessoas. Isso **não elimina** a necessidade de janela, mas muda a conversa com o Pink sobre horário. **Registre como `⚠️ REFERÊNCIA` no F9-16 e na Etapa 3 do plano** — o número inflado está nos dois lugares.

**2. A pré-condição de risco do plano já está satisfeita.**
O plano exige *"confirmar refresh-token rotation no GoTrue **antes**, ou o corte de 1h força re-login horário"*. Evidência de que a rotação **já está ativa**:

```
auth.refresh_tokens: 261 linhas, 208 com `parent` preenchido (79,7%)
```

`parent` só é populado quando o GoTrue emite um token novo encadeado ao anterior — é a assinatura da rotação. Ou seja: **reduzir `jwt_exp` para 3600 não força re-login de hora em hora**; o cliente renova sozinho. Confirme mesmo assim lendo a env do GoTrue (recon abaixo), mas a hipótese pessimista do plano não se sustenta.

**3. O vetor do F9-17 é defesa em profundidade, não exploração direta — e o próprio achado já diz isso.**
O corpo do F9-17 traz uma "calibração honesta": `anon` não executa SQL arbitrário via PostgREST e `pg_catalog` não está entre os schemas expostos. **Não reescreva isso como se fosse exploração de um passo** e não deixe o oposto acontecer — subestimar. O que muda o quadro é o item 3 da Ação (`REVOKE ... FROM PUBLIC`), que **pode quebrar o PostgREST**: ele lê o catálogo para montar o schema cache. Trate esse item como o mais arriscado dos três achados e teste em último lugar.

## Recon que falta — faça antes de tocar em qualquer coisa

### A. Env do GoTrue e do PostgREST

**⚠️ Cuidado ao inspecionar: `portainer_inspect_service` devolve o `Spec` inteiro, incluindo os VALORES das variáveis de ambiente — o `jwt_secret` iria parar no log do chat.** Não despeje o spec cru. Use `portainer_exec_container` com um comando que liste **apenas nomes**:

```
env | grep -oE '^[A-Z0-9_]*(JWT|SECRET|EXP)[A-Z0-9_]*' | sort
```

O que precisa ser respondido:

1. `supabase_auth` já recebe `GOTRUE_JWT_SECRET` por env ou por Docker Swarm secret (`/run/secrets/...`)?
2. `supabase_rest` já recebe `PGRST_JWT_SECRET`? Se sim, o `ALTER DATABASE ... RESET` do F9-17 é seguro; se não, **resetar antes de configurar derruba a API inteira**.
3. `GOTRUE_JWT_EXP` está definido no ambiente? Se estiver, ele **vence** o `app.settings.jwt_exp` do banco — e o Aceite do F9-16 (`current_setting` = 3600) pode dar verde sem que a validade real mude. Verifique qual das duas fontes o GoTrue realmente usa nesta versão.
4. `GOTRUE_REFRESH_TOKEN_ROTATION_ENABLED` e `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL` — confirmação direta da descoberta 2.
5. Onde a stack está declarada: `portainer_list_stacks` + `portainer_get_stack_file`. **A alteração definitiva tem que ser no stack file**, não só no serviço em execução — senão o próximo redeploy reverte tudo.

### B. Quem mais consome o `jwt_secret`

Rotacionar invalida qualquer coisa que assine ou verifique token com o valor antigo. Levante **antes** de rotacionar:

- `supabase_realtime` (`API_JWT_SECRET` / `SECRET_KEY_BASE`)
- `supabase_storage` (`PGRST_JWT_SECRET` ou `AUTH_JWT_SECRET`)
- `supabase_functions` / edge-runtime
- `supabase_kong` — as chaves `anon` e `service_role` são **JWTs assinados com esse secret**
- **Consumidores fora da stack:** n8n (credencial `tyLhN1fGwJveaDCg` e demais), Evolution API, os ~20 MCPs `SUPABASE - * - MCP` deste workspace, o frontend `zapp-web-v3` (`VITE_SUPABASE_ANON_KEY`), Cloudflare Workers.

> **Esta é a parte que pode dar errado feio.** Rotacionar o `jwt_secret` de um Supabase self-hosted **regenera `anon key` e `service_role key`**. Tudo que carrega essas chaves hardcoded para de funcionar. Monte a lista completa **antes** e trate a rotação como item com plano de propagação, não como um `ALTER DATABASE`.

### C. Backup verificado

```
portainer_get_service_logs supabase-backup_backup --tail 50
portainer_get_service_logs supabase-config-backup_config-backup --tail 50
```

Confirme data e sucesso do último backup **de banco e de configuração** antes do primeiro comando destrutivo.

## Ordem de execução proposta

**Bloco A — F9-18 (ensaio geral, risco baixo).**
`ALTER ROLE authenticated SET statement_timeout = '15s';` e `ALTER ROLE service_role SET statement_timeout = '60s';`. Não afeta sessão nem token. Serve para validar o caminho completo: comando → reload/reconnect do pool → verificação. Confirme que o PostgREST relê (pode exigir `NOTIFY pgrst, 'reload config'` ou restart do serviço) e que o valor efetivo mudou **de dentro de uma conexão real do PostgREST**, não só via `pg_roles`.
Aceite: `SELECT (SELECT c FROM unnest(rolconfig) c WHERE c LIKE 'statement_timeout%') FROM pg_roles WHERE rolname='authenticated'` → `statement_timeout=15s`.

**Bloco B — F9-17 parte 1: mover a fonte do secret (sem rotacionar ainda).**
Garantir que GoTrue, PostgREST, Realtime, Storage e Functions leem `JWT_SECRET` do ambiente/Swarm secret **com o valor atual**. Só depois `ALTER DATABASE postgres RESET app.settings.jwt_secret;`. Verifique que a autenticação continua funcionando **antes** de seguir. Esta ordem — configurar, verificar, só então resetar — é o que separa uma correção de uma queda.
Aceite: `SELECT current_setting('app.settings.jwt_secret', true)` → `NULL`, com login funcionando.

**Bloco C — F9-16 + F9-17 parte 2: `jwt_exp` e rotação, na janela.**
`ALTER DATABASE postgres SET app.settings.jwt_exp = 3600;` (e/ou `GOTRUE_JWT_EXP=3600` no ambiente, conforme o recon A.3 apontar). Rotação do secret + regeneração e propagação de `anon key` e `service_role key` para todos os consumidores da lista do recon B. Só entre nesta janela com a lista fechada.
Aceite: `SELECT current_setting('app.settings.jwt_exp')` → `3600`.

**Bloco D — F9-17 item 3 (`REVOKE` no catálogo), opcional e por último.**
`REVOKE SELECT ON pg_catalog.pg_db_role_setting FROM PUBLIC;` — **pode quebrar o schema cache do PostgREST.** Teste, verifique a API imediatamente, e reverta na hora se algo falhar (`GRANT SELECT ON pg_catalog.pg_db_role_setting TO PUBLIC;`). Se não for seguro, **não force**: com o secret fora do banco (Bloco B), o valor deste item cai muito. Registre a decisão.

## Rollback

O F9-17 tem `Rollback: R-POL` gravado; F9-16 e F9-18 não têm campo — porque são `ALTER DATABASE`/`ALTER ROLE`, revertidos pelo comando inverso. Tenha os inversos escritos **antes** de executar:

```
-- F9-18
ALTER ROLE authenticated SET statement_timeout = '120s';
ALTER ROLE service_role RESET statement_timeout;
-- F9-16
ALTER DATABASE postgres SET app.settings.jwt_exp = 31536000;
-- F9-17 (só se o secret antigo ainda for o vigente)
ALTER DATABASE postgres SET app.settings.jwt_secret = '<valor guardado FORA do chat>';
-- F9-17 item 3
GRANT SELECT ON pg_catalog.pg_db_role_setting TO PUBLIC;
```

**Guarde o valor atual do `jwt_secret` fora desta conversa antes de qualquer coisa** (mesma política do PAT: Claude nunca armazena o valor verbatim). Depois de rotacionado, o rollback do secret deixa de ser possível sem repropagar as chaves de novo.

## Regras duras do ambiente

- `python3` **não existe** no container. Use `perl`, `awk`, `sed`. Em perl que manipule os `.md`, **não use camadas `:encoding(UTF-8)`** — trabalhe em bytes, senão os literais acentuados não casam. Cuidado com `@` em string de aspas duplas do perl (`@technical` interpola e quebra a compilação).
- Husky `pre-commit` chama `bun`, que não existe no container. O procedimento de `mv .husky/pre-commit .husky/pre-commit.disabled_temp` **versionou o rename por engano** na Etapa 2 e exigiu um commit de conserto. **Use `git commit --no-verify` em vez do rename** — é mais limpo e não suja a árvore.
- **Proibido:** `git push --force`, `git reset --hard`, `rebase -i`. Há histórico de perda de 30k commits em outro repo.
- Se `git push` falhar com `Invalid username or token`, **pare e peça** — não invente credencial. Antes disso, confira `git config --global --list | grep -i insteadof` (deve vir vazio).
- `grep -r` global com `head` **trunca e produz falso "0 hits"**. Faça greps por arquivo.
- Ignore números de linha citados nos achados — localize por símbolo. O `PLANO_IMPLEMENTACAO_100.md` cresceu com as notas das Etapas 1 e 2.
- Auditoria de schema usa **`pg_catalog` apenas** — PostgREST/OpenAPI é não confiável para triggers, policies e crons.
- `vitest` neste repo: `--reporter=basic` **não existe** (erro de startup). Use `--reporter=dot`.
- O shell do `code_exec` é `dash`: `${PIPESTATUS[@]}` não funciona. Encadeie com `;` em vez de `&&` quando um comando puder retornar não-zero legitimamente (ex.: `ls` de arquivo ausente aborta a cadeia inteira).

## Definição de pronto

Da Parte II do plano, mais o específico desta etapa:

1. **`SELECT current_setting('app.settings.jwt_secret', true)` retorna `NULL` e a autenticação segue operando** — é o Aceite declarado da Etapa 3. Prove os dois lados: o `NULL` **e** um login real bem-sucedido.
2. Cada um dos 3 achados com seu **Aceite verificado por comando real**, com a saída registrada. Os três já vêm com o SQL pronto no corpo.
3. Achado que se revelar obsoleto ou com referência errada: marcar no `PLANO_IMPLEMENTACAO_100.md` no padrão das Etapas 1-2 (`~~OBSOLETO~~` no título + linha `- **Revalidado em 2026-XX-XX:**`), **nunca deletar nem renumerar**. O número de "~50 operadores" do F9-16 já é candidato a `⚠️ REFERÊNCIA`.
4. Seção da Etapa 3 preenchida em `docs/audits/RELATORIO_CORRECAO.md`, no mesmo formato da Etapa 2 (o que mudou · achados por veredito · achados novos · o que a próxima sessão precisa saber).
5. Etapa 3 marcada como concluída na Parte III do `PLANO_CORRECAO_20_ETAPAS.md`.
6. **Lista de propagação das chaves fechada e conferida** — se algum consumidor ficou com a chave antiga, a etapa não está pronta, está quebrada em silêncio.

**Risco declarado no plano: ALTO — janela de manutenção obrigatória.** É o único item das três primeiras etapas que exige combinar horário com o Pink antes de executar. Não trate os Blocos C e D como algo que se faz "de passagem".

## Integridade antes do commit

```
grep -c "^### F" docs/audits/PLANO_IMPLEMENTACAO_100.md            # 200
grep -c "^- \*\*Sev:\*\*" docs/audits/PLANO_IMPLEMENTACAO_100.md   # 200
```
E por bloco: `F1:14 F2:13 F3:12 F4:24 F5:30 F6:30 F7:32 F8:17`.

Commit: `fix(sec): E03 — <resumo> (<achados>)`.

## O que NÃO fazer

- Não reabrir as Etapas 1 e 2 nem os vereditos dos 172.
- **Não rotacionar o `jwt_secret` antes de ter a lista completa de consumidores** das chaves `anon`/`service_role`. É o erro que derruba n8n, Evolution, MCPs e frontend de uma vez.
- **Não resetar `app.settings.jwt_secret` antes de confirmar** que GoTrue e PostgREST leem do ambiente. A ordem é: configurar → verificar → resetar.
- Não aplicar o `REVOKE` do catálogo sem plano de reversão imediato à mão.
- Não alterar só o serviço em execução: **o stack file é a fonte da verdade**, ou o próximo redeploy reverte tudo.
- Não desligar gate que passou a reprovar (regra herdada da Etapa 2).
- Não colar o valor do `jwt_secret`, da `anon key` ou da `service_role key` no chat.
- Não narrar cada passo. Meça em lote, registre, siga.
