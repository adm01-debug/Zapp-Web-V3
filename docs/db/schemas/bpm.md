# Schema `bpm` — BPM / Workflows

**Dono:** time de BPM/workflows  
**Atualizado:** 27/07/2026

## Propósito

Módulo de Business Process Management. Contém definições de workflows, instâncias de processo, e motores de regras de negócio.

## Estatísticas

| Objeto | Quantidade |
|---|---:|
| Tabelas | 41 |
| Funções | — |
| Triggers | 32 |
| RLS | habilitado |

## Tabelas Principais

- `bpm_workflows` — definições de workflow
- `bpm_instances` — instâncias em execução
- `bpm_tasks` — tarefas dentro de instâncias
- `bpm_rules` — regras de negócio
- `bpm_sla_configs` — configurações de SLA
- `bpm_sla_breaches` — violações de SLA detectadas

## Crons Relacionados

| Job | Frequência | Função |
|---|---|---|
| `bpm-check-breached-slas` (job 198) | */5 min | `bpm.fn_check_breached_slas` |

## Dependências

- **Consumido por:** `public` (41 views apontando para `bpm`)
- **Não depende de:** schemas de domínio
