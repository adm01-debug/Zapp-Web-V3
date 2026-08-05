# Retro — Plano de Correção de 100 Etapas (Etapa 100)

- **Data:** 2026-08-05
- **Branch:** `fix/30-etapas-plano-correcao`
- **Status:** ✅ Concluído — 100/100 etapas executadas
- **Documento de encerramento:** este arquivo (etapa 100 do plano)

---

## 1) Contexto

Na auditoria de **2026-08-04** foi identificado drift significativo entre o **schema `zapp`** e o que o **frontend** consome: RPCs e funções chamadas pelo front não existiam ou não estavam granted no schema `zapp` (só em `public`), grants faltantes, realtime apontando para schema errado, e acesso via `.schema('evo')` no PostgREST.

Para endereçar a deriva de forma rastreável, foi montado um **plano de correção de 100 etapas**, executado e concluído em **2026-08-05** na branch `fix/30-etapas-plano-correcao`. Abaixo, o fechamento com os fatos verificados, lições aprendidas, o que funcionou, pendências e o plano de rollback assinado.

### Fatos verificados (resumo do fechamento)

| ID | Fato | Status |
|----|------|--------|
| F-01 | Wrapper `rpc_app_bootstrap` criado em `zapp` e granted | ✅ |
| F-02 | Wrapper `rpc_dashboard_init` criado em `zapp` e granted | ✅ |
| F-03 | Grants aplicados 5/6 — o 2º overload `fn_toggle_user_meme_favorite(uuid, uuid)` **revogado por segurança** (ver §2.3) | ✅ (com exceção deliberada) |
| F-04 | Sem `.schema('evo')` no PostgREST; views `zapp.evolution_*_wpp2` em uso | ✅ |
| F-05 | Realtime corrigido: `schema: 'zapp'` onde a tabela física é `zapp`; `schema: 'evo'` apenas para tabelas físicas `evo` na publicação | ✅ |
| F-06 | RPCs `rpc_schema_columns` / `rpc_schema_tables` criados; `schemaDrift.ts` migrado para usá-los | ✅ |
| I-01 | `supabase_meta` healthy (crash-loop resolvido) | ✅ |
| I-02 | `PGRST_DB_SCHEMAS` mantido como estava, com recomendação de segregação futura (ver §4) | ⏳ Pendente deliberado |

---

## 2) Lições aprendidas

### 2.1 Por que `rpc_app_bootstrap` / `rpc_dashboard_init` ficaram só em `public`?

**Herança da Lovable Cloud.** Esses RPCs nasceram no schema padrão (`public`): o ambiente Lovable criava funções no schema default e o front Lovable as chamava **sem override de schema** — a URL PostgREST resolvia para `public` implicitamente. O schema `zapp` é uma consolidação posterior, então essas funções nunca foram recriadas lá.

**Correção aplicada:** em vez de duplicar a lógica ou quebrar o contrato do front, foram criados **wrappers SECURITY DEFINER em `zapp` com `search_path` fixo**, apontando para a implementação canônica. Isso garante:
- o front continua chamando pelo mesmo nome/assinatura;
- o corpo da função executa com `search_path` determinístico (não depende do `search_path` do chamador);
- a superfície de API fica consolidada no schema `zapp`, sem depender de `public`.

**Lição:** schema de origem (Lovable Cloud → `public`) vira dívida invisível. Toda função chamada pelo front precisa ter residência canônica declarada — e o schema da chamada precisa ser explícito.

### 2.2 Por que 5 grants faltaram?

**Grants eram feitos manualmente, por RPC avulso**, sem migration versionada. Execuções ad-hoc (`GRANT ... TO authenticated` via console/RPC solto) não deixam trilha no repositório nem no histórico de migrations — e a próxima reconstrução/auditoria não tem de onde provar o que deveria estar aplicado. A auditoria de 2026-08-04 pegou exatamente essa **deriva** entre o banco real e o estado esperado.

**Correção aplicada:** os 5 grants foram aplicados e registrados em migration versionada (F-03), de forma que o estado desejado fica reproduzível.

**Lição:** permissão não se aplica no console — se aplica em migration versionada. Toda mudança de grant sem migration é dívida futura garantida.

### 2.3 Por que o 2º overload `fn_toggle_user_meme_favorite(uuid, uuid)` NÃO deve ser granted?

O overload de 2 argumentos recebe **o UUID do usuário como parâmetro** e, sendo **SECURITY DEFINER sem guarda de propriedade**, executa com privilégios do definidor e **sem validar que o alvo é o próprio chamador**. Consequência: **qualquer usuário autenticado poderia favoritar/desfavoritar favoritos de qualquer outro usuário** — escalonamento horizontal (IDOR) em uma função privilegiada.

Por isso, dos 6 grants previstos, **5 foram aplicados e o 6º (o 2-arg) foi deliberadamente revogado/omitido (F-03)**.

**Caminho canônico:** o overload de **1 argumento**, que deriva a identidade de `auth.uid()` — a identidade vem da sessão, nunca do argumento. É a única forma segura de expor essa operação via PostgREST.

**Lição:** função SECURITY DEFINER que aceita identidade por parâmetro é vulnerabilidade, não conveniência. Se um overload "helper" existe, ele fica **sem grant** até ganhar guarda de propriedade interna (ver §4).

---

## 3) O que funcionou

- **Migração evo → views zapp completa (F-04):** acesso via `zapp.evolution_*_wpp2`, sem `.schema('evo')` no PostgREST — o front parou de depender do schema da Evolution API.
- **Realtime em tabelas físicas com `publish_via_partition_root` (F-05):** publicação corrigida com `schema: 'zapp'` para tabelas físicas `zapp` e `schema: 'evo'` apenas para tabelas físicas `evo` — elimina os eventos perdidos/duplicados de antes.
- **RPCs `rpc_schema_tables` / `rpc_schema_columns` (F-06):** a ferramenta de drift agora lê o catálogo via RPCs dedicados, e `schemaDrift.ts` foi migrado — drift detection virou rotina executável, não análise manual.
- **`audit-contract.mjs` no CI:** o contrato front × schema passou a ser verificado automaticamente a cada mudança — a deriva agora é detectada no pull request, não em auditoria.
- **ESLint `no-restricted-syntax` anti-schema:** `.schema('evo')` passou a falhar no lint — a regra vira barreira mecânica contra o padrão errado voltar.
- **I-01 resolvido:** `supabase_meta` healthy após correção do crash-loop.

---

## 4) Pendências e recomendações

| Item | Tipo | Ação recomendada |
|------|------|------------------|
| **Segregação de artes/vendas/financeiro do `PGRST_DB_SCHEMAS` (I-02)** | Pendência deliberada | Remover esses schemas do `PGRST_DB_SCHEMAS` para reduzir superfície de exposição. **Requer janela de manutenção + aprovação** — não foi feito nesta execução para não arriscar indisponibilidade. Abrir tarefa dedicada. |
| **Guarda de propriedade interna na função 2-arg** | Defesa em profundidade | Se o overload `fn_toggle_user_meme_favorite(uuid, uuid)` um dia for exposto, **antes** deve ganhar guarda interna (`WHERE user_id = auth.uid()` ou equivalente). Enquanto isso, permanece **sem grant**. |
| **Monitoramento Glitchtip pós-deploy** | Operacional | Observar erros no Glitchtip por **30 minutos após o deploy** desta branch, antes de considerar o fechamento consolidado. |

---

## 5) Plano de rollback assinado

O plano de rollback completo (passos, ordem de reversão, validação pós-rollback e responsável) está em:

➡️ **`docs/ROLLBACK_PLANO_100_ETAPAS.md`**

Ele cobre a reversão segura de F-01 a F-06 e do I-01, preservando o estado funcional anterior em caso de regressão pós-deploy.
