# RUNBOOK — bootstrap e rotação do `evo_reconciler`

**Criado:** 2026-08-16 · **Migration:** `20260816251000_ops_evo_reconciler_least_privilege.sql`
**Stack:** `evolution-watchdogs` (240), serviço `evo-reconcile` · **Config:** `evo_reconcile_v5_<sha>`

---

## Por que este runbook existe

A migration cria o role com a senha placeholder `CHANGE_ME_VIA_SWARM_SECRET` — de propósito,
para não versionar segredo. A consequência é uma **falha silenciosa**: num ambiente onde a
migration roda limpa (restore, ambiente novo, replay completo), o role nasce com senha
inválida, o container não conecta, e o script apenas loga `rpc_reconcile_snapshot falhou`
a cada 15 min. Nada quebra em cascata, ninguém percebe, e a reconciliação some.

**Sintoma canônico:** `zapp.evo_reconcile_contact_snapshot` para de receber linhas enquanto
o serviço aparece `Running` no Swarm.

---

## Bootstrap (ambiente novo / pós-restore)

Ordem obrigatória — a senha é definida **uma vez** e replicada nos dois lados.

### 1. Gerar a senha

```sh
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### 2. Aplicar no Postgres

```sql
ALTER ROLE evo_reconciler
  LOGIN PASSWORD '<SENHA>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS
  CONNECTION LIMIT 3;
```

Se o role ainda não existir, a migration `20260816251000` o cria — rode-a antes.

### 3. Criar o secret no Swarm

Secrets são imutáveis: para trocar o valor é preciso **novo nome** (sufixo `_v2`, `_v3`...).

```sh
printf '%s' 'postgresql://evo_reconciler:<SENHA>@db:5432/postgres' \
  | docker secret create pg_supa_url_evo_reconciler_v1 -
```

### 4. Apontar a stack

No compose da `evolution-watchdogs` (240), serviço `evo-reconcile`:

```yaml
    secrets: [pg_evolution_url_n8n_app_v1, pg_supa_url_evo_reconciler_v1]
```

E na seção `secrets:` do arquivo, `pg_supa_url_evo_reconciler_v1: {external: true}`.
Atualizar via Portainer (update da stack), não via `docker service update`.

---

## Verificação (rodar sempre após bootstrap ou rotação)

### Teste positivo — as duas funções respondem

```sh
U='postgresql://evo_reconciler:<SENHA>@db:5432/postgres'
psql "$U" -tAq -c 'SELECT count(*) FROM ops.rpc_reconcile_mirror_jids()'
psql "$U" -tAq -c 'SELECT ops.rpc_reconcile_snapshot(0,0,0,0,0)'
```

### Teste negativo — least-privilege intacto

Ambos **devem** falhar com `permission denied for schema zapp`:

```sh
psql "$U" -tAq -c 'SELECT count(*) FROM zapp.evolution_contacts'
psql "$U" -tAq -c "INSERT INTO zapp.evo_reconcile_contact_snapshot(instance_name,src_contacts,mir_contacts,status,notes) VALUES('x',1,1,'x','x')"
```

Se qualquer um **passar**, o least-privilege foi violado — investigar `GRANT` acidental
(a migration tem um guard `DO $$` que aborta nesse caso, mas ele só roda no replay).

### Confirmar gravação real

```sql
SELECT captured_at, status, notes
FROM zapp.evo_reconcile_contact_snapshot
ORDER BY captured_at DESC LIMIT 3;
```

Deve haver linha nova a cada ~15 min, com `notes` começando em `v5 cobertura:`.
**Ordene sempre por `captured_at`** — `id` é UUID e a ordenação por ele é aleatória
(erro real cometido em 2026-08-16, gerou falso diagnóstico de "reconciler parado").

---

## Rotação

1. Gerar nova senha (passo 1)
2. `ALTER ROLE evo_reconciler PASSWORD '<NOVA>'`
3. `docker secret create pg_supa_url_evo_reconciler_v2 -` com a nova URL
4. Update da stack apontando para `_v2`
5. Rodar a verificação completa acima
6. Só então `docker secret rm pg_supa_url_evo_reconciler_v1`

Janela de indisponibilidade entre 2 e 4: o container loga erro e pula o ciclo (não crasha,
`continue` no loop). Perde-se no máximo um snapshot de 15 min — aceitável.

---

## Superfície do role (o que ele pode e não pode)

| | |
|---|---|
| **Pode** | `EXECUTE` em `ops.rpc_reconcile_snapshot(bigint,bigint,bigint,bigint,bigint)` e `ops.rpc_reconcile_mirror_jids()`; `USAGE` em `ops` |
| **Não pode** | `USAGE` em `zapp` ou `evo`; qualquer DML direto; bypass de RLS; mais de 3 conexões |
| **Fonte da verdade** | migration `20260816251000` (guard inclusa) |

---

## Notas de fronteira

Este role serve um **writer externo**: um container Swarm que cruza a fronteira `evo`↔`zapp`
de fora do banco. `fn_boundary_audit()`/I1 **não o enxerga** — a medição de invariantes
inspeciona `prosrc`, cron, views e triggers, tudo interno ao Postgres. Writers externos só
existem no registro documental (`CREDENTIAL_BOUNDARY.md`, regra 5) e neste runbook.

Ao mover ou renomear objetos em `zapp` que este role toca indiretamente
(`zapp.evolution_contacts`, `zapp.evolution_messages_wpp2`, `zapp.evolution_conversations`,
`zapp.evo_reconcile_contact_snapshot`), lembrar que as duas funções `ops.rpc_reconcile_*`
são chamadoras — elas não aparecem numa busca por chamadores dentro do schema `evo`.
