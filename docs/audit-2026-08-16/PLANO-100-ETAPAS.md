# PLANO DE IMPLEMENTAÇÃO E CORREÇÕES — 100 ETAPAS × 10 SUBETAPAS
**ZAPP Web V3 (Promo Brindes / AtomicaBR)** · gerado 2026-08-16 a partir da auditoria exaustiva
**Insumo:** 584 docs auditados (2 ondas × 22 agentes) + banco vivo (340+ tabelas, 955 funções, 657 migrations)
**Validação:** classificação APROVADA pela camada VALIDA (Claude) após correção de régua (PRESENTE ≠ VERIFICADO); plano revisado em 2ª rodada (reordenação por risco + fusão de duplicatas + lacunas backup/performance) — ajustes incorporados neste documento.

## Como usar
- Cada **Etapa** tem 10 subetapas numeradas `N.1`–`N.10` (checkboxes) e um **Critério de conclusão** no final.
- Ordem das fases = ordem de execução recomendada (risco ativo primeiro, conforme validação).
- Etapas que dependem de decisão do dono estão marcadas **[APROVAÇÃO]**.
- Cada subetapa concluída: marcar o `[x]`. Etapa só é DONE quando todo o critério de conclusão passa.
- **Regra de ouro:** nenhuma ação destrutiva (rotação, deleção, filter-repo, privatização de bucket) sem a pré-condição da Etapa 93 (backup/restore validado + rollback ensaiado).

## Índice das fases
| Fase | Etapas | Tema |
|---|---|---|
| 1 | 1–10 | Resposta imediata de segurança (credenciais, buckets PII, RLS, LGPD) |
| 2 | 11–20 | Fundação de qualidade (testes/CI) |
| 3 | 21–30 | Backend crítico, realtime e performance |
| 4 | 31–40 | Inbox núcleo (hooks/serviços) |
| 5 | 41–50 | Inbox UI (componentes) |
| 6 | 51–60 | Auth e Admin |
| 7 | 61–70 | Features de negócio |
| 8 | 71–80 | Integrações e serviços |
| 9 | 81–90 | Desacoplamento Evo×Zapp |
| 10 | 91–100 | Infra/Ops/Docs/Validação final |

---



---

# FASE 1 — RESPOSTA IMEDIATA DE SEGURANÇA (risco ativo explorável)

## Etapa 1 — Deletar migrate-helper do cloud e rotacionar credenciais Lovable Cloud
**Objetivo:** Remover a edge function `migrate-helper` viva no Supabase Cloud (projeto `uqysyzndkfiwfztbqvsl`) e revogar todas as credenciais expostas pela ACCESS_KEY commitada `7bdebc20…`.
**Base:** findings-21:27 (migrate-helper VIVO, x-access-key commitada, `action=credentials` retorna SERVICE_ROLE_KEY/DB_URL), findings-21:28 (rotação bloqueada — requer painel), findings-21:105 (síntese E4/E5/E33), findings-21:85 (GitHub Secret Scanning: 0 alertas — ACCESS_KEY não detectada).
### Subetapas
- [ ] 1.1 No painel Supabase Cloud do projeto `uqysyzndkfiwfztbqvsl`, listar todas as edge functions ativas e confirmar `migrate-helper` + fixtures públicas (E3).
- [ ] 1.2 Deletar `migrate-helper` e qualquer outra função não autorizada (ex.: `e2e-*`, fixtures) no painel (E33).
- [ ] 1.3 Rotacionar a SERVICE_ROLE_KEY do cloud — a chave exposta pela ACCESS_KEY `7bdebc20…` é a mesma devolvida por `action=credentials` (findings-21:27).
- [ ] 1.4 Rotacionar a ANON_KEY do cloud.
- [ ] 1.5 Rotacionar a senha do usuário Postgres do cloud (findings-21:28).
- [ ] 1.6 Inventariar consumidores remanescentes que ainda apontam para o cloud (avatares Lovable Cloud 1066/1066 — findings-22:175; `public.notify_sicoob_on_reply` e GUC `app.settings.service_role_key` — findings-22:89) e re-apontá-los para o self-hosted antes de desligar.
- [ ] 1.7 Confirmar fixtures 404 no cloud e desligar/desativar o projeto Lovable Cloud após a migração (E33 — findings-21:36).
- [ ] 1.8 Remover do repo qualquer referência remanescente a `migrate-helper`/ACCESS_KEY (PR) e rodar gitleaks local antes do push.
- [ ] 1.9 Registrar a rotação com evidência no `CREDENTIAL_ROTATION_RUNBOOK` (findings-21:97) e no `LOVABLE-SUPABASE-ACCESS.md` (findings-22:176).
- [ ] 1.10 Verificar pós-rotação: invocar `migrate-helper` → 404; usar a chave antiga → 401; fluxos de login/mídia que dependiam do cloud seguem operando pelo self-hosted.
### Critério de conclusão (checklist da etapa)
- [ ] `POST /functions/v1/migrate-helper` no cloud retorna 404 (função deletada).
- [ ] Chaves antigas (SERVICE_ROLE_KEY/ANON_KEY/senha Postgres) rejeitadas com 401/autenticação negada.
- [ ] `grep -ri "migrate-helper\|7bdebc20" <repo>` = 0 ocorrências.
- [ ] Nenhum consumidor produtivo depende do cloud (avatares/sicoob re-apontados ou bloqueados por gate).
- [ ] Evidência da rotação anexada ao runbook (data, chaves rotacionadas, veredito).

## Etapa 2 — Rotacionar JWT_SECRET self-hosted e purgar histórico git (filter-repo)
**Objetivo:** Rotacionar o JWT_SECRET do Supabase self-hosted (exposto em 33+ commits históricos, allowlistado no `.gitleaks.toml`) e removê-lo do histórico com `git filter-repo`.
**Base:** findings-21:84 (JWT_SECRET vazado — 33 commits allowlistados, "Rotacionar IMEDIATAMENTE"), findings-21:93 (git filter-repo pendente), findings-21:97 (runbook exige JANELA DE MANUTENCAO e valida security_score=10), findings-22:60 (#35 — secret file == literal do compose; literal hardcoded).
### Subetapas
- [ ] 2.1 Rodar GATE pré-rotação: inventariar todos os consumidores do JWT_SECRET (Kong, GoTrue, PostgREST, Realtime, edge-runtime, supabase-db-mcp) e identificar onde o valor vive (secret file vs literal no compose — findings-22:60).
- [ ] 2.2 Centralizar o JWT_SECRET em Docker secret (higiene #35: hoje secret file == literal do compose) antes da rotação.
- [ ] 2.3 Agendar a janela de manutenção conforme `CREDENTIAL_ROTATION_RUNBOOK` e preparar plano de rollback (manter secret antigo disponível off-line).
- [ ] 2.4 Gerar novo JWT_SECRET (32+ bytes aleatórios), gravar no Docker secret e reiniciar os serviços na ordem: Kong → GoTrue → PostgREST → Realtime → edge-runtime → supabase-db-mcp.
- [ ] 2.5 Validar pós-rotação: login E2E, refresh de sessão, Realtime, edge functions com `VERIFY_JWT=true` e `security_score=10` do runbook (findings-21:97).
- [ ] 2.6 Executar `git filter-repo` removendo o valor do JWT_SECRET dos 33 commits históricos (findings-21:84, 93).
- [ ] 2.7 Limpar a allowlist do `.gitleaks.toml` (remover a entrada do JWT_SECRET) e rodar gitleaks no histórico limpo.
- [ ] 2.8 Force-push do histórico reescrito, invalidar caches do GitHub e confirmar Secret Scanning sem alertas residuais.
- [ ] 2.9 Re-clonar as cópias de trabalho (evitar reintroduzir o segredo) e revogar/rotacionar PATs que tinham acesso aos repositórios afetados.
- [ ] 2.10 Verificação final: `git log --all -S'<valor-antigo>'` = 0; login/realtime OK; `reapply-nnp.yml` e demais gates CI verdes após o force-push.
### Critério de conclusão (checklist da etapa)
- [ ] Nenhum commit do histórico contém o valor antigo (`git log --all -S` = 0).
- [ ] `.gitleaks.toml` sem allowlist para JWT_SECRET e `gitleaks detect --log-opts=--all` limpo.
- [ ] Login + realtime + edge functions validados com o novo JWT (evidência E2E).
- [ ] JWT_SECRET ausente de literais em compose/stacks (só Docker secret).
- [ ] GitHub Secret Scanning ativo e sem alertas para o valor antigo.

## Etapa 3 — Rotacionar MCP_QUERY_SECRET e AUTHENTICATION_API_KEY vazados
**Objetivo:** Rotacionar `mcp_query_secret_v1` (valor vazado em repo público — P1) com dual-secret sem janela de quebra, e rotacionar a `AUTHENTICATION_API_KEY` da Evolution (v4→v5) exposta em 3 arquivos versionados.
**Base:** findings-22:144 (MCP-QUERY-SECRET-ROTATION: vazado, rotação NÃO executada, sem dual-secret → janela de quebra), findings-22:134 (git-secrets-rotation: AUTHENTICATION_API_KEY exposta em 3 arquivos, rotação PENDENTE na VPS: v4→v5, vault, 401 check, git-filter-repo).
### Subetapas
- [ ] 3.1 Mapear todos os consumidores de `mcp_query_secret_v1` (supabase-db-mcp e consumidores externos) e o contrato de auth (header/bearer).
- [ ] 3.2 Implementar dual-secret no serviço consumidor (aceitar v1 e v2) — branch `fix/fin-a6-secret-rot-f9160` citada em findings-22:144.
- [ ] 3.3 Gerar `mcp_query_secret_v2`, gravar no vault/Swarm e publicar no consumidor.
- [ ] 3.4 Deploy do dual-secret e validar o consumidor externo autenticando com v2 (200).
- [ ] 3.5 Remover v1 do vault/Swarm e confirmar 401 para requisições com v1 (fail-closed).
- [ ] 3.6 Rotacionar `AUTHENTICATION_API_KEY` da Evolution: gerar nova key (v5) no painel Evolution e invalidar a v4.
- [ ] 3.7 Gravar a v5 no vault + stack evolution e validar com 401-check que a v4 falha e a v5 responde (findings-22:134).
- [ ] 3.8 Remover a v4 dos 3 arquivos versionados e rodar `git filter-repo` se o valor estiver no histórico (findings-22:134).
- [ ] 3.9 Documentar a cadeia vault×swarm×env das duas rotações (pendência VAULT_SECRETS_V4 item 6 — findings-22:871).
- [ ] 3.10 Verificação: v1 → 401 e v2 → 200 no MCP; Evolution autentica com v5; `grep` no repo = 0 ocorrências das chaves antigas.
### Critério de conclusão (checklist da etapa)
- [ ] Requisição MCP com v1 → 401; com v2 → 200 (evidência de dual-secret concluído e v1 revogado).
- [ ] Evolution API responde com v5 e rejeita v4 (401 check).
- [ ] `grep -r "mcp_query_secret_v1\|<valor-v4>" <repo>` = 0.
- [ ] Nenhum downtime no consumidor externo durante a troca (dual-secret).
- [ ] Cadeia vault×swarm×env documentada nos dois runbooks.

## Etapa 4 — Substituir VAULT_ENC_KEY placeholder e montar secrets no service functions (absorve: secrets Swarm)
**Objetivo:** Trocar o `VAULT_ENC_KEY=your-encryption-key-32-chars-min` (placeholder!) do supavisor por chave real com re-criptografia do vault, e montar os secrets do Swarm no service `functions` (hoje não montados).
**Base:** findings-22:59 (#47 — placeholder no supavisor, fp 627507f04b33), findings-22:133 (docker_secrets_migration: secrets existem no Swarm, NÃO montados no service functions), findings-22:60 (#35 — JWT literal hardcoded), findings-22:137 (supabase-functions.reconciled.yml é a fonte da verdade; `stack deploy` regride o serviço), findings-22:65 (jobid 84 `ops-notify-critical-alerts` falha `invalid symbol "\"` ao decodificar base64 no vault).
### Subetapas
- [ ] 4.1 Confirmar escopo do vault: listar `vault.secrets`/`supabase_secrets` criptografadas sob a VAULT_ENC_KEY atual e validar o workflow `ENCRYPTION-KEY-ROTATION-WORKFLOW` (testado em staging: 17.728 re-encryptions, 0 perda — findings-22:75).
- [ ] 4.2 Gerar nova chave de 32+ chars aleatória e armazenar como Docker secret (nunca literal em compose — regra findings-22:60/#35).
- [ ] 4.3 Executar a rotação de chave cripto do vault: descriptografar todas as secrets com a chave atual e re-criptografar com a nova (procedimento já testado em staging).
- [ ] 4.4 Atualizar o serviço supavisor no stack 35 para ler `VAULT_ENC_KEY` do Docker secret e remover o literal placeholder do compose.
- [ ] 4.5 Montar os secrets do Swarm no service `functions` (deepseek_api_key_v2, evolution_api_key_v4_20260704 e demais listados em findings-22:133) e remover env plaintext correspondente.
- [ ] 4.6 Validar consumo do vault pelos serviços (evolution_api_key, notificações) após a troca.
- [ ] 4.7 Corrigir o jobid 84 `ops-notify-critical-alerts` (base64 do vault) e confirmar notificação de alerta crítico real (findings-12:65).
- [ ] 4.8 Mesclar as mudanças com `supabase-functions.reconciled.yml` (fonte da verdade) sem regressão via `stack deploy` (findings-22:136-137).
- [ ] 4.9 Atualizar `runbook.md` §3/§6 (topologia/secrets desatualizados — findings-22:149).
- [ ] 4.10 Verificação: `grep -r "your-encryption-key-32-chars-min\|VAULT_ENC_KEY=" <stacks>` = 0; vault descriptografa; 0 falhas de jobs dependentes de vault nas 24h seguintes.
### Critério de conclusão (checklist da etapa)
- [ ] Nenhum literal `VAULT_ENC_KEY` ou placeholder em stacks/compose (só Docker secret).
- [ ] Re-criptografia concluída com 0 perdas (comparação de digest das secrets antes/depois).
- [ ] Service `functions` monta os secrets do Swarm (inspect do serviço mostra `SecretReferences`).
- [ ] Jobid 84 notifica alerta crítico sem erro de base64 (evidência de execução).
- [ ] `stack deploy` não regride o serviço functions (drift reconciliado com o .yml).

## Etapa 5 — Privatizar buckets PII (whatsapp-media 9,56GB e recibos-entrega) e assinar URLs (imgproxy)
**Objetivo:** Tornar privados os buckets `whatsapp-media` (9,56 GB de PII) e `recibos-entrega`, migrar o consumo para URLs assinadas e configurar IMGPROXY_KEY/SALT no imgproxy.
**Base:** findings-21:57 (buckets 🔴 públicos — SCHEMA-CONTRACT: "Etapa 22 — urgente (9,56 GB, PII)"), findings-21:107 (síntese #3), findings-22:58 (#43 — imgproxy sem IMGPROXY_KEY/SALT, URLs não assinadas), findings-22:123 (PUBLIC_BUCKETS já divergiu: recibos-entrega só em mediaUrl.ts:202), findings-22:15 (CHAT_UPLOAD_AUDIT P0: `classifyError` não detecta HTTP 403), findings-22:199 (BUG-2 media-src CSP sem supabase.atomicabr.com.br).
### Subetapas
- [ ] 5.1 Inventariar buckets e flags em `storage.buckets` + mapear consumidores de URL pública (`mediaUrl.ts:202`, `useMediaUrl.ts`, media-gallery, KB upload — findings-10:706) para cada bucket afetado.
- [ ] 5.2 Consolidar `PUBLIC_BUCKETS` numa única constante compartilhada (eliminar a divergência recibos-entrega — findings-22:123).
- [ ] 5.3 Quantificar objetos PII de `whatsapp-media` e `recibos-entrega` e definir estratégia de URL assinada (TTL, cache) para cada consumidor.
- [ ] 5.4 Implementar/validar o fluxo de URL assinada (`createSignedUrl`) nos pontos de consumo de mídia e KB (findings-21:57 indica "privado (URL assinada)").
- [ ] 5.5 Configurar `IMGPROXY_KEY` e `IMGPROXY_SALT` no serviço imgproxy (stack) e atualizar as URLs geradas para assinatura HMAC (findings-22:58).
- [ ] 5.6 Migrar `whatsapp-media` (9,56 GB) para privado em janela: validar objetos, flip `public=false`, monitorar erros.
- [ ] 5.7 Migrar `recibos-entrega` para privado (idem).
- [ ] 5.8 Corrigir `classifyError` para detectar HTTP 403 (CHAT_UPLOAD_AUDIT P0) e o progresso de upload (P1) — findings-22:14.
- [ ] 5.9 Verificação pós-flip: URL antiga pública → 400/401; app envia/recebe/visualiza mídia e recibos OK (E2E de upload e media-gallery).
- [ ] 5.10 Auditoria LGPD final: confirmar zero objetos PII acessíveis anonimamente e atualizar SCHEMA-CONTRACT/estado dos buckets.
### Critério de conclusão (checklist da etapa)
- [ ] `select id, public from storage.buckets where id in ('whatsapp-media','recibos-entrega')` → `public=false` nas duas linhas.
- [ ] `curl` anônimo em URL pública antiga retorna 400/401 (não 200).
- [ ] URLs de mídia servidas via `createSignedUrl` e imgproxy assinado (HMAC) — evidência de resposta 200 com assinatura válida.
- [ ] E2E de upload/visualização verde (incl. caso 403 tratado).
- [ ] `PUBLIC_BUCKETS` com fonte única (grep = 1 definição).

## Etapa 6 — Sanitizar useBulkActions (risco ALTO de deleção arbitrária)
**Objetivo:** Eliminar o `.delete()` em qualquer tabela via `tableName` não sanitizado, com allowlist e decisão de reconexão ou remoção do hook órfão.
**Base:** pendência real (findings-09.md:265 — 23:48, 23:347 A1).

### Subetapas
- [ ] 6.1 Mapear o hook `useBulkActions.ts` (opções, tabelas citadas, chamadas `.delete()` dinâmicas) e seus consumidores atuais (só testes).
- [ ] 6.2 Definir allowlist explícita de tabelas permitidas (ex.: `contacts`, `conversations`, `messages` — somente as usadas pela UI de bulk actions real) como constante tipada.
- [ ] 6.3 Implementar validação em runtime: `tableName` fora da allowlist → throw/lançar erro claro, nunca executar `.delete()`.
- [ ] 6.4 Decidir (ADR curto): reconectar o hook à BulkActionsToolbar real OU removê-lo — registrar com base no uso da toolbar (findings-05:149).
- [ ] 6.5 Se reconectar: substituir chamadas da toolbar por `useBulkActions` com allowlist e testes de integração com Supabase mock.
- [ ] 6.6 Se remover: apagar hook + testes e atualizar allowlist/vereditos; garantir que a toolbar não perca função.
- [ ] 6.7 Escrever testes de segurança: tentativa de `delete` em tabela fora da allowlist (incl. `auth.users`, `audit_logs`, `query_telemetry`) falha sem executar.
- [ ] 6.8 Escrever testes de permissão: tabela permitida executa com os filtros esperados (nenhum `.delete()` sem filtro).
- [ ] 6.9 Auditar outros hooks com `.delete()` dinâmico similar (padrão findings-10:705 useQueryTelemetry) e reportar riscos correlatos.
- [ ] 6.10 Rodar suíte + typecheck e registrar o veredito final (reconectado/removido) no changelog.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhum `.delete()` alcançável com `tableName` arbitrário; allowlist tipada é a única via.
- [ ] Testes provam bloqueio de tabelas fora da allowlist sem efeito colateral.
- [ ] Decisão reconectar/remover registrada e executada (não há hook órfão de alto risco).
- [ ] Audit correlato (padrão de delete dinâmico) documentado.

## Etapa 7 — RLS tenant-aware: eliminar USING(true) em lote + furos pontuais (absorve: audit_logs, n8n_variables, feature_flags, polroles NULL)
**Objetivo:** Substituir/justificar as 272+141 policies `USING(true)` (zapp+evo) e as 78 `true/true` para authenticated, priorizando as 11 críticas, com canário e migration versionada.
**Base:** findings-21:87 (272 policies USING(true) zapp + 141+ evo; `evolution_contacts` SELECT/UPDATE de todos os contatos), findings-22:17 (78 policies true/true p/ authenticated; 11 críticas: `zapp.agents.service_role_all` com role=authenticated, `rpc_rate_limits`, `processed_webhook_events`…), findings-22:88 (decisão single-org × isolamento pendente), findings-22:89 (531 policies USING(true) na medição de cutover).
### Subetapas
- [ ] 7.1 Formalizar a decisão de postura (single-org com policies por função × isolamento multi-tenant) em ADR — base findings-22:88 (decisão pendente com Pink).
- [ ] 7.2 Enumerar via `pg_policies` todas as policies com `USING(true)` (zapp, evo, public) e as `true/true` para authenticated (baseline numerado).
- [ ] 7.3 Classificar cada policy em: (a) legítima para service_role → trocar role; (b) substituir USING(true) por check de auth.uid()/org; (c) manter com justificativa documentada em comentário.
- [ ] 7.4 Escrever migration versionada com setup do canário `archive._rls_canary` e rodar pré-canário (baseline de acesso por role).
- [ ] 7.5 Corrigir primeiro as 11 críticas: `zapp.agents.service_role_all` (role=authenticated), `rpc_rate_limits`, `processed_webhook_events` e demais (findings-22:17).
- [ ] 7.6 Substituir `USING(true)` em tabelas de negócio (ex.: `evolution_contacts` — SELECT/UPDATE de todos os contatos) por policies com `auth.uid()`/escopo de org (findings-21:87).
- [ ] 7.7 Pós-canário: rodar simulações e comparar com baseline (0 regressões inesperadas).
- [ ] 7.8 Rodar a suíte de invariantes DB e os testes de RLS no CI (gates db-invariants, security-invoker, sql-gate).
- [ ] 7.9 Atualizar `SECURITY_AUDIT_BANCO_2026-08-03.md` com o novo estado e implementar o cron mensal de verificação sugerido (§5.1-5.2 — findings-22:17).
- [ ] 7.10 Verificação final: contagem de `USING(true)` restante = apenas classe (c) justificada; zero policies authenticated+true/true sem aprovação registrada.
### Critério de conclusão (checklist da etapa)
- [ ] `select count(*) from pg_policies where (qual or with_check) ilike '%true%'` reduzida para o conjunto (c) justificado (diff documentado vs baseline 272/141/78).
- [ ] 11 críticas de `true/true` p/ authenticated corrigidas (query por policy name).
- [ ] Canário pré vs pós sem regressões inesperadas (diff = 0).
- [ ] CI (db-invariants + sql-gate + security-invoker) verde na PR.
- [ ] Cron mensal de verificação RLS ativo (pg_cron) e ADR de postura registrado.

## Etapa 8 — SECDEF: auditar 1.131 expostas a authenticated, fixar ~49 search_path, cobrir 18 tabelas sem policy
**Objetivo:** Reduzir a superfície SECURITY DEFINER (1.131 expostas a authenticated no zapp), fixar search_path dos ~49 sem `proconfig` e resolver as 18 tabelas RLS-on sem policy (prioridade `_lgpd_payload`).
**Base:** findings-21:86 (1.131 SECDEF expostas a authenticated — "Auditar cada função"), findings-21:60 (~49 SECDEF sem search_path fixo; RLS_HARDENING_PLAN ~579→~49 faltando), findings-21:56 (18 tabelas RLS-on sem policy = deny-all; `zapp._lgpd_payload` PII prioritária), findings-22:218 (53 funções anon+SECDEF em financeiro/artes/vendas aguardam aprovação), findings-21:50 (R25: 316 revogados, padrão de triagem).
### Subetapas
- [ ] 8.1 Query `pg_proc` para listar SECDEF com `proacl` contendo authenticated/USAGE e separar as sem `proconfig` (search_path ausente).
- [ ] 8.2 Triagem das 1.131: (a) usadas pelo app via RPC → manter com grant mínimo; (b) sem consumidor → REVOKE; (c) candidatas a `SECURITY INVOKER` → converter (padrão R25 — findings-21:50).
- [ ] 8.3 Fixar `SET search_path` nas ~49 SECDEF sem `proconfig` (guard `secdef-search-path-guard` jobid 165 cobre as demais — findings-12:57).
- [ ] 8.4 Resolver as 18 tabelas RLS-on sem policy: criar policy mínima para `zapp._lgpd_payload` (acesso restrito a função/role LGPD dedicada) e documentar deny-all das demais (findings-21:56).
- [ ] 8.5 Obter aprovação de Joaquim para as 53 funções anon+SECDEF (financeiro/artes/vendas) e aplicar REVOKE/INVOKER conforme decisão (findings-22:218).
- [ ] 8.6 Escrever migration versionada com canário `archive._rls_canary` (pré/pós) e grants mínimos (REVOKE ALL FROM PUBLIC + grant a roles específicas).
- [ ] 8.7 Atualizar o guard `secdef-search-path-guard` para incluir as ~49 funções corrigidas (evitar regressão).
- [ ] 8.8 Reescrever `sprint1-security-hardening.test.ts` para testar `pg_proc` real (hoje grep em texto de migration — findings-12:114).
- [ ] 8.9 Validar no CI (security-invoker-gate, sql-gate) e em runtime (login, inbox, admin painel) que nada quebrou com os REVOKEs.
- [ ] 8.10 Verificação final: 0 SECDEF authenticated sem justificativa registrada; 100% com search_path fixo; 18/18 tabelas com policy ou deny-all documentado.
### Critério de conclusão (checklist da etapa)
- [ ] `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and pg_has_role(...)` ≤ baseline justificado (diff registrado).
- [ ] `select count(*) from pg_proc where prosecdef and proconfig is null` = 0.
- [ ] `zapp._lgpd_payload` com policy (query pg_policies) e demais 17 tabelas com decisão documentada.
- [ ] Guard `secdef-search-path-guard` sem novas violações nas 24h seguintes.
- [ ] Suíte de segurança (sprint1-hardening reescrito + security-invoker) verde no CI.

## Etapa 9 — LGPD: acesso a _lgpd_payload, direito ao esquecimento, triggers de segurança e login-attempts
**Objetivo:** Garantir conformidade LGPD: acesso controlado ao `_lgpd_payload`, fluxo funcional de direito ao esquecimento, religar os 2 triggers de segurança de `password_reset_requests` e tornar `login-attempts` fail-closed.
**Base:** findings-21:56 (`zapp._lgpd_payload` PII prioritária), pendencias-consolidadas:957 (PARIDADE 07-04: 8 triggers não religados, 2 de segurança em password_reset_requests), findings-22:119 (`login-attempts` fail-open — loginAttempts.ts:118-145; arquivar = desprotege lockout/blocklist/geo), pendencias-consolidadas:21 (dataDeletionRequestService — direito ao esquecimento LGPD), findings-12:62 (3 rotinas de retenção declaradas ausentes: purge-webhook-logs, purge-webhook-audit-log-90d, purge_webhook_events_processed).
### Subetapas
- [ ] 9.1 Mapear o ciclo de vida de dados pessoais: tabelas PII (contacts, `_lgpd_payload`, mensagens, mídia) e o fluxo existente de solicitações (dataDeletionRequestService).
- [ ] 9.2 Implementar policy/role de acesso ao `_lgpd_payload` (somente função dedicada com autorização explícita — canário `archive._rls_canary` pré/pós).
- [ ] 9.3 Religar os 2 triggers de segurança de `password_reset_requests` (e os demais 6 triggers não religados da PARIDADE 07-04 — pendencias:957) via migration versionada.
- [ ] 9.4 Corrigir `login-attempts` fail-open (loginAttempts.ts:118-145): arquivamento/erro não pode desproteger lockout/blocklist/geo (findings-22:119).
- [ ] 9.5 Validar o fluxo de direito ao esquecimento end-to-end: solicitação → exclusão/anonymização de PII em tabelas + storage (nunca dropar PK/FK; soft-delete/anonymize).
- [ ] 9.6 Garantir retenção/expurgo: recriar/validar as 3 rotinas de retenção ausentes (purge-webhook-logs, purge-webhook-audit-log-90d, purge_webhook_events_processed — findings-12:62).
- [ ] 9.7 Reforçar o audit trail de solicitações LGPD (usar `audit_logs` protegidos na Etapa 26) e o registro de consentimento.
- [ ] 9.8 Escrever testes: RLS do `_lgpd_payload`, fail-closed do login-attempts e teste de exclusão/anonymização (sem remover constraints).
- [ ] 9.9 Documentar a política LGPD (base legal, prazos de retenção, responsável) e o runbook de resposta a solicitações.
- [ ] 9.10 Verificação final: triggers ativos em `pg_trigger`; teste fail-closed verde; solicitação de esquecimento executa e PII fica irreversível (anonymizada); canário sem regressões.
### Critério de conclusão (checklist da etapa)
- [ ] `select tgname, tgenabled from pg_trigger where tgname ilike '%password_reset%'` → triggers de segurança `O` (enabled).
- [ ] Teste de fail-closed do `login-attempts` verde (simular falha/arquivamento e verificar lockout mantido).
- [ ] Evidência de execução de 1 solicitação de esquecimento com PII anonymizada (sem DROP de PK/FK).
- [ ] 3 rotinas de retenção presentes em `pg_cron` e executando (job history OK).
- [ ] Canário `archive._rls_canary` pré vs pós sem regressões no `_lgpd_payload`.

## Etapa 10 — Superfície de exposição: PAT, CORS, URI_ALLOW_LIST, secret scanning, secrets E26, bundle Vercel
**Objetivo:** Fechar as exposições residuais: PAT na URL git, CORS_ORIGIN=*, domínios legados na URI_ALLOW_LIST, secret scanning inativo, secrets E26 ausentes no stack 35 e service_role key no bundle Vercel.
**Base:** findings-21:91 (PAT embutido na URL git da workspace — issue #168), findings-21:92 (CORS_ORIGIN=* no supabase-db-mcp), findings-22:61 (#41 domínios legados na URI_ALLOW_LIST: whats-your-line.lovable.app, zapp-web-v3.vercel.app), findings-21:85 (Secret Scanning 0 alertas — ACCESS_KEY não detectada), findings-21:108 (E26: CRON_SECRET, WHATSAPP_CLOUD_*, ELEVENLABS_WEBHOOK_SECRET, SICOOB_GIFTS_* a provisionar no stack 35), findings-22:185 (GAP-1: bundle Vercel expõe service_role key, ACL admin até 2029; envs Vercel bloqueiam www.zappweb.app.br), findings-22:62 (#38 cross-tenant no mesmo PostgREST).
### Subetapas
- [ ] 10.1 Revogar o PAT embutido na URL git da workspace (issue #168) e configurar `~/.netrc`/credential helper (findings-21:91).
- [ ] 10.2 Restringir `CORS_ORIGIN=*` do supabase-db-mcp ao domínio do app (findings-21:92).
- [ ] 10.3 Remover domínios legados da URI_ALLOW_LIST (whats-your-line.lovable.app, zapp-web-v3.vercel.app) quando confirmados desativados (findings-22:61).
- [ ] 10.4 Habilitar GitHub Secret Scanning + push protection; confirmar detecção dos padrões usados (validar que ACCESS_KEY teria sido detectada — findings-21:85).
- [ ] 10.5 Provisionar os secrets E26 no stack 35: CRON_SECRET, WHATSAPP_CLOUD_APP_SECRET, ELEVENLABS_WEBHOOK_SECRET, WEBHOOK_SECRET, GMAIL_PUBSUB_TOKEN, GOOGLE_CLIENT_ID/SECRET, MICROSOFT_*, RESEND_API_KEY, SICOOB_GIFTS_URL/SECRET (findings-21:25, 108).
- [ ] 10.6 Corrigir GAP-1 Vercel: remover a service_role key do bundle (envs corretos + redeploy M1) e desbloquear www.zappweb.app.br (findings-22:185, 217).
- [ ] 10.7 Avaliar #38 (cross-tenant artes/vendas/financeiro no mesmo PostgREST): documentar postura single-org ou planejar BFF (findings-22:62).
- [ ] 10.8 Rodar varredura final de segredos: gitleaks no histórico + secret scanning do GitHub; corrigir qualquer alerta novo.
- [ ] 10.9 Atualizar documentação de estado (CLAUDE.md, runbook.md, docs/estado) com os resultados da Fase 3.
- [ ] 10.10 Verificação final: `git remote -v` sem PAT; OPTIONS/CORS restrito; URI_ALLOW_LIST limpa; secret scanning ativo; 401/200 checks das secrets E26 provisionadas; bundle Vercel sem service_role key.
### Critério de conclusão (checklist da etapa)
- [ ] `git remote -v` e `.git/config` sem token/PAT (credencial via `~/.netrc`/helper).
- [ ] `curl -H "Origin: <dominio-malicioso>"` → resposta sem `Access-Control-Allow-Origin: *` no supabase-db-mcp.
- [ ] URI_ALLOW_LIST sem os 2 domínios legados (grep no stack).
- [ ] GitHub Secret Scanning ativo com push protection e varredura histórica limpa.
- [ ] Secrets E26 no stack 35 com smoke tests 200/401 e bundle Vercel inspecionado sem service_role key (grep no artefato de deploy).


## Resumo da Fase 3 — SEGURANÇA E LGPD (etapas 21–30)
- **21** Delete do `migrate-helper` no cloud + rotação SERVICE_ROLE_KEY/ANON_KEY/senha Postgres (ACCESS_KEY `7bdebc20…` comprometida).
- **22** Rotação do JWT_SECRET self-hosted + `git filter-repo` (33 commits) + limpeza da allowlist `.gitleaks.toml`.
- **23** Rotação de `mcp_query_secret_v1` (dual-secret, sem quebra) e `AUTHENTICATION_API_KEY` Evolution v4→v5.
- **24** Troca do `VAULT_ENC_KEY` placeholder do supavisor (re-criptografia) + montagem dos secrets do Swarm no service functions.
- **25** Buckets PII `whatsapp-media` (9,56 GB) e `recibos-entrega` → privados com URL assinada + IMGPROXY_KEY/SALT.
- **26** Furos RLS pontuais: PUBLIC INSERT em 2 audit_logs, `n8n_variables`, `feature_flags` anon, 6 polroles NULL (canário `archive._rls_canary`).
- **27** RLS tenant-aware: eliminar 272+141 `USING(true)` e 78 `true/true` (11 críticas primeiro), decisão single-org × isolamento em ADR.
- **28** SECDEF: triagem das 1.131 expostas a authenticated, fix de ~49 search_path, 18 tabelas sem policy (prioridade `_lgpd_payload`), 53 anon+SECDEF sob aprovação.
- **29** LGPD: acesso controlado a `_lgpd_payload`, direito ao esquecimento funcional, 2 triggers de `password_reset_requests` religados, `login-attempts` fail-closed.
- **30** Superfície: PAT na URL git, CORS_ORIGIN=*, URI_ALLOW_LIST legada, Secret Scanning, secrets E26 no stack 35, service_role key fora do bundle Vercel.


---

# FASE 2 — FUNDAÇÃO DE QUALIDADE (testes/CI)

## Etapa 11 — Erradicar testes fantasma team-chat e provar RLS ao vivo
**Objetivo:** substituir os 270 testes team-chat (218 `expect(true)`) e os 52 security-gaps (`expect(true)`) por testes reais contra o SUT, provando os gaps de RLS com execução ao vivo.
**Base:** findings-07:31-32 (17:259-260, 17:279-280); pendencias-consolidadas.md:236-237.

### Subetapas
- [ ] 11.1 Localizar as 2 suítes team-chat (comprehensive 270 + security-gaps 52) e gerar inventário de todas as ocorrências `expect(true)`/`toBe(true)` com `grep -rn "expect(true)" src/` (arquivo + linha).
- [ ] 11.2 Mapear cada bloco de teste ao SUT real (TeamChatPanel, useTeamChatPanel, DepartmentMembersView/InvitesView/AuditView, mutations) — tabela bloco → SUT.
- [ ] 11.3 Reescrever bloco mensagens/reply/edição/áudio/scroll/busca contra hooks e helpers reais (nunca lógica inline).
- [ ] 11.4 Reescrever bloco CRUD de departamentos/membros/convites/auditoria com mock do supabase espelhando as políticas reais.
- [ ] 11.5 Reescrever bloco transferência entre departamentos, incluindo asserção de que `transferred_by` usa o usuário autenticado (17:286 — hoje hardcoded `'Support Agent'`).
- [ ] 11.6 Reescrever os 52 security-gaps como testes de contrato de policy (mock reflete `pg_policies` real; remoção da policy deve quebrar o teste).
- [ ] 11.7 Prova ao vivo via MCP Supabase: `SELECT * FROM pg_policies` filtrando `team_messages`/`team_conversations` e documentar INSERT sem membership check + ausência de DELETE policy (17:280).
- [ ] 11.8 Simulação `SET ROLE authenticated` + JWT claims (membership=false) tentando INSERT em `team_messages` e DELETE em `team_conversations` — registrar resultado real (passou = bug confirmado).
- [ ] 11.9 Se gap confirmado: criar migration de policy (membership check no INSERT; DELETE para owner/member) + teste de regressão na suíte reescrita.
- [ ] 11.10 Rodar `bun run test -- team-chat` e garantir 0 `expect(true)` restantes; prova de morte: remover 1 policy no ambiente de teste → CI deve falhar.

### Critério de conclusão (checklist da etapa)
- [ ] 0 ocorrências de `expect(true)`/`toBe(true)` nas 2 suítes (grep documentado na PR).
- [ ] Nº de asserções reais > nº de testes (nenhum teste sem asserção) nas suítes team-chat.
- [ ] Relatório `pg_policies` + resultado da simulação SET ROLE anexado à PR (findings-07:32 encerrado).
- [ ] Prova de morte executada: remover 1 policy → CI vermelho.

## Etapa 12 — Corrigir cobertura negativa webhookStatusPriority e os 5+ testes-espelho
**Objetivo:** eliminar cobertura que afirma o oposto do runtime (`played=4` vs `3`, `failed` condicional vs incondicional) e ~934 linhas verdes de espelhos que não tocam produção.
**Base:** findings-11:718 (35:A1), findings-11:727 (35:A3); pendencias-consolidadas.md:461.

### Subetapas
- [ ] 12.1 Apagar a cópia inline de `shouldUpdateStatus`/`STATUS_PRIORITY` em `webhookStatusPriority.test.ts` e importar de `evolution-helpers.ts` (35:199-225).
- [ ] 12.2 Alinhar constantes do teste à produção: `played=4` (evolution-helpers.ts:321), `failed` condicional (:332).
- [ ] 12.3 Reescrever os casos :104-110 do `webhookStatusPriority.test.ts` exercitando o SUT importado (feliz + borda + erro).
- [ ] 12.4 Catalogar os espelhos restantes: `rateLimiter`, `groupsAutoSync`, `phoneNormalization`, `rlsGroupAccess`, `centenarias`, `whatsappFileTypes`, `imageCompression` (35:A3, 39:A1/A4).
- [ ] 12.5 `rateLimiter.test.ts`: verificar existência de `RATE_LIMIT_MAX_EVENTS` (35:252-254); se renomeada, importar o SUT real — nunca constante inline.
- [ ] 12.6 `groupsAutoSync.test.ts` e `phoneNormalization.test.ts`: substituir lógica inline por import do módulo real.
- [ ] 12.7 `rlsGroupAccess.test.ts`: importar a policy/SQL real — `DROP POLICY` deve quebrar o teste (35:260-262).
- [ ] 12.8 `whatsappFileTypes.test.ts`: apagar tautologia l.10-14 e cobrir os 15 exports reais (validação de upload/executáveis) (39:A1).
- [ ] 12.9 `imageCompression.test.ts`: reescrever os 5 casos importando o SUT (39:A4); `centenarias.simulacao.test.ts`: importar a lógica real.
- [ ] 12.10 Criar detector de espelho (script: teste sem nenhum import de `src/` = candidato a espelho) e zerar falsos verdes com allowlist documentada.

### Critério de conclusão (checklist da etapa)
- [ ] `webhookStatusPriority.test.ts` importa `evolution-helpers.ts` (grep na PR) e está verde.
- [ ] 0 testes em `src/**/*.test.ts` sem import de `src/` (fora da allowlist).
- [ ] Remover `STATUS_PRIORITY` de produção → teste falha (prova de acoplamento real).

## Etapa 13 — E2E: eliminar 6/13 specs sem asserção, drift de portas e specs contra produção
**Objetivo:** fazer os 13 specs e2e executarem asserção real contra o PR (nunca produção externa), com 1 porta única e env completo.
**Base:** findings-12:739 (40:A1/A2/A3), findings-12:515 (40:A4); pendencias-consolidadas.md:512-515.

### Subetapas
- [ ] 13.1 Auditar os 13 specs e marcar quais caem em `test.skip` gracioso (4 inbox por `RUN_INBOX_E2E`; app-metrics/auth-session-toggle por porta 8080) (40:80-85).
- [ ] 13.2 Decidir `RUN_INBOX_E2E`: definir a var nos workflows (ci.yml + quality-gate.yml) e ativar os 4 specs inbox (847 ln) OU remover o gate e os specs — registrar decisão (40:90-103).
- [ ] 13.3 Unificar porta: escolher 1 entre `vite.config.ts:116` (8080) × `playwright.config.ts:19,24` (5173) × `playwright.e2e.config.ts` (4173) e propagar (40:105-119).
- [ ] 13.4 Remover hardcode `localhost:8080` dos 4 specs que caem no skip gracioso.
- [ ] 13.5 `no-workbook-after-reload`: trocar `https://zapp-web-v3.vercel.app/` pela baseURL do PR (40:121-136).
- [ ] 13.6 Redirecionar os 2 previews `*.lovable.app` para o deploy do PR.
- [ ] 13.7 `page.goto()` com `failOnStatusCode: true` ou asserção de URL — eliminar verde-vácuo em 404.
- [ ] 13.8 Adicionar `VITE_SUPABASE_PUBLISHABLE_KEY` ao `quality-gate.yml:17-22` e ao harness `test.env` (paridade com `ci.yml:26`) (40:193-234).
- [ ] 13.9 Rodar os 13 specs no CI e conferir no report (junit/JSON) que cada spec tem `asserts > 0`.
- [ ] 13.10 Adicionar script de validação (1+ expect por spec) ao quality-gate e atualizar `docs/estado/40-e2e-harness-data.md`.

### Critério de conclusão (checklist da etapa)
- [ ] 13/13 specs com `asserts > 0` no report do CI.
- [ ] 0 URLs de produção externa em specs (grep `zapp-web-v3.vercel.app|lovable.app`).
- [ ] 1 única porta em todos os configs (vite/playwright/playwright.e2e).
- [ ] `ci.yml` e `quality-gate.yml` com o mesmo conjunto de envs.

## Etapa 14 — Reativar auth do proxy.test (31% skips) e suítes desligadas (absorve: externalProxy — suíte única)
**Objetivo:** eliminar os 8/26 skips sem justificativa no gateway `evoApi` (cache de token TTL 30s, fallback anon) e dar destino às 1.118 linhas comentadas de suítes de módulo vivo.
**Base:** findings-11:720-721 (39:A2, 35:A2); pendencias-consolidadas.md:457,462.

### Subetapas
- [ ] 14.1 Inventariar os 4 marcos de skip em `proxy.test.ts` (:185, :204, :355, :498) e classificar cada um (justificável com issue vs dívida).
- [ ] 14.2 Implementar os casos de auth do gateway: cache de token TTL 30s, fallback anon, 401, renovação e refresh concorrente.
- [ ] 14.3 Escrever ou remover o placeholder `it.skip` de `proxy.test.ts:204` (39:138-150) — sem placeholder vazio.
- [ ] 14.4 Preencher ou remover os `describe.skip` :355/:498 com casos reais de auth.
- [ ] 14.5 Decidir `externalProxy.test.ts` (601 linhas comentadas, placeholder :619-621): reativar OU remover o módulo — verificar os 5 importadores (incl. fallback de contato na inbox) (35:A2).
- [ ] 14.6 Se reativar: descomentar e ajustar mocks aos imports atuais; se remover: migrar call sites e apagar suíte — nunca estado "comentado no meio".
- [ ] 14.7 `resilienceSimulation.test.ts` (517 linhas comentadas, :536-538): mesma decisão — módulo `retryScheduleSimulation` é EM_USO (1 prod).
- [ ] 14.8 Corrigir o comentário do bloco `// DENO` no `vitest.config.ts` (afirma execução que não ocorre) (35:269-276).
- [ ] 14.9 Rodar as suítes reativadas no CI e medir delta de cobertura (auth do gateway).
- [ ] 14.10 Atualizar `docs/estado/39-residual-tests.md` e `35-lib-tests.md` com o status final de cada suíte.

### Critério de conclusão (checklist da etapa)
- [ ] `proxy.test.ts` com 0 `it.skip`/`describe.skip` (ou todos justificados por comentário + issue linkada).
- [ ] Cobertura de auth do gateway ≥ 80% dos casos (TTL, fallback, refresh, 401).
- [ ] `externalProxy.test.ts` reativada OU módulo removido — nenhum dos dois estados.
- [ ] `vitest.config.ts` sem bloco `// DENO` falso.

## Etapa 15 — Corrigir gates de CI que travam merge e guardas falsos
**Objetivo:** destravar merge (required com paths filter), desativar deploy DRAFT concorrente, religar observabilidade pós-deploy e ligar gates documentados como ativos.
**Base:** findings-12:740 (38:A2-A6, A10); pendencias-consolidadas.md:499-511.

### Subetapas
- [ ] 15.1 `security-invoker-gate.yml`: remover o `paths:` filter do check required — rodar sempre ou reportar contexto obrigatório (38:315).
- [ ] 15.2 Testar com PR que não toca os paths: status deve reportar ✓/✗ (nunca "Expected — Waiting for status").
- [ ] 15.3 `deploy-vps-selfhosted.yml`: desativar (marcado "⚠️ DRAFT — NÃO ativar" mas ATIVO) — comentar trigger ou remover; alinhar concurrency e retenção GHCR 9 vs 30 (38:316).
- [ ] 15.4 `post-deploy-check.yml`: corrigir trigger de `["deploy-vps.yml"]` para o nome real `🚀 Build & Deploy — ZAPP web v3` (38:317).
- [ ] 15.5 `notify-ci-failure.yml`: corrigir lista (5 dos 6 workflows não existem) para os nomes reais.
- [ ] 15.6 `branch-protection-sentinel.yml`: corrigir fail-open (sem `BRANCH_PROT_PAT` → `::warning` + `exit 0`, 38:82-88) e enumeração de 10 → 11 contextos (38:318).
- [ ] 15.7 Ligar `check-column-map.mjs` e `phys-refs-gate.mjs` nos workflows (hoje "bloqueiam PRs" sem nenhum chamador) (38:319).
- [ ] 15.8 `zapp-functions-health.yml:14,17`: criar `scripts/check-functions-health.sh` no repo ou remover a referência (38:323).
- [ ] 15.9 `seed-e2e-user.yml`: criar workflow chamador ou auto-recuperação do usuário E2E (38:320).
- [ ] 15.10 Validar os 10 gates required com PR de teste (tocar cada path) e atualizar `docs/estado/38-infra-ci-scripts.md`.

### Critério de conclusão (checklist da etapa)
- [ ] PR sem tocar os paths do security-invoker reporta status (não "Expected — Waiting").
- [ ] `deploy-vps-selfhosted.yml` inativo: 0 runs em 7 dias (GitHub Actions).
- [ ] `post-deploy-check` dispara após 1 deploy real (run confirmada no histórico).
- [ ] Sentinel enumera os 11 contextos e falha fechado (sem `BRANCH_PROT_PAT` → exit ≠ 0 em dry-run controlado).

## Etapa 16 — Build reprodutível do RUNNER DE CI (lockfile, base, env, flakiness)
**Objetivo:** garantir imagem Docker e CI reproduzindo exatamente o lockfile e o ambiente do dev, sem retries que mascarem flakiness e sem lixo versionado.
**Base:** findings-12:742 (38:A8); findings-12:523 (40:A12); findings-12:508 (38:A11); pendencias-consolidadas.md:506,508,515,523.

### Subetapas
- [ ] 16.1 `Dockerfile:6-8`: restaurar `--frozen-lockfile` no `bun install` (38:321).
- [ ] 16.2 Pin da base `oven/bun:1.3-alpine`: trocar tag flutuante por versão exata + digest (ex.: `bun:1.3.x-alpine@sha256:…`).
- [ ] 16.3 Confirmar/adicionar validação de lockfile no CI (`bun install --frozen-lockfile` em workflow dedicado).
- [ ] 16.4 Teste de reprodutibilidade: build da imagem 2× e diff das dependências resolvidas (`bun pm ls`).
- [ ] 16.5 `vitest.config.ts:14`: `retry: 2` → `0`; triar flakiness com o próprio `flaky-test-detector` (40:A12).
- [ ] 16.6 Remover os 3 `.pyc` versionados (`scripts/__pycache__/…`, raiz `ci_cost_analysis.cpython-314.pyc`, `.hermes/rollback-test/…`) e adicionar `__pycache__/` ao `.gitignore` (38:A11).
- [ ] 16.7 `quality-gate.yml`: adicionar `VITE_SUPABASE_PUBLISHABLE_KEY` (paridade com `ci.yml:26`) (40:A4).
- [ ] 16.8 Definir `test.env`/harness env documentado para que `TextToAudioButton.auth.test.tsx` nunca rode com `ANON` undefined.
- [ ] 16.9 Configurar renovação (Dependabot/Renovate) para a base pinada com PR de update.
- [ ] 16.10 Documentar o build canônico (comando + env) e decidir alvo oficial: `vercel.json` × Docker/Swarm/Portainer (38:A12).

### Critério de conclusão (checklist da etapa)
- [ ] `Dockerfile` contém `--frozen-lockfile`.
- [ ] `BASE_IMAGE` com versão+digest exatos (sem tag flutuante).
- [ ] CI de testes sem `retry` (0 retries em `vitest.config.ts`).
- [ ] `git ls-files | grep -c pyc` = 0 e `__pycache__/` no `.gitignore`.

## Etapa 17 — Resolver a quarentena de 27 suítes (Deno/NEEDS-ENV/ORPHAN/FAILING)
**Objetivo:** dar destino final às ~2.177 linhas não executadas por runner nenhum — migrar para Vitest, prover env ou remover com veredito.
**Base:** findings-12:525 (40:157-160); findings-11:192,196,219,231,245 (35:17-24, 35:71,77); findings-10:709 (28 L359-360); pendencias-consolidadas.md:459-460,525.

### Subetapas
- [ ] 17.1 Listar as 27 suítes do `exclude` do `vitest.config.ts` com motivo (ORPHAN/FAILING/DENO/NEEDS-ENV) e issue por grupo.
- [ ] 17.2 Migrar as 4 Deno para Vitest: `clientRateLimiter`, `healthCheck`, `queryTimeout`, `sanitize-extra` (35:145-157).
- [ ] 17.3 `useAudioRecorder.cleanup.test`: migrar de runner Deno (`deno.land/std` L11) para Vitest ou excluir (28 L359-360).
- [ ] 17.4 `contactsDB.test.ts` (NEEDS-ENV): localizar o "script de integração" ou definir workflow com vars; senão, converter em teste de integração com setup documentado (35:177-181).
- [ ] 17.5 Renomear `debug-dompurify-test.ts` → `debug-dompurify.test.ts` (fora do glob atual) (35:167-173).
- [ ] 17.6 `healthCheck.test.ts`: remover tautologia `assertEquals(true,true)` :13; decidir testar o stub ou removê-lo junto com o módulo órfão `healthCheck` (33:A2).
- [ ] 17.7 `stress-test.test.ts`: remover o `it.skip` ou reescrever contra staging — nunca 10 reqs contra produção (40:380-386).
- [ ] 17.8 Triar suítes FAILING: classificar cada uma (bug real vs teste frágil) e reabilitar ou deletar com veredito.
- [ ] 17.9 `src/test/realtimeEventParser.ts` (92 ln, 0 importadores): fazer o consumidor que reimplementa localmente passar a importá-lo (40:372-378).
- [ ] 17.10 Atualizar quarentena: `exclude` vazio ou allowlist mínima com issue linkada; atualizar docs 35/40.

### Critério de conclusão (checklist da etapa)
- [ ] `exclude` do `vitest.config.ts` = `[]` ou apenas allowlist com issue linkada.
- [ ] 0 arquivos `*-test.ts`/`debug-dompurify-test.ts` fora do glob do vitest.
- [ ] `bun run test` executa 100% das suítes do repo (nenhuma comentada/skip por config).
- [ ] `healthCheck.test.ts` sem tautologia.

## Etapa 18 — Remover testes duplicados, STUBs e asserções-vácuo
**Objetivo:** eliminar duplicatas (useTheme/useUrlFilters .ts+.tsx), 3 testes STUB de hooks, gmailHealthRLS hardcoded, asserção-vácuo e MockAuthProvider no-op.
**Base:** findings-10:709-710 (28 A2, 29 A1-A4, A9); findings-07:256 (30:185,222); findings-11:297 (39:A3); findings-12:521 (40:A10); pendencias-consolidadas.md:397-398,456.

### Subetapas
- [ ] 18.1 Consolidar `useTheme.test.ts` × `useTheme.test.tsx` (29 A1) — manter o que importa o SUT real; candidato a remoção não acrescenta cobertura.
- [ ] 18.2 Consolidar `useUrlFilters.test.ts` (291 ln) × `.test.tsx` (99 ln, duplicata parcial) (29 A2).
- [ ] 18.3 `useApplicableSLA.test`: remover `resolveApplicableSLA` inline e importar o hook real (28 L356-357).
- [ ] 18.4 `useSLACalculation.test`: instanciar o hook real com `renderHook` (29 A5 — hoje zero cobertura de renderHook).
- [ ] 18.5 `usePushNotifications.test`: reescrever os 8 testes `typeof fn` com comportamento real (permissão, subscribe/unsubscribe, VAPID, showNotification) (29 A3).
- [ ] 18.6 `useTextToSpeech.test`: cobrir speak/parada prematura/erros/enfileiramento ou remover (29 A4).
- [ ] 18.7 `gmailHealthRLS.test.ts` (34L, strings hardcoded): reescrever contra policies reais ou remover (30:185,222).
- [ ] 18.8 `TextToAudioButton.auth.test.tsx:50`: definir `ANON` no test env e substituir `expect(undefined).toBe(undefined)` por asserção real (39:A3).
- [ ] 18.9 `defaultShortcuts`: reconciliar 24 vs 25 entries (29 A9) e corrigir o teste.
- [ ] 18.10 `MockAuthProvider` no-op (`value: _value`): propagar `value` ao contexto e adicionar teste de logout que falha se o provider descartar value (40:A10).

### Critério de conclusão (checklist da etapa)
- [ ] 1 arquivo de teste por módulo (0 duplas `.ts`/`.tsx`).
- [ ] 0 testes com `typeof fn` como única asserção.
- [ ] 0 asserções com `undefined` literal (`expect(undefined).toBe(undefined)`).
- [ ] `grep resolveApplicableSLA` no arquivo de teste = 0 (importado do hook real).

## Etapa 19 — Regenerar types.ts e sanear typecheck (ts-nocheck, tsconfig, casts)
**Objetivo:** eliminar drifts de types.ts (RPCs DLQ não regenerados), `@ts-ignore`/`@ts-nocheck` e exclusões de tsconfig que escondem código morto.
**Base:** findings-07:28 (17:292 — `@ts-ignore` em useFailedMessages.ts:37); findings-12:522 (40:A11 — tsconfig.app.json:34-35, `src/_archive/**`); findings-14:870 (ts-nocheck falha ambiental git-bash); pendencias-consolidadas.md:522.

### Subetapas
- [ ] 19.1 Regenerar `types.ts` via MCP Supabase (`supabase_generate_typescript_types`) contra o banco atual (pós-move 11:50Z — topologia evo física) e revisar o diff.
- [ ] 19.2 Confirmar RPCs `rpc_dlq_*` presentes nos tipos gerados; remover o `@ts-ignore` de `useFailedMessages.ts:37` (17:292).
- [ ] 19.3 Rodar typecheck completo (`tsc --noEmit` / `bun run typecheck`) e listar erros residuais.
- [ ] 19.4 `tsconfig.app.json:34-35`: remover exclusões dos 2 testes que não existem mais (40:396-402).
- [ ] 19.5 `src/_archive/**`: adicionar ao `exclude` do tsconfig OU remover do baseline (604 ln ainda type-checked) (40:A11).
- [ ] 19.6 Contabilizar e eliminar `@ts-nocheck` restantes (ex.: CRM, findings-22:1059) — resolver ou remover o arquivo.
- [ ] 19.7 Padronizar typecheck no CI: comando canônico que roda igual em ubuntu e git-bash (documentar o workaround do ts-nocheck falho no git-bash) (findings-14:870).
- [ ] 19.8 Corrigir casts degenerados conhecidos: `as unknown` (useSearchManagement 26 A6), `as never` (usePersonalStickers 25 A12), `SafeQueryBuilder = any` (30:191) com tipos reais.
- [ ] 19.9 Adicionar job de CI `typecheck` com `tsc -b` sem suppress (gate no quality-gate.yml).
- [ ] 19.10 Atualizar consumidores DLQ (DLQPanel/DLQAuditHistory) com os tipos regenerados e revisar `docs/estado/17-*`.

### Critério de conclusão (checklist da etapa)
- [ ] `types.ts` regenerado e commitado com diff revisado (RPCs `rpc_dlq_*` presentes).
- [ ] 0 `@ts-ignore`/`@ts-nocheck` novos na PR; contagem atual documentada e decrescente.
- [ ] `tsc --noEmit` verde local (git-bash) e no CI ubuntu.
- [ ] `src/_archive/**` fora do typecheck ou decisão documentada na PR.

## Etapa 20 — Converter testes tautológicos em SUT real + baseline de cobertura
**Objetivo:** fechar a fundação: nenhum teste verde sem tocar produção (realtimeFanoutWildcard, webhook-fuzzer, blocos RLS tautológicos) e thresholds de cobertura com baseline.
**Base:** findings-12:516-518 (40:A5/A6/A7), findings-12:524 (40:507-523), findings-12:519 (40:A8); pendencias-consolidadas.md:517-519.

### Subetapas
- [ ] 20.1 `realtimeFanoutWildcard.test.ts`: apagar a cópia local (espelho auto-declarado) e importar o SUT real `@/lib/realtime/edgeEvents` (usado por `realtimeFanoutEvents.test.ts:14`) (40:A5).
- [ ] 20.2 `webhook-fuzzer.test.ts`: importar `validateWebhookPayload` de produção (hoje definida no próprio teste; 1.100 execs sobre validador inexistente) (40:A6).
- [ ] 20.3 `security-and-performance.test.ts:43-77,150-170`: remover blocos tautológicos (mock devolve o que o teste mandou); manter os 2 describes legítimos (40:A7).
- [ ] 20.4 `dlq-transfers-rls.test.ts:52-100`: reescrever contra policies/mocks que reflitam o SQL real de RLS.
- [ ] 20.5 `sprint1-security-hardening.test.ts`: trocar grep sobre texto de migration (17 expects, zero SUT) por teste contra `pg_proc` (funções existem no banco) (40:507-523).
- [ ] 20.6 Instalar `coverage.thresholds` no vitest por módulo (lib/hooks/e2e) com baseline medido na 1ª execução e publicado como artifact.
- [ ] 20.7 Criar o gate anti-espelho no CI: falha se um teste não importa nenhum símbolo de `src/` (allowlist) — plugar no quality-gate.yml.
- [ ] 20.8 Estender `contractSnapshot.test.ts` (rpcCatalog, 40:412-442) para conferir ao vivo contra `pg_proc` (declaradas × vivas — 822 fns sem declaração, 37:A8).
- [ ] 20.9 Rodar cobertura completa, publicar report e atualizar QUALITY_METRICS/audits com o baseline.
- [ ] 20.10 Documentar política de testes (AGENTS.md/CLAUDE.md): proibido `expect(true)`, espelho, skip sem issue; atualizar docs de estado 35/39/40.

### Critério de conclusão (checklist da etapa)
- [ ] 0 testes sem import de `src/` fora da allowlist (gate anti-espelho verde no CI).
- [ ] `realtimeFanoutWildcard` e `webhook-fuzzer` importam o SUT real.
- [ ] `coverage.thresholds` ativos e verdes no CI com baseline documentado.
- [ ] `sprint1-security-hardening.test.ts` testa `pg_proc` (grep de migration removido).
- [ ] Política anti-teste-fantasma documentada no AGENTS.md/CLAUDE.md.


---

# FASE 3 — BACKEND CRÍTICO, REALTIME E PERFORMANCE

## Etapa 21 — Reativar Realtime de mensagens e conversas na publication

**Objetivo:** Fazer `evo.evolution_messages`/`evo.evolution_conversations` voltarem a emitir eventos na publication `supabase_realtime`, com gate de topologia, correção dos hooks e docs.

**Base:** findings-12:58 (37:351-358 — 14 relations na publication, mensagens/conversas fora em nenhum schema; A1 🔴 CRÍTICO); findings-07:94 (31:29-34, 150-161 — subscriptions nunca recebem INSERT/UPDATE); findings-12:130 (ERRATA 46-54 — GATE `relkind` obrigatório antes de agir).

### Subetapas
- [ ] 21.1 Rodar GATE `relkind` via `supabase_db_query` (`pg_class`+`pg_namespace`): evo raízes `p`/`r`, zapp views `v`; se divergir da ERRATA, abortar e revisar a errata (findings-12:130).
- [ ] 21.2 Listar relations atuais: `SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'` — registrar as 14 e confirmar ausência das 2 tabelas (37:351-358).
- [ ] 21.3 Adicionar as raízes `evo.evolution_messages` e `evo.evolution_conversations` (`ALTER PUBLICATION supabase_realtime ADD TABLE`); confirmar `pubviaroot=true` para partições herdarem (37:332) e testar evento em partição `_wpp2`; se o papel do MCP não for dono da publication, executar como `supabase_admin`.
- [ ] 21.4 Verificar RLS/grants: `authenticated` foi REVOKE em `evo.*` (findings-12:123, ERRATA 21-54) — garantir policy SELECT para o papel do browser, senão o evento chega mas é filtrado (zero entrega).
- [ ] 21.5 Conferir a subscription no front: canal com `schema:'evo'` + tabela/evento corretos (findings-12:123); corrigir qualquer ponto que aponte `schema:'zapp'` (premissa invertida, 31:29-34).
- [ ] 21.6 Prova E2E: INSERT de teste via `supabase_db_query` em `evo.evolution_messages` → evento observado no canal (console/WS) com o mesmo JWT do browser.
- [ ] 21.7 Corrigir `useZappConversations.test.tsx` (127L) que trava topologia obsoleta (exige `schema:'evo'` por asserção — 31:138-148): reescrever para a topologia vigente.
- [ ] 21.8 Corrigir hooks zappweb que leem a partição `_wpp2` direto (`from()` na partição, 30:196-197) → leitura pela raiz `evolution_messages` (ERRATA 204-205).
- [ ] 21.9 Interceptar docs contaminados (31- recomenda `schema:'zapp'` — quebraria Realtime; 32- A1; 36- A8 — findings-12:129) e corrigir CLAUDE.md (regra 4 invertida + 8 contagens, ERRATA 157-172).
- [ ] 21.10 Registrar a migração do `ALTER PUBLICATION` no repo e endurecer o guard INV-6 (não fail-open: drift de publication deve reprovar CI — findings-12:95, 38:328).

### Critério de conclusão (checklist da etapa)
- [ ] `evo.evolution_messages` e `evo.evolution_conversations` constam em `pg_publication_tables` (query salva como evidência)
- [ ] INSERT real gera evento no canal realtime (evidência de console/WS com JWT autenticado)
- [ ] `useZappConversations.test.tsx` verde com topologia vigente
- [ ] CLAUDE.md corrigido com contagens medidas (zapp 386 / evo 70 / ops 51)
- [ ] Migração versionada aplicada e INV-6 sem fail-open

## Etapa 22 — Consertar fila offline do PWA (ADR-005): tag e handler do SW

**Objetivo:** Fazer a fila offline realmente drenar: alinhar a tag de broadcast e implementar o handler `sendQueuedMessages()` no service worker.

**Base:** findings-22:117 (_CONSOLIDADO.md §4.1 — `offlineQueue.ts:137` registra `send-queued-messages`; `sw.js:149` escuta `send-messages`; handler `sendQueuedMessages()` em `sw.js:152` é `console.log` vazio; feature aparenta existir e não faz nada).

### Subetapas
- [ ] 22.1 Ler `offlineQueue.ts` e `sw.js` no repo; mapear o fluxo enfileirar → broadcast → drenar (eventos `online`/message).
- [ ] 22.2 Padronizar a tag: contrato único (ex.: `send-messages`) em `offlineQueue.ts:137` e `sw.js:149` — ou inverter, com decisão registrada.
- [ ] 22.3 Implementar `sendQueuedMessages()` em `sw.js:152`: ler fila persistida (IndexedDB), reenviar via Supabase/EF, atualizar status por item.
- [ ] 22.4 Garantir persistência da fila no IndexedDB (TTL + limite de itens) — sobreviver a kill do service worker.
- [ ] 22.5 Reuso de `idempotency_key` (`msg:<id>`) no reenvio — evitar duplicata via `evolution_send_idempotency` (findings-03:33).
- [ ] 22.6 Falhas: retry com backoff (maxRetries=3) e status terminal `abandoned` para o canal `failed_messages` (findings-03:56).
- [ ] 22.7 Sinalizar na UI mensagens pendentes offline e disparar a drenagem ao religar (evento `online`).
- [ ] 22.8 Testes: handler do SW (drenagem) + teste do broadcast com a tag correta.
- [ ] 22.9 E2E real: enviar mensagem com rede offline → religar → mensagem entregue e visível no inbox, sem duplicata.
- [ ] 22.10 Atualizar ADR-005 com estado pós-fix (feature funcional, limitações conhecidas).

### Critério de conclusão (checklist da etapa)
- [ ] Tag única alinhada (offlineQueue ↔ sw.js) e handler sem `console.log` vazio
- [ ] E2E offline→online entregou a mensagem no WhatsApp (evidência no inbox)
- [ ] 1 envio por item (idempotency validado)
- [ ] ADR-005 atualizado com evidência

## Etapa 23 — Unificar dual-path de mensagens (zapp.messages × evo.evolution_messages)

**Objetivo:** Definir fonte canônica de mensagens do inbox e eliminar o risco de inconsistência do caminho duplo, com fallback documentado.

**Base:** findings-03:234 (06:688-691 — dual-path sem mecanismo de migração/fallback documentado; `useMessages` PARCIAL, 06:627); findings-07:108-109 (31:171-176 — `isArchived` sempre false, ramo morto; 31:179-185 — ramo PTT por comparação literal em vez de `extractMessageType`).

### Subetapas
- [ ] 23.1 Mapa de escritas/leituras: grep por `.from('messages')` e `evolution_messages` (useMessages, useRealtimeMessages, useConversationMessagesData, insertAuxMessage…).
- [ ] 23.2 Definir fonte canônica de leitura do inbox: `evo.evolution_messages` cursor-based via `rpc_list_messages_lite` (findings-03:43) e registrar contrato.
- [ ] 23.3 Migrar leituras legadas (messageRepository/`useMessages`) para o caminho canônico com fallback documentado.
- [ ] 23.4 Decidir destino de escritas auxiliares (`insertAuxMessage`: UUID → `zapp.messages`; JID → skip hoje — findings-03:166) e implementar de forma consistente.
- [ ] 23.5 Deprecar `useMessages` (LEGADO) com aviso no código e remoção agendada.
- [ ] 23.6 Corrigir `evolutionAdapter`: `isArchived` sempre false (ramo morto) e ramo PTT via `extractMessageType` (findings-07:108-109).
- [ ] 23.7 Remover cópia inline de `shouldUpdateStatus`/`STATUS_PRIORITY` → importar de `evolution-helpers.ts` (pendencias-consolidadas.md:461).
- [ ] 23.8 Testes de contrato do adapter: 61 casos existentes + novos (isArchived/PTT) (findings-07:106).
- [ ] 23.9 Telemetria de divergência: amostra periódica contando mensagens por fonte (zapp vs evo) em produção.
- [ ] 23.10 Documentar arquitetura de dados de mensagens (data-flow) e atualizar docs de estado 06/07.

### Critério de conclusão (checklist da etapa)
- [ ] Fonte canônica definida e leituras legadas migradas (0 leituras `zapp.messages` no caminho do inbox)
- [ ] `isArchived`/PTT corrigidos com testes verdes
- [ ] Divergência medida ≈ 0 em produção (evidência de amostra)
- [ ] Doc de arquitetura de mensagens atualizado

## Etapa 24 — Corrigir edge functions críticas (templates 401, health-check, imap-bridge)

**Objetivo:** Fazer `evolution-templates` responder ao chamador real, `connection-health-check` usar o gateway e encerrar o STUB do `email-imap-bridge`.

**Base:** findings-12:36-37 (36:330-332 — A1: `connection-health-check` com 2 fetch diretos `:40`/`:151` + `requireEnv('EVOLUTION_API_URL')` `:193` fora do gateway; A2: `email-imap-bridge` STUB declarado, 36:284-294; A3: `evolution-templates` 401 em 100% via `requireServiceRoleOrCron()`, 36:303-309).

### Subetapas
- [ ] 24.1 `evolution-templates`: substituir `requireServiceRoleOrCron()` por auth compatível com o chamador browser (ou rotear a chamada server-side) — 36:303-309.
- [ ] 24.2 `evolution-templates`: corrigir `syncFromEvolution` (falha silenciosa) e validar CRUD/envio via invoke autenticado.
- [ ] 24.3 `connection-health-check`: trocar os 2 fetch diretos (`:40`, `:151`) por `_shared/providers/evolution/client.ts` (gateway).
- [ ] 24.4 `connection-health-check`: substituir `requireEnv('EVOLUTION_API_URL')` (`:193`) por resolução via vault/gateway (sem URL hardcoded).
- [x] 24.5 `email-imap-bridge`: decisão registrada (2026-08-17, wt-g5) — IMAP/SMTP real é INVIÁVEL em Edge Function (HTTP-only, sem TCP); caminho VIÁVEL construído: `zapp-email-inbound-webhook` (webhook Resend → zapp.emails) + `zapp-email-send` (Resend API + storage) + migration zapp.emails RLS. TODO EMAIL-02 removido do docblock com justificativa.
- [x] 24.6 Decisão executada: contrato honesto no `email-imap-bridge` (docblock corrigido, só ações reais; fetchInbox/sendMessage rejeitadas no contrato) + edges viáveis `zapp-email-*` registradas (contract-schemas/edge-contract-schemas/contract-versions).
- [ ] 24.7 Deploy das funções (deploy-edge.sh / supabase) + smoke `edge-auth-smoke` (invoke com JWT) (findings-12:79).
- [ ] 24.8 Atualizar ESTADO.md e CLAUDE.md (status/contagem das 3 funções).
- [ ] 24.9 Testes de contrato Zod (`parseOrReject`) para as 3 funções (edge-function-contract-tests).
- [ ] 24.10 Verificação em produção: invoke browser → 200; health-check 100% via gateway; imap-bridge sem anúncio falso.

### Critério de conclusão (checklist da etapa)
- [ ] `evolution-templates` 200 para o chamador real (browser/cron) com envio validado
- [ ] `connection-health-check` sem fetch direto à Evolution (gateway 100%)
- [x] `email-imap-bridge`: contrato honesto (sem STUB/anúncio falso em produção) + caminho viável `zapp-email-*` construído (2026-08-17, wt-g5)
- [ ] Smoke + contrato Zod verdes em produção

## Etapa 25 — Eliminar bypasses do gateway Evolution e fechar gate I8

**Objetivo:** Zerar fetch direto à Evolution API a partir de edge functions e React, com gate I8 varrendo também código Deno.

**Base:** findings-22:118 (_CONSOLIDADO.md §8.2/§9 — 3 bypasses reais, 2 enviam WhatsApp: `evolution-templates` `:53`/`:81`, `evolution-notification-dispatcher` `:257`/`:270`, +2 parciais; gate I8 varre pg_proc e é cego a edge functions Deno); pendencias-consolidadas.md:548 (5 `invoke('evolution-*')` direto do React fora do adapter).

### Subetapas
- [ ] 25.1 Inventário completo: grep em `supabase/functions` por fetch direto (EVOLUTION_API_URL, evolution.atomicabr.com.br, `fn_get_vault_secret` + fetch).
- [ ] 25.2 Migrar o bypass do `evolution-templates` (`:53` vault + `:81` sendText) para o gateway client.
- [ ] 25.3 Migrar `evolution-notification-dispatcher` (`:257`/`:270`) para o gateway client.
- [ ] 25.4 Migrar os 2 bypasses parciais listados no _CONSOLIDADO §8.2.
- [ ] 25.5 Reimplementar gate I8: varredura de edge functions Deno (não só `pg_proc`) — gate bloqueante no CI.
- [ ] 25.6 Migrar os 5 `invoke('evolution-*')` direto do React para o adapter/wrapper (pendencias-consolidadas.md:548).
- [ ] 25.7 Garantir `fn_get_vault_secret` acessível apenas server-side (nenhum path chamável por browser).
- [ ] 25.8 Testes de regressão: envio WhatsApp real (sendText/sendAudio) via gateway.
- [ ] 25.9 Rodar o gate novo: 0 violações (fetch direto) em `supabase/functions` e `src`.
- [ ] 25.10 Documentar decisão de arquitetura e atualizar ADR/gate I8 (cobertura Deno).

### Critério de conclusão (checklist da etapa)
- [ ] 0 fetch diretos à Evolution em `supabase/functions` e `src` (gate verde)
- [ ] Envios WhatsApp passam 100% pelo gateway (evidência de log)
- [ ] 5 `invoke` direto do React migrados para o adapter
- [ ] Vault secrets inacessíveis a código browser-side

## Etapa 26 — Corrigir crons quebrados e declarar jobs no repo

**Objetivo:** Zerar as falhas dos 5 jobs (27, 206, 334, 311, 84), declarar os jobs corrigidos no repo e ampliar retenção de `job_run_details`.

**Base:** findings-12:63-65 (37:372-384 — A5: job 27 `whatsapp_reconcile_dispatch` 91 falhas/701 execs (13%) por `job startup timeout`; A6: jobs 206/334/311 com bug SQL determinístico; A7: job 84 erro base64 no `vault.decrypted_secrets`); findings-12:62 (37:390-392 — 207 crons vivos sem declaração); findings-12:69 (37:402-404 — retenção `job_run_details` ~2,4 dias).

### Subetapas
- [ ] 26.1 Coletar estado dos 5 jobs via `supabase_db_query` (`cron.job` + `cron.job_run_details` 7d) — mensagens de erro atuais.
- [ ] 26.2 Job 27: mitigar `job startup timeout` (simplificar launcher/janela/backoff) e revalidar função ambígua + estado `connecting` (pendencias-consolidadas.md:877).
- [ ] 26.3 Job 206: corrigir referência `evo.evolution_audit_log does not exist` (nome real da tabela de auditoria).
- [ ] 26.4 Job 334: corrigir `missing FROM-clause entry for table "ec"` (falhou 16/08 11:52Z).
- [ ] 26.5 Job 311: corrigir escrita em coluna gerada `resolved`.
- [ ] 26.6 Job 84: corrigir `invalid symbol "\" found while decoding base64` no `vault.decrypted_secrets('evolution_api_key')` (reescrever secret válido no vault).
- [ ] 26.7 Declarar os jobs corrigidos no repo (migration com `cron.schedule` idempotente) — reduzir os 207 sem declaração.
- [ ] 26.8 Aumentar retenção de `cron.job_run_details` para ≥7 dias (investigação >3 dias inviável).
- [ ] 26.9 Validar 7 dias: 0 falhas nos 5 jobs (ou <1%) com evidência de `job_run_details`.
- [ ] 26.10 Atualizar CRON-MATRIX.md (inclui D-1: job 161 `evo-wpp2-401-disconnect-feed` sem espelho — findings-22:145).

### Critério de conclusão (checklist da etapa)
- [ ] 5 jobs sem falha nos últimos 7 dias (evidência SQL anexada)
- [ ] Retenção `job_run_details` ≥ 7 dias
- [ ] Jobs corrigidos declarados em migration aplicada
- [ ] CRON-MATRIX atualizado

## Etapa 27 — Tornar schema_migrations um ledger confiável e versionar RPCs órfãs (absorve: RPCs de email sem migration)

**Objetivo:** Reconciliar as 648 aplicadas × 325 arquivos (387 sem arquivo / 64 sem aplicação) e garantir que o repo reconstrua produção.

**Base:** findings-12:60-61 (37:364-366 — 387 aplicadas sem arquivo, 64 arquivos sem aplicação, ledger não confiável; 37:368-370 — `20260815035000_decouple_ops_pgnet_wrappers` nunca aplicada, `ops.pg_net_get`/`pg_net_post` ausentes); findings-22:146 (MIGRATIONS-DRIFT — 62 migrations recentes pendentes de commit).

### Subetapas
- [ ] 27.1 Exportar `schema_migrations` completo via `supabase_db_query` (648 registros) e salvar artefato.
- [ ] 27.2 Classificar as 387 sem arquivo: 160 rótulos alfanuméricos (MCP), 88 squash, 139 numéricas — agrupar por origem (37:153-196).
- [ ] 27.3 Mapear os 64 arquivos sem aplicação (33 da onda 15/08 fora de banda + demais) e verificar se o efeito já está presente no banco.
- [ ] 27.4 Resolver `20260815035000_decouple_ops_pgnet_wrappers`: aplicar (criar `ops.pg_net_get`/`pg_net_post`) ou registrar com efeito verificado.
- [ ] 27.5 Commitar as 62 migrations pendentes no repo (MIGRATIONS-DRIFT :8-12).
- [ ] 27.6 Criar migration de reconciliação (baseline declarativo) registrando as aplicadas sem arquivo — sem reaplicar DDL.
- [ ] 27.7 Validar paridade: query de diff — 0 aplicadas sem arquivo e 0 arquivos sem aplicação.
- [ ] 27.8 Reforçar gates CI (migration-uniqueness/schema-drift) para reprovar novo desalinhamento (findings-12:79).
- [ ] 27.9 Atualizar MIGRATIONS-DRIFT.md com o novo estado.
- [ ] 27.10 Dry-run de reconstrução de schema a partir do repo (staging) para provar ledger confiável.

### Critério de conclusão (checklist da etapa)
- [ ] 0 aplicadas sem arquivo / 0 arquivos sem aplicação (query de diff anexada)
- [ ] `20260815035000` resolvida (aplicada ou registrada com efeito verificado)
- [ ] 62 migrations commitadas
- [ ] Gates CI reprovam em drift (testado com fixture/PR proposital)

## Etapa 28 — Corrigir telemetria do consumer (INSERT em relação inexistente)

**Objetivo:** Parar a perda de telemetria do consumer do evolution-stack corrigindo o INSERT em relação inexistente (`consumer.py:239`) e validar o pipeline de ingestão.

**Base:** pendencias-consolidadas.md:547 (consumer.py:239 — INSERT em relação inexistente, telemetria perdida; E89: consumer sem `PG_EVOLUTION_URL`/dual-write); pendencias-consolidadas.md:930 (bug bilateral consumer-stats 404, POST ~30s acumulando); pendencias-consolidadas.md:934 (drift digest runtime `9b1a5b967` × stack `0f4b07cfb`).

### Subetapas
- [ ] 28.1 Localizar `consumer.py:239` no evolution-stack (repo/container via `portainer_exec_container`) e identificar a relação-alvo inexistente.
- [ ] 28.2 Confirmar topologia real da tabela via `supabase_db_query` (zapp/evo pós-move 11:50Z) e corrigir o INSERT (schema + colunas).
- [ ] 28.3 Validar `PG_EVOLUTION_URL` no serviço consumer (env) — sem ela o dual-write E89 não funciona.
- [ ] 28.4 Implementar/validar dual-write (E89) para a telemetria nos destinos corretos.
- [ ] 28.5 Deploy do consumer corrigido no evolution-stack (stack 126) via Portainer.
- [ ] 28.6 Corrigir o bug bilateral consumer-stats 404 (POST ~30s acumulando 404) (pendencias-consolidadas.md:930).
- [ ] 28.7 Verificar telemetria: contagem de linhas na tabela-alvo antes/depois (janela 15min) — evidência SQL.
- [ ] 28.8 Alinhar digest runtime × stack (`9b1a5b967` × `0f4b07cfb`) e labels OCI 2.3.7 vs 2.4.0 (pendencias-consolidadas.md:934).
- [ ] 28.9 Testes do consumer (código + testes no PR do evolution-stack — E89).
- [ ] 28.10 Validar runbook PAUSE_INGEST contra a topologia atual (relkind) e corrigir referências antes do primeiro uso (pendencias-consolidadas.md:874).

### Critério de conclusão (checklist da etapa)
- [ ] 0 erro de INSERT no log do consumer (relação existe)
- [ ] Telemetria crescendo no banco após deploy (2 amostras SQL com 15min de intervalo)
- [ ] consumer-stats sem 404 no log
- [ ] Digest runtime = stack (imagem alinhada)

## Etapa 29 — Eliminar dependência reversa evo→zapp (fn_normalize_send_jid 13×)

**Objetivo:** Zerar chamadas de funções `evo` para funções `zapp` (`fn_normalize_send_jid` 13×, `is_admin_or_supervisor` 6×) formalizando o contrato no BOUNDARY.

**Base:** pendencias-consolidadas.md:936 (findings-16:9 — dependência reversa evo→zapp: `fn_normalize_send_jid` 13×, `is_admin_or_supervisor` 6×; formalizar contrato no BOUNDARY); pendencias-consolidadas.md:757 (E97 — boundary-audit como gate bloqueante nos dois repos).

### Subetapas
- [ ] 29.1 Inventariar referências via `supabase_db_query`: `pg_proc` em `evo` com `prosrc LIKE '%fn_normalize_send_jid%'` (13×) e `%is_admin_or_supervisor%` (6×).
- [ ] 29.2 Listar as funções em `zapp` (SECDEF? search_path? grants) — contrato atual das funções dependidas.
- [ ] 29.3 Decidir contrato: espelhar em schema neutro (ex.: `ops`/`_shared`) ou criar wrappers locais em `evo`; registrar dono no BOUNDARY.
- [ ] 29.4 Implementar a mudança sem alterar comportamento (mesmos search_path/security).
- [ ] 29.5 Validar search_path/RLS pós-mudança: chamadas passam a ser intra-schema.
- [ ] 29.6 Testes de contrato das funções compartilhadas (mesmos casos em ambos os schemas).
- [ ] 29.7 Ativar gate boundary-audit bloqueante nos dois repos (E97) (pendencias-consolidadas.md:757).
- [ ] 29.8 Rodar boundary-audit: 0 violações evo→zapp.
- [ ] 29.9 Atualizar BOUNDARY/ADR (dono das funções compartilhadas).
- [ ] 29.10 Verificar em produção: reconciliação (cron job 27) e envios seguem OK por 7 dias.

### Critério de conclusão (checklist da etapa)
- [ ] 0 referências evo→zapp (query `pg_proc` anexada)
- [ ] Gate boundary-audit verde nos dois repos
- [ ] 7 dias sem regressão na reconciliação/envios
- [ ] BOUNDARY atualizado com dono das funções

## Etapa 30 — Performance do banco vivo: índices, N+1, slow queries e bloat
**Objetivo:** Eliminar as lacunas de performance medidas (webhook_events_processed 369MB sem retenção eficiente, 13 índices candidatos parados, queries lentas sem gate).
**Base:** INDICES_CLEANUP_PROPOSTA (13 índices aguardando revisão sênior) · query_telemetry/slow queries · bloat de tabelas quentes · N+1 no front.
### Subetapas
- [ ] 30.1 Revisar a INDICES_CLEANUP_PROPOSTA com sênior: validar os 13 candidatos com EXPLAIN em produção (nunca dropar PK/UNIQUE/FK).
- [ ] 30.2 Criar migration versionada para os índices aprovados (CREATE INDEX IF NOT EXISTS, sem lock agressivo — usar CONCURRENTLY onde aplicável).
- [ ] 30.3 Auditar N+1 no frontend: mapear loops de .single()/.select() em map (grep `for.*await.*select`) e substituir por queries em lote (in/eq).
- [ ] 30.4 Habilitar/verificar o monitor de slow queries (fn_monitor_slow_queries + query_telemetry) e definir log_min_duration_statement.
- [ ] 30.5 Executar retenção no webhook_events_processed (369MB): política de arquivamento via fn_cleanup_webhook_events_v2 + particionamento/archive.
- [ ] 30.6 Verificar autovacuum das tabelas quentes (evolution_messages, webhook_*, app_notifications) com fn_force_autovacuum e ajustar thresholds.
- [ ] 30.7 Substituir materialized views defasadas por refresh incremental ou cache com TTL (dashboards KPIs).
- [ ] 30.8 Auditar RPCs >3s (supabase_client_performance): adicionar índices de suporte ou cache.
- [ ] 30.9 Criar cron de análise semanal de bloat/index usage (fn_optimization_recommendations) com alerta.
- [ ] 30.10 Medir antes/depois: latência p95 dos RPCs e tamanho do banco (evidência no PR).
### Critério de conclusão (checklist da etapa)
- [ ] Índices aprovados criados e EXPLAIN confirma uso (idx_scan > 0 em 7 dias)
- [ ] N+1 eliminados nos caminhos mapeados (0 ocorrências no grep)
- [ ] Retenção aplicada: webhook_events_processed estabilizado (< X% crescimento semanal)
- [ ] Latência p95 dos RPCs principais medida e melhorada
- [ ] Cron de análise semanal ativo no pg_cron


---

# FASE 4 — INBOX NÚCLEO (hooks/serviços)

## Etapa 31 — Testar e corrigir o orquestrador useRealtimeMessages (1019 ln)
**Objetivo:** Leitura integral + suíte vitest completa do maior orquestrador do inbox, eliminando dead code exposto e dependências test-only.
**Base:** findings-03.md:233 (06:376, 06:693-696); pendencias-consolidadas.md:609 (getRealtimeDiscardedCount 06:698-701, _clear/_reset 06:703-706).
### Subetapas
- [ ] 31.1 Ler `src/features/inbox/hooks/useRealtimeMessages.ts` (1019 ln) integralmente em chunks de 300 ln e documentar fluxo: hydratação, HYDRATE_DEBOUNCE_MS=50, dedupe, merge de status, reordenação — anotar 1-2 parágrafos em `docs/plano-fase-04.md` com o mapa real (função→linha→efeito).
- [ ] 31.2 Escrever RED: criar `src/features/inbox/hooks/__tests__/useRealtimeMessages.test.tsx` com 6 cenários: hydratação com HYDRATE_DEBOUNCE_MS, dedupe por id, merge de UPDATE via `useMessageUpdateBatcher`, reordenação por `created_at`, limpeza ao desmontar, estado de reconciliação (RECONCILED_MAX=1000) — todos falhando (nenhum teste existente cobre o orquestrador).
- [ ] 31.3 GREEN: extrair/exportar funções puras de transformação (dedupe/merge/sort) para `realtimeUtils.ts` já testado e fazer o orquestrador consumi-las — eliminar lógica duplicada inline; rodar `bun run test useRealtimeMessages` até verde.
- [ ] 31.4 RED: escrever teste de `sendStatusBus` integrado ao orquestrador (evento de status transiente deve atualizar a mensagem via canal `useMessageStatus`) — falha hoje porque o orquestrador não assina o bus diretamente (contrato a definir).
- [ ] 31.5 GREEN: expor a assinatura `subscribeSendStatus` do `sendStatusBus.ts` (176 ln) como injeção de dependência no orquestrador (prop opcional) e conectar `useMessageStatus` (canal por contactId); manter `__resetSendStatusForTest` atrás de `if (import.meta.env.MODE === 'test')`.
- [ ] 31.6 Remover `getRealtimeDiscardedCount()` deprecated (retorna sempre 0) e seus consumidores; substituir por contador vivo via `reconciliationTelemetry` (MAX_RECENT=100) se houver consumidor real — grep `getRealtimeDiscardedCount` deve retornar 0 hits após o PR.
- [ ] 31.7 Mover `playerStateStore._clear()`/`audioPlaybackBus._reset()` para `__tests__/` ou gate `import.meta.env.MODE === 'test'` — garantir que o bundle de produção não exporta métodos test-only (grep no dist).
- [ ] 31.8 RED: teste de regressão do `useMessageUpdateBatcher` (149 ln): batch de UPDATEs em janela curta deve emitir UM evento consolidado e drenar no unmount (sem perda).
- [ ] 31.9 GREEN: corrigir `useMessageUpdateBatcher` para drenar pendências no cleanup do useEffect (padrão flush-on-unmount) e atualizar consumo no orquestrador; rodar suíte completa do módulo realtime.
- [ ] 31.10 Rodar `bun run check` (typecheck+lint) e `bun run test` no subconjunto `hooks/realtime` + `hooks/__tests__`; atualizar `docs/estado/06-*.md` status de `useRealtimeMessages`/`useMessageUpdateBatcher`/`sendStatusBus` para cobertura documentada.
### Critério de conclusão (checklist da etapa)
- [ ] `useRealtimeMessages.test.tsx` ≥ 6 casos verdes no CI (vitest), nenhum `it.skip`
- [ ] `grep -rn "getRealtimeDiscardedCount" src/` = 0 hits
- [ ] Nenhum `_clear`/`_reset`/`__resetSendStatusForTest` no bundle de produção (grep no dist ou gate de build)
- [ ] `bun run check` verde no PR da etapa
- [ ] PR único com código + testes + atualização do doc de estado (06-*)

## Etapa 32 — Testar e corrigir o orquestrador useRealtimeInbox (513 ln)
**Objetivo:** Leitura integral + suíte do orquestrador primário, incluindo presença/conexões e o tópico aleatório que acumula canais.
**Base:** findings-03.md:233 (06:376, 06:693-696); pendencias-consolidadas.md:24 (tópico aleatório acumula canais); findings-03.md:47 (FALLBACK_POLL=120s, agent_presence + whatsapp_connections).
### Subetapas
- [ ] 32.1 Ler `src/features/inbox/hooks/useRealtimeInbox.ts` (513 ln) integralmente; documentar orquestração: AVATAR_SEED_TTL_MS=30min, RECONCILED_MAX=1000, canais internos e ordem de inicialização (linha→efeito) em `docs/plano-fase-04.md`.
- [ ] 32.2 RED: criar `src/features/inbox/hooks/__tests__/useRealtimeInbox.test.tsx` com 6 cenários: boot da cadeia de canais, reconcile com RECONCILED_MAX=1000, fallback de refetch (5min, pausa em hidden), dedupe de eventos duplicados, erro de canal → status `realtimeContactsStatusStore`, limpeza de canais no unmount (sem vazamento).
- [ ] 32.3 GREEN: corrigir falhas de limpeza de canais no unmount encontradas pelo teste (unsubscribe explícito por canal); validar com `bun run test useRealtimeInbox` verde.
- [ ] 32.4 RED: teste de vazamento de canais com `Math.random()` no nome do tópico (padrão A8 findings-08:675): montar/desmontar 3× em StrictMode e assertar que `supabase.channel()` foi chamado com tópicos estáveis/determinísticos e removidos no cleanup.
- [ ] 32.5 GREEN: substituir tópico aleatório por tópico determinístico derivado do estado (ex.: `inbox-realtime:{userId}:{vista}`) com reuso seguro; o teste de vazamento deve passar.
- [ ] 32.6 RED: `useRealtimePresenceAndConnections` (142 ln): teste de FALLBACK_POLL=120s — presença `agent_presence` + `whatsapp_connections` devem atualizar estado via `useSyncExternalStore` e parar poll ao desmontar.
- [ ] 32.7 GREEN: corrigir ciclo de poll (clearInterval no cleanup, sem dupla subscrição em StrictMode) e integração com o orquestrador; rodar teste verde.
- [ ] 32.8 RED: teste de `useRealtimeFallbackRefetch`: refetch de 5min NÃO dispara quando `document.hidden` e throttle de 5s entre disparos.
- [ ] 32.9 GREEN: implementar/ajustar pausa em hidden e throttle conforme contrato do teste; `useInboxHeartbeat` (138 ln) deve permanecer independente (THROTTLE_MS=240s, tratado na Etapa 37).
- [ ] 32.10 Rodar `bun run check` + suíte realtime completa; registrar no doc de estado 06-* a cobertura nova de `useRealtimeInbox`, `useRealtimePresenceAndConnections`, `useRealtimeFallbackRefetch`.
### Critério de conclusão (checklist da etapa)
- [ ] `useRealtimeInbox.test.tsx` ≥ 6 casos verdes; teste de vazamento de canais presente e verde
- [ ] Nenhum `Math.random()` em nome de tópico de canal realtime no módulo inbox (grep)
- [ ] `useRealtimePresenceAndConnections.test.ts` verde com assert de cleanup do poll
- [ ] `bun run check` verde; PR único (código + testes + doc 06-*)

## Etapa 33 — Fila de retry useMessageQueue: concorrência e DLQ sob teste
**Objetivo:** Provar e corrigir a fila de retry (maxRetries=3, MAX_CONCURRENT=5) com testes de concorrência e persistência de falhas.
**Base:** pendencias-consolidadas.md:604 (06:621 fila retry maxRetries=3, MAX_CONCURRENT=5); findings-03.md:22 (06:621).
### Subetapas
- [ ] 33.1 Mapear `src/features/inbox/hooks/useMessageQueue.ts` (674 ln): fila em memória × persistência (max_retries, DLQ), `MAX_CONCURRENT_SENDS=5` (l.79), `config.maxRetries=3` (l.19), baseDelay=1s, maxDelay=30s, retryable (l.410); documentar contrato em `docs/plano-fase-04.md`.
- [ ] 33.2 RED: criar `src/features/inbox/hooks/__tests__/useMessageQueue.test.tsx` (substituir/ampliar `useMessageQueueE2E.spec.tsx`): enfileira 10 mensagens → no máximo 5 em voo simultâneo (spy no sender resolve com delay controlado).
- [ ] 33.3 RED: teste de retry: falha retryable → 3 tentativas com backoff (fake timers, baseDelay=1s) e depois status terminal na DLQ; falha não-retryable → 1 tentativa.
- [ ] 33.4 GREEN: corrigir a fila conforme os testes (estado `retrying`/`failed` no `sendStatusBus`, contagem de tentativas persistida); rodar suíte verde.
- [ ] 33.5 RED: teste de dedupe de enfileiramento — mesma mensagem enfileirada 2× antes de processar gera UM envio (idempotência por `idempotency_key`).
- [ ] 33.6 GREEN: implementar guard de dedupe na fila; verde.
- [ ] 33.7 RED: `useSendThrottle` (83 ln): teste de throttle com fake timers — minIntervalMs=500, burstLimit=5, burstWindowMs=3000: 6º envio dentro da janela é atrasado; envios espaçados passam imediatos.
- [ ] 33.8 GREEN: corrigir `useSendThrottle` para o contrato do teste (janela deslizante correta); verde.
- [ ] 33.9 RED: `useRetryFailedMessage`: teste de RATE_LIMIT_MS=30s (2º clique em <30s é ignorado ou enfileirado) e optimistic update via `rpc_dlq_retry_now`.
- [ ] 33.10 GREEN: ajustar rate-limit e optimistic update; rodar `bun run check` + suíte de envio completa (queue+throttle+retry); atualizar doc 06-* (06:621, 06:634, 06:637).
### Critério de conclusão (checklist da etapa)
- [ ] Teste de concorrência prova MAX_CONCURRENT=5 (nunca >5 em voo) e está verde
- [ ] Teste de retry prova 3 tentativas + DLQ com fake timers e está verde
- [ ] `useSendThrottle.test.ts` (existente) ampliado com burst window e verde
- [ ] `grep -rn "MAX_CONCURRENT_SENDS" src/` aponta para constante única (5) referenciada pelo teste
- [ ] `bun run check` verde; PR único

## Etapa 34 — messageSender.ts (503 ln): in-flight dedup e caminho legado zapp
**Objetivo:** Testar o caminho crítico `sendMessageToContact` e corrigir dedup in-flight, cache de perfil e erros de auth.
**Base:** pendencias-consolidadas.md:604 (06:649 messageSender 503 ln, PROFILE_CACHE_TTL=5min, in-flight dedup); findings-03.md:28.
### Subetapas
- [ ] 34.1 Ler `src/features/inbox/hooks/realtime/messageSender.ts` (503 ln) integralmente; documentar: fluxo de envio, PROFILE_CACHE_TTL=5min, in-flight dedup, classifyAuthError, resolveConnection (`messageSenderHelpers.ts`), rollback/limpeza de fila (linha→efeito) em `docs/plano-fase-04.md`.
- [ ] 34.2 RED: criar `src/features/inbox/hooks/realtime/__tests__/messageSender.test.ts`: envio feliz → retorna remoteJid/messageId e publica status `sent` no `sendStatusBus`.
- [ ] 34.3 RED: teste de in-flight dedup — 2 chamadas simultâneas para a mesma mensagem (mesmo idempotency) executam UM fetch à Evolution (spy) e ambas resolvem com o mesmo resultado.
- [ ] 34.4 GREEN: corrigir o dedup in-flight (promessa compartilhada por chave, sem dupla inserção no DB); suíte verde.
- [ ] 34.5 RED: teste de PROFILE_CACHE_TTL=5min — perfil resolvido não re-busca em <5min; após TTL, nova busca (fake timers).
- [ ] 34.6 GREEN: ajustar cache de perfil para TTL exato; verde.
- [ ] 34.7 RED: teste de `classifyAuthError` (9 padrões, `parseEvolutionError`): erro 401/403 → `auth_error` com mensagem humanizada; erro de rede → `network_error` retryable.
- [ ] 34.8 GREEN: alinhar `messageSender` ao `parseEvolutionError` já testado (06:651) eliminando duplicação de parsing; verde.
- [ ] 34.9 RED: teste de falha de envio → mensagem devolvida à fila (via `useMessageQueue`) com status `failed`/`abandoned` correto e sem duplicata no banco.
- [ ] 34.10 GREEN: corrigir caminho de falha (rollback/requeue idempotente); rodar `bun run check` + suíte; atualizar doc 06-* (06:649).
### Critério de conclusão (checklist da etapa)
- [ ] `messageSender.test.ts` ≥ 6 casos verdes (feliz, dedup, TTL, auth, rede, falha)
- [ ] Teste de dedup prova 1 único fetch para 2 chamadas simultâneas
- [ ] Nenhum novo `fetch` sem `AbortController`/timeout introduzido (review do PR)
- [ ] `bun run check` verde; PR único com testes no mesmo commit

## Etapa 35 — Caminho evo: externalMessageSender + externalAudioSender
**Objetivo:** Testar os senders externos (texto e PTT/voz) e o contrato de `makeOptimisticBubble`/`DEFAULT_INSTANCE`.
**Base:** findings-03.md:29-30 (06:647 sendExternalText, 06:646 sendExternalAudio PTT/voz, blobToBase64, makeOptimisticBubble); findings-03.md:31 (DEFAULT_INSTANCE, SendError, OptimisticMessage).
### Subetapas
- [ ] 35.1 Ler `src/features/inbox/hooks/realtime/externalMessageSender.ts` (303 ln) e `externalAudioSender.ts` (184 ln); documentar fluxo texto/PTT, uso de `DEFAULT_INSTANCE`, `blobToBase64`, `makeOptimisticBubble` e re-export cruzado (linha→efeito).
- [ ] 35.2 RED: criar `src/features/inbox/hooks/realtime/__tests__/externalMessageSender.test.ts`: `sendExternalText` feliz → chama Edge Fn `evolution-api` com payload correto (instance, number, text) e publica status no bus.
- [ ] 35.3 RED: teste de erro — `SendError` com tipo estável (auth/rate-limit/network) propagado ao chamador sem throw silencioso; mensagem otimista `makeOptimisticBubble` criada antes do envio e reconciliada depois.
- [ ] 35.4 GREEN: corrigir divergências do contrato (status `pending`→`sent` via bus, sem duplicata quando o evento realtime chega); suíte verde.
- [ ] 35.5 RED: `externalAudioSender`: teste de PTT — `blobToBase64` de AudioBlob produz base64 correto; envio de áudio usa `audio`/`ptt` no payload da Evolution; fallback quando `instance` ausente usa `DEFAULT_INSTANCE`.
- [ ] 35.6 GREEN: ajustar sender de áudio para o contrato do teste (incl. tamanho máximo de base64 validado); verde.
- [ ] 35.7 RED: teste de `externalSenderTypes.ts` — `makeOptimisticBubble` deve ser pura (mesmo input → mesmo output) e `OptimisticMessage` compatível com o tipo renderizado pelo `MessageBubble`.
- [ ] 35.8 GREEN: refatorar `makeOptimisticBubble` para função pura testável (sem acesso ao store) e consumir nos dois senders; verde.
- [ ] 35.9 RED: teste de integração texto+áudio: enviar 2 mensagens em sequência → 2 eventos no bus, ordem preservada, sem race no `sendStatusBus` (HISTORY_LIMIT_PER_MSG=50).
- [ ] 35.10 GREEN: corrigir races de ordem no bus se o teste falhar; rodar `bun run check` + suíte realtime; atualizar doc 06-* (06:646-648).
### Critério de conclusão (checklist da etapa)
- [ ] `externalMessageSender.test.ts` + `externalAudioSender.test.ts` verdes (≥ 4 casos cada)
- [ ] `makeOptimisticBubble` pura e importada pelos 2 senders (grep)
- [ ] Teste de ordem/race no bus verde
- [ ] `bun run check` verde; PR único

## Etapa 36 — Dual-path zapp×evo: contrato do useInboxSource e migração
**Objetivo:** Formalizar a fonte unificada `useInboxSource` e documentar/implementar fallback entre `zapp.messages` legado e `evo.evolution_messages`.
**Base:** pendencias-consolidadas.md:602-603 (06:688-691 dual-path, usoMessages PARCIAL 06:627); findings-03.md:51 (useInboxSource wraps useRealtimeMessages + useMessages), findings-03.md:60 (useMessages LEGADO zapp.messages sem cursor).
### Subetapas
- [ ] 36.1 Ler `src/features/inbox/hooks/useInboxSource.ts` (69 ln) e `useMessages.ts` (163 ln); documentar: interface unificada, quando cada fonte é usada, gaps de cursor (legado sem cursor) e critérios atuais de seleção de fonte (linha→efeito).
- [ ] 36.2 Escrever ADR curto (docs/adr/dual-path-inbox.md): fonte primária = evo cursor-based (`useMessagesCursor`, rpc_list_messages_lite, PAGE_SIZE=50); fallback = zapp legado somente se `evolution_messages` indisponível; gatilhos de troca e telemetria de evento `source_switch` — sem migração de dados nesta fase.
- [ ] 36.3 RED: criar `src/features/inbox/hooks/__tests__/useInboxSource.test.tsx`: quando fonte evo responde → dados cursor-based; quando falha → fallback legado com aviso em `reconciliationTelemetry` (counter `source_fallback`).
- [ ] 36.4 GREEN: implementar seleção de fonte com fallback explícito conforme ADR; teste verde.
- [ ] 36.5 RED: teste de `useMessages` (legado): paginação 1000/pág via `fetchMessagesByContact` e sem duplicação ao intercalar com realtime (mesmo contrato do `messageService.ts` 07:465).
- [ ] 36.6 GREEN: corrigir `useMessages` para dedupe idempotente com realtime (reutilizar `realtimeUtils.dedupeMessages` já testado); verde.
- [ ] 36.7 RED: teste de `useConversationMessagesData` (MESSAGES_CAP=1000, staleTime=30s): cap respeitado em conversa longa e staleTime não re-busca em <30s.
- [ ] 36.8 GREEN: ajustar cap/estaleza conforme teste; verde.
- [ ] 36.9 RED: teste de contrato de tipos — `useInboxSource` retorna interface única compatível com os consumidores atuais (grep dos 5+ consumidores e type-check estrito).
- [ ] 36.10 GREEN: resolver incompatibilidades de tipo encontradas; rodar `bun run check` + suíte; atualizar doc 06-* (06:614, 06:627, 06:688-691) com o ADR.
### Critério de conclusão (checklist da etapa)
- [ ] ADR `dual-path-inbox.md` criado com fonte primária/fallback/gatilhos
- [ ] `useInboxSource.test.tsx` verde provando fallback + counter `source_fallback`
- [ ] `bun run check` verde com consumo tipado (sem `as unknown` novos)
- [ ] Doc 06-* marcado com decisão de dual-path (não mais "sem mecanismo documentado")

## Etapa 37 — Mark-as-read (MARK_READ_FLUSH_MS=250) e heartbeat
**Objetivo:** Eliminar perda permanente de leitura no flush de 250ms e estabilizar o contrato de `touchLastSeen`/`useInboxHeartbeat`.
**Base:** pendencias-consolidadas.md:607 (06:723-726 MARK_READ_FLUSH_MS=250 deixa não-lidas); pendencias-consolidadas.md:608 (07:518-521 .eq('user_id') frágil); findings-03.md:85 (THROTTLE_MS=240s > HEARTBEAT 180s, A11 07:568).
### Subetapas
- [ ] 37.1 Ler `src/features/inbox/hooks/realtime/useConversationActions.ts` (153 ln) e mapear fluxo markAsRead: batch 250ms, quais mensagens entram no lote, condição de envio (linha→efeito).
- [ ] 37.2 RED: criar `src/features/inbox/hooks/realtime/__tests__/useConversationActions.markAsRead.test.tsx` com fake timers: 2 mensagens marcadas em <250ms → 1 UPDATE em lote (`.in()` com 2 ids).
- [ ] 37.3 RED: teste do bug crítico — marcar como lida e DESMONTAR o componente antes dos 250ms → UPDATE DEVE ainda ocorrer (flush no cleanup), nunca "permanentemente não lida".
- [ ] 37.4 GREEN: implementar flush-on-unmount no `useConversationActions` (drenar lote pendente no cleanup, com `ref` de lote); teste verde.
- [ ] 37.5 RED: teste de desduplicação — mesma mensagem marcada 2× no lote gera 1 UPDATE; mensagem já lida não entra no lote.
- [ ] 37.6 GREEN: dedupe por id no lote; verde.
- [ ] 37.7 RED: `touchLastSeen` (07:466): teste do contrato — UPDATE em `profiles` com `.eq('user_id', ...)`; escrever teste que falhe se o filtro mudar para `.eq('id', ...)` (travar contrato atual explicitamente, refatorar para constante `PROFILE_PK = 'user_id'` com comentário).
- [ ] 37.8 GREEN: centralizar filtro em constante nomeada + guard de runtime (log se `user_id` não existir no schema); verde.
- [ ] 37.9 RED: `useInboxHeartbeat` (138 ln): teste do A11 — THROTTLE_MS=240s vs HEARTBEAT 180s: com fake timers, 2 picos de atividade em 200s geram 1 UPDATE (throttle respeitado) e o primeiro disparo ocorre no tempo correto.
- [ ] 37.10 GREEN: ajustar throttle do heartbeat (debounce de 240s) e cleanup de timer no unmount; rodar `bun run check` + suíte; atualizar doc 06-* (06:660, 06:612) e 07-* (07:466).
### Critério de conclusão (checklist da etapa)
- [ ] Teste flush-on-unmount verde (componente desmontado <250ms ainda persiste leitura)
- [ ] Lote markAsRead deduplicado por id (teste verde)
- [ ] `touchLastSeen` com filtro centralizado em constante (grep `PROFILE_PK`)
- [ ] `useInboxHeartbeat` com teste de throttle 240s verde
- [ ] `bun run check` verde; PR único

## Etapa 38 — Alertas de retry: SOFT_CAP=500 sem toasts duplicados
**Objetivo:** Eliminar toasts duplicados por messageId em sessões longas e cobrir a cadeia de alertas de falha/automação.
**Base:** pendencias-consolidadas.md:606 (06:718-721 SOFT_CAP=500 toasts duplicados); findings-03.md:58 (canal failed_messages, status='abandoned', toast sonner); findings-03.md:57 (canal automation_executions).
### Subetapas
- [ ] 38.1 Ler `src/features/inbox/hooks/realtime/useRetryResolutionAlerts.ts` (199 ln): fluxo do bus + realtime, `SOFT_CAP=500` (l.35), eviction de 20% (l.49-51), quando um toast é emitido (linha→efeito).
- [ ] 38.2 RED: criar `src/features/inbox/hooks/realtime/__tests__/useRetryResolutionAlerts.test.tsx`: o MESMO messageId resolvido 2× em sessão longa → 1 toast (dedupe por messageId com janela).
- [ ] 38.3 RED: teste do SOFT_CAP — 600 resoluções distintas → o Set evicta 20% e NENHUM toast duplicado é emitido para ids já notificados (histórico de toasts separado do cap).
- [ ] 38.4 GREEN: separar "ids notificados" (dedupe) do "ids em voo" (cap); eviction só sobre o cap; teste verde.
- [ ] 38.5 RED: teste de status terminal — resolução `success` e `failed` terminais emitem toast correto (sonner) e removem o id do set em voo.
- [ ] 38.6 GREEN: corrigir transição de estado (remover do set em voo em status terminal, não em timeout); verde.
- [ ] 38.7 RED: `useFailedMessageAlerts`: teste de canal `failed_messages` com status='abandoned' → 1 toast por mensagem; eventos repetidos do mesmo id não acumulam toasts.
- [ ] 38.8 GREEN: dedupe por messageId no alerta de falha; verde.
- [ ] 38.9 RED: `useAutomationFailureAlerts`: teste de canal `automation_executions` — toast por execução falha com rate-limit de notificação (evitar spam em rajada).
- [ ] 38.10 GREEN: aplicar rate-limit/cooldown; rodar `bun run check` + suíte de alertas; atualizar doc 06-* (06:663, 06:658, 06:670).
### Critério de conclusão (checklist da etapa)
- [ ] Teste de dedupe por messageId verde (2 resoluções → 1 toast)
- [ ] Teste SOFT_CAP=500 verde (eviction 20% sem duplicar toasts)
- [ ] `useFailedMessageAlerts`/`useAutomationFailureAlerts` com testes verdes
- [ ] `bun run check` verde; PR único

## Etapa 39 — Mídia: AbortSignal no useMediaUrl e signed URL 7d
**Objetivo:** Eliminar invokes sem AbortSignal (anti-storm por mountedRef) e quebra de agendamentos longos pela expiração de signed URL em 7 dias.
**Base:** pendencias-consolidadas.md:605 (07:573-576 invoke SEM AbortSignal); findings-03.md:101-102 (06:618 auto-refresh, max 2 tentativas); findings-03.md:201 (Edge Fn get-media-base64 SEM AbortSignal); findings-04.md:154 (signed URL 7d useChatScheduleMessage.ts:43 quebra agendamentos >7d).
### Subetapas
- [ ] 39.1 Ler `src/features/inbox/hooks/useMediaUrl.ts` (603 ln): fluxo de signed URL, TTL 604800s, refresh de URL expirada (max 2 tentativas), toast anti-flood, guard mountedRef no invoke (l.340-363, 467) (linha→efeito).
- [ ] 39.2 RED: criar teste (ampliar `useMediaUrl.test.ts`): invoke da Edge Fn recebe `AbortSignal` (spy no 2º argumento) e o abort cancela o fetch pendente no unmount.
- [ ] 39.3 GREEN: passar `signal` (AbortController por request) ao `supabase.functions.invoke` e abortar no cleanup; manter o guard mountedRef como defesa secundária; teste verde.
- [ ] 39.4 RED: teste de anti-storm — N invokes em janela curta (mesma mensagem) → 1 invoke efetivo (rate-limit por mensagem + toast único, sem flood).
- [ ] 39.5 GREEN: consolidar rate-limit por `messageId` (janela fixa) no lugar do guard frágil; verde.
- [ ] 39.6 RED: teste de refresh — URL expirada (simular `expires_at` passado) → re-invoke até 2 tentativas; 3ª falha → `failed=true` sem toast repetido.
- [ ] 39.7 GREEN: ajustar contagem de tentativas para resetar só após sucesso (não por montagem); verde.
- [ ] 39.8 RED: `useChatScheduleMessage` (findings-04.md:74, useChatScheduleMessage.ts:43): teste que prova que agendamento com `scheduled_for` > 7d cria URL inválida — RED documentando o bug (assert de validação de prazo).
- [ ] 39.9 GREEN: validar prazo máximo no agendamento (rejeitar > 7d com erro claro OU gerar signed URL curta + re-upload na execução, decisão no PR); bloqueio de envio inválido; teste verde.
- [ ] 39.10 Verificar Edge Fn `evolution-api/get-media-base64` (07:319): garantir que o chamador (useMediaUrl) passa signal; rodar `bun run check` + suíte de mídia; atualizar doc 06-* (06:617-618) e 07-* (07:319).
### Critério de conclusão (checklist da etapa)
- [ ] Teste prova `AbortSignal` presente no invoke (spy) e abort no unmount
- [ ] Teste de anti-storm verde (1 invoke por janela/mensagem)
- [ ] Teste de refresh max 2 tentativas verde
- [ ] Agendamento >7d bloqueado/tratado com teste verde (findings-04 A5)
- [ ] `bun run check` verde; PR único

## Etapa 40 — Hooks de UX/presença: autoscroll, deep links, atalhos e typing
**Objetivo:** Cobrir e corrigir os hooks periféricos do inbox (autoscroll, deep links, atalhos, broadcast de digitação) que operam sem testes.
**Base:** findings-03.md:180 (useChatAutoScroll threshold=150px), 182 (useInboxShortcuts react-hotkeys-hook), 183 (useInboxDeepLinks ?contact=/?message=, window.__pendingOpenContactId); pendencias-consolidadas.md:17 (useContactTyping broadcast typing:{remoteJid}).
### Subetapas
- [ ] 40.1 Ler `useChatAutoScroll.ts` (68 ln), `useInboxDeepLinks.ts` (59 ln), `useInboxShortcuts.ts` (65 ln) e `src/features/contacts/hooks/useContactTyping.ts` (197 ln); documentar contratos e consumidores (grep de imports) em `docs/plano-fase-04.md`.
- [ ] 40.2 RED: `useChatAutoScroll` — teste com jsdom: usuário no topo (scrollTop < threshold 150px) → NOVO scroll automático NÃO ocorre; usuário no fundo → scroll segue novas mensagens.
- [ ] 40.3 GREEN: corrigir lógica de "near bottom" (distância relativa ao fim, não scrollTop absoluto) e guard de tamanho de mensagem; teste verde.
- [ ] 40.4 RED: `useInboxDeepLinks` — teste de `?contact=<uuid>`: ao montar, `window.__pendingOpenContactId` é consumido e limpo; `?message=<uuid>` rola até a mensagem após hydratação.
- [ ] 40.5 GREEN: corrigir consumo/limpeza do pending contact (evitar re-abertura em StrictMode); teste verde.
- [ ] 40.6 RED: `useInboxShortcuts` — teste de atalhos registrados via `react-hotkeys-hook`: tecla "C" abre nova conversa (handler chamado), atalho não dispara com foco em input/textarea (guard de composição).
- [ ] 40.7 GREEN: aplicar guards de foco e remover atalhos no unmount (useEffect cleanup); teste verde.
- [ ] 40.8 RED: `useContactTyping` — teste de broadcast: evento de digitação publica `typing:{remoteJid}` no canal correto e expira (timeout) sem publicar estado "parado" eterno; dedupe de broadcasts repetidos.
- [ ] 40.9 GREEN: corrigir broadcast (timeout de expiração, dedupe por contato, cleanup no unmount); teste verde.
- [ ] 40.10 Rodar `bun run check` + suíte completa do módulo inbox; atualizar doc 06-* (06:593, 06:610, 06:613) e findings-01 status de `useContactTyping`; garantir barrel `chat/index.ts` re-exporta hooks cobertos.
### Critério de conclusão (checklist da etapa)
- [ ] 4 suítes novas verdes: autoscroll, deep links, atalhos, typing (≥ 3 casos cada)
- [ ] Teste de cleanup no unmount para atalhos e typing (sem vazamento de listeners)
- [ ] `window.__pendingOpenContactId` consumido e limpo (assert no teste)
- [ ] `bun run check` verde; PR único


## Resumo (Fase 4 — INBOX NÚCLEO, etapas 31-40)
- 10 etapas × 10 subetapas = 100 subetapas, todas ancoradas em findings reais (findings-03/04 + pendencias-consolidadas), nenhuma pendência inventada.
- Cobre: orquestradores realtime (31-32), fila/throttle/retry (33), caminhos de envio zapp×evo (34-36), mark-as-read/heartbeat (37), alertas SOFT_CAP (38), mídia/AbortSignal/signed URL (39), hooks de UX/presença (40).
- Regra: cada fix de hook tem teste vitest no MESMO PR; ciclo TDD RED-GREEN explícito em cada etapa.
- Critérios verificáveis por `bun run test`/`bun run check`/grep (ex.: 0 hits de `getRealtimeDiscardedCount`, tópicos de canal sem `Math.random()`, `AbortSignal` presente no invoke).
- Próxima fase sugerida: componentes de chat (FASE 5 — ChatInputArea/ChatMessagesArea/MessageHoverToolbar, findings-04).


---

# FASE 5 — INBOX UI (componentes)

## Etapa 41 — MessageHoverToolbar: ativar favoritar/fixar/responder-depois/reportar

**Objetivo:** Eliminar os 4 stubs da toolbar hover (Favoritar ★, Fixar 📌, Responder depois e Reportar) conectando-os a mecanismos reais de persistência ou desativando-os com aviso.

**Base:** findings-04.md:38 — `MessageHoverToolbar.tsx:188-233` Favoritar ★, Fixar 📌, Responder depois `disabled` sem handler; Reportar sem onClick (A2).

### Subetapas
- [ ] 41.1 Auditar no código-fonte quais stores/hooks reais de favorito de contato e pin de conversa existem (ex.: coluna `favorite`/`pinned` em conversas, `VirtualizedRealtimeList` pin-sort) antes de escrever qualquer handler — sem mecanismo real, registrar débito.
- [ ] 41.2 Implementar handler de Favoritar com persistência (UPDATE/RPC) + estado otimista e rollback em falha.
- [ ] 41.3 Conectar Fixar ao mecanismo de pin existente no ordenador da lista (`pin-sort`), com `aria-pressed` refletindo o estado.
- [ ] 41.4 Ligar "Responder depois" ao snooze já existente em `useChatPanelHandlers` (whisper/snooze), removendo o `disabled` sem motivo.
- [ ] 41.5 Reportar: verificar tabela de denúncia (ex.: `message_reports`/`audit_logs`); persistir motivo + messageId; se não houver destino, ocultar o botão com tooltip "em breve" em vez de botão morto.
- [ ] 41.6 Adicionar `aria-label` e `title` a todos os botões da toolbar (toolbar navegável por teclado, WCAG 2.1.1).
- [ ] 41.7 Exibir estados de loading/erro com toast acessível (`aria-live`) em cada ação, sem `catch {}` silencioso.
- [ ] 41.8 Escrever testes unitários por ação (render, clique, persistência mockada, rollback em falha).
- [ ] 41.9 Validar contraste e foco visível com tokens do design system (nunca cor literal) nos estados hover/ativo.
- [ ] 41.10 Validação manual: nenhum botão da toolbar permanece `disabled` ou sem `onClick` em produção.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhum dos 4 itens (188-233) permanece stub: todos executam ação real ou foram ocultados com aviso.
- [ ] `grep` por `disabled` sem handler na MessageHoverToolbar retorna zero casos sem justificativa.
- [ ] Suíte nova de testes da toolbar passa no CI (vitest) com cobertura das 4 ações.
- [ ] Inspeção manual via teclado (Tab+Enter) executa cada ação; toast de erro aparece em falha de persistência.

## Etapa 42 — Tags funcionais: ContactTagsContent + ChatHeaderMenu

**Objetivo:** Transformar a gestão de tags de decorativa em funcional (remover X, adicionar tag) e ligar "Adicionar tag"/"Marcar como resolvido" do menu do header a fluxos reais.

**Base:** findings-04.md:93 — `ContactTagsContent.tsx:31,48,60` ícone X e botão "Adicionar" sem onClick — UI decorativa (A2); findings-04.md:52 — `ChatHeaderMenu.tsx:58,85` "Adicionar tag" e "Marcar como resolvido" `disabled` sem handler (A1).

### Subetapas
- [ ] 42.1 Identificar o hook/tabela real de tags (ex.: `useTags` + tabela de tags de conversa/contato) e mapear mutations disponíveis.
- [ ] 42.2 ContactTagsContent: implementar `onClick` do X (remover tag) com mutation + invalidação de cache da conversa.
- [ ] 42.3 Implementar botão "Adicionar" abrindo seletor de tags (popover/dialog) com as tags existentes e criação inline.
- [ ] 42.4 ChatHeaderMenu: ligar "Adicionar tag" ao mesmo seletor compartilhado (callback único, sem duplicar UI).
- [ ] 42.5 ChatHeaderMenu: ligar "Marcar como resolvido" ao mecanismo real de resolução de ticket (mesmo fluxo da tab "Resolvidos"), com confirmação e toast.
- [ ] 42.6 Estado vazio (contato sem tags) usando o componente de empty state único (ver Etapa 50), nunca `return null` mudo.
- [ ] 42.7 Acessibilidade: `aria-label` nos Xs, foco retorna ao botão após remoção, `aria-pressed`/`aria-expanded` no seletor (WCAG AA).
- [ ] 42.8 Erros de RLS/escrita exibidos ao usuário (toast), eliminando falha silenciosa de tag.
- [ ] 42.9 Criar/estender testes unitários (render, remover tag, adicionar tag, resolver conversa).
- [ ] 42.10 Validação manual ponta-a-ponta: adicionar, remover e resolver via header e painel lateral.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhum `onClick` ausente nas linhas 31/48/60 do ContactTagsContent; X e Adicionar persistem no banco.
- [ ] "Adicionar tag" e "Marcar como resolvido" executam fluxos reais (verificado manualmente e em teste).
- [ ] Testes novos passam no CI; nenhum `disabled` sem handler resta no ChatHeaderMenu.
- [ ] Verificação manual: erro de permissão aparece em toast, não silenciosamente.

## Etapa 43 — Stubs de vídeo: ChatHeader videochamada + ContactActionButtons

**Objetivo:** Remover os 2 stubs de chamada de vídeo (header e botão do contato), ativando via `useCalls`/SIP quando suportado ou ocultando com aviso quando não.

**Base:** findings-04.md:51 — `ChatHeader.tsx:246` videochamada hardcoded `undefined`, botão nunca ativa (A8); findings-04.md:90 — `ContactActionButtons.tsx:91` botão Vídeo é stub (`toast.info('Chamada de vídeo em breve')`); `:104` email via `window.location.hash` não-Router (A17).

### Subetapas
- [ ] 43.1 Verificar capacidade real do `useCalls`/SIP existente (findings-03) para vídeo; registrar veredito: vídeo suportado ou não.
- [ ] 43.2 ChatHeader: substituir `undefined` hardcoded (l.246) por condição real (capacidade + conversa ativa) e renderizar o botão só quando aplicável.
- [ ] 43.3 ContactActionButtons: substituir o toast "em breve" (l.91) por chamada real via `useCalls` ou ocultar o botão sob feature flag.
- [ ] 43.4 Corrigir email via `window.location.hash` (l.104) para navegação React Router (`useNavigate`), sem mudar comportamento visual.
- [ ] 43.5 Centralizar a decisão de exposição dos botões de vídeo em um único ponto (flag/config), evitando stubs espalhados.
- [ ] 43.6 `aria-label` nos botões de chamada e foco visível com tokens (nunca cor literal).
- [ ] 43.7 Testes unitários: botão oculto quando sem capacidade; chamada dispara handler real; email navega via Router.
- [ ] 43.8 Atualizar docs de estado (08-1) marcando videochamada como ATIVA ou OCULTA, com justificativa.
- [ ] 43.9 Validação manual: abrir conversa e confirmar que nenhum botão de vídeo morto aparece.
- [ ] 43.10 Se vídeo não suportado: registrar débito explícito (issue) em vez de deixar stub silencioso.

### Critério de conclusão (checklist da etapa)
- [ ] `ChatHeader.tsx:246` sem `undefined` hardcoded; botão condicionado a capacidade real.
- [ ] `ContactActionButtons.tsx:91` sem toast "em breve" — chamada real ou botão oculto por flag.
- [ ] Email (l.104) navega via React Router (teste confirma).
- [ ] Nenhum stub de vídeo visível em produção (verificação manual + grep).

## Etapa 44 — StickerManager: upload de compartilhadas + filtro Recentes

**Objetivo:** Corrigir o filtro "Recentes" (que não filtra nada) e destravar o upload de stickers compartilhados no picker.

**Base:** findings-04.md:79 — `StickerManager.tsx:84-91` filtro "Recentes" (`showRecent`) não filtra nada (A7); `StickerManager.tsx:34,180-192` `pendingUpload` nunca setado para compartilhadas — upload inacessível no picker (A8).

### Subetapas
- [ ] 44.1 Auditar a fonte real de recência de stickers (localStorage de uso ou tabela/bucket); se não existir, definir critério documentado (ex.: data de criação decrescente).
- [ ] 44.2 Implementar o filtro `showRecent` (l.84-91) usando a fonte de recência definida, com ordenação estável.
- [ ] 44.3 Setar `pendingUpload` ao selecionar arquivo em stickers compartilhadas (l.34, 180-192), destravando o preview de upload.
- [ ] 44.4 Completar o fluxo de upload para o bucket `stickers` (existente em settings/media-library, findings-06 14@L206-210) com estado de progresso real.
- [ ] 44.5 Exibir erro visível (toast acessível) em falha de upload/tamanho/tipo — sem `catch {}` silencioso.
- [ ] 44.6 Validar tipo/tamanho antes do upload (reusar validação de arquivos do projeto, sem duplicar lógica).
- [ ] 44.7 Acessibilidade: input file com `aria-label`, foco gerenciado após upload, grid navegável por teclado.
- [ ] 44.8 Estender `StickerTypes.test.ts`/novos testes: filtro Recentes, fluxo de upload compartilhado, erro de validação.
- [ ] 44.9 Validação manual: upload de sticker compartilhado aparece no picker e fica acessível.
- [ ] 44.10 Atualizar docs de estado (09/stickers) com o fluxo corrigido.

### Critério de conclusão (checklist da etapa)
- [ ] `showRecent` produz lista diferente/ordenada por recência (teste unitário).
- [ ] Upload de compartilhadas acessível pelo picker: seleção → preview → upload ao bucket `stickers`.
- [ ] Nenhum `pendingUpload` órfão; erro de upload visível em toast.
- [ ] Suíte de stickers passa no CI.

## Etapa 45 — ConversationItem: orquestrar variantes e eliminar monolito

**Objetivo:** Substituir o monolito ConversationItem (l.212-714) por um orquestrador que delega às variantes refatoradas, sem duplicação.

**Base:** findings-04.md:103 — `ConversationItem.tsx:212-714` monolito coexiste com variantes sem orquestrador (A3); `:117-156` TruncatedTooltip duplicado localmente (A4); `:463` cast `as never` (A12); findings-04.md:115 — barrel `conversation-list/index.ts` omite Comfortable, Compact, TruncatedTooltip, useConversationDisplay.

### Subetapas
- [ ] 45.1 Fazer diff monolito × variantes (Comfortable/Compact): listar comportamentos exclusivos do monolito que precisam ser portados.
- [ ] 45.2 Remover TruncatedTooltip duplicado (l.117-156) e importar de `TruncatedTooltip.tsx`.
- [ ] 45.3 Criar orquestrador `ConversationItem` que seleciona a variante por prop (densidade) e repassa props tipadas.
- [ ] 45.4 Portar para as variantes os comportamentos exclusivos identificados (retry badge, SLA, seleção, navegação).
- [ ] 45.5 Remover o cast `as never` (l.463) com tipagem real do evento/estado.
- [ ] 45.6 Completar o barrel `conversation-list/index.ts`: exportar Comfortable, Compact, TruncatedTooltip e `useConversationDisplay`.
- [ ] 45.7 Apagar as linhas órfãs do monolito após a migração (zero churn: remover só o bloco morto, não reescrever o arquivo).
- [ ] 45.8 Expandir `ConversationItem.test.tsx` (hoje 4 casos empty-handlers): densidades, retry/SLA, seleção e a11y (findings-04:116).
- [ ] 45.9 Validação visual das 3 densidades (comfortable/compact/monolito) em lista real.
- [ ] 45.10 Atualizar docs de estado (09 §4 barrel) com os exports completos.

### Critério de conclusão (checklist da etapa)
- [ ] `ConversationItem.tsx` não contém mais o bloco monolito 212-714 nem TruncatedTooltip local.
- [ ] Barrel `conversation-list/index.ts` exporta os 4 símbolos omissos (build + lint passam).
- [ ] `ConversationItem.test.tsx` cobre densidades, retry e a11y (≥10 casos).
- [ ] Validação manual: lista renderiza nas 3 densidades sem regressão visual.

## Etapa 46 — Falhas silenciosas: onArchive + EditContactDialog `_pendingData`

**Objetivo:** Fazer `/archive` falhar de forma visível quando sem prop e reativar o estado pendente do EditContactDialog para não perder edições em conflito.

**Base:** findings-04.md:69 — `useChatPanelHandlers.ts:548-553` `onArchive?.()` resolve silenciosamente sem prop (A4); findings-04.md:92 — `EditContactDialog.tsx:99` `_pendingData` nunca lido — edições perdidas em conflito (A10).

### Subetapas
- [ ] 46.1 Substituir `onArchive?.()` por chamada explícita que lança erro controlado (toast) quando a prop não existe.
- [ ] 46.2 Garantir que todos os call sites (ChatPanel e atalhos de teclado) passem `onArchive` real (useArchiveConversationActions) — ou desabilitem o atalho.
- [ ] 46.3 Ler `_pendingData` no EditContactDialog e reaplicar as edições locais quando a versão do servidor muda (optimistic lock via `update_contact_versioned`).
- [ ] 46.4 Exibir dialog de conflito com opções "manter minhas alterações" / "descartar" (reusar `ConflictResolutionDialog` existente, findings-06 15@L70).
- [ ] 46.5 Persistir as edições locais em estado/ref estável (não descartar em re-render).
- [ ] 46.6 Corrigir `useChatPanelHandlers.edit.test.ts` (mock incompleto, findings-04:128 A13) para exercitar o caminho real.
- [ ] 46.7 Criar teste de conflito do EditContactDialog: versão nova + `_pendingData` → resolução correta.
- [ ] 46.8 Acessibilidade: foco no dialog de conflito, `aria-describedby`, Escape fecha sem perder dados.
- [ ] 46.9 Validação manual: arquivar sem prop mostra erro; edição concorrente não perde texto.
- [ ] 46.10 Atualizar docs 08-2/09 com o novo contrato de `onArchive` e do conflito.

### Critério de conclusão (checklist da etapa)
- [ ] `onArchive` sem prop produz erro visível (teste cobre); nenhum `?.()` silencioso no caminho de arquivamento.
- [ ] `_pendingData` é lido e reaplicado; edições sobrevivem a conflito (teste + manual).
- [ ] Suíte `useChatPanelHandlers.edit` e novo teste de conflito passam no CI.
- [ ] Verificação manual: cenário de 2 abas editando o mesmo contato preserva ambas as edições com escolha explícita.

## Etapa 47 — ConversationContextMenu legível + navegação de histórico por UUID

**Objetivo:** Restaurar contraste do menu de contexto (texto ilegível sobre `bg-foreground`) e corrigir a navegação de histórico que passa data no lugar de UUID.

**Base:** findings-05.md:50 — `ConversationContextMenu.tsx:93,183,214` `bg-foreground` deixa texto invisível (A1); delete sem confirmação; atalhos decorativos; findings-05.md:51 — `ConversationHistory.tsx:199` passa `dayKey` (data) onde consumidor espera UUID (A4).

### Subetapas
- [ ] 47.1 Substituir `bg-foreground` (l.93/183/214) por tokens do design system (`bg-popover` + `text-popover-foreground`), nunca cor literal.
- [ ] 47.2 Revisar estados hover/ativo do menu com tokens e validar contraste WCAG AA (4.5:1 texto, 3:1 UI).
- [ ] 47.3 Adicionar confirmação ao delete de conversa (dialog `alert-dialog` padrão do projeto) antes da chamada destrutiva.
- [ ] 47.4 Implementar ou remover os atalhos decorativos do menu (decisão por item; nada de item visual sem efeito).
- [ ] 47.5 ConversationHistory: carregar/armazenar `conversationId` (UUID) junto do `dayKey` ao agrupar por dia.
- [ ] 47.6 `onSelectConversation` passa UUID real (l.199) e o tipo do callback passa a exigir UUID.
- [ ] 47.7 Atualizar o consumidor do callback para abrir a conversa por UUID (navegação/state do inbox).
- [ ] 47.8 Testes: contraste via tokens (snapshot de classes), delete com confirmação, `onSelectConversation` recebe UUID válido.
- [ ] 47.9 Validação manual: menu legível em tema claro/escuro; histórico clica e abre a conversa certa.
- [ ] 47.10 Atualizar docs 10/11 com o contrato corrigido de histórico.

### Critério de conclusão (checklist da etapa)
- [ ] Zero ocorrências de `bg-foreground` como fundo no ConversationContextMenu (grep).
- [ ] Contraste validado em claro/escuro (medição de contraste ≥4.5:1 nos textos do menu).
- [ ] Delete exige confirmação; atalhos do menu são funcionais ou removidos.
- [ ] `ConversationHistory` entrega UUID (teste unitário valida `onSelectConversation`).

## Etapa 48 — Ações de conversa: ChatPanel atalhos, BulkActionsToolbar, NextBestActionEngine

**Objetivo:** Dar efeito aos 4 atalhos vazios do ChatPanel, restaurar a animação de saída da BulkActionsToolbar e tornar os cards do NextBestActionEngine executáveis.

**Base:** findings-05.md:44 — `ChatPanel.tsx:278-283` 4 handlers de atalho `() => {}` (A10); findings-05.md:41 — `BulkActionsToolbar.tsx:33,42` `return null` antes do `AnimatePresence` (A14) + tipo `"connection"` não coberto; findings-05.md:95 — `NextBestActionEngine.tsx:28-31` `action` nunca atribuído (A3).

### Subetapas
- [ ] 48.1 `onNextConversation`/`onPrevConversation`: navegar pela ordem real da lista de conversas (`useRealtimeInbox`), com wrap-around.
- [ ] 48.2 `onArchive`: ligar ao handler real de arquivamento (useArchiveConversationActions) com feedback de sucesso/erro.
- [ ] 48.3 `onRefresh`: invalidar/refetch das queries do inbox (React Query), com indicador de carregamento.
- [ ] 48.4 Registrar os atalhos na ajuda de teclado (`KeyboardShortcutsHelp`), alinhado a `useInboxShortcuts`.
- [ ] 48.5 BulkActionsToolbar: mover o `return null` (l.33) para depois do `AnimatePresence` (l.42), restaurando a saída animada.
- [ ] 48.6 BulkActionsToolbar: cobrir o tipo `"connection"` no switch de ações (ou remover do tipo com decisão documentada).
- [ ] 48.7 NextBestActionEngine: atribuir `action` por card — "Responder agora" foca o compositor; "Follow-up" abre agendamento (ScheduleMessageDialog); "Escalar SLA" abre transferência (TransferDialog).
- [ ] 48.8 Acessibilidade: `aria-expanded`/`aria-label` nos botões de bulk e cards clicáveis com foco visível.
- [ ] 48.9 Testes: atalhos disparam handlers reais; bulk toolbar renderiza com `"connection"`; cards do engine executam callback.
- [ ] 48.10 Validação manual: atalhos Ctrl/Alt+seta navegam conversas; animação de saída visível; cards executam ações.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhum `() => {}` nos 4 atalhos do ChatPanel (grep l.278-283); todos têm efeito verificado.
- [ ] Exit animation da BulkActionsToolbar dispara (validação manual + teste de render).
- [ ] Cards do NextBestActionEngine executam ações reais (teste unitário por card).
- [ ] Ajuda de teclado documenta os atalhos ativados.

## Etapa 49 — LinkPreview OG, MediaGallery download, ScheduleMessageDialog fuso

**Objetivo:** Corrigir 3 defeitos funcionais: preview de link sem OG tags, download da galeria sem spinner e agendamento interpretando data como UTC.

**Base:** findings-05.md:76 — `LinkPreview.tsx` sem fetch real de OG tags (PARCIAL); findings-05.md:79 — `MediaGallery.tsx:78` `_setIsDownloading` nunca chamado (A18); findings-05.md:107 — `ScheduleMessageDialog.tsx:181` preview `new Date("yyyy-MM-dd")` = UTC midnight (A5); findings-04.md:74 — `useChatScheduleMessage.ts:43` signed URL 7d invalida agendamentos longos (A5).

### Subetapas
- [ ] 49.1 LinkPreview: implementar fetch real de OG tags (título/descrição/imagem) com timeout e AbortSignal, via caminho servidor/edge ou proxy já existente — sem fetch direto de URL arbitrária do bundle.
- [ ] 49.2 Sanitizar HTML retornado com DOMPurify (padrão do projeto) antes de renderizar; validar protocolo http(s).
- [ ] 49.3 Estados: carregando (skeleton), erro (fallback para domínio da URL) e sem OG (não renderiza card vazio).
- [ ] 49.4 Cache de previews (memória/`linkPreviewUtils.ts`) para evitar refetch a cada render.
- [ ] 49.5 MediaGallery: chamar `_setIsDownloading` real (l.78) durante o download e resetar ao concluir/errar.
- [ ] 49.6 MediaGallery: spinner de download acessível (`aria-busy`) e toast de erro de download.
- [ ] 49.7 ScheduleMessageDialog: converter "yyyy-MM-dd HH:mm" para datetime local com timezone explícita (date-fns-tz), corrigindo o desvio UTC-3.
- [ ] 49.8 Alinhar com `useChatScheduleMessage`: limitar agendamento ao prazo da signed URL (7d) com validação no dialog OU migrar mídia para URL permanente — decisão registrada.
- [ ] 49.9 Testes: `linkPreviewUtils` (parse/sanitize), `mediaUtils` (download state), agendamento (parse local × UTC).
- [ ] 49.10 Validação manual: URL genérica mostra título real; download mostra spinner; agendamento para amanhã 09:00 envia às 09:00 locais.

### Critério de conclusão (checklist da etapa)
- [ ] LinkPreview exibe título/descrição reais de URL externa (teste com fixture de OG).
- [ ] `_setIsDownloading` efetivamente altera o estado (teste) e o spinner aparece.
- [ ] Agendamento para hora local não desvia por fuso (teste com timezone fixada).
- [ ] Nenhuma URL arbitrária é fetcheada do bundle sem sanitização/timeout (revisão de código).

## Etapa 50 — Features mortas e consolidação: CRMAutoSync, sumários RLS, EmptyState único, páginas órfãs

**Objetivo:** Fechar a fase resolvendo as 4 pendências transversais: CRMAutoSync (RPC stub), RLS de `conversation_summaries`, unificação dos 5 sistemas de empty state + barrel quebrado e triagem das 128 páginas órfãs.

**Base:** findings-05.md:43 — `CRMAutoSync.tsx` RPC `sync_to_crm` é stub RAISE P0001, `catch {}` silencia, `sentiment` hardcoded (A2); findings-04.md:111 — `conversationSummaryStorage.ts:14-19` RLS de INSERT/UPDATE ausente p/ não-admins (A1); findings-06.md:56 — 5 implementações paralelas de Empty State (13@L397-401) + findings-06.md:36 — barrel `empty-states.tsx` quebrado (13@L296); pendencias-consolidadas.md:8-9 — 128 páginas órfãs não roteadas, 16 com `return-null`/empty-handlers (findings-01 L748-888).

### Subetapas
- [ ] 50.1 CRMAutoSync: decidir entre implementar o RPC `sync_to_crm` real (com contrato de payload) ou desativar a UI com banner de "indisponível" — decisão registrada em doc.
- [ ] 50.2 Remover o `catch {}` silencioso do CRMAutoSync: erro visível em toast acessível em qualquer falha.
- [ ] 50.3 Substituir `sentiment` hardcoded `'neutral'` pela análise real disponível (campo de sentimento da conversa) ou remover o envio do campo.
- [ ] 50.4 Criar migration de RLS para `conversation_summaries` (INSERT/UPDATE p/ `authenticated` no próprio workspace/conversa acessível), seguindo as policies existentes do schema.
- [ ] 50.5 conversationSummaryStorage: fallback para armazenamento local quando a escrita falhar (não perder o sumário gerado), com aviso discreto.
- [ ] 50.6 Eleger um único componente de empty state (`empty-states/` ContextualEmptyState) e migrar os consumidores dos outros 4 (EmptyState, GenericEmptyState, empty-state, UnifiedEmptyState) — sem reescrever páginas inteiras, só o import.
- [ ] 50.7 Corrigir o barrel `empty-states.tsx`: eliminar o conflito de nome `EmptyState` e re-exportar do módulo canônico; remover o barrel duplicado só se ficar sem consumidores.
- [ ] 50.8 Triagem das 128 páginas órfãs: classificar as 16 com `return-null`/empty-handlers em IMPLEMENTAR / ROTEAR / REMOVER, com veredito por página registrado (findings-01 L748-888).
- [ ] 50.9 Executar a triagem: remover páginas mortas confirmadas, rotear as vivas ou implementar os empty-handlers das 16 — um commit por página, sem churn colateral.
- [ ] 50.10 Fechamento da fase: rodar a suíte completa (vitest + lint + typecheck), atualizar docs de estado 08-1/09/10-12 e registrar débitos remanescentes (ex.: issue para RPC de CRM se desativado).

### Critério de conclusão (checklist da etapa)
- [ ] CRMAutoSync executa RPC real ou está oculto com banner; zero `catch {}` silencioso no arquivo.
- [ ] Migration de RLS de `conversation_summaries` aplicada e validada com `SET ROLE` (não-admin consegue salvar sumário).
- [ ] 5 sistemas de empty state reduzidos a 1 canônico; barrel `empty-states.tsx` sem conflito de nome.
- [ ] 16 páginas com `return-null`/empty-handlers classificadas e resolvidas; veredito das 128 registrado em doc.
- [ ] Fase 5 completa: suíte CI verde, docs de estado atualizados, débitos remanescentes com issue.


## Resumo

- **10 etapas** cobrindo os 21 achados de UI do inbox: 4 stubs da MessageHoverToolbar, tags decorativas (ContactTagsContent/ChatHeaderMenu), 2 stubs de vídeo, StickerManager, ConversationItem monolito + barrel, onArchive/_pendingData, menu ilegível + histórico por UUID, atalhos vazios + BulkActions + NextBestActionEngine, LinkPreview/MediaGallery/ScheduleMessageDialog e consolidação final (CRMAutoSync, RLS de sumários, EmptyState único, 128 páginas órfãs).
- **100 subetapas** com regras de zero churn (edição cirúrgica), tokens de design (nunca cor literal) e WCAG AA em toda interação nova.
- **50 checklists verificáveis** (3-5 itens cada) cobrindo grep, testes CI, validação manual e contraste.
- Toda etapa tem base real em findings-04/05/06 ou pendencias-consolidadas com arquivo:linha; nenhuma pendência inventada.
- Dependências entre etapas: 42 depende do empty state único (50.6) apenas para o estado vazio — ordem flexível; 48.7 reusa ScheduleMessageDialog (49.7) e TransferDialog.


---

# FASE 6 — AUTH E ADMIN

## Etapa 51 — Blindar bypass do papel `dev` com whitelist de ambiente
**Objetivo:** Impedir que `user_roles='dev'` conceda acesso irrestrito a rotas protegidas fora de ambientes autorizados.
**Base:** 04-features-auth.md A7 L511-520 (findings-02.md:34); A5 L498-505 (findings-02.md:35).
### Subetapas
- [ ] 51.1 Levantar todos os pontos onde `dev` é tratado como bypass (ProtectedRoute, useUserRole, usePermissions, route_permissions) e documentar o contrato atual de autorização.
- [ ] 51.2 Definir whitelist de ambientes (ex.: `import.meta.env.MODE`/`VITE_APP_ENV` ∈ {development, staging}) em que o bypass `dev` é permitido; produção exige permissões explícitas via role_permissions/route_permissions.
- [ ] 51.3 Implementar utilitário `isDevBypassAllowed()` com leitura única de ambiente e teste unitário parametrizado (dev/staging/prod/test).
- [ ] 51.4 Aplicar o guard em ProtectedRoute: em produção, role `dev` passa a exigir a mesma checagem RBAC/permissão dos demais papéis.
- [ ] 51.5 Aplicar o mesmo guard em useUserRole/usePermissions e em qualquer consulta a `user_roles` usada para autorização (eliminar bypass fora de ProtectedRoute).
- [ ] 51.6 Corrigir safety net 10s (A5): adicionar `pathname !== '/auth'` no redirect `navigate('/auth?reason=timeout')` + teste anti-loop (montagem de ProtectedRoute sobre /auth não causa loop).
- [ ] 51.7 Registrar em `log_security_event` (evento `dev_bypass_used`, RPC L236) qualquer tentativa de bypass bloqueada em produção — reutilizar o uso existente (04 L203/L205).
- [ ] 51.8 Teste de contrato RBAC: usuário `dev` em modo produção sem permissão recebe redirect/403; em dev recebe acesso — parametrizado por ambiente.
- [ ] 51.9 Avaliar e documentar (ADR curto) restrição de atribuição da role `dev` no banco (apenas admin/whitelist), sem alterar schema sem evidência prévia.
- [ ] 51.10 Validação runtime em produção (browser + Supabase MCP): login com conta de teste `dev` → bloqueio em prod e liberação em dev; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Em produção, usuário com role `dev` sem permissão explícita não acessa rotas protegidas (evidência de runtime).
- [ ] Em dev/staging o bypass continua funcionando (não quebra desenvolvimento).
- [ ] Teste anti-loop da safety net 10s existe e passa (ProtectedRoute sobre /auth não entra em loop).
- [ ] Tentativa de bypass em produção gera `log_security_event` com `dev_bypass_used`.
- [ ] Suíte de testes do módulo auth (36 arquivos) roda verde com os novos guards.

## Etapa 52 — MFA pós-login fail-closed: remover catch silencioso
**Objetivo:** Garantir que falha de rede/GoTrue na checagem AAL nunca contorne o segundo fator (fail-closed).
**Base:** 04-features-auth.md A8 L522-536 (findings-02.md:27); `useAuthForm.ts:95-100` (catch silencioso).
### Subetapas
- [ ] 52.1 Mapear o fluxo AAL1→AAL2 (redirect pós-login, getAuthenticatorAssuranceLevel, useAuthForm.ts:95-100) e documentar os estados possíveis: sem MFA / MFA pendente / MFA verificado / erro.
- [ ] 52.2 Remover o `catch` silencioso: falha de rede/GoTrue na checagem AAL exibe erro explícito com retry e NUNCA prossegue como AAL2.
- [ ] 52.3 Introduzir estado `mfaStatus: 'unknown' | 'no_mfa' | 'pending' | 'verified' | 'error'` no fluxo pós-login, com tratamento explícito de `'error'` (tela de erro + tentar novamente).
- [ ] 52.4 Validar no banco vivo (Supabase MCP) as tabelas do GoTrue `auth.mfa_sessions`, `auth.mfa_challenges`, `auth.mfa_factors` (existência, RLS/grants) e registrar baseline.
- [ ] 52.5 Teste de contrato do redirect pós-login: mock de `getAuthenticatorAssuranceLevel` falhando (network error) → usuário NÃO avança; sucesso → avança conforme regra.
- [ ] 52.6 Testes de regressão dos 3 cenários: sem MFA (login direto), MFA verificado (redirect normal), MFA pendente + falha de rede (bloqueado com retry).
- [ ] 52.7 Garantir que estado `'error'` não persista sessão parcial: cleanup local/forçar logout se AAL não confirmado dentro do fluxo.
- [ ] 52.8 Telemetria: registrar `log_security_event` em erro de AAL e em qualquer tentativa de prosseguir sem AAL2 (substituir o silêncio atual).
- [ ] 52.9 Revisar MFAVerify/MFAEnroll (L436-438) para consistência do novo estado e remover outros `catch` que engulam erro de 2FA (grep no módulo auth).
- [ ] 52.10 Validação runtime: DevTools offline no passo 2FA em produção → usuário permanece bloqueado com mensagem de erro; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Falha de rede/GoTrue no passo 2FA bloqueia o login (fail-closed) com tela de erro e retry — evidência runtime.
- [ ] Baseline de `auth.mfa_sessions`/`mfa_challenges`/`mfa_factors` registrado (banco vivo).
- [ ] Testes de contrato cobrem os 3 cenários AAL (sem MFA / verificado / pendente+erro).
- [ ] Nenhum `catch {}` silencioso restante no fluxo de MFA (grep).
- [ ] Evento de auditoria registrado em falha/erro de AAL.

## Etapa 53 — Backup codes MFA com persistência no banco
**Objetivo:** Persistir backup codes no banco para recuperação segura de 2FA sem depender de cópia manual única.
**Base:** 04-features-auth.md A2 L474-476 (findings-02.md:28) — códigos gerados no frontend, exibidos 1x, irrecuperáveis.
### Subetapas
- [ ] 53.1 Desenhar schema `zapp.mfa_backup_codes` (user_id FK, code_hash, used_at, created_at) com decisão de hash documentada em migration.
- [ ] 53.2 Migration SQL: tabela + índices + RLS (dono lê/usa os próprios; service_role administra) + grants mínimos; aplicar via Supabase MCP e versionar no repo.
- [ ] 53.3 RPCs SECURITY DEFINER com search_path fixo: `mfa_backup_codes_generate` (10 códigos, hash, retorno único), `mfa_backup_codes_list` (metadados sem hash), `mfa_backup_codes_use` (valida+invalida atomicamente), `mfa_backup_codes_regenerate`.
- [ ] 53.4 Frontend (MFABackupCodes L439): substituir geração CSPRNG local pela RPC; exibição 1x com aviso de cópia e confirmação de salvamento.
- [ ] 53.5 Fluxo de uso: opção "usar backup code" na MFAVerify chamando `mfa_backup_codes_use`; se válido, registrar AAL2 — verificar viabilidade com GoTrue e documentar fallback via admin se necessário.
- [ ] 53.6 Testes de contrato das RPCs: geração (10 códigos, hash únicos), uso único (reuso bloqueado), código inválido, RLS (A não lê códigos de B), concorrência (uso simultâneo → 1 vencedor).
- [ ] 53.7 Testes de frontend: regeneração invalida códigos antigos; aviso "copie agora" impede navegação sem confirmação.
- [ ] 53.8 Auditoria: registrar geração/uso/regeneração em `audit_logs`/`log_security_event`.
- [ ] 53.9 Atualizar docs de estado (04-features-auth.md) e types.ts gerado com tabela/RPCs novas.
- [ ] 53.10 Validação runtime: conta de teste com MFA perde acesso ao email → recupera via backup code em produção; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Tabela `zapp.mfa_backup_codes` + 4 RPCs aplicadas e versionadas (migration no repo).
- [ ] RLS comprovada via teste (SET ROLE): usuário só acessa os próprios códigos.
- [ ] Código usado não é reutilizável (teste de uso duplo concorrente).
- [ ] UI exibe códigos 1x com confirmação e regeneração funcional (teste automatizado).
- [ ] Runtime validado: recuperação de 2FA via backup code em produção.

## Etapa 54 — Passkey/WebAuthn autônomo (sem OTP email)
**Objetivo:** Tornar o login por passkey autônomo, eliminando a dependência de `signInWithOtp` após WebAuthn OK.
**Base:** 04-features-auth.md A3 L478-487 (findings-02.md:30); `useAuthForm.ts:255-270`.
### Subetapas
- [ ] 54.1 Diagnosticar o fluxo atual (useAuthForm.ts:255-270): por que WebAuthn OK dispara signInWithOtp e quais limitações do GoTrue self-hosted justificam o comportamento.
- [ ] 54.2 Validar no banco vivo `auth.webauthn_challenges` e `auth.passkey_credentials` (existência, RLS/grants, uso real) e registrar baseline.
- [ ] 54.3 Verificar suporte do GoTrue self-hosted + versão do supabase-js para passkey direto (signInWithPasskey ou equivalente); documentar versão/limitação em ADR curto.
- [ ] 54.4 Implementar caminho passkey autônomo: WebAuthn → sessão AAL2 direta, sem disparar OTP; manter OTP apenas como fallback explícito ("usar email").
- [ ] 54.5 Gerenciar desafios WebAuthn: limpeza de `webauthn_challenges` expirados (cron/RPC) e retry com novo challenge em falha.
- [ ] 54.6 Enroll de passkey com validação de origin/relier party por ambiente (whitelist de origins).
- [ ] 54.7 Teste de contrato do fluxo WebAuthn: sucesso → sessão autônoma sem chamada a signInWithOtp; falha de challenge → mensagem clara; origin inválida → bloqueio.
- [ ] 54.8 Testes de regressão: fallback OTP continua funcionando; combinação passkey+2FA.
- [ ] 54.9 Atualizar docs de estado (04-features-auth.md §2.7 L158-167) e types.ts.
- [ ] 54.10 Validação runtime: passkey cadastrado em produção faz login sem tocar no email (sessão criada, nenhum OTP enviado); registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Login por passkey em produção não dispara signInWithOtp (evidência runtime/network).
- [ ] `webauthn_challenges`/`passkey_credentials` auditadas no banco vivo com baseline.
- [ ] Teste de contrato prova que falha de challenge não abre caminho inseguro.
- [ ] Fallback OTP funciona (teste de regressão).
- [ ] ADR com limitações do GoTrue self-hosted registrado.

## Etapa 55 — Reset de senha ponta a ponta (solicitação→aprovação→redefinição)
**Objetivo:** Completar o fluxo de reset de senha (público + admin) com EF `approve-password-reset`, realtime e triggers de segurança religados.
**Base:** 04-features-auth.md A26 (🤔 INFERIDO, findings-02.md:44); pendencias-consolidadas.md:241 (PasswordResetRequestsPanel + EF approve-password-reset + realtime); :957 (2 triggers de segurança em password_reset_requests não religados).
### Subetapas
- [ ] 55.1 Mapear o fluxo atual: ResetPassword.tsx (L364), PasswordResetRequestsPanel, EF approve-password-reset, realtime — listar o que existe vs o que falta (solicitação, aprovação, execução, notificação).
- [ ] 55.2 Decidir e documentar o fluxo-alvo em ADR curto: solicitação por email → token com TTL → aprovação admin (se aplicável) → nova senha → notificação.
- [ ] 55.3 Verificar no banco vivo e religar os 2 triggers de segurança em `password_reset_requests` (PARIDADE 07-04); migration versionada se recriação necessária.
- [ ] 55.4 Endurecer/validar a EF `approve-password-reset`: contrato zod de entrada/saída, service_role, idempotência, retry; caminho público de solicitação com rate-limit.
- [ ] 55.5 Realtime: confirmar que `password_reset_requests` está na publication `supabase_realtime` (painel admin recebe INSERT/UPDATE); corrigir se ausente.
- [ ] 55.6 Frontend público: fluxo "esqueci minha senha" → email → token → nova senha (PasswordStrengthMeter L429 integrado) com estados de erro explícitos.
- [ ] 55.7 Frontend admin: PasswordResetRequestsPanel com aprovação/rejeição e auditoria via `log_security_event`.
- [ ] 55.8 Testes de contrato: EF (token válido/expirado/revogado, usuário inexistente), solicitação (rate-limit, email inexistente não vaza existência), triggers (INSERT/UPDATE/DELETE corretos).
- [ ] 55.9 Testes de UI: fluxo completo com mocks (solicitar → aprovar → redefinir → login com nova senha) + senha fraca bloqueada.
- [ ] 55.10 Validação runtime: solicitar reset para conta de teste, aprovar no painel admin, redefinir e logar em produção; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Fluxo completo funcional em produção (solicitar→aprovar→redefinir→login) com evidência.
- [ ] 2 triggers de segurança de `password_reset_requests` presentes no banco vivo (verificação SQL).
- [ ] EF approve-password-reset com contrato zod e testes (válido/expirado/revogado).
- [ ] Realtime do painel admin operante (publication inclui password_reset_requests).
- [ ] Solicitação com email inexistente não revela existência de conta (teste).

## Etapa 56 — Gestão e revogação de sessões ativas
**Objetivo:** Permitir ao usuário e ao admin listar e revogar sessões ativas (ausência total hoje).
**Base:** 04-features-auth.md A27 (🤔 INFERIDO, findings-02.md:45) — nenhum arquivo/hook de listagem/revogação de sessões no doc.
### Subetapas
- [ ] 56.1 Confirmar ausência atual (grep por listagem/revogação de sessões no módulo auth/admin) e mapear APIs do GoTrue self-hosted (admin listSessions/deleteSession, signOut por scope).
- [ ] 56.2 Validar no banco vivo `auth.sessions` (existência, colunas, retenção) e registrar baseline.
- [ ] 56.3 Backend: RPCs SECURITY DEFINER com search_path fixo — `sessions_list_own`/`sessions_revoke` (próprias) e `admin_sessions_list`/`admin_sessions_revoke` (supervisor/whitelist) + grants mínimos.
- [ ] 56.4 Integrar revogação real via GoTrue admin API (service_role deleteSession), idempotente e com erro explícito.
- [ ] 56.5 Frontend usuário: painel "Sessões ativas" (dispositivo, IP, último uso, sessão atual marcada) com revogar individual/ todas.
- [ ] 56.6 Frontend admin: listagem de sessões por usuário no AdminUsersTable (L591) com revogação remota e auditoria.
- [ ] 56.7 Fluxo "log out de todos os dispositivos" com confirmação, incluindo mirror de sessão externa se aplicável (A28, dep L332).
- [ ] 56.8 Testes de contrato das RPCs: dono só lista/revoga as próprias; supervisor revoga de outros; sem permissão → 403; idempotência.
- [ ] 56.9 Testes de UI: revogar sessão atual força reautenticação; sessão revogada some da lista (realtime/refetch).
- [ ] 56.10 Validação runtime: 2 sessões (aba normal + incógnito) → revogar a do incógnito e verificar logout forçado; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Painel de sessões ativas funcional para o usuário (listar/revogar) em produção.
- [ ] Revogação remota por admin comprovada (evidência runtime com 2 sessões).
- [ ] RLS/RPCs testadas (dono vs admin vs 403).
- [ ] Baseline de `auth.sessions` registrado (banco vivo).
- [ ] Docs 04-features-auth.md atualizados (A27 sai de INFERIDO).

## Etapa 57 — Convites de usuário + criação via invoke (sem fetch raw)
**Objetivo:** Implementar fluxo de convite por email e corrigir a criação de usuário que usa fetch raw em vez de `supabase.functions.invoke`.
**Base:** 04-features-auth.md A29 (🤔 INFERIDO, findings-02.md:47); 05-features-admin.md A16 L753-756 (findings-02.md:85); A4 L489-496 (`isSpecialAgent: false` sempre, findings-02.md:137).
### Subetapas
- [ ] 57.1 Mapear fluxo atual: única criação via EF create-user (05 L391) + uso em useAdminData (fetch raw, A16) — documentar lacunas do fluxo de convite.
- [ ] 57.2 Corrigir B30: substituir fetch raw por `supabase.functions.invoke('create-user')` em useAdminData (headers automáticos, retry, 401 com refresh).
- [ ] 57.3 Backend de convite: EF/RPC `invite_user` (email, papel, token com TTL, reenvio) com validação zod e rate-limit; verificar no banco vivo se tabela de convites existe antes de criar migration.
- [ ] 57.4 RLS/grants de convites: apenas admin/supervisor cria; convidado lê o próprio token; tokens expirados inválidos.
- [ ] 57.5 Frontend admin: dialog "Convidar usuário" (email + papel) no AdminUsersTable com estados de sucesso/erro/reenvio.
- [ ] 57.6 Frontend convidado: página de aceite (token) → signup com senha forte (PasswordStrengthMeter L429) → ativação da conta.
- [ ] 57.7 Limpeza do código morto `isSpecialAgent` (04 A4 L489-496, sempre `false`): remover ou documentar decisão; ajustar testes afetados.
- [ ] 57.8 Testes de contrato: invite (token válido/expirado/reenvio, rate-limit, RLS), create-user via invoke (401/retry), aceite (token já usado).
- [ ] 57.9 Testes de UI: fluxo completo convite→aceite→login; admin vê status do convite (pendente/aceito/expirado).
- [ ] 57.10 Validação runtime: convidar conta de teste, aceitar, logar; criação via invoke sem 401; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Fluxo de convite completo funcionando em produção (evidência runtime).
- [ ] useAdminData usa `supabase.functions.invoke` (grep comprova ausência de fetch raw).
- [ ] RLS de convites testada (não-admin não cria; convidado só lê o próprio token).
- [ ] `isSpecialAgent` removido ou decisão documentada.
- [ ] Docs 04/05 atualizados (A29 sai de INFERIDO).

## Etapa 58 — SicoobBridgeDashboard com dados reais (remover stub)
**Objetivo:** Substituir as seções hardcoded (`// DASHBOARD-13`) do dashboard Sicoob por dados reais da API Sicoob.
**Base:** 05-features-admin.md A2 L683-686 (findings-02.md:83) — SicoobBridgeDashboard.tsx:28-33; pendencias-consolidadas.md:484 (dependência da EF sicoob-bridge).
### Subetapas
- [ ] 58.1 Diagnosticar SicoobBridgeDashboard.tsx:28-33: identificar seções hardcoded (DASHBOARD-13) e qual API Sicoob deveria alimentá-las.
- [ ] 58.2 Mapear a ponte existente (EF `sicoob-bridge`/`sicoob-bridge-reply`) e o contrato da API Sicoob (auth, endpoints, rate-limit) — pendencias-consolidadas.md:484.
- [ ] 58.3 Backend: RPC/EF para dados reais (saldo, transações/extrato) com cache TTL, tratamento de erro e fail explícito — sem dados falsos silenciosos.
- [ ] 58.4 Frontend: substituir valores hardcoded por hook de consulta; estados loading/erro/vazio explícitos (padrão UnifiedEmptyState).
- [ ] 58.5 Falha da API Sicoob: exibir erro claro e NUNCA dados fictícios; proibir flag de "dados simulados" em produção.
- [ ] 58.6 Testes de contrato da RPC/EF: fixtures da API Sicoob (sucesso, 401, timeout, schema inválido via zod).
- [ ] 58.7 Testes de UI: dashboard renderiza com dados reais; falha mostra empty/erro (não números hardcoded).
- [ ] 58.8 Verificar credenciais Sicoob no vault/secrets (nunca no bundle do cliente) e procedimento de rotação.
- [ ] 58.9 Atualizar docs de estado (05-features-admin.md) e types.ts gerado.
- [ ] 58.10 Validação runtime: dashboard admin em produção carrega dados reais (evidência de payload/network).
### Critério de conclusão (checklist da etapa)
- [ ] Nenhum valor hardcoded DASHBOARD-13 restante no dashboard (grep).
- [ ] Dados reais carregam em produção (evidência network/payload).
- [ ] Falha da API Sicoob exibe erro explícito, sem dados fictícios (teste).
- [ ] Credenciais Sicoob ausentes do bundle do cliente (grep).
- [ ] Docs 05 atualizados (B28 sai de PARCIAL).

## Etapa 59 — XP de gamificação com escrita transacional (fim da race condition)
**Objetivo:** Eliminar a perda de XP por concorrência (leitura→cálculo→escrita sem transação) com RPC atômica server-side.
**Base:** 05-features-admin.md A9 L718-721 (findings-02.md:66) — gamification/mutations.ts.
### Subetapas
- [ ] 59.1 Diagnosticar gamification/mutations.ts: mapear leitura→cálculo→escrita de XP e os gatilhos de eventos simultâneos.
- [ ] 59.2 Projetar RPC `gamification_award_xp` (SECURITY DEFINER, search_path fixo): leitura com FOR UPDATE + cálculo + escrita em uma transação; payload validado por whitelist de eventos.
- [ ] 59.3 Migration SQL: RPC + índices + grants + RLS; aplicar no banco vivo e versionar no repo.
- [ ] 59.4 Migrar frontend: substituir sequência client-side pela RPC (retry em conflito); nível/achievements/streak derivados de forma consistente (re-hidratação).
- [ ] 59.5 Teste de concorrência: 2+ eventos simultâneos (Promise.all) → XP final = soma exata, zero perda.
- [ ] 59.6 Testes de contrato da RPC: evento válido/inválido, delta negativo bloqueado, RLS (usuário só pontua a si), duplicidade/idempotência.
- [ ] 59.7 Testes de regressão do levelUtils (L667) e componentes de gamificação (DashboardView, GamificationEffects).
- [ ] 59.8 Auditoria: registro de award de XP em audit_logs (quem/o quê/quando).
- [ ] 59.9 Atualizar docs de estado (05-features-admin.md §2.5) e types.ts.
- [ ] 59.10 Validação runtime: disparar 2 eventos concorrentes (conta de teste) e verificar XP exato em produção; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] RPC transacional aplicada e versionada; mutations.ts não faz mais leitura→cálculo→escrita client-side.
- [ ] Teste de concorrência prova soma exata (0 XP perdido).
- [ ] Whitelist de eventos valida payloads (teste de contrato).
- [ ] RLS testada (usuário só pontua a si).
- [ ] Runtime validado com eventos concorrentes reais.

## Etapa 60 — Saneamento final auth/admin: types, escape hatches, nomenclatura, testes P1-P4 e lockout fail-closed
**Objetivo:** Fechar as dívidas de engenharia do módulo admin e blindar o lockout (`login-attempts`) contra fail-open.
**Base:** 05-features-admin.md A15 L748-751 (findings-02.md:104), A1 L678-681 + A3 L688-691 (:105), A12 L733-736 (:103), A14 L742-746 (:68); pendencias-consolidadas.md:1026 (login-attempts fail-open, loginAttempts.ts:118-145).
### Subetapas
- [ ] 60.1 Levantamento consolidado: auditar os 5 pontos (drift types, escape hatches, 4 `use*`, P1-P4 sem testes, login-attempts fail-open) com evidência atualizada de código.
- [ ] 60.2 Lockout fail-closed: revisar loginAttempts.ts:118-145 e a EF `login-attempts` — se indisponível/arquivada, lockout/blocklist/geo NÃO podem ser desprotegidos silenciosamente; fail-closed com alerta e evento de auditoria.
- [ ] 60.3 Testes de contrato do lockout: EF down/500/timeout → comportamento fail-closed testado; decisão de arquivar a EF registrada (findings-12 grupo F, pendencias-consolidadas.md:478).
- [ ] 60.4 Regenerar types.ts via Supabase MCP (is_active ausente em queues/queue_members/profiles) e commitar.
- [ ] 60.5 Remover casts frágeis de agentRepository.ts:34-50 e useSupervisorConversations (04 A8 → 05 A8) usando os tipos regenerados.
- [ ] 60.6 Eliminar escape hatches `_rpc`/`ignore-audit`: useFailedMessages L37 e AdminView L231 (`as unknown as`) substituídos por tipos reais/validação zod; regra de lint proibindo o padrão em produção.
- [ ] 60.7 Renomear os 4 arquivos `use*` que não são hooks (usePlaybooksData, useInboxCustomScopesData, useSupervisorQueuesData, useCrisisRoomData) + atualizar importadores + lint rules-of-hooks.
- [ ] 60.8 Testes P1-P4: computePriority/sortByPriority com cobertura das regras documentadas (P1/P2 30min/15min, risco ≥80/≥60) e casos-limite (empates, valores inválidos).
- [ ] 60.9 Suíte completa: testes auth (36 arquivos) + admin (7 arquivos) + typecheck + lint verdes.
- [ ] 60.10 Validação final: runtime auth+admin em produção (login, 2FA, lockout, painel admin) + atualizar docs 04/05 + registrar evidência de fechamento da fase.
### Critério de conclusão (checklist da etapa)
- [ ] types.ts regenerado com `is_active`; zero casts `as unknown as` de _rpc/ignore-audit (grep).
- [ ] 4 arquivos renomeados sem prefixo `use`; rules-of-hooks lint ativo.
- [ ] computePriority/sortByPriority com testes cobrindo P1-P4 (incl. limites documentados).
- [ ] Lockout fail-closed comprovado com EF indisponível (teste de contrato).
- [ ] Suíte auth+admin verde + runtime validado em produção (evidência).

**Resumo da fase:** 10 etapas (51–60) cobrindo 15 pendências reais de findings-02/07/12/22: whitelist do bypass `dev` (A16+A17), MFA fail-closed (A9), backup codes persistidos (A10), passkey autônomo (A12), reset de senha ponta a ponta (A26+07), sessões (A27), convites (A29+B30), Sicoob real (B28), XP transacional (B11), e saneamento final (B48/B49/B50/B13+login-attempts). Segurança de auth primeiro; toda mudança exige teste de contrato e validação runtime em produção; nenhuma pendência inventada — todas citadas com finding:linha.


---

# FASE 7 — FEATURES DE NEGÓCIO

## Etapa 61 — TalkX: habilitar e comprovar disparo real de campanha

**Objetivo:** Transformar o disparo de campanha TalkX de "inferido/mock" em fluxo real verificado ponta a ponta (UI → edge → banco → Evolution API).

**Base:** findings-08 (disparo 🤔 INFERIDO — edge só aparece como mock em `TalkX.test.tsx:36`, doc19:220); findings-10 (CAMPANHAS-06 — cron `talkx-scheduler-check` a confirmar em produção, 26 L424; useTalkX 26 L38/L362); findings-08 A2 (leak de subscription com `Math.random()` em TalkXLiveMonitor:45 e TalkXView:93, 19:434); findings-08 (TalkXRecipientsList com `TALKX_POLL_INTERVAL`/`TALKX_RECIPIENTS_LIMIT` hardcoded, 19:469-470).

### Subetapas
- [ ] 61.1 Auditar o fluxo real: `TalkXView → useTalkX → invoke(edge) → zapp.talkx_campaigns/talkx_recipients → Evolution API` — listar todas as chamadas `supabase.functions.invoke` e comparar com a lista de edge functions deployadas.
- [ ] 61.2 Verificar em produção (via MCP/runtime) se a edge de disparo existe de fato; se não existir, criar a edge `campanha-send` (ou nome canônico do contrato) com validação Zod, rate-limit e idempotência por destinatário.
- [ ] 61.3 Confirmar o cron `talkx-scheduler-check` (CAMPANHAS-06) em produção: job pg_cron ativo? schedule correto? SQL versionado no repo? Criar migration versionada se ausente ou divergente.
- [ ] 61.4 Implementar fila de envio por destinatário: status `pending → sent/failed` em `talkx_recipients` com atualização transacional (`UPDATE ... WHERE status='pending' RETURNING`) para evitar duplo envio em reprocessamento.
- [ ] 61.5 Substituir o mock de `TalkX.test.tsx:36` por teste de contrato real da edge (payload Zod + respostas reais), mantendo o teste hermético com fetch mockado.
- [ ] 61.6 Corrigir leaks de subscription Realtime: remover `Math.random()` sem deps em TalkXLiveMonitor:45 e TalkXView:93 — usar chave estável por campanha + cleanup no unmount.
- [ ] 61.7 Externalizar `TALKX_POLL_INTERVAL` e `TALKX_RECIPIENTS_LIMIT` (19:469-470) para constantes configuráveis via env/feature flag, com default documentado.
- [ ] 61.8 Executar campanha de teste controlada (flag dry-run ou destinatário de teste) e comprovar entrega real com evidência de log (envio registrado na Evolution + status no banco).
- [ ] 61.9 Tratar falhas por destinatário: expor motivo de falha no TalkXRecipientsList, com retry manual e respeito à blacklist/opt-out existente.
- [ ] 61.10 Documentar runbook de campanha (limites de envio, blacklist, LGPD/opt-out, rollback) no repo, citando a evidência da subetapa 61.8.

### Critério de conclusão (checklist da etapa)
- [ ] Disparo real comprovado por log/status em runtime (não mais "inferido"): recipients com `sent` real via Evolution API.
- [ ] Cron `talkx-scheduler-check` ativo em produção e declarado em migration versionada no repo.
- [ ] Zero canais Realtime com `Math.random()` em componentes TalkX (grep limpo).
- [ ] Testes de TalkX exercitam contrato real da edge (sem mock fantasma).

## Etapa 62 — Campanhas: RLS de escrita, dedup atômico e engine A/B

**Objetivo:** Completar o CRUD real de campanhas — RLS UPDATE/DELETE, motor `campanha-send` e engine de A/B — eliminando o 403 silencioso no botão "Iniciar".

**Base:** findings-09 (useCampaigns — RLS UPDATE/DELETE ausente → 403; edge `campanha-send` inexistente; botão "Iniciar" sem efeito real, 23:55/23:350 e 21:283 A4); findings-10 (useCampaignABTesting — engine de disparo A/B inexistente e RLS INSERT/UPDATE/DELETE bloqueiam escrita, 27 L22/L243, A3 L294-296); findings-10 (useCampaigns.test.tsx sem testes de update/delete, 28 L32/L314).

### Subetapas
- [ ] 62.1 Migration versionada: criar policies RLS UPDATE/DELETE em `zapp.campaigns` (dono/workspace check), espelhando as policies INSERT/SELECT já existentes.
- [ ] 62.2 Migration versionada: criar/validar policies de escrita em `talkx_campaigns`/`talkx_recipients` necessárias para atualização de status e progresso.
- [ ] 62.3 Implementar a edge `campanha-send` (referida em findings-09) com validação de status da campanha, rate-limit por instância e idempotência por recipient — ou registrar ADR se o contrato real for outro.
- [ ] 62.4 Dedup atômico de destinatários: unique constraint `(campaign_id, contact_id)` em `talkx_recipients` + `ON CONFLICT DO NOTHING` na inserção em lote.
- [ ] 62.5 Criar colunas de A/B na migration (ex.: `variant`, `variant_weight`) em `campaigns` e persistir a variante escolhida por recipient no disparo.
- [ ] 62.6 Implementar engine A/B: seleção de variante por destinatário (peso configurado), agregação de resultados por variante (entregues/respondidas).
- [ ] 62.7 Atualizar `useCampaignABTesting` (27 L22/L243) para consumir a engine real — remover qualquer mock/local state que finja resultado.
- [ ] 62.8 Corrigir `useCampaigns` e `CampaignsView` (21:283): "Iniciar/Pausar" chamam o contrato real, tratam 403 com mensagem clara e invalidam o cache após mutação.
- [ ] 62.9 Adicionar testes de mutação real em `useCampaigns.test.tsx` (update/delete com RLS simulado) e cobertura da seleção A/B.
- [ ] 62.10 Validação runtime: iniciar campanha de teste, confirmar recipients deduplicados (inserts concorrentes → 1 linha) e variante A/B persistida por recipient.

### Critério de conclusão (checklist da etapa)
- [ ] Policies UPDATE/DELETE aplicadas via migration e validadas com `SET ROLE` (sem 403).
- [ ] Dedup atômico provado: 2 inserts concorrentes do mesmo recipient geram 1 única linha.
- [ ] Engine A/B funcional: variante persistida por recipient e resultados agregados por variante.
- [ ] Botão "Iniciar" produz envio real (evidência de status no banco), sem mock.

## Etapa 63 — useSyncToCRM: RPC real ou aposentadoria com feature flag

**Objetivo:** Eliminar o stub `RAISE P0001` mascarado por `isConfigured=false` — sync com CRM passa a funcionar de verdade ou a UI é desligada com flag.

**Base:** findings-10 (useSyncToCRM — RPC `sync_conversation_to_crm` é stub RAISE P0001 e `isConfigured=false` esconde o erro, 26 L36/L360, A2 L405-406); findings-05 (CRMAutoSync — RPC `sync_to_crm` STUB RAISE P0001, erro engolido por `catch {}`, `sentiment` hardcoded, doc10 A2 l.361).

### Subetapas
- [ ] 63.1 Mapear o contrato exigido pela UI: quais campos `sync_conversation_to_crm` deve enviar (conversation_id, contato, mensagens, sentiment) e qual o destino real (CRM externo ou staging interno).
- [ ] 63.2 Registrar decisão em ADR: implementar integração real OU desligar a feature com feature flag — nunca manter stub ativo.
- [ ] 63.3 Migration versionada: implementar `sync_conversation_to_crm` (SECURITY DEFINER, search_path fixo, checagem de permissão) escrevendo em fila de staging `crm_sync_queue` com status `pending` (se não houver CRM externo imediato).
- [ ] 63.4 Se houver CRM externo: criar edge function de envio com retry/backoff, idempotência por `conversation_id` e timeout (lição de findings-01:5 sobre chain sem timeout).
- [ ] 63.5 Remover `isConfigured=false` hardcoded: derivar de config real (tabela/flag) ou exibir erro explícito na UI quando não configurado.
- [ ] 63.6 Remover `catch {}` silencioso em CRMAutoSync (findings-05): propagar erro à UI com estado visível (toast/badge) e log estruturado.
- [ ] 63.7 Remover `sentiment` hardcoded do payload: usar análise real ou `null`, nunca valor fictício.
- [ ] 63.8 Aplicar feature flag: sem CRM configurado, ocultar a UI de sync (não exibir feature morta "visualmente presente").
- [ ] 63.9 Testes: RPC com `SET ROLE` (permissão negada/ok), erro propagado até a UI, idempotência de sync repetido.
- [ ] 63.10 Validação runtime + runbook: executar sync real (ou simulado com flag) e documentar o fluxo no repo.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhuma RPC de sync com `RAISE P0001` restante no repo (grep limpo).
- [ ] Erro/sucesso de sync visível na UI (sem `catch {}` ou `isConfigured=false` mascarando).
- [ ] Decisão ADR registrada (implementar vs. flag) e executada.
- [ ] Teste de permissão da RPC passando com `SET ROLE`.

## Etapa 64 — useLatestAnalysis: implementar RPC (GAP-6)

**Objetivo:** Substituir o STUB que retorna `null` sempre por RPC real, devolvendo dados à `AnalysisBadges`.

**Base:** findings-10 (useLatestAnalysis ❌ — queryFn retorna `null` sempre; RPC nunca implementada GAP-6; consumida por AnalysisBadges.tsx, 25 L20/L265, A1 L318-319); pendencias-consolidadas (findings-10: GAP-6 RPC de useLatestAnalysis nunca implementada).

### Subetapas
- [ ] 64.1 Definir o contrato da RPC (ex.: `rpc_latest_conversation_analysis(conversation_id)`) — payload: análise mais recente da conversa (tipo, resumo, confiança, created_at).
- [ ] 64.2 Inventariar no banco as tabelas/funções existentes de análise (ex.: `ai_conversation_tags`, `conversation_analyses`) para basear a RPC em dado real — nada de schema inventado.
- [ ] 64.3 Migration versionada: criar a RPC (SECURITY DEFINER, search_path fixo, grants mínimos) com fallback explícito quando não há análise.
- [ ] 64.4 Atualizar `useLatestAnalysis.ts:18`: invocar a RPC real com queryKey estável, retry e tratamento de erro (sem `null` silencioso).
- [ ] 64.5 Regenerar/atualizar tipos TS do Supabase para incluir a RPC (seguir fluxo de regeneração de types do repo).
- [ ] 64.6 `AnalysisBadges.tsx`: tratar estados loading/erro/vazio — badge real quando houver análise, estado vazio explícito quando não houver.
- [ ] 64.7 Garantir invalidação: novas análises (AI tags/summary) invalidam a query da badge.
- [ ] 64.8 Testes: useLatestAnalysis com mock da RPC (sucesso/vazio/erro) + teste de contrato do payload.
- [ ] 64.9 Verificar consumidores secundários da query (busca por usos de `useLatestAnalysis`) e cobrir cada um.
- [ ] 64.10 Validação runtime: chamar a RPC via MCP com usuário real e verificar a badge renderizando dado real na UI.

### Critério de conclusão (checklist da etapa)
- [ ] RPC existe em migration versionada e no banco (sem drift repo×DB).
- [ ] `AnalysisBadges` exibe dados reais ou estado vazio explícito — nunca vazio permanente por `null` silencioso.
- [ ] Tipos TS regenerados contendo a RPC (sem `as unknown as`).
- [ ] Testes de contrato da RPC passando.

## Etapa 65 — Mensagens agendadas: RLS (CAMPANHAS-09) + dispatcher real

**Objetivo:** Fazer mensagens agendadas de fato serem enviadas: RLS de escrita + cron/edge que dispara `scheduled_messages` com idempotência.

**Base:** findings-10 (useScheduledMessages — RLS INSERT/UPDATE ausentes, 403 silencioso, e nenhum cron/edge dispara `scheduled_messages`; CAMPANHAS-09, 26 L18/L342, A1 L402-403); findings-10 (useScheduledMessages.test.tsx sem mutações, 29 L33/L291); findings-04 (signed URL 7d em useChatScheduleMessage.ts:43 invalida agendamentos longos).

### Subetapas
- [ ] 65.1 Migration versionada: policies INSERT/UPDATE/DELETE em `scheduled_messages` (dono/workspace check) — resolve o 403 silencioso do CAMPANHAS-09.
- [ ] 65.2 Migration versionada: índice `(scheduled_at, status)` para polling eficiente do dispatcher.
- [ ] 65.3 Implementar dispatcher: edge function `scheduled-messages-dispatch` (ou RPC + cron) que seleciona mensagens devidas e envia via fila Evolution com validação Zod.
- [ ] 65.4 Criar cron pg_cron versionado (intervalo ~1min) autenticado com `CRON_SECRET` chamando o dispatcher.
- [ ] 65.5 Idempotência transacional: `UPDATE ... SET status='sent' WHERE status='pending' AND scheduled_at <= now() RETURNING *` — reprocessamento não duplica envio.
- [ ] 65.6 Falha com retry: status `failed` + contador de tentativas + backoff, sem loop infinito.
- [ ] 65.7 `useScheduledMessages`: propagar erro de RLS/mutação à UI (sem 403 silencioso) e invalidar cache após create/delete/update.
- [ ] 65.8 Mídia em agendamentos longos: tratar signed URL de 7 dias (useChatScheduleMessage.ts:43) — re-resolver URL no momento do envio ou limitar agendamento com aviso.
- [ ] 65.9 Testes: mutações create/delete/update com RLS simulado + dispatcher com relógio fake (devidas/não-devidas/duplo disparo).
- [ ] 65.10 Validação runtime: agendar mensagem para +2min e comprovar envio real com status no banco.

### Critério de conclusão (checklist da etapa)
- [ ] CRUD de agendamento sem 403 (validação com SET ROLE em runtime).
- [ ] Dispatcher/cron ativo e declarado no repo; mensagem agendada chega ao WhatsApp.
- [ ] Idempotência provada: reprocessamento não gera duplo envio.
- [ ] Testes de mutação e dispatcher passando no CI.

## Etapa 66 — Dashboards: remover todos os dados fake/hardcoded

**Objetivo:** Eliminar dados fictícios dos dashboards (tratados como bug) — métricas passam a vir de queries reais ou o widget é removido com flag.

**Base:** findings-06 (SatisfactionMetrics `dataUnavailable=true` hardcoded, 16@L343-344; gamificação fictícia XP=1250/coins=89/streak=7 no JSX, 16@L337-338; ConversationHeatmap response_time/satisfaction sempre 0, 16@L340-341; ActivityHeatmap resolutions cai em branch errado, 16@L352-353); findings-09 (useGoalNotifications `check.value` sempre null, 24:65/24:300; useDashboardDataBatch órfão com RPC `rpc_dashboard_init` possivelmente inexistente, 24:26/24:303); findings-01 (dashboard com `avgResponseTime: null`, `messagesHandled: 0`, war room zerado, recentActivity fake, 02 L160-164); findings-10 (useWarRoomData `alerts: []` hardcoded, 26 L65/L389; useQueueAnalytics `agentPerformance` hardcoded `[]`, 25 L52/L297).

### Subetapas
- [ ] 66.1 Inventariar por grep todos os valores hardcoded/fake em dashboards (XP/coins/streak, `avgResponseTime: null`, `messagesHandled: 0`, `alerts: []`, `agentPerformance: []`, `dataUnavailable`) e criar lista-verificável de remoção.
- [ ] 66.2 `SatisfactionMetrics`: implementar consulta real de CSAT/NPS (tabelas existentes) ou remover o widget com feature flag — proibido `dataUnavailable=true` fixo.
- [ ] 66.3 `ConversationHeatmap`: calcular response_time/satisfaction com queries agregadas reais; remover zeros fixos.
- [ ] 66.4 `ActivityHeatmap`: corrigir o branch de `resolutions` (dados caem no branch errado) e validar com fixture.
- [ ] 66.5 DashboardView: substituir XP=1250/coins=89/streak=7 hardcoded por dados do `GamificationProvider` (ver Etapa 70 para persistência).
- [ ] 66.6 `useGoalNotifications`: comparar métrica real contra `NOTIFY_THRESHOLDS` (corrigir `check.value` null) antes de disparar toast — toast sem base real é bug.
- [ ] 66.7 `useDashboardDataBatch`: adotar com RPC `rpc_dashboard_init` real (criada em migration) ou remover o hook órfão — decisão registrada.
- [ ] 66.8 `useWarRoomData`/`useQueueAnalytics`: implementar queries reais (alerts, agentPerformance) a partir das tabelas existentes ou remover com flag.
- [ ] 66.9 Qualquer métrica ainda sem fonte de dados deve exibir indicador explícito "sem dados" — nunca valor fictício silencioso.
- [ ] 66.10 Adicionar teste de regressão/lint que falha se novos literais fake (zeros/valores fixos) aparecerem em componentes de dashboard.

### Critério de conclusão (checklist da etapa)
- [ ] Grep de valores fake em componentes de dashboard = 0 (produção).
- [ ] SatisfactionMetrics com dados reais ou removido com flag (sem `dataUnavailable` fixo).
- [ ] Heatmaps e ActivityHeatmap exibem dados reais (sem zeros/branch errado).
- [ ] Toasts de meta só disparam com valor real comparado a threshold.

## Etapa 67 — SLA: consolidar duplicação e corrigir queries

**Objetivo:** Uma única fonte de verdade de SLA na UI e dados corretos — sem `staleTime: Infinity`, sem join que subreporta, sem rota duplicada.

**Base:** findings-01 (useSLAConfigurations `staleTime: Infinity` — mudanças de admin nunca refletem, 03 L292; useSLAMetrics join `contacts!inner(assigned_to)` subreporta conversas sem contato, 03 L291; useSLAHistory `new Date()` fora da queryKey — sem invalidação por dia, 03 L290); pendencias-consolidadas findings-06 (duplicação conceitual SLA: SettingsView × SLADashboard); findings-07 (rota SLA registrada em 2 lugares: AppRoutes.tsx:128 + ViewRouter.tsx:136).

### Subetapas
- [ ] 67.1 Mapa de duplicação: inventariar SettingsView (seção SLA) × SLADashboard × SLAMetricsDashboard × hooks `useSLA*` — listar sobreposições com evidência de linhas.
- [ ] 67.2 Decidir o dono único da configuração SLA (SettingsView ou SLADashboard) e registrar a decisão no plano/ADR.
- [ ] 67.3 Consolidar: uma única UI de configuração SLA (CRUD de `sla_configurations`); remover a duplicata com feature flag temporária se necessário.
- [ ] 67.4 `useSLAConfigurations`: remover `staleTime: Infinity` — usar staleTime curto + `invalidateOnMount`/focus e invalidação pós-mutação.
- [ ] 67.5 `useSLAMetrics`: trocar `contacts!inner(assigned_to)` por LEFT JOIN (ou contagem por conversation sem contato) para não subreportar (03 L291).
- [ ] 67.6 `useSLAHistory`: incluir o dia/período na `queryKey` (corrigir `new Date()` fora da key) para invalidar por mudança de dia (03 L290).
- [ ] 67.7 Resolver rota duplicada de SLA: manter UMA rota canônica (AppRoutes.tsx:128 ou ViewRouter.tsx:136) e remover a outra.
- [ ] 67.8 Alinhar `SLADeliveryHistoryDashboard`/`SLAHistoryDashboard`/`SLACharts` ao padrão consolidado (mesmos hooks e keys).
- [ ] 67.9 Testes: useSLAMetrics com e sem contato vinculado (contagem correta), useSLAHistory com mudança de dia, rota única renderizando.
- [ ] 67.10 Validação runtime: alterar config SLA em um cliente e ver refletir sem reload; conferir que métricas incluem conversas sem contato.

### Critério de conclusão (checklist da etapa)
- [ ] Uma única UI de configuração SLA em produção (duplicata removida).
- [ ] `staleTime: Infinity` eliminado — mudança de admin reflete sem reload.
- [ ] Contagem de métricas SLA bate com runtime (join corrigido, sem subreport).
- [ ] Rota SLA única; teste de rota passando.

## Etapa 68 — Notificações: RLS (42501), executor e dedup de providers

**Objetivo:** CRUD de canais/templates funcional + executor de envio real (DASHBOARD-08) + sem duplo disparo entre providers legados e novos.

**Base:** findings-08 (RLS ausente em `notification_templates` — nenhuma policy — e `notification_channels_config` só SELECT → salvar/excluir retorna 42501, 19:430-431; UnifiedNotificationProviders com risco de duplo disparo legado×novo, 19:457-458; NotificationChannelsAdmin CRUD, 19:56); findings-10 (TODO DASHBOARD-08 — executor de envio de canais de notificação ausente: salvar canal/template não produz efeito real, 25 L348-349; useNotificationChannels, 25 L30/L275).

### Subetapas
- [ ] 68.1 Migration versionada: policies RLS INSERT/UPDATE/DELETE em `notification_templates` (admin/workspace check).
- [ ] 68.2 Migration versionada: policies RLS INSERT/UPDATE/DELETE em `notification_channels_config`.
- [ ] 68.3 Migration versionada (se necessário): colunas de estado para o executor (`enabled`, `last_sent_at`, `error`) — validar contra schema real antes de criar.
- [ ] 68.4 Implementar executor DASHBOARD-08: edge function `notification-dispatcher` que lê canais/templates configurados e envia (in-app/push/email) com validação Zod e retry.
- [ ] 68.5 Cron pg_cron versionado chamando o dispatcher (intervalo definido) — sem executor = sem feature, nunca manter config morta.
- [ ] 68.6 `useNotificationChannels`: tratar 42501/erro com mensagem clara (sem falha silenciosa) e invalidar cache após CRUD.
- [ ] 68.7 `UnifiedNotificationProviders`: dedup de eventos (guard por eventId) entre providers legados e hooks novos — eliminar duplo disparo (19:457-458).
- [ ] 68.8 Botão "enviar notificação de teste" (PushNotificationToggle/NotificationChannelsAdmin) deve produzir efeito real via executor.
- [ ] 68.9 Testes: RLS com `SET ROLE` (42501 some), executor com canal mock, dedup de eventos com payload repetido.
- [ ] 68.10 Validação runtime: criar/editar/excluir canal e template sem 42501; notificação de teste chega de verdade.

### Critério de conclusão (checklist da etapa)
- [ ] CRUD de canais/templates sem 42501 (validado em runtime com SET ROLE).
- [ ] Executor DASHBOARD-08 implementado e com cron versionado; teste de envio chega.
- [ ] Nenhum duplo disparo entre providers (teste de dedup passando).
- [ ] Erros de notificação visíveis na UI (sem falha silenciosa).

## Etapa 69 — Catálogo, relatórios agendados e NPS/CSAT automáticos

**Objetivo:** Fechar features de negócio auxiliares: catálogo sem duplicação/timeout, relatórios agendados com pg_cron (DASHBOARD-16) e pesquisas NPS/CSAT com produtor real (DASHBOARD-04/05).

**Base:** findings-08 (formatPrice/handleImageError duplicados com ProductDetailDialog, 19:454-455; AutoExportManager STUB — rota `/auto-export` bloqueada com ShieldAlert, 19:439-440); findings-01 (sendProductToContact sem timeout na chain edge + DB inserts, 02 L52); findings-10 (useScheduledReports — pg_cron para disparo não existe no repo, DASHBOARD-16, 26 L19/L343); findings-09 (NPSDashboard — `nps-scheduler` deployada sem trigger, DASHBOARD-04, 22:29/22:285; useCSATAutoConfig sem produtor — nenhuma edge lê `csat_auto_config`, DASHBOARD-05, 23:52/23:353).

### Subetapas
- [ ] 69.1 Extrair `formatPrice`/`handleImageError` para util compartilhada e usar em ExternalProductCard + ProductDetailDialog (remover duplicação de 19:454-455).
- [ ] 69.2 `sendProductToContact`: adicionar timeout/AbortSignal na chain edge + DB inserts (02 L52) — envio de catálogo não pode pendurar indefinidamente.
- [ ] 69.3 AutoExportManager: registrar decisão — remover rota `/auto-export` OU implementar exportação agendada reutilizando `ExportButton`/`getData` (19:439-440); executar a decisão.
- [ ] 69.4 Migration versionada: policies RLS de escrita em `scheduled_reports` (e validação das existentes) para viabilizar o CRUD real.
- [ ] 69.5 DASHBOARD-16: criar pg_cron versionado que gera relatório agendado (CSV/PDF via rotina existente) e entrega por email/canal configurado.
- [ ] 69.6 DASHBOARD-04: religar `nps-scheduler` — criar trigger/cron que invoca a edge com `CRON_SECRET`, elegibilidade de contatos e janela de reenvio.
- [ ] 69.7 DASHBOARD-05: criar produtor CSAT que lê `csat_auto_config` e dispara pesquisa automática após conversa encerrada (edge ou RPC + cron).
- [ ] 69.8 Varrer demais stubs do domínio relatórios/exportação e aplicar regra: implementar ou flag — nunca UI que finge.
- [ ] 69.9 Testes: RPCs de agendamento (permissão), geração de relatório (formato/horário), elegibilidade NPS/CSAT (quem recebe, quando).
- [ ] 69.10 Validação runtime: relatório agendado gerado no horário previsto; NPS e CSAT disparados em ambiente controlado com evidência de log.

### Critério de conclusão (checklist da etapa)
- [ ] Zero duplicação de formatPrice/handleImageError; envio de catálogo com timeout.
- [ ] Rota `/auto-export` resolvida (implementada ou removida com flag — sem ShieldAlert morto).
- [ ] pg_cron de relatórios agendados existe no repo e está ativo (DASHBOARD-16 fechado).
- [ ] `nps-scheduler` com trigger e `csat_auto_config` com produtor (DASHBOARD-04/05 fechados).

## Etapa 70 — Onboarding acessível + gamificação real (níveis, achievements, XP transacional)

**Objetivo:** Onboarding respeitando `prefers-reduced-motion` e seletores válidos; gamificação com XP persistido em transação no banco — fim do XP fictício.

**Base:** findings-08 (TourOverlay com 13+ `motion.*` e WelcomeModal ignoram `prefers-reduced-motion`, 20:342-343; defaultTourSteps não verificam existência dos seletores DOM, 20:64; useTour fora do Provider lança exceção genérica, 20:351-352; AchievementBadge duplicado em LeaderboardHelpers.tsx:64, 19:451-452; GamificationProvider com triggers streak/xp/level-up, 19:36/19:118); findings-06 (gamificação fictícia XP=1250/coins=89/streak=7 no JSX do DashboardView, 16@L337-338).

### Subetapas
- [ ] 70.1 TourOverlay e WelcomeModal: usar `useReducedMotion` (padrão já existente em transitions/PageTransition, 20:66) — desabilitar animações quando o usuário preferir.
- [ ] 70.2 `defaultTourSteps`: validar existência dos seletores DOM em runtime — step ausente é pulado com aviso (não quebra o tour); adicionar teste dos seletores.
- [ ] 70.3 `useTour` fora do Provider: substituir exceção genérica por mensagem amigável de diagnóstico (20:351-352).
- [ ] 70.4 Definir modelo de gamificação real: níveis (thresholds de XP), achievements e transações de XP (entrada, data, motivo) — documentar em ADR breve.
- [ ] 70.5 Migration versionada: tabela `user_gamification` (user_id, xp, level, achievements[]) + tabela de transações de XP + RPC `grant_xp` (SECURITY DEFINER, transacional, search_path fixo).
- [ ] 70.6 GamificationProvider: persistir XP/streak/level via RPC `grant_xp` (triggers `incrementMessages`/`updateStreak`/`grantAchievement` existentes, 19:118) em vez de estado volátil.
- [ ] 70.7 DashboardView: substituir XP=1250/coins=89/streak=7 hardcoded (16@L337-338) por dados reais do provider (combinar com Etapa 66).
- [ ] 70.8 Unificar `AchievementBadge` (gamification) com o local de LeaderboardHelpers.tsx:64 (19:451-452) — um único componente reutilizado.
- [ ] 70.9 Leaderboard: basear ranking em XP transacional real (tabela `user_gamification`), não em mock/local.
- [ ] 70.10 Testes: RPC `grant_xp` (transação, concorrência, nível sobe no threshold), provider com persistência real, badges unificados, tour com seletor ausente.

### Critério de conclusão (checklist da etapa)
- [ ] `prefers-reduced-motion` respeitado em TourOverlay/WelcomeModal (teste com matchMedia mock).
- [ ] Tour não quebra com seletor ausente (step pulado + teste).
- [ ] XP/level/achievements persistidos no banco via transação — zero hardcoded no JSX (grep limpo).
- [ ] AchievementBadge único em uso (duplicação removida).


## Resumo (≤ 10 linhas)

- Fase 7 = 10 etapas (61–70) × 10 subetapas, todas ancoradas em findings reais (08/09/10 + consolidadas).
- 61–62: TalkX e campanhas — disparo real, RLS UPDATE/DELETE, dedup atômico, engine A/B.
- 63–65: stubs de negócio — useSyncToCRM (RAISE P0001), useLatestAnalysis (GAP-6), useScheduledMessages (CAMPANHAS-09 + dispatcher).
- 66: dashboards sem dados fake (SatisfactionMetrics, heatmaps, XP fictício, useGoalNotifications, useDashboardDataBatch).
- 67–68: SLA consolidado (staleTime/join/rota) e notificações (RLS 42501, executor DASHBOARD-08, dedup providers).
- 69: catálogo (formatPrice/timeout), relatórios agendados (DASHBOARD-16), NPS/CSAT (DASHBOARD-04/05).
- 70: onboarding acessível (reduced-motion, seletores) e gamificação real com XP transacional.
- Toda RLS de escrita é via migration versionada; todo stub restante é removido ou protegido por feature flag.


---

# FASE 8 — INTEGRAÇÕES E SERVIÇOS

## Etapa 71 — Adotar ou arquivar a camada src/services (Repository→Service→Hooks)
**Objetivo:** Encerrar o estado de 33/46 arquivos órfãos (~53%, ~2.900 linhas) da arquitetura construída mas nunca adotada, com decisão explícita e defeitos latentes corrigidos.
**Base:** pendência real (findings-08.md:196 — 32:28-35; findings-08.md:199 — 32:185-188 A3/A6/A7).

### Subetapas
- [ ] 71.1 Executar `rg -l "useListQuery|useCreateMutation|useDetailQuery" src supabase --glob '!src/services/**'` para reconfirmar os 0 consumidores e gerar a lista atualizada de órfãos (33/46) com contagem de linhas por arquivo.
- [ ] 71.2 Escrever ADR de decisão: domínio(s)-piloto para adoção real (candidatos: settings, contacts) × arquivamento do restante com entrada na dead-code-allowlist — sem meia-adoção.
- [ ] 71.3 Corrigir `deleteMany()` de `api/genericService.ts` (32:185) — retornar contagem real com `{ count: 'exact' }` ou remover o retorno enganoso de 0.
- [ ] 71.4 Corrigir invalidação TanStack das factories (32:187-188): alinhar `queryKeys` de users (A5) e messages (A6) para que `invalidateQueries` case com as chaves emitidas pelos hooks.
- [ ] 71.5 Unificar `QueryParams` (32:189): decidir `page/pageSize` vs `limit/offset` e corrigir todos os repositories que leem o par divergente.
- [ ] 71.6 Migrar o domínio-piloto (settings ou contacts) para Repository→Service→Hooks e religar 1 tela real de produção consumindo os novos hooks.
- [ ] 71.7 Eliminar import circular `index → useConnectionsQueries → index` (32:190) em connections e messages.
- [ ] 71.8 Corrigir defeitos do domínio migrado: `getUserSettings` descartando erro (32:194), `upsertWorkspaceSettings` sem validação de `name` (32:120), `.offset()` inexistente no PostgREST (32:191), `listAgents` sem filtro de role (32:192), PK `id` vs `user_id` (32:193).
- [ ] 71.9 Arquivar (ou remover, conforme ADR) os órfãos restantes sem consumidor nem teste vivo, atualizando `dead-code-allowlist.txt` com veredito por arquivo.
- [ ] 71.10 Rodar typecheck + suítes de `src/services/__tests__` no CI e publicar métrica pós-fase: % de arquivos de src/services com importador de produção.

### Critério de conclusão (checklist da etapa)
- [ ] ADR com veredito por arquivo (adotar/arquivar/remover) revisado e commitado.
- [ ] `rg "useListQuery|useCreateMutation" src --glob '!src/services/**'` ≥ 1 consumidor real de produção no domínio-piloto.
- [ ] `deleteMany` retorna contagem correta ou foi removido; `QueryParams` sem par divergente.
- [ ] Zero imports circulares em `src/services` (grep `index →` sem ciclos).
- [ ] CI verde com typecheck + testes de services.

## Etapa 72 — Resolver stubs de integração sem feature flag (GoogleCalendar, N8n, Sentry)
**Objetivo:** Eliminar as 3 UIs enganosas que prometem integração sem nenhuma ação persistida, via implementação real ou feature flag / remoção.
**Base:** pendência real (findings-08.md:197 — 20:334-337 A7; findings-08.md:125-127 — 20:54/56/57).

### Subetapas
- [ ] 72.1 Catalogar os 3 stubs: `GoogleCalendarIntegration` (handleConnect só `toast.info`, 20:334), `N8nIntegrationView` (setIsConnected local, 20:335), `SentryIntegrationView` (mockErrors hardcoded, 20:336) — confirmar comportamento atual em runtime.
- [ ] 72.2 Decidir por integração: (a) implementar backend real, (b) esconder atrás de feature flag OFF com aviso, ou (c) remover a view e o item de navegação — registrar decisão em ADR ou issue.
- [ ] 72.3 Para as mantidas: criar flags em `featureFlags.ts` (padrão existente) e ler a flag antes de renderizar a view e o item de nav (sidebarNavConfig/IntegrationsHub).
- [ ] 72.4 Para GoogleCalendar se implementado: definir tabela/edge de OAuth Google Calendar e fluxo connect real; caso contrário garantir que o hub não exiba o card.
- [ ] 72.5 Para N8n se implementado: persistir config em `n8n_variables` (policy corrigida é pré-requisito de segurança — findings-21) via RPC com validação; caso contrário flag OFF.
- [ ] 72.6 Para Sentry se implementado: persistir DSN/chave via vault e usar `lib/sentry.ts` (EM_USO, findings-11:253) para teste real de evento; caso contrário flag OFF.
- [ ] 72.7 Substituir qualquer `toast.info`/"conectado" local por feedback honesto: estado real da flag + mensagem "indisponível" quando OFF.
- [ ] 72.8 Cobrir com testes de componente: com flag OFF a view não renderiza; com flag ON sem backend, botões desabilitados com tooltip explicativo.
- [ ] 72.9 Remover da navegação (sidebarNavConfig/IntegrationsHub) qualquer integração removida; atualizar `lazyViews.ts` se necessário.
- [ ] 72.10 Rodar e2e de navegação do IntegrationsHub e registrar resultado no changelog da fase.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhuma das 3 integrações renderiza UI funcional sem backend real ou flag ativa.
- [ ] featureFlags.ts contém as flags decididas e é a única fonte de visibilidade.
- [ ] Testes automatizados provam o comportamento ON/OFF das flags.
- [ ] Navegação (sidebar + hub) sem itens mortos.

## Etapa 73 — Telemetria e circuit breakers das integrações: estado único e métricas por provider
**Objetivo:** Unificar os 3 circuit breakers divergentes da Evolution API e dar telemetria real por integração.
**Base:** findings-22 (3 CBs divergentes p/ mesma Evolution API — circuit-breakers-inventory) · api_circuit_breaker (fn_circuit_*) · metrics por provider ausentes.
### Subetapas
- [ ] 73.1 Inventariar os 3 circuit breakers da Evolution API (parâmetros: thresholds, janelas, estados) e documentar a divergência.
- [ ] 73.2 Definir a política canônica única (threshold de erro, cooldown, half-open) e aplicar nos 3 pontos.
- [ ] 73.3 Expor estado dos CBs via fn_circuit_status em dashboard de monitoring (componente reutilizado).
- [ ] 73.4 Instrumentar cada integração (Evolution, Gmail, Bitrix, ElevenLabs, TalkX) com métricas de latência/erro/uso (provider_message_log/provider_session_logs).
- [ ] 73.5 Criar alerta de abertura de circuit breaker (fn_alert_connection_drift estendido) com dedup.
- [ ] 73.6 Testar failover: simular falha do provider e provar half-open→close com teste de integração.
- [ ] 73.7 Adicionar telemetria de cache (hit/miss) nos repositórios de integração.
- [ ] 73.8 Auditar retries/backoff das integrações (3 CBs + retry-backoff inventory) e padronizar constantes.
- [ ] 73.9 Documentar a política de CB no runbook (runbooks/) com diagrama de estados.
- [ ] 73.10 Registrar métricas no evolution_performance_metrics e revisar após 7 dias.
### Critério de conclusão (checklist da etapa)
- [ ] 1 política única de CB aplicada nos 3 pontos (grep comprova mesmos thresholds)
- [ ] Dashboard mostra estado dos CBs (screenshot)
- [ ] Teste de failover passa (half-open→close)
- [ ] Alertas de CB com dedup funcionando
- [ ] Runbook atualizado

## Etapa 74 — Consolidar useEmail × useEmailManagement (802L × 1335L)
**Objetivo:** Unificar os dois hooks de email quase idênticos que convivem em produção com lógica divergente, migrando os 13 importadores de `useEmail` para o consolidado.
**Base:** pendência real (findings-09.md:267 — 24:36/39/41, 24:297 A1; findings-09.md:242 — migração email incompleta).

### Subetapas
- [ ] 74.1 Gerar diff funcional entre `useEmail` (802L, 13 importadores) e `useEmailManagement` (1335L, 8): listar exports, assinaturas e comportamentos divergentes por função.
- [ ] 74.2 Identificar as divergências que afetam produção (ex.: `loadMessages` via `email_messages`, 24:36) e escolher a implementação canônica por função (preferência: useEmailManagement).
- [ ] 74.3 Migrar os 13 importadores de `useEmail` para o hook consolidado em lotes de 3-4, com typecheck por lote.
- [ ] 74.4 Migrar `useEmailDraft` (24:39) para `useEmailManagement.useEmailDraft` e remover o legado.
- [ ] 74.5 Migrar `useEmailSearch` (24:41) para o equivalente consolidado e remover o legado.
- [ ] 74.6 Adicionar testes para `useEmailSLA` (sem testes hoje, 24:40) e remover `queryClient` não usado do consolidado.
- [ ] 74.7 Corrigir fonte de tipos divergente: `EmailThread` importado de `@/types/gmail` vs `@/hooks/gmail/gmailTypes` (findings-08:82 — 20:327-328 A5).
- [ ] 74.8 Após migração completa, deletar `useEmail.ts`, `useEmailDraft.ts`, `useEmailSearch.ts` e atualizar barrels.
- [ ] 74.9 Rodar suítes de email (useEmailActions.test, useEmailDraft.test, 24:37-38) contra o consolidado e validar fluxo de thread em runtime.
- [ ] 74.10 Documentar no changelog a contagem final: 1 hook de email, N importadores, divergências eliminadas.

### Critério de conclusão (checklist da etapa)
- [ ] Zero importadores de `useEmail`/`useEmailDraft`/`useEmailSearch` legados (grep vazio).
- [ ] Testes do consolidado cobrem SLA/draft/search com asserções reais.
- [ ] Thread de email (EmailChatInbox/EmailChatThread) validada em runtime após migração.
- [ ] Tipo `EmailThread` unificado em uma única fonte.

## Etapa 75 — VoIP: isolar credenciais SIP e fechar/decidir 8 gaps
**Objetivo:** Eliminar o risco de acesso cruzado a chamadas (senha SIP única compartilhada) e converter os 8 gaps VoIP documentados em decisões ou TODOs no código.
**Base:** pendência real (findings-08.md:195 — 20:315-316; findings-08.md:112 — 20:357-358 A14; findings-08.md:175 — 20:321-322 A3).

### Subetapas
- [ ] 75.1 Mapear onde a credencial SIP única (senha `phone1`) é lida/armazenada em `VoIPPanel` e `useSipClient`, e como o perfil do agente se relaciona com a extensão.
- [ ] 75.2 Desenhar isolamento por perfil: senha/extensão por agente (tabela ou vault) com fallback explícito desabilitado se não configurado — sem credencial compartilhada default.
- [ ] 75.3 Implementar leitura de credenciais por usuário autenticado (RPC segura, sem expor senha ao client além do dono).
- [ ] 75.4 Converter os 8 gaps (sem SRTP, sem chamada entrante SIP nativo, sem transfer, sem hold/resume, sem gravação, +3 do voip-security-gaps.test) em TODOs nomeados no código principal (findings-08:175) e manter o teste como doc vivo atualizado.
- [ ] 75.5 Decidir por gap: implementar (ex.: SRTP via config do provedor) ou declarar fora de escopo com justificativa registrada no `voip-security-gaps.test`.
- [ ] 75.6 Corrigir `VoIPPanel.test` (20:321-322): `vi.mock('@/hooks/useSipClient')` não intercepta porque o componente importa de `@/features/inbox` — mockar o caminho real.
- [ ] 75.7 Adicionar testes de isolamento: agente A não obtém credencial de agente B (mock de RPC + JWT).
- [ ] 75.8 Validar fluxo de discagem e histórico com credencial por perfil em ambiente de teste SIP.
- [ ] 75.9 Revisar `IncomingCallAlert` dual source (legado + broadcast, 20:318-319 A2) e consolidar a fonte única.
- [ ] 75.10 Atualizar o voip-security-gaps.test com o estado final (gaps fechados/decididos) e rodar a suíte.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhuma credencial SIP compartilhada default acessível a todos os agentes.
- [ ] Teste prova não-vazamento entre perfis.
- [ ] 8 gaps têm decisão explícita (implementado/fora de escopo) refletida no doc vivo.
- [ ] VoIPPanel.test intercepta o caminho real de import e passa no CI.

## Etapa 76 — Google OAuth + Gmail: DONO ÚNICO do fluxo OAuth (etapas de stubs, encerramento e Vercel referenciam esta)
**Objetivo:** Fechar a decisão do OAuth Gmail (stubs `initiate_gmail_oauth`/`complete_gmail_oauth` RAISE P0001), proteger o token com vault e decidir o destino do `email-imap-bridge` STUB e do `downloadAttachment` 501.
**Base:** pendência real (pendencias-consolidadas.md:1059 — Google OAuth decisão; CLAUDE.md:192-193 stubs RAISE P0001; AUDITORIA_BACKEND_SENIOR_2026-07-11.md:26 MED-2 decrypt_gmail_token; feature_registry.csv:120 email-imap-bridge STUB; findings-10:392 TODO EMAIL-04 downloadAttachment 501).

### Subetapas
- [ ] 76.1 Confirmar em runtime os stubs `initiate_gmail_oauth` e `complete_gmail_oauth` (RAISE P0001) e mapear o fluxo `useGmailOAuthFlow` (24:64) que os consome.
- [ ] 76.2 Escrever ADR da decisão Google OAuth: (a) implementar fluxo OAuth completo via edge functions + callback route, (b) desligar UI com flag até implementação, ou (c) abandonar integração Gmail — registrar formalmente.
- [ ] 76.3 Se implementar: criar edge `initiate-gmail-oauth` (redirect para Google com state) e `complete-gmail-oauth` (callback, troca de code, persistência segura do token).
- [ ] 76.4 Migrar `decrypt_gmail_token`/criptografia de token de `current_setting('app.encryption_key')` para `vault.decrypted_secrets`/pgsodium (MED-2) e rotacionar a chave antiga.
- [ ] 76.5 Garantir que o token NUNCA trafega para o client: apenas flags/claims de status via RPC segura.
- [ ] 76.6 Decidir destino do `email-imap-bridge` (STUB auto-declarado, "requer worker externo... use Nylas/EmailEngine"): remover a edge + tabela `imap_smtp_accounts` ou registrar como feature futura com flag OFF e sem UI.
- [ ] 76.7 Implementar `downloadAttachment`/`fetchMessageBody` como ações reais do `gmail-sync` (hoje ausentes do enum fechado → 400/501, EMAIL-04) e religar `EmailAttachmentPreview`.
- [ ] 76.8 Validar as 3 RPCs de email sem migration (`rpc_email_mark_thread_read`, `rpc_email_token_status`, `rpc_get_email_health_summary`, findings-08:193 A2) no banco e versionar migrations faltantes.
- [ ] 76.9 Testar fluxo completo: connect OAuth → status do token → leitura de thread → download de anexo (se implementado).
- [ ] 76.10 Atualizar FEATURE_REGISTRY/CLAUDE.md removendo os stubs da lista de pendências e registrando a decisão.

### Critério de conclusão (checklist da etapa)
- [ ] ADR Google OAuth formalizado e commitado.
- [ ] Nenhum stub RAISE P0001 de OAuth Gmail ativo sem flag ou implementação.
- [ ] Token Gmail criptografado via vault; teste de rotação documentado.
- [ ] `downloadAttachment` responde 200 em teste real (ou decisão de desligamento registrada).
- [ ] RPCs de email com migration versionada no repo.

## Etapa 77 — ElevenLabs, Bitrix24 e AI router (9 ações)
**Objetivo:** Corrigir invocação da edge `elevenlabs-dialogue`, persistir config do webhook Bitrix24 e dar destino às 9 ações do AI router (7 sem consumidor no frontend).
**Base:** pendência real (findings-08.md:123 — 20:348-349 A11 ElevenLabsDialogue fetch direto; findings-08.md:124 — 20:52/20:301 Bitrix sem persistência; findings-07.md:91 — 30:225 ai-router 223L 7/9 ações sem importadores).

### Subetapas
- [ ] 77.1 Substituir o fetch direto de `ElevenLabsDialogue` por `supabase.functions.invoke('elevenlabs-dialogue')` (padrão de `ElevenLabsVoiceDesign`, 20:349), sem URL/segredo no bundle.
- [ ] 77.2 Remover a URL de produção Evolution hardcoded em `EvolutionApiIntegrationView.tsx:17` (20:339-340 A8) para env/config, no mesmo padrão do gateway.
- [ ] 77.3 Definir schema de persistência do webhook Bitrix24 (config por workspace: URL, token, eventos) e RPC de save com validação.
- [ ] 77.4 Ligar `BitrixIntegrationView` à persistência real (hoje nada é salvo, 20:301) e mostrar estado salvo ao reabrir.
- [ ] 77.5 Testar webhook Bitrix24: envio de evento de teste → registro de entrega no DB (usar `useBitrixApi`, EM_USO 23:44).
- [ ] 77.6 Inventariar as 9 ações do `ai-router.ts` (223L) e mapear as 2 com consumidor vs as 7 sem importador no frontend.
- [ ] 77.7 Decidir por ação sem consumidor: ligar a um ponto de UI existente OU remover do router com contrato Zod de saída (evitar forwarders mortos).
- [ ] 77.8 Para ações mantidas, garantir chamada via wrapper tipado (não `invoke` solto) e erro visível, não silencioso.
- [ ] 77.9 Adicionar/atualizar testes de contrato do ai-router (contract.test.ts existente) cobrindo as ações decididas.
- [ ] 77.10 Rodar suítes de ElevenLabs/Bitrix/AI e registrar as decisões por ação no changelog.

### Critério de conclusão (checklist da etapa)
- [ ] ElevenLabsDialogue invoca via `functions.invoke`; zero URL hardcoded no bundle.
- [ ] Bitrix24 persiste e relê config; teste de webhook real registra entrega.
- [ ] Cada uma das 9 ações do AI router tem consumidor real ou foi removida/flagada.
- [ ] Testes de contrato do router verdes no CI.

## Etapa 78 — TeamChat: upload MIME, transferências auditáveis e RLS com testes reais
**Objetivo:** Fechar os 4 problemas do team-chat: MIME não validado no upload, `transferred_by` hardcoded, RLS sem verificações de membership/DELETE e 322 testes fantasma.
**Base:** pendência real (findings-07.md:137-139 — 17:254, 17:258/286, 17:280; findings-07.md:656 — 17:259-260 testes fantasma 218/270 + 52/52).

### Subetapas
- [ ] 78.1 Configurar `allowed_mime_types` no bucket `team-chat-files` (hoje sem validação, 17:254) e definir lista aceita (imagens/áudio/documentos com limite de tamanho).
- [ ] 78.2 Validar MIME também no cliente (upload) e rejeitar tipos fora da lista com mensagem clara.
- [ ] 78.3 Corrigir transferência entre departamentos: usar o usuário autenticado em `transferred_by` (hoje 'Support Agent' hardcoded, 17:258/286) e registrar no audit log.
- [ ] 78.4 Aplicar RLS de team-chat: policy INSERT em `team_messages` com check de membership na conversa (17:280).
- [ ] 78.5 Aplicar policy DELETE em `team_conversations` (ausente hoje, 17:280) com regra de autor (dono/admin do departamento).
- [ ] 78.6 Reescrever os 270 testes team-chat (218 `expect(true)`) e os 52 de security-gaps com asserções reais contra SUT (componente/hook/RPC mockado).
- [ ] 78.7 Adicionar teste RLS executável: INSERT de não-membro falha; DELETE de não-dono falha (via SET ROLE em suite de integração).
- [ ] 78.8 Adicionar testes de upload: MIME fora da lista é rejeitado antes do Storage.
- [ ] 78.9 Remover dead code confirmado `TeamChatMessageRow` (333L) + `teamChatParts` (143L) (17:202-203, 276) e verificar `lazyViews.ts` por referências antes.
- [ ] 78.10 Rodar suíte completa e validar runtime: upload, transferência com agente real e exclusão de conversa.

### Critério de conclusão (checklist da etapa)
- [ ] Zero `expect(true)` em suítes team-chat (grep de asserção real ≥ 1 por teste).
- [ ] Bucket com allowed_mime_types ativo e teste de rejeição verde.
- [ ] `transferred_by` reflete usuário autenticado; auditoria de transferência íntegra.
- [ ] RLS INSERT/DELETE aplicada e provada por teste com SET ROLE.
- [ ] Dead code removido sem referência residual.

## Etapa 79 — AutoExportManager e downloadAttachment 501 (Google OAuth: ver etapa do dono único)
**Objetivo:** Encerrar as pendências finais de integrações: rota `/auto-export` morta, export agendado inexistente, download de anexo 501 e a decisão formal do Google OAuth.
**Base:** pendência real (findings-08.md:198 — 19:439-440 A4 AutoExportManager STUB; findings-08.md:169 — 19:439-440; findings-10:392 TODO EMAIL-04 downloadAttachment 501; pendencias-consolidadas.md:1059 Google OAuth decisão).

### Subetapas
- [ ] 79.1 Confirmar estado da rota `/auto-export` (ViewRouter.tsx:107 + sidebarNavConfig.ts:141 → AutoExportManager com ShieldAlert, "BLOQUEADO por política de segurança").
- [ ] 79.2 Decidir (ADR): (a) implementar exportação agendada real (ScheduledReportConfigs + pg_cron/edge) ou (b) remover rota + item de nav — registrar formalmente.
- [ ] 79.3 Se implementar: definir tabela de agendamento (ScheduledReportConfigs), edge de geração e envio do relatório, e ligar a UI do AutoExportManager.
- [ ] 79.4 Se remover: apagar rota em ViewRouter, item em sidebarNavConfig, componente e testes associados; atualizar AUDITORIA_COMPLETA/feature registry.
- [ ] 79.5 Implementar `downloadAttachment` no `gmail-sync` (action ausente do enum fechado → 400/501, EMAIL-04) e religar `EmailAttachmentPreview` ao fluxo real.
- [ ] 79.6 Testar download de anexo real (PDF/imagem) e validar Content-Type/length no response.
- [ ] 79.7 Formalizar a decisão Google OAuth (link com Etapa 77): ADR aprovado e registrado nas pendências como resolvida.
- [ ] 79.8 Varrer navegação por outras rotas mortas expostas (padrão ShieldAlert/stub) e listar resultado.
- [ ] 79.9 Atualizar `pendencias-consolidadas.md`/FEATURE_REGISTRY: marcar AutoExportManager, EMAIL-04 e Google OAuth com veredito final.
- [ ] 79.10 Rodar bateria final: typecheck, lint, suítes afetadas e validação de produção da navegação (nenhuma rota enganosa acessível).

### Critério de conclusão (checklist da etapa)
- [ ] Rota `/auto-export` implementada com exportação real OU removida da navegação e do router.
- [ ] `downloadAttachment` responde 200 com anexo em teste real (ou decisão de desligamento registrada).
- [ ] ADR Google OAuth fechado e referenciado nas pendências.
- [ ] Nenhuma rota com UI enganosa (ShieldAlert/stub) acessível na navegação.
- [ ] Pendências consolidadas atualizadas com veredito por item.


## Resumo
- Fase 8 (etapas 71–80) cobre a camada de integrações e serviços: adoção/arquivamento de src/services (71), stubs GoogleCalendar/N8n/Sentry com flag ou remoção (72), externalProxy com suíte desligada (73), sanitização de useBulkActions (74), consolidação useEmail×useEmailManagement (75), VoIP com credenciais isoladas e 8 gaps decididos (76), Gmail OAuth/token/imap-bridge/download 501 (77), ElevenLabs/Bitrix/AI router (78), TeamChat MIME/transferência/RLS/testes fantasma (79) e encerramento AutoExportManager+EMAil-04+OAuth (80).
- Toda etapa parte de pendência real citada (finding:linha) e segue a regra anti-stub enganoso.
- Formato: 10 etapas × 10 subetapas, checklist verificável (3–5 itens) por etapa, total 100 subetapas.

## Etapa 80 — Adapters zappweb: tipagem real, columnMap correto e ramo PTT
**Objetivo:** Corrigir os adapters de integração com defeitos documentados e remover os no-ops mortos.
**Base:** findings-07 (SafeQueryBuilder=any, isArchived no adapter, ramo PTT audio em evolutionAdapter, columnMap.test 85L) · externalClient.ts + externalSessionBridge.ts no-ops.
### Subetapas
- [ ] 80.1 Substituir SafeQueryBuilder=any por genéricos tipados (Row/Insert/Update do schema).
- [ ] 80.2 Corrigir o ramo PTT (áudio) no evolutionAdapter: mapeamento de tipos de mídia audio→ptt com teste.
- [ ] 80.3 Ajustar isArchived no adapter (flag de arquivamento propagada) + teste de contrato.
- [ ] 80.4 Completar columnMap.test.ts (85L): cobrir colunas faltantes e corrigir divergências.
- [ ] 80.5 Remover externalClient.ts e externalSessionBridge.ts (no-ops pós-consolidação) após grep de 0 importadores.
- [ ] 80.6 Auditar os hooks zappweb (useZappContactSearch/Conversations/Messages + evolutionClient) contra o contrato do gateway (12 verbos).
- [ ] 80.7 Adicionar teste de paridade do columnMap com o esquema canônico (CANONICAL_COLUMN_MAP.md).
- [ ] 80.8 Corrigir gmailHealthRLS.test.ts (34L, strings hardcoded) para fixture real.
- [ ] 80.9 Reativar useZappConversations.test.tsx (127L) e useZappMessages.test.tsx (97L) com mocks corretos.
- [ ] 80.10 Rodar vitest nos adapters + typecheck; abrir PR com evidência.
### Critério de conclusão (checklist da etapa)
- [ ] SafeQueryBuilder tipado (0 `any` no caminho)
- [ ] Testes de adapters verdes (vitest run src/integrations)
- [ ] No-ops removidos com 0 importadores comprovados
- [ ] columnMap coberto e alinhado ao canônico
- [ ] PR aberto com diff revisado


---

# FASE 9 — DESACOPLAMENTO EVO×ZAPP

## Etapa 81 — Implementar client cloud (C1): 12 verbos + registry fail-closed
**Objetivo:** Entregar `providers/cloud/client.ts` (12 verbos, Bearer, retry/backoff) roteado pelo registry e migrar as edges para `getProviderClient()`, fechando a porta P2.
**Base:** pendência real findings-14.md §10 C1 (L134); findings-14.md §2 P2 (L30-31); findings-14.md §4 COVERAGE_V4 (L60-61).
### Subetapas
- [ ] 81.1 Reconciliar worktree × CLOUD_CLIENT.md: confirmar presença/conteúdo atual de `providers/cloud/client.ts` (12 verbos, Bearer, retry/backoff) e atualizar o doc para a realidade medida (nunca presumir ausência sem verificar)
- [ ] 81.2 Garantir `case 'cloud'` no registry com guard fail-closed: sem `WHATSAPP_CLOUD_PHONE_ID`/`WHATSAPP_CLOUD_TOKEN` → throw; nunca retorna undefined (registry.ts L58 e defesa no construtor)
- [ ] 81.3 Manter paridade fake (C2, já FEITO): fake com 12 verbos incl. `getProfilePicture`, sem `sendAudio`; `registry.test.ts` cobre os 3 providers com `PROVIDER_UNDER_TEST` (guard `DENO_ENV=test`)
- [ ] 81.4 Migrar as 10+ edges que importam `evolutionClient`/`getBaseUrl` direto para `getProviderClient()` (SUBSTITUABILITY P2-c/D2)
- [ ] 81.5 Fechar os 33 gaps do COVERAGE_V4: verbo no contrato Zod + implementação no `evolutionClient` e no `fakeProvider` + roteamento da action por ele
- [ ] 81.6 Trocar `proxyToEvolution` pelo `evolutionClient` + validação Zod nas actions cobertas (hoje cobertura efetiva de roteamento 0/41 = 0%)
- [ ] 81.7 Porta P1: completar `sendInteractive` (hoje zod 400) e `sendPtv` (FormData) em modo cloud
- [ ] 81.8 Rodar harness 67/67 + suíte registry/contract no CI (verb-contract 12/12, contract-coverage ≥90% com gate)
- [ ] 81.9 Exigir teste de contrato Zod em PRs de resolvers/gateway (D10 do SCORECARD_V4) — gate de review, não só CI
- [ ] 81.10 Atualizar SUBSTITUABILITY_MATRIX_V4 e COVERAGE_V4 com cobertura efetiva medida (roteamento >0% e % de contrato fechada)
### Critério de conclusão (checklist da etapa)
- [ ] verb-contract 12/12 verde no CI e cobertura efetiva de roteamento >0% com evidência
- [ ] nenhuma edge de produção importa `evolutionClient`/`getBaseUrl` direto (inventory TOTAL=0)
- [ ] harness 67/67 verde e registry.test.ts com os 3 providers
- [ ] COVERAGE_V4 e SUBSTITUABILITY_MATRIX_V4 atualizados com os números medidos

## Etapa 82 — Corrigir normalizer cloud (C3/C4/C5) + espelhos do ADR-008
**Objetivo:** Eliminar os 3 bugs do `whatsapp-cloud-normalizer.ts` (content vazio audio/sticker, epoch 1970, JID duplo) com testes de regressão e sincronizar os espelhos TS×Deno do contrato canônico.
**Base:** pendência real findings-14.md §10 C3/C4/C5 (L135); findings-13.md item 17 ADR-008 (L125); findings-15.md §10 (L83-84).
### Subetapas
- [ ] 82.1 Reconciliar estado atual do `whatsapp-cloud-normalizer.ts` vs os bugs C3/C4/C5 (fixes podem já existir no worktree — confirmar por teste, não por leitura)
- [ ] 82.2 Fix C3: content vazio para áudio/sticker — garantir `caption`/`filename`/fallback correto nos tipos media
- [ ] 82.3 Fix C4: timestamp nunca 1970 — `parseInt` com fallback "now", ISO com `Date.parse`, ms >1e12 → /1000
- [ ] 82.4 Fix C5: JID duplo sem sanitizar — normalizar `remoteJid`/`from`/`to` com dedupe e trim simétrico
- [ ] 82.5 Adicionar testes de regressão dos 3 casos em `__tests__/whatsapp-cloud-normalizer.test.ts` (vermelho antes do fix, verde depois)
- [ ] 82.6 Rodar harness 67/67 + suíte do normalizer local e no CI (Deno)
- [ ] 82.7 Sincronizar espelho Deno do ADR-008: `CanonicalMessage`/`'queued'` (Deno) × `ChannelMessage`/`'pending'` (TS) — revisar sync E45 (L104-112)
- [ ] 82.8 Alinhar normalizadores assimétricos E47/E48: E48 Meta produz pré-canônico sem `account`/`direction` — completar campos
- [ ] 82.9 Resolver drift `DeliveryStatus` TS `'pending'` × Deno `'queued'` com teste de contrato que falhe em divergência (CANONICAL_COLUMN_MAP L130-132)
- [ ] 82.10 Registrar decisão de contrato: ~55 colunas sem correspondente canônico → `metadata` (lista nominal no CANONICAL_COLUMN_MAP, sem alterar schema)
### Critério de conclusão (checklist da etapa)
- [ ] 3 fixes C3/C4/C5 com teste de regressão verde (e vermelho comprovado antes)
- [ ] espelhos TS×Deno sem drift — teste de contrato passa e gate não regride
- [ ] harness 67/67 verde; CANONICAL_COLUMN_MAP atualizado (drifts fechados)

## Etapa 83 — Handler webhook v2 (C6) e ativação cloud [APROVAÇÃO]
**Objetivo:** Migrar `whatsapp-cloud-webhook/index.ts` para handler v2 + normalizer (statuses persistidos, não só logados) e ligar o cloud com os 4 blocos do checklist (env/secrets + webhook Meta + código + flip/rollback).
**Base:** pendência real findings-14.md §10 C6 (L136) e checklist ligar cloud (L138); findings-14.md §2 P3 (L32).
### Subetapas
- [ ] 83.1 [APROVAÇÃO] Obter credenciais Meta de produção (`WHATSAPP_CLOUD_PHONE_ID`/`WHATSAPP_CLOUD_TOKEN`) + conta WABA produção + template aprovado (janela 24h) — bloqueia todo o restante da etapa
- [ ] 83.2 Reconciliar `whatsapp-cloud-webhook/index.ts` vs C6: handler v2 + normalizer, statuses ACK persistidos (sent/delivered/read/failed) e idempotência por `message.id`; registrar evidência se já migrado
- [ ] 83.3 Provisionar secrets vault WHATSAPP_CLOUD_* (4) e documentar cadeia vault×swarm×env (VAULT_SECRETS_V4 pendência §5 item 3)
- [ ] 83.4 Configurar webhook Meta com `messages`+`statuses` apontando para a edge (verificação de assinatura/HMAC habilitada)
- [ ] 83.5 Implementar `mode.ts` + resolvers cloud `ops.fn_cloud_*` + regenerar fixture `sql_report_snapshot.json`
- [ ] 83.6 Criar script flip/rollback (evolution→cloud / cloud→evolution) + baseline recalculado com digests
- [ ] 83.7 Ativação real do webhook Meta + congelamento da ingestão Evolution (P3) na janela combinada com a Etapa 84
- [ ] 83.8 Validação dedupe no overlap dual: mesma mensagem via 2 portas não gera duplicata em `zapp.evolution_messages`
- [ ] 83.9 Registrar procedimento e tempos no RUNBOOK_TROCA_PROVIDER (seção cloud)
- [ ] 83.10 Verificação final: webhook v2 processa `messages`+`statuses` com asserts; statuses não ficam apenas logados; 0 erros no console da edge
### Critério de conclusão (checklist da etapa)
- [ ] credenciais Meta provisionadas e webhook ativo com `messages`+`statuses`
- [ ] handler v2 em produção com persistência de status validada por evidência de runtime
- [ ] secrets no vault com cadeia documentada; flip/rollback testado em ensaio
- [ ] dedupe no overlap dual sem duplicatas (0 na validação)

## Etapa 84 — Executar ensaio REAL evolution→cloud (E92) [APROVAÇÃO]
**Objetivo:** Executar a troca real de provider com tempos medidos, critérios de abort e rollback por identidade de objeto, tornando I9 PASS.
**Base:** pendência real findings-13.md item 1 E92 (L109); findings-16.md §3 item 1 (L40); findings-15.md §7 I9 (L66).
### Subetapas
- [ ] 84.1 [APROVAÇÃO] Aprovar janela do ensaio real (data/hora, participantes, escopo P2/P4, rollback e critérios de abort) — aguarda credenciais Meta da Etapa 83
- [ ] 84.2 Pré-checks do RUNBOOK_TROCA_PROVIDER (L.86/L.107): credenciais, baseline, digests, DLQ=0, pipeline vivo (3 serviços healthy)
- [ ] 84.3 Executar flip evolution→cloud nas portas P2 (edge gateway) e P4 (SQL resolvers) com telemetria ativa (egress log E86)
- [ ] 84.4 Medir tempos de resposta e comparar com E91 (fake 12/12, 46ms) — registrar em ENSAIO_TROCA_PROVIDER_MEDIDO
- [ ] 84.5 Validar I9 = PASS no `ops.fn_boundary_audit()` e atualizar BOUNDARY_SCORE_T1
- [ ] 84.6 Executar rollback por identidade de objeto (E94) e validar estado pós-rollback (digests iguais ao baseline)
- [ ] 84.7 Verificar critérios de abort do BASELINE: erro envio >1%, DLQ>0 novas/10min, latência p95 webhook >2×, críticos >0
- [ ] 84.8 Registrar ensaio no VALIDACAO_V4.md com evidências (timestamps, métricas, screenshots/logs)
- [ ] 84.9 Reavaliar `v237Fallbacks`/`contract.zod` (assumem 2.3.x) vs prod 2.4.0 e decidir manutenção pós-ensaio
- [ ] 84.10 Verificação: relatório final do ensaio com tempos, dados, rollback e placar I9 anexado aos artefatos decouple
### Critério de conclusão (checklist da etapa)
- [ ] ensaio real executado com relatório de evidências (tempos + dados + logs)
- [ ] I9 = PASS no BOUNDARY_SCORE (placar 7/9+ ou 9/9 conforme formalização I6/I7)
- [ ] rollback validado e estado idêntico ao baseline (critérios de abort respeitados)

## Etapa 85 — Consumer dual-write (E89) e saúde do evolution-stack
**Objetivo:** Entregar o PR do consumer sem `PG_EVOLUTION_URL`/dual-write no evolution-stack, corrigir telemetria perdida e drift de artefatos (digest/OCI), e sanear o runbook PAUSE_INGEST.
**Base:** pendência real findings-13.md item 2 E89 (L110); findings-15.md F4 consumer.py:239 (L124); findings-16.md §3 itens 3/7 (L42, L46-47); findings-14.md §9 PAUSE_INGEST (L124).
### Subetapas
- [ ] 85.1 Abrir PR no evolution-stack: consumer sem `PG_EVOLUTION_URL` / dual-write (código + testes), conforme E89 (CHECKLIST L27)
- [ ] 85.2 Corrigir `consumer.py:239`: INSERT em relação inexistente (`public.evolution_webhook_events`) — telemetria perdida sem alarme; redirecionar ou remover com log explícito
- [ ] 85.3 Fix bug bilateral consumer-stats 404: POST HTTP ~30s acumulando 404 (lado evolution-stack) e zerar contadores
- [ ] 85.4 Reconciliar drift digest runtime `9b1a5b967` × stack `0f4b07cfb`: redeploy alinhado e digests únicos no Swarm
- [ ] 85.5 Reconciliar labels OCI 2.3.7 × prod 2.4.0: relabel/tag da imagem e verificação `docker inspect`
- [ ] 85.6 Testes de dual-write: dedupe no overlap (mesma mensagem por 2 portas), 0 duplicatas, idempotência
- [ ] 85.7 Corrigir PAUSE_INGEST.md: SQL `evo.evolution_messages` → `zapp.evolution_messages` (tabela vive em zapp) + versão PG 15.8 (não pg14) em todas as fases do runbook
- [ ] 85.8 Primeiro uso registrado do PAUSE_INGEST: pausa ≤30min, 0 msgs perdidas, retomada validada (log no runbook)
- [ ] 85.9 Verificação de telemetria: consumer-stats 200, eventos fluindo, DLQ=0, latência <5min
- [ ] 85.10 Verificação Swarm: digest e label OCI únicos (stack = runtime), 2 réplicas do consumer saudáveis
### Critério de conclusão (checklist da etapa)
- [ ] PR E89 mergeado no evolution-stack com testes verdes
- [ ] consumer.py:239 corrigido e 404 consumer-stats zerado (evidência de runtime)
- [ ] digest `9b1a5b967`×`0f4b07cfb` e labels OCI 2.3.7×2.4.0 reconciliados
- [ ] PAUSE_INGEST sem referência a schema inexistente e com 1 uso registrado

## Etapa 86 — Roles evo_writer/zapp_writer (E53/E54) + congelamento formal evo [APROVAÇÃO]
**Objetivo:** Criar/aplicar as roles de contrato e executar o congelamento formal das tabelas evo (V4-FINAL #75) com decisão dos 115 grants e limpeza de índices, sem nenhum DROP.
**Base:** pendência real findings-13.md itens 9/15 E53/E54 (L117, L123); findings-14.md §8 EVO_RETIREMENT_V4 (L110-112); findings-16.md §3 item 11 (L50); findings-14.md §11 INDICES_CLEANUP (L148).
### Subetapas
- [ ] 86.1 [APROVAÇÃO] Aprovar congelamento formal (COMMENT CONGELADO + REVOKE `authenticated` em ~25 tabelas frias; NUNCA DROP nesta rodada) + janela de manutenção — pré-condição `[⛔]` do EVO_RETIREMENT_V4
- [ ] 86.2 Aplicar E54 no banco: migration de teste de roles (prova SET ROLE negativo/positivo) e registrar em `schema_migrations`
- [ ] 86.3 Verificar/criar roles `evo_writer` e `zapp_writer` (sem evidência de criação em T3) com grants mínimos por consumidor
- [ ] 86.4 Substituir CRUD de `service_role` em evo pelas roles dedicadas (writers externos sem superuser, padrão NOBYPASSRLS + SECURITY DEFINER em ops)
- [ ] 86.5 Decidir os 115 fns evo `EXECUTE` público p/ `authenticated`: REVOKE seletivo vs superfície aceita documentada (lista nominal de consumidores PostgREST)
- [ ] 86.6 Congelar as 27 tabelas evo órfãs/ frias (COMMENT + REVOKE; sem DROP; service_role/crons intocados)
- [ ] 86.7 INDICES_CLEANUP: aplicar `20260815120000_cleanup_evo_webhook_v2_redundant_idx.sql` (13 DROP INDEX CONCURRENTLY IF EXISTS, fora de transação) com pré-checks `idx_scan=0` e `indisunique/indisprimary=false`; NUNCA dropar PK/UNIQUE/suporte de FK
- [ ] 86.8 Revalidar risco E23 (realtime) antes de remover do runbook: congelamento de grants não derruba realtime — medir
- [ ] 86.9 Verificar ambiente MCP: `vps_*`/`ops_runbooks`/`e2e_probe_results` em evo (possível mistura de ambientes) e apontar para canônico
- [ ] 86.10 Monitorar 7 dias pós-congelamento: grants, realtime, crons, DLQ e latência (janela do INDICES_CLEANUP)
### Critério de conclusão (checklist da etapa)
- [ ] E54 aplicada com prova SET ROLE verde; roles `evo_writer`/`zapp_writer` existentes com grants mínimos
- [ ] congelamento executado na janela aprovada (COMMENT + REVOKE), 27 tabelas congeladas sem DROP
- [ ] decisão dos 115 fns registrada (REVOKE seletivo ou superfície aceita)
- [ ] 13 índices dropados com pré-checks e 7 dias de monitoramento sem regressão

## Etapa 87 — Egresso: remover evolution-proxy + decidir evolution-templates [APROVAÇÃO]
**Objetivo:** Aposentar o `evolution-proxy` (4 critérios do ADR-011), migrar `ZappWebbDemoPage`, resolver o 401 do `evolution-templates` e consolidar os 3 DRIFT do RPC_AUDIT, mantendo egresso único via `evolution-api`.
**Base:** pendência real findings-13.md itens 4/5 (L112-113); findings-14.md §1 EGRESS_SURFACE_V4 (L15-18); findings-14.md §3 RPC_AUDIT_V4 (L47).
### Subetapas
- [ ] 87.1 [APROVAÇÃO] Aprovar remoção do `evolution-proxy` (4 critérios do ADR-011 L104-110) e o destino do `evolution-templates` (rotear via gateway × aposentar com banner)
- [ ] 87.2 Migrar `ZappWebbDemoPage.tsx` (único chamador real do proxy) para `evolution-api` com contrato Zod
- [ ] 87.3 Deletar `evolutionClient.ts` + `_archive` associado após migração (verificar 0 importadores)
- [ ] 87.4 Remover `evolution-proxy` do deploy (EGRESS_SURFACE 10 fns → 9) e atualizar ESTADO.md/EGRESS_SURFACE_V4
- [ ] 87.5 `evolution-templates`: corrigir 401 (browser → service-role/cron via gateway) OU aposentar com banner — fim da quebra silenciosa (V4-FINAL #31)
- [ ] 87.6 `evolution-credentials`: remover branch GET morto pós-410 (linhas 167-232) e manter 410 como sentinela
- [ ] 87.7 `evolution-bitrix-sync`: restaurar segredo `bitrix_webhook_url` (R06-07) OU formalizar aposentadoria (hoje 503)
- [ ] 87.8 RPC_AUDIT: consolidar 3 DRIFT (`fn_compute_contact_dedup_hash`, `rpc_get_contact`, `rpc_mark_messages_read`) pelo protocolo E15 — verificar chamadores PostgREST antes de remover assinatura
- [ ] 87.9 Verificação: 0 invokes diretos (E81 mantido), inventory TOTAL=0, egresso browser→Evolution só via `evolution-api`
- [ ] 87.10 Atualizar EGRESS_SURFACE_V4 com superfície congelada pós-remoção e registrar no RETRO_V4
### Critério de conclusão (checklist da etapa)
- [ ] ZappWebbDemoPage roteado via `evolution-api`; `evolution-proxy` fora do deploy e do código
- [ ] `evolution-templates` sem 401 (ou aposentada com banner explícito)
- [ ] 3 DRIFT do RPC_AUDIT consolidados sem quebra de chamadores
- [ ] EGRESS_SURFACE_V4 atualizado; inventory TOTAL=0

## Etapa 88 — Soberania de plataforma (I6) + ADR-016 + P4 versionado
**Objetivo:** Criar o repo `atomica-platform` com GitOps (obs-*.yml, zapp_health_guard, stack destino), corrigir E35/E36, criar o ADR-016 e versionar os resolvers da porta P4.
**Base:** pendência real findings-13.md itens 8/10 (L116, L118); findings-15.md §4 F2 ops.fn_evo_url (L121) e F1 sql-gate (L122); findings-13.md item 13 Fase 0 (L121).
### Subetapas
- [ ] 88.1 Criar repo `atomica-platform` (E26) com estrutura GitOps (stacks, observabilidade, health)
- [ ] 88.2 Gerar `obs-*.yml` por sistema (E28) — depende da decisão de dashboards (CHECKLIST L28)
- [ ] 88.3 Mover `zapp_health_guard` para o repo de plataforma (E30 — hoje segue no evolution-stack)
- [ ] 88.4 Mover `supabase.yml`/`obs-*.yml` para fora do evolution-stack + stack destino (E31-E33) com GitOps aplicado
- [ ] 88.5 Corrigir E35/E36 (gates inversos): deploy pipeline versionado + introspector versão COMMIT_SHA
- [ ] 88.6 E37: criar staging (E9) e executar prova destrutiva OU documentar bloqueio formal (staging inexistente)
- [ ] 88.7 Criar ADR-016 (porta P4 decidida via `ops.fn_provider_call`) e registrar no docs/decouple (INDEP E84 L285)
- [ ] 88.8 Versionar `ops.fn_evo_url()`/`ops.fn_evo_key()` (hoje DB-as-source, zero CREATE no repo) em migration idempotente
- [ ] 88.9 Criar resolvers cloud `ops.fn_cloud_*` + regenerar fixture `sql_report_snapshot.json` (sql-gate 12→25)
- [ ] 88.10 Fechar Fase 0: E6 backup restaurável validado, E10 dashboard 7d, E12 `log_min_duration` — evidências anexadas
### Critério de conclusão (checklist da etapa)
- [ ] `atomica-platform` criado com GitOps; `supabase.yml`/`obs-*.yml` fora do evolution-stack
- [ ] ADR-016 aceito e registrado (porta P4 formalizada)
- [ ] `ops.fn_evo_url`/`fn_evo_key` + `ops.fn_cloud_*` versionados; fixture sql-gate 25/25
- [ ] I6 = PASS no `ops.fn_boundary_audit()` (evidência T2 formal)

## Etapa 89 — Dono único de migrations evo (I7) + verdade documental
**Objetivo:** Concluir a classificação exaustiva do E40, ativar o gate E42, corrigir refs STALE/migrations sem registro e atualizar CLAUDE.md/fixture, tornando I7 PASS.
**Base:** pendência real findings-13.md item 14 I7 residual (L122); findings-16.md §3 itens 4/5 (L43-44); findings-15.md F3 CLAUDE.md (L123) e F1 fixture (L122); findings-16.md §3 itens 9/10 (L48-49).
### Subetapas
- [ ] 89.1 Classificação exaustiva arquivo-a-arquivo do E40: 51+ migrations legadas com DDL `evo.*` (graveyard, movidas ou allowlist)
- [ ] 89.2 Ativar gate E42 (hoje inativo): zero migrations novas `evo.*` fora da allowlist (critério 4 do ADR-015, 30 dias)
- [ ] 89.3 Corrigir 6 refs STALE da baseline E41 no evolution-stack (RELATORIO_FINAL L.53)
- [ ] 89.4 Validar migrations sem registro `20260808280000`/`20260813180000`: aplicar × arquivar com decisão registrada
- [ ] 89.5 Atualizar CLAUDE.md (topologia evo/zapp, Realtime, 136 vs 58 tabelas, regra 4) + docs irmãos contaminados (31-, _HANDOFF/_PROGRESSO)
- [ ] 89.6 Ampliar sql-gate fixture 12→25: adicionar as 5 fns fora do fixture (falsos positivos eliminados)
- [ ] 89.7 Formalizar dependência reversa evo→zapp (`fn_normalize_send_jid` 13x, `is_admin_or_supervisor` 6x) como contrato no BOUNDARY
- [ ] 89.8 `fn_backfill_contact_id`: UPDATE direto em evo (I2=1) — ALLOWED_BYPASS documentado ou correção via `rpc_boundary_*`
- [ ] 89.9 Corrigir 7 views sem `security_invoker` (drift pré-existente; validar/rodar cron autofix e conferir as 11 views da Rota A)
- [ ] 89.10 Verificação final: gate E42 bloqueia nova migration evo; fixture = prod; CLAUDE.md correto; I7 = PASS
### Critério de conclusão (checklist da etapa)
- [ ] 51+ migrations classificadas com veredito por arquivo (graveyard/movida/allowlist)
- [ ] gate E42 ativo e bloqueando; 6 refs STALE corrigidas; 2 migrations sem registro decididas
- [ ] CLAUDE.md e docs irmãos sem premissa invertida; fixture sql-gate 25/25
- [ ] 7 views com `security_invoker=true`; I7 = PASS no boundary audit

## Etapa 90 — Fechar pendências operacionais do desacoplamento (runbooks, índices, crons, baselines)
**Objetivo:** Executar as pendências operacionais remanescentes da onda V4/independência com dono claro e sem decisão de arquitetura pendente.
**Base:** PAUSE_INGEST (SQL referencia evo.evolution_messages inexistente) · INDICES_CLEANUP (13 candidatos) · CRON_FAILURES_7D (job 27 ambíguo, job 138 0 execuções) · 6 refs STALE baseline E41 · drift digest consumer 9b1a5b967×0f4b07cfb · labels OCI 2.3.7×2.4.0 · VAULT cadência vault×swarm×env.
### Subetapas
- [ ] 90.1 Corrigir o runbook PAUSE_INGEST: apontar para as tabelas reais (zapp.evolution_messages) e PG 15.8; validar o SQL em transaction ROLLBACK.
- [ ] 90.2 Executar a revisão sênior da INDICES_CLEANUP_PROPOSTA e aplicar/descartar os 13 candidatos com DDL versionado.
- [ ] 90.3 Confirmar correção do job 27 (função ambígua + estado connecting) e verificar job 138 (0 execuções em 7d).
- [ ] 90.4 Corrigir as 6 refs STALE da baseline E41 no evolution-stack (PR no repo irmão).
- [ ] 90.5 Alinhar digest do consumer runtime (9b1a5b967) com o stack (0f4b07cfb): rebuild + deploy versionado.
- [ ] 90.6 Harmonizar labels OCI 2.3.7 (manifesto) × 2.4.0 (produção): atualizar manifestos e contract.zod.
- [ ] 90.7 Documentar a cadeia vault×swarm×env dos secrets (VAULT_SECRETS_V4 pendência) + verificar 2 secrets no evolution-stack.
- [ ] 90.8 Validar as 2 migrations sem registro (20260808280000/20260813180000) e registrá-las no ledger.
- [ ] 90.9 Rodar o checklist de verificação do schema-registry (evo.json/zapp.json) contra o banco vivo.
- [ ] 90.10 Atualizar SCORECARD/CHECKLIST com as evidências de fechamento.
### Critério de conclusão (checklist da etapa)
- [ ] PAUSE_INGEST validado em ROLLBACK no banco real
- [ ] Índices decididos com DDL registrado
- [ ] Jobs 27/138 saudáveis em pg_cron (7 dias)
- [ ] Baseline E41 sem refs STALE e digest alinhado
- [ ] Evidências registradas no SCORECARD


---

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
