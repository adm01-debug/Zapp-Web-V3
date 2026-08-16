# SIMULAÇÃO DE CENÁRIOS — Inventário Funcional ZAPP-WEB-V3 (100 etapas)

> **Data:** 2026-08-04 · **Método:** simulação computacional ancorada em ground truth real (MCP Supabase/Portainer/GitHub + greps do repo local)

## 1. Baseline real (ground truth 2026-08-04)

| Camada | Quantidade | Detalhe |
|---|---|---|
| zapp tabelas | 321 | +380 views (158 `evolution_*` são **VIEWS**, não tabelas) |
| evo tabelas | 156 | `evolution_*` físicas + partições mensais |
| email_app | 30 | gmail_/imap_/email_/nps_/meta_ |
| Funções zapp | 1.060 | rpc_: 81/191 chamáveis auth · fn_: 127/424 · get_: 18/47 |
| Crons pg_cron | 146 | todos active=true |
| Realtime publication | 68 tabelas | zapp 49 · evo 13 · email_app 5 · financeiro 1 |
| Edge functions deployadas | 110 | via Portainer exec |
| Front: RPCs chamados | 63 | from(): 164 · invoke(): 57 · channels: 41 · buckets: 4 |
| Front: rotas | ~26 | AppRoutes.tsx (lazy) |
| Placeholders/TODO | 20 / 43 | 'em breve'/disabled candidates |

## 2. Cenários simulados: 28 (taxonomia 5 fases)

Severidade: **CRITICO=5 · ALTO=10 · MEDIO=10 · BAIXO=3** · Risco médio: 3.51 · Maior risco: 4.45

## 3. Top cenários de risco

| Risco | Fase | Categoria | Cenário | Mitigação |
|---|---|---|---|---|
| 4.45 | F1 | Grep MSYS | search_files falha em workers Windows (IO error) | Workers usam terminal+grep; orquestrador usa search_files com paths Windows |
| 4.45 | F2 | Truncation | supabase_db_query trunca 1060 funções (100K chars) | Agregar por prefixo + LIMIT/OFFSET + conferir `_total_rows` |
| 4.45 | F2 | Views evo | zapp.evolution_* = 158 VIEWS (não tabelas) | relkind v/m separado; realtime só em tabela física |
| 4.10 | F3 | Wire quebrado | `.rpc('x')` no front sem função no DB | Diff rpc_calls_front.txt vs funções zapp (63 chamadas) |
| 4.10 | F3 | Realtime | Subscription em VIEW (não emite WAL) = fio morto | Cada channel (41) deve casar com pg_publication_tables (68) |
| 4.10 | F4 | Falso Full | UI+backend mas botão disabled/flag OFF | Grep disabled/notImplemented; flag OFF => Partial |
| 4.00 | F1 | Stubs | Hooks que retornam mock/vazio parecem implementados | Grep TODO/placeholder + verificação de retorno vazio |
| 4.00 | F3 | Wire quebrado | `.from('t')` sem `.schema()` para tabela evo | Cruzamento from_calls_front vs pg_class zapp+evo |
| 3.90 | F2 | Partições | Partições-filhas evo inflam contagem | Excluir por regex (relkind p, nome `*_YYYY_MM`) |
| 3.65 | F4 | Falso Full | RPC existe+grant mas é stub ('not yet implemented') | Amostra prosrc de SECDEF; marcar Partial |
| 3.55 | F2 | RPC grant | Função existe mas sem EXECUTE p/ authenticated | has_function_privilege em cada RPC |
| 3.55 | F3 | Wire quebrado | invoke('f') para edge não deployada | Diff invoke_calls_front (57) vs edges deployadas (110) |

## 4. Monte Carlo — erro de classificação (5.000 runs, ~120 recursos, 7 causas)

- falso_full_ui_disabled: 5.9% · falso_full_stub: 4.0% · falso_partial_view_realtime: 5.4% · falso_partial_schema_evo: 3.9% · falso_suggested_sem_fonte: 3.1% · evidencia_falsa: 5.1% · wire_quebrado_nao_detectado: 6.4%
- **Esperado:** média 0.33 causas de erro por run · 71% dos runs sem erro
- **Conclusão:** com QA de 10 recursos (8,3%) + correção, taxa residual estimada < 5%.

## 5. Gaps pré-execução (10)

1. **GAP-1:** 595 arquivos staged no repo — workers NÃO podem tocar git (read-only absoluto)
2. **GAP-2:** F-01..F-06 do plano original não existem em docs/ (relatório `AUDITORIA_ZAPP_WEB_V3_PLANO_100_ETAPAS.md` ausente) — defeitos re-derivados do ground truth
3. **GAP-3:** Workers sem MCP — evidência DB via evidence packs em `.hermes/audit-100/evidence/`
4. **GAP-4:** search_files MSYS quebrado em workers — obrigatório terminal+grep
5. **GAP-5:** 41 canais realtime vs 68 tabelas na publication — canais fora da lista = fios mortos (F-05-like)
6. **GAP-6:** 110 edges deployadas vs 57 invokes do front — ~53 edges back-only (webhook/cron), triagem
7. **GAP-7:** 63 RPCs chamados vs 191 `rpc_*` no zapp — ~128 RPCs backend-only (capacidade latente)
8. **GAP-8:** public schema = só views (380) — `.from()` sem schema apontando p/ public pode ser view quebrada
9. **GAP-9:** `gmail-tests.test.ts` DEPLOYADO como edge function (anomalia)
10. **GAP-10:** front usa `.from('audio')` e `.from('evolution_*')` sem `.schema()` — schema real pode ser outro

## 6. Decisões de mitigação adotadas

1. Workers usam terminal+grep (nunca search_files) e leem evidence packs (nunca MCP).
2. Domínios disjuntos entre 10 workers (sem overlap de prefixos).
3. Full exige 4 camadas evidenciadas; dúvida => Partial; Suggested exige fonte textual.
4. Realtime: channel só conta como camada se alvo está na publication (68).
5. Consolidação via json canônico único (MD/CSV gerados por script) — sem drift.
6. QA estratificado: 10 recursos sorteados por domínio, verificação real de arquivo:linha.
7. Nenhuma escrita em código/banco — artefatos apenas em `.hermes/audit-100/` + `docs/audit/`.

---
*Gerado por: Hermes Agent (DeepSeek Flash maestro) · Fase 0.5 do PROMPT_INVENTARIO_FUNCIONAL_ZAPP_WEB_V3_100_ETAPAS.md*
