# Plano de Correção Exaustiva — Console Log 2026-08-03

## Análise Holística (6 Gaps)

| Gap | Impacto | Sintoma | Causa Raiz |
|-----|---------|---------|------------|
| 1 | 🔴 CRÍTICO | 429 Rate Limit em cascata (18 ocorrências) | 6 reqs concorrentes × 2 retries = 18 hits em ~1s |
| 2 | 🔴 CRÍTICO | RPCs 5-7s (rpc_list_messages_lite, get_contact_360_by_phone) | Índices faltantes no Evolution DB |
| 3 | 🟡 ALTO | 403 POST media_cache | RLS policy com WITH CHECK insuficiente |
| 4 | 🟡 MÉDIO | 23 Empty media payload | Mídia WhatsApp expirada sem skip-list |
| 5 | 🟢 BAIXO | 5x Security warning spam | Loop de useEffect com showAll persistido |
| 6 | 🟢 BAIXO | 82 HEAD conversation_tasks falhando | Sem debounce/batch, cascata do 429 |

---

## Gap 1: 429 Rate Limit — Backoff Global

**Arquivo:** `src/integrations/supabase/client.ts:282-284`
**Problema:** 6 reqs concorrentes + 2 retries cada = 18 hits quase simultâneos
**Solução:** Adicionar cooldown global de 2s após receber 429, pausando TODAS as requisições

**Checklist:**
- [ ] Adicionar `let _rateLimitCooldownUntil = 0` global
- [ ] Em `retryFetch`, ao detectar 429: setar `_rateLimitCooldownUntil = Date.now() + 2000`
- [ ] Em `_acquireSlot()`, antes de incrementar: se `Date.now() < _rateLimitCooldownUntil`, esperar a diferença
- [ ] Reduzir `MAX_CONCURRENT` de 6 para 4 durante cooldown (via variável dinâmica)
- [ ] Testar: build sem erros, sem novas importações circulares

## Gap 2: Índices para RPCs Lentas

**Arquivo:** Nova migration `20260803170000_fix_slow_rpcs_indexes.sql`
**Problema:** `rpc_list_messages_lite` e `get_contact_360_by_phone` demoram 5-7s
**Solução:** Índice composto no Evolution DB

**Checklist:**
- [ ] `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evo_msgs_jid_created ON evo.evolution_messages(remote_jid, created_at DESC);`
- [ ] Analisar plano de execução das RPCs para confirmar uso do índice
- [ ] Verificar se `get_contact_360_by_phone` tem índice em `contacts.phone` (já deve ter)

## Gap 3: 403 media_cache RLS

**Arquivo:** `supabase/migrations/archive/20260721000006_melhoria6_strengthen_insert_policies.sql:40`
**Problema:** `ALTER POLICY media_cache_insert ... WITH CHECK (auth.uid() IS NOT NULL)` pode não ser suficiente
**Solução:** Recriar policy com USING + WITH CHECK explícitos

**Checklist:**
- [ ] Verificar se a policy original tinha `FOR INSERT`
- [ ] Se não: `CREATE POLICY media_cache_insert ON zapp.media_cache FOR INSERT TO authenticated WITH CHECK (true);`
- [ ] Alternativa: adicionar fallback no `useMediaUrl.ts` para não quebrar se o cache falhar

## Gap 4: Empty Media Payload — Skip List

**Arquivo:** `src/features/inbox/hooks/useMediaUrl.ts:247`
**Problema:** 23 warnings no log, tentativa de refresh em mídia que nunca vai funcionar
**Solução:** Adicionar verificação de mimetype antes de tentar refresh

**Checklist:**
- [ ] No hook: se `messageType` for sticker/ephemeral/vcard → não tentar refresh
- [ ] Passar `messageType` como opção adicional no hook
- [ ] Early return em `runRefresh` para tipos conhecidos como não-recarregáveis

## Gap 5: Security Warning Loop

**Arquivo:** `src/features/inbox/hooks/useInboxFilters.ts:121-139`
**Problema:** `useEffect` com dependências `[scope, showAll, hasPermission, permissionsLoading]` dispara repetidamente
**Solução:** Estabilizar o efeito com ref e usar estado inicial permission-aware

**Checklist:**
- [ ] Modificar `resolveInitialShowAll` para receber `hasPermission` e retornar false se sem permissão
- [ ] Adicionar `useRef` para tracking de "já corrigiu" e pular re-execuções
- [ ] Remover `showAll` da array de dependências (só precisa executar na mudança de permissão)

## Gap 6: HEAD conversation_tasks Batch

**Arquivo:** `src/features/inbox/hooks/useConversationTasksData.ts`
**Problema:** 82 HEAD requests individuais, todas falhando no 429
**Solução:** Debounce + batch query em vez de HEAD por contact_id

**Checklist:**
- [ ] Substituir HEAD por uma única query batch: `SELECT contact_id, COUNT(*) FROM conversation_tasks WHERE status='pending' AND contact_id IN (...ids) GROUP BY contact_id`
- [ ] Adicionar debounce de 500ms para evitar rajadas
- [ ] Usar `useQueries` do React Query com `enabled: false` durante rate limit
