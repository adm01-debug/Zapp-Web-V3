# Schema `archive` — Dados Frios / Backups

**Dono:** time de plataforma  
**Atualizado:** 27/07/2026

## Propósito

Armazenamento de dados históricos, tabelas depreciadas, snapshots de pré-migração. **Não contém objetos em uso ativo pelo app.**

## Estatísticas

| Objeto | Quantidade |
|---|---:|
| Tabelas | 25 |

## Nomenclatura

Tabelas seguem o padrão: `tablename_backup_YYYYMMDD`

## Política de Acesso

- **Acesso:** `service_role` only — todas as tabelas sem RLS policy são service_role-only (documentado)
- **10 tabelas sem RLS policy** — intencional; todas são dados de backup, nunca expostas ao app

## Política de Retenção (Pendente Formalização)

| Tipo | Retenção Proposta |
|---|---|
| Backups de pré-migração | 90 dias |
| Tabelas depreciadas | 180 dias (após confirmação de desuso) |
| Snapshots de emergência | 365 dias |

> Status: política de retenção ainda não implementada automaticamente. Adicionar purge cron na etapa 37.

## Dependências

- Não é consumido por nenhum schema de aplicação
- Criado e acessado apenas por operações de DBA/plataforma
