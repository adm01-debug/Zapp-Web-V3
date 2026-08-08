# _archive - Edge Functions arquivadas

Funcoes removidas do deploy, preservadas no Git para referencia historica.
Nenhuma tem chamador ativo (verificado 2026-08-08: src/, edge->edge, 162 pg_cron jobs, 254 N8N workflows).

## auto-escalate-sla
Job declarado: warroom-alert-resolver-1min (ausente no banco).
Substituida por SQL ativo: 5.523 alertas resolvidos, 27 abertos <48h. Zero acumulo.

## queue-rebalance  
Job declarado: queue-rebalance-every-5min (ausente no banco).
Modulo SLA nunca ligado: 11 tabelas vazias.

## sicoob-outbox-consumer
Job declarado: sicoob-outbox-drain (ausente no banco).
Pipeline inativo: sicoob_reply_outbox e outbox_events vazias.

## Restaurar
cp supabase/functions/_archive/<fn>/index.ts.archived supabase/functions/<fn>/index.ts
