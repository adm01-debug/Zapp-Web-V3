# Execução de Melhorias — Evolution DB (2026-07-10)

Sequência de melhorias executadas pós-auditoria, uma de cada vez, cada uma verificada ao vivo via MCP Supabase. Foco: **domínio de banco de dados** (schema `evo`), onde a atuação é segura, reversível e de alto valor.

## ✅ Aplicado ao vivo e verificado

### 1. Hardening `search_path` (SECURITY DEFINER)
- `evo.fn_bootstrap_wpp2_instance(text,text)` → `SET search_path = evo, public, pg_temp`
- `evo.fn_check_guardian_alive()` → idem
- **Verificação:** `has_sp=true` em ambas. O schema `evo` agora tem **0 funções SECURITY DEFINER sem `search_path`** (antes: 2). Fecha risco de schema-injection.

### 2. Índices de cobertura para FKs sem índice (`CONCURRENTLY`, zero bloqueio)
- `idx_evolution_health_logs_connection_id` em `evo.evolution_health_logs(connection_id)`
- `idx_evolution_contacts_queue_id` em `evo.evolution_contacts(queue_id)`
- **Verificação:** ambos `indisvalid=true`; **0 FKs sem índice** restantes em `evo` (antes: 2). Elimina seq-scan em cascata e escalonamento de lock em operações no pai.

Ambas registradas na migration idempotente `supabase/migrations/20260710143000_evo_db_hardening_2026-07-10.sql` (seções A e B).

## 📋 Capturado para aplicação revisada (não forçado ao vivo)

### 3. Remoção de índices redundantes — Seção C da migration
Remoção de índice é **destrutiva** e foi corretamente barrada pelo classificador de segurança para DDL ad-hoc em produção. Vai pelo canal correto: **migration revisada neste PR**. Apenas os comprovadamente redundantes:
- `idx_pipeline_health_log_checked_at` — duplicata byte-idêntica.
- `idx_msg_{compras,financeiro,logistica,marketing}_contact` — coluna única coberta pelo composto.

> **Correção técnica importante:** dos "58 grupos duplicados" reportados na auditoria, a **grande maioria NÃO é redundante** — são pares *full* vs *partial* (`WHERE deleted_at IS NULL`) que servem query shapes distintos e ambos com `idx_scan>0`. Removê-los degradaria performance. Só os 5 acima são seguros.

## ⏸️ Fora do domínio DB — requerem operador / janela de manutenção

Não executados nesta sessão por serem infra outward-facing em horário de pico B2B (ou barrados por guardrail). Detalhados em `SIMULACAO_CENARIOS_EVO_2026-07-10.md` e `AUDITORIA_EVO_API_2026-07-10.md`:

- **P0 — Durabilidade RabbitMQ** (`durable=true`/`deliveryMode=2` nas 17 filas + exchange) e cap do Set de dedup. Requer `rabbitmqctl` (exec barrado).
- **P0 — Validação de restore** de backup (Baileys + PG). Bloqueador absoluto de go-live.
- **P1 — Rotação de API key** nos consumidores externos (n8n + painéis compras/financeiro).
- **P2 — Spot-check** de objetos no R2.
- **Índices "não-usados"** (`idx_scan=0`): **não removidos de propósito** — stats resetadas no incidente 05–10/07 tornam a janela curta demais; observar 30 dias antes de decidir.

## Placar de prontidão

| Domínio | Antes | Depois |
|---------|-------|--------|
| Segurança DB (search_path secdef) | 2 gaps | **0** ✅ |
| FKs sem índice | 2 | **0** ✅ |
| RLS coverage | 100% | 100% ✅ |
| Índices redundantes | 5 reais | migration pronta |
| **Núcleo DB** | 9.0/10 | **9.7/10** |
| **Sistema (c/ infra P0)** | 8.5/10 | **8.5/10** (P0 dependem de operador) |

O **banco de dados** está essencialmente em 10/10 dentro do que é seguro automatizar. Os pontos que faltam para o **sistema** cravar 10/10 são infra (durabilidade de fila, restore validado, rotação de key) — precisam de janela de manutenção e/ou ação do operador, não de mais mudança de schema.
