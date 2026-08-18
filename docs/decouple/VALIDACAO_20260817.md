# VALIDAÇÃO EXAUSTIVA 2026-08-17 — Correções e Melhorias Implementadas

**Escopo**: validação de 10 frentes (10 agentes em paralelo, evidência em produção) + janela E90 operacional.

## Resultados por frente

| Frente | Veredito | Evidência |
|---|---|---|
| Fanout realtime (trigger v2, RLS, publication, TTL, I2) | ✅ PASS | INSERT/UPDATE propagados (id=fonte, contact_id via RPC de contrato); RLS: anon bloqueado, admin vê 27, agent 0; cron 517 ativo (DELETE 16-55/run); **I2=0** |
| Dedupe (unique index, cron 516, edge reprocess) | ✅ PASS | 23505 comprovado; cron */15 ativo; edge 200; parseOrReject no main |
| E89 HTTP (secret, paridade, HMAC) | ✅ PASS | Secret 64B montado; 118 linhas/30min; paridade ~100% (delta ±1-3/h); HMAC 200/401 (fail-closed) |
| PII/segurança (contact_phones, conversations, exec_sql) | ✅ PASS | INSERT negado; admin vê 15.743, agent 0, anon negado; exec_sql só postgres/service_role |
| E86 egress log | ✅ PASS | 339 linhas; reconcile via_gateway=true ×331; outbound false por design; fila drena pending→sending |
| Snapshot/drift | ⚠️ VERMELHO (baseline) | drift-gate falha por migrations de outros agentes sem regen; snapshot CONTÉM fanout (9 hits — V6 checou snapshot errado) |
| PRs mergeados (#1162/#1165) | ✅ PASS | hooks legados removidos; diagrama limpo; teste 6/6; adapter headers ok |
| Gap front fanout | ✅ FECHADO (#1208 merged) | useMessageStatus, messageRepository (3), useRealtimeManagement, useEvolutionMonitoring migrados p/ espelho v2 |
| Imagem Evolution (0b154e1c) | ✅ ALINHAMENTO CORRETO | compose do repo aponta a digest; build CI 16/08 (baileys rc.9); envs/secrets preservados; healthcheck verde |
| Multi-agente | ✅ SEM COLISÕES | onda g1-g20 de outro agente mapeada; 0/0 da janela E90 = esperado |

## Correções aplicadas nesta rodada de validação

1. **Migration csat 20260817200000 aplicada no banco** (merge do #1171 sem aplicação): `uq_csat_surveys_conversation` + `uq_csat_responses_message_id` + `rating` integer nullable (drop/recreate da view public.csat_surveys para o ALTER TYPE) + registro em schema_migrations. **Dedupe csat agora REAL** (o guard 23505 do código passou a funcionar).
2. **Front migrado para o espelho** (PR #1208): 4 arquivos, filtros preservados (contact_id=eq / remote_jid=eq). tsc 0.

## GAPS REAIS encontrados (novos)

| # | Gap | Severidade | Ação |
|---|---|---|---|
| G1 | **Reaper da fila outbound não existe** — falha de envio deixa a mensagem presa em 'sending' para sempre (prova: 8 sintéticos TEST-E90F2 ficaram 'sending' ~5h; fn_retry_stuck_messages trata só evolution_messages) | **ALTA** | Criar reaper/cron para outbound_message_queue (status sending + idade > X → failed + failed_messages com key) |
| G2 | design-system 152 > teto 130 (quality-gate vermelho para todos os PRs) | MÉDIA | Reduzir violações ou subir teto conscientemente (onda de outros agentes) |
| G3 | 75 migrations do repo não registradas no banco (drift) | MÉDIA | Reconciliar (aplicar as que faltam ou registrar as já aplicadas) |
| G4 | drift-gate edge (E39 hash) vermelho | MÉDIA | Verificar volume×repo do deploy-edge |

## Janela E90 — resultado operacional

- ✅ **Mecanismo de escala DESTRAVADO** (recriação do serviço via stack deploy — campo legado do raft purgado; escala via docker-cli funcional)
- ✅ Evolution ficou 10min fora e religou healthy (1/1) sem perda de mensagens recebidas (Rabbit retém)
- ✅ Sintéticos inseridos corretamente (8/8) — porém ficaram 'sending' (G1 acima — achado valioso do teste)
- ✅ Nenhuma duplicação, nenhum erro novo na DLQ
- ⚠️ Critérios de carga do breaker por aba não exercitados (sem aba ativa — in-memory)

**Autor**: Hermes (validação 17/08) · **Data**: 2026-08-17
