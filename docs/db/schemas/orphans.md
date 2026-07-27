# Schemas Órfãos: `_backups` e `parity_audit`

**Status:** DECISÃO PENDENTE (etapa 15 do plano DB)  
**Data:** 27/07/2026

---

## `_backups`

### O que é

Schema criado historicamente para armazenar snapshots de dados antes de migrações de risco. Contém tabelas no padrão `tablename_backup_YYYYMMDD`.

### Estado Atual

- Sem dono definido
- Sem política de retenção (crescimento não controlado)
- Usado ad-hoc por devs antes de migrações arriscadas
- **Não está em uso ativo pelo app**

### Tabelas Conhecidas

```sql
-- Ver tabelas atuais:
SELECT tablename, pg_size_pretty(pg_relation_size(schemaname||'.'||tablename))
FROM pg_tables WHERE schemaname = '_backups'
ORDER BY tablename;
```

### Decisão Proposta

**Opção A (Recomendada):** Consolidar em `archive` com nomenclatura padronizada:
- `archive.backups_tablename_YYYYMMDD`
- Política de retenção: 90 dias para backups de pré-migração
- Acesso: `service_role` only

**Opção B:** Manter `_backups` como schema dedicado mas com:
- Política de retenção documentada e automatizada
- Owner formal: ops/plataforma
- Purge cron mensal

**Aceite:** Aguarda alinhamento do time de plataforma.

---

## `parity_audit`

### O que é

Schema criado para auditoria de paridade entre ambientes (staging vs produção). Contém funções e tabelas de comparação de schemas.

### Estado Atual

- Sem dono definido
- Sem uso regular documentado
- Funções possivelmente obsoletas (staging foi provisionado apenas em 2026-07-27)

### Tabelas/Funções Conhecidas

```sql
-- Ver objetos:
SELECT 'table' AS type, tablename AS name FROM pg_tables WHERE schemaname = 'parity_audit'
UNION ALL
SELECT 'function', proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'parity_audit'
ORDER BY 1, 2;
```

### Decisão Proposta

**Opção A:** Mover para `ops.parity_*` e integrar com o pipeline de CI:
- `ops.parity_check()` — valida paridade schema entre staging e produção
- Executar automaticamente no pipeline de cada PR

**Opção B:** Deprecar e dropar se não há uso ativo.

**Aceite:** Aguarda confirmação de uso atual e alinhamento do time.

---

## Cronograma

| Ação | Prazo |
|---|---|
| Auditoria de uso: confirmar se há código apontando para esses schemas | Sprint atual |
| Decisão formal (A ou B para cada schema) | Próxima sprint |
| Migration de consolidação/remoção | Após staging validado |

---

## Nota

Enquanto a decisão não é tomada, ambos os schemas ficam documentados aqui. Nenhum código novo deve referenciar `_backups` ou `parity_audit` sem aprovação explícita.
