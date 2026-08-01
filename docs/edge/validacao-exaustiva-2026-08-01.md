# Validação Exaustiva 2026-08-01 — Relatório de Achados

**Escopo:** todas as correções/melhorias implementadas na auditoria ZAPP self-hosted.
**Método:** ~300 simulações reais (requisições HTTP, SET ROLE, injeção de falha).

## Baterias executadas

| Bateria | Cenários | Resultado |
|---|---|---|
| Auth sweep (124 funções × 2 rodadas) | ~250 req | GAP P0 encontrado e fechado (abaixo) |
| RLS (43 tabelas × agent + admin + anon + isolamento) | 130+ | 0 erros; isolamento comprovado (agent 0 vs admin 7.097 em audit_logs) |
| SECURITY DEFINER (5 revogadas + 3 protegidas) | 8 | 5× permission denied; 3× executam |
| Integridade (UNIQUEs, enum, graveyard, crons, triggers) | 15 | Todos OK; "2 duplicatas" = artefato de query (NULL) |
| Buckets LGPD (doc/ogg/jpg público + signed) | 6 | público 400 ×3; signed 200 ×2 |
| Blindagem artes (DROP TABLE + INSERT auth.users) | 2 | INSERT_OK = trigger não aborta signup |

## Gaps encontrados e CORRIGIDOS

1. **P0 — volume desatualizado (113/123 funções)** — `auto-close-conversations` e
   `cleanup-storage-orphans` executavam sem autenticação (200 com resultado real).
   Fix: sync 192/192 arquivos do repo + restart. Re-validação: ambas 401.
2. **`_authoritative_time` stale 20 dias** — `get_server_time()` retornava 2026-07-12.
   Fix: `UPDATE ... SET server_time = NOW()` + migration `20260801060002`.

## Achados residuais (fail-closed — sem risco ativo, pendentes de ação)

| # | Achado | Status | Ação recomendada |
|---|---|---|---|
| 1 | 5 webhooks respondem 500 sem credenciais (`elevenlabs-webhook`, `gmail-webhook`, `proxy-health`, `sicoob-bridge`, `sicoob-bridge-reply`) | Fail-closed (não executam lógica) | Criar envs pendentes (auditoria F2: ELEVENLABS_WEBHOOK_SECRET, GMAIL_PUBSUB_TOPIC, SICOOB_GIFTS_URL/SECRET, PROXY_HEALTH_TOKEN) |
| 2 | `external-db-bridge` / `external-db-proxy` → 404 no runtime | Fail-closed | Verificar se devem estar deployadas (exigem env `EXTERNAL_SUPABASE_*`); se obsoletas, remover do repo |
| 3 | `gmail-tests.test.ts` no volume | Lixo de deploy | Adicionar `*.test.ts` ao `.deployignore` (já existe) e limpar do volume |
| 4 | Signup artificial (INSERT manual em auth.users) expõe FK `agent_stats_profile_id_fkey` no `zapp.handle_new_user` | Não afeta signup real (GoTrue envia payload completo) | Monitorar; se signup falhar em produção, investigar primeiro o handle_new_user |
| 5 | `get_server_time` retorna o valor PRÉVIO (lê antes de atualizar) | Corrigido (tabela atualizada) | Considerar retornar `NOW()` direto em futura revisão |

## Como reproduzir as baterias

- Sweep de auth: `docs/edge/runbook-sync-functions-volume.md` (tabela de classificação)
- RLS: `SET ROLE authenticated` + `SET LOCAL request.jwt.claim.sub` dentro de `BEGIN`
- SECDEF: `SELECT zapp.<fn_revogada>()` como authenticated → permission denied
- Blindagem: `DROP TABLE artes.usuarios CASCADE` + INSERT em auth.users dentro de
  transação com ROLLBACK (teste isolado com triggers do ZAPP desativados)
