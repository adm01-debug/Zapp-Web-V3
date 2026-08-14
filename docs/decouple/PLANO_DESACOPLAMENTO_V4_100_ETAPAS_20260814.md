> [!NOTE] **STATUS 2026-08-14 — pós-onda de 10 agentes (reconciliação `main` @`8ff014fb0`)**
> Este arquivo é o **desenho** do Plano V4 (100 etapas). O retrato **medido** do estado do desacoplamento está em [`BASELINE_V4.md`](./BASELINE_V4.md) e a matriz de cenários E1–E30 em [`CENARIOS_V4_LOG.md`](./CENARIOS_V4_LOG.md). Banner inserido em 2026-08-14 (Agente 8) — o conteúdo abaixo permanece integralmente preservado.

# PLANO V4 — Fechamento Final do Desacoplamento Zapp Web V3 ↔ Evolution API

**Data:** 2026-08-14 · **Autor:** Hermes (análise exaustiva pós-V3) · **Baseline:** SCORECARD_V3.md (nota 8,5/10) · **Estado de partida:** migração aprovada, 12 resíduos identificados, produção saudável (wpp2 open, ~5.077 msgs/24h, DLQ 0)

**Escopo:** evoluir o PLANO V3 já existente, fechando definitivamente as dimensões 9 (prova de troca de provider) e 10 (governança/gates) do scorecard, sem regredir as demais. NÃO refazer o que o V3 já executou bem.

**Convenção:**
- `[R]` reversível sem deploy · `[D]` deploy/DDL · `[!]` toca produção · `[⛔]` requer APROVADO explícito de Joaquim
- `[herdado V3 #N]` indica etapa já concluída no V3 que serve de pré-requisito/base

**Regras de ouro:**
1. Worktree isolado por AGENTS.md/git-worktree-isolation.
2. Um artefato/fix por commit; `--no-verify` apenas se husky travar (registrar exceção).
3. PR por fase; merge somente com CI verde.
4. Nunca desligar Evolution em produção.
5. Banco é fonte de verdade; DDL versionado via migration `YYYYMMDDHHMMSS_descricao.sql`.
6. Nunca editar views de compat manualmente — usar `evo.fn_ensure_evolution_backcompat_views` / allowlist.

---

## 0. Resumo executivo

### 0.1 O que já deu certo (validado no V3 / SCORECARD 8,5/10)
- Separação física de repositórios: `zapp-web-v3` (app/edge) e `evolution-stack` (infra/consumer/image/stacks) ✅
- Runtime separado: imagens `evolution-stack/*` rodando nos stacks 25/113/238/240/262/264 ✅
- Banco: 74 tabelas migradas `evo → zapp`; `authenticated` sem grant de escrita em `evo.*` ✅
- 4 portas de fronteira fechadas: adapter front, gateway edge, ingest-port/RPCs, resolvers SQL vault ✅
- Saúde: health 100.0 A+, 5.077 msgs/24h, DLQ 0 ✅

### 0.2 O que falta para 10/10 (gaps que o V4 fecha)
| Dimensão | Nota V3 | Gap principal | Meta V4 |
|---|---|---|---|
| 9 — Prova de troca de provider | 5/10 | Fake existe, mas runbook incompleto e ensaio real nunca executado | 10/10 via runbook + ensaio medido + rollback validado |
| 10 — Governança e gates CI | 6/10 | Threshold `>15` frouxo; ESLint em `warn`; ADR-008 stub | 10/10 via gates estritos, ESLint error, ADR-008 final |
| 7 — Vault | 9/10 | 2 pares duplicados de secrets | 10/10 via deduplicação com expand/contract |
| 2 — Tabelas evo órfãs | 9/10 | 27 tabelas em `evo` ainda não aposentadas | 10/10 via congelamento formal ou drop após janela |

### 0.3 Riscos críticos a mitigar
1. **Regressão silenciosa:** gate `decouple-guard` com threshold 15 permite até 15 bypasses novos.
2. **Zombie coupling:** arquivos mortos (`evolutionClient.ts`, `healthCheck.ts`) podem ser reimportados acidentalmente.
3. **Secrets duplicados:** rotação pode usar par errado e derrubar envios.
4. **Prova de troca sem rollback:** ensaio mal preparado pode deixar produção sem WhatsApp.
5. **Aposentadoria prematura de tabelas `evo`:** drop sem janela de observação quebra relatórios históricos.

---

## 1. Critérios objetivos de conclusão do desacoplamento

O Zapp Web V3 será considerado **totalmente independente da Evolution API** quando:

1. **Substituibilidade:** for possível trocar o provider WhatsApp (Evolution ↔ Cloud API ↔ fake) em <30 minutos de janela de manutenção, com rollback testado e documentado.
2. **Zero acoplamento direto no front:** nenhum bundle de produção contém string `evolution.atomicabr.com.br`, `VITE_EVOLUTION_API_URL` ou `evolutionClient` fora de `src/_archive/`.
3. **Gates travados:** `decouple-guard` falha em `TOTAL > 0` (com whitelist de tooling); ESLint decouple é `error`.
4. **Egresso centralizado:** 100% das operações de saída (envio, mídia, presença) passam por `whatsappAdapter.ts` → edge function permitida (`evolution-api`/`evolution-proxy`/`whatsapp-cloud-send`).
5. **Ingestão centralizada:** 100% dos eventos de entrada passam por `evolution-webhook`/`whatsapp-cloud-webhook` → RPCs `zapp.rpc_*`.
6. **SQL centralizado:** 100% do egresso SQL para Evolution passa por `ops.fn_evo_url()`/`ops.fn_evo_key()`.
7. **Vault limpo:** apenas 1 par canônico de secrets `evolution_api_key` e `evolution_webhook_secret`; nenhum duplicado.
8. **Docs canônicos:** ADR-008, BOUNDARY-evolution, RUNBOOK_TROCA_PROVIDER e CANONICAL_COLUMN_MAP completos e indexados.
9. **Prova empírica:** ensaio de troca fake↔evolution executado em staging (ou prod em janela noturna) com sucesso documentado.
10. **Scorecard 10/10:** todas as 10 dimensões ≥ 9, com evidências medidas.

---

## F0 · Reconciliação e baseline V4 (1–10) — [R], 0,5 dia

**Objetivo:** alinhar o ponto de partida do V4 com o estado real pós-V3, sem executar mudanças.

1. [R] Criar branch `feat/decouple-v4` em worktree isolado (`chat-hXXXXXX`).
   - **Artefato:** worktree `C:/Users/Joaquim/hermes-workspaces/chat-hXXXXXX`.
   - **Validação:** `[ $(git branch --show-current) = "feat/decouple-v4" ]`.
   - **Rollback:** `git worktree remove ... --force && git branch -D feat/decouple-v4`.
   - **Dependências:** nenhuma.

2. [R] [herdado V3 #1/#2] Revalidar tags `decouple-v3-baseline` e digests de produção.
   - **Artefato:** `docs/decouple/BASELINE_V4.md`.
   - **Validação:** `git tag -l 'decouple-v3-baseline'` + Portainer digests `6f9f1d35` / `75210b9f` / `production-*`.
   - **Rollback:** nenhum (read-only).
   - **Dependências:** V3 F0 concluído.

3. [R] [herdado V3 #91] Consolidar evidências do SCORECARD_V3 e VALIDACAO_V3 num único mapa de resíduos.
   - **Artefato:** `docs/decouple/RESIDUOS_V4.md` com os 12 resíduos reclassificados por criticidade.
   - **Validação:** checklist dos 12 itens com estado inicial e responsável.
   - **Rollback:** nenhum.
   - **Dependências:** leitura de SCORECARD_V3 + VALIDACAO_V3.

4. [R] Mapear todos os consumidores dos 10 secrets `evolution_*` (edge env, stack 25, consumer, SQL resolvers, cron containers).
   - **Artefato:** tabela `docs/decouple/VAULT_CONSUMERS_V4.md`.
   - **Validação:** cada secret listado com ≥1 chamador identificado e comprovado (grep em stack files / edge code / SQL).
   - **Rollback:** nenhum.
   - **Dependências:** acesso aos stack files do evolution-stack.

5. [R] Auditar branches abertos relacionados a desacoplamento.
   - **Artefato:** lista em `docs/decouple/BRANCHES_V4.md`.
   - **Validação:** `gh pr list --search "decouple"` + `git branch -r | grep -i decouple`.
   - **Rollback:** nenhum.
   - **Dependências:** nenhuma.

6. [R] Verificar se `RUNBOOK_TROCA_PROVIDER.md` e `SIMULATION_SCENARIOS_20260814.md` existem e estão atualizados.
   - **Artefato:** nota de status no RESIDUOS_V4.
   - **Validação:** `ls -la docs/decouple/RUNBOOK_TROCA_PROVIDER.md docs/decouple/SIMULATION_SCENARIOS_20260814.md`.
   - **Rollback:** nenhum.
   - **Dependências:** nenhuma.

7. [R] Validar que `evolutionClient.ts` e `healthCheck.ts` estão de fato mortos (0 importadores vivos).
   - **Artefato:** print do comando `grep -R "from '@/integrations/zappweb/evolutionClient'\|from '@/lib/healthCheck'" src/ --include="*.ts" --include="*.tsx"`.
   - **Validação:** 0 resultados fora de testes/comentários.
   - **Rollback:** nenhum.
   - **Dependências:** nenhuma.

8. [R] Validar que `whatsappAdapter.ts` é o único canal de escrita ativo do app.
   - **Artefato:** mapa de chamadas `supabase.functions.invoke` em `src/`.
   - **Validação:** todos os invokes de `evolution-api`/`whatsapp-cloud-send` partem de `whatsappAdapter.ts` ou wrappers autorizados.
   - **Rollback:** nenhum.
   - **Dependências:** nenhuma.

9. [R] PR F0 → main (docs apenas).
   - **Artefato:** PR `docs/decouple-v4-baseline`.
   - **Validação:** CI verde.
   - **Rollback:** `git revert`.
   - **Dependências:** etapas 1–8.

10. [R] Merge F0 e tag `decouple-v4-baseline`.
    - **Artefato:** tag `decouple-v4-baseline` apontando para merge commit.
    - **Validação:** `git tag -v decouple-v4-baseline` (ou `git show decouple-v4-baseline`).
    - **Rollback:** `git tag -d decouple-v4-baseline`.
    - **Dependências:** etapa 9.

---

## F1 · Endurecimento dos gates CI (11–25) — [R][D], 1–2 dias

**Objetivo:** transformar os gates de prevenção de regressão em barreiras reais (dimensão 10 do scorecard).

11. [R] Refinar `scripts/decouple/inventory.mjs` para métrica 4: detectar qualquer construção de URL Evolution direta no `src/` (`fetch(\`...evolution`, `new URL(...evolution`, `VITE_EVOLUTION_API_URL` fora de `_archive`/adapter).
    - **Artefato:** `inventory.mjs` v2.
    - **Validação:** rodar localmente e confirmar que `evolutionClient.ts`/`healthCheck.ts` são flagrados se removidos do `_archive`.
    - **Rollback:** `git revert`.
    - **Dependências:** F0.

12. [R] Definir whitelist de tooling para `inventory.mjs` (arquivos de config, testes, scripts, docs que CASAM strings por design).
    - **Artefato:** `inventory.whitelist.json`.
    - **Validação:** CI passa com whitelist explícita; remoção de um item da whitelist faz CI falhar.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 11.

13. [D] Atualizar `.github/workflows/decouple-guard.yml`: threshold `TOTAL > 15` → `TOTAL > 0`.
    - **Artefato:** workflow atualizado.
    - **Validação:** PR dummy com 1 bypass deve falhar; depois revertido.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 11–12.

14. [D] Promover regra ESLint decouple de `warn` para `error`.
    - **Artefato:** `eslint.config.js` atualizado.
    - **Validação:** `npm run lint` (ou `bun run lint`) falha se houver violação; passa no estado atual.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 13.

15. [R] Refinar `scripts/decouple/sql-gate.mjs`: ignorar mensagens de erro (`'evolution_api_url ausente'`) e flagrar apenas chamadas reais `net.http_(get|post)` + leitura `vault.decrypted_secrets` fora de `{fn_evo_url, fn_evo_key}`.
    - **Artefato:** `sql-gate.mjs` v2.
    - **Validação:** rodar contra DB de staging/prod e retornar 0 falsos-positivos.
    - **Rollback:** `git revert`.
    - **Dependências:** F0.

16. [D] Adicionar `sql-gate.mjs` ao CI em `.github/workflows/db-reference-integrity.yml` (ou workflow dedicado `sql-egress-gate.yml`).
    - **Artefato:** workflow novo/atualizado.
    - **Validação:** CI verde no PR; introdução de fn fora do whitelist faz CI falhar.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 15.

17. [R] Criar teste de contrato Zod para `whatsappAdapter.ts` (tipos de entrada/saída).
    - **Artefato:** `src/lib/whatsappAdapter.contract.test.ts`.
    - **Validação:** `vitest run whatsappAdapter.contract.test.ts` passa.
    - **Rollback:** `git revert`.
    - **Dependências:** nenhuma.

18. [D] Adicionar smoke test de egresso edge no CI (chamada a `evolution-proxy`/`evolution-api` com fixture, sem depender de Evolution online).
    - **Artefato:** teste em `supabase/functions/evolution-proxy/__tests__/smoke.test.ts`.
    - **Validação:** CI passa; quebra se allowlist/path mudar sem teste.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 17.

19. [D] PR F1 → main.
    - **Artefato:** PR com todas as mudanças de F1.
    - **Validação:** todos os gates verdes (`decouple-guard`, ESLint, `sql-gate`, vitest).
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 11–18.

20. [R] Teste deliberado de regressão: PR dummy adicionando 1 import de `evolutionClient` em `src/` → CI deve falhar.
    - **Artefato:** evidência de falha salva em `docs/decouple/GATE_TEST_F1.md`.
    - **Validação:** screenshot/logs do CI falhando.
    - **Rollback:** fechar o PR sem merge.
    - **Dependências:** etapa 19 merged.

21. [R] [herdado V3 #15] Revalidar `ownership-gate.mjs` vs `inventory.mjs` e consolidar num único runner.
    - **Artefato:** `scripts/decouple/run-all-gates.mjs`.
    - **Validação:** `./run-all-gates.mjs` retorna exit 0 no estado atual.
    - **Rollback:** `git revert`.
    - **Dependências:** V3 F1.

22. [D] Endurecer CI para exigir `run-all-gates.mjs` verde em todo PR que toca `src/integrations/zappweb`, `src/lib/whatsappAdapter*`, `supabase/functions/evolution-*`.
    - **Artefato:** `.github/workflows/decouple-guard.yml` atualizado.
    - **Validação:** CI falha se gate quebrar.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 21.

23. [R] Documentar os 3 gates vivos em `docs/decouple/GATES.md`: responsabilidade, threshold, exemplo de falha.
    - **Artefato:** `docs/decouple/GATES.md`.
    - **Validação:** revisão humana.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 13–22.

24. [R] Atualizar SCORECARD_V3 dimensão 10 para nota 9/10 (pendente apenas ADR-008).
    - **Artefato:** `docs/decouple/SCORECARD_V4_PARCIAL.md`.
    - **Validação:** justificativa escrita.
    - **Rollback:** nenhum.
    - **Dependências:** etapas 13–23.

25. [D] PR F1.1 → main (consolidação de gates + docs).
    - **Artefato:** PR.
    - **Validação:** CI verde.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 21–24.

---

## F2 · Aposentadoria de código morto (26–35) — [R][D], 1 dia

**Objetivo:** remover stubs/zumbis que não são mais usados, sem arriscar regressão.

26. [R] Confirmar que `src/integrations/zappweb/evolutionClient.ts` e `src/lib/healthCheck.ts` têm 0 importadores vivos e 0 referências no bundle de prod.
    - **Artefato:** evidências de grep + grep no bundle.
    - **Validação:** 0 resultados.
    - **Rollback:** nenhum.
    - **Dependências:** F1 gates endurecidos.

27. [D] Mover `evolutionClient.ts` e `healthCheck.ts` para `src/_archive/` com banner de deprecação.
    - **Artefato:** arquivos arquivados.
    - **Validação:** build continua passando; nenhum import quebrado.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 26.

28. [D] Marcar `VITE_EVOLUTION_API_URL` e `VITE_EVOLUTION_API_KEY` como DEPRECATED/REMOVIDO em `.env.example` e `docs/ENV_SETUP.md`.
    - **Artefato:** docs atualizados.
    - **Validação:** grep por `VITE_EVOLUTION_API_URL` em `.env.example` mostra apenas comentário de deprecação.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 27.

29. [D] Adicionar regra ESLint proibindo `VITE_EVOLUTION_API_URL`/`VITE_EVOLUTION_API_KEY` fora de `src/_archive/`.
    - **Artefato:** `eslint.config.js`.
    - **Validação:** `npm run lint` passa.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 28.

30. [D] Build + deploy de F2; smoke do inbox (enviar/receber texto na wpp2).
    - **Artefato:** CI/CD verde; evidência de smoke.
    - **Validação:** Evolution MCP mostra wpp2 open; health score mantido.
    - **Rollback:** redeploy do digest anterior (`decouple-v4-baseline`).
    - **Dependências:** etapas 27–29.

31. [R] Re-grep no bundle servido pós-deploy: 0 referências a `VITE_EVOLUTION_API_URL`/`evolutionClient`/`healthCheck`.
    - **Artefato:** evidência em `docs/decouple/F2_BUNDLE_CHECK.md`.
    - **Validação:** 0 matches.
    - **Rollback:** nenhum.
    - **Dependências:** etapa 30.

32. [R] [herdado V3 #81] Recriar `check-publish-evo-fallbacks` em `evolution-stack/image/tests/` se ainda não existir.
    - **Artefato:** teste no evolution-stack.
    - **Validação:** `bun test`/`deno test` passa no evolution-stack.
    - **Rollback:** `git revert`.
    - **Dependências:** V3 F8.

33. [D] PR F2 → main.
    - **Artefato:** PR.
    - **Validação:** CI verde.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 27–32.

34. [R] Verificar branches zumbis (`feat/decouple-v2`, `feat/decouple-provider`, `chore/remove-evolution-infra-to-evolution-stack`, `docs/pos-desacoplamento-20260814`) e propor deleção se estiverem obsoletos.
    - **Artefato:** `docs/decouple/BRANCHES_V4.md` atualizado.
    - **Validação:** branches deletados ou justificados.
    - **Rollback:** `git push origin <branch>:<branch>` de backup.
    - **Dependências:** F0 etapa 5.

35. [D] PR F2.1 → main (limpeza de branches + docs).
    - **Artefato:** PR.
    - **Validação:** CI verde.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 34.

---

## F3 · Gateway SQL canônico e resolvers (36–45) — [R][D], 1–2 dias

**Objetivo:** formalizar a 4ª porta de egresso SQL e eliminar falsos-positivos.

36. [R] [herdado V3 #31] Revalidar `ADR-010-sql-gateway.md` e atualizar com design real (`ops.fn_evo_url`/`fn_evo_key`).
    - **Artefato:** ADR-010 finalizado.
    - **Validação:** documento reflete código real.
    - **Rollback:** `git revert`.
    - **Dependências:** V3 F3.

37. [R] Refresh do backup de corpos SQL (`ops.fn_bodies_backup`) das 6 funções egressoras.
    - **Artefato:** migration `20260814120000_refresh_fn_bodies_backup.sql`.
    - **Validação:** `SELECT count(*) FROM ops.fn_bodies_backup WHERE backed_at >= now() - interval '1 hour'` = 6.
    - **Rollback:** `git revert` + restaurar backup anterior.
    - **Dependências:** nenhuma.

38. [D] Corrigir strings de erro que citam `evolution_api_url ausente` para `ops.fn_evo_url() ausente` (3 arquivos).
    - **Artefato:** migration/PR.
    - **Validação:** `sql-gate.mjs` retorna 0 matches.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 37.

39. [D] Criar/refresh view `ops.v_sql_egress` (fn → provider → endpoint → último uso) se ainda não existir.
    - **Artefato:** migration `20260814130000_create_v_sql_egress.sql`.
    - **Validação:** `SELECT * FROM ops.v_sql_egress` lista 5 funções.
    - **Rollback:** `DROP VIEW ops.v_sql_egress;`.
    - **Dependências:** etapa 38.

40. [R] Auditar `SECURITY DEFINER` + owner + `search_path` fixo nas 6 funções egressoras.
    - **Artefato:** relatório em `docs/decouple/F3_SECURITY_REPORT.md`.
    - **Validação:** query confirmando `prosecdef=true` e `proconfig` com `search_path`.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 37.

41. [D] [herdado V3 #37] Validar `fn_validate_whatsapp_connection_url` e `fn_sync_lid_from_api` pós-edição por 1 ciclo do cron.
    - **Artefato:** logs dos crons.
    - **Validação:** 0 falhas.
    - **Rollback:** `CREATE OR REPLACE` a partir do backup.
    - **Dependências:** V3 F3.

42. [R] Cron-watch 48h: monitorar crons 317/318/329/429.
    - **Artefato:** evidência em `docs/decouple/F3_CRON_WATCH.md`.
    - **Validação:** 0 falhas novas.
    - **Rollback:** nenhum.
    - **Dependências:** etapa 41.

43. [R] Atualizar `docs/decouple/BOUNDARY-evolution.md` com a fronteira LÓGICA (4 portas + Grupo A/B).
    - **Artefato:** BOUNDARY-evolution.md v2.
    - **Validação:** revisão cruzada com ADR-009/010.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 36–40.

44. [D] PR F3 → main.
    - **Artefato:** PR.
    - **Validação:** CI verde; `sql-gate.mjs` 0 matches.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 37–43.

45. [R] Atualizar SCORECARD_V3 dimensões 5, 6, 7 para 10/10 (com exceção de vault duplicado, que fica para F4).
    - **Artefato:** `SCORECARD_V4_PARCIAL.md`.
    - **Validação:** justificativa escrita.
    - **Rollback:** nenhum.
    - **Dependências:** etapa 44.

---

## F4 · Consolidação de segredos no vault (46–55) — [D][!][⛔], 2–3 dias

**Objetivo:** eliminar os 2 pares duplicados de secrets (`evolution_api_key`/`evolution_api_key_v2`; `evolution_webhook_secret`/`webhook_secret_evolution`).

46. [R] [herdado V3 #41/#42] Inventariar e classificar pares duplicados; decidir canônico por evidência de uso real.
    - **Artefato:** `docs/decouple/VAULT_SECRETS.md`.
    - **Validação:** cada par tem canônico definido com base em logs/último uso.
    - **Rollback:** nenhum.
    - **Dependências:** V3 F4.

47. [⛔] APROVADO → documentar plano de migração expand/contract em `docs/decouple/VAULT_ROADMAP_V4.md`.
    - **Artefato:** roadmap com passos, janela, critérios de abort.
    - **Validação:** revisão e aprovação de Joaquim.
    - **Rollback:** não executar sem APROVADO.
    - **Dependências:** etapa 46.

48. [⛔][!] Criar secrets canônicos novos (`evolution_api_key_canonical`, `evolution_webhook_secret_canonical`) com valores idênticos aos atuais.
    - **Artefato:** secrets criados no vault/edge env.
    - **Validação:** `SELECT name FROM vault.decrypted_secrets WHERE name LIKE 'evolution_%_canonical';` retorna 2.
    - **Rollback:** `DELETE FROM vault.secrets WHERE name IN (...)`.
    - **Dependências:** etapa 47.

49. [⛔][!] Migrar consumidor a consumidor (1 por commit/PR): resolvers SQL, stack 25, consumer, edge functions, cron containers.
    - **Artefato:** 1 PR por consumidor.
    - **Validação:** cada PR deployado e health mantido antes do próximo.
    - **Rollback:** reverter para secret antigo.
    - **Dependências:** etapa 48.

50. [⛔][!] Após 48h verdes: rotacionar a key canônica (nova apikey na Evolution) em janela noturna.
    - **Artefato:** log de rotação.
    - **Validação:** critério de abort: >1% falha de envio.
    - **Rollback:** restaurar key anterior no vault.
    - **Dependências:** etapa 49.

51. [⛔][!] Após 48h verdes pós-rotação: apagar pares obsoletos (`evolution_api_key_v2`, `webhook_secret_evolution` e alias antigos).
    - **Artefato:** migration/ops script.
    - **Validação:** `SELECT count(*) FROM vault.decrypted_secrets WHERE name IN (...)` = 0.
    - **Rollback:** recriar secrets com valores salvos em cofre externo.
    - **Dependências:** etapa 50.

52. [R] Normalizar alias `evolution_api_key_v6→v4` no stack file 25 e documentar.
    - **Artefato:** PR no evolution-stack.
    - **Validação:** `docker service inspect evolution_evolution` mostra alias correto.
    - **Rollback:** `git revert` + redeploy.
    - **Dependências:** etapa 51.

53. [R] Atualizar runbook de rotação de secrets (`docs/decouple/VAULT_ROTATION_RUNBOOK.md`).
    - **Artefato:** runbook.
    - **Validação:** passo a passo testável.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 50–52.

54. [D] PR F4 → main (zapp) e PR no evolution-stack.
    - **Artefato:** 2 PRs.
    - **Validação:** CI verde; health mantido.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 49–53.

55. [R] Atualizar SCORECARD_V3 dimensão 7 para 10/10.
    - **Artefato:** `SCORECARD_V4_PARCIAL.md`.
    - **Validação:** 1 par canônico de cada secret.
    - **Rollback:** nenhum.
    - **Dependências:** etapa 54.

---

## F5 · Prova real de substituibilidade (56–70) — [R][D][!], 3–5 dias

**Objetivo:** fechar dimensão 9 do scorecard com evidência empírica de troca de provider.

56. [R] [herdado V3 #51] Verificar guard `DENO_ENV=test` no fake provider/registry.
    - **Artefato:** evidência de código.
    - **Validação:** fake só ativa em teste.
    - **Rollback:** nenhum.
    - **Dependências:** V3 F5.

57. [R] Completar `docs/decouple/RUNBOOK_TROCA_PROVIDER.md` com: pré-condições, passos, tempo estimado, pontos de falha, rollback.
    - **Artefato:** runbook completo.
    - **Validação:** revisão por segundo par; cada passo tem comando/exemplo.
    - **Rollback:** `git revert`.
    - **Dependências:** nenhuma.

58. [R] Criar `docs/decouple/CANONICAL_COLUMN_MAP.md` (mapa coluna×campo, fonte: `src/domain/messaging/types.ts` + normalizers).
    - **Artefato:** documento.
    - **Validação:** cobertura de todos os campos usados pelo app.
    - **Rollback:** `git revert`.
    - **Dependências:** nenhuma.

59. [R] Ensaio cronometrado de troca fake↔evolution em ambiente de teste local.
    - **Artefato:** relatório com tempo real e logs.
    - **Validação:** <30 minutos; rollback <10 minutos.
    - **Rollback:** nenhum.
    - **Dependências:** etapas 57–58.

60. [D] Implementar feature flag de modo WhatsApp por workspace (`whatsapp_mode: unofficial | official | fake`) se ainda não existir de forma operacional.
    - **Artefato:** migration + UI/admin mínima.
    - **Validação:** `resolveTransport()` respeita a flag.
    - **Rollback:** `git revert` + migration reversa.
    - **Dependências:** etapa 59.

61. [D] Criar suite e2e de troca de provider: iniciar em `fake`, enviar/receber fixture, trocar para `evolution`, enviar/receber real (em staging), voltar para `fake`.
    - **Artefato:** `tests/e2e/provider-swap.spec.ts`.
    - **Validação:** CI passa em staging.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 60.

62. [R] Teste de degradação: Evolution offline → app mostra erro explícito, não quebra.
    - **Artefato:** teste/relatório.
    - **Validação:** UI continua renderizando; mensagem de erro clara.
    - **Rollback:** nenhum.
    - **Dependências:** etapa 61.

63. [⛔][!] Ensaio real de troca (evolution → fake → evolution) em staging com critérios de abort.
    - **Artefato:** relatório `docs/decouple/ENSAIO_TROCA_STAGING_V4.md`.
    - **Validação:** 0 falhas de envio durante o ensaio.
    - **Rollback:** voltar modo para `unofficial`.
    - **Dependências:** etapa 61 + APROVADO.

64. [⛔][!] Ensaio real de troca (evolution → fake → evolution) em produção em janela noturna (opcional, alto risco).
    - **Artefato:** relatório `docs/decouple/ENSAIO_TROCA_PROD_V4.md`.
    - **Validação:** critérios de abort: >1% falha, DLQ >0, p95 >2× baseline.
    - **Rollback:** voltar modo para `unofficial` imediatamente.
    - **Dependências:** etapa 63 + APROVADO.

65. [R] Atualizar `SCORECARD_V3` dimensão 9 para 10/10 (se ensaio real for feito) ou 8/10 (se apenas staging).
    - **Artefato:** `SCORECARD_V4_PARCIAL.md`.
    - **Validação:** nota justificada com evidência.
    - **Rollback:** nenhum.
    - **Dependências:** etapas 63–64.

66. [R] Criar teste de contrato dos 11 verbos do gateway (evolution-proxy/evolution-api) antes de qualquer upgrade Evolution.
    - **Artefato:** `supabase/functions/evolution-proxy/__tests__/contract-11-verbos.test.ts`.
    - **Validação:** CI passa.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 61.

67. [D] Adicionar contrato-test ao CI obrigatório para PRs que toquem `supabase/functions/evolution-*`.
    - **Artefato:** workflow atualizado.
    - **Validação:** CI falha se contrato quebrar.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 66.

68. [R] Registrar lições aprendidas em `docs/decouple/RETRO_V4.md`.
    - **Artefato:** retro.
    - **Validação:** honesto; cita o que não funcionou.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 63–65.

69. [D] PR F5 → main.
    - **Artefato:** PR.
    - **Validação:** CI verde.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 57–68.

70. [R] Atualizar `FEATURE_REGISTRY.md`/`CHANGELOG.md` com marco de prova de substituibilidade.
    - **Artefato:** docs.
    - **Validação:** revisão.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 69.

---

## F6 · Documentação canônica final (71–80) — [R], 1–2 dias

**Objetivo:** fechar dimensão 10 do scorecard e deixar fonte de verdade única.

71. [R] Completar `docs/decouple/ADR-008-canonical-domain-model.md` com tipos, mapeamento Baileys↔Meta↔canônico, coluna Postgres↔campo.
    - **Artefato:** ADR-008 final.
    - **Validação:** ≥5x o tamanho atual; revisão cruzada com CANONICAL_COLUMN_MAP.
    - **Rollback:** `git revert`.
    - **Dependências:** F5 etapa 58.

72. [R] Atualizar `docs/decouple/ADR-009-gateway-pattern.md` com referência à 4ª porta SQL (ADR-010).
    - **Artefato:** ADR-009 v2.
    - **Validação:** consistente com código.
    - **Rollback:** `git revert`.
    - **Dependências:** F3 etapa 36.

73. [R] [herdado V3 #64] Marcar V1, V2 e 4 HANDOFFs como HISTÓRICO com banner + link canônico.
    - **Artefato:** banners nos docs.
    - **Validação:** nenhum doc vivo referencia informação obsoleta sem contexto.
    - **Rollback:** `git revert`.
    - **Dependências:** V3 F6.

74. [R] Criar `docs/decouple/README.md` como índice canônico (vivo/histórico).
    - **Artefato:** README.
    - **Validação:** 1 entrada por doc; V4 marcado como canônico.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 71–73.

75. [R] Atualizar `README.md` principal do zapp: seção "Integrações → WhatsApp" aponta para ADR-008/009/010 + BOUNDARY + RUNBOOK.
    - **Artefato:** README.md.
    - **Validação:** links funcionam.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 71–74.

76. [R] Atualizar `README.md` do evolution-stack: stack IDs reais (purge 238, watchdogs 240, functions-health 265) e tags/releases.
    - **Artefato:** PR no evolution-stack.
    - **Validação:** informação condiz com Portainer.
    - **Rollback:** `git revert`.
    - **Dependências:** F0 etapa 2.

77. [R] Completar `docs/decouple/DOC_UPDATE_ORCHESTRATION_20260814.md` nos docs vivos restantes.
    - **Artefato:** matriz A1–A10 completa.
    - **Validação:** cada célula preenchida.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 71–76.

78. [R] Verificar que nenhum doc vivo referencia "relicto da fase Lovable" ou estado pré-desacoplamento sem banner.
    - **Artefato:** evidência de grep.
    - **Validação:** 0 matches fora de histórico.
    - **Rollback:** nenhum.
    - **Dependências:** etapas 71–77.

79. [D] PR F6 → main.
    - **Artefato:** PR.
    - **Validação:** CI verde.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 71–78.

80. [R] Atualizar SCORECARD_V3 dimensão 10 para 10/10.
    - **Artefato:** `SCORECARD_V4_FINAL.md`.
    - **Validação:** justificativa.
    - **Rollback:** nenhum.
    - **Dependências:** etapa 79.

---

## F7 · Governança de infra no evolution-stack (81–88) — [⛔][D][!], 2–3 dias

**Objetivo:** fechar G4/G5/G6/G7 do V3 e alinhar repo com runtime.

81. [⛔][R] Snapshot das configs atuais de `evolution-security-guardian` e `evolution-pgbackrest-backup` (`docker service inspect`).
    - **Artefato:** `stacks/snapshots/`.
    - **Validação:** arquivos JSON salvos.
    - **Rollback:** restaurar config.
    - **Dependências:** V3 F7 + APROVADO.

82. [⛔][D][!] G4a: `evolution-security-guardian` como stack versionada (`stacks/evolution-security-guardian.yml`).
    - **Artefato:** stack file + deploy.
    - **Validação:** heartbeat continua.
    - **Rollback:** redeploy anterior.
    - **Dependências:** etapa 81.

83. [⛔][D][!] G4b: `evolution-pgbackrest-backup` como stack versionada.
    - **Artefato:** stack file + deploy.
    - **Validação:** backup agendado continua.
    - **Rollback:** redeploy anterior.
    - **Dependências:** etapa 82.

84. [⛔][D] G5: imagem base de watchdog com bash/psql/curl/jq embutidos.
    - **Artefato:** `image/watchdog-base/Dockerfile` + push GHCR.
    - **Validação:** build + push verde.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 83.

85. [⛔][D][!] Migrar 1 serviço watchdog por commit para base nova, soak entre eles.
    - **Artefato:** 5 PRs/commits.
    - **Validação:** cada serviço saudável antes do próximo.
    - **Rollback:** redeploy do digest anterior.
    - **Dependências:** etapa 84.

86. [⛔][R] G6: preencher `EXPECTED_DIGEST` no `portainer-drift-check.sh` (`6f9f1d35`, `75210b9f`) e validar alerta sintético.
    - **Artefato:** script atualizado.
    - **Validação:** alerta dispara quando digest diverge.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 85.

87. [D] PR F7 → main no evolution-stack.
    - **Artefato:** PR.
    - **Validação:** CI GitOps verde.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 82–86.

88. [R] Criar tag `decouple-v4-infra` no evolution-stack.
    - **Artefato:** tag.
    - **Validação:** `git tag -l 'decouple-v4-infra'`.
    - **Rollback:** `git tag -d`.
    - **Dependências:** etapa 87.

---

## F8 · Aposentadoria de tabelas evo órfãs (89–93) — [⛔][D][!], 1–2 dias

**Objetivo:** fechar dimensão 2 do scorecard sem perder dados históricos.

89. [R] Inventariar as 27 tabelas `evo.evolution_*` remanescentes e classificar: (a) usadas por crons/ops, (b) usadas por relatórios/Metabase, (c) realmente órfãs.
    - **Artefato:** `docs/decouple/EVO_TABLES_RETIREMENT.md`.
    - **Validação:** cada tabela classificada com evidência (query de último acesso, dependências).
    - **Rollback:** nenhum.
    - **Dependências:** F0.

90. [R] Para tabelas usadas: documentar dependência e adiar drop (congelamento formal).
    - **Artefato:** nota no EVO_TABLES_RETIREMENT.
    - **Validação:** revisão.
    - **Rollback:** nenhum.
    - **Dependências:** etapa 89.

91. [⛔][!] Para tabelas órfãs: fazer backup lógico (`pg_dump -t evo.tabela`) para `archive` / S3 antes de drop.
    - **Artefato:** arquivos de backup.
    - **Validação:** checksum + teste de restore em staging.
    - **Rollback:** restore do dump.
    - **Dependências:** etapa 90 + APROVADO.

92. [⛔][!] Drop das tabelas `evo` órfãs em janela de manutenção.
    - **Artefato:** migration `202608XX000000_drop_evo_orphan_tables.sql`.
    - **Validação:** `SELECT count(*) FROM pg_tables WHERE schemaname='evo' AND tablename LIKE 'evolution_%'` reduzido.
    - **Rollback:** restore do dump.
    - **Dependências:** etapa 91.

93. [R] Atualizar SCORECARD_V3 dimensão 2 para 10/10.
    - **Artefato:** `SCORECARD_V4_FINAL.md`.
    - **Validação:** justificativa.
    - **Rollback:** nenhum.
    - **Dependências:** etapa 92.

---

## F9 · Validação exaustiva independente e encerramento (94–100) — [R][!], 2 dias

**Objetivo:** provar que o desacoplamento atingiu os critérios de conclusão.

94. [R] Onda de 10 agentes paralelos validando cada frente com evidência fresca (DB, Portainer, repo×prod digests, bundle front, edge runtime, vault, crons, evolution-stack GitOps, CI gates, docs).
    - **Artefato:** `docs/decouple/VALIDACAO_V4.md`.
    - **Validação:** 1 seção por agente com query/output/screenshot.
    - **Rollback:** nenhum.
    - **Dependências:** F1–F8.

95. [R] Reconferir os 4 gates: inventory 0/0/0/0 · SQL egress whitelist · CI threshold 0 · grants authenticated em `evo.evolution_*` = 0.
    - **Artefato:** evidências na VALIDACAO_V4.
    - **Validação:** todos verdes.
    - **Rollback:** nenhum.
    - **Dependências:** etapa 94.

96. [R] Reconferir saúde: health score A+, msgs/24h ≈ baseline, DLQ 0, wpp2 open.
    - **Artefato:** evidências na VALIDACAO_V4.
    - **Validação:** todos dentro do baseline.
    - **Rollback:** nenhum.
    - **Dependências:** etapa 95.

97. [R] Scorecard 10/10 (modelo Joaquim): 10 dimensões × nota com evidência.
    - **Artefato:** `docs/decouple/SCORECARD_V4_FINAL.md`.
    - **Validação:** todas as dimensões ≥ 9.
    - **Rollback:** nenhum.
    - **Dependências:** etapas 94–96.

98. [D] PR final `feat/decouple-v4` → main; CI verde; merge squash.
    - **Artefato:** PR mergeado.
    - **Validação:** CI verde; tag `decouple-v4-complete`.
    - **Rollback:** `git revert`.
    - **Dependências:** etapas 94–97.

99. [R] Retro `docs/decouple/RETRO_V4.md`: números medidos, tempo real, o que ficou de fora (explícito).
    - **Artefato:** retro.
    - **Validação:** honesto.
    - **Rollback:** `git revert`.
    - **Dependências:** etapa 98.

100. [R] Encerramento: deletar branch + worktree; marcar V4 como doc canônico do desacoplamento.
     - **Artefato:** cleanup.
     - **Validação:** `git worktree list` sem o worktree; `git branch -a` sem `feat/decouple-v4`.
     - **Rollback:** recriar branch de backup se necessário.
     - **Dependências:** etapa 99.

---

## Simulação de cenários de falha e gaps (validação antes da execução)

| # | Cenário | O que aconteceria se feito errado | Mitigação no V4 |
|---|---|---|---|
| S1 | Travar CI em TOTAL=0 sem whitelist | `inventory.mjs`, testes e arquivos de config casam strings por design → CI trava e ninguém consegue mergear | F1 E12: whitelist explícita antes de endurecer threshold |
| S2 | Arquivar `evolutionClient.ts` sem varrer bundle | lazy import ou dynamic require revive o arquivo em runtime → erro no app | F2 E26-E27: grep no bundle de prod + build smoke |
| S3 | Promover ESLint decouple para `error` sem corrigir violações legítimas | todos os PRs passam a falhar, travando o time | F1 E14: corrigir violações primeiro; depois `warn → error` |
| S4 | Consolidar secrets deletando par antigo direto | consumidor com env cacheado (edge runtime, stack secret) quebra envios | F4 E47-E51: expand/contract + 48h de observação entre passos |
| S5 | Rotacionar apikey sem fallback de emergência | todos os envios param até correção manual | F4 E50: critério de abort >1% falha; rollback imediato |
| S6 | Migrar 5 watchdogs simultaneamente para nova imagem | bug na imagem base derruba todos os watchdogs de uma vez | F7 E85: 1 serviço por commit, soak entre eles |
| S7 | Mover guardian/pgbackrest para stack sem exportar config atual | config externa perdida → watchdog/backup morre | F7 E81: snapshot `docker service inspect` antes |
| S8 | Fake provider mal guardado ativa em produção | mensagens não saem e usuário não percebe | F5 E56: verificar `DENO_ENV=test`; F5 E60: feature flag por workspace |
| S9 | Ensaio de troca em horário comercial | janela de erro atinge clientes reais | F5 E64: janela noturna + critérios de abort |
| S10 | Drop de tabelas `evo` sem backup | perda de dados históricos e relatórios | F8 E91: backup lógico + teste de restore antes do drop |
| S11 | Atualizar ADR-008 sem sincronizar CANONICAL_COLUMN_MAP | implementação e documentação divergem | F6 E71-E72: revisão cruzada obrigatória |
| S12 | Marcar V1/V2 como histórico sem banner com link canônico | próximo agente segue plano obsoleto | F6 E73: banner + link para V4 em cada doc antigo |
| S13 | `sql-gate.mjs` não ignorar mensagens de erro | CI falha em strings inofensivas → gate é ignorado | F1 E15: regex refinado para ignorar literais de erro |
| S14 | `decouple-guard` threshold 0 sem métrica 4 | alguém cria `fetch` direto para Evolution no front e não é detectado | F1 E11: adicionar métrica 4 antes de travar threshold |
| S15 | Deletar branches zumbis com PR aberta | PR orfã e confusão de CI | F2 E34: conferir PRs/estado antes de deletar |
| S16 | Upgrade Evolution 2.4.0-rc2 sem revalidar contrato dos 11 verbos | envelope/endpoint muda → gateway quebra em cascata | F5 E66-E67: contrato-test obrigatório antes do upgrade |
| S17 | Não documentar rollback do runbook de troca | operador não sabe como voltar em <10 min | F5 E57: ensaio cronometrado de rollback; F5 E58/E63: passos no runbook |
| S18 | Scorecard 10/10 sem evidência | vitória fabricada | F9 E94-E97: onda de 10 agentes + evidências medidas |
| S19 | Limpar worktree antes de merge final | perde-se histórico da branch | F9 E100: deletar apenas após merge e tag |
| S20 | Ignorar resíduos de nomeclatura `evolution_*` em tabelas zapp | app continua psicologicamente acoplado, dificulta futura migração | F6 E71: ADR-008 canônico + comunicação interna; NÃO renomear sem compat |

---

## Checklist final de critérios de conclusão

- [ ] Scorecard 10/10 com evidências (`SCORECARD_V4_FINAL.md`)
- [ ] Gates CI travados: `decouple-guard` TOTAL=0, ESLint decouple=error, `sql-gate` 0 matches
- [ ] Prova de troca de provider documentada e ensaiada (staging; prod opcional)
- [ ] Vault sem secrets duplicados (`evolution_api_key`, `evolution_webhook_secret` únicos)
- [ ] `src/_archive/` contém `evolutionClient.ts`/`healthCheck.ts`; bundle prod sem referências
- [ ] 100% de egresso via `whatsappAdapter.ts` → edge permitida
- [ ] 100% de egresso SQL via `ops.fn_evo_url()`/`fn_evo_key()`
- [ ] Docs canônicos completos: ADR-008, ADR-009, ADR-010, BOUNDARY, RUNBOOK, CANONICAL_COLUMN_MAP
- [ ] `evo` tabelas órfãs aposentadas (drop ou congelamento formal)
- [ ] Tags `decouple-v4-baseline`, `decouple-v4-complete` e `decouple-v4-infra`

---

*Documento gerado em 2026-08-14 como evolução do PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md. Estado de partida: migração aprovada, 12 resíduos, nota 8,5/10 no SCORECARD_V3.*
