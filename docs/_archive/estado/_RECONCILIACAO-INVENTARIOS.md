# Reconciliação dos inventários paralelos — Fase 5

> ## ⚠️ CORREÇÃO DO ORQUESTRADOR — D3 está direcionalmente certo, mas superdimensionado
>
> A divergência **D3** afirma que *"0 de 20 nomes amostrados"* da coluna "Evidência
> Camada UI" do `FEATURE_REGISTRY.md` existem em `src/`. **Refeita a medição com amostra
> própria de 18 nomes, o resultado é 12 existem / 6 não existem.**
>
> Os 6 ausentes têm de fato **zero ocorrência** em qualquer arquivo de `src/` (teste por
> string livre, não só por export) e são fabricações reais: `AgentSkillsPanel`,
> `AnalysisPanel`, `ArchiveButton`, `CampaignABView`, `ConnectionsList`, `Contact360View`.
> Os 12 que existem são as páginas `Admin*Page`, todas resolvíveis em `src/pages/`.
>
> **O padrão importa mais que o número:** a evidência fabricada concentra-se nas linhas
> de *feature de negócio* (Perfil 360 do contato, Campanhas AB, Skills de agentes),
> enquanto as linhas de *página administrativa* têm lastro real. Ou seja, a coluna é
> menos confiável exatamente onde descreve capacidade de produto — que é o que o
> documento se propõe a inventariar.
>
> Severidade mantida como CRÍTICA (a promessa anti-alucinação da linha 9 do registry é
> violada, e ~1/3 da amostra não resolve), mas a afirmação "a coluna não é evidência"
> deve ser lida como **"a coluna é parcialmente fabricada, com viés para as features de
> negócio"**. Quem for corrigir o registry deve reverificar linha a linha, não descartar
> a coluna inteira.

> Auditado em: 2026-08-16 | Acervos cruzados: 4 (+1 concorrente) | Runtime: NAO_VERIFICADO
> Autor: agente E10. **Escrita restrita a este arquivo.** Nenhum dos acervos foi editado.
> Método: leitura estática do repo na branch `claude/validar-levantamento-sistema-uxonxc`.
> Zero acesso a banco. Toda linha da §3 cita as **duas** fontes em conflito.

---

## 1. Sumário executivo

### O que sabemos com confiança

1. **O sistema tem quatro inventários que medem eixos diferentes e não se contradizem por
   acidente — contradizem-se porque respondem a perguntas diferentes e nenhum declara a sua
   própria pergunta.** `FEATURE_REGISTRY.md` responde *"que capacidade de negócio existe?"*.
   `ESTADO.md` responde *"o que está ligado e quem chama?"*. `docs/estado/` responde *"que
   arquivos existem e quem os importa?"*. `docs/audit-2026-08-06/` responde *"o container
   confere com o banco?"*. Nenhum é errado no seu eixo; todos erram fora dele.

2. **A pergunta original do dono — "o que deveria existir vs. o que foi implementado" — é
   respondida hoje por um único documento (`FEATURE_REGISTRY.md`) cuja coluna de evidência de
   UI não é verificável** (achado A3). `docs/estado/` tem a evidência real (arquivo + linha +
   status), mas não tem o eixo funcional. A junção dos dois nunca foi feita — é exatamente o
   que a §4 deste documento faz pela primeira vez.

3. **O acervo mais recente vence quase sempre, com uma exceção importante:** na topologia
   `evo`×`zapp`, o documento mais *antigo* (`FEATURE_REGISTRY.md`, 2026-08-06) voltou a estar
   correto e o mais *novo* de referência permanente (`CLAUDE.md`, regra 4) está errado desde
   ontem 11:50Z. Recência não é critério suficiente; topologia mudou 3× em 7 dias.

### O que não sabemos

- **Se qualquer coisa deste inventário é verdade em runtime.** Os 31 documentos de
  `docs/estado/` carimbam `Runtime: NAO_VERIFICADO` no cabeçalho. Exatamente **1** achado em
  todo o acervo foi verificado ao vivo (`11-features-inbox-components-raiz-m-z.md` A4,
  `queue_positions`). Nenhum acervo mede uso real por usuário.
- **O que fazem os 138 workflows n8n ativos** e os **218 cron jobs**. `ESTADO.md` só verificou
  a pergunta estreita "algum chama edge function?" (resposta: n8n 0, cron 1).
- **Cloudflare Workers** — `ESTADO.md` L29: *"nao verificado nesta rodada"*. Nunca foi.

### Onde nos contradizemos

**22 divergências** catalogadas na §3: **3 CRÍTICAS**, **7 ALTAS**, **10 MÉDIAS**, **2 BAIXAS**.
As três críticas são: (D1) qual schema tem a tabela física de mensagens — questão que quebra
Realtime em produção se resolvida errada; (D3) a coluna de evidência de UI do
`FEATURE_REGISTRY.md` não é auditável; (D4) o módulo SLA/filas é `✅ Full` no registry e
comprovadamente dormente em runtime.

### Nota sobre esta onda

`docs/estado/` **não tem mais 30 documentos** — tem 39 numerados + 3 meta (42 arquivos), porque
agentes desta mesma onda estão produzindo `31`…`38` em paralelo (Fase 1E, 2A, 3) e o `_ERRATA-
TOPOLOGIA.md` (E9). Este documento cita esses artefatos quando eles já fecharam um cruzamento,
em vez de duplicá-lo.

---

## 2. Os quatro acervos: escopo, data, eixo, confiabilidade

| # | Acervo | Data declarada | Eixo | Unidade de análise | Cobertura | Confiabilidade |
|---|---|---|---|---|---|---|
| **A** | `FEATURE_REGISTRY.md` (383 linhas) | 2026-08-06 | **Funcional** — "deveria ter × tem" | Recurso atômico de negócio | 15 domínios · **181 linhas** de recurso | **Média-baixa.** Eixo certo, evidência de UI não verificável (D3). Coluna DB/RPC é boa. Sumário executivo contradiz o próprio corpo (D2). |
| **B** | `docs/audit-2026-08-06/` (5 arquivos) | 2026-08-06 | **Infra** — container × Supabase | Checagem de configuração | 40 checks · 8 dimensões | **Alta no que mediu, congelada.** Único acervo com evidência de banco real. 10 dias desatualizado; 1 "resolução" revertida no mesmo dia (D11). |
| **C** | `ESTADO.md` (529 linhas) | 2026-08-08 (edge fns) / 2026-08-15 (T0) | **Operacional** — "está ligado? quem chama?" | Edge function + pipeline | 107 edge fns · 218 crons · 254 workflows n8n | **Alta.** O acervo mais honesto: define critério explícito ("chamador = invocação real"), separa diagnóstico de sentença. Falha por não ser recontado (D9, D10). |
| **D** | `docs/estado/*.md` (39 numerados) | 2026-08-09 (01–30) / 2026-08-16 (31–38) | **Estático** — arquivo a arquivo | Arquivo de `src/` | 1.758 arq. de `src/` + (nesta onda) 107 edge fns, 184 arq. de infra | **Alta no detalhe, fraca no veredito.** Melhor evidência do repo (arquivo:linha). Critério de órfão gera falso positivo (D15). Zero runtime. |
| **E** | `docs/decouple/` (85 arquivos) | 2026-08-12 → 2026-08-16 | **Fronteira** evo×zapp | Invariante I1–I9 | 6 scorecards T0…T5 + ADRs | **Alta e a mais recente.** É o único acervo com medição diária. Não é inventário — é um plano com telemetria. |

### Regra de precedência derivada

```
runtime medido  >  docs/decouple (T-mais-recente)  >  ESTADO.md  >  docs/estado  >
FEATURE_REGISTRY  >  audit-2026-08-06  >  CLAUDE.md
```
`CLAUDE.md` fica por último **de propósito**: é o documento que mais gente lê e o que menos
gente atualiza — hoje ele carrega o erro mais perigoso do repo (D1).

---

## 3. Matriz de divergências

| # | Componente | Artefato A diz | Artefato B diz | Mais recente | Veredito | Sev. |
|---|---|---|---|---|---|---|
| **D1** | Schema da tabela física `evolution_messages` / Realtime | **`FEATURE_REGISTRY.md:200,368`** — realtime em `evo`.`evolution_messages`, *"Compliance CLAUDE.md ✅"* (2026-08-06) | **`CLAUDE.md` regra 4** + **`docs/decouple/ANALISE_FRONTEIRA_EVO_ZAPP_20260815.md:242`** — física em `zapp`; *"quem seguir esse texto vai configurar Realtime em `schema:'evo'` e receber zero eventos"* | **`docs/decouple/ADR-I4-ROTA-A-MANTIDA.md`** (2026-08-16 12:12Z) + `supabase/migrations/20260816250003_decouple_e73_e75_i4_zero.sql:17,41` (`ALTER TABLE zapp.evolution_messages SET SCHEMA evo` + `CREATE OR REPLACE VIEW zapp.evolution_messages`) | **A está certo hoje, por acidente.** A física voltou para `evo` em 11:50Z de 16/08; `zapp.evolution_*` são views (views nunca emitem WAL). **`CLAUDE.md` regra 4 está ERRADA há ~25h** e induz a quebrar Realtime que funciona. Os 20 pontos de `src/` que usam `schema:'evo'` (ex. `src/hooks/useRealtimeMessages.ts:230,261`; `src/features/inbox/hooks/useMessagesCursor.ts:238`) estão corretos — por inércia, não por decisão. Tratamento canônico: `docs/estado/_ERRATA-TOPOLOGIA.md` (E9). | 🔴 **CRÍTICA** |
| **D2** | Contagem de features do próprio registry | **`FEATURE_REGISTRY.md:18-21`** (Resumo Executivo) — ~45 Full / ~55 Partial / ~31 Suggested / **~131 total** | **`FEATURE_REGISTRY.md:31-309`** (corpo, Domínios 1–15) — **110 Full / 55 Partial / 15 Suggested / 1 Crítico = 181 linhas** | mesmo arquivo | **O corpo é a fonte.** O resumo é estimativa nunca recontada (o próprio L23 admite: *"Contagens aproximadas — refinadas conforme agente backend conclui inventário"*). Erra 2,4× em Full e 2× em Suggested. **É este número inflado/errado que circula como resposta ao dono** — inclusive no briefing desta onda ("~131 features"). | 🟠 **ALTA** |
| **D3** | Coluna "Evidência Camada UI" do registry | **`FEATURE_REGISTRY.md:9`** — *"Anti-alucinação: Toda linha tem ≥1 evidência concreta (arquivo:linha, objeto DB, RPC, cron, edge fn)"* | Verificação direta em `src/`: dos 20 nomes amostrados na coluna UI (`ConversationView`, `MessageInput`, `ReactionPicker`, `TransferModal`, `SnoozeButton`, `TagsPanel`, `SearchBar`, `SummaryPanel`, `TasksPanel`, `Contact360View`, `NotesPanel`, `IntelligencePanel`, `TemplatesPicker`, `ChurnBadge`, `AnalysisPanel`, `EnhanceButton`, `ChatbotConfig`, `AgentAssign`, `CloseButton`, `FileUpload`) — **0/20 existem como arquivo e 0/20 como export**. Contraste: `docs/estado/15-components-contacts.md` lista 50 arquivos com nome, linhas e `status_uso`. | verificação de hoje | **B.** A coluna UI contém **rótulos descritivos, não evidência** — viola a própria promessa do L9. A coluna DB/RPC **é** verificável e boa. Onde o registry cita páginas reais (`SLADashboard`, `Admin*Page`, `BackendDiagnostics`) os arquivos existem. **Isso invalida a auditabilidade de ~110 linhas `✅ Full`** e é a causa raiz de D8. | 🔴 **CRÍTICA** |
| **D4** | Módulo SLA / filas / roteamento | **`FEATURE_REGISTRY.md:99-104`** — Gestão de filas, Dashboard SLA, SLA por conversa, Alertas SLA, Comparativo de filas, Painel SLA por agente = **todos `✅ Full`** | **`ESTADO.md:238`** — *"`queue-rebalance`: modulo SLA nunca ligado (11 tabelas SLA vazias) — **arquivar**"*; **`docs/estado/11-...raiz-m-z.md`** ("Atualizacao 2", runtime) — *"0 filas em `zapp.queues`, 0 `queue_members`, 0 `channel_routing_rules`, **0 de 20.743 contatos com `assigned_to`**, `sticky_assignments` vazia"* | **`docs/estado/_HANDOFF.md` §2** (2026-08-09): fila "Atendimento Geral" + 14 membros **criados ao vivo** (mig. `20260809180000`, cron jobid 335). **Risco aberto declarado:** `is_online=0` para **19/19** agentes → o roteador enfileira e **nunca atribui**. | **B+C.** O `✅ Full` do registry mediu *existência de tabela e de rota*, não fio íntegro — contrariando a sua própria legenda (L5: *"UI + hook/service + objeto DB + grant + **fio íntegro**"*). Estado real: infraestrutura ligada em 09/08, **sem tráfego comprovado**. | 🔴 **CRÍTICA** |
| **D5** | Mensagens agendadas | **`FEATURE_REGISTRY.md:47,87`** — 🟨 Partial, evidência *"`scheduled_messages` + **cron de dispatch**"*, obs. *"Requer wpp2 ativa"* | **`docs/estado/26-hooks-raiz-4.md` A1** — *"(1) RLS faltando para INSERT/UPDATE → mutations retornam 403 silenciosamente; (2) **nenhum cron job ou Edge Function processa `scheduled_messages`** → mensagens agendadas nunca são disparadas em produção"* (CAMPANHAS-09) | B (2026-08-09) | **B.** O "cron de dispatch" citado como evidência **não existe**. E o bloqueador declarado pelo registry (wpp2) é o errado: mesmo com wpp2 ligada, nada dispararia. Duas camadas quebradas, nenhuma delas a apontada. | 🟠 **ALTA** |
| **D6** | Campanhas (genéricas × Talkx) | **`FEATURE_REGISTRY.md:83-86`** — Talkx `✅ Full`; *"Campanhas AB 🟨 Partial \| `campaigns` + `campaign_ab_variants` \| TODO CAMPANHAS-14 rastreado"* | **`docs/estado/23-hooks-raiz-1.md` A2** — *"o motor de disparo `campanha-send` **não existe no repositório**"* + 403 em update/delete; **`27-hooks-subdirs.md` A3** — *"Engine A/B de campanhas **inexistente** (feature dead-end)"*; **`21-...diretorios-medios.md` A4** — *"`zapp.campaigns` sem policies UPDATE/DELETE"* | B (2026-08-09). Confirmado hoje: `supabase/functions/campanha-send` **AUSENTE** | **B.** Talkx é real (edge `talkx-control`/`talkx-scheduler`/`talkx-send` com chamador em `ESTADO.md` grupos A e B). O motor de campanhas **genérico** é dead-end. O registry os mistura no mesmo domínio, o que faz "Campanhas" parecer 80% pronto quando é uma feature viva + uma morta. | 🟠 **ALTA** |
| **D7** | Grupo F (18 edge fns sem chamador) × features `✅ Full` | **`ESTADO.md:83-101`** — sem chamador: `cleanup-rate-limit-logs`, `send-rate-limit-alert`, `login-attempts`, `evolution-retry-metrics`, `email-health`, `send-scheduled-report`, `followup-bridge`, `auto-close-conversations`, `db-health-monitor`, `lgpd-scheduled-jobs`, `ai-auto-tag`, … | **`FEATURE_REGISTRY.md`** marca `✅ Full`: *Rate limiting* (L229), *Login attempts* (L233), *Retry métricas* (L202), *Saúde do e-mail* (L165) | C (ESTADO, 2026-08-08); confirmado hoje | **Ambos, em camadas diferentes.** Tabela/RPC existem (registry certo na camada DB); a **automação declarada está morta** (ESTADO certo na camada operacional). Pelo critério do próprio registry ("fio íntegro"), `✅ Full` não se sustenta em nenhum dos 4. | 🟠 **ALTA** |
| **D8** | "Suggested / sem evidência de UI" × grupo A | **`FEATURE_REGISTRY.md:176,179,214,215,216`** — Voice agent, Voice changer/ElevenLabs, Bitrix24, Sicoob, PromoGifts = **🟦 Suggested, "sem evidência de UI"** | **`ESTADO.md:142-214` grupo A (chamada pelo front)** inclui `voice-agent`, `voice-changer`, `elevenlabs-dialogue/-scribe-token/-sfx/-tts/-tts-stream/-voice`, `bitrix-api`, `sicoob-bridge`, `sicoob-bridge-reply`, `promogifts-catalog`. Corroborado por **`docs/estado/11-...md` A1/A2** (`TextToAudioButton.tsx:76`, `VoiceChanger.tsx:163` chamam as EFs — com bug de auth), **`05-features-admin.md` A2** (`SicoobBridgeDashboard.tsx`), **`19-...catalog...md`** (`ExternalProductCard`) | C+D | **B.** O registry **subestima** 5 integrações porque procurou UI por nome de componente inventado (consequência direta de D3). Todas têm chamador no front. | 🟡 **MÉDIA** |
| **D9** | Contagem de edge functions | **`CLAUDE.md`** ("Estrutura de Pastas") — *"123 Edge Functions (Deno)"* | **`ESTADO.md:26`** — *"Edge functions encontradas: 107"* | Disco hoje: **107 ativas** + 4 em `_archive`. Reconciliação detalhada disco×ESTADO já feita por **`docs/estado/36-backend-edge-functions.md` §3** | **B.** `CLAUDE.md` erra por 16. Adicionalmente: **3 funções no disco não constam em nenhum grupo do `ESTADO.md`** — `evolution-group-sync`, `evolution-notification-dispatcher` (ambas de `8e9361c06`, 2026-08-14) e `evolution-proxy` (`3c072b2a6`) — **violação direta da "Regra permanente" do próprio `ESTADO.md:221`** (*"Toda edge function nova declara seu chamador neste arquivo no mesmo commit que a cria"*). | 🟡 **MÉDIA** |
| **D10** | Score de desacoplamento | **`ESTADO.md:14,33-58`** — *"Baseline T0: 2026-08-15 \| Score **3/9 (33%) — Nota D**"*, *"Próxima medicao planejada: **T1**"* | **`docs/decouple/BOUNDARY_SCORE_T2/T3/T4/T5.json` existem.** T5 (2026-08-15T23:44Z): `passed: 2, failed: 7, percentage: 22, grade: "F"` | **`docs/decouple/ADR-I4-ROTA-A-MANTIDA.md` §3** (2026-08-16 12:12Z, `ops.fn_boundary_audit()`): `I4=0` **PASS**, `I3=0`, I1=4 fns, I2=1 fn | **C.** `ESTADO.md` está **5 medições atrás** e publica um score que não é nem o pior registrado (T5 = 22%/F) nem o atual (pós-I4, sensivelmente melhor). Quem lê `ESTADO.md` hoje tem a foto errada em ambas as direções. | 🟠 **ALTA** |
| **D11** | Bucket `audio-memes` (público?) | **`docs/audit-2026-08-06/reconciliation.json`** DADO-05, status **`RESOLVED`**: *"audio-memes→public=false, audio-messages→public=true"*; repetido em `EXECUTIVE_SUMMARY.md:92-93` | **`CLAUDE.md`** (tabela Storage Buckets) — `audio-memes` **público = sim**, *"por decisão explícita do dono (migrations 20260806194000 e 20260806195000)"* | `supabase/migrations/20260806194000_audio_memes_bucket_public.sql` — `SET public = true` (**unconditional UPDATE**) + policy `public_read_audio_memes` para `anon` | **B.** A "resolução" da auditoria foi **revertida no mesmo dia** por decisão do dono. O `EXECUTIVE_SUMMARY.md` continua afirmando, com ✅, um estado de segurança que **não é o de produção**. Um leitor que confie na auditoria conclui que o bucket é privado. | 🟡 **MÉDIA** |
| **D12** | Cron jobs | **`docs/audit-2026-08-06`** (EXECUTIVE_SUMMARY + reconciliation.json DADO-06) — **151**, marcado `RESOLVED` ("CLAUDE.md atualizado para 151") | **`ESTADO.md:26`** e **`CLAUDE.md`** — **218** (auditado 2026-08-15) | Meio-termo não citado: **`docs/decouple/BASELINE_V4.md` 3.6** (2026-08-14) — *"Crons ativos: 317 / 318 / 329 / 429"* (jobids, não contagem) | **218.** A auditoria está 2 medições atrás e o seu `RESOLVED` cristalizou um número morto. O `BASELINE_V4` 3.6 é ambíguo (lista jobids como se fosse contagem) e não deve ser lido como quantidade. | 🟡 **MÉDIA** |
| **D13** | Contagens de linhas de tabelas | **`FEATURE_REGISTRY.md`** — `webhook_audit_log` **187.368** (L219); `webhook_events_processed` **191.201** (L219,291); `app_notifications` **13.473** (L267); `profiles` **17 usuários** (L280); `contatos` **3.236** (L58) | **`CLAUDE.md`** — `webhook_audit_log` **58.232**; `webhook_events_processed` **58.076**; `app_notifications` **14.283**; `profiles` **19**. **`docs/audit-2026-08-06`** — `zapp.profiles` **19**. **`docs/estado/11-...md`** — *"20.743 contatos"* | CLAUDE.md / audit (para `profiles`: 19, com 3 fontes concordando) | **Nenhum dos dois é utilizável.** Para `profiles` há convergência (19) e o registry está simplesmente errado. Para os webhooks, a divergência é de **3,2×** em direções opostas ao esperado (o número mais velho é o maior) — provavelmente tabelas/janelas diferentes, mas **nenhum documento data a linha**. Regra: **não usar contagem de linha de nenhum acervo como métrica**; só o banco responde. | 🟡 **MÉDIA** |
| **D14** | Nº de tabelas no schema `evo` | **`CLAUDE.md`** + **`docs/audit-2026-08-06`** (MIGR-02, `RESOLVED`) — **136 tabelas** (2026-08-06) | **`docs/decouple/BASELINE_V4.md` 3.1** (2026-08-14) — *"Tabelas `evo.*` = **29** (16 operacionais + 13 partições)"*; *"Objetos `zapp.evolution_*` = 99"* | **`ADR-I4-ROTA-A-MANTIDA.md`** + mig. `20260816250003` — 3 raízes + partições voltaram para `evo` | **Os três números descrevem topologias diferentes** (pré-migração / pós evo→zapp / pós zapp→evo). Nenhum está errado na sua data; **nenhum documento registra a série**. `CLAUDE.md` publica 136 como se fosse fato corrente. | 🟡 **MÉDIA** |
| **D15** | "128 páginas órfãs" | **`docs/estado/01-frontend.md`** — seção *"Páginas órfãs (128 arquivos não referenciados em `AppRoutes.tsx`)"*, incluindo `AdminFailedMessagesPage`, `AdminTelemetriaPage`, `AdminWebhookOverviewPage`, `AdminRealtimeMonitorPage`, `AdminSearchInsightsPage`, `AdminInstancePausesPage`, `BackendDiagnostics`, `ViewRouter` | **`FEATURE_REGISTRY.md:286-292,306`** marca essas mesmas páginas `✅ Full` | Verificação hoje: **todas alcançáveis** por `src/pages/lazyViews.ts` → `src/pages/ViewRouter.tsx` → `src/components/layout/AppShell.tsx:7,26,201` | **A favor do registry.** O critério *"não está em `AppRoutes.tsx`"* produz **falso órfão para todo o roteamento por view** (o padrão dominante do app). O número 128 não é um inventário de código morto e **não deve embasar decisão de remoção**. | 🟡 **MÉDIA** |
| **D16** | "189 componentes órfãos (~32%)" | **`docs/estado/_HANDOFF.md` §3** — *"1C … 597 arq, **189 orfaos ~32%** — a camada de componentes esta inflada"* | **`docs/estado/_ORFAOS-1C-consolidado.md`** (mesmo acervo, mesma data) — *"**Orfao != codigo morto** … a esmagadora maioria e **encapsulamento de modulo** (facade)"*; dos que têm veredito, **apenas 7 acionáveis** (4 VERIFICAR + 3 NAO_REMOVER), 48 são SEGURO; **~122+ ainda não classificados** | mesmo dia | **O acervo já se autocorrige** — mas o número bruto (189/32%) é o que circula em `_HANDOFF.md` e em resumos. Combinado com D15, o repo carrega **dois números de "órfão" inflados** que ninguém marcou como preliminares. | 🔵 **BAIXA** |
| **D17** | RLS "100%" | **`CLAUDE.md`** (tabela de schemas) — `zapp` RLS **100%**, `evo` RLS **100%** | **`docs/estado/`**, 6 achados independentes: `19-...md` A1 (*"RLS ausente em `notification_templates` — produção quebra ao salvar"*); `23-...md` A2 (`campaigns` sem RLS UPDATE/DELETE → 403); `26-...md` A1 (`scheduled_messages` sem RLS INSERT/UPDATE → 403 silencioso); `27-...md` A2 (*"RLS SELECT-only bloqueia escrita em `companies` e `contact_segments`"*); `09-...md` A1 (`conversation_summaries` sem policy de INSERT p/ não-admin → escrita falha silenciosa); `21-...md` A4 (`zapp.campaigns` sem policies UPDATE/DELETE) | D (2026-08-09) | **Ambos, mas `CLAUDE.md` engana.** "RLS 100%" significa *RLS habilitada em 100% das tabelas* — não *policies completas*. A leitura natural é a errada, e **6 features quebram em produção por policy ausente**. O `100%` deveria ler-se "RLS enabled: 100% · policies auditadas: 0%". | 🟠 **ALTA** |
| **D18** | Crons de CSAT / NPS | **`FEATURE_REGISTRY.md:46,122`** — *"CSAT automático `✅ Full` … **cron `csat-auto-send`** + edge `csat-auto-send`"*; *"NPS automático `✅ Full` … **cron `nps-scheduler`** + edge `nps-scheduler`"* | **`ESTADO.md:26,129`** — 218 jobs, *"**apenas `nps-daily-trigger`** chama edge fn"*; **grupo C (chamada por cron ativo) = VAZIO**; ambas as EFs estão no **grupo A** (chamadas pelo front). Corroborado por **`docs/estado/22-...md` A3** — *"NPSDashboard: edge function `nps-scheduler` **sem trigger**"* | C+D | **B.** Não existe cron `csat-auto-send`. O NPS tem agendamento, mas com **outro nome** (`nps-daily-trigger`) — o registry cita um cron pelo nome da EF, que é uma inferência, não uma evidência. | 🟡 **MÉDIA** |
| **D19** | Flags `instagram_channel`, `telegram_channel`, `media_library` ON | **`FEATURE_REGISTRY.md:217,218,272,349,350,352`** — flags **ON**, obs. *"UI a confirmar"* / *"sem UI completa"* | Busca nos 31 documentos de `docs/estado/` (1.758 arquivos de `src/`): **zero ocorrências** de `instagram`, `telegram`, `media_library` | D | **Convergência que nenhum dos dois declarou.** Não é "UI a confirmar" — é **superfície zero**. Três feature flags ligadas em produção sem uma linha de código que as leia. Registrar como `🟦 Suggested`, não `🟨 Partial`. | 🟡 **MÉDIA** |
| **D20** | Integrações fora do inventário funcional | **`FEATURE_REGISTRY.md` Domínio 10 (Integrações Externas)** — lista 9 itens; **não menciona** Google Calendar, n8n nem Sentry | **`docs/estado/20-...md` A7** — *"Três integrações completamente **stub em produção** (sem feature flag)"*: `GoogleCalendarIntegration.tsx:20-23` (`handleConnect = toast.info`), `N8nIntegrationView.tsx:38-43` (`setIsConnected(true)` local), `SentryIntegrationView.tsx:30-33` (`mockErrors` hardcoded). *"usuário vê UI funcional mas nenhuma ação persiste"* | D | **Lacuna de cobertura do registry.** Três telas de integração navegáveis em produção que o inventário funcional não sabe que existem. O registry inventaria o que **tem tabela**; features 100% front-end escapam. | 🟡 **MÉDIA** |
| **D21** | Consistência interna do acervo de auditoria | **`docs/audit-2026-08-06/EXECUTIVE_SUMMARY.md:17-23`** — dashboard: P0 1 · **P1 5** · P2 6 · OK 28 · total 40 | **`docs/audit-2026-08-06/reconciliation.json`** — `by_severity: {P0:1, **P1:4**, P2:6, OK:28}` = 39; `total_checks: 40`; **`findings[]` tem apenas 17 entradas** | mesma data | **`reconciliation.json` não é o dado estruturado do `EXECUTIVE_SUMMARY`** — é um subconjunto com contagem própria e divergente. 23 dos 40 checks não têm registro estruturado. Quem automatizar em cima do JSON obtém outra auditoria. | 🔵 **BAIXA** |
| **D22** | Evidências de edge function inexistente | **`FEATURE_REGISTRY.md:284`** — *"Onboarding `✅ Full` \| Install page \| **edge `onboarding` suspeita**"*; **L102** — *"Alertas SLA `✅ Full` … + **edge `sla-alert`**"* | Disco hoje: `supabase/functions/onboarding` **AUSENTE**; `supabase/functions/sla-alert` **AUSENTE** (existem `sla-alert-forward` e `sla-alert-log-failure`, ambos no grupo A do `ESTADO.md`) | verificação de hoje | **B.** Duas linhas `✅ Full` sustentadas por edge functions que **não existem**. Note que a própria linha 284 escreve *"suspeita"* — o registry classificou como Full uma evidência que ele mesmo marcou como incerta. | 🟠 **ALTA** |

**Totais:** 🔴 CRÍTICA **3** · 🟠 ALTA **7** · 🟡 MÉDIA **10** · 🔵 BAIXA **2** = **22**.

---

## 4. Features `✅ Full` no registry × achados do inventário estático

> **Este é o cruzamento que a onda inteira existia para produzir.** Cada linha é uma feature que
> `FEATURE_REGISTRY.md` declara pronta e para a qual `docs/estado/` (ou `ESTADO.md`) tem
> evidência de arquivo contrariando. **Ordenado por gravidade do desvio.**

### 4.1 `✅ Full` com lastro FALSO (a evidência citada não existe)

| Feature | Linha do registry | Evidência citada | Realidade | Reclassificar para |
|---|---|---|---|---|
| Onboarding | L284 | edge `onboarding` | diretório **ausente** de `supabase/functions/` | 🟦 Suggested |
| Alertas SLA (siren) | L102 | cron `escalate-critical-alerts` + edge `sla-alert` | edge `sla-alert` **ausente**; módulo SLA dormente (D4) | 🟦 Suggested |
| CSAT automático | L46 | cron `csat-auto-send` | cron **não existe** (`ESTADO.md` grupo C vazio) | 🟨 Partial |
| NPS automático | L122 | cron `nps-scheduler` | cron real chama-se `nps-daily-trigger`; `22-...md` A3: *"`nps-scheduler` sem trigger"* | 🟨 Partial |
| Gestão de filas | L99 | `queues` + `queue_members` | 0 filas / 0 membros até 09/08 (`docs/estado/11`); hoje 1 fila + 14 membros mas `is_online=0` em 19/19 (`_HANDOFF` §2) | 🟨 Partial |
| Dashboard SLA · SLA por conversa · Comparativo de filas · Painel SLA por agente | L100,101,103,104 | páginas + `sla_*` | `ESTADO.md:238`: *"11 tabelas SLA vazias"*. `18-...md` A1: *"SLADashboard registrado em duas rotas"* | 🟨 Partial |

### 4.2 `✅ Full` cuja UI é decorativa, stub ou exibe dado inventado

| Feature | Linha | Achado do inventário estático | Impacto |
|---|---|---|---|
| Tags em conversa | L44 | **`09-...md` A2** — `contact-details/ContactTagsContent.tsx:31,48,60`: ícone X com `cursor-pointer` **sem `onClick`**; botão "Adicionar" **sem handler**. *"A UI de tags é decorativa — nenhuma ação funciona"*. Reforçado por **`08-...chat-1.md` A1** (`ChatHeaderMenu.tsx:58` "Adicionar tag" `disabled`) | Usuário clica e nada acontece |
| Dashboard principal | L249 | **`16-...md` A3** — `DashboardView.tsx`: *"XP/coins/streak **hardcoded**"*; **A4** — `ConversationHeatmap.tsx`: *"métricas `response_time` e `satisfaction` **sempre zero**"*; **A5** — `SatisfactionMetrics.tsx:24`: `const dataUnavailable = true` hardcoded | **A tela principal do produto exibe números fictícios** |
| Audit logs / Transferências | L232, L108 | **`17-...md` A5** — `TransferConversationDialog`: campo de auditoria **`transferred_by:'Support Agent'` hardcoded**. Também em `_HANDOFF.md` §6 | **Trilha de auditoria de transferência é falsa** — grava um nome literal, não o agente |
| Sumário de conversa (IA) | L48, L134 | **`09-...md` A1** — `ai-tools/conversationSummaryStorage.ts:14-19`: RLS de INSERT/UPDATE ausente p/ não-admin → *"a escrita **falha silenciosamente** (retorna null sem lançar erro); o cache de análise não é persistido para a maioria dos usuários"* | Sumário recalculado a cada abertura; custo de IA duplicado |
| Perfil 360 do contato | L60 | **`10-...md` A6** — `ContactDetails.tsx:235-236`: abre `EditContactDialog` com `version: 0`, `phone_numbers: []`, `notes: null` **hardcoded** — *"dados reais do contato são descartados antes do dialog abrir"*. Agrava **`09-...md` A10** (`_pendingData` nunca lido → edições perdidas em conflito) | Perda de dados do usuário |
| Empresas | L71 | **`27-...md` A2** — *"RLS SELECT-only bloqueia escrita em `companies` e `contact_segments`"* | Leitura OK, escrita 403 |
| Notificações push (app) | L267 | **`19-...md` A1** — *"RLS ausente em `notification_templates` (segurança — **produção quebra ao salvar**)"*; **`18-...md` A5** — *"MobileShell: NotificationsPanel **sempre vazio**"* | Config de notificação não salva; mobile sem notificações |
| Rate limiting | L229 | **`25-...md` A2** (DELETE+INSERT sem transação), **A7** / **`18-...md` A4** (campo `action` **hardcoded `'block'`**, `DEFAULT_RULES` hardcoded) + 2 edge fns órfãs (D7) | Config parcialmente ilusória |
| Emojis customizados | L268 | **`10-...md` A19** — `EmojiPicker.tsx`: *"197 emojis hardcoded sem busca nem categorias. **Duplica** os emojis nativos já presentes no `CustomEmojiPicker`. Candidato a unificação ou remoção"* | Duplicação, não defeito |
| 2FA | L241, L295 | **`04-...md` A2** — MFA backup codes **sem persistência no banco** (gerados no front, irrecuperáveis); **A8** — check de MFA pós-login é *best-effort* com `catch` silencioso → *"o usuário continua o login sem ser redirecionado para `/2fa`, **contornando silenciosamente o segundo fator**"* | Furo de segurança em 2FA "Full" |
| Fechar conversa | L42 | **`10-...md` A3** — `CloseConversationDialog.tsx:113-145`: `Promise.all` **sem rollback**; se `conversations.update` falhar após inserir `conversation_closures`, a conversa fica inconsistente | Estado inconsistente sob falha |
| Notas internas (whisper) | L39 | **`11-...md` A8** — `WhisperMode.tsx:68` `staleTime: 30_000` marcado `BUG-2026-08-06`: notas internas desatualizadas por até 30s sem feedback | Bug conhecido, não corrigido |
| Realtime mensagens | L200 | **`30-integrations.md` A1** — *"**BUG:** `useZappConversations` e `useZappMessages` fazem SELECT em **partição** em vez da tabela raiz"* | Leitura incompleta silenciosa |

### 4.3 `🟨 Partial` do registry cujo bloqueador declarado é o errado

| Feature | Registry diz que falta | Realmente falta |
|---|---|---|
| Mensagens agendadas (L47, L87) | *"Requer wpp2 ativa"* | RLS + **qualquer** produtor (`26-...md` A1) — wpp2 é irrelevante |
| Campanhas AB (L86) | *"TODO CAMPANHAS-14 rastreado"* | O motor `campanha-send` **não existe** (`23-...md` A2; `27-...md` A3) |
| Get latest analysis (L139) | *"Stub parcial"* | ✅ **Concordância tripla** — registry + `CLAUDE.md` + `25-...md` A1 (*"`useLatestAnalysis` retorna `null` **incondicionalmente**; `AnalysisBadges.tsx` depende dela; UI em estado vazio permanente"*). **Único ponto de acordo perfeito entre 3 acervos.** |
| Relatórios agendados (L254) | *"Sem UI de agendamento"* | Há UI: **`19-...md` A4** — *"`AutoExportManager` é **STUB funcional** (rota `/auto-export` entrega UI bloqueada)"*; e **`24-...md` A10** — *"`useExportData`: PDF e Excel são **aliases de CSV**"*. O problema é o oposto do declarado: existe superfície sem função. |
| VOIP/SIP (L175) | *"Flag ON mas UI a confirmar"* | UI existe e tem 2 riscos graves: **`20-...md` A1** — *"credenciais SIP **compartilhadas por todos os agentes**"*; **A14** — *"ausência de SRTP e 4 funcionalidades core não implementadas"* |
| Sync to CRM (L213) | 🟦 Suggested, *"Stub — sem Edge Function"* | ✅ Concordância — reforçada por **`10-...md` A2** (*"`CRMAutoSync`: feature morta sem indicação ao usuário … componente silencia o erro (`catch {}`)"*) e **`26-...md` A2** |

### 4.4 Placar do cruzamento

| Situação | Qtd de features `✅ Full` |
|---|---|
| Lastro **falso** (evidência inexistente) | **9** (§4.1) |
| Lastro **frágil** (UI decorativa / dado fictício / RLS bloqueando / bug conhecido) | **13** (§4.2) |
| **Total de `✅ Full` com lastro comprometido** | **22 de 110 (20%)** |
| `🟨 Partial` com bloqueador mal diagnosticado | **5** (§4.3) |
| Features **subestimadas** pelo registry (marcadas Suggested mas com chamador real) | **5** (D8) |

> **Leitura para o dono:** de cada 5 funcionalidades que o inventário funcional declara prontas,
> **1 não está.** E o erro não é aleatório — concentra-se em **SLA/filas, dashboards e
> automações agendadas**, ou seja, exatamente nas features que ninguém percebe quebradas porque
> não geram erro visível: elas apenas mostram zero, ou não disparam.

---

## 5. Lacunas que nenhum acervo cobre

Ordenadas por risco de decisão errada.

| # | Lacuna | Por que nenhum acervo cobre | Evidência da ausência | Risco |
|---|---|---|---|---|
| **L1** | **Runtime — o que os usuários de fato usam** | `docs/estado/` carimba `Runtime: NAO_VERIFICADO` em **31/31** cabeçalhos; `FEATURE_REGISTRY` deriva de leitura de código + contagens de tabela; só `ESTADO.md` e `docs/decouple/` tocaram o banco, e para outras perguntas. **1 único achado** foi verificado ao vivo em todo o acervo | `docs/estado/11-...md` A4 (*"Runtime: VERIFICADO"*) — o único | **O maior.** Decidir remoção/priorização sem telemetria de rota é adivinhação. Explica D4, D15, D19 |
| **L2** | **Os 138 workflows n8n ativos** | `ESTADO.md:28` respondeu só *"nenhum chama edge fn"*. Ninguém abriu um workflow | `ESTADO.md:28`; `PLANO-ESTADO.md` Fase 4C nunca executada | **Alto.** 138 automações em produção que o inventário não conhece. Qualquer refactor de schema pode quebrá-las em silêncio |
| **L3** | **Os 218 cron jobs — nome, dono, o que fazem** | `ESTADO.md` verificou só "qual chama edge fn" (1 de 218). `BASELINE_V4` 3.6 lista jobids sem semântica | `ESTADO.md:26-27`; `docs/decouple/CRON_FAILURES_7D.md` cobre falhas, não catálogo | **Alto.** D5 e D18 são sintomas: crons são citados como evidência sem ninguém ter a lista |
| **L4** | **Cloudflare Workers** | Declarado explicitamente como não medido, nunca retomado | `ESTADO.md:29` — *"nao verificado nesta rodada"*; `PLANO-ESTADO.md` Fase 4E | **Médio-alto.** Camada de egress inteira fora do inventário |
| **L5** | **Cruzamento objeto-de-banco → consumidor** | Ninguém liga as **323 tabelas + 380 views** de `zapp` a quem as lê. A auditoria de 06/08 **conta**, não mapeia; `docs/estado/` lista tabelas por arquivo, nunca o inverso | `PLANO-ESTADO.md` Fase 2C (*"RPCs, triggers, views, RLS declaradas"*) — não iniciada | **Alto.** Impossível responder "posso dropar esta view?". As 511 views de `public` são pura caixa-preta |
| **L6** | **Cobertura de policy RLS por tabela** | Detecção **ad-hoc**: 6 achados independentes em 6 documentos diferentes, nenhuma varredura. `CLAUDE.md` publica "100%" com outro significado (D17) | D17; `PLANO-ESTADO.md` Fase 2C | **Alto.** Cada policy faltante é uma feature que falha com 403 silencioso |
| **L7** | **Feature flag → consumidor no código** | `FEATURE_REGISTRY.md:342-360` lista 17 flags e o "impacto" **presumido**; nenhum acervo faz `flag → arquivo que a lê` | D19 (3 flags ON com **zero** ocorrência em `src/`) | **Médio.** Flags ligadas sem código e código atrás de flag inexistente são indistinguíveis hoje |
| **L8** | **Cobertura de teste real** | 2 documentos (`28`, `29`) auditam **arquivos** de teste; ninguém rodou nada nem mediu cobertura | `17-...md` A3 — *"**Testes fantasma: cobertura ilusória de CI**"*; `28-...md` A2 (teste em runner Deno que **não roda** em Vitest); `29-...md` A3/A4 (*"STUB com cobertura zero"*) | **Médio.** O CI verde não significa o que parece |
| **L9** | **Série temporal da topologia `evo`×`zapp`** | Cada documento fotografa um instante e apaga o anterior. A topologia mudou **3× em 7 dias** e nenhum arquivo registra a sequência | D1, D14; `_ERRATA-TOPOLOGIA.md` §0 é a primeira tentativa | **Alto.** Sem série, todo leitor futuro repetirá o erro de D1 |
| **L10** | **Divergência migration × banco (drift), como processo** | `ESTADO.md` P3 nomeia o problema (*"Nada verifica se o que foi declarado esta de fato ligado"*) e mostra 4 casos; existem gates (`drift-gate`, `decouple-guard`) mas nenhum inventário de drift | `ESTADO.md:273-277` (P3) | **Médio-alto.** É a classe de defeito que gerou D5, D18 e o grupo E |

> **O que esta onda está fechando:** L5 parcialmente (`36-backend-edge-functions.md` mapeia
> `.from()`/`.rpc()` por edge function) e Fase 3 (`38-infra-ci-scripts.md`). **L1, L2, L3, L4,
> L6, L7, L8 continuam abertas depois desta onda.**

---

## 6. Arquitetura documental alvo

### 6.1 Diagnóstico da causa

A fragmentação **não** veio de falta de disciplina. Veio de três ausências estruturais:

1. **Nenhum documento declara a sua pergunta.** `ESTADO.md` é o único que declara
   (L9-11: *"Fonte unica de verdade sobre estado operacional, nao sobre arquitetura"*) — e é,
   não por acaso, o mais confiável dos quatro.
2. **Nenhum documento declara a sua data de validade nem o seu método de refresh.** Todos têm
   data de geração; nenhum tem "reexecutar com X" no topo, exceto `ESTADO.md:226`.
3. **Nenhum documento cita outro.** Quatro auditorias em 10 dias, zero referências cruzadas
   sistemáticas. Cada agente novo achou que estava começando do zero — e estava.

### 6.2 Alvo: quatro fontes de verdade, uma pergunta cada, sem sobreposição

| Documento | **Única** pergunta que responde | Unidade | Refresh | O que é **proibido** conter |
|---|---|---|---|---|
| **`FEATURE_REGISTRY.md`** | *"Que capacidade de negócio o sistema deveria ter, e em que estado ela está?"* | Recurso atômico de negócio | Manual, por PR que muda comportamento | Contagem de linhas de tabela · nome de componente sem caminho · nome de cron/edge fn não verificado |
| **`ESTADO.md`** | *"O que está ligado e quem chama?"* | Edge fn · cron · workflow · worker | `node scripts/audit-edge-callers.mjs` — **em CI, semanal** | Arquitetura · plano · roadmap · histórico de sessão *(já é a regra do arquivo; hoje é violada — L242-529 são 288 linhas de log de sessão)* |
| **`docs/estado/`** | *"Que arquivos existem, quem os importa, o que cada um faz?"* | Arquivo de código | Por bloco, quando o diretório muda materialmente | Veredito de negócio · classificação Full/Partial · qualquer afirmação de runtime |
| **`docs/decouple/`** | *"Onde está a fronteira `evo`×`zapp` hoje?"* | Invariante I1–I9 | `ops.fn_boundary_audit()` — **diário, automático** | Inventário funcional · inventário de arquivos |

**`docs/audit-2026-08-06/` deve ser congelado e renomeado** para
`docs/audit/2026-08-06-container-x-supabase/`, com um banner no topo:
*"SNAPSHOT HISTÓRICO — não reflete produção. Valores superados: cron 151→218 (D12), evo 136→ver
ADR-I4 (D14), audio-memes public=false→true (D11)."* Ele não é uma fonte de verdade; é um
registro de uma auditoria pontual, e hoje engana por parecer corrente.

### 6.3 Três mecanismos, sem os quais nada disso se sustenta

**M1 — Cabeçalho obrigatório e uniforme em todos os quatro.** Quatro campos, no topo:

```
PERGUNTA:   <a única pergunta que este documento responde>
VALIDADE:   <data> — expira em <N> dias
REFRESH:    <comando exato que regenera este documento>
NAO CONTEM: <ver tabela §6.2 — e o documento que contém>
```
`ESTADO.md` já tem 3 dos 4 informalmente. Formalizar e propagar.

**M2 — Um índice de 30 linhas na raiz: `INVENTARIO.md`.** Não é um quinto inventário — é um
roteador. Contém apenas a tabela da §6.2 mais os links, e responde à pergunta que
custou a esta onda o seu maior esforço: *"onde eu procuro isto?"*. Todo documento novo de
inventário registra-se aqui ou não existe. `CLAUDE.md` aponta para ele em vez de replicar
contagens (que é a origem de D9, D12, D14, D17).

**M3 — O único gate que importa: `evidência-ou-vazio`.** Toda linha de `FEATURE_REGISTRY.md`
que afirme uma camada **cita `caminho:linha`, nome exato de objeto de banco, ou nome exato de
diretório em `supabase/functions/`** — e um check de CI valida a existência de cada
referência. Onde não houver evidência assim, a célula fica **vazia** e a classificação **cai
para `🟦 Suggested`**. Este único gate teria bloqueado D3, D5, D18 e D22 na origem — 
**12 das 22 divergências desta matriz**.

### 6.4 O que fazer com o número que o dono pediu

`FEATURE_REGISTRY.md` deve trocar o Resumo Executivo estimado (D2) por contagem derivada do
corpo, com uma quarta classe:

| Classificação | Definição | Hoje |
|---|---|---|
| ✅ **Full** | Fio íntegro **e** cada camada com evidência verificada por CI | **88** (110 − 22 da §4.4) |
| 🟨 **Partial** | ≥1 camada real, falta algo identificado | **55 + 22 = 77** |
| 🟦 **Suggested** | Só menção textual/DB | **15 + 3** (D19) = **18** |
| ⚠️ **Declarado-sem-lastro** *(nova)* | Evidência citada não existe no repo | **9** (§4.1) — hoje contadas como Full |

Ou seja: a resposta honesta à pergunta original é **≈88 de 181 recursos prontos (49%)**, não
"~45 de ~131 (35%)" nem "110 de 181 (61%)". As duas leituras que circulam hoje estão erradas
em direções opostas.

---

## 7. Achados

| ID | Achado | Evidência | Sev. |
|---|---|---|---|
| **A1** | **`CLAUDE.md` regra 4 está errada desde 2026-08-16 11:50Z e induz a quebrar Realtime.** Manda usar `schema: 'zapp'` + `evolution_messages`; `zapp.evolution_*` são **views** desde o move E73-E75, e views nunca emitem WAL | `CLAUDE.md` regra 4 × `supabase/migrations/20260816250003_decouple_e73_e75_i4_zero.sql:17,41,45` + `docs/decouple/ADR-I4-ROTA-A-MANTIDA.md` §3 (`I4_tabelas_evolution_fora_de_evo: 0`). Tratamento canônico já produzido em `docs/estado/_ERRATA-TOPOLOGIA.md` | 🔴 CRÍTICA |
| **A2** | **20% das features `✅ Full` têm lastro comprometido** — 9 com evidência inexistente, 13 com UI decorativa/dado fictício/RLS bloqueando. Concentradas em SLA, filas, dashboards e automações agendadas: as que falham **sem erro visível** | §4.1 e §4.2 deste documento (22 linhas, cada uma com registry:linha + `docs/estado`:achado) | 🔴 CRÍTICA |
| **A3** | **A coluna "Evidência Camada UI" do `FEATURE_REGISTRY.md` não é evidência.** 0 de 20 nomes amostrados existem como arquivo ou export em `src/`, contra a promessa anti-alucinação do L9 | `FEATURE_REGISTRY.md:9` × varredura de `src/` (20/20 ausentes). Causa raiz de D8, D19, D22 | 🔴 CRÍTICA |
| **A4** | **A trilha de auditoria de transferência de conversa grava um valor literal.** `transferred_by: 'Support Agent'` hardcoded — a feature está marcada `✅ Full` em duas linhas do registry | `docs/estado/17-...md` A5 + `_HANDOFF.md` §6 × `FEATURE_REGISTRY.md:108,232` | 🟠 ALTA |
| **A5** | **A tela principal do produto exibe números fictícios.** XP/coins/streak hardcoded; heatmap com `response_time`/`satisfaction` sempre zero; `SatisfactionMetrics` com `dataUnavailable = true` | `docs/estado/16-...md` A3, A4, A5 × `FEATURE_REGISTRY.md:249` (`✅ Full`) | 🟠 ALTA |
| **A6** | **O 2FA marcado `✅ Full` tem dois furos:** backup codes sem persistência (irrecuperáveis) e check de MFA pós-login *best-effort* com `catch` silencioso que **contorna o segundo fator** em falha de rede | `docs/estado/04-...md` A2, A8 × `FEATURE_REGISTRY.md:241,295` | 🟠 ALTA |
| **A7** | **`ESTADO.md` viola a sua própria "Regra permanente".** 3 edge functions no disco desde 2026-08-14 (`evolution-group-sync`, `evolution-notification-dispatcher`, `evolution-proxy`) não estão declaradas em nenhum grupo | `ESTADO.md:221` × disco (`comm` disco×ESTADO) — reconciliação detalhada em `docs/estado/36-backend-edge-functions.md` §3 | 🟠 ALTA |
| **A8** | **`ESTADO.md` publica um score de desacoplamento 5 medições atrás** (T0 = 3/9, "próxima T1") quando existem T2–T5 e um ADR pós-I4 com quadro materialmente diferente | `ESTADO.md:14,33-58` × `docs/decouple/BOUNDARY_SCORE_T5.json` (22%, grade F) × `ADR-I4-ROTA-A-MANTIDA.md` §3 | 🟠 ALTA |
| **A9** | **"RLS 100%" do `CLAUDE.md` significa "RLS habilitada", não "policies completas"** — e 6 features quebram em produção por policy ausente, com 403 silencioso | `CLAUDE.md` (tabela de schemas) × `docs/estado/` 09-A1, 19-A1, 21-A4, 23-A2, 26-A1, 27-A2 | 🟠 ALTA |
| **A10** | **O headline number do inventário funcional está errado por 2,4×.** Resumo diz ~45 Full/~131 total; o corpo tem 110 Full/181 linhas. É este número que responde à pergunta do dono | `FEATURE_REGISTRY.md:18-21` × corpo L31-309 (contagem mecânica da coluna Class.) | 🟠 ALTA |
| **A11** | **Duas linhas `✅ Full` apoiam-se em edge functions inexistentes** (`onboarding`, `sla-alert`) — e a linha 284 já se auto-qualifica como "suspeita" | `FEATURE_REGISTRY.md:102,284` × `supabase/functions/` (ambos ausentes) | 🟠 ALTA |
| **A12** | **Os dois números de "órfão" que circulam são falsos positivos metodológicos.** As "128 páginas órfãs" são alcançáveis via `lazyViews → ViewRouter → AppShell`; dos "189 componentes órfãos", o próprio acervo classifica só 7 como acionáveis | `docs/estado/01-frontend.md` × `src/components/layout/AppShell.tsx:7,26,201`; `_HANDOFF.md` §3 × `_ORFAOS-1C-consolidado.md` | 🟡 MÉDIA |
| **A13** | **Três feature flags estão ON em produção com superfície zero** (`instagram_channel`, `telegram_channel`, `media_library`) — nenhuma ocorrência em 1.758 arquivos de `src/` | `FEATURE_REGISTRY.md:217,218,272,349,350,352` × busca nos 31 documentos de `docs/estado/` | 🟡 MÉDIA |
| **A14** | **Três telas de integração são stub navegável em produção sem feature flag e sem entrada no inventário funcional** (Google Calendar, n8n, Sentry) | `docs/estado/20-...md` A7 × `FEATURE_REGISTRY.md` Domínio 10 (não as lista) | 🟡 MÉDIA |
| **A15** | **A auditoria de 06/08 afirma, com ✅ RESOLVED, um estado de bucket oposto ao de produção.** `audio-memes public=false` foi revertido para `true` no mesmo dia, por decisão do dono | `docs/audit-2026-08-06/reconciliation.json` (DADO-05) × `supabase/migrations/20260806194000_audio_memes_bucket_public.sql` + `CLAUDE.md` | 🟡 MÉDIA |
| **A16** | **`reconciliation.json` não é o dado estruturado do `EXECUTIVE_SUMMARY`** — diverge na contagem (P1 4×5) e tem 17 findings para 40 checks. Automação em cima dele produz outra auditoria | `docs/audit-2026-08-06/reconciliation.json` × `EXECUTIVE_SUMMARY.md:17-23` | 🔵 BAIXA |
| **A17** | **`ESTADO.md` viola a sua própria regra de escopo.** L9-11 proíbem "plano, arquitetura ou roadmap"; as linhas 242-529 (**54% do arquivo**) são log narrativo de sessão (P1–P7, dedupe, cleanup) que pertence a `docs/CHANGELOG_SESSIONS.md` | `ESTADO.md:9-11` × `ESTADO.md:242-529` | 🔵 BAIXA |
| **A18** | **Após esta onda, 7 das 10 lacunas continuam abertas** — runtime, n8n (138 ativos), catálogo de crons (218), Cloudflare Workers, policies RLS, flag→consumidor e cobertura de teste. Nenhuma é resolvível por leitura estática | §5, L1–L4, L6–L8 | 🟠 ALTA |

---

### Ações mínimas, em ordem (nenhuma executada por este agente)

1. **Corrigir `CLAUDE.md` regra 4** aplicando `docs/estado/_ERRATA-TOPOLOGIA.md` §0, **após** o
   gate SQL que a errata exige. É a única divergência que pode quebrar produção hoje (A1).
2. **Recontar o Resumo Executivo do `FEATURE_REGISTRY.md`** a partir do corpo e adicionar a
   classe ⚠️ Declarado-sem-lastro (A10, A2, §6.4). Sem isto, o dono continua com o número errado.
3. **Reclassificar as 9 linhas da §4.1** — evidência inexistente não é `✅ Full` (A11).
4. **Adicionar as 3 edge functions faltantes ao `ESTADO.md`** e recontar A–F (A7), aproveitando
   a correção já pronta em `36-backend-edge-functions.md` §3.
5. **Atualizar a seção de desacoplamento do `ESTADO.md`** para o pós-I4 (A8).
6. **Congelar `docs/audit-2026-08-06/`** com banner de snapshot histórico (A15, §6.2).
7. **Criar `INVENTARIO.md`** (M2) e propagar o cabeçalho de 4 campos (M1).
8. **Implementar o gate `evidência-ou-vazio`** (M3) — bloqueia 12 das 22 divergências na origem.

---

*Fase 5 — reconciliação. Somente leitura. Nenhum dos acervos foi alterado.*
*Divergências afirmadas: 22, todas com as duas fontes citadas.*
*Runtime: NAO_VERIFICADO — nenhuma consulta a banco foi feita por este agente.*
