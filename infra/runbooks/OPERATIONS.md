# Runbook de Operações — AtomicaBR

## Correções Aplicadas em 22/07/2026 (QA Exaustiva)

### Evolution API (wpp2)
| Ação | Comando/API | Status |
|---|---|---|
| Webhook desabilitado | `evo_set_webhook(enabled=false)` | ✅ |
| alwaysOnline=true | `evo_settings_set(alwaysOnline=true)` | ✅ |
| readMessages=true | `evo_settings_set(readMessages=true)` | ✅ |
| readStatus=true | `evo_settings_set(readStatus=true)` | ✅ |

### Banco de Dados (Supabase PostgreSQL 15.8)
| Ação | Descrição | Status |
|---|---|---|
| VACUUM ANALYZE | `evolution_messages_wpp2` + `evolution_contacts` | ✅ |
| WAL Slot Recovery | `cainophile_s7fgrb36` removido (278MB lag) | ✅ |
| Supabase DB restart | Forçado para dropar slot congelado | ✅ |
| Supabase Realtime restart | Forçado para reconectar CDC | ✅ |

### Monitoramento
| Ação | Descrição |
|---|---|
| Cron: WAL Lag Monitor | A cada 15min, alerta se lag > 100MB |
| Cron: Backup Health Check | Diário 6h, verifica backup mais recente |

## Procedimentos de Emergência

### WAL Slot Congelado
```sql
-- Verificar lag
SELECT slot_name, database, active,
  pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)/1048576 AS lag_mb
FROM pg_replication_slots;

-- Solução: restart do Supabase DB
```

### CrowdSec Bouncer Parado
```bash
# Verificar último pull
cscli bouncers list

# Restart
```

### Restaurar Backup
Ver `infra/backup/README.md`
