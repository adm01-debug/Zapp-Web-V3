# RUNBOOK — Restart da Evolution API x RabbitMQ (CRITICO)

**Origem:** incidente 2026-07-10 21:05–21:17 UTC (outage de 12 min no pipeline v2).

## Fatos que todo restart precisa respeitar

1. **A Evolution v2.3.7 NAO recria bindings exchange→filas no boot.** Ela so cria
   filas+bindings no `POST /rabbitmq/set` da instancia (ou na criacao da instancia).
2. **O endpoint `/rabbitmq/set` esta QUEBRADO na v2.3.7** quando o controller perde a
   referencia amqp: retorna 500 `Cannot set properties of undefined (setting 'events')`.
   Workaround: criar bindings direto na management API do RabbitMQ (ver abaixo).
3. **O exchange `evolution` NAO pode ter `alternate-exchange` como ARGUMENTO embutido.**
   A Evolution declara o exchange SEM argumentos; declaracao inequivalente = 406
   PRECONDITION_FAILED em crash-loop (foi a causa raiz do outage). O AE deve vir da
   **policy** `ae-evolution` (pattern `^(evolution|wpp2)$`, definition
   `{"alternate-exchange":"evolution.ae"}`), que ja existe e nao conflita.
4. Bindings sao duraveis no broker: sobrevivem a restarts da Evolution. So se perdem
   se o exchange for deletado.
5. `Instance`/`Rabbitmq`/`Setting` na Evolution DB sobreviveram aos restarts de
   10-11/07 (migrations `No pending migrations`); ainda assim, SEMPRE verificar apos
   restart (wipe ja ocorreu no passado em migrations pendentes).
6. Sessao Baileys: persistida em Redis DB 8 (`evolution:instance:{uuid}`, 327 chaves)
   + volume `evolution_instances` + baileys-backup. Auto-reconecta.

## Checklist pos-restart (executar SEMPRE, ~60s)

```bash
# 1. Bindings (esperado: 17)
rabbitmqctl list_bindings -p evolution source_name destination_name | awk '$1=="evolution"' | wc -l

# 2. Sem crash-loop 406 no log da Evolution
docker logs <evolution> --tail 50 | grep -c PRECONDITION || true   # esperado: 0

# 3. Instancia intacta na Evolution DB
psql -U postgres -d evolution -c 'SELECT name, "connectionStatus" FROM "Instance"'

# 4. Fluxo E2E (espelho recebendo)
#    evo.evolution_webhook_events_v2: max(created_at) < 5 min
```

## Recuperacao de bindings (se zerados) — via management API

```bash
# de dentro do container da Evolution (curl nao existe; usar node):
export URI=$(cat /run/secrets/rabbitmq_url_evolution_v1)
node -e '...fetch POST http://rabbitmq:15672/api/bindings/evolution/e/evolution/q/wpp2.<fila>
         body {"routing_key":"wpp2.<fila>","arguments":{}} para as 17 filas...'
# filas: messages.upsert, messages.update, messages.edited, messages.delete,
#        contacts.upsert, contacts.update, chats.upsert, chats.update,
#        connection.update, labels.edit, labels.association, groups.upsert,
#        groups.update, group-participants.update, call, qrcode.updated,
#        logout.instance
```

## Se o exchange voltar a ter argumento AE embutido

```bash
# NAO recriar com argumento. Deletar e deixar a Evolution redeclarar limpo
# (policy ae-evolution aplica o AE por fora):
rabbitmqctl eval 'rabbit_exchange:delete(rabbit_misc:r(<<"evolution">>, exchange, <<"evolution">>), false, <<"cli">>).'
# Depois: recriar os 17 bindings (secao acima).
```

## Outros aprendizados da auditoria 2026-07-10/11

- `evo_status` (MCP worker) reporta a versao do WORKER (4.2.0), nao da Evolution (2.3.7).
- `S3 AccessDenied` em `makeBucket` no boot e BENIGNO: key R2 sem permissao
  CreateBucket; bucket existe; put/stat/remove/list validados 100% em 2026-07-11.
- Exit 137 do edge-runtime em service update = SIGKILL pos-grace-period do
  stop-first (nao e OOM; host com 47% de RAM livre, PSI=0).
- 401 recorrentes */5min no log da Evolution: cliente externo via Traefik ainda
  nao identificado; detectores 401 do banco sao cegos (dependem de ip_watch que
  ninguem alimenta). Captura tcp6 em andamento.
