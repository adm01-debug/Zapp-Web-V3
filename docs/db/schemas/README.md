# Schemas — READMEs por Domínio

Este diretório contém um arquivo README para cada schema de negócio do banco.

## Índice

| Arquivo | Schema | Papel |
|---|---|---|
| [zapp.md](./zapp.md) | `zapp` | App ZAPP Web — dados de produto |
| [evo.md](./evo.md) | `evo` | Evolution API — dados WhatsApp |
| [public.md](./public.md) | `public` | Camada de API (PostgREST) |
| [ops.md](./ops.md) | `ops` | Infra, observabilidade |
| [bpm.md](./bpm.md) | `bpm` | BPM / workflows |
| [ai.md](./ai.md) | `ai` | IA / agentes / embeddings |
| [financeiro.md](./financeiro.md) | `financeiro` | Módulo financeiro |
| [email_app.md](./email_app.md) | `email_app` | Integração Gmail/IMAP |
| [vendas.md](./vendas.md) | `vendas` | Módulo vendas |
| [logistica.md](./logistica.md) | `logistica` | Módulo logística |
| [artes.md](./artes.md) | `artes` | Módulo artes / design |
| [archive.md](./archive.md) | `archive` | Dados frios / backup |
| [orphans.md](./orphans.md) | `_backups`, `parity_audit` | Schemas órfãos — decisão pendente |

## Regras

- Todo novo schema precisa de README neste diretório antes do merge
- README deve incluir: dono, propósito, tabelas principais, dependências permitidas
- Ver SCHEMA-CONTRACT.md para regras de dependência entre schemas
