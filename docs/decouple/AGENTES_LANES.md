# Lanes dos agentes — desacoplamento evo × zapp

> Regra: cada agente declara aqui sua superfície ANTES de tocar em qualquer coisa.
> Superfície = repo + branch + objetos de banco. Fora da sua lane = não toca.
> Atualizado: 2026-08-16.

| Agente | Lane (superfície) | Repo/branch | Banco | Status |
|---|---|---|---|---|
| **Claude (claude.ai)** | E41/I7 — baseline da estrutura do schema `evo` como migration no repo dono | `evolution-stack` · branch `claude/e41-evo-schema-baseline` | **somente leitura** (introspecção/pg_dump do schema `evo`) | 🟢 ativo |
| **Agente 2 (correções em sequência)** | I1 residual e demais lotes — funções/triggers evo↔zapp | `zapp-web-v3` · `claude/evolution-zapp-separation-analysis-29lixd` | escrita em funções/triggers dos schemas `evo`/`zapp` | 🟢 ativo |

## Zonas congeladas (nenhum agente toca sem coordenação explícita)
- **I4 / E73–E77** — mover tabelas `evolution_*` de `zapp` para `evo` (destrutivo, conflita com tudo)
- ~~sql-gate / registry / fixture~~ — RESOLVIDO 2026-08-16 (Claude/claude.ai, aprovado por Joaquim): registry dividido em PROD_OBJECTS_REGISTRY (15 verificados ao vivo, bloqueante) + PLANNED_OBJECTS (10 inexistentes, WARN). Criar os `ops.*`/2 views segue como backlog — quem criar, move a entrada de volta.
