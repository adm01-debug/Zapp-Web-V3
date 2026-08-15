# E41 — Plano de Remoção das 24 FKs Cross-Schema (Invariante I9)

**Status:** RASCUNHO — preparação para execução E41-E50  
**Data:** 2026-08-15  
**Baseline:** `docs/decouple/baseline/20260815/cross_schema_fks.json`  
**Invariante:** I9 = FAIL (meta: I9 = PASS, 0 FKs cross-schema)

---

## 1. Situação Atual

O Invariante I9 define: **"Zero FKs cross-schema não documentadas entre `evo` e `zapp`"**.

Medição de produção em 2026-08-15:

| Métrica | Valor |
|---------|-------|
| Linhas em `information_schema` | **24** |
| Constraints distintas | **6** |
| Direção | evo → zapp (exclusivamente) |
| zapp → evo | 0 |
| DELETE CASCADE | 12 linhas (3 constraints) |
| NO ACTION | 12 linhas (3 constraints) |

As 24 linhas resultam da expansão cartesiana que o `information_schema` faz para FKs compostas:  
6 constraints × 2 colunas FK × 2 colunas referenciadas = 24 rows (não 24 constraints).

---

## 2. Tabelas Envolvidas

### 2.1 Tabelas-Fonte (schema `evo`)

| Tabela | Função | FK direction |
|--------|--------|-------------|
| `evo.media_download_queue` | Fila de downloads de mídia do WhatsApp; processada por workers via `rpc_claim_media_download_batch` | evo → zapp |
| `evo.media_loss_registry` | Registro de mídias perdidas / não-recuperáveis para auditoria e retry | evo → zapp |

### 2.2 Tabelas Referenciadas (schema `zapp`)

| Tabela | Tipo | Observação |
|--------|------|-----------|
| `zapp.evolution_messages` | `relkind='p'` (raiz particionada) | Dono real dos dados de mensagens |
| `zapp.evolution_messages_wpp2` | Partição da raiz acima | Partição da instância wpp2 |
| `zapp.evolution_messages_default` | Partição da raiz acima | Partição default |

> **Nota arquitetural importante:** `evo.evolution_messages` não é uma tabela — é `evo.evolution_messages_v2`, uma VIEW sobre `zapp.evolution_messages`. A migration `20260811150100` referencia `evo.evolution_messages`, mas no banco de produção a constraint resolve para `zapp.evolution_messages` porque o caminho de resolução de nome não encontra uma tabela física no schema `evo`.

---

## 3. Os 6 Grupos de Constraints (Lista Completa)

### Grupo 1 — `fk_mdq_message` (evo.media_download_queue → zapp.evolution_messages)

| Campo | Valor |
|-------|-------|
| Constraint name | `fk_mdq_message` |
| FK schema | `evo` |
| FK table | `media_download_queue` |
| FK columns | `(message_id, instance_name)` |
| Ref schema | `zapp` |
| Ref table | `evolution_messages` |
| Ref columns | `(message_id, instance_name)` |
| DELETE rule | **CASCADE** |
| UPDATE rule | NO ACTION |
| Origem | `20260811150100_evo_integridade_fks_limpezas.sql` |
| Linhas IS | 4 |

**Risco:** DELETE CASCADE — ao deletar uma mensagem de `zapp.evolution_messages`, TODOS os registros filhos em `evo.media_download_queue` são deletados silenciosamente, incluindo itens ainda em processamento. Risco de perda de trabalho em progresso e risco LGPD de apagamento não intencional.

---

### Grupo 2 — `media_download_queue_message_id_instance_name_fkey` (evo.media_download_queue → zapp.evolution_messages_wpp2)

| Campo | Valor |
|-------|-------|
| Constraint name | `media_download_queue_message_id_instance_name_fkey` |
| FK schema | `evo` |
| FK table | `media_download_queue` |
| FK columns | `(message_id, instance_name)` |
| Ref schema | `zapp` |
| Ref table | `evolution_messages_wpp2` |
| Ref columns | `(message_id, instance_name)` |
| DELETE rule | **CASCADE** |
| UPDATE rule | NO ACTION |
| Origem | Auto-gerado (produção direta, não encontrado em migration) |
| Linhas IS | 4 |

**Risco:** Mesmo risco CASCADE do Grupo 1. FK redundante com o Grupo 1 — aponta para a partição `wpp2` além da raiz. FK em partição individual é operacionalmente incorreta: inserts na raiz particionada não passam por FK de partição individual.

---

### Grupo 3 — `media_download_queue_message_id_instance_name_fkey1` (evo.media_download_queue → zapp.evolution_messages_default)

| Campo | Valor |
|-------|-------|
| Constraint name | `media_download_queue_message_id_instance_name_fkey1` |
| FK schema | `evo` |
| FK table | `media_download_queue` |
| FK columns | `(message_id, instance_name)` |
| Ref schema | `zapp` |
| Ref table | `evolution_messages_default` |
| Ref columns | `(message_id, instance_name)` |
| DELETE rule | **CASCADE** |
| UPDATE rule | NO ACTION |
| Origem | Auto-gerado (produção direta, não encontrado em migration) |
| Linhas IS | 4 |

**Risco:** Mesmo risco CASCADE. FK em partição default — ainda mais problemática, pois inserts em partições nomeadas (wpp2, comercial_*, etc.) nunca passam pela partição default; a constraint só é ativada em caminhos edge.

---

### Grupo 4 — `fk_mlr_message_uuid_instance` (evo.media_loss_registry → zapp.evolution_messages)

| Campo | Valor |
|-------|-------|
| Constraint name | `fk_mlr_message_uuid_instance` |
| FK schema | `evo` |
| FK table | `media_loss_registry` |
| FK columns | `(message_uuid, instance_name)` |
| Ref schema | `zapp` |
| Ref table | `evolution_messages` |
| Ref columns | `(id, instance_name)` |
| DELETE rule | NO ACTION |
| UPDATE rule | NO ACTION |
| Origem | `20260811150100_evo_integridade_fks_limpezas.sql` |
| Linhas IS | 4 |

**Risco:** NO ACTION — qualquer tentativa de deletar uma mensagem de `zapp.evolution_messages` que ainda tenha um registro em `evo.media_loss_registry` **será bloqueada** com `ERROR 23503 foreign_key_violation`. Risco de bloqueio operacional em jobs de limpeza de mensagens.

---

### Grupo 5 — `media_loss_registry_message_uuid_instance_name_fkey` (evo.media_loss_registry → zapp.evolution_messages_wpp2)

| Campo | Valor |
|-------|-------|
| Constraint name | `media_loss_registry_message_uuid_instance_name_fkey` |
| FK schema | `evo` |
| FK table | `media_loss_registry` |
| FK columns | `(message_uuid, instance_name)` |
| Ref schema | `zapp` |
| Ref table | `evolution_messages_wpp2` |
| Ref columns | `(id, instance_name)` |
| DELETE rule | NO ACTION |
| UPDATE rule | NO ACTION |
| Origem | Auto-gerado (produção direta, não encontrado em migration) |
| Linhas IS | 4 |

**Risco:** Mesmo bloqueio NO ACTION, mas sobre a partição `wpp2`. FK em partição individual com NO ACTION pode bloquear deleções via raiz dependendo da versão do PostgreSQL e do planejador.

---

### Grupo 6 — `media_loss_registry_message_uuid_instance_name_fkey1` (evo.media_loss_registry → zapp.evolution_messages_default)

| Campo | Valor |
|-------|-------|
| Constraint name | `media_loss_registry_message_uuid_instance_name_fkey1` |
| FK schema | `evo` |
| FK table | `media_loss_registry` |
| FK columns | `(message_uuid, instance_name)` |
| Ref schema | `zapp` |
| Ref table | `evolution_messages_default` |
| Ref columns | `(id, instance_name)` |
| DELETE rule | NO ACTION |
| UPDATE rule | NO ACTION |
| Origem | Auto-gerado (produção direta, não encontrado em migration) |
| Linhas IS | 4 |

**Risco:** Mesmo bloqueio NO ACTION sobre a partição default.

---

## 4. Análise de Impacto por Grupo

### 4.1 Por que essas FKs existem

As FKs foram adicionadas na migration `20260811150100` como parte da "Leva 2-6 da auditoria do schema evo" com a intenção de documentar/reforçar relacionamentos implícitos. O raciocínio era correto (as tabelas têm dependência lógica), mas o **mecanismo** (FK física cross-schema) é arquiteturalmente incorreto porque:

1. **Cria acoplamento de banco de dados entre schemas independentes**. Se `evo` for movido para outro cluster (Rota A), o `ALTER TABLE` de drop seria necessário antes da migração — e a FK pode ser violada durante a janela de transição.
2. **FK em partição individual é silenciosa ou incorreta**: FKs em `evolution_messages_wpp2` e `evolution_messages_default` são operacionalmente ineficazes porque escritas via raiz não passam pelas constraints individuais de partições filhas.
3. **CASCADE cross-schema é invisível para o time de zapp**: um engenheiro que deleta mensagens no schema `zapp` pode não saber que está deletando itens da fila de media no schema `evo`.

### 4.2 Impacto da Remoção

| Tabela | Tipo de Proteção Perdida | Substituto |
|--------|--------------------------|-----------|
| `media_download_queue` | CASCADE delete (limpeza automática) | Job de reconciliação explícito |
| `media_loss_registry` | Integridade referencial (bloco de delete) | Job de auditoria pós-delete |

A proteção em si é **baixa**: ambas as tabelas são operacionais/temporárias (a fila esvazia periodicamente, o registro de perdas é para auditoria). A referência à mensagem original é informacional, não existencial.

### 4.3 Risco de Dados Órfãos

Após remover as FKs, podem existir registros em `media_download_queue` e `media_loss_registry` cujos `message_id`/`message_uuid` não existem mais em `zapp.evolution_messages`. Isso já pode ocorrer hoje via partições não cobertas pelas FKs (as FKs nas partições individuais não cobrem todas as 25 partições).

**Ação necessária antes do DROP:** verificar contagem de órfãos.

```sql
-- Verificar órfãos em media_download_queue
SELECT COUNT(*) AS orphans_mdq
FROM evo.media_download_queue mdq
WHERE NOT EXISTS (
    SELECT 1 FROM zapp.evolution_messages em
    WHERE em.message_id = mdq.message_id
      AND em.instance_name = mdq.instance_name
);

-- Verificar órfãos em media_loss_registry
SELECT COUNT(*) AS orphans_mlr
FROM evo.media_loss_registry mlr
WHERE NOT EXISTS (
    SELECT 1 FROM zapp.evolution_messages em
    WHERE em.id = mlr.message_uuid
      AND em.instance_name = mlr.instance_name
);
```

---

## 5. Arquitetura Correta (pós-remoção)

### 5.1 Modelo Correto

As tabelas `evo.media_download_queue` e `evo.media_loss_registry` devem referenciar mensagens **por chave lógica** (strings), sem FK física:

```
evo.media_download_queue
  message_id     TEXT   -- "ID WhatsApp da mensagem dona da mídia"
  instance_name  TEXT   -- "nome da instância Evolution"
  -- SEM FK física para zapp.*

evo.media_loss_registry  
  message_uuid   UUID   -- "UUID interno da mensagem"
  instance_name  TEXT   -- "nome da instância Evolution"
  -- SEM FK física para zapp.*
```

### 5.2 Garantia de Consistência

A consistência referencial é garantida por:

1. **Job de reconciliação** (cron semanal ou diário): detecta registros em `media_download_queue` / `media_loss_registry` cujos message_id/message_uuid não existem em `evolution_messages` e gera alerta.
2. **Lógica de negócio**: ao criar um item na fila, o worker já validou que a mensagem existe (a fila é sempre populada a partir de um evento de mensagem recém-processada).
3. **Nenhum delete ativo de `zapp.evolution_messages`** hoje em produção (dados históricos são arquivados, não deletados).

---

## 6. Sequência de Correção Segura (E41–E50)

### E41 — Documentação e Plano (ESTE DOCUMENTO)
- **O quê:** Registrar os 6 grupos, impacto e sequência de correção
- **Status:** Concluído (este arquivo)
- **Risco:** Zero (apenas documentação)

### E42 — Verificação de Órfãos em Produção
- **O quê:** Executar as duas queries de órfãos da Seção 4.3 em produção
- **Quando:** Antes de qualquer DROP
- **Resultado esperado:** 0 órfãos (dado que as FKs existem desde 2026-08-11)
- **Se >0 órfãos:** Investigar antes de prosseguir; não cancelar o plano

### E43 — Criar Job de Reconciliação
- **O quê:** RPC `evo.fn_reconcile_media_refs()` que detecta e alerta sobre órfãos
- **Migration:** `20260816_E43_reconcile_media_refs.sql`
- **Cron:** Registrar como job `reconcile-media-refs` a cada 24h
- **Risco:** Baixo (additive; não altera constraints existentes)

```sql
-- Esqueleto da função de reconciliação
CREATE OR REPLACE FUNCTION evo.fn_reconcile_media_refs(p_alert_only boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = evo, zapp, public
AS $$
DECLARE
    v_orphans_mdq int; v_orphans_mlr int;
BEGIN
    SELECT COUNT(*) INTO v_orphans_mdq
    FROM evo.media_download_queue mdq
    WHERE NOT EXISTS (
        SELECT 1 FROM zapp.evolution_messages em
        WHERE em.message_id = mdq.message_id
          AND em.instance_name = mdq.instance_name
    );

    SELECT COUNT(*) INTO v_orphans_mlr
    FROM evo.media_loss_registry mlr
    WHERE NOT EXISTS (
        SELECT 1 FROM zapp.evolution_messages em
        WHERE em.id = mlr.message_uuid
          AND em.instance_name = mlr.instance_name
    );

    IF (v_orphans_mdq > 0 OR v_orphans_mlr > 0) AND NOT p_alert_only THEN
        -- Limpeza de órfãos em modo destrutivo (executar com p_alert_only=false após aprovação)
        DELETE FROM evo.media_download_queue mdq
        WHERE NOT EXISTS (
            SELECT 1 FROM zapp.evolution_messages em
            WHERE em.message_id = mdq.message_id
              AND em.instance_name = mdq.instance_name
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'orphans_media_download_queue', v_orphans_mdq,
        'orphans_media_loss_registry', v_orphans_mlr,
        'alert_only', p_alert_only,
        'executado_em', now()
    );
END;
$$;
```

### E44 — Validar Cobertura de Testes dos Workers
- **O quê:** Verificar que `rpc_claim_media_download_batch` e `rpc_complete_media_download` não dependem do CASCADE para funcionar
- **Onde olhar:** `supabase/functions/` — qualquer função que escreva em `media_download_queue`
- **Resultado esperado:** Workers não dependem de CASCADE; limpeza é feita explicitamente
- **Risco:** Baixo (apenas verificação)

### E45 — Migration de DROP das 6 Constraints
- **O quê:** Remover as 6 FKs cross-schema em uma única transação
- **Migration:** `20260816_E45_drop_cross_schema_fks_I9.sql`
- **Pré-condição:** E42 (zero órfãos confirmado) + E43 (job de reconciliação ativo)
- **Risco:** Médio — operação DDL; requer lock breve em `media_download_queue` e `media_loss_registry`

```sql
-- Migration: 20260816_E45_drop_cross_schema_fks_I9.sql
-- Objetivo: eliminar as 6 FKs cross-schema evo→zapp (Invariante I9)
-- Pré-condição: job reconcile-media-refs ativo (E43), órfãos = 0 (E42)
-- Rollback: re-adicionar constraints (ver seção 7)

BEGIN;

-- Grupo 1: fk_mdq_message (explicitamente nomeada)
ALTER TABLE evo.media_download_queue
    DROP CONSTRAINT IF EXISTS fk_mdq_message;

-- Grupo 2: auto-gerada wpp2
ALTER TABLE evo.media_download_queue
    DROP CONSTRAINT IF EXISTS media_download_queue_message_id_instance_name_fkey;

-- Grupo 3: auto-gerada default
ALTER TABLE evo.media_download_queue
    DROP CONSTRAINT IF EXISTS media_download_queue_message_id_instance_name_fkey1;

-- Grupo 4: fk_mlr_message_uuid_instance (explicitamente nomeada)
ALTER TABLE evo.media_loss_registry
    DROP CONSTRAINT IF EXISTS fk_mlr_message_uuid_instance;

-- Grupo 5: auto-gerada wpp2
ALTER TABLE evo.media_loss_registry
    DROP CONSTRAINT IF EXISTS media_loss_registry_message_uuid_instance_name_fkey;

-- Grupo 6: auto-gerada default
ALTER TABLE evo.media_loss_registry
    DROP CONSTRAINT IF EXISTS media_loss_registry_message_uuid_instance_name_fkey1;

COMMIT;

-- Verificação pós-execução:
-- SELECT COUNT(*) FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
-- JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema IN ('evo','zapp')
--   AND ccu.table_schema IN ('evo','zapp')
--   AND tc.table_schema != ccu.table_schema;
-- Resultado esperado: 0
```

### E46 — [SKIP] Alinhamento de search_path de funções
- **Status:** Não executado (escopo diferente — 77 funções evo com search_path divergente)
- **Motivo do skip:** Independente das FKs; será abordado em etapa separada

### E47 — Atualizar BOUNDARY_SCORE
- **O quê:** Executar query de I9 em produção e atualizar `BOUNDARY_SCORE_T0.json` e `BOUNDARY_SCORE_T1.json`
- **Resultado esperado:** I9 = PASS (0 rows)
- **Migration:** Nenhuma; apenas arquivo JSON + commit

### E48 — Atualizar ESTADO.md e documentação
- **O quê:** Marcar I9 como resolvido em `ESTADO.md`, `AUDITORIA_INDEPENDENCIA_20260815.md` e `CREDENTIAL_BOUNDARY.md`

### E49 — Monitoramento pós-remoção (2 semanas)
- **O quê:** Observar se `fn_reconcile_media_refs()` alerta sobre órfãos novos
- **Onde:** Cron job result logs / alertas configurados
- **Critério de sucesso:** Zero alertas em 14 dias

### E50 — Fechamento do ciclo I9
- **O quê:** Confirmar invariante I9 = PASS no próximo ciclo de auditoria mensal
- **Artefato:** Entrada em `CHANGELOG_SESSIONS.md` com data e resultado

---

## 7. SQL de Verificação (Confirmação de I9 = PASS)

```sql
-- Query de verificação pós-remoção
-- Resultado esperado: 0 linhas (I9 = PASS)
-- Fonte original: docs/decouple/baseline/20260815/cross_schema_fks.json

SELECT
    tc.constraint_name,
    tc.table_schema    AS fk_schema,
    tc.table_name      AS fk_table,
    kcu.column_name    AS fk_column,
    ccu.table_schema   AS ref_schema,
    ccu.table_name     AS ref_table,
    ccu.column_name    AS ref_column,
    rc.delete_rule,
    rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
    AND kcu.table_schema   = tc.table_schema
JOIN information_schema.referential_constraints rc
    ON rc.constraint_name  = tc.constraint_name
    AND rc.constraint_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema IN ('evo', 'zapp')
  AND ccu.table_schema IN ('evo', 'zapp')
  AND tc.table_schema != ccu.table_schema  -- apenas cross-schema
ORDER BY tc.table_schema, tc.table_name, tc.constraint_name;

-- Resultado atual (baseline 2026-08-15): 24 linhas
-- Resultado esperado após E45:           0  linhas
```

---

## 8. Rollback (se necessário após E45)

Se após o DROP das constraints houver comportamento inesperado, o rollback é:

```sql
-- ROLLBACK das 6 FKs (apenas se necessário — não executar profilaticamente)
BEGIN;

-- media_download_queue (3 constraints)
ALTER TABLE evo.media_download_queue
    ADD CONSTRAINT fk_mdq_message
    FOREIGN KEY (message_id, instance_name)
    REFERENCES zapp.evolution_messages (message_id, instance_name)
    ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;

ALTER TABLE evo.media_download_queue
    ADD CONSTRAINT media_download_queue_message_id_instance_name_fkey
    FOREIGN KEY (message_id, instance_name)
    REFERENCES zapp.evolution_messages_wpp2 (message_id, instance_name)
    ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;

ALTER TABLE evo.media_download_queue
    ADD CONSTRAINT media_download_queue_message_id_instance_name_fkey1
    FOREIGN KEY (message_id, instance_name)
    REFERENCES zapp.evolution_messages_default (message_id, instance_name)
    ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;

-- media_loss_registry (3 constraints)
ALTER TABLE evo.media_loss_registry
    ADD CONSTRAINT fk_mlr_message_uuid_instance
    FOREIGN KEY (message_uuid, instance_name)
    REFERENCES zapp.evolution_messages (id, instance_name)
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;

ALTER TABLE evo.media_loss_registry
    ADD CONSTRAINT media_loss_registry_message_uuid_instance_name_fkey
    FOREIGN KEY (message_uuid, instance_name)
    REFERENCES zapp.evolution_messages_wpp2 (id, instance_name)
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;

ALTER TABLE evo.media_loss_registry
    ADD CONSTRAINT media_loss_registry_message_uuid_instance_name_fkey1
    FOREIGN KEY (message_uuid, instance_name)
    REFERENCES zapp.evolution_messages_default (id, instance_name)
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;

COMMIT;
```

> **Nota:** o rollback usa `NOT VALID` para evitar lock longo; após estabilização, executar `VALIDATE CONSTRAINT` individualmente.

---

## 9. Origem das Constraints (Rastreabilidade)

| Constraint Name | Origem | Arquivo |
|----------------|--------|---------|
| `fk_mdq_message` | Explícita | `20260811150100_evo_integridade_fks_limpezas.sql` (linha 91-94) |
| `fk_mlr_message_uuid_instance` | Explícita | `20260811150100_evo_integridade_fks_limpezas.sql` (linha 51-54) |
| `media_download_queue_message_id_instance_name_fkey` | Auto-gerado (produção) | Não rastreado em migration |
| `media_download_queue_message_id_instance_name_fkey1` | Auto-gerado (produção) | Não rastreado em migration |
| `media_loss_registry_message_uuid_instance_name_fkey` | Auto-gerado (produção) | Não rastreado em migration |
| `media_loss_registry_message_uuid_instance_name_fkey1` | Auto-gerado (produção) | Não rastreado em migration |

As 4 constraints auto-geradas foram criadas diretamente em produção, provavelmente quando as tabelas foram originalmente criadas com cláusula `REFERENCES` inline no DDL, antes da migração para o modelo de schema separado. A migration `20260811150100` adicionou apenas as 2 constraints com nome explícito.

---

## 10. Relação com o Plano de Independência

Este documento (E41) é uma **extração antecipada** das etapas E64-E65 do `PLANO_INDEPENDENCIA_100_ETAPAS_20260815.md`, justificada porque:

1. As FKs são o bloqueador mais direto para I9 = PASS (score atual: 33%)
2. A remoção é safe e isolada (não depende de etapas anteriores do plano)
3. O job de reconciliação (E43) é mais seguro e auditável que CASCADE implícito

Após E50, atualizar o PLANO_INDEPENDENCIA referenciando este documento e marcando E64-E65 como "concluído via E41-E50".

---

*Documento gerado em 2026-08-15 como parte da Auditoria de Fronteira evo/zapp.*  
*Referências: `AUDITORIA_INDEPENDENCIA_20260815.md`, `ANALISE_FRONTEIRA_EVO_ZAPP_20260815.md`, `BOUNDARY_SCORE_T0.json`, `baseline/20260815/cross_schema_fks.json`*
