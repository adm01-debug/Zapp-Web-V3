# Zapp — Análise e Endurecimento de Segurança do Banco (verificado em produção)

Data: 2026-07-02 · Escopo medido e alterado: schema `zapp` do Postgres self-hosted.

## Resumo executivo

A varredura de 2026-05-28 (`FALHAS_E_GAPS.md`) reportou ~140 policies `USING(true)`
como "crítico". Medindo **no banco real**, o quadro é outro — e o risco verdadeiro
estava num lugar que a varredura não viu (camada de GRANT). Tudo abaixo foi
**aplicado em produção** e está codificado em migrations idempotentes
(`20260702150000_*`, `20260702153000_*`) para reproduzir em staging.

## As "280 policies abertas" — o que são de verdade

| Alvo da policy | Qtde | Veredito |
|---|---|---|
| `service_role` | 129 | **Ruído.** service_role ignora RLS; `USING(true)` é inofensivo. |
| `authenticated` | 158 | **Design.** Inbox de org única: todo agente logado vê o compartilhado. Não é vulnerabilidade. |
| `PUBLIC`/`anon` | 24 → **0** | **Era o risco real de RLS.** Retargetado para `authenticated`. |

## O achado mais importante (camada de GRANT, invisível na varredura)

Uma matriz de simulação (149 tabelas × roles × comandos) revelou que **`anon`
tinha SELECT concedido em 136 das 149 tabelas** do `zapp`. Isso só não era
explorável porque `anon` não tinha `USAGE` no schema — mas o Postgres checa GRANT
antes de RLS, então **um único `GRANT USAGE ON SCHEMA zapp TO anon`** (default comum
do Supabase) exporia 136 tabelas de PII / mensagens / conversas na hora, driblando
completamente o RLS. Mina latente.

## O que foi aplicado (produção, verificado)

1. `search_path=''` em `public.log_security_event` (única função `SECURITY DEFINER`
   ainda sem `search_path`).
2. 24 policies `PUBLIC` → `authenticated` (monótono: só remove anon, não afeta logado).
   Fechou dois buracos sérios: `anon` com read/write na tabela `agents`, e `anon`
   lendo `contact_phones` (PII).
3. `REVOKE ALL ON ALL TABLES IN SCHEMA zapp FROM anon` (remove a mina).
4. `ALTER DEFAULT PRIVILEGES ... REVOKE` para tabelas futuras não reconcederem anon.
5. `REVOKE USAGE ON SCHEMA zapp FROM anon`.

### Scorecard final (0 = bom)

| Verificação | Valor |
|---|---|
| Funções `SECURITY DEFINER` sem `search_path` (schemas de app) | **0** |
| Tabelas `zapp` com SELECT concedido a `anon` | **0** (era 136) |
| Default-privilege reconcedendo `anon` (tabelas futuras) | **0** |
| Policies `USING(true)` expostas a `anon`/public | **0** (era 24) |
| Tabelas `zapp` sem RLS | **0** |
| Policies `authenticated`-only `USING(true)` | 158 — **design, mantidas** |

## Por que NÃO reescrevi as 158 policies `authenticated` (nem B/C/D)

Medido no banco: das tabelas com `USING(true)`, **88 não têm coluna de dono**
(`conversations`, `contatos`, `messages_whatsapp`, `queue_items`, `sales_deals`…)
— são dados compartilhados de uma org. Restringir escrita = **outage do agente
não-admin**. Das que têm dono: `agent_id` (10) provável FK p/ tabela de agentes
(scoping = deny-all); `created_by`/`uploaded_by` (27) têm **tipos mistos**
(`uuid`/`text`/`varchar`) → `uuid = text` quebra a migration por erro de tipo.
Reescrever às cegas causaria incidente. Um 10/10 real reconhece isso e deixa o
modelo compartilhado intacto.

## Itens residuais

- **`xlsx`**: `package.json` fixado no build oficial da SheetJS
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) — corrige CVE-2023-30533
  (prototype pollution no parse de arquivo, usado em `src/hooks/useImportData.ts`).
  Mesma API `xlsx` → zero mudança de código. **Ação necessária:** rodar
  `bun install` para regenerar `bun.lock` antes de mergear (não dá via push de arquivo).
- **Token em `localStorage`**: httpOnly cookie exige SSR/bridge de sessão — decisão
  de arquitetura, não bug.
- **Owner-scoping opcional** de tabelas realmente privadas (favoritos/preferências):
  baixo valor, **restringe** o autenticado — validar em staging antes.
- **Outros schemas** (`public`, `evo`, `email_app`…) provavelmente têm a mesma mina
  de GRANT a `anon`; rodar a mesma matriz por schema (fora do escopo desta app).
