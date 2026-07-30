# Relatório de Simulação de Perda de Dados

**Data:** 30/07/2026  
**Banco:** PostgreSQL 15.8 | 1.57 GB | 780 tabelas | ~922k linhas  
**Cache Hit Ratio:** 99.82% | **Uptime:** 2 dias  

---

## Sumário Executivo

| Cenário | Risco | Status | Ação Recomendada |
|---------|-------|--------|------------------|
| 1. Migration Quebrada | BAIXO | ✅ Schema íntegro, sem gaps | — |
| 2. DROP TABLE Acidental | BAIXO | ✅ Sem DROPs recentes | — |
| 3. Partição Dropada | MÉDIO | ✅ Partições presentes, mas muitas vazias | Revisar partições sem uso |
| 4. LGPD / Anonymização | **ALTO** | ⚠️ Estrutura montada, ZERO dados de consentimento | Implementar logging LGPD |
| 5. Backup Corrompido | **ALTO** | ⚠️ Backup ok, mas 7 secrets corrompidos | Recuperar vault urgente |
| 6. Replication Lag | **CRÍTICO** | 🚨 446 GB de WAL retido | Intervenção imediata |
| 7. WAL Corrompido | **CRÍTICO** | 🚨 Slots congelando, lag >400MB | Monitorar e resetar slots |

---

## CENÁRIO 1: Migration mal aplicada → schema quebrado

### Verificação
- **39 migrations** aplicadas em `zapp.schema_migrations`
- Range: `20210706140551` → `20260712160500`
- **Nenhum gap detectado** — versões contínuas e sequenciais
- Últimas migrations: sequência de 20260712150000 a 20260712160500 (aplicadas em bloco)

### Histórico
- `zapp.migration_audit`: 2 registros (Lusha V3 deploy + LGPD scheduled jobs fix)
- `archive.migration_audit`: vazia
- `archive.migration_progress_log`: migração wpp2 concluída com cutover em junho/2026
- `v_migration_reconciliation`: vazia (sem dados atuais)

### Conclusão: ✅ **Schema de migrations íntegro.** Sem evidência de quebra.

---

## CENÁRIO 2: DROP TABLE acidental → dados perdidos

### Verificação
- **0** DROP TABLE nos últimos 7 dias
- **563** DROP events no total, mas **apenas triggers/constraints** (RI_ConstraintTrigger = manutenção normal de FKs)
- **0** sequências órfãs encontradas
- Views existentes e acessíveis (539 public, 406 zapp, 16 evo)
- Nenhuma tabela sem PK em evo/zapp/public

### Conclusão: ✅ **Sem evidência de DROP TABLE acidental.** DDL audit íntegro.

---

## CENÁRIO 3: Partição dropada errada → dados históricos somem

### Tabelas Particionadas (6)
| Schema | Tabela | Partições | Tamanho |
|--------|--------|-----------|---------|
| evo | `evolution_conversations` | 23 | ~3.8 MB (apenas wpp2 ativa) |
| evo | `evolution_messages` | 23 | ~19 MB (apenas wpp2 ativa) |
| evo | `evolution_webhook_events` | 23 | ~5.9 MB (apenas wpp2 ativa) |
| evo | `evolution_webhook_events_v2` | 17 | ~17 MB (jul/2026 ativa) |
| realtime | `messages` | 9 | 8 kB (diárias) |
| _backups | `campaign_contacts_pre_dedup` | 1 | 0 bytes |

### Anomalia
- Das 23 partições por departamento em cada tabela evo, **apenas 2-3 têm dados** (wpp2, comercial_03, default)
- Partições `evolution_webhook_events_v2` têm planejamento mensal até **2027-06** (bom!)
- Partições `realtime.messages` diárias de 2026-07-25 a 2026-08-02

### Conclusão: ⚠️ **Partições presentes, mas maioria vazia.** Pode indicar dados não direcionados corretamente.

---

## CENÁRIO 4: LGPD / anonymização acidental → dados de clientes perdidos

### Tabelas LGPD
| Tabela | Registros | Status |
|--------|-----------|--------|
| `zapp._lgpd_b64` | **0** | ⚠️ Vazia |
| `zapp._lgpd_growth_stats` | **0** | ⚠️ Vazia |
| `zapp._lgpd_payload` | **0** | ⚠️ Vazia |
| `zapp.lgpd_consent_audit` | **0** | ⚠️ Vazia |
| `zapp.consent_records` | **0** | ⚠️ Vazia |
| `zapp.data_deletion_requests` | **0** | ⚠️ Vazia |
| `zapp.pii_access_log` | **0** | ⚠️ Vazia |
| `zapp._lgpd_retention_policies` | **1** | ✅ Configurado (180d hot / 2555d archive) |
| `public.lgpd_consent_audit` | **0** | ⚠️ Vazia |
| `public.lgpd_consent_audit_archive` | **0** | ⚠️ Vazia |

### Dados PII Reais no Banco
| Tabela | Registros | Risco |
|--------|-----------|-------|
| `zapp.contatos` | **3.236** | 📞 Nomes, telefones |
| `zapp.empresas` | **51.688** | 🏢 Dados empresariais |
| `zapp.profiles` | **18** | 👤 Perfis de usuário |
| `zapp.contact_intelligence` | **20.881** | 📊 Inteligência de contatos |
| `auth.users` | **18** | 🔐 Usuários autenticados |

### Conclusão: 🚨 **Zero registros de consentimento LGPD.** Estrutura montada mas não populada. Risco regulatório.

---

## CENÁRIO 5: Restore de backup corrompido → dados inconsistentes

### Status do Backup
- **Último backup:** `supabase_selfhosted_20260730_123915.dump` (63 MB, 760 tabelas)
- **Freshness:** ~4.5 horas atrás (dentro do prazo de 24h ✅)
- **Offsite:** Sincronizado ✅
- **Restore test log (hoje 11:00):** **7/7 PASS** ✅
  - backup_sentinel_freshness: ✅ last backup 16h ago
  - messages_wpp2_access: ✅ readable
  - contacts_row_count: ✅ 20.869 active
  - partition_count: ✅ 23 partitions
  - invalid_indexes: ✅ all valid
  - critical_functions: ✅ all 6 present
  - table_count_sanity: ✅ 560 tables

### Vault Corrompido 🚨
**7 secrets em quarentena desde 2026-06-11:**

| Secret | Impacto |
|--------|---------|
| `backup_passphrase_postgres_evolution` | ⛔ Backup criptografado irrecuperável |
| `minio_secret_key` | ⛔ Storage S3 offline |
| `restore_test_ingest_token` | ⛔ Testes de restore bloqueados |
| `hf_api_token` | ⛔ HuggingFace inacessível |
| `openai_api_key` | ⛔ OpenAI indisponível |
| `anthropic_api_key` | ⛔ Anthropic indisponível |
| `openrouter_api_key` | ⛔ OpenRouter indisponível |

**Status:** Todos com tag `DEFER-RECOVERY-PENDING-2026-05-09` — **pendente há 52 dias**.

### Tabelas de Backup
- `backup_metadata`: **vazia** (0 registros) — metadata não está sendo populada
- `_backups._backup_campaign_contacts_20260712`: backup pontual
- `_backups._backup_handle_new_auth_user_20260525`: backup pontual

### Conclusão: 🚨 **Backup físico ok, mas vault corrompido torna restore criptografado impossível.**

---

## CENÁRIO 6: Replication Lag → dados desatualizados

### Slots de Replicação
| Slot | Tipo | Database | Ativo | WAL Retido |
|------|------|----------|-------|------------|
| `cainophile_fqnhavdw` | logical | _supabase | ✅ | **446 GB** |
| `supabase_realtime_slot_realtime_` | logical | postgres | ✅ | **446 GB** |
| `supabase_realtime_messages_replication_slot_` | logical | postgres | ✅ | **446 GB** |

### Eventos WAL Slot Guard (últimos)
| ID | Slot | Lag (MB) | Congelado (s) | Ação |
|----|------|----------|---------------|------|
| 71 | cainophile_jgzf3q9y | 429.7 | 2.400 | terminated_consumer_recycled |
| 70 | cainophile_9vpcqyms | 509.0 | 3.000 | terminated_consumer_recycled |
| 69 | cainophile_y1f2vi6m | 451.8 | 1.801 | terminated_consumer_recycled |
| 65 | cainophile_kn1w0rsg | 614.6 | 11.401 | terminated_consumer_recycled |

### Risco
- **446 GB de WAL acumulado** — risco de estouro de disco
- Slots congelam por **30 min a 3+ horas** sem consumidor
- Consumidores são mortos e recriados automaticamente, mas padrão se repete
- Se WAL ultrapassar `max_slot_wal_keep_size`, PostgreSQL pode invalidar slots → **perda de dados de replicação**

### Conclusão: 🚨 **CRÍTICO. 446 GB de WAL retido. Risco de invalidação de slot.**

---

## CENÁRIO 7: WAL corrompido → perda de transações recentes

### Status
- WAL atual: `000000010000006F00000063`
- Queries ativas: nenhuma bloqueada/lenta
- Eventos de guarda: 71 registros mostram slots caindo e sendo reciclados
- Sistema de health score monitora WAL via `fn_system_health_score`
- `_wal_slot_guard_events` (public) registra eventos automaticamente

### Risco Imediato
- Repetidos "frozen slots" indicam consumidores que não conseguem acompanhar o volume de WAL
- Se o disco encher, PostgreSQL para completamente
- WAL corrompido + slots congelados = perda de transações não replicadas

### Conclusão: 🚨 **CRÍTICO. Padrão de falha consistente nos slots de replicação.**

---

## Recomendações Prioritárias

### 🔴 Crítico (ação imediata)
1. **WAL / Replication Slots:** Investigar por que os 3 slots retêm 446 GB cada. Verificar consumidores (cainophile, realtime) — podem estar com problemas de conexão. Considerar aumentar `max_slot_wal_keep_size` ou resetar slots não essenciais.
2. **Vault Corrompido:** Recuperar os 7 secrets pendentes desde 06/06. Sem a passphrase de backup, o restore criptografado é impossível.

### 🟡 Alto (ação em 7 dias)
3. **LGPD Compliance:** Implementar logging de consentimento nas tabelas `lgpd_consent_audit` e `consent_records`. Sem registros, a empresa não consegue provar conformidade LGPD.
4. **Backup Metadata:** Popular `_backups.backup_metadata` com histórico de backups. Hoje só o sentinel tem dados.

### 🟢 Médio (ação em 30 dias)
5. **Partições Vazias:** Revisar as 15+ partições comerciais vazias em evo. Podem indicar configuração incorreta de roteamento de mensagens.
6. **Documentação:** Consolidar procedimento de restore documentado (hoje depende de vault corrompido).

---

## Health Score (via `ops.fn_system_health_score`)

**Grade: A+ (98.1%)** — executado em 2026-07-30 14:06 BRT

| Componente | Score | Max | Status |
|-----------|-------|-----|--------|
| wpp2_connection | 20 | 20 | connected (3.8 min atrás) |
| webhook_pipeline | 12 | 15 | e2e_recent (3.5h silent) |
| partition_indexes | 10 | 10 | 0 missing |
| dead_tuples | 10 | 10 | 0% max |
| vault_secrets | 10 | 10 | webhook_secret OK |
| r2_storage | 10 | 10 | configured |
| backup_freshness | 10 | 10 | fresh (4.5h ago) |
| v2_mirror_pipeline | 10 | 10 | healthy |
| wal_slot_health | 5 | 5 | no_risky_slots (30MB lag) |
| security_acl | 5 | 5 | 0 breaches |
| pk_integrity | 5 | 5 | 0 tables missing PK |
| rls_coverage | 5 | 5 | 0 tables RLS off |

> ⚠️ **Nota:** O health score mostra WAL saudável **agora** (30MB lag), mas os eventos de WAL guard mostram um **padrão recorrente** de slots congelando com 400-600MB de lag a cada 30min-4h. O score atual é bom, mas o padrão indica problema crônico nos consumidores de replicação.
