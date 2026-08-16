# ADR-I4: Plano de janela — Fase E73–E77 (I4 = 0)

**Data:** 2026-08-16
**Status:** ⛔ **SUPERSEDIDO** — ver [ADR-I4-ROTA-B-DECISION.md](./ADR-I4-ROTA-B-DECISION.md). O dono aprovou a **Rota B** (dado permanece em `zapp`; `evo` = observabilidade). **Este plano de janela NÃO deve ser executado.**
**Decisão pendente:** ~~aprovação da janela e ordem de execução~~ → resolvida em 16/08/2026 (Rota B)
**Estado atual:** I4 = 3 (3 tabelas físicas em `zapp.*`); baseline de 148 refs congelado em `ops.i4_violation_baseline`

---

## Por que isso está congelado

- Requer lock em tabelas de produção (mensagens, contatos, conversas)
- Conflita com a lane do Agente 2 enquanto branch não mergeada
- Impacto cross-schema: 45 FKs de zapp/email_app/financeiro apontam para `zapp.evolution_contacts`

## Insight que viabiliza o plano com zero reescrita

`ALTER TABLE SET SCHEMA` preserva o OID da tabela. FKs e triggers são armazenados por OID em `pg_constraint.confrelid` e `pg_trigger.tgrelid`. Resultado: **as 45 FKs e os 21 triggers se remapeiam automaticamente para evo** — sem DROP, sem CREATE, sem tocar 1 linha de código.

As **148 funções** com `zapp.evolution_*` no corpo ficam transparentes via views `SECURITY INVOKER` em `zapp` apontando para `evo` — nenhuma fn precisa de reescrita no momento do move.

---

## Pré-condições (verificar antes da janela)

1. Branch `claude/evolution-zapp-separation-analysis-29lixd` mergeada no main
2. Agente 2 sem work em andamento na lane
3. `ops.fn_preflight_hourly` verde (cron_failures_1h = 0, crons_quebrados = [])
4. Backup pgbackrest recente confirmado (stack `evolution-pgbackrest-backup`)
5. Horário de baixo tráfego (sugerido: 02:00–04:00 Brasília, dia útil)

---

## Sequência de moves (ordem por risco crescente)

### Passo 1 — evolution_conversations (menor risco)

**Por quê primeiro:** particionada, ~8MB total, zero FKs apontando para ela (só 1 FK saindo → contacts, que se remapeia sozinha).

```sql
-- Mover mãe e partições
ALTER TABLE zapp.evolution_conversations SET SCHEMA evo;
ALTER TABLE zapp.evolution_conversations_wpp2 SET SCHEMA evo;
ALTER TABLE zapp.evolution_conversations_default SET SCHEMA evo;
ALTER TABLE zapp.evolution_conversations_financeiro SET SCHEMA evo;
ALTER TABLE zapp.evolution_conversations_compras SET SCHEMA evo;
ALTER TABLE zapp.evolution_conversations_logistica SET SCHEMA evo;
ALTER TABLE zapp.evolution_conversations_marketing SET SCHEMA evo;

-- Views de contrato (updatable, security_invoker = auth respeita RLS da tabela)
CREATE VIEW zapp.evolution_conversations
  WITH (security_invoker=true)
  AS SELECT * FROM evo.evolution_conversations;
CREATE VIEW zapp.evolution_conversations_wpp2
  WITH (security_invoker=true)
  AS SELECT * FROM evo.evolution_conversations_wpp2;
-- (repetir para cada partição se código as referencia diretamente)

-- Smoke: INSERT via view rota para partição correta?
INSERT INTO zapp.evolution_conversations
  (instance_name, remote_jid, status)
VALUES ('e2e-i4-test', 'e2e-i4@test', 'closed')
RETURNING id, tableoid::regclass;
```

**Gate:** `ops.fn_boundary_audit()->'I4_tabelas_evolution_fora_de_evo'` deve baixar de 3 → 2.

---

### Passo 2 — evolution_messages (médio risco)

**Por quê segundo:** particionada, 340MB na _wpp2, as 3 FKs cruzadas (de evo.media_download_queue e evo.media_loss_registry) já foram dropadas no E65 — zero FKs apontando para a família messages hoje.

```sql
ALTER TABLE zapp.evolution_messages SET SCHEMA evo;
ALTER TABLE zapp.evolution_messages_wpp2 SET SCHEMA evo;
ALTER TABLE zapp.evolution_messages_default SET SCHEMA evo;

CREATE VIEW zapp.evolution_messages
  WITH (security_invoker=true)
  AS SELECT * FROM evo.evolution_messages;
CREATE VIEW zapp.evolution_messages_wpp2
  WITH (security_invoker=true)
  AS SELECT * FROM evo.evolution_messages_wpp2;
CREATE VIEW zapp.evolution_messages_default
  WITH (security_invoker=true)
  AS SELECT * FROM evo.evolution_messages_default;
```

**Gate:** I4 deve baixar de 2 → 1.  
**Atenção:** o canary (cron 429) já foi repontado para `fn_pipeline_canary_insert()` que usa `zapp.evolution_messages` (view depois do move) → deve continuar funcionando.

---

### Passo 3 — evolution_contacts (maior risco)

**Por quê último:** 46MB, 45 FKs apontando (todos OID-based — remapeiam automático), 21 triggers (OID-based — seguem a tabela). Nenhuma ação manual em FKs ou triggers.

```sql
ALTER TABLE zapp.evolution_contacts SET SCHEMA evo;

-- View updatable com RLS (os 21 triggers estão no OID que agora é evo.evolution_contacts)
CREATE VIEW zapp.evolution_contacts
  WITH (security_invoker=true)
  AS SELECT * FROM evo.evolution_contacts;

-- Verificar que FKs foram remapeadas automaticamente
SELECT count(*) FROM pg_constraint ct
JOIN pg_class cl ON cl.oid = ct.conrelid
WHERE ct.confrelid = 'evo.evolution_contacts'::regclass AND ct.contype = 'f';
-- Esperado: 45 (eram 45 para zapp.evolution_contacts, remapearam por OID)
```

**Gate:** I4 deve baixar de 1 → 0.

---

### Passo 4 — Pós-move: liberar os 5 crons e atualizar baseline

Após I4=0, os 5 crons restantes do `aux_cron_citando_zapp_evolution_tables` passam a referenciar **views** em zapp (não tabelas físicas), o que é aceitável — o aux era um proxy para tabelas cruzando a fronteira, não para qualquer referência por nome. Reescrever os 2 VACUUMs para `evo.*`:

```sql
-- vacuum-contacts-2h e vacuum-messages-2h
SELECT cron.alter_job(169, command := 'VACUUM ANALYZE evo.evolution_contacts');
SELECT cron.alter_job(186, command := 'VACUUM ANALYZE evo.evolution_messages');
```

Os 3 DO-blocks (repopula-fila, schema-guardian, phonejid-watchdog) continuam funcionando via view `zapp.*` — sem urgência de reescrita.

Snapshot novo do baseline:
```sql
INSERT INTO ops.i4_violation_baseline (fn_schema, fn_name, n_refs)
SELECT fn_schema, fn_name, sum(n_refs) FROM ops.v_i4_violations_summary
GROUP BY fn_schema, fn_name
ON CONFLICT DO NOTHING;
```

---

## Mapa de risco

| Item | Risco | Mitigação |
|---|---|---|
| `ALTER TABLE SET SCHEMA` trava a tabela | Breve lock ACCESS EXCLUSIVE (sub-segundo para tabela vazia de metadados) | Executar fora do horário de pico |
| FKs orphans se OID-remap falhar | Não pode falhar (Postgres garante) | Confirmado via pg_constraint.confrelid pós-move |
| View não-updatable | Pode ocorrer se a partição-mãe tiver regra especial | Testar INSERT via view no smoke de cada passo |
| RLS não propagado via view | `security_invoker=true` exige PG15+ | Confirmado: `ALTER VIEW ... SET (security_invoker=...)` já usado em prod (E80/migration 250005) |
| Rollback | Trocas de schema são reversíveis | DROP VIEW + ALTER TABLE evo.* SET SCHEMA zapp (< 1min) |

---

## Métricas de sucesso

| Métrica | Antes | Alvo pós-E75 |
|---|---|---|
| I4_tabelas_evolution_fora_de_evo | 3 | **0** |
| aux_phys_refs_fns_zapp_evolution | 148 | 148 (views transparentes; reduz com reescrita gradual pós-janela) |
| aux_cron_citando_zapp_evolution_tables | 5 | **1** (só os 3 DO-blocks restantes + 0 VACUUMs) |
| ops.fn_preflight_hourly ok | false (I4 fail) | **true** |

---

## Decisão pendente

**Joaquim, o que preciso de você:**
1. ✅/❌ Ordem dos passos (conversations → messages → contacts)
2. ✅/❌ Janela proposta (02:00–04:00 Brasília, dia útil)
3. ✅/❌ Fazer os 3 passos em uma janela única ou em noites separadas (recomendo única — cada passo dura < 5 min)

Responda com `APROVADO` ou ajuste os pontos.
