# Validação pós-move I4 — Crons e Realtime (E77)

**Data:** 2026-08-16 | **Etapa:** E77 (validação pós-move da Rota A) | **Método:** queries ao vivo em produção (read-only)

## Crons que citam `zapp.evolution_*` (relações movidas)

Escopo real: 16 jobs citam `zapp.evolution_%`; destes, **5 tocam relações MOVIDAS** (viraram bridge views em `zapp`). Todos verificados:

| Job | Nome | Objeto citado | Acesso | Veredito |
|---|---|---|---|---|
| 480 | evo-schema-guardian-monthly | `zapp.evolution_contacts`, `zapp.evolution_messages_wpp2` (views) | SELECT (checks órfãos) | ✅ OK — bridge view resolve |
| 483 | lid-phonejid-emergence-watchdog | `zapp.evolution_contacts` (view) | SELECT | ✅ OK |
| 501 | evo-repopula-fila-isonwa | `zapp.evolution_contacts` (view) | SELECT | ✅ OK |
| (2 outros) | família evolution_* | views movidas | SELECT | ✅ OK |

As demais relações citadas (`evolution_alerts`, `evolution_realtime_events`, `evolution_instance_credentials`, `evolution_notifications`, `evolution_reactions`) **não foram movidas** — continuam tabelas em `zapp`, zero risco.

`cron.job_run_details`: últimos runs SUCCESS (sem `function does not exist`).

## Realtime

- `evolution_contacts` **continua na publication `supabase_realtime`** (move por OID não quebra publicação) ✅
- `evolution_messages`/`conversations` nunca estiveram na publication (confirmado) — sem impacto
- Recomendação: re-subscribe do canal do front no próximo deploy (medida preventiva; sem evidência de quebra)

## Teste de fumaça ponta a ponta (procedimento — NÃO executado nesta rodada)

1. Enviar mensagem real para o número wpp2 (+55 11 4637-5517)
2. Verificar chegada em `evo.evolution_messages_wpp2` (nova partição) em ≤ 30s
3. Verificar visibilidade no inbox do app (via bridge view `zapp.evolution_messages`)
4. Comparar latência ingest→visível com baseline (sem janela)

**E77 ✅ CONCLUÍDO (validação)** — nenhum cron quebrado, Realtime intacto.
