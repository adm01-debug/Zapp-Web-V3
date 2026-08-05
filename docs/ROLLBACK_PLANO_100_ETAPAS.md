# Plano de Rollback — Plano de Correção 100 Etapas (Etapa 7)

> **Status:** Documento de contingência — será anexado ao PR de fechamento do plano.
> **Escopo:** Rollback completo (banco, front, infra) das correções F-01…F-06 e I-01/I-02 do plano de 100 etapas.
> **Princípio:** rollback **rápido, atômico e sem perda de dados**. Nenhuma correção desta rodada altera dados — apenas DDL (funções/grants), código front e configuração de containers. O rollback é, portanto, sempre reversível por `DROP`/`REVOKE`/`git revert`/redeploy de imagem.

---

## 1. Rollback de DDL de banco

### 1.1 Rede de segurança: snapshot schema-only (obrigatório ANTES do deploy)

Antes de qualquer aplicação de migration desta rodada, gerar snapshot do schema para permitir restauração cirúrgica e diff de comparação:

```bash
pg_dump --schema-only -n zapp -n public -n evo \
  -h <DB_HOST> -U postgres -d <DB_NAME> \
  -f backups/snapshot_pre_100etapas_$(date +%Y%m%d_%H%M%S).sql
```

- Os schemas `zapp`, `public` e `evo` cobrem 100% dos objetos tocados por F-01…F-06.
- Guardar o snapshot fora do host (ex.: repositório privado de backups / GHCR artifact), pois o rollback pode ser necessário após falha de host.
- Em caso de rollback, o snapshot serve como fonte da verdade para conferir que o estado pós-rollback é idêntico ao pré-deploy (`pg_dump` novo + `diff`).

### 1.2 Wrappers F-01/F-02 (`zapp.rpc_app_bootstrap` / `zapp.rpc_dashboard_init`)

Os wrappers são `SECURITY DEFINER` com `SET search_path TO 'zapp','public','pg_temp'`, delegando a `public.*`. Como delegam para as funções originais de `public` (que **permanecem intactas**), o rollback é um simples `DROP` — nada em `public` é afetado:

```sql
-- F-01
DROP FUNCTION IF EXISTS zapp.rpc_app_bootstrap();

-- F-02 (assinatura idêntica à de public)
DROP FUNCTION IF EXISTS zapp.rpc_dashboard_init(uuid, uuid, timestamptz, timestamptz);
```

> **Nota:** o `DROP` remove automaticamente o `GRANT EXECUTE TO authenticated` concedido na etapa 11/13 (grants são dependentes do objeto). O `REVOKE` explícito abaixo é redundância de segurança para o caso de o rollback ser parcial (manter função mas remover acesso).

Se a decisão for **manter as funções** mas remover o acesso (degradação controlada em vez de rollback total):

```sql
REVOKE EXECUTE ON FUNCTION zapp.rpc_app_bootstrap() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_dashboard_init(uuid, uuid, timestamptz, timestamptz) FROM authenticated;
```

**Fallback do front sem rollback de banco:** os call-sites originais (`useAppBootstrap.ts:100`, `useDashboardDataBatch.ts:93`) voltam a chamar `public.rpc_*` diretamente (opção B do plano) — `public` continua exposto em `PGRST_DB_SCHEMAS`, então não há PGRST202.

### 1.3 Grants F-03 (5 RPCs de `zapp`)

Grants concedidos na migration F-03 devem ser revogados. **Atenção:** o 2-arg de `fn_toggle_user_meme_favorite` NÃO está nesta lista — ele permanece revogado (ver 1.4):

```sql
REVOKE EXECUTE ON FUNCTION zapp.fn_increment_meme_use() FROM authenticated;            -- assinatura real: conferir pg_proc
REVOKE EXECUTE ON FUNCTION zapp.fn_safe_audit_log(...) FROM authenticated;              -- conferir assinatura em pg_proc
REVOKE EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid) FROM authenticated;  -- SOMENTE o 1-arg
REVOKE EXECUTE ON FUNCTION zapp.import_user_data(...) FROM authenticated;               -- conferir assinatura em pg_proc
REVOKE EXECUTE ON FUNCTION zapp.rpc_list_failed_messages(...) FROM authenticated;       -- conferir assinatura em pg_proc
```

> Comando de conferência de assinaturas exatas (rodar antes do REVOKE):
> ```sql
> SELECT p.oid::regprocedure, has_function_privilege('authenticated', p.oid, 'EXECUTE')
> FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
> WHERE n.nspname = 'zapp'
>   AND p.proname IN ('fn_increment_meme_use','fn_safe_audit_log','fn_toggle_user_meme_favorite','import_user_data','rpc_list_failed_messages');
> ```

### 1.4 Revogação do 2-arg `fn_toggle_user_meme_favorite` — NÃO reverter (decisão de segurança permanente)

> ⛔ **Proibido executar:** `GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) TO authenticated;`

- A revogação é uma **decisão de segurança permanente**, documentada na migration `supabase/migrations/20260805180000_revoke_meme_favorite_2arg_authenticated.sql`.
- Motivo: o overload de 2 argumentos aceita `p_user_id` arbitrário **sem guarda interna de ownership**, permitindo **escalada horizontal de privilégio** (qualquer usuário autenticado poderia alternar favoritos em nome de outro usuário).
- O overload de 1-arg (`fn_toggle_user_meme_favorite(uuid)`) opera internamente sobre `auth.uid()` e **continua concedido** — este é o caminho suportado.
- O próprio cabeçalho da migration registra a condição para eventual reversão futura: **somente** após a função receber guarda interna de ownership (`IF p_user_id <> auth.uid() AND NOT zapp.is_admin_or_supervisor() THEN RAISE EXCEPTION ...`). Até lá, qualquer "rollback" que re-conceda esse grant é tratado como incidente de segurança, não como rollback.
- **Em nenhuma hipótese** este item pode aparecer no script de rollback automático.

### 1.5 RPCs de diagnóstico F-06 (`zapp.rpc_schema_columns` / `zapp.rpc_schema_tables`)

```sql
DROP FUNCTION IF EXISTS zapp.rpc_schema_columns();
DROP FUNCTION IF EXISTS zapp.rpc_schema_tables();
-- ou, se mantiver a função:
REVOKE EXECUTE ON FUNCTION zapp.rpc_schema_columns() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_schema_tables() FROM authenticated;
```

### 1.6 Regra de ouro para migrations

- **Não** criar migrations "down" no histórico `supabase_migrations.schema_migrations` (histórico é append-only; reverter versão quebra o registro).
- Rollback de DDL é executado como **SQL manual cirúrgico** (comandos acima), seguido de validação contra o snapshot 1.1.
- Se o rollback for definitivo (não apenas contingência), registrar a reversão em **nova migration com timestamp posterior** (ex.: `20260807XXXX00_rollback_100etapas_wrappers.sql`) para o estado do banco continuar reproduzível a partir do histórico.

---

## 2. Rollback de código front — `git revert` por commit atômico

Cada fase foi entregue em **commit atômico** (migration + código relacionados no mesmo commit). O rollback do front é, portanto, `git revert` do(s) commit(s) da fase, na ordem inversa da aplicação, seguido de deploy do front:

```bash
# Identificar os SHAs das fases (assumindo ordem cronológica de merge na main):
git log --oneline --grep="F-0[1-6]" --all          # localizar SHAs por fase

# Reverter na ordem INVERSA (mais recente primeiro):
git revert --no-edit <sha_F06_schemaDrift>
git revert --no-edit <sha_F05_realtime>
git revert --no-edit <sha_F04_evo_views>
git revert --no-edit <sha_F03_grants>
git revert --no-edit <sha_F01_F02_wrappers>
```

Fases e o que cada revert desfaz:

| Fase | O que o commit contém | Arquivos afetados |
|---|---|---|
| **F-01/F-02** | Wrappers `zapp.rpc_app_bootstrap()` / `zapp.rpc_dashboard_init()` (migration) + ajustes de comentário | `supabase/migrations/20260805*_rpc_bootstrap_dashboard_wrappers.sql` (ou equivalente), comentários nos hooks |
| **F-03** | Migration de grants dos 5 RPCs de `zapp` | `supabase/migrations/20260805*_grants_*.sql` |
| **F-04** | Migração evo→views `zapp`: patches da página demo `ZappWebbDemoPage` + hook de credenciais (call-sites `.schema('evo')` → views `zapp`) | `ZappWebbDemoPage.*`, hook de credenciais, `useZappConversations/useZappMessages/useEvolutionApiIntegration` (apenas os call-sites do escopo demo) |
| **F-05** | Realtime: subscriptions `schema:'public'` → `schema:'zapp'` | `useAudioMessagePlayer.ts:95`, `useRetryMetrics.ts:127` |
| **F-06** | `schemaDrift.ts` → RPCs `rpc_schema_columns`/`rpc_schema_tables` + migration dos RPCs | `schemaDrift.ts:60/73`, migration F-06 |

**Regras:**
- Cada `git revert` gera um commit próprio — **não** amontoar em um único commit (preserva a atomicidade e o rastro de auditoria).
- Reverter **somente** o código; o DDL correspondente é revertido pela seção 1 (evita dependência de ordem entre deploy de banco e deploy de front).
- Após o revert completo, rodar `npm run lint && npm run typecheck` e validar o build antes do deploy.
- Se houver conflito de revert (código posterior tocou os mesmos arquivos), resolver manualmente preservando o comportamento pré-correção e registrar no PR.

---

## 3. Rollback de infra

### 3.1 `supabase_rest` (PostgREST) — `PGRST_DB_SCHEMAS`

> **NOTA IMPORTANTE:** **nada foi alterado em produção nesta rodada.** O valor vigente permanece:
> ```
> PGRST_DB_SCHEMAS=public,zapp,storage,graphql_public,artes,vendas,financeiro
> ```
> A recomendação I-02 (remover `artes,vendas,financeiro` do PostgREST) foi **registrada apenas** — não executada. Logo, **não há o que reverter** no `supabase_rest` nesta rodada.

Caso, em rodada futura, o env seja alterado e precise voltar:

```bash
# Via Docker Swarm / Portainer — atualizar o service com o env anterior:
docker service update \
  --env-add PGRST_DB_SCHEMAS=public,zapp,storage,graphql_public,artes,vendas,financeiro \
  supabase_supabase-rest
```

- **Importante:** `evo` **não** deve ser adicionado a `PGRST_DB_SCHEMAS` (decisão least-privilege do plano, etapa 37) — o rollback de F-04 depende das views `zapp` e nunca de expor `evo`.
- Após qualquer mudança de env, PostgREST recarrega a config; validar com `GET /rest/v1/` (lista de schemas expostos) e health check.

### 3.2 `supabase_meta` (postgres-meta)

- O crash-loop do `supabase_meta` (I-01, `Exited 137`) foi **resolvido nesta rodada** (container healthy). Rollback/recuperação = voltar à imagem conhecida-boa `postgres-meta:v0.96.6`:

```bash
# Opção A — redeploy da imagem conhecida-boa (se o service foi alterado):
docker service update --image supabase/postgres-meta:v0.96.6 supabase_supabase-meta

# Opção B — reverter para o spec anterior (se a última atualização foi a causa):
docker service rollback supabase_supabase-meta
```

- Validar pós-redeploy: `docker service ps supabase_supabase-meta` (Running, sem restart loops), healthcheck do container e Studio/schema browser respondendo.
- Se o crash-loop reaparecer (`Exited 137` = OOM/kill), checar `docker service inspect` (memory limit) e logs antes de considerar rollback — o sintoma I-01 já tem causa-raiz conhecida e tratada.

---

## 4. Janela de observação pós-deploy (24–48h) e critérios de rollback

### 4.1 Janela

- **Duração:** 24–48h após o deploy completo (banco + front + infra), com atenção redobrada nas primeiras 2h (janela de tráfego real).
- **Monitoramento durante a janela:**
  - Logs do PostgREST (`supabase_rest`) — filtrar `PGRST202`, `PGRST106`, `403`, `permission denied`.
  - Logs do `supabase_meta` — sem crash-loops; `docker service ps` estável.
  - Realtime: subscriptions de áudio (`useAudioMessagePlayer`) e retry metrics (`useRetryMetrics`) entregando eventos.
  - Ferramenta de drift (`schemaDrift`) rodando limpa; types regenerados (`src/integrations/supabase/types.ts`) sem diff contra o schema.
  - Erros de console F12 nos fluxos: login → bootstrap, dashboard, memes/favoritos, import de dados, failed messages, página demo ZappWebb.

### 4.2 Critérios de rollback (acionar o procedimento da seção 5)

| # | Critério | Severidade | Ação |
|---|---|---|---|
| R-1 | `PGRST202` (function not found) **recorrente** em bootstrap/dashboard após deploy | 🔴 Crítica | Rollback F-01/F-02 (seção 1.2) + revert front |
| R-2 | `PGRST106` (ambiguous) ou `403`/`permission denied` **recorrentes** nos 5 RPCs de `zapp` | 🔴 Crítica | Rollback F-03 (seção 1.3) + revert front |
| R-3 | Realtime **mudo**: eventos de áudio/retry metrics não disparam em > 30 min com usuários ativos | 🟠 Alta | Rollback F-05 (revert front) |
| R-4 | **Drift de types**: regeneração de types divergente do schema aplicado ou `schemaDrift` quebrando em produção | 🟠 Alta | Rollback F-06 (seção 1.5 + revert front) |
| R-5 | Página demo ZappWebb / credenciais com erro 4xx após F-04 | 🟠 Média | Rollback F-04 (revert front) |
| R-6 | `supabase_meta` em crash-loop novamente | 🔴 Crítica | Redeploy `postgres-meta:v0.96.6` (seção 3.2) |
| R-7 | Qualquer **regressão de segurança** (ex.: tentativa de re-conceder o 2-arg de `fn_toggle_user_meme_favorite`) | 🔴 Crítica | **NÃO reverter** — abrir incidente de segurança imediatamente |

**Regra geral:** 2 ocorrências do mesmo critério crítico (R-1/R-2/R-6) ou 1 ocorrência com impacto de usuário visível (login quebrado, dashboard em branco) = acionar rollback sem esperar a janela completar. Rollback parcial por fase é permitido (ex.: reverter só F-05) — o plano é modular.

---

## 5. Tabela resumo: Fase | O que reverter | Comando | Risco

| Fase | O que reverter | Comando | Risco |
|---|---|---|---|
| **F-01/F-02** (wrappers) | `zapp.rpc_app_bootstrap()` e `zapp.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz)` + grants | `DROP FUNCTION IF EXISTS zapp.rpc_app_bootstrap();` / `DROP FUNCTION IF EXISTS zapp.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz);` (+ `git revert` do commit F-01/F-02) | 🟢 **Baixo** — só funções, sem dados; `public.*` intocada; fallback: call-sites voltam a `public.rpc_*` |
| **F-03** (grants) | `EXECUTE` nos 5 RPCs de `zapp` (increment_meme_use, safe_audit_log, toggle 1-arg, import_user_data, list_failed_messages) | `REVOKE EXECUTE ON FUNCTION zapp.<fn>(...) FROM authenticated;` (assinaturas via pg_proc) + `git revert` F-03 | 🟢 **Baixo** — só permissões; efeito imediato no PostgREST |
| **F-04** (evo→views) | Patches demo page + hook de credenciais | `git revert` do commit F-04 | 🟡 **Médio** — toca call-sites de schema; `evo` continua fora do `PGRST_DB_SCHEMAS` (sem risco de exposição) |
| **F-05** (realtime) | Subscriptions `schema:'zapp'` → `schema:'public'` | `git revert` do commit F-05 | 🟢 **Baixo** — 2 arquivos (`useAudioMessagePlayer.ts`, `useRetryMetrics.ts`) |
| **F-06** (schemaDrift) | RPCs `rpc_schema_columns`/`rpc_schema_tables` + patch `schemaDrift.ts` | `DROP FUNCTION IF EXISTS zapp.rpc_schema_columns();` / `DROP FUNCTION IF EXISTS zapp.rpc_schema_tables();` + `git revert` F-06 | 🟢 **Baixo** — ferramenta de diagnóstico apenas; sem impacto em fluxo de usuário |
| **I-01** (supabase_meta) | Container em crash-loop | `docker service update --image supabase/postgres-meta:v0.96.6 supabase_supabase-meta` (ou `docker service rollback supabase_supabase-meta`) | 🟡 **Médio** — restart de container; janela curta de indisponibilidade do Studio/gerador de types |
| **I-02** (PGRST_DB_SCHEMAS) | Env do `supabase_rest` | **Nada a reverter nesta rodada** (env não alterado: `public,zapp,storage,graphql_public,artes,vendas,financeiro`). Se alterado em rodada futura: `docker service update --env-add PGRST_DB_SCHEMAS=<valor_anterior> supabase_supabase-rest` | 🔴 **Alto se mal executado** — mexer em schemas expostos afeta todos os tenants; por isso: só reverter para valor conhecido-bom e validar `GET /rest/v1/` |
| **Segurança permanente** | 2-arg `fn_toggle_user_meme_favorite(uuid,uuid)` | ⛔ **NENHUM comando** — proibido re-conceder; migration `20260805180000_revoke_meme_favorite_2arg_authenticated.sql` é definitiva | 🔴 **Crítico** — re-conceder = escalada horizontal de privilégio (incidente de segurança) |

---

## 6. Ordem de execução do rollback e validação

1. **Decidir escopo** (total vs. parcial por fase) com base nos critérios da seção 4.2.
2. **Banco:** executar SQL da seção 1 (transação única por fase), conferindo com `has_function_privilege`/`pg_proc` após cada bloco.
3. **Front:** `git revert` dos commits na ordem inversa + lint/typecheck + build.
4. **Infra:** redeploy de imagem/env conforme seção 3 (somente se aplicável).
5. **Validar:** diff do `pg_dump --schema-only` pós-rollback contra o snapshot 1.1 (deve estar idêntico em `zapp`/`public`/`evo`); smoke tests de login/bootstrap/dashboard; logs PostgREST sem PGRST202/106/403 novos.
6. **Registrar:** relato do rollback no PR de fechamento (o que, por quê, duração da janela, evidências).

> **Lembrete final:** rollback não é falha de processo — é a rede de segurança que permite corrigir rápido. A única falha real seria **re-conceder o 2-arg de `fn_toggle_user_meme_favorite`** ou **expor `evo`/tenants no PostgREST** durante um rollback apressado. Ambos estão explícita e permanentemente proibidos neste documento.
