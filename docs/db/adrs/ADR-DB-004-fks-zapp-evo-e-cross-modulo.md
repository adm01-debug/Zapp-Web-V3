# ADR-DB-004 — FKs zapp→evo e cross-módulo: MANTER (exceção formal documentada)

**Status:** PROPOSTO — aguarda aprovação do time de plataforma
**Data:** 06/08/2026 · **Autor:** AG-03 (Onda 2, D3+D4 — ARQ-07/ARQ-14 P1) · **NENHUM DDL**

## Contexto
- R3 do SCHEMA-CONTRACT prevê `zapp→evo` apenas via views/RPC curados; 32 FKs diretas violam a *forma* (não a direção, permitida).
- 15 FKs cross-módulo amarram domínios via **proxys de identidade** (`zapp.profiles` ×3, `evo.evolution_contacts` ×4) e entidades compartilhadas (transportadoras/cotacoes/sales_deals/email_accounts).

## Inventário
- **32 FKs zapp→evo** — todas apontam `evo.evolution_contacts(id)` (alvo único): 18 CASCADE / 11 NO ACTION / 3 SET NULL; 32/32 colunas `contact_id` com índice válido; `confupdtype` 32/32 NO ACTION.
- **15 FKs cross-módulo**: email_app→evo 3, email_app→zapp 2, vendas→logistica 2, zapp→email_app 1, ai→zapp 1, financeiro→evo 1, financeiro→logistica 1, financeiro→zapp 1, intra-zapp 3 (extensions→tenants, queues→sla_policies, sla_violations→sla_policies).
- **sla_policies/tenants NÃO são schemas** — são tabelas em `zapp` (falso positivo de `regclass::text` com search_path da sessão MCP): `tenants` = config do Realtime Server (1 linha `realtime-dev`); `sla_policies` = dormante (0 linhas, 2 FKs apontando).

## Decisão: MANTER (nenhum DDL)
1. As 32 FKs zapp→evo são **integridade referencial forte e intencional** (LGPD/erasure via CASCADE, identidade única via NO ACTION, volatilidade via SET NULL). Índices de apoio já existem — dropar não traria ganho e abriria órfãos silenciosos em escrita concorrente (cron/edge).
2. **Exceção formal à R3:** FKs diretas permitidas quando (a) alvo é `evolution_contacts(id)` ou `profiles(id)` (proxys de identidade), ou (b) entidade compartilhada de negócio; SEMPRE com ação de deleção explícita. Nova FK direta exige justificativa no PR.
3. `zapp.tenants` e `zapp.sla_policies` permanecem em zapp (P3: documentar tenants como plataforma; avaliar sla_policies em ciclo futuro com migração das FKs).

## Simulação de cenários
| Cenário | Impacto | Veredito |
|---|---|---|
| Dropar as 32 FKs | Escrita concorrente deixa de ser barrada → órfãos silenciosos em 32 tabelas; perde-se CASCADE p/ LGPD (erasure vira job manual com risco de vazar PII) | ❌ DROP |
| Manter as 32 FKs | Acoplamento explícito e versionado; DELETE com dependências falha com FK violation (comportamento conhecido); blast radius 20k linhas mitigado (ci_contact_id_fk DEFERRABLE) | ✅ MANTER |
| Mover sla_policies/tenants | Quebra FKs de queues/sla_violations/extensions; sem consumidor que justifique | ✅ MANTER |

## Consequências
- CI-03 (evo→zapp) inalterado (0 violações). Sugere-se **CI-06 informativo** (não bloqueante): `count(*)` de FKs zapp→evo == 32 (drift alerta, não falha).
- Rastreabilidade: ARQ-07 (32 FKs) e ARQ-14 (cross-módulo) da fase 1 · D3/D4 do PLANO_RUMO_10_10_SIMULACOES.
