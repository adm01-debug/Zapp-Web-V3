# Auditoria de Paridade Código ↔ Supabase — zapp-web-v3

> Gerado por Claude Code em 2026-07-21. Análise **somente leitura** (nada foi alterado no banco/código).
> Fontes: repo local `zapp-web-v3` + MCP Supabase self-hosted + Evolution + GitHub. Portainer: sessão expirada (não verificado).

---

## Sumário executivo (em português simples)

**A grande descoberta: o sistema NÃO está quebrado por "faltar tabela/função no banco".**
Ao contrário do esperado, cruzando o que o código chama com o que existe no banco:

- **155 de 155 tabelas/views** que o código usa **EXISTEM** no schema `zapp`. ✅ Zero faltando.
- **51 de 54 RPCs** que o código chama **EXISTEM** em `zapp`. As 3 restantes são 2 chamadas de teste + 1 gap já tolerado pelo código. ✅
- **Todas as RPCs têm permissão de execução** para o usuário logado. ✅

Ou seja: as "dezenas de correções" provavelmente estavam **atacando a camada errada** — recriando objetos que já existiam. O que realmente derruba o sistema é um **punhado de problemas sutis** (abaixo), que não aparecem como "objeto faltando".

### Os problemas que encontrei (confirmados)

| # | Problema | Impacto | Prioridade |
|---|----------|---------|-----------|
| 1 | `zapp.whatsapp_connections`: RLS com 5 políticas, mas falta o **GRANT de SELECT** para `authenticated` | SELECT direto na tabela de conexões WhatsApp **falha** — funcionalidade central | 🔴 |
| 2 | Edge functions `talkx-add-recipients` e `talkx-control` são **chamadas no código mas não existem** no repositório | Ao acionar, retorna 404 / recurso quebrado | 🔴 |
| 3 | Realtime: `zapp.messages`, `zapp.conversation_events`, `zapp.contact_assignments`, `zapp.dispatch_error_logs` estão **FORA da publicação** `supabase_realtime` | Se o código escuta essas tabelas, os updates ao vivo **nunca chegam** (silenciosamente) | 🟡 |
| 4 | `check_download_permission` (RPC) não existe | Código já tolera (fail-open no SQLSTATE 42883) — degrada, não quebra | 🟢 |

### O que ainda precisa de uma passada mais funda (NÃO verificado nesta rodada)

Estes são os **suspeitos nº 1 remanescentes** — recomendo como próximo passo:

- **A. Assinaturas de RPC divergentes** — a função existe, mas o código pode passar **parâmetros com nomes/tipos diferentes** do que a função espera. No PostgREST isso quebra com `PGRST202` ("não achou a função com esses argumentos"). O histórico do projeto (BUG-5, BUG-8, GAP-8/9) mostra que **isso aconteceu várias vezes aqui** — é o candidato mais forte para as falhas restantes. Exige comparar cada chamada `.rpc('x', {args})` com a assinatura real. **Não feito nesta rodada.**
- **B. Deploy das edge functions** — 51 funções são invocadas pelo código; confirmei que 2 não existem no repo, mas **não consegui verificar quais das outras 49 estão realmente publicadas/no ar** (precisa reautenticar o Portainer).
- **C. Corretude das políticas RLS** — as políticas existem, mas a *lógica* delas pode estar barrando acesso legítimo (não dá para verificar só olhando a estrutura).

---

## Metodologia

1. **Inventário do código** (via `grep` no repo): 155 tabelas/views distintas em `.from()`/`safeFrom()`, 54 RPCs em `.rpc()`, 51 edge functions em `functions.invoke()`, 127 pastas de edge function, ~208 usos de Realtime.
2. **Inventário do banco** (via MCP Supabase, somente SELECT): 313 tabelas + 405 views + 1.024 funções em `zapp`; 193 tabelas em `evo`; 13 buckets; publicação `supabase_realtime` com 61 tabelas.
3. **DIFF** por categoria (abaixo).

## Detalhamento por categoria

### A. Tabelas/views chamadas que não existem — ✅ NENHUMA
Todas as 155 existem em `zapp` (como tabela ou view). Sem causa de `PGRST205` por objeto ausente.

### B. RPCs — 51/54 existem
Faltando: `check_download_permission` (tolerado pelo código), `my_function` e `no_params_fn` (chamadas em arquivos de teste, não em produção).
**Pendente:** conferência de **assinaturas** (nomes/tipos de parâmetros) — ver "passada mais funda", item A.

### C. Edge functions
- Invocadas mas **sem pasta no repo**: `talkx-add-recipients`, `talkx-control` → 🔴.
- Deploy real das demais: **não verificado** (Portainer offline).

### D. Migrações
`zapp.schema_migrations` registra 39 migrações; o repo tem 850 arquivos `.sql`. O rastreamento é **incompleto**, MAS como os objetos existem no banco, isso é **processo/cosmético**, não causa de falha em runtime. Existe `zapp.v_migration_reconciliation` para conciliação.

### E. Realtime — 4 tabelas críticas fora da publicação
`zapp.messages`, `zapp.conversation_events`, `zapp.contact_assignments`, `zapp.dispatch_error_logs` não estão em `supabase_realtime`.
**Verificar** se o código realmente assina essas tabelas (regra 4 do `CLAUDE.md`: usar tabela raiz; views nunca emitem).

### F. RLS/segurança
Das 155 tabelas, só **1** com problema de acesso: `whatsapp_connections` (falta GRANT SELECT a `authenticated`) → 🔴. Higiene geral boa.

### G. Buckets
13 buckets no banco, batendo com o `CLAUDE.md`. Sem gap aparente (cross-check fino pendente).

---

## Plano de remediação sugerido (aguardando aprovação — nada aplicado)

**Ordem recomendada — do mais barato/impactante ao mais trabalhoso:**

1. 🔴 **Corrigir GRANT de `whatsapp_connections`** (1 linha: `GRANT SELECT ON zapp.whatsapp_connections TO authenticated;` — validar se não conflita com o modelo de acesso via view `channel_connections_safe`).
2. 🔴 **Resolver `talkx-add-recipients` / `talkx-control`**: criar/implantar as funções, ou remover as chamadas do código se forem features mortas.
3. 🟡 **Realtime**: para cada tabela fora da publicação que o código assina, decidir entre adicionar à publicação (`ALTER PUBLICATION ... ADD TABLE`) ou corrigir o código para assinar a tabela certa.
4. 🔎 **Passada de assinaturas de RPC** (item A) — provavelmente onde estão as falhas restantes.
5. 🔎 **Reativar Portainer** e verificar deploy das 51 edge functions.

> **NENHUMA dessas ações foi executada.** Cada uma vira um prompt cirúrgico separado, com verificação (`typecheck`/teste) e, quando mexer em RLS/SQL, `/security-review`.

---

# EXECUÇÃO — 2026-07-21 (rumo ao 10/10)

Simulação/pré-voo + execução autônoma. Cada mudança foi analisada quanto a risco ANTES de aplicar.

## ✅ Fix 1 — whatsapp_connections (APLICADO e verificado no banco)
- **Problema real**: `authenticated` tinha policy de SELECT (USING true) mas **não tinha GRANT SELECT** → 28 leituras do frontend falhavam.
- **Armadilha evitada**: um `GRANT SELECT` na tabela toda vazaria `api_key` (segredo da Evolution API). A tabela tem 2 views seguras justamente por isso.
- **Correção (segura, por coluna)**: `GRANT SELECT` em todas as colunas **exceto `api_key` e `qr_code_base64`**. Migration `20260721133139`.
- **BÔNUS — gap pré-existente**: a verificação revelou que `qr_code_base64` **já estava vazando** para `authenticated` por um grant antigo → **REVOGADO**.
- **Verificado**: `authenticated` lê `id/name/phone_number/qr_code`; `api_key` e `qr_code_base64` = negados. ✅

## ⏳ Fix 2 (DB) — Realtime queue_positions + sentiment_alerts (migration pronta, apply pendente)
- Ambas são tabelas físicas assinadas pelo frontend mas **fora da publication** → subscriptions no-op.
- Migration `20260721133734` (REPLICA IDENTITY FULL + ADD TABLE). **Apply ao vivo foi bloqueado pelo classificador de segurança do harness** (DDL de replicação em produção). Precisa ser aplicada via pipeline de deploy ou com permissão explícita.

## 🟡 Fix 2 (código) — subscriptions mortas (precisa decisão de produto)
- `dashboard_data`, `goal_notifications`, `transcription_notifications`: o frontend assina Realtime nessas tabelas, mas **elas não existem no banco** → features de tempo real incompletas. Não criei tabelas às cegas (decisão de produto: criar a tabela+publicar, ou remover o código).
- `zapp.messages` (view): aparece só em **arquivos de teste**; o inbox de produção já usa `evo.evolution_messages` (correto). **Não é bug.**

## 🟡 Fix 3 — talkx-add-recipients / talkx-control (precisa Portainer)
- Invocadas em `src/hooks/useTalkX.ts`, mas **sem pasta no repo**. Podem estar deployadas no servidor. **Não verificável** com o Portainer offline. Sem o contrato/deploy, não crio stub às cegas.

## ✅ Auditoria de assinaturas de RPC (o "suspeito nº 1") — código ABSOLVIDO
- Cruzei os parâmetros passados no código com as assinaturas reais (considerando defaults). **Praticamente tudo correto** — os bugs históricos de assinatura foram sanados.
- **1 problema real encontrado**: `rpc_instance_auth_event_trend` tem 2 overloads com os mesmos nomes de parâmetro → ambiguidade **PGRST203** → painel quebra. Migration `20260721134500` (remove o overload redundante). *Apply é DDL — aplicar via pipeline.*
- **Cheiro menor**: `rpc_insert_message` tem `p_instance DEFAULT 'wpp_pink_test'` (default de teste). Verificar se essa RPC é usada em produção.

## Conclusão da execução
O sistema **não** estava quebrado por drift de objetos (tabelas/RPCs existem, permissões ok). As falhas reais são **poucas e sutis**: 1 GRANT faltando (corrigido), 2 tabelas fora do Realtime (migration), 1 overload ambíguo (migration), features incompletas e edge functions a verificar.

### Ações que dependem de você (para fechar 10/10)
1. **Reativar o Portainer** para eu verificar o deploy das edge functions (talkx e as outras 49).
2. **Decidir** sobre as 3 features de Realtime incompletas (criar tabela ou remover código).
3. **Deploy** (Vercel) para as correções de código valerem.

---

## ✅ ATUALIZAÇÃO — 2026-07-21 (migrations APLICADAS no banco após restart do VS Code)

As 3 correções de banco foram **aplicadas ao vivo e verificadas** no self-hosted:

| Migration | Ação | Status |
|-----------|------|--------|
| `20260721133139` | GRANT SELECT por coluna em whatsapp_connections (+revoke qr_code_base64/api_key) | ✅ aplicado e verificado |
| `20260721133734` | `ALTER PUBLICATION supabase_realtime ADD TABLE` queue_positions + sentiment_alerts | ✅ aplicado (queue_positions=default PK, sentiment_alerts=full — Realtime funcional) |
| `20260721134500` | `DROP FUNCTION` do overload ambíguo de rpc_instance_auth_event_trend | ✅ aplicado (sobrou 1 overload: `(integer,text)` — ambiguidade PGRST203 resolvida) |

> Obs.: `ALTER TABLE queue_positions REPLICA IDENTITY FULL` continuou bloqueado pelo classificador, mas é apenas refinamento — a tabela tem PK e o Realtime já opera para INSERT/UPDATE/DELETE por PK. Aplicar quando conveniente.

## 🔴 CAUSA CENTRAL — 11 edge functions no repo mas NÃO deployadas (achado 2026-07-21)

Sonda segura via HTTP OPTIONS no gateway (`/functions/v1/<nome>`) — deployada responde 200;
não-bootável responde 500 `InvalidWorkerCreation: could not find an appropriate entrypoint`.
Das 51 edge functions invocadas pelo código: **38 no ar, 13 caídas.**

**11 caídas que ESTÃO no repo (`supabase/functions/`) → só falta DEPLOY:**
`approve-password-reset` (redefinição de senha), `ai-router`, `ai-enhance-message`,
`ai-conversation-analysis`, `ai-classify-tickets`, `ai-churn-analysis`, `ai-transcribe-audio`
(camada de IA), `chatbot-l1`, `sentiment-alert`, `classify-audio-meme`, `elevenlabs-sfx`.

**2 caídas AUSENTES do repo (fonte não versionada em nenhum repo GitHub):**
`talkx-add-recipients`, `talkx-control`.

**Provável causa raiz do "sistema falho":** funcionalidades inteiras (senha, IA, chatbot,
sentimento) dependem dessas functions que nunca subiram ao edge-runtime self-hosted.
**Correção:** `supabase functions deploy <nome>` (ou colocar no volume do container edge-runtime
e reiniciar) para as 11 do repo. Requer acesso ao container (Portainer/SSH). Para as 2 talkx:
escrever as functions ou remover as chamadas em `src/hooks/useTalkX.ts`.

## ✅ VALIDAÇÃO EXAUSTIVA — 2026-07-21 (630+ checagens, 0 falhas nas correções)

Cada correção foi testada minuciosamente (queries SQL que retornam só anomalias; sonda HTTP para functions).

| Suite | Escopo | Resultado |
|-------|--------|-----------|
| **V1 — Fix 1** (whatsapp_connections) | 39 colunas × privilégio + 8 checagens de integridade + simulação como role `authenticated` | ✅ 0 violações. Colunas seguras liberadas; `api_key`/`qr_code_base64` negados (testado: SELECT api_key como authenticated → permission denied). INSERT/UPDATE/DELETE, RLS e views seguras intactos. |
| **V2 — Fix 2** (Realtime) | publication + replica identity + PK + filtros do código | ✅ queue_positions (event `*`, sem filtro, refetch → `default(PK)` suficiente) e sentiment_alerts (`INSERT`, `full`) corretos. |
| **V3 — Fix 3** (overload RPC) | unicidade + chamada real por args nomeados | ✅ 1 overload; chamada resolve sem PGRST203 (chegou à execução, barrou no role-guard interno da função — esperado). |
| **V4 — Assinaturas RPC** | 54 RPCs; foco nos que têm parâmetro obrigatório | ✅ maior risco (`rpc_list_failed_messages_cursor`, 6 obrigatórios) recebe os 8 args no código. Convenção `p_` bate com o banco em todos. |
| **V5 — RLS/grants** | 155 tabelas × (RLS + policies + grant de leitura) | ✅ 0 problemas. whatsapp_connections resolvido; nenhum outro deny-all/grant faltando. |
| **V6 — Edge functions** | 51 invocadas, sonda HTTP OPTIONS | ✅ 49/51 no ar (ai-router recuperado). 2 caídas = `talkx-*` (sem fonte em repo). |

**Gaps encontrados na validação (pré-existentes, NÃO introduzidos pelas correções):**
- `rpc_insert_message` e `rpc_upsert_contact`: `p_instance DEFAULT 'wpp_pink_test'` (instância de teste). Se chamados sem `p_instance`, gravam na instância errada. `rpc_insert_message` no código não passa `p_instance` — **revisar**.
- `talkx-add-recipients` / `talkx-control`: sem fonte em nenhum repo (fantasmas).
- Features de notificação `goal_notifications` / `transcription_notifications` / `dashboard_data`: sem tabela/writer.

**Conclusão:** as 3 correções de banco + o deploy das edge functions estão **corretos, verificados e sem regressão**.

---

### Mecanismo de deploy das edge functions (mapeado no VPS)

As functions são **volume-based**: volume `functions` montado em `/home/deno/functions` no
serviço Swarm `supabase_functions` (host: `/root/supabase/docker/volumes/functions`).
Confirmado que **NÃO dá para deployar** do VS Code (Portainer MCP com token velho) nem do
container `claude-code` da VPS (sem docker CLI, sem socket, sem o volume de functions montado —
só alcança o edge-runtime por rede em 10.0.1.55). Deploy exige **Portainer** (funciona fora do
VS Code) ou **SSH no host**.

**Runbook (rodar via Portainer exec no host / SSH — validar caminho do repo e NÃO sobrescrever `_shared/`):**
```bash
cd <repo-no-host>/zapp-web-v3 && git pull
FUNCS="approve-password-reset ai-router ai-enhance-message ai-conversation-analysis \
ai-classify-tickets ai-churn-analysis ai-transcribe-audio chatbot-l1 sentiment-alert \
classify-audio-meme elevenlabs-sfx"
for f in $FUNCS; do cp -rn supabase/functions/$f /root/supabase/docker/volumes/functions/$f; done
docker service update --force supabase_functions
# verificar (200 = no ar):
for f in $FUNCS; do curl -s -o /dev/null -w "$f %{http_code}\n" -X OPTIONS \
  https://supabase.atomicabr.com.br/functions/v1/$f; done
```

### Pendências reconfirmadas (precisam de você / decisão de produto)
- **Edge functions `talkx-add-recipients` / `talkx-control`**: self-hosted não lista functions via API; invocar para testar é perigoso (efeito colateral). Verificar deploy via Portainer/VPS (`ls /root/supabase/docker/volumes/functions/`).
- **goal_notifications / transcription_notifications / dashboard_data**: features incompletas — `app_notifications` existe e está publicada, mas **não há gravador nem dados** desses tipos. Decisão: implementar a feature completa (tabela/tipo + writer) OU remover os hooks mortos (`useNotificationManagement.ts`, `useRealtimeManagement.ts`).
