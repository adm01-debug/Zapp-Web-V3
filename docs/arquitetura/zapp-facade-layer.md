# Camada Facade do Schema `zapp`

- **Data da auditoria:** 2026-08-01
- **Ambiente:** Supabase self-hosted — supabase.atomicabr.com.br
- **Repositório:** adm01-debug/zapp-web-v3 (worktree `C:/c/tmp/wt-audit`)

---

## 1. Visão geral

O schema `zapp` expõe uma **camada de fachada (facade) com 20 views** que mapeiam tabelas de schemas de origem (`evo`, `email_app`, `ai`, `financeiro`, `vendas`), dando ao front e às edge functions nomes estáveis e um ponto único de leitura.

**Todas as views da camada facade são criadas com `security_invoker=true`** — o RLS é avaliado com o papel do **chamador** (invoker), não do criador da view, evitando escalada de privilégio via view.

---

## 2. Mapeamento views → tabelas-base

| View (schema `zapp`) | Tabela(s)-base |
|---|---|
| `contacts` | `evo.evolution_contacts` |
| `messages` | `evo.evolution_messages` + `whatsapp_connections` (join) |
| `email_*` (família) | `email_app.*` |
| `ai_*` (família) | `ai.*` |
| `evolution_*` (família) | `evo.*` |
| `payment_links` | `financeiro.payment_links` |
| `products` | `vendas.products` |

- A auditoria contabiliza **20 views** na camada facade; os nomes completos seguem os prefixos acima (`email_*`, `ai_*`, `evolution_*`). Lista nominal completa das 20: **não medida** nesta auditoria.
- Observação: as migrations do repo contêm **outras** views no schema `zapp` fora do conjunto facade (ex.: `gmail_*`, `provider_*`, `channel_connections_safe`, `password_reset_requests_safe`, `evolution_retry_metrics`, `v_rls_impact_preview`, `departments`, `profiles`, `messages_whatsapp`) — são views auxiliares/segurança; contagem total de views do schema: **não medida**.

---

## 3. Regras de arquitetura (contrato da camada)

1. **Triggers, constraints e índices vivem na tabela-base, nunca na view.** Views são projeções sem estado; qualquer regra de integridade/performance pertence à origem.
2. **Views não emitem CDC para o Realtime.** O Supabase Realtime observa tabelas via WAL — publicações de realtime devem apontar para as **tabelas-base**, não para as views da facade.
3. **Escrita através de view** só é possível com **INSTEAD OF triggers** — implementado apenas onde necessário (ver seção 4). Demais views da facade são efetivamente somente-leitura.

---

## 4. INSTEAD OF triggers: contacts e messages

As views `contacts` e `messages` possuem **3 INSTEAD OF triggers cada** (INSERT/UPDATE/DELETE), permitindo escrita através da view com roteamento para a tabela-base:

| View | Triggers | Origem (migrations do repo) |
|---|---|---|
| `contacts` | `trg_contacts_view_insert`, `trg_contacts_view_update`, `trg_contacts_view_delete` (INSTEAD OF INSERT/UPDATE/DELETE ON public.contacts → `evo.evolution_contacts`) | `archive/20260705220000_contacts_view_instead_of_triggers.sql` — criados porque INSERT/UPDATE do webhook handler falhava com erro `0A000` sem eles |
| `messages` | INSTEAD OF INSERT (`fn_messages_view_insert_handler` — fix `20260716_fix_messages_insert_trigger_return_id.sql`, que passou a atribuir o id de retorno), INSTEAD OF UPDATE e INSTEAD OF DELETE | `archive/20260703_critical_10_steps_fix.sql`, `archive/20260704000000_fix_evo_schema_integration.sql` |

---

## 5. RLS

- `security_invoker=true` em todas as views da facade → as policies RLS das tabelas-base se aplicam ao usuário real da requisição.
- Detalhamento policy a policy: **não medido** nesta auditoria (ver auditoria de RLS/hardening para o inventário de policies).

---

## 6. Implicações operacionais

- Consultas do front devem continuar apontando para `zapp.*` (contrato estável).
- Qualquer nova constraint/índice/trigger de escrita deve ser criado **na tabela-base**, mantendo a view intacta.
- Publicações Realtime (ex.: `messages`, `contacts`) devem referenciar as tabelas-base (`evo.evolution_messages`, `evo.evolution_contacts`), nunca as views.

---

## 7. Referências

- Migrations: `20260705220000_contacts_view_instead_of_triggers.sql`, `20260716_fix_messages_insert_trigger_return_id.sql`, `20260703_critical_10_steps_fix.sql`, `20260704000000_fix_evo_schema_integration.sql`
- `edge-auth.md` (auth das functions que consomem a facade)
- `adr-005-unicidade-contatos.md` (unicidade em `evo.evolution_contacts`, base de `zapp.contacts`)
