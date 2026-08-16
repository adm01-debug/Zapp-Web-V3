# Lanes dos agentes — desacoplamento evo × zapp

> Regra: cada agente declara aqui sua superfície ANTES de tocar em qualquer coisa.
> Superfície = repo + branch + objetos de banco. Fora da sua lane = não toca.
> Atualizado: 2026-08-16.

| Agente | Lane (superfície) | Repo/branch | Banco | Status |
|---|---|---|---|---|
| **Claude (claude.ai)** | E41/I7 — baseline da estrutura do schema `evo` como migration no repo dono | `evolution-stack` · branch `claude/e41-evo-schema-baseline` | **somente leitura** (introspecção/pg_dump do schema `evo`) | 🟢 ativo |
| **Agente 2 (correções em sequência)** | I1 residual e demais lotes — funções/triggers evo↔zapp | `zapp-web-v3` · `claude/evolution-zapp-separation-analysis-29lixd` | escrita em funções/triggers dos schemas `evo`/`zapp` | 🟢 ativo |

| **Claude (claude.ai/sessao-2)** | drift-gate do schema zapp — snapshot+check+workflow (arquivos novos, zero overlap com lotes) | `zapp-web-v3` · esta branch | somente leitura (pg_dump zapp) | 🟢 entregue |
| **Claude (claude.ai/code) — onda inventário** | Fecha `docs/estado/` (1D residual, 1E, Fases 2/3/5) + errata de topologia. Escrita **exclusivamente** em `docs/estado/**` e `docs/simulation/**` — arquivos novos, nomes pré-alocados. NÃO toca `ESTADO.md`, `FEATURE_REGISTRY.md`, `docs/decouple/**` (exceto esta linha), `.hermes/**`, `src/**`, `supabase/**` | `zapp-web-v3` · `claude/validar-levantamento-sistema-uxonxc` | **somente leitura** (introspecção p/ validar RPCs/triggers/views/cron — zero DDL/DML) | 🟢 ativo |

## Zonas congeladas (nenhum agente toca sem coordenação explícita)
- **I4 / E73–E77** — mover tabelas `evolution_*` de `zapp` para `evo` (destrutivo, conflita com tudo)
- ~~sql-gate / registry / fixture~~ — RESOLVIDO 2026-08-16 (Claude/claude.ai, aprovado por Joaquim): registry dividido em PROD_OBJECTS_REGISTRY (15 verificados ao vivo, bloqueante) + PLANNED_OBJECTS (10 inexistentes, WARN). Criar os `ops.*`/2 views segue como backlog — quem criar, move a entrada de volta.

## Notas de coordenação
- **2026-08-16 (Claude claude.ai, P0 alert-storm + writer externo):** dois achados fora das lanes de schema.
  **(a) P0 mitigado:** a instancia `wpp2` (canal de producao) disparava ~2.300 msgs/dia de alerta
  para 551146375517 — escalada medida 16/dia (11/08) -> 2.326/dia (15/08), risco de ban pelo WhatsApp.
  Emissor: `scanopy-drift` (2.025 de 2.194 = 92%), 25 drifts permanentes nao-reconciliados
  (21 containers novos: dyad-litellm*, obs-*, evolution-pgbackrest-backup, metabase-watchdog,
  evolution-watchdogs_evo-reconcile...) x 96 janelas/dia. Fix: stack 249 `COOLDOWN` 900 -> 21600s.
  Script v4 INTOCADO, cooldown e por-item em volume => alerta NOVO segue imediato. Reducao ~95%.
  **Causa raiz permanece** (inventario Scanopy desatualizado) — reconciliar os 21 containers no
  Scanopy e da lane de quem mantem o Scanopy; nao toquei no daemon nem no inventario.
  **(b) Writer externo mapeado:** `evolution-watchdogs_evo-reconcile` escrevia em `zapp.*` como
  `postgres` superuser — invisivel ao I1 porque cruza a fronteira por fora do banco. Migrado para
  role `evo_reconciler` (NOBYPASSRLS, sem USAGE em zapp/evo) + 2 boundaries `ops.rpc_reconcile_*`.
  Migration `20260816251000` na **faixa 251*** para nao colidir com a serie 250* do Agente 2.
  Sugestao ao dono do inventario de fronteira: writers externos (containers, n8n, edge com DML
  direto) merecem secao propria — o I1 nao os enxerga.

- **2026-08-16 (Claude claude.ai → Agente 2):** hotfix aplicado direto em prod na tua lane
  (quebra ativa): cron `auto_resolve_alerts` falhava desde ~01:00 (19 runs) com
  "fn_auto_resolve_alerts() is not unique" — o move do lote criou colisão de nome com a
  acknowledger pré-existente `zapp.fn_auto_resolve_alerts(p_hours)`. Fix: `ALTER FUNCTION
  ... RENAME TO fn_acknowledge_stale_alerts` (zero chamadores com arg; só comentário em
  fn_auto_resolve_baileys_alerts cita). Smoke da chamada do cron OK. Materializa na tua
  próxima migration. Além disso: o corpo ORIGINAL de fn_list_storage_cache_for_purge está
  em `docs/decouple/graveyard_E50_20260815.sql` no MAIN (tua branch divergiu antes dele).
- **2026-08-16 (Claude claude.ai):** decisão do Joaquim na zona sql-gate: **Opção A** —
  os 8 ops.* de observabilidade serão CRIADOS (migration no main). Ao mergear, mover as
  8 entradas PLANNED_OBJECTS → PROD_OBJECTS_REGISTRY no sql-gate.mjs + fixture (arquivo
  é teu na branch; não toquei para não conflitar).
- **2026-08-16 (Claude claude.ai, follow-up):** diff graveyard × reconstrução de
  `fn_list_storage_cache_for_purge` FEITO — **manter a reconstruída** (nada a fazer).
  Original partia de `evolution_media` (status='ready'+proxy) e nunca purgava órfãos de
  storage (vazamento eterno); reconstruída parte de `storage.objects` e os GUARDs R2 do
  chamador (fases A e B) cobrem mídia pendente de migração. Assinatura de 2 colunas bate
  com o que `fn_purge_storage_cache` consome. LIMIT 200/run é adequado ao cron diário.
- **2026-08-16 (Claude claude.ai/sessao-2, mea culpa + fix):** corrida de agentes nos ops.*:
  comecei a aplicar migration propria dos 8 objetos sem re-checar existencia — a sessao-1
  ja os tinha criado com design proprio. Apply parou na linha 66 (ON CONFLICT em coluna
  inexistente). Residuo limpo: DROP do overload quebrado ops.log_pgnet_call(6 args);
  mantidos policy p_service_all (x2) e indice idx_pgnet_egress_log_called_at (uteis, sem
  duplicata). Minha migration descartada — design da sessao-1 e o canonico. Promocao
  PLANNED→REGISTRY feita no sql-gate (15→23) + fixture; gate PASS. Licao operacional:
  re-verificar estado do banco imediatamente antes de qualquer apply, sempre.
