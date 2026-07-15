# 🛡️ Runbook de Disaster Recovery — ZAPP WEB

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


## RPO / RTO
- **RPO (Recovery Point Objective)**: 24 horas (Backup diário Supabase).
- **RTO (Recovery Time Objective)**: 4 horas para restauração total do ambiente.

## Procedimento de Restore (Staging Drill)
1. **Snapshot**: Identificar o último snapshot saudável no dashboard Lovable Cloud.
2. **Nova Instância**: Criar um projeto temporário de restore.
3. **Migrações**: Re-aplicar as 453+ migrations para garantir a integridade do schema.
4. **Validação**: Rodar `bun run smoke:pre-deploy` no ambiente restaurado.

## Contatos Cloud
- Supabase Support: support@supabase.com
- Lovable Cloud Status: https://status.lovable.dev
