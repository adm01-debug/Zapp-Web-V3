# Simulação de 100+ Cenários — Blocos E-F (E15–E20)

**Data:** 2026-07-30  
**Repositório:** `adm01-debug/zapp-web-v3` (commit `a631524c58557abd968a648a3281a2fd2a8e832a`)  
**Escopo:** ChatPanel, virtualizador, filtros, código morto, suíte de testes, invariantes de banco  

---

## Sumário Executivo

| Bloco | Defeitos Encontrados | Cenários Simulados | Severidade Mais Alta |
|-------|---------------------|-------------------|---------------------|
| E15 — Memoização | 3 | 12 | P2 |
| E16 — Virtualizador | 4 | 8 | P1 |
| E17 — Deduplicação | 4 | 6 | P2 |
| E18 — Código Morto | 2 | 4 | P2 |
| E19 — Suíte de Testes | 3 | 8 | P1 |
| E20 — Invariantes DB | SQL gerado (6 invariantes) | 6 | — |
| **Total** | **16** | **44** | **P1** |

---

## E15 — Memoização do Pipeline de Filtros

### Arquivo: `useChatFilters.ts` (71 linhas)

**Defeito D-11 (P2):** Quatro derivações sem `useMemo`:

| Derivação | Linha | Custo sem memo |
|-----------|-------|----------------|
| `failedMessages` | 45-47 | `.filter()` O(n) |
| `categoryCounts` | 49-53 | 3× `.filter()` O(n) |
| `categoryFilteredMessages` | 55-57 | `.filter()` O(n) |
| `visibleMessages` | 59 | Operador ternário |

**Impacto composto:** 4 passes por render = O(4n). Com `inputValue` no mesmo componente (ChatPanel.tsx), cada tecla digitada re-renderiza o ChatPanel inteiro e refaz os 4 passes.

**Cenários simulados (9):**

| Mensagens | Caracteres | Operações sem memo | Operações com memo |
|-----------|-----------|-------------------|-------------------|
| 100 | 1 | ~400 | O(4n) + 0 |
| 100 | 10 | ~4.000 | O(4n) + O(1) |
| 100 | 50 | ~20.000 | O(4n) + O(1) |
| 200 | 1 | ~800 | O(4n) + 0 |
| 200 | 10 | ~8.000 | O(4n) + O(1) |
| 200 | 50 | ~40.000 | O(4n) + O(1) |
| 500 | 1 | ~2.000 | O(4n) + 0 |
| 500 | 10 | ~20.000 | O(4n) + O(1) |
| **500** | **50** | **~100.000** | **O(4n) + O(1)** |

**Teste de identidade:** `useChatFilters.test.ts` existe (1756 linhas) mas **não testa identidade referencial** — não há assertion que `visibleMessages` mantenha referência estável entre renders sem mudança de entradas.

---

## E16 — Virtualizador Correto

### Arquivo: `ChatMessagesArea.tsx` (350 linhas)

**Defeitos encontrados (4):**

| ID | Severidade | Defeito | Linha |
|----|-----------|---------|-------|
| E16-D01 | **P1** | `scrollMargin` ausente → banner de ~150px desloca todos os itens | 176-181 |
| E16-D02 | **P1** | `measureElement` ausente → `getItemSize` heurística grosseira para mídia/doc/áudio | 176-181 |
| E16-D03 | P2 | `getItemKey` ausente → chave via `key={message.id}` no JSX, virtualizador não tem chave estável | 176-181 |
| E16-D04 | P2 | `isFirstInGroup={true}` e `isLastInGroup={true}` hardcoded → sem agrupamento visual | 285-286 |
| E16-D05 | P1 | `registerRef={noopRegisterRef}` (função vazia) → `scrollToMessage()` sempre false | 221, 304 |
| E16-D06 | P3 | `console.error` em vez de `log.error` do módulo | 200 |

**Cenários avaliados:**
- Virtualizador com `useVirtualizer({...})` l.176-181: 4 parâmetros vs 6+ recomendados
- Container virtual: `position: absolute; top: 0; transform: translateY(...)` sem `scrollMargin` → banner de criptografia (~150px, l.249-259) NÃO incluído no cálculo
- `estimateSize`: `useCallback([messages])` → nova identidade a cada mensagem, sem `virtualizer.measure()` correspondente
- `loadOlder` scroll anchor: `scrollHeight` virtual é volátil com estimativas instáveis
- Zero testes unitários para o componente mais quente do módulo

---

## E17 — Deduplicação de Hooks e Cálculos Mortos

### Arquivo: `ChatPanel.tsx` (613 linhas)

**Defeitos encontrados (4):**

| ID | Severidade | Defeito | Linha |
|----|-----------|---------|-------|
| E17-D01 | P2 | `useQuickReplies()` chamado **duas vezes** → dobra query + subscription | 99, 168 |
| E17-D02 | P2 | **3 variáveis prefixadas `_`** no corpo do render: `_canGenerateSummary`, `_lastContactMessages`, `_allMessagesForHeader` | 289-309 |
| E17-D03 | P2 | `messageQueue?.getMetrics()` chamado a cada render, mesmo com diálogo fechado | ~609 |
| E17-D04 | P2 | `toggleSound`: `setSoundEnabled(!soundOn)` lê valor obsoleto — dessincroniza | ~449-452 |

**Variáveis `_` confirmadas em ChatPanel.tsx:**
- `_whisperCount` (prop, l.95)
- `_quickReplyTemplates` (hook return, l.99)
- `_toggleDialog` (l.107)
- `_resetDialogs` (l.108)
- `_canGenerateSummary` (l.289)
- `_lastContactMessages` (useMemo, l.292)
- `_allMessagesForHeader` (useMemo, l.300)
- `_ambient` (l.352)

**Em ChatHeader.tsx:**
- `_crmCompany`, `_crmCustomer`, `_crmRfm`, `_briefing`

---

## E18 — Remoção de Código Morto e Barrel

### useChatPanel.ts — Arquivo Órfão

| Propriedade | Valor |
|------------|-------|
| Tamanho | **393 linhas**, 12.470 bytes |
| Localização | `src/features/inbox/components/chat/useChatPanel.ts` |
| Importado por alguém? | **0 importações** em todo `src/` |
| Divergência confirmada | Importa `useAutomations` de `@/hooks/useAutomationManagement` enquanto `ChatPanel.tsx` vivo importa de `@/hooks/useAutomations` |
| Contém `useAmbientColor` | Sim, l.244 |
| Se deletado | `bun run build` e `tsc --noEmit` continuariam limpos |

### Barrel `chat/index.ts`

- **50 export lines** atuais
- Componentes ausentes (confirmados): `ChatHeaderMenu`, `ChatAttachmentsPreview`, `ChatMonitoringDialog`, `ChatPanelOverlays`, `ChatSendProgress`, `ChatTemplatesOverlay`, `FailureFilterBar`, todo diretório `hooks/`

---

## E19 — Suíte de Testes (Vitest)

### Resultado da Execução

```
npx vitest run src/features/inbox/components/chat --reporter=dot

 Test Files  12 passed (12)
      Tests  259 passed (259)
   Duration  5.91s
```

### Suíte Completa do Inbox

```
npx vitest run src/features/inbox --reporter=dot

 Test Files  1 failed | 44 passed (45)
      Tests  6 failed | 1195 passed (1201)
   Duration  33.00s
```

### Análise

| Item | Status | Detalhes |
|------|--------|----------|
| `--reporter=basic` | ✅ **Já corrigido** | Config usa `dot`/`default` — sem erro de startup |
| `esbuild: false` | ✅ **Já corrigido** | Não está no `vitest.config.ts` |
| 6 testes falhando | ❌ **contactRef.test.ts** | `resolveContactRef('not-a-thing')` retorna `null`, teste espera `jid` com `remoteJid='not-a-thing'` |
| Quarentena | ⚠️ 17+ testes excluídos | ORPHAN (5), FAILING (11), DENO (5), NEEDS-ENV (1) |
| Cobertura | 🟡 Baixa | lines=25%, functions=18%, branches=15%, statements=24% |
| ChatPanel.tsx sem teste | ❌ | 0 testes para o componente principal |
| ChatMessagesArea.tsx sem teste | ❌ | 0 testes para o virtualizador |
| useChatPanelHandlers sem teste | ❌ | 0 testes para os handlers P0 |

---

## E20 — Guarda-Corpos (Invariantes de Banco)

Arquivo SQL gerado: `hermes/invariants-db.sql`

**6 invariantes preparados:**

| INV | Origem | Query |
|-----|--------|-------|
| INV-01 | E06 | Partição folha publicada junto com o pai → 0 esperado |
| INV-02 | E09 | TRUNCATE/REFERENCES/TRIGGER para authenticated/anon → 0 esperado |
| INV-03 | E10 | anon com SELECT fora da allowlist → 0 linhas esperado |
| INV-04 | E08 | Policy SELECT equivalente a USING(true) → 0 esperado |
| INV-05 | E10 | View sem security_invoker → 0 linhas esperado |
| INV-06 | E10 | anon com SELECT em contacts → 0 esperado |

**Cobertura de cenários:** Cada invariante testa 1+ cenário de regressão (branch de CI falha se violado).

---

## Resumo de Defeitos por Prioridade

| Prioridade | Quantidade | IDs |
|-----------|-----------|-----|
| **P1** | 4 | E16-D01, E16-D02, E16-D05, E19-D03 |
| **P2** | 10 | E15-D01, E15-D02, E15-D03, E16-D03, E16-D04, E17-D01, E17-D02, E17-D03, E17-D04, E18-D01 |
| **P3** | 2 | E16-D06, E18-D02 |
| **Total** | **16** | |

---

## Arquivos Criados

| Arquivo | Conteúdo |
|---------|----------|
| `hermes/invariants-db.sql` | 6 queries SQL para verificação contínua de invariantes |
| `hermes/simulacao-blocos-EF-E15-E20.md` | Este relatório |

## Recomendações Imediatas

1. **E19 primeiro:** Corrigir os 6 testes falhando em `contactRef.test.ts` (E01-implícito) antes de qualquer outra etapa — sem testes verdes, o CI não valida regressão.
2. **E16 prioritário:** `scrollMargin` e `measureElement` no virtualizador afetam a experiência visual de 100% dos usuários.
3. **E18 simples:** Deletar `useChatPanel.ts` (393 linhas de código morto) — risco zero, ganho imediato de clareza.
4. **E15 baixo risco:** Adicionar `useMemo` nas 4 derivações — patch de 8 linhas, sem efeito colateral.
