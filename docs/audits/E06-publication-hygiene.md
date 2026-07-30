# E06 — Publicação Higienizada (Publication Hygiene Audit)

**Status:** ✅ Já corrigido (NO-OP)

**Data:** 2026-07-30

## Contexto

Em `pg_publication_rel` (publicação `supabase_realtime`), as tabelas `evolution_messages`
e `evolution_conversations` são tabelas **particionadas** (relkind='p') no schema `evo`.
Cada uma possui 25+ partições filhas (relkind='r' com relispartition=true), uma por
instância/departamento (artes, comercial_01..15, compras, etc.).

A publicação `supabase_realtime` tem `publish_via_partition_root = true`, o que significa
que eventos CDC nas partições filhas são automaticamente propagados pela tabela raiz —
**desde que apenas a raiz esteja publicada**.

## Risco

Se partições filhas também fossem adicionadas individualmente à publicação, cada evento
geraria **duplicatas** no Realtime (um evento pela raiz + um pela partição), além de
aumentar o overhead do WAL decoder desnecessariamente.

## Verificação (WAVE 1)

```sql
SELECT COUNT(*) AS leaf_partitions_published
FROM pg_publication_rel pr
JOIN pg_class c ON c.oid = pr.prrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'evo'
  AND c.relname LIKE 'evolution_%'
  AND c.relispartition = true;
```

**Resultado:** `0` ✅ — Nenhuma partição filha de `evolution_*` está publicada.

## Publicação Atual — Tables evo

| Tabela | relkind | relispartition | Publicado? |
|--------|---------|----------------|------------|
| `evolution_messages` | `p` (parent) | false | ✅ (raiz correta) |
| `evolution_conversations` | `p` (parent) | false | ✅ (raiz correta) |
| `evolution_alerts` | `r` | false | ✅ (tabela normal) |
| `evolution_contacts` | `r` | false | ✅ (tabela normal) |
| `evolution_label_associations` | `r` | false | ✅ (tabela normal) |
| `evolution_labels` | `r` | false | ✅ (tabela normal) |
| `evolution_reactions` | `r` | false | ✅ (tabela normal) |
| `evolution_realtime_events` | `r` | false | ✅ (tabela normal) |
| `evolution_retry_metrics` | `r` | false | ✅ (tabela normal) |
| `evolution_sentiment_analysis` | `r` | false | ✅ (tabela normal) |
| `evolution_status_reactions` | `r` | false | ✅ (tabela normal) |
| `evolution_whatsapp_status` | `r` | false | ✅ (tabela normal) |

## Conclusão

Nenhum problema de duplicação ou redundância encontrado. A publicação está higienizada —
apenas as tabelas pai (relkind='p') de tabelas particionadas estão publicadas,
conforme a prática recomendada para `publish_via_partition_root = true`.

**Nenhuma ação de correção necessária.**
