# ADR-I4: Decisão final — Rota A MANTIDA (fato consumado em produção)

**Data:** 2026-08-16
**Status:** ✅ APROVADO pelo dono (Joaquim)
**Supersede em definitivo:** decisão intermediária de Rota B (`docs/decouple/ADR-I4-ROTA-B-DECISION.md`, branch `claude/evolution-zapp-separation-analysis-29lixd`) — **descartada após verificação do estado real**.
**Invariante afetado:** I4 — "O dado da Evolution reside no schema da Evolution"

---

## 1. Decisão

**A Rota A está MANTIDA como arquitetura final: as tabelas físicas de WhatsApp (`evolution_messages`, `evolution_conversations`, `evolution_contacts` + partições) residem no schema `evo`.** O app lê e escreve exclusivamente via **bridge views** em `zapp.*` (compatibilidade total — nenhuma função/query do app precisou mudar). `public.*` segue como camada de contrato.

O dono confirmou em 16/08/2026: **manter, não reverter** — não desfazer trabalho de outro agente já aplicado e validado em produção.

## 2. Linha do tempo (por que a Rota B foi descartada)

| Momento | Evento |
|---|---|
| 11:50Z | Agente paralelo aplica migration `20260816250003_decouple_e73_e75_i4_zero.sql` **em produção** (ALTER SET SCHEMA + bridge views; 45 FKs e 21 triggers remapeiam por OID; I4: 3→0) |
| 12:08Z | Decisão de Rota B registrada (sem conhecimento do commit de 11:50Z — o main local estava 1 commit atrás) |
| 12:12Z | **Verificação real no banco de produção**: tabelas físicas JÁ em `evo`, bridge views em `zapp`, gate canônico confirma `I4_tabelas_evolution_fora_de_evo = 0` |
| 12:20Z | Dono decide: **MANTER Rota A** — reverter seria desfazer trabalho de outro agente em produção, com risco de janela e zero ganho (E96 — separação física — continua sendo "avaliar, não executar" em qualquer rota) |

## 3. Evidências (medidas em produção, 16/08 12:12Z — `ops.fn_boundary_audit()`)

```json
{
  "I3_fks_cruzadas": 0,
  "I1_fns_evo_citando_zapp": 4,
  "I2_fns_zapp_citando_evo": 1,
  "I4_tabelas_evolution_fora_de_evo": 0,
  "I5_grants_authenticated_select_evo": 0,
  "I8_fns_pgnet_provider_fora_gateway": 0,
  "aux_searchpath_evo_com_zapp": 0,
  "aux_triggers_zapp_com_fn_evo": 0,
  "aux_cron_citando_zapp_evolution_tables": 3
}
```

## 4. Consequências

- **I4 = PASS (0)** — meta do plano atingida para o invariante mais crítico.
- As **148 referências físicas** a `zapp.evolution_*` nas funções continuam válidas **porque `zapp.evolution_*` agora são views** (nomes preservados). Nenhuma reescrita necessária (insight do ADR-I4-E73-E77, confirmado).
- **E67–E71 (indireção de 161 fns)** — não são mais necessárias como pré-requisito de move; o move já ocorreu com views. O `aux_phys_refs_fns_zapp_evolution=148` passa a ser **aceito por design** (views de compatibilidade), podendo ser reduzido gradualmente em manutenção normal.
- **Realtime:** `evolution_contacts` continuou na publication `supabase_realtime` (move por OID não quebra publicação) — validar canal do front como smoke (E76), sem janela.
- **Pendências da fronteira restantes (próximas ondas):**
  1. I1: 4 fns `evo` citando `zapp.*` — classificar e mover/corrigir
  2. I2: 1 fn `zapp` citando `evo.*` — corrigir
  3. I6: formalizar soberania (E28 obs, E33 workflow destino, E34 secrets, E37 prova destrutiva em staging)
  4. I7: 51+ migrations legadas com DDL `evo.*` no zapp-web-v3 — gates E42/E43 + ADR-015 + schema registry
  5. I9: ensaio real de troca de provider (E91–E95)
  6. E89: consumer sem `PG_EVOLUTION_URL` (escrita direta do lado Evolution)
  7. Fase 8: E96 ADR-017 "avaliar/não fazer", E97 gates bloqueantes, E98 ratchet, E99 rotina trimestral, E100 `BOUNDARY_SCORE_T1.json`

## 5. Nota de coordenação multi-agente

Este ADR registra o **estado final de uma corrida entre agentes** (dois planos paralelos convergiram para o mesmo objetivo com abordagens diferentes — Rota A aplicada e Rota B decidida em janela de ~20 min). A lição operacional: **verificar o estado real do banco/repo antes de registrar decisão de arquitetura** (o `git fetch` no momento da decisão B não tinha o commit de 11:50Z; a verificação de 12:12Z revelou o fato consumado).
