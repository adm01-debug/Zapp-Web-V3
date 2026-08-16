# Errata de topologia — docs/estado/ (base 2026-08-09 → verdade 2026-08-16)

> Produzida por E9. **Correções NÃO aplicadas** — aguardam revisão do orquestrador.
> Escopo de escrita de E9: apenas este arquivo. Nenhum dos 30 documentos foi tocado.

---

## 0. ⚠️ CORREÇÃO DE PREMISSA — leia antes de aplicar qualquer coisa

**A premissa passada a esta onda de agentes está desatualizada em ~3 horas e está invertida.**

O briefing desta onda afirma como "verdade atual medida ao vivo em 2026-08-16":

> `zapp.evolution_messages` / `_conversations` são tabelas físicas particionadas; `zapp.evolution_contacts`
> é tabela física; `evo.evolution_messages|contacts|conversations` **NÃO EXISTEM**; subscription
> em `evo` recebe ZERO eventos.

Isso era verdade **até 2026-08-16 11:50Z**. Às 11:50Z a topologia foi **invertida de volta** e a
mudança **já está aplicada em produção**. A medição que originou o briefing é anterior ao move.

### Topologia real agora (pós-11:50Z)

| Objeto | Estado agora |
|---|---|
| `evo.evolution_messages` | **tabela física**, raiz particionada (+ `_wpp2`, `_default`) |
| `evo.evolution_conversations` | **tabela física**, raiz particionada (+ 6 partições) |
| `evo.evolution_contacts` | **tabela física** regular (não particionada) |
| `zapp.evolution_*` (11 relações) | **VIEWS** bridge `security_invoker=true` → `SELECT * FROM evo.*` |
| Realtime | relação física está em `evo` → `schema: 'evo'` + **raiz** está **CORRETO** |
| `authenticated` em `evo.*` | **REVOKE** aplicado — app acessa via bridge views em `zapp` |

### Evidência (100% repo-side; E9 não teve acesso ao banco, conforme regra 3)

| # | Evidência | Referência |
|---|---|---|
| E1 | Migration do move + bridge views, cabeçalho `-- JA APLICADA em producao 2026-08-16` | `supabase/migrations/20260816250003_decouple_e73_e75_i4_zero.sql:17-56` |
| E2 | Commit do move, 08:50 -03 = **11:50Z** | `a3c1dc952` "E73-E75 I4=0 — move 3 tabelas zapp->evo via ALTER SET SCHEMA + bridge views" |
| E3 | Snapshot do schema regenerado pós-move: `CREATE OR REPLACE VIEW zapp.evolution_messages … FROM evo.evolution_messages;` | `scripts/decouple/snapshots/zapp_schema_snapshot.sql:41045,41100,41422` (commit `9348e7ab4`) |
| E4 | ADR de decisão do dono, com verificação em produção às 12:12Z (`I4_tabelas_evolution_fora_de_evo: 0`) | `docs/decouple/ADR-I4-ROTA-A-MANTIDA.md` (commit `fe2298599`) |
| E5 | `docs/estado/` foi importado às 12:48Z — **depois** do move | commit `43cec38bf` |

**Consequência para esta errata:** a maior parte das ~30 ocorrências de `evo.evolution_*` nos 30
documentos **voltou a estar correta** e **não deve ser alterada**. Aplicar o briefing literalmente
teria introduzido ~25 erros novos e teria empurrado devs a quebrar Realtime que hoje funciona.

**GATE OBRIGATÓRIO:** antes de aplicar qualquer item da seção 2, revalidar ao vivo:
```sql
SELECT n.nspname, c.relname, c.relkind
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname LIKE 'evolution_%' AND n.nspname IN ('zapp','evo')
ORDER BY 1,2;   -- esperado: evo → relkind 'p'/'r' ; zapp → relkind 'v'
```
Se o resultado divergir da tabela acima, **descartar esta errata e refazê-la** — a topologia mudou
3 vezes em 7 dias (09/08 evo-raiz → ~11-15/08 zapp-físico → 16/08 11:50Z evo-raiz).

---

## 1. Resumo

| Métrica | Valor |
|---|---|
| Ocorrências de `evo.evolution_*` inspecionadas em `docs/estado/` | 30, em 16 arquivos |
| **Correções reais propostas** | **6** (em 5 arquivos) + 1 nota global |
| — ALTA | 0 |
| — MÉDIA | 3 |
| — BAIXA | 3 |
| **Falsos positivos descartados** (corretos hoje — NÃO corrigir) | **24**, em 14 arquivos |
| Correções fora dos 30 documentos (recomendação) | `CLAUDE.md` + 3 docs de agentes irmãos (`31-`, `32-`, `36-`) |
| Itens de agentes irmãos contaminados pela premissa, em curso agora | 3 (seção 4.2 — 1 🔴 executável, 2 🟠 documentais) |

Nenhum item ALTA sobrou **dentro dos 30 documentos**: o risco ALTA desta onda migrou para o
arquivo 31 de um agente irmão (seção 4.2), que está prestes a quebrar Realtime em produção.

---

## 2. Tabela de correções

Todas MÉDIA/BAIXA e todas de **precisão**, não de erro de schema. O padrão comum: o documento
descreve o acesso do app como se fosse direto em `evo.*`; hoje o app **não tem grant em `evo.*`**
(REVOKE em `20260816250003`) e `evo` não está exposto no PostgREST — leitura/escrita do app passa
obrigatoriamente pela bridge view em `zapp`.

| # | arquivo | linha | texto atual | texto corrigido | severidade | razão |
|---|---|---|---|---|---|---|
| 1 | `docs/estado/24-hooks-raiz-2.md` | 110 | `` `evolution_messages` (acessada via view zapp e diretamente) `` | `` `evolution_messages` (tabela física em `evo`; app acessa **somente** via view-bridge `zapp.evolution_messages`, `security_invoker=true` — `authenticated` não tem grant em `evo.*` e `evo` não é exposto no PostgREST) `` | MÉDIA | "e diretamente" descreve caminho hoje impossível para o frontend: `REVOKE ALL ON evo.* FROM authenticated` (migration `20260816250003`) + `evo` fora do PostgREST (`PGRST205`). |
| 2 | `docs/estado/25-hooks-raiz-3.md` | 92 | `` - `useRealtimeMessages` → `evo.evolution_messages` (realtime INSERT/UPDATE), `zapp.evolution_contacts` `` | `` - `useRealtimeMessages` → `evo.evolution_messages` (realtime INSERT/UPDATE), `zapp.evolution_contacts` (view-bridge → `evo.evolution_contacts`) `` | MÉDIA | A metade Realtime está certa. `zapp.evolution_contacts` deixou de ser tabela e virou view em 16/08 11:50Z; sem a nota, induz a crer que há tabela física em `zapp`. |
| 3 | `docs/estado/06-features-inbox-hooks.md` | 340 | `` \| `evolution_messages` \| view zapp / schema evo (realtime) \| SELECT (RPC), realtime sub \| `useMessagesCursor.ts`, `useRealtimeMessages.ts` \| `` | `` \| `evolution_messages` \| física em `evo`; view-bridge em `zapp` (SELECT/RPC) + `schema: 'evo'` na raiz (realtime) \| SELECT (RPC), realtime sub \| `useMessagesCursor.ts`, `useRealtimeMessages.ts` \| `` | MÉDIA | Formulação ambígua ("view zapp / schema evo") não deixa claro qual caminho serve a quê. Com a topologia oscilando, a ambiguidade é o que gera o erro seguinte. |
| 4 | `docs/estado/17-components-teamchat-monitoring.md` | 289 | `Não está claro se aponta para `evo.evolution_messages` ou tabela em `zapp`.` | `` `dbFrom` usa o client default (`schema: 'zapp'`), logo resolve na view-bridge `zapp.evolution_messages` → tabela física `evo.evolution_messages`. `` | BAIXA | Dúvida hoje resolvível sem consultar o banco; deixá-la aberta convida a nova investigação redundante. |
| 5 | `docs/estado/19-components-layout-...-notifications.md` | 166-167 | `→ AbandonmentRate → useAbandonmentRateData → evo.evolution_messages` / `→ ConversationHeatmap → useConversationHeatmap → evo.evolution_contacts/messages` | idem, com sufixo ` (via view-bridge zapp.*)` em ambas as linhas | BAIXA | Fisicamente correto; imprecisa quanto ao caminho de acesso do app. Puramente cosmético. |
| 6 | `docs/estado/28-hooks-tests-1.md` | 81, 167 | `` tabelas `contact_intelligence`, `evo.evolution_messages` `` / `` \| `evo.evolution_messages` \| useContactIntelligence.simulacao \| `` | idem, com ` (via view-bridge zapp.*)` | BAIXA | Mesma imprecisão do item 5, em contexto de teste. |

### 2.1 Nota global recomendada (1 item, alto valor / risco zero)

Inserir no topo de **`_HANDOFF.md`** e **`_PROGRESSO.md`** (e idealmente como banner em `01-frontend.md`):

```markdown
> **Nota de topologia (2026-08-16).** Estes documentos foram escritos em 2026-08-09. A localização
> física das tabelas `evolution_messages` / `_conversations` / `_contacts` oscilou entre os schemas
> `evo` e `zapp` três vezes em 7 dias. Estado vigente desde 2026-08-16 11:50Z: **tabelas físicas em
> `evo`**, **views-bridge `security_invoker=true` em `zapp`**, Realtime na **raiz em `schema: 'evo'`**.
> Fontes: `docs/decouple/ADR-I4-ROTA-A-MANTIDA.md` e migration `20260816250003_decouple_e73_e75_i4_zero.sql`.
> Antes de agir sobre qualquer afirmação de schema neste diretório, confirme a topologia vigente.
```

Isto resolve o problema de fundo melhor do que editar 30 menções: o defeito dos documentos não é
o schema citado — é a **ausência de carimbo de data** num fato que se provou volátil.

---

## 3. Falsos positivos — menções a `evo` que estão CORRETAS (NÃO corrigir)

24 ocorrências. Sob a premissa do briefing todas seriam "ALTA — subscription no schema errado";
sob a topologia real **todas estão certas** e alterá-las causaria o dano que a onda quer evitar.

### 3.1 Realtime em `evo.evolution_*` — correto (relação física em `evo`, publication preservada por OID)

| arquivo | linha(s) |
|---|---|
| `01-frontend.md` | 743 |
| `06-features-inbox-hooks.md` | 176, 201 |
| `07-features-inbox-services.md` | 87 |
| `11-features-inbox-components-raiz-m-z.md` | 74, 105 |
| `25-hooks-raiz-3.md` | 123 |
| `26-hooks-raiz-4.md` | 50, 168 |
| `27-hooks-subdirs.md` | 94 |
| `29-hooks-tests-2.md` | 49, 82, 167 |
| `30-integrations.md` | 79, 207 (trecho Realtime) |

O ADR-I4 registra que `ALTER TABLE … SET SCHEMA` preserva o OID, então a publication
`supabase_realtime` acompanhou as tabelas. Com `publish_via_partition_root=true`, a regra vigente é
**raiz + `schema: 'evo'`**. As views em `zapp` **nunca** emitem eventos — trocar para
`schema: 'zapp'` produziria silêncio total.

### 3.2 Modelo "físico em `evo` + view em `zapp`" — correto

| arquivo | linha(s) | observação |
|---|---|---|
| `_HANDOFF.md` | 96, 98, 99, 110 | `zapp.contacts` como VIEW sobre `evo.evolution_contacts`; colunas `assigned_to`/`queue_id` físicas em `evo.evolution_contacts` (tabela normal, não particionada); FK de `queue_positions`; trigger `trg_evocontacts_dequeue` em `evo.evolution_contacts`. Todos válidos de novo — e as FKs/triggers **sobreviveram ao move por OID**, sem recriação. |
| `08-features-inbox-components-chat-2.md` | 112 | "`evo` / zapp view" descreve exatamente o arranjo atual. |
| `27-hooks-subdirs.md` | 113 | "via view zapp" — correto. |
| `01-frontend.md` | 744 | Tabelas em `evo.*` — correto. |

### 3.3 Outros — corretos e independentes de schema

| arquivo | linha(s) | por quê |
|---|---|---|
| `30-integrations.md` | 77, 196, 197, 207 | Bug de SELECT em **partição** `_wpp2` em vez da raiz. Real, ortogonal ao schema, permanece válido. |
| `22-components-pequenos-e-shared.md` | 300 | Crítica ao `z.string()` sem enum; exemplo `_wpp2` continua pertinente. |
| `05-features-admin.md` | 165, 356, 728, 731 | `evo.evolution_retry_metrics` sempre foi só de `evo` — nunca fez parte do move. |
| `06-features-inbox-hooks.md` | 150, 688, 690 | Dual-path `zapp.messages` × `evolution_messages` segue existindo. |
| `_PROGRESSO.md` | 392 | Referência ao achado A2; válida. |

---

## 4. Correções fora de `docs/estado/` — recomendação, não aplicada

### 4.1 `CLAUDE.md` (raiz) — 🟠 MÉDIA-ALTA, ficou obsoleto hoje às 11:50Z

O `CLAUDE.md` foi atualizado em 15/08 para o modelo "zapp-físico" e **esse modelo caiu em 16/08**.
Hoje ele afirma o oposto da realidade e é o primeiro arquivo que qualquer agente lê.

| Trecho atual (obsoleto) | Correção |
|---|---|
| "`zapp.evolution_messages` e `zapp.evolution_conversations` são as **tabelas físicas particionadas** e `zapp.evolution_contacts` é **tabela física** — NÃO são views" | Inverter: físicas em `evo`; `zapp.evolution_*` são views-bridge `security_invoker=true` |
| "`evo.evolution_messages`, `evo.evolution_contacts` e `evo.evolution_conversations` **NÃO EXISTEM**" | Existem, e são as tabelas físicas |
| Regra 4 (Realtime): "tabela **`evolution_messages`** (raiz física em `zapp`)… **Subscription em `schema: 'evo'` recebe ZERO eventos**" | Inverter: raiz física em `evo`; usar `schema: 'evo'`. **Este é o item de maior risco do arquivo** |
| Fonte de verdade apontando para `ANALISE_FRONTEIRA_EVO_ZAPP_20260815.md` | Acrescentar `docs/decouple/ADR-I4-ROTA-A-MANTIDA.md` como fonte **posterior e vigente** |

**Contagens de tabelas** — reportar como pendência, **não escrever número novo sem medir**:
`CLAUDE.md` diz zapp=323 / evo=136; o briefing mediu 386/70 **antes** do move; a análise de 15/08
registra 397/58. O move deslocou **11 relações** de `zapp` para `evo`. Todos os três conjuntos são
mutuamente inconsistentes e nenhum é pós-move. Recomendação: **medir e só então escrever**.

### 4.2 🔴 URGENTE — premissa desatualizada já propagada em 3 documentos de agentes irmãos

Durante a execução de E9 surgiram os arquivos `31-` a `36-`, **não rastreados** (`git status: ??`),
escritos por outros agentes desta onda **depois** do move das 11:50Z. Três já converteram a premissa
desatualizada em afirmação de fato — e um deles em recomendação de mudança de código:

| arquivo | linha(s) | o que afirma (incorreto hoje) | gravidade |
|---|---|---|---|
| `31-adapters-e-integrations-tests.md` | 36, 108-110, 123 | "`evo.evolution_conversations` não existe"; "raiz física está em `zapp`"; **recomenda trocar o código para `schema: 'zapp'`** | 🔴 quebra produção se aplicado |
| `32-services.md` | 183 (A1) | Classifica como "documentação defasada" os comentários **corretos** de `messagesRepository.ts:11,52,71-72`, que descrevem views em `zapp` sobre raiz em `evo` | 🟠 inverte certo/errado |
| `36-backend-edge-functions.md` | 320 (A8) | Marca 6 docblocks de edge functions como defasados por citarem `evo.*`, alegando que "as físicas estão em `zapp`" | 🟠 mesma inversão |

Nos três casos o alvo criticado está **correto** e a crítica é que está errada. Em `32-services.md`
e `36-backend-edge-functions.md` o dano é documental (achados a retirar); em
`31-adapters-e-integrations-tests.md` o dano é executável.

#### O caso executável (`31-`, A1/A2, linhas 100-125)

Recomenda textualmente:

> "Correção mínima: trocar `schema: 'evo'` por `schema: 'zapp'` nos 3 pontos **e** relaxar a
> asserção de A1 no mesmo commit."

**Se esse conselho for executado, o Realtime do `zappweb` para de funcionar em produção**:
`zapp.evolution_conversations` / `zapp.evolution_messages` são views, e views nunca emitem CDC.
O mesmo documento classifica como "🔴 CRÍTICO / obsoleto" um teste
(`useZappConversations.test.tsx:79-95`) que na verdade está **guardando o comportamento correto**.

**Ação recomendada ao orquestrador: interceptar antes do commit.** Os 3 pontos de código citados
(`useZappConversations.ts:61`, `useZappMessages.ts:74` e `:94`) estão **corretos como estão** e não
devem ser tocados. O bug real nesses hooks é o outro, já documentado em `30-integrations.md:196-197`:
o `from()` lê a **partição** `_wpp2` em vez da raiz.

Vale registrar que o código-fonte **nunca migrou** de `schema: 'evo'`: as ~25 subscriptions em
`src/` (ex.: `useRealtimeMessages.ts:679,701,722`, `useMessagesCursor.ts:238,264,284`,
`useTranscriptionNotifications.ts:40,47`) permaneceram em `evo` durante toda a janela em que a
tabela esteve em `zapp`. Elas estiveram de fato quebradas nesse intervalo e **voltaram a funcionar
às 11:50Z** — sem que ninguém as tocasse. Qualquer "correção" agora as quebraria de novo.

---

## 5. Recomendação de aplicação (ordem e risco)

| Ordem | Ação | Risco | Justificativa |
|:--:|---|---|---|
| 1 | **Interceptar 4.2** — sobretudo `31-` A1/A2 — antes que vire commit | — | Único item com potencial de quebrar produção; e o mais urgente por ser trabalho em curso agora. Retirar também os achados A1 de `32-` e A8 de `36-`. |
| 2 | Rodar o **GATE** da seção 0 (SQL de `relkind`) | Nenhum | Nada abaixo deve ser aplicado sem esta confirmação ao vivo. |
| 3 | Corrigir **`CLAUDE.md`** (4.1), exceto contagens | Baixo | Maior alcance por edição: é o arquivo que todo agente lê primeiro e hoje ensina o inverso da realidade. |
| 4 | Inserir a **nota global** (2.1) | Nenhum | Resolve a classe inteira do problema (falta de carimbo de data) sem tocar em 30 menções. |
| 5 | Aplicar correções **1-3** (MÉDIA) | Baixo | Precisão de caminho de acesso; sem efeito sobre código. |
| 6 | Aplicar correções **4-6** (BAIXA) | Nenhum | Cosméticas; podem ser adiadas sem prejuízo. |
| 7 | **Medir** contagens de schema e só então atualizar `CLAUDE.md` | Baixo | Três fontes divergentes, nenhuma pós-move. Escrever número não medido repetiria o defeito que esta errata corrige. |
| — | **NÃO aplicar** nada da seção 3 | — | 24 falsos positivos: já estão corretos. |

### Observação de processo

A causa-raiz não é nenhum dos 30 documentos: é que **a topologia mudou entre a redação do briefing
desta onda e a execução dos agentes**, e o briefing foi distribuído como fato verificado a 10
agentes em paralelo. Pelo menos um deles (4.2) já converteu a premissa em recomendação de mudança
de código em produção. Para ondas futuras: incluir no briefing o **timestamp e o comando de
medição**, e exigir que cada agente revalide antes de escrever — foi exatamente a lição registrada
na seção 5 do `ADR-I4-ROTA-A-MANTIDA.md`, repetida aqui em menos de 24 horas.
