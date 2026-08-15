# ENSAIO F5 OPERACIONAL — 2026-08-15

> **Escopo:** Plano V4-FINAL (`PLANO_DESACOPLAMENTO_V4_FINAL_100_ETAPAS_20260814.md`), etapas **53–62**.
> **Referência de scorecard:** `SCORECARD_V4.md`, dimensão 9 ("Prova de troca de provider"), critério de fechamento: *"concluir F5 (piloto registry + ensaio operacional cronometrado) e registrar tempo/evidência aqui"*.
> **Base:** commit `f383d197d` (main em 2026-08-15). Execução: `DENO_ENV=test`, sem rede — nenhuma chamada real à Evolution API em nenhum passo deste ensaio.
> **Não repetido aqui:** o ensaio de mesa (`supabase/functions/_shared/__tests__/ensaio-fake.test.ts`, PR #1082) já cobre contrato/shapes/normalizer/benchmark de mesa — ver `docs/decouple/ENSAIO_V4_LOG.md` §"Divisão de cobertura". Este documento cobre apenas o que o de mesa não mede: tempo de resolução via registry, tempo por verbo com validação contra o contrato Zod real, e rollback cronometrado com prova de identidade.

---

## 0. Correção factual necessária antes de reportar

O prompt desta tarefa (e o `SCORECARD_V4.md` na revisão de 2026-08-14) afirmava **"hoje 0 functions consomem `resolveProvider()` em runtime"**. Isso está **desatualizado**: o PR #1085 ("onda 3 — coverage report, **piloto registry**, ADR-011...") já está mergeado na `main` (commit `8e9361c06`) e `supabase/functions/evolution-proxy/index.ts` já resolve o client via `registry.getProviderClient()` para os verbos genéricos `get`/`post` desde então — com fallback explícito para `evolutionClient` se o registry lançar (mesmo padrão usado aqui). Esse fato já está registrado corretamente em `ENSAIO_V4_LOG.md` (linha 7: *"a proxy evolution-proxy já consome o registry (piloto #34 mergeado)"*).

**O que este PR adiciona, então, sem duplicar o piloto existente:**

1. Um **segundo consumidor**, distinto do `evolution-proxy` (que usa apenas os verbos genéricos `get`/`post`): `connection-test/index.ts` agora resolve o **verbo tipado `getConnectionState`** via registry — atrás de uma flag de ambiente dedicada e nova (`REGISTRY_PILOT_CONNECTION_STATE`), com o mesmo padrão de defesa em profundidade (fallback para `evolutionClient` se o registry lançar).
2. O **ensaio cronometrado operacional** (etapas 57–60) em si, que nunca havia sido executado — `ENSAIO_V4_LOG.md` era um template vazio ("NUNCA EXECUTADO").

---

## 1. Piloto do registry — `connection-test`

**Arquivo:** `supabase/functions/connection-test/index.ts`
**Verbo:** `getConnectionState` (read-only, baixo risco — apenas consulta o estado da instância, sem efeito colateral).
**Flag:** `REGISTRY_PILOT_CONNECTION_STATE`

| Estado da flag | Comportamento |
|---|---|
| Ausente ou `!= '1'` (**default**) | `evolutionClient.getConnectionState()` direto — caminho antigo, byte a byte igual ao que já rodava em produção. |
| `'1'` | Resolve via `getProviderClient().getConnectionState()`. Fora de `DENO_ENV=test` o registry **sempre** retorna o `evolutionClient` real (guard absoluto já existente no registry) — resultado idêntico ao caminho antigo. Só desvia para o `fakeProvider` dentro de `DENO_ENV=test` + `PROVIDER_UNDER_TEST=fake`. |
| Registry lança exceção | Fallback explícito para `evolutionClient` (defesa em profundidade, mesmo padrão do `evolution-proxy`). |

Diff mínimo: 1 import novo, 1 função helper (`resolveConnectionStateClient`), 1 linha de call-site trocada. Nenhuma outra linha de `connection-test/index.ts` foi tocada.

**Teste:** `supabase/functions/connection-test/__tests__/registry-pilot.test.ts` — 5 casos cobrindo os 4 estados da tabela acima + o guard absoluto fora de `DENO_ENV=test`. Resultado: **5 passed | 0 failed (9ms)**.

---

## 2. Ensaio cronometrado — tempos medidos

Execução: `DENO_ENV=test deno test --allow-net --allow-env --allow-read supabase/functions/_shared/__tests__/ensaio-f5-operacional.test.ts`
Ambiente: container `claude-code` (VPS AtomicaBR), Deno 2.8.2, sem acesso de rede exercido (nenhuma chamada real feita — apenas resolução de referências e chamadas ao `fakeProvider`, que lança se `DENO_ENV != test`).
Resultado: **4 passed | 0 failed (46ms)**.

### 2.1 Tempo de resolução do provider (`registry.getProviderClient()`)

| Passo | Resolveu | Tempo medido |
|---|---|---|
| 1. Baseline (sem flag) | `evolution` | **0.1984 ms** |
| 2. Troca (`PROVIDER_UNDER_TEST=fake`) | `fake` | **0.0878 ms** |
| 3. Rollback (flag removida) | `evolution` | **0.0060 ms** |

Passo 3 comparado ao passo 1 por **identidade de objeto** (`===`), não por comparação estrutural — prova mais forte de que o rollback devolve exatamente o mesmo client, não uma cópia com shape parecido.

### 2.2 Tempo por verbo (12/12) + validação contra o contrato Zod real

Cada verbo foi chamado no `fakeProvider` (sob `PROVIDER_UNDER_TEST=fake`) com um payload conforme às fixtures reais documentadas em `contract-fixtures.test.ts`, e o campo `data` da resposta foi validado com `evolutionGatewayContract[verbo].response.safeParse()` — o **mesmo schema Zod usado no CI** (`verb-contract-gate` / `contract-fixtures.test.ts`), não uma comparação manual à parte.

| Verbo | Tempo | Contrato |
|---|---:|:---:|
| sendText | 0.0809 ms | PASS |
| sendMedia | 0.0655 ms | PASS |
| sendSticker | 0.0639 ms | PASS |
| getConnectionState | 0.0585 ms | PASS |
| getQrCode | 0.0507 ms | PASS |
| restartInstance | 0.0657 ms | PASS |
| listInstances | 0.0587 ms | PASS |
| listGroups | 0.0569 ms | PASS |
| checkWhatsApp | 0.0496 ms | PASS |
| getProfilePicture | 0.0649 ms | PASS |
| get | 0.0425 ms | PASS |
| post | 0.0572 ms | PASS |
| **Total (12 verbos)** | **0.7149 ms** | **12/12 PASS** |

Pior verbo: `sendText` (0.0809 ms) — ordens de grandeza abaixo de qualquer orçamento de latência de edge function (sub-milissegundo total para os 12 verbos combinados, sem rede).

### 2.3 Degradação forçada

`fakeProvider.mock('sendText', { ok:false, status:500, error:'ensaio F5: erro forçado' })` → chamador recebeu `{ ok:false, error:'ensaio F5: erro forçado' }` sem exceção não tratada. Comportamento documentado: um chamador real (ex.: `connection-test`) trataria isso como `status: "fail"` no check correspondente, sem derrubar a function — mesmo padrão já usado pelos `checks[]` de `connection-test/index.ts`.

### 2.4 Rollback — prova estrutural adicional

Após o ciclo evolution→fake→evolution, os 12 verbos do contrato continuam presentes como funções no client resolvido (`typeof client[verbo] === 'function'` para os 12) — sem drift estrutural introduzido pela troca/rollback.

---

## 3. O que este ensaio cobre e o que não cobre

**Cobre:**
- Tempo de resolução do provider via registry nos 3 momentos da troca (baseline/troca/rollback).
- Tempo de execução dos 12 verbos do contrato sob o `fakeProvider`.
- Validação de shape pós-troca contra o contrato Zod real (`evolutionGatewayContract`), não uma verificação manual paralela.
- Rollback cronometrado com prova de identidade de objeto (mais forte que comparação de shape).
- 1 caso de degradação forçada, documentado.
- Um segundo consumidor real do registry (`connection-test`, verbo tipado `getConnectionState`), atrás de flag OFF por default.

**Não cobre (fora de escopo deste PR, ver §0 e restrições da tarefa):**
- Ensaio contra a Evolution real (produção) — este ensaio é 100% `DENO_ENV=test`, sem rede, por desenho (etapas 55/57 do plano pedem container efêmero isolado para a versão com rede real; não executado aqui).
- Os passos 5–8 do runbook operacional completo (migração de webhook de entrada, congelamento de ingestão, migração das 5 fns SQL, soak de 24h) — esses dependem de infraestrutura de produção/container efêmero na VPS e estão fora do escopo "sem rede" desta tarefa.
- Adoção do registry em massa além dos 2 pilotos existentes (`evolution-proxy` verbos genéricos + `connection-test.getConnectionState`) — decisão explícita do plano (F5 não escala adoção, ver "O que este plano deliberadamente NÃO faz").

---

## 4. Veredito para a dimensão 9 do SCORECARD_V4

Critério do documento (linha 83, `SCORECARD_V4.md`): *"concluir F5 (piloto registry + ensaio operacional cronometrado) e registrar tempo/evidência aqui. Nota 8 é o teto honesto até lá."*

- **Piloto registry**: já existia 1 consumidor real (`evolution-proxy`, PR #1085, mergeado antes desta sessão); este PR adiciona um **segundo consumidor** com verbo tipado (`connection-test.getConnectionState`), atrás de flag OFF por default — reforça, não substitui, a prova de #34.
- **Ensaio operacional cronometrado**: executado nesta sessão pela primeira vez (o `ENSAIO_V4_LOG.md` seguia como template nunca executado) — tempos reais capturados em §2, sem rede, com validação contra o contrato Zod real e rollback provado por identidade de objeto.

**Veredito honesto:** os dois itens do critério de fechamento da dimensão 9 (piloto + ensaio cronometrado com tempo/evidência) estão satisfeitos **na versão "mecanismo provado e ensaiado com provider substituto controlado, sem rede"** — não "ensaio operacional contra produção real via container efêmero" (etapas 55/57 completas com infraestrutura de VPS) nem "Cloud real (Meta) em produção" (etapa 62, decisão explícita pendente com Joaquim, fora do escopo desta tarefa). Recomenda-se subir a dimensão 9 de **8/10 para 9/10** — não 10/10, pois o ensaio com container efêmero na VPS (infraestrutura real, ainda que isolada) e a decisão sobre Cloud real (etapa 62, item `[⛔]`) permanecem pendentes e exigem aprovação explícita de Joaquim antes de execução.
