# FASE 10 — INFRA/OPS/DOCS/VALIDAÇÃO FINAL

## Etapa 91 — Corrigir evolution-db-purge OOM (137) + command not found (127)
**Objetivo:** Restaurar o job `evolution-db-purge` a execução saudável, eliminando os exit codes 137 (OOM) e 127 (entrypoint ausente).
**Base:** findings-22.md:45 (DADO-03/REDE-05/SAUDE-03 ❌ PENDENTE P1) e pendencias-consolidadas.md:574.
### Subetapas
- [ ] 91.1 Listar o estado atual do serviço/container no Swarm via Portainer MCP: status, restart count, exit codes das últimas execuções, imagem e entrypoint em uso
- [ ] 91.2 Coletar logs completos das execuções Exited(137) e Exited(127) e separar qual erro ocorre em qual imagem/versão (OOM vs binário/entrypoint inexistente)
- [ ] 91.3 Ler a definição do stack no repo (compose/stack supabase): memory limit/reservation, imagem, entrypoint, command, schedule
- [ ] 91.4 Diagnosticar o 127: comparar imagem atual com a última imagem que executou com sucesso (tag/entrypoint/workdir/arquitetura) e confirmar a causa raiz do "command not found"
- [ ] 91.5 Diagnosticar o 137: medir consumo real do purge (tamanho das tabelas alvo, janela de retenção) e confirmar que o memory limit atual é insuficiente
- [ ] 91.6 Corrigir a imagem/entrypoint: apontar para imagem validada e testar o comando do purge manualmente (`docker run --rm` com mesmos args) até exit 0
- [ ] 91.7 Ajustar memória no stack (ex.: 512Mi → 1Gi, com reservation adequada) e adicionar healthcheck real (endpoint de liveness, não wget de SPA)
- [ ] 91.8 Aplicar a correção no stack versionado do repo e fazer `docker stack deploy` na VPS (janela de manutenção curta)
- [ ] 91.9 Validar em runtime: 3+ execuções consecutivas com exit 0, logs evidenciando purge real (registros deletados) e sem impacto nas tabelas de produção
- [ ] 91.10 Fechar o item DADO-03/REDE-05/SAUDE-03 no reconciliation.csv/EXECUTIVE_SUMMARY com evidência e registrar alerta de monitoramento para exit code != 0
### Critério de conclusão (checklist da etapa)
- [ ] evolution-db-purge executa com exit 0 por 3+ ciclos consecutivos (evidência em logs)
- [ ] Causa do 127 (imagem/entrypoint) e do 137 (memória) documentadas e corrigidas no stack versionado
- [ ] Memory limit/healthcheck atualizados e aplicados no Swarm
- [ ] DADO-03/REDE-05/SAUDE-03 marcado como resolvido no artefato de reconciliação

## Etapa 92 — Neutralizar deploy DRAFT concorrente e religar observabilidade pós-deploy
**Objetivo:** Eliminar o risco de deploy DRAFT concorrente com produção e religar post-deploy-check e notificações de falha que hoje não disparam.
**Base:** findings-12 (pendencias-consolidadas.md:500-501): `deploy-vps-selfhosted.yml` "⚠️ DRAFT — NÃO ativar" ATIVO em todo push; `post-deploy-check.yml` escuta nome errado; `notify-ci-failure` mira 5 workflows inexistentes.
### Subetapas
- [ ] 92.1 Ler `deploy-vps-selfhosted.yml` no repo e confirmar estado ativo (paths comentados, sem `if: false`, concurrency separado)
- [ ] 92.2 Comparar com o workflow canônico "🚀 Build & Deploy..." e decidir: desativar o DRAFT (guard `if: false` + remoção) ou fundir no canônico — sem dupla via de deploy
- [ ] 92.3 Unificar `concurrency` groups para que DRAFT/deploy canônico nunca rodem em paralelo na mesma branch/ref
- [ ] 92.4 Corrigir `post-deploy-check.yml`: trigger apontando para o nome REAL do workflow de deploy (event `workflow_run` com tipos corretos)
- [ ] 92.5 Corrigir `notify-ci-failure.yml`: substituir os 5 nomes inexistentes pelos nomes reais dos workflows ativos (ou remover referências mortas)
- [ ] 92.6 Adicionar gate estático de integridade de workflows (script que valida names×triggers×arquivos, ex. actionlint + checker de referências cruzadas) no CI
- [ ] 92.7 Abrir PR com as correções e evidência de validação local (actionlint/yamllint sem erros)
- [ ] 92.8 Merge e verificar no GitHub Actions que post-deploy-check dispara após um deploy real subsequente
- [ ] 92.9 Simular falha em um workflow e confirmar que notify-ci-failure entrega a notificação (issue/comment/slack conforme config)
- [ ] 92.10 Documentar a topologia de CI/CD de deploy (workflows × triggers × responsabilidades) em docs/ci, incluindo a regra "1 workflow de deploy por ambiente"
### Critério de conclusão (checklist da etapa)
- [ ] Nenhum workflow DRAFT ativo capaz de deployar em paralelo com produção (guard ou remoção)
- [ ] post-deploy-check com run real pós-deploy registrado no Actions
- [ ] notify-ci-failure referenciando apenas workflows existentes (0 referências mortas)
- [ ] Gate estático de integridade de workflows rodando no CI

## Etapa 93 — Backup/restore validado e plano de rollback (pré-condição de qualquer ação destrutiva)
**Objetivo:** Garantir que TODA ação destrutiva do plano (E1-E5, E97) tenha snapshot validado e rollback ensaiado.
**Base:** lacuna apontada pela camada VALIDA · BACKUP-RECOVERY-STRATEGY (crons sentinela existem; widget get_backup_status inexistente; revisão trimestral vencida) · restore_test_log (24) · PITR E6.
### Subetapas
- [ ] 93.1 Validar o backup mais recente (sentinela + restore em banco descartável) e registrar evidência.
- [ ] 93.2 Ensaiar PITR para o ponto pré-mudança antes de E1-E5 (migrate-helper/JWT/buckets).
- [ ] 93.3 Implementar o widget get_backup_status (RPC + UI) para visibilidade de backup.
- [ ] 93.4 Documentar o plano de rollback por tipo de ação destrutiva (DDL, DML, secret rotation, filter-repo).
- [ ] 93.5 Executar a revisão trimestral vencida do BACKUP-RECOVERY-STRATEGY (2026-07-11).
- [ ] 93.6 Testar restore dos buckets storage (whatsapp-media) antes da privatização (E5).
- [ ] 93.7 Verificar crons de sentinela/integridade (daily-backup-sentinel-check, restore-integrity-check) com alerta ativo.
- [ ] 93.8 Criar checklist de pré-destrutiva (template reutilizável: snapshot, canário, rollback, janela).
- [ ] 93.9 Medir RPO/RTO reais do último drill e comparar com a meta (24h/4h).
- [ ] 93.10 Registrar o drill no restore_test_log e no doc de DR.
### Critério de conclusão (checklist da etapa)
- [ ] Backup validado por restore real (evidência no log)
- [ ] get_backup_status visível na UI
- [ ] Rollback ensaiado pelo menos 1x (PITR ou restore de bucket)
- [ ] Checklist de pré-destrutiva publicado e usado por E1-E5
- [ ] Revisão trimestral do DR atualizada

## Etapa 94 — Deploy edge versionado: E35 pipeline, E36 COMMIT_SHA, E40 volume + prod-snapshot
**Objetivo:** Eliminar o deploy manual de edge functions (docker cp) com pipeline versionado, introspector por COMMIT_SHA e restrição de escrita ao volume.
**Base:** findings-21.md:22-24 (E35 ❌ documentado não implementado; E36 ❌ sem COMMIT_SHA; E40 ❌ requer decisão), findings-21.md:111 e findings-21.md:30 (prod-snapshot desatualizado pós-PR #664).
### Subetapas
- [ ] 94.1 Registrar decisão E40 (documentada no repo): restringir escrita ao volume (read-only no container ou script único de sync) e obter aprovação
- [ ] 94.2 Implementar E36: injetar `BUILD_COMMIT_SHA` no runtime das edge functions (variável de build + endpoint/header de exposição)
- [ ] 94.3 Implementar E35: workflow CI/CD que faz build+bundle das functions e deploy no container (substituindo docker cp manual), com gate de testes e rollback
- [ ] 94.4 Integrar o deploy edge ao post-deploy-check (etapa 92) e à notificação de falha
- [ ] 94.5 Adicionar verificação pós-deploy: introspector compara COMMIT_SHA do runtime vs commit do repo (drift = falha)
- [ ] 94.6 Reconciliar branch `prod-snapshot` com o estado pós-PR #664 (e deploys subsequentes)
- [ ] 94.7 Executar 1 deploy real via pipeline (função piloto) e validar allowlist PUBLIC_FNS intacta (auth-smoke 401 nas funções fora da allowlist)
- [ ] 94.8 Testar rollback: deploy de versão anterior e confirmação de restauração
- [ ] 94.9 Atualizar relatorio-e5/docs de edge: E35/E36/E40 ✅ com evidência de run
- [ ] 94.10 Atualizar runbook deploy.md removendo o fluxo manual (docker cp) e apontando para o pipeline
### Critério de conclusão (checklist da etapa)
- [ ] Workflow de deploy edge executado de ponta a ponta com sucesso (run real)
- [ ] Runtime expõe COMMIT_SHA e introspector valida equivalência com o repo
- [ ] Escrita ao volume restrita conforme decisão E40 aplicada
- [ ] prod-snapshot reconciliado e runbook deploy.md atualizado

## Etapa 95 — Corrigir 7 bugs de upload/mídia do CHAT_UPLOAD_AUDIT (P0 403)
**Objetivo:** Fechar todos os 7 achados do CHAT_UPLOAD_AUDIT, começando pelo P0 (classifyError não detecta HTTP 403).
**Base:** findings-22.md:14 — CHAT_UPLOAD_AUDIT.md:86 (P0 `classifyError` sem 403), :136-139 (P1 vazamento objectURL), :62-63 (P1 progresso nunca atualizado), :57-61 (P2 MediaCard sem refresh), :366 (P3 multiple/vídeo/DnD); pendencias-consolidadas.md:1058.
### Subetapas
- [ ] 95.1 Reproduzir o P0: upload que retorna 403 e verificar que `classifyError` (`msg.includes('410')`) não mapeia 403 → usuário recebe erro genérico
- [ ] 95.2 Corrigir P0: `classifyError` com tratamento de status HTTP (403 → permissão/RLS, 401 → auth, 410 → expirado) + teste unitário cobrindo os códigos
- [ ] 95.3 Corrigir P1 vazamento de objectURL: revogar `URL.revokeObjectURL` no `setAttachments([])` sem quebrar previews ativos
- [ ] 95.4 Corrigir P1 progresso: garantir chamada a `_setUploadProgress` no fluxo real de upload (hoje nunca chamado)
- [ ] 95.5 Corrigir P2 MediaCard: refresh/retry de mídia com erro, sem exigir reload da página
- [ ] 95.6 Corrigir P3: input `multiple` processando todos os arquivos (não só o primeiro) + vídeo com error handling + DnD com suporte a touch
- [ ] 95.7 Adicionar testes de regressão para os 7 cenários (vitest, incluindo simulação de 403)
- [ ] 95.8 Rodar suíte de upload/inbox relacionada (chat media, mediaUrl, storage) e garantir 0 regressões
- [ ] 95.9 Abrir PR com fixes + testes e evidência de execução da suíte
- [ ] 95.10 Atualizar CHAT_UPLOAD_AUDIT.md: marcar os 7 bugs como corrigidos com referência ao PR
### Critério de conclusão (checklist da etapa)
- [ ] 7/7 bugs do CHAT_UPLOAD_AUDIT com fix mergeado e status atualizado no doc
- [ ] Testes de regressão cobrindo 403/401/410 no classifyError verdes
- [ ] Suíte de upload/mídia sem regressões

## Etapa 96 — Login/Vercel: envs www.zappweb.app.br, service_role no bundle, watchdog lockout, Google OAuth e URI_ALLOW_LIST
**Objetivo:** Destravar o domínio www.zappweb.app.br, remover service_role key do bundle Vercel, criar watchdog de lockout, decidir Google OAuth e limpar domínios legados da URI_ALLOW_LIST.
**Base:** findings-22.md:184-185 (LOGIN-ONDA pendências: envs Vercel bloqueiam www.zappweb.app.br; GAP-1 P1 service_role no bundle; GAP-3 watchdog lockout), findings-22.md:57 (#42 Google OAuth P1 DRIFT), findings-22.md:61 (#41 domínios legados na URI_ALLOW_LIST).
### Subetapas
- [ ] 96.1 Aplicar VERCEL-ENV-FIX-20260810: definir as 3 envs corretas na Vercel (anon key self-hosted, URL, demais) e fazer redeploy
- [ ] 96.2 Verificar o payload do bundle pós-redeploy: confirmar remoção da service_role key (GAP-1) via busca no bundle servido
- [ ] 96.3 Validar login no www.zappweb.app.br (fluxo completo: login → realtime → envio) e registrar evidência
- [ ] 96.4 Criar watchdog de lockout: cron/EF que detecta múltiplas falhas de login por usuário/IP e alerta (GAP-3), com testes
- [ ] 96.5 Decidir Google OAuth (#42): configurar GOOGLE_CLIENT_ID/SECRET no GoTrue + testar fluxo OU documentar como intencionalmente desabilitado (ADR/decisão no repo)
- [ ] 96.6 Remover domínios legados da URI_ALLOW_LIST (whats-your-line.lovable.app, zapp-web-v3.vercel.app) após confirmar desativação dos destinos
- [ ] 96.7 Validar redirects de auth pós-remoção (login, magic link, reset de senha) nos domínios ativos
- [ ] 96.8 Rodar suíte de auth (web-auth-login, testes E2E de login) e confirmar 0 regressões
- [ ] 96.9 Atualizar runbooks LOGIN-ONDA-20260810.md e LOGIN-SIMULACAO: fechar pendências e GAP-1/GAP-3
- [ ] 96.10 PR + evidências (payload do bundle, runs de login, watchdog ativo no cron)
### Critério de conclusão (checklist da etapa)
- [ ] www.zappweb.app.br operacional com login validado (evidência de sessão)
- [ ] Bundle Vercel sem service_role key (busca no payload retorna 0 hits)
- [ ] Watchdog de lockout criado e ativo; decisão Google OAuth registrada
- [ ] URI_ALLOW_LIST sem domínios legados; redirects de auth validados

## Etapa 97 — Migrar 1066 avatares do Lovable Cloud para o self-hosted (AVATAR-MIGRATION-PLAN)
**Objetivo:** Executar a migração planejada dos 1066 avatares existentes apenas no Lovable Cloud para o storage self-hosted, com aprovação explícita.
**Base:** findings-22.md:175 — playbooks/AVATAR-MIGRATION-PLAN.md:3 (GAP-V05 · PLANEJADO — NÃO EXECUTADO: 1066 avatares só no cloud, 0/1066 no self-hosted, 1380 objetos novos não correspondem).
### Subetapas
- [ ] 97.1 Revisar o AVATAR-MIGRATION-PLAN.md completo e obter aprovação explícita de Joaquim para execução (pré-requisito documentado)
- [ ] 97.2 Re-validar contagem no Lovable Cloud: 1066 avatares + 1380 objetos novos (confirmar drift atual vs plano)
- [ ] 97.3 Validar acesso ao storage cloud (credenciais/projeto FATOR X ou método definido no playbook) e gerar lista de objetos com metadados (tamanho, content-type, path)
- [ ] 97.4 Definir mapeamento de paths cloud → bucket self-hosted (avatares/contact_id) e regra de conflito (0/1066 → sem conflito esperado)
- [ ] 97.5 Executar cópia em lote com rate-limit e retry (script idempotente, dry-run primeiro), registrando hash por objeto
- [ ] 97.6 Verificar integridade pós-cópia: 1066 objetos presentes no self-hosted com hash/tamanho idênticos e content-type correto
- [ ] 97.7 Validar em runtime: avatares carregando na UI (inbox, contatos) via URL assinada/CSP sem band-aid
- [ ] 97.8 Manter a CSP atual até a validação completa e só então remover exceções temporárias
- [ ] 97.9 Atualizar AVATAR-MIGRATION-PLAN.md: status → EXECUTADO com evidências (contagens, hashes, screenshots)
- [ ] 97.10 Registrar no pendencias-consolidadas e no handoff: migração concluída + cleanup de objetos órfãos no cloud (se aplicável)
### Critério de conclusão (checklist da etapa)
- [ ] Aprovação explícita registrada antes da execução
- [ ] 1066/1066 avatares no self-hosted com hash validado
- [ ] Avatares renderizando na UI em produção (evidência visual)
- [ ] Plano atualizado para EXECUTADO com evidências

## Etapa 98 — Docs canônicos e governança (absorve: gates bloqueantes, evidências e fechamento V4)
**Objetivo:** Corrigir os docs canônicos contraditórios/desatualizados, aplicar a ERRATA, resolver a decisão multi-tenant (Pink) e provisionar Grafana + schema-snapshot CI.
**Base:** findings-17.md:199-200 (IMPROVEMENT_PLAN 13 P2 ⏳ vs "100%"; FORGOTTEN_FEATURES 14 módulos+5 EFs+~19 tabelas sem doc), findings-12 (pendencias-consolidadas.md:526-529: ERRATA 6 correções + §4.2 contaminando 3 docs), findings-15.md:546 (CLAUDE.md 136 vs 58 tabelas), findings-22.md:88 (#38 cross-tenant + decisão Pink), findings-22.md:124 (citações deslocadas), findings-22.md:190 (OPERATIONS_CALENDAR Q3 iminente), findings-22.md:87/167 (Grafana + schema-snapshot a provisionar).
### Subetapas
- [ ] 98.1 Corrigir IMPROVEMENT_PLAN.md: remover seções FASE 2 duplicadas (linhas 64-96 vs 111+), alinhar status real dos 13 P2 ⏳ e marcar métricas de sucesso (FCP<1.5s, Lighthouse>90, WCAG AA)
- [ ] 98.2 Escrever seções 35-48 no COMPLETE_SYSTEM_FEATURES.md (Campanhas, Chatbot, Pipeline, Knowledge Base, Integrações, Payment Links, LGPD, WA Flows, Diagnósticos, Meta CAPI, Agentes, Follow-ups, Public API, Componentes Cognitivos) + documentar 5 EFs (ai-auto-tag, ai-enhance-message, chatbot-l1, public-api, send-email) e ~19 tabelas
- [ ] 98.3 Atualizar CLAUDE.md: topologia real (zapp físico × evo views), regra 4 de Realtime invertida, contagens (136 vs 58 tabelas; 323/386 etc.), comandos/gates vigentes
- [ ] 98.4 Aplicar as 6 correções da ERRATA (0 ALTA/3 MÉDIA/3 BAIXA) nos 5 docs-alvo + descontaminar os 3 docs irmãos da premissa §4.2 (recomendação invertida `schema:'evo'→'zapp'` que quebraria Realtime)
- [ ] 98.5 Corrigir citações arquivo:linha deslocadas (20+ casos; V4: 13) referenciando por símbolo/nome de função, não linha — com verificação por grep
- [ ] 98.6 Atualizar OPERATIONS_CALENDAR.md Q3: confirmar agendamento das simulações 2026-08-17 a 2026-08-28 (chaos game day, DR drill, ensaio provider) alinhado às etapas restantes
- [ ] 98.7 Registrar a decisão multi-tenant (com Pink) em authenticated_isolation_posture.md: single-org vs isolamento (531 policies USING(true), 281 views owner-running, 29 tabelas RLS off) + documentar avaliação de BFF para cross-tenant artes/vendas/financeiro (#38)
- [ ] 98.8 Provisionar Grafana: deploy do dashboard grafana-metrics-dashboard.json + prometheus-scrape.yml (2 jobs) com auth via service_role file
- [ ] 98.9 Provisionar schema-snapshot CI: role `ci_readonly` + secrets PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE no GitHub e rodar os testes de validação do workflow
- [ ] 98.10 Rodar gates de integridade de docs (check-audit-docs-integrity.sh, INDICE_ACHADOS) e abrir PR único de docs com evidências (grep/contagens)
### Critério de conclusão (checklist da etapa)
- [ ] IMPROVEMENT_PLAN sem contradição (status real dos 13 P2) e FORGOTTEN_FEATURES 100% documentado (seções 35-48 presentes)
- [ ] CLAUDE.md com topologia/contagens corretas; ERRATA aplicada nos 3 docs contaminados
- [ ] Decisão multi-tenant registrada (com Pink) e avaliação BFF documentada
- [ ] Grafana dashboard ativo + schema-snapshot CI rodando com role ci_readonly
- [ ] Gates de integridade de docs verdes

## Etapa 99 — Validação final exaustiva: suíte completa, typecheck, lint, build e DOGFOOD visual
**Objetivo:** Executar a bateria final completa no repo (vitest + typecheck + lint + build + E2E) e validar a aplicação em produção via DOGFOOD com screenshots CDP.
**Base:** requisito da fase (validação final exaustiva); findings-22.md:167/87 (schema-snapshot e Grafana provisionados na etapa 98 como gates de validação); padrão validation-battery (findings-22.md:190).
### Subetapas
- [ ] 99.1 Rodar a suíte vitest completa (`bun run test` ou equivalente) em ambiente limpo e registrar total de testes/erros (baseline: 7.869+ testes verdes documentados)
- [ ] 99.2 Rodar typecheck completo (`tsc --noEmit` / `bun run typecheck`) e zerar erros (incluindo pontos de @ts-nocheck já tratados)
- [ ] 99.3 Rodar lint completo (eslint + regras do projeto) e zerar warnings/errors bloqueantes
- [ ] 99.4 Rodar build de produção (vite build / bun build) 2× e confirmar determinismo + tamanho de bundle sem service_role key
- [ ] 99.5 Rodar gates de CI localmente (quality-gate, check-audit-docs-integrity, sql-gate, contract tests Zod) e registrar resultados
- [ ] 99.6 Executar suítes E2E relevantes (Playwright: auth, whatsapp-connection, send-message, inbox-realtime) nos ambientes configurados e registrar runs
- [ ] 99.7 Rodar schema-snapshot CI (provisionado na 98.9): diff introspect × migrations-snapshot = 0 e artifact publicado
- [ ] 99.8 DOGFOOD em produção: navegar nos fluxos críticos via CDP (login, inbox, envio, upload com 403-fix, avatares migrados) e coletar screenshots + console sem erros
- [ ] 99.9 Health checks de produção: edge functions health, PostgREST, Realtime, evolution-db-purge (etapa 91) e NNP (reapply-nnp) verificados
- [ ] 99.10 Consolidar relatório de validação final com evidências (logs, screenshots, contagens) e classificar bloqueantes remanescentes (se houver)
### Critério de conclusão (checklist da etapa)
- [ ] Suíte vitest 100% verde com contagem registrada; typecheck, lint e build sem erros
- [ ] DOGFOOD com screenshots CDP dos fluxos críticos e console limpo (0 erros)
- [ ] Schema-snapshot diff = 0; gates de CI verdes
- [ ] Relatório de validação final salvo no workspace com evidências anexadas

## Etapa 100 — Fechamento: retrospectiva, tag, limpeza e handoff final
**Objetivo:** Encerrar a auditoria com retro formal (modelo VALIDACAO_V4/RETRO_V4), tag de release, limpeza de artefatos e handoff do estado final.
**Base:** findings-13 (pendencias-consolidadas.md:830 — VALIDACAO_V4.md (#95) e RETRO_V4.md (#100) não existem; tag `decouple-v4-complete` e cleanup de branch/worktree não verificados); fechamento da fase 10.
### Subetapas
- [ ] 100.1 Escrever RETRO_FASE10.md: lições por etapa (91-99), o que funcionou, o que falhou, métricas de fechamento (pendências fechadas × assumidas)
- [ ] 100.2 Escrever VALIDACAO_FINAL.md consolidando o relatório da etapa 99 + placar final das pendências consolidadas (538 itens → resolvidos/assumidos)
- [ ] 100.3 Cross-check completo: varrer pendencias-consolidadas.md e marcar/remover itens resolvidos nas fases 1-10, listando dívidas assumidas (Cloud real, DROP físico evo, 303 arquivos provider-name, etc.)
- [ ] 100.4 Atualizar pendencias-consolidadas.md com o estado final (status ✅/⚠️/❌ consistente por finding) e registrar a data de fechamento
- [ ] 100.5 Limpar branches zumbis e worktrees órfãos (V4-FINAL #71) + remover artefatos temporários (/tmp/orfao-files.json, probes, .bak) sem afetar histórico
- [ ] 100.6 Criar tag de release final (ex.: `audit-2026-08-16-complete`) com release notes resumindo fases 1-10
- [ ] 100.7 Verificar gates finais no CI (último run de todos os workflows: verdes) e branch protection ativo (7 checks)
- [ ] 100.8 Escrever _HANDOFF_FINAL.md: estado do sistema, decisões pendentes de Joaquim (Google OAuth, isolamento Pink, 53 fns legados, ensaio cloud), próximos passos pós-auditoria
- [ ] 100.9 Apresentar resumo executivo a Joaquim: placar fase 10, dívidas assumidas e decisões que exigem aprovação
- [ ] 100.10 Commit final limpo (worktree sem alterações não commitadas) e verificação de que todos os artefatos da auditoria estão no workspace
### Critério de conclusão (checklist da etapa)
- [ ] RETRO_FASE10.md e VALIDACAO_FINAL.md escritos e commitados
- [ ] pendencias-consolidadas.md com estado final consistente e data de fechamento
- [ ] Tag de release criada; branches/worktrees órfãos limpos; worktree final limpo
- [ ] _HANDOFF_FINAL.md entregue com decisões pendentes e próximos passos


## Resumo da fase 10
- 10 etapas (91-100) cobrindo INFRA/OPS/DOCS/VALIDAÇÃO FINAL, com 100 subetapas e checklists verificáveis por etapa.
- Infra: evolution-db-purge (OOM 137/127), build reprodutível, secrets Swarm no functions, deploy edge E35/E36/E40.
- CI/Ops: DRAFT de deploy neutralizado, post-deploy-check religado, notify-ci-failure corrigido, watchdog de lockout.
- Dados/Front: 7 bugs de upload (P0 403) e migração dos 1066 avatares do Lovable Cloud.
- Auth/Governança: Vercel envs + service_role no bundle, Google OAuth, URI_ALLOW_LIST, decisão multi-tenant (Pink).
- Docs: IMPROVEMENT_PLAN, FORGOTTEN_FEATURES, CLAUDE.md, ERRATA/§4.2, citações, OPERATIONS_CALENDAR; Grafana e schema-snapshot provisionados.
- Etapas 99-100: validação final exaustiva (vitest + typecheck + lint + build + DOGFOOD CDP) e fechamento (retro + tag + limpeza + handoff).
