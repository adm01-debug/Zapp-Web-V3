# Plano de Ação — Edge Functions

**Complementa:** `AUDITORIA-ZAPP-SELFHOSTED-2026-08-01.md`, `ADENDO-RESIDUOS-LOVABLE-CLOUD-2026-08-01.md`, `ADENDO-II-EDGE-FUNCTIONS-2026-08-01.md`
**Escopo:** as 127 Edge Functions do ecossistema ZAPP
**Data:** 01/08/2026

---

## Diagnóstico em uma frase

Não existe fonte de verdade para o que roda em produção. O repositório não descreve o self-hosted, o self-hosted não tem 8 funções que só existem no cloud, o cloud continua vivo com credenciais válidas, e o gate de autenticação está desligado nos dois lados.

## Estado atual

| | Qtd |
|---|---|
| Funções no repositório (`main`) | 127 |
| Deployadas no Lovable Cloud | 127 |
| Deployadas no self-hosted | 119 |
| **Ausentes no self-hosted** | **8** |
| **Divergentes repo ↔ self-hosted** | **117 de 119** |
| Produção à frente do Git | 30 |
| Git à frente da produção | 87 |
| Com gate de autenticação na aplicação | **11 de 119** |
| Vulnerabilidade com exploração confirmada | 1 (`external-db-proxy`) |

## Princípio que orienta o plano

**Produção é a fonte de verdade até prova em contrário.** Há 51 KB de `evolution-api` rodando que não existem no Git. Qualquer plano que comece por "deploy do `main`" destrói produção. A sequência correta é: congelar → extrair → reconciliar → só então deployar.

## Regra inviolável enquanto o plano não chegar na Fase E3

> **NÃO executar `supabase functions deploy` global, nem redeploy da stack 35 que sobrescreva `/home/deno/functions`.**
> Isso regride 87 funções para versões antigas e apaga o código não commitado das outras 30.

---

# FASE E0 — Contenção (hoje, 2–4h)

Objetivo: parar o sangramento sem tocar em código.

### E1. Bloquear `external-db-proxy` no self-hosted
Único achado com exploração confirmada (leitura do banco de produção sem token, com `service_role`).

Opção A (mais rápida, reversível): remover a rota no Kong.
Opção B: substituir `/home/deno/functions/external-db-proxy/index.ts` pela v1.8 do repositório e reiniciar o edge-runtime.

Preferir A. B introduz uma mudança de código sem a Fase E1 concluída.

**Validação:** `POST` sem `Authorization` deve retornar 401/404, não 200.

### E2. Sondar `external-db-bridge` com a mesma metodologia
Mesma família, também divergente (repo 14.730 → deployado 7.206). Não assumir que está seguro.

### E3. Bloquear `e2e-fixtures` e `e2e-webhook-fixture` nos dois ambientes
Endpoints de fixture de teste, públicos. Criam e destroem dados por design.

### E4. Deletar `migrate-helper` do Lovable Cloud
Expõe `service_role` + `db_url` atrás de uma chave estática já comprometida.

### E5. Rotacionar credenciais do projeto `uqysyzndkfiwfztbqvsl`
`SERVICE_ROLE_KEY`, `ANON_KEY` e senha do Postgres. Efeito colateral desejado: as 127 funções do cloud perdem acesso ao self-hosted.

### E6. Desativar o cron `sicoob-outbox-drain` no Lovable Cloud
```sql
SELECT cron.unschedule('sicoob-outbox-drain');
```
61 invocações/hora com 0% de sucesso desde o cutover.

### E7. Auditar logs de invocação do cloud
Filtrar `migrate-helper?action=credentials` e `external-db-proxy` POST. Invocações anteriores a 01/08/2026 11:00 não são da auditoria.

**Gate E0 → E1:** nenhum endpoint público retorna dados de produção sem autenticação.

---

# FASE E1 — Estabelecer a fonte de verdade (1–2 dias)

Objetivo: trazer produção para o Git sem perder nada. Nenhum deploy nesta fase.

### E8. Congelar deploys
Comunicar ao time. Nenhum `functions deploy`, nenhum redeploy da stack 35 até a Fase E3.

### E9. Localizar o storage das funções no self-hosted
```bash
docker service inspect supabase_functions --format '{{json .Spec.TaskTemplate.ContainerSpec.Mounts}}'
```
Identificar se `/home/deno/functions` é bind mount, volume nomeado ou baked na imagem. Isso determina como o deploy realmente acontece hoje — informação que hoje ninguém tem documentada.

### E10. Extrair as 119 funções do container
```bash
docker exec <supabase_functions> tar czf - -C /home/deno functions \
  > /tmp/prod-functions-$(date +%Y%m%d).tgz
```
Guardar o tarball como artefato imutável antes de qualquer outra coisa.

### E11. Criar a branch `prod-snapshot`
Descompactar sobre `supabase/functions/` em uma branch limpa a partir de `main`, commitar como está — sem lint, sem format, sem "melhorias". O commit precisa ser um espelho fiel de produção.

### E12. Gerar o diff canônico
```bash
git diff main..prod-snapshot -- supabase/functions/ > docs/edge/drift-2026-08-01.diff
git diff --stat main..prod-snapshot -- supabase/functions/
```
Este arquivo é o insumo da Fase E2.

### E13. Extrair também `_shared/`
54 arquivos, incluindo `auth.ts`, `hmac-validation.ts`, `webhook-idempotency.ts`, `rate-limiter.ts`. Há `.bak` e `.bak_deploy_*` no diretório deployado — sinal de edição manual em produção. Precisam entrar no diff.

### E14. Extrair as 8 funções exclusivas do Lovable Cloud
`health`, `mcp`, `metrics`, `migrate-helper`, `nps-scheduler`, `sicoob-outbox-consumer`, `talkx-add-recipients`, `talkx-control`.

Comparar a versão do cloud com a do repositório. Se divergirem, decidir qual vale antes de deployar no self-hosted.

**Gate E1 → E2:** existe um commit que reproduz produção byte a byte e um diff auditável contra o `main`.

---

# FASE E2 — Reconciliação função a função (3–5 dias)

Objetivo: decidir, para cada uma das 117, qual versão vale. É trabalho de julgamento, não automatizável.

### E15. Classificar as 117 em quatro baldes

| Balde | Critério | Ação |
|---|---|---|
| **A — Produção vence** | Deployado tem código legítimo posterior ao commit (30 casos, ex.: `evolution-api` +51 KB) | Merge de `prod-snapshot` → `main` |
| **B — Repo vence** | Commit tem correção de segurança/bug que nunca subiu (ex.: `external-db-proxy` v1.8) | Deploy do `main` na Fase E3 |
| **C — Merge necessário** | Ambos evoluíram em direções diferentes | Resolução manual, com teste |
| **D — Ruído** | Diferença só de formatação, comentário ou build artifact | Normalizar, sem risco |

### E16. Priorizar por criticidade, não por tamanho do diff
Ordem sugerida:
1. Caminhos de autenticação: `webauthn`, `approve-password-reset`, `login-attempts`, `create-user`, `detect-new-device`
2. Acesso a dados: `external-db-proxy`, `external-db-bridge`, `public-api`, `analyze-external-db`
3. Webhooks: `evolution-webhook`, `whatsapp-cloud-webhook`, `whatsapp-webhook`, `gmail-webhook`, `elevenlabs-webhook`
4. Núcleo operacional: `evolution-api`, `evolution-sender`, `ai-router`
5. O resto

### E17. Tratar `evolution-api` como projeto próprio
64.389 bytes deployados contra 13.292 no Git. 51 KB de lógica de integração WhatsApp fora de controle de versão. Merecem revisão dedicada, não um `git checkout`.

### E18. Documentar cada decisão
Uma linha por função em `docs/edge/reconciliacao-2026-08.md`: balde, decisão, justificativa, quem decidiu. Sem isso a próxima auditoria refaz o trabalho.

### E19. Resolver `_shared/` primeiro
As 119 funções dependem dele. Reconciliar `_shared` antes das funções, ou o merge de cada função vai brigar com a lib.

### E20. Eliminar os `.bak` de produção
`evolution-helpers.ts.bak-conn-resolver-20260705`, `schemas.ts.bak_deploy_1784666519`, `webhook-schemas.ts.bak_20260711`. Confirmar que não são importados e remover.

**Gate E2 → E3:** `main` reflete a decisão consciente sobre as 127 funções. Zero diff não resolvido.

---

# FASE E3 — Autenticação (2–3 dias, depois do gate E2)

Objetivo: religar o gate. Não antes — ativar JWT com o código atual quebra os webhooks.

### E21. Classificar as 127 por modelo de autenticação exigido

| Modelo | Quem | Gate |
|---|---|---|
| JWT de usuário | maioria das funções chamadas pelo front | `verify_jwt` + `requireUser` |
| HMAC de webhook | `evolution-webhook`, `whatsapp-cloud-webhook`, `whatsapp-webhook`, `elevenlabs-webhook`, `gmail-webhook` | assinatura + `*_WEBHOOK_SECRET` |
| Segredo de cron | `cleanup-*`, `auto-*`, `queue-rebalance`, `nps-scheduler`, `sicoob-outbox-consumer`, `talkx-scheduler` | `CRON_SECRET` |
| Público por design | `email-track-pixel`, `email-track-link`, `whatsapp-cloud-webhook-verify`, `health-check`, `status` | nenhum, mas sem dado sensível |
| Service-to-service | `sla-alert-forward`, `sicoob-bridge` | token dedicado |

Hoje **108 de 119 não têm nenhum desses**.

### E22. Provisionar `JWT_SECRET` no edge-runtime
Mesmo segredo do GoTrue/PostgREST, como Docker secret externo. Sem ele, ativar `VERIFY_JWT` transforma tudo em 401.

### E23. Corrigir `VERIFY_JWT`
De `"false"` (com aspas, o que faz `=== 'true'` nunca casar) para `true` sem aspas.

### E24. Implementar a allowlist em `main/index.ts`
O runtime self-hosted **não lê `config.toml`**. A allowlist precisa viver no código:

```ts
const PUBLIC_FNS = new Set([
  'evolution-webhook','whatsapp-webhook','whatsapp-cloud-webhook',
  'whatsapp-cloud-webhook-verify','elevenlabs-webhook','gmail-webhook',
  'email-track-pixel','email-track-link','login-attempts',
  'health-check','status',
]);

const fnName = pathname.split('/')[1];
if (req.method !== 'OPTIONS' && VERIFY_JWT && !PUBLIC_FNS.has(fnName)) {
  // verificar JWT
}
```

A lista deve sair da classificação da E21, não deste exemplo.

### E25. Provisionar os secrets de webhook
`EVOLUTION_WEBHOOK_SECRET(S)`, `EVOLUTION_WEBHOOK_STRICT`, `WHATSAPP_CLOUD_APP_SECRET`, `WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN`, `ELEVENLABS_WEBHOOK_SECRET`, `WEBHOOK_SECRET`, `SLA_ALERT_WEBHOOK_SECRET`, `CRON_SECRET`.

Sem eles, as funções da allowlist ficam sem gate nenhum — trocar um buraco por outro.

### E26. Provisionar os 70 secrets ausentes
Ver etapas 12–16 do plano principal. Validar com:
```bash
docker exec <fn> sh -c 'cd /home/deno/functions && \
  grep -rhoE "Deno\.env\.get\([\"'"'"'][A-Z0-9_]+[\"'"'"']\)" . \
  | grep -oE "[A-Z0-9_]{3,}" | sort -u > /tmp/req; \
  env | cut -d= -f1 | sort -u > /tmp/have; comm -23 /tmp/req /tmp/have'
```
Meta: saída vazia.

### E27. Deploy conjunto de E22–E26
Um único deploy atômico. Ativar `VERIFY_JWT` sem a allowlist derruba os webhooks; ativar a allowlist sem os secrets deixa os webhooks sem gate.

### E28. Suíte de validação pós-deploy
- Função fora da allowlist, sem token → **401**
- Função da allowlist, sem token → **≠401**
- Webhook com HMAC inválido → **401/403**
- Webhook com HMAC válido → **2xx**
- Login pelo front → funcional
- Recebimento de mensagem WhatsApp ponta a ponta → funcional

### E29. Adicionar `requireUser` às funções do balde "JWT de usuário"
Defesa em profundidade. `verify_jwt` valida assinatura mas não autoriza; funções que dependem de `auth.uid()` precisam do gate de aplicação.

**Gate E3 → E4:** as seis validações da E28 passam.

---

# FASE E4 — Completar e desligar (2 dias)

### E30. Deployar as 8 funções ausentes no self-hosted
Com a versão decidida na E14 e os secrets da E26.

### E31. Restaurar o fluxo SICOOB ponta a ponta
1. `sicoob-outbox-consumer` deployada
2. `SICOOB_GIFTS_URL` e `SICOOB_GIFTS_BRIDGE_SECRET` provisionados
3. Cron recriado no self-hosted apontando para `supabase.atomicabr.com.br`
4. Teste: inserir mensagem → trigger → outbox → drenagem → entrega

Medir o backlog acumulado antes de ligar.

### E32. Remover `migrate-helper` e as fixtures do repositório
`supabase/functions/migrate-helper/`, `e2e-fixtures/`, `e2e-webhook-fixture/` e as seções correspondentes do `config.toml`. Rodar secret scanning no histórico — a `ACCESS_KEY` está commitada.

### E33. Desligar as Edge Functions do Lovable Cloud
Após E5 elas já não alcançam o self-hosted. Remover ou despublicar o projeto para eliminar a superfície restante.

### E34. Corrigir o cabeçalho do `config.toml`
Cita o ref `allrjhkpuscmgbsnmjlv`, que não é o ativo (`uqysyzndkfiwfztbqvsl`). Adicionar aviso explícito:

```toml
# ATENÇÃO: o runtime self-hosted NÃO lê verify_jwt deste arquivo.
# A fonte de verdade é a allowlist em supabase/functions/main/index.ts.
# Este bloco só tem efeito em deploys para Supabase Cloud.
```

---

# FASE E5 — Pipeline e prevenção de drift (1 semana)

Sem isto, o drift volta em semanas.

### E35. Criar o pipeline de deploy versionado
Deploy só a partir de tag/commit, nunca de arquivo editado à mão. Registrar em cada deploy: commit SHA, timestamp, autor, funções afetadas.

### E36. Endpoint de introspecção de versão
Cada função expõe o commit SHA que a originou (via variável de build). Permite comparar produção com Git sem `docker exec`.

### E37. CI: verificação de drift
Job diário que compara hash de cada `supabase/functions/*/index.ts` com o deployado e falha ao divergir. É o controle que impede a reincidência.

### E38. CI: completude de ambiente
`grep Deno.env.get` no código vs `supabase/functions/.env.required` declarado. Falha se houver variável usada e não declarada.

### E39. CI: smoke test de autenticação
Fora da allowlist sem token → 401. Na allowlist → ≠401. Roda a cada deploy.

### E40. Remover acesso de escrita direta ao `/home/deno/functions`
Enquanto for possível editar produção com `docker exec`, o drift é inevitável. O diretório deve ser populado só pelo pipeline.

### E41. Branch protection em `zapp-web-v3`
PR obrigatório + checks E37/E38/E39 verdes antes de merge em `main`. É pré-requisito para tudo acima ser durável — o padrão histórico de correção aplicada seguida de regressão silenciosa se repete sem isso.

---

## Sequenciamento e risco

| Fase | Duração | Risco se pular |
|---|---|---|
| E0 Contenção | 2–4h | Banco de produção aberto |
| E1 Fonte de verdade | 1–2 dias | Perda de 51 KB de `evolution-api` no primeiro deploy |
| E2 Reconciliação | 3–5 dias | Deploy regride 87 funções |
| E3 Autenticação | 2–3 dias | 108 endpoints sem gate |
| E4 Completar | 2 dias | SICOOB, NPS e TalkX seguem quebrados |
| E5 Pipeline | 1 semana | Drift volta |

**Caminho crítico:** E1 → E2 → E3. Não há atalho. E0 pode rodar em paralelo com E1.

## Critérios de aceite

- [ ] Nenhum endpoint retorna dados de produção sem autenticação
- [ ] `git diff main..produção` para `supabase/functions/` = vazio
- [ ] 127/127 funções deployadas no self-hosted
- [ ] 0 funções ativas no Lovable Cloud
- [ ] `grep Deno.env.get` vs `env` no container = 0 ausentes
- [ ] Suíte E28 passa integralmente
- [ ] SICOOB drenando no self-hosted
- [ ] CI E37/E38/E39 verdes e obrigatórios
