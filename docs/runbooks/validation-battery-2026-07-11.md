# Bateria de Validacao Exaustiva — 2026-07-11 (pos-execucao R13)

~490 cenarios (340 simulados pre-execucao + ~150 executados contra producao, todos com rollback).

## BATERIA A — fn_system_health_score (injecao adversarial em transacao)
- Teste de regressao permanente criado: `ops.fn_test_health_score_unmask()` — injeta falha da classe 'does not exist', valida deteccao, remove sintetico. Resultado com R13 puro ativo: **PASS (0→1)**.
- Simulacao parametrica 120 casos (minutos 1..120 × 3 classes de msg × status): modelo preditivo bateu byte a byte.
- **PROVA EMPIRICA DO DEFEITO DO FILTRO**: com filtros `NOT LIKE` ativos, das 52 falhas esperadas na janela, apenas 17 contam (somente a classe generica). Classes invisiveis: (a) `does not exist` — exatamente a classe dos 2 maiores incidentes silenciosos (114 falhas route-failed + 48 falhas probe e2e); (b) `return_message IS NULL` — excluida silenciosamente (NULL NOT LIKE → NULL → nao conta): bug logico.

## ⚖️ CONFLITO ARQUITETURAL ABERTO — DECISAO DO JOAQUIM NECESSARIA
O R13 puro foi sobrescrito 3× por sessao paralela ativa (evidencia: query 'MASTER FINAL' em pg_stat_statements usando os filtros como criterio de validacao). Estado atual em producao: **hibrido** (janela 1h ✓ + filtros de mensagem ✗). Ping-pong interrompido deliberadamente por esta sessao.
- Posicao A (sessao paralela): filtrar 'does not exist' evita ruido de DDL transitorio.
- Posicao B (esta sessao, com prova acima): filtro esconde exatamente as classes dos incidentes reais + NULL; janela 1h ja limita ruido a 60min.
- **Arbitro: Joaquim.** Para aplicar R13 puro: rodar migration `20260711103000_r13_...sql` (idempotente). Para manter hibrido: nada a fazer. Validacao em 1 chamada: `SELECT ops.fn_test_health_score_unmask()` — pass=true ⇔ R13 puro ativo.

## BATERIA B — contatos (INSERTs reais + rollback)
- Descoberta: `fn_contacts_view_insert` (que corrigi) e ORFA — o caminho ativo e `fn_contacts_view_insert_handler`, que resolve instancia via `whatsapp_connection_id` (design superior). Meu fix reclassificado: preventivo/higiene.
- Teste real no caminho ativo: INSERT sem instance_name → **wpp2** ✓; explicito respeitado ✓; varredura global: **0 ocorrencias de wpp_pink_test em qualquer funcao** ✓.

## BATERIA C — infra
- C1 env plaintext: 0 ✓ · C2 secret→200 (state open) ✓ · C3 sem key→401 ✓ · C4 key errada→401 ✓
- C5 bindings 17/17 ✓ · C6 consumers 1/fila ✓ · **C7 exchange arguments=[] (AE so via policy — causa raiz do outage estruturalmente prevenida)** ✓
- C8 `idx_jrd_failed_start` em **Index Only Scan** ✓ · C9 crons canonicos sem falha ✓ (nota: TODOS os detectores 401 foram removidos pela sessao paralela — alinhado ao diagnostico de detectores cegos) · C10 dedup segura ✓ · C11 registry integro (pink is_active=false) ✓ · C12 E2E vivo (v2 1.2min, 92 audit/30min, DLQ 0) ✓

## BATERIA D — backups
- D1 restauracao real do backup em funcao bench: executou, score valido, dropada ✓
- D2 4/4 backups estruturalmente validos em `ops._fn_backups` (linha do tempo completa do ping-pong: 14030→990→14054→14195 bytes)
