# 🔬 Auditoria Exaustiva — Evolution API + Banco de Dados (Sessão 6 — eventos de webhook + GlitchTip)

> **Nota:** uma sessão paralela produziu, no mesmo dia, um relatório mais profundo também
> chamado "Sessão 6" — [`EVOLUTION_API_AUDIT_2026-07-05_sessao6.md`](./EVOLUTION_API_AUDIT_2026-07-05_sessao6.md)
> — que encontrou e corrigiu a causa-raiz do falso-positivo de status "conectado"
> (`fn_apply_connection_update` sem debounce) e reabriu alertas críticos fechados
> indevidamente. Este documento cobre um escopo diferente e complementar (drift de
> inscrição de eventos do webhook nativo, GlitchTip, e o comparativo com a documentação
> oficial upstream) — nenhum dos dois achados conflita com o outro; renomeado para evitar
> colisão de nome de arquivo.

> **Data:** 2026-07-05 (~00:20–01:10 UTC)
> **Escopo:** Evolution API na VPS (Docker Swarm/Portainer), Supabase self-hosted (PG15, schemas
> `evo`/`zapp`), pipeline RabbitMQ → consumer → Edge Function, GlitchTip, documentação oficial
> upstream (`docs.evolutionfoundation.com.br`, `github.com/evolution-foundation/evolution-api`).
> **Método:** recon direto via MCP (Portainer, Evolution API, Supabase self-hosted), leitura de
> logs de produção ao vivo, leitura do código-fonte deste repo (`supabase/functions/evolution-webhook`
> e `_shared/*`), cruzamento com as sessões 1–5 antes de qualquer mudança (nenhum achado desta sessão
> foi tratado como novo sem antes conferir se já havia sido corrigido/decidido).
> **Relatórios anteriores:**
> [`scorecard`](./EVOLUTION_API_AUDIT_2026-07-04_scorecard.md) ·
> [`sessão 5`](./EVOLUTION_API_AUDIT_2026-07-04_sessao5.md) ·
> [`sessão 5 (wpp2)`](./EVOLUTION_API_AUDIT_2026-07-04_sessao5_wpp2.md) ·
> [`FMEA sessão 5`](./EVOLUTION_API_FMEA_2026-07-04.md)

---

## 0. TL;DR

**Corrigido e verificado nesta sessão:**

| # | Achado | Correção | Verificação |
|---|--------|----------|-------------|
| 1 | 🔴 **Drift do webhook nativo**: `wpp2` e `wpp_pink_test` estavam inscritas em apenas **15/26 eventos** documentados — faltavam `QRCODE_UPDATED`, `LOGOUT_INSTANCE`, `STATUS_INSTANCE`, `APPLICATION_STARTUP`, `MESSAGES_SET`, `SEND_MESSAGE`, `SEND_MESSAGE_UPDATE`, `CONTACTS_SET`, `CHATS_SET`. O handler de `qrcode.updated` já existe em `supabase/functions/evolution-webhook/index.ts:176-183` e nunca disparava por falta do evento na inscrição. | `evo_set_webhook` reaplicado nas duas instâncias com a lista completa de 26 eventos (mesma URL/secret/webhookByEvents já configurados — mudança aditiva, sem downtime) | Resposta 201 de ambas as instâncias confirmando os 26 eventos ativos |
| 2 | 🟠 **GlitchTip não resolvia `glitchtip-db`** (`Name or service not known` em loop) — ingestão de erro (usada pelo próprio `SENTRY_DSN` da Evolution e por outros serviços) rejeitando eventos. Igual ao achado WS-1 do FMEA da sessão 5 (não verificado até agora). | Restart do container `glitchtip-web` (ação de baixo risco pré-aprovada pelo FMEA 1.5/1.6 — perda de alertas só na janela do restart) | Container voltou `Running`/`ExitCode 0` às 01:02:50 UTC; recomenda-se 1 evento sintético de teste para confirmar persistência no Postgres do GlitchTip (não feito nesta sessão) |

**Confirmado como já resolvido / não é bug (evita retrabalho):**

- ✅ **Secret do webhook está correto**: comparado byte-a-byte — o Docker secret `supabase_evolution_webhook_secret_v1` (88 bytes, sem newline, montado no `supabase_functions` via `EVOLUTION_WEBHOOK_SECRETS`) é **idêntico** ao header `x-webhook-secret` configurado na Evolution e ao valor em `vault.decrypted_secrets` (`evolution_webhook_secret` e `webhook_secret_evolution` — duas entradas de vault com o mesmo valor, resíduo de uma migração de 13/06; **não usadas** pelo caminho de validação real, que lê `Deno.env` direto, não vault — sem risco, mas candidatas a limpeza futura).
- ✅ **Os 401 "Missing webhook signature"/"Invalid webhook shared secret"** remanescentes em `zapp.instance_auth_events` (8 nos últimos 5 min no momento da verificação, 0 nos últimos 2 min — intermitente, não um flood constante) são o mesmo fenômeno já documentado na sessão 2 (§1.4): o **caminho nativo `connection.update`** da Evolution ocasionalmente chega sem o header, mesmo com o header configurado na instância — comportamento do próprio Evolution, não um bug nosso. Consolidação recomendada (não executada — é a mudança INT401-3 do patch de referência do consumer, depende de decisão de qual caminho de entrega vira o único): desabilitar `CONNECTION_UPDATE` no webhook nativo e manter só via RabbitMQ→consumer (autenticado por HMAC/shared-secret e com DLQ).
- ✅ **S3 `Access Denied` no `makeBucket`**: mesmo padrão já explicado na sessão 5 (S4-2) — token R2 sem permissão de `CreateBucket`, inofensivo porque o bucket já existe; `PutObject` funciona.
- ✅ **Consumer RabbitMQ `drop=545` sem DLQ**: **não é um bug novo desta sessão** — é o comportamento **documentado e já endereçado com patch pronto** em [`db/remediation/consumer-hmac-patch.md`](../db/remediation/consumer-hmac-patch.md) (INT401-2): hoje o consumer faz `ch.basic_ack()` em qualquer 4xx, descartando silenciosamente. O patch (assinar HMAC + `basic_nack(requeue=False)` em 401/403 para rotear à DLQ) está pronto mas **não aplicado** — o consumer roda como Docker Config fora deste repositório (stack `evolution-rabbit-consumer`, não versionado aqui), portanto não posso aplicá-lo via commit; aplicar exige editar o Config no Portainer diretamente (fora do escopo seguro desta sessão sem coordenação, pelo mesmo motivo do WS-6 do FMEA: risco de derrubar o único caminho de entrega funcionando).

**Continua pendente (exige ação humana coordenada — sem mudança desde a sessão 5):**

- 🔴 `wpp2` **e** `wpp_pink_test` desconectadas (`401 device_removed`) — QR gerado com sucesso via `POST /instance/connect` para as duas (confirmado 200 OK), mas o código QR **expira em segundos e não pode ser entregue com segurança por este canal de texto** (uma tentativa de retransmitir o PNG por base64 nesta sessão resultou em arquivo corrompido — descartado antes de ser enviado). Gerar o QR no momento em que o celular estiver em mãos, via Manager (`https://evolution.atomicabr.com.br/manager`) ou me pedindo para chamar `evo_instance_connect` naquele instante.
- 🔴 Rotação de `AUTHENTICATION_API_KEY`, drift dos 3 stacks de backup PG14, aposentar `minio-offsite-mirror`, retenção `_analytics`/Logflare (35 GB) — sem mudança desde a sessão 5; continuam gated pelas mesmas razões já documentadas (§4 da sessão 4, FMEA WS-4/WS-6/WS-7/WS-8).
- 🟡 Upgrade Evolution API `2.3.7` → `2.4.0` — **decisão de negócio, não técnica**: `2.4.0-rc1+` introduz **ativação de licença obrigatória** no servidor da Evolution Foundation. Não recomendado migrar para RC; permanecer em `2.3.7` (última estável) até a 2.4.0 sair de RC e o time decidir sobre o modelo de licença.

---

## 1. Diagnóstico completo do "flood" de 401 no webhook (investigação desta sessão)

Sequência de verificação (evitando repetir o que sessões 1–2 já fizeram):

1. Lido `supabase/functions/evolution-webhook/index.ts` + `_shared/hmac-validation.ts` +
   `_shared/instance-pause.ts` — confirmado que o validador já suporta shared-secret
   (`x-webhook-secret`) além de HMAC, com auto-pause por instância (10 falhas/60s → 15 min).
2. Comparado o secret em 3 lugares: header configurado na Evolution (via `evo_webhook`),
   Docker secret `supabase_evolution_webhook_secret_v1` (lido via `portainer_exec_container` +
   `wc -c` — 88 bytes, sem newline), e `vault.decrypted_secrets` — **os três batem**.
3. Verificado em tempo real (`now()` vs `max(created_at)` em `zapp.instance_auth_events`):
   falhas são **intermitentes** (8/5min, 0/2min no momento da checagem), não um flood
   contínuo — consistente com o padrão já descrito na sessão 2 (ruído do `connection.update`
   nativo durante os ciclos de reconexão 401 da wpp2/pink, não uma quebra de autenticação real).
4. Conclusão: **nenhuma ação de segredo foi necessária** — o achado real é o gap de eventos
   (corrigido no item 1 do TL;DR), não um secret mismatch.

## 2. GlitchTip — causa-raiz confirmada (WS-1 do FMEA, sessão 5)

Log do `glitchtip-web` antes do restart:
```
error connecting in 'pool-1': failed to resolve host 'glitchtip-db': [Errno -2] Name or service not known
```
O container `glitchtip-db` (postgres:16-alpine) estava `running`/`healthy` — não é falha do
banco, é resolução DNS do overlay Swarm não atualizada no container web (cenário 1.1/1.3 do
FMEA). Restart do `glitchtip-web` força nova resolução; ação de impacto 1 (perda de alertas
só durante a janela) pelo próprio FMEA. Nenhuma migração ou dado tocado.

**Pendência decorrente:** enviar 1 evento sintético (`test=true`) para confirmar ingestão
persistida no Postgres do GlitchTip — não feito nesta sessão por ser uma verificação, não uma
correção; próxima sessão deve fechar isso antes de marcar WS-1 como resolvido.

## 3. Nota sobre a versão upstream

`evolution-api@2.3.7` confirmado novamente (log de deploy Prisma: `evolution-api@2.3.7 db:deploy`)
= última estável do `evolution-foundation/evolution-api`. Releases mais recentes verificadas via
GitHub: `2.4.0-rc1` (06/05/2026, ativação de licença obrigatória) e `2.4.0-rc2` (17/05/2026,
estabilização). Recomendação mantida da sessão 2: **não migrar** enquanto 2.4.0 for RC.

> Nota recorrente (já registrada nas sessões 3/5): o campo `version` retornado pelas ferramentas
> MCP `evo_status`/`evo_dashboard` (`4.2.0`) é a versão do **worker MCP**, não da Evolution API.

## 4. O que NÃO foi tocado nesta sessão (e por quê)

Mesma postura de engenharia sênior das sessões 3–5 — nenhum destes é esquecimento:

| Item | Motivo |
|---|---|
| Reconectar `wpp2`/`wpp_pink_test` via QR | Exige celular físico; QR expira em segundos e não é seguro de retransmitir por texto |
| Rotacionar `AUTHENTICATION_API_KEY` | Quebra consumidores com a chave hardcoded (n8n, worker MCP) sem janela coordenada |
| Aplicar o patch HMAC no consumer RabbitMQ | Config fora deste repo (Portainer); risco de derrubar o único caminho de entrega funcionando sem teste em janela dedicada |
| Migrar Evolution 2.3.7 → 2.4.0 | Decisão de licenciamento, não técnica |
| Backups PG14 (drift MinIO→R2), `minio-offsite-mirror`, retenção `_analytics` | Sem mudança de estado desde a sessão 5 — continuam no runbook supervisionado |

## 5. Auditoria de documentação oficial vs. instalado (concluída)

Workflow de varredura da documentação oficial (`docs.evolutionfoundation.com.br`, protegida por
Cloudflare para fetch direto — acessada via Jina Reader) comparou, domínio por domínio, cada
funcionalidade documentada contra a configuração real do `evolution_evolution` (env vars via
`portainer_inspect_service`). **Importante:** o workflow recebeu um resumo dos fatos já
levantados nesta sessão, não o dump bruto completo — por isso 3 dos "achados" do resultado bruto
eram **falsos positivos** (contradiziam dados já confirmados diretamente nesta mesma sessão) e
foram removidos/corrigidos abaixo antes de publicar. Fica como nota metodológica para sessões
futuras: ao alimentar um sub-agente de pesquisa com "ground truth" resumido, revalidar cada
achado contra os dados brutos originais antes de reportar — resumir por economia de contexto tem
esse custo.

**Falsos positivos descartados (verificados contra dados já coletados nesta sessão):**

| Achado do workflow | Por que é falso |
|---|---|
| "`DEL_INSTANCE` não configurado — risco de auto-delete das instâncias desconectadas" (reportado como P1) | **Falso.** `DEL_INSTANCE=false` está presente e correto no `Env` do serviço `evolution_evolution` (confirmado via `portainer_inspect_service` nesta mesma sessão) — sem risco de auto-remoção. |
| "`rejectCall`/`msgCall` não configurados" | **Falso.** Ambas as instâncias já têm `rejectCall:true` + `msgCall` em PT-BR configurado (confirmado via `evo_dashboard`/`evo_instance_list` nesta sessão). |
| "`TELEMETRY` vs `TELEMETRY_ENABLED`: variável errada, telemetria pode seguir ativa" | **Já resolvido.** O `Spec` atual (pós-redeploy mais recente, label `legacy-env-cleanup-2026-07-04`) já usa `TELEMETRY_ENABLED=false` — o `TELEMETRY=false` antigo só aparece no `PreviousSpec`. |

**Achado descartado por falta de fonte verificável:** "bug de allowlist de IP no `/metrics`
(`allowedIPs.filter(...) === 0`)" — referência específica demais para ser aceita sem conferir o
código-fonte real da versão instalada; não incluída abaixo até alguém confirmar contra o
`dist/main.js` do container.

### 5.1 Gaps reais a avaliar (verificados/plausíveis, não falsos-positivos)

| Gap | Prioridade | Ação recomendada |
|---|:---:|---|
| `wpp2` 100% Baileys (não-oficial) com ~103k mensagens — mesmo padrão de instabilidade do incidente atual | P1 | Avaliar migrar a linha de maior volume para WhatsApp Business (Cloud API) com token Meta permanente; manter `wpp_pink_test` em Baileys |
| Consumer RabbitMQ derruba mensagens (`drop=545`) sem DLQ capturar + falha de DNS para `glitchtip-web` no shutdown | P1 | Já coberto no patch de referência (`db/remediation/consumer-hmac-patch.md`, INT401-2) — reforça a prioridade de aplicá-lo numa janela dedicada |
| Patch LGPD de redação de logs falha aberto silenciosamente se o match de string quebrar num futuro bump de imagem | P1 | Adicionar verificação pós-patch no entrypoint que loga/alerta se o match não ocorrer (hoje só loga sucesso) |
| Proxy por instância desabilitado (`Proxy.enabled=false`/`null`) | P2 | Avaliar habilitar proxy residencial/mobile via `POST /proxy/set` como mitigação a bans do Baileys |
| `DATABASE_SAVE_DATA_CHATS=false` e `DATABASE_SAVE_DATA_HISTORIC=false` no Postgres nativo do Evolution | P2 | Religar pelo menos `DATABASE_SAVE_DATA_CHATS` — hoje o nativo não serve de ledger redundante caso o pipeline RabbitMQ/Supabase perca algo |
| Rotação da API key global compartilhada | P2 | **Já documentado como pendente desde a sessão 3** (não é achado novo) — mantém-se gated por janela coordenada |
| `CACHE_LOCAL_ENABLED=true` junto com Redis | P3 | **Já documentado (S5-6)** — seguro com 1 réplica; revisitar só se escalar |
| Buttons/List no Baileys (compatibilidade limitada/beta segundo a doc oficial) | P2 | Auditar `zapp.chatbot_flows` por payloads tipo botão; preferir List (testar antes) ou menu numerado em texto |
| `typebot-viewer` rodando no stack sem nenhuma instância Evolution usando `/typebot/create` | P2 | Confirmar que está sem uso e desligar, ou conectar de propósito se houver caso de uso |

### 5.2 Não aplicável a este deploy

WhatsApp Business templates/catálogo/coleções (exigem Cloud API), Chatwoot (zapp-web já é o
inbox/CRM), OpenAI nativo bot+STT (já coberto por Gemini/GPT + ElevenLabs), Dify/Flowise/EvoAI
(sem caso de uso), SQS/Kafka/NATS/Pusher (RabbitMQ já cobre o papel), WebSocket nativo (sem
client consumindo), licenciamento obrigatório e Manager v2 redesign (só relevantes na 2.4.0, que
não está instalada).

---

*Sessão 6 executada por auditoria automatizada (Claude Code) em 2026-07-05. Nenhum segredo
(API keys, tokens de instância, senhas, o valor do webhook secret) foi incluído neste documento.*
