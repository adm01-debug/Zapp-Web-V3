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
