# ADR-DB-002 — Fronteira entre `zapp` e `evo`: Contrato Curado

**Status:** RASCUNHO — aguarda aprovação do time  
**Data:** 27/07/2026  
**Etapa 12 do Plano DB**

---

## Contexto

Hoje existem **254 views em `zapp` que apontam para `evo`**. A maioria foi criada automaticamente pelo cron `evo.fn_ensure_evolution_backcompat_views` (job 138, a cada 6h). Além disso, há **~30 funções `zapp.fn_*`** que operam diretamente o pipeline WhatsApp (ex.: `fn_reconcile_dispatch`, `fn_check_evolution_pipeline_health`).

O problema é que o schema `zapp` (domínio de produto/app) está se misturando com `evo` (domínio de integração WhatsApp), violando o princípio de separação de responsabilidades definido em SCHEMA-CONTRACT.md.

---

## Problema 1: 254 views `zapp→evo`

### Diagnóstico

Ao rodar o audit da etapa 10:
- ~234 views são **auto-geradas** pela cron de backcompat — não foram criadas intencionalmente por devs
- ~20 views são **contrato curado** — o app as usa ativamente

O cron recria todas a cada 6h, tornando impossível remover individualmente sem parar o cron.

### Conjunto Canônico Aprovado (zapp deve ter estas views)

| View em `zapp` | Tabela raiz em `evo` | Motivo |
|---|---|---|
| `evolution_messages` | `evolution_messages` | Realtime root (CLAUDE.md regra 4) |
| `evolution_conversations` | `evolution_conversations` | Realtime root |
| `evolution_contacts` | `evolution_contacts` | CRM — busca de contatos |
| `evolution_media` | `evolution_media` | Acesso a mídia |
| `evolution_whatsapp_status` | `evolution_whatsapp_status` | Status de entrega |
| `contact_id_graveyard` | `contact_id_graveyard` | Dedup de contatos Evolution |

### Views Que Devem Ser Descontinuadas (~234)

Todas as views `evolution_*_wpp2`, `evolution_*_artes`, `evolution_*_comercial_*`, etc. (views de partições) que o cron cria redundantemente. Essas partições são internas do `evo` — o `zapp` não deve ter acesso direto às partições.

---

## Problema 2: ~30 funções `zapp.fn_*` que operam o pipeline WA

### Lista de Funções em Discussão

- `zapp.fn_reconcile_dispatch` — reconcilia dispatches com Evolution API
- `zapp.fn_check_evolution_pipeline_health` — health check do pipeline WA
- `zapp.fn_auto_link_evolution_contacts` — auto-link contatos Evolution↔zapp
- (outras `fn_*` que fazem chamadas diretas a tabelas `evo.*`)

### Opções

**Opção A — Manter em `zapp` (pragmático)**
- Funções que usam dados `evo` como parte do produto `zapp` devem ficar em `zapp`
- Essas funções são "lógica de produto" usando dados de integração
- **Risco:** fronteira `zapp→evo` se torna implícita e não governada

**Opção B — Mover para `evo` (purista)**
- Lógica que opera o pipeline WA pertence ao domínio Evolution
- **Risco:** viola a regra "evo nunca depende de zapp" — essas funções leem zapp.contatos etc.

**Opção C — Criar schema intermediário `pipeline` ou `integration` (ideal, oneroso)**
- Schema de integração que pode ler de ambos `zapp` e `evo`
- **Risco:** nova camada arquitetural — requer alinhamento do time

---

## Decisão (Pendente)

**Proposta do time de plataforma:**

Para o Problema 1: Atualizar `evo.fn_ensure_evolution_backcompat_views` para ler o allowlist em `ops.backcompat_view_allowlist` (etapa 11). Remover as ~234 views de partição em 3 ciclos de 30 dias após validar que nenhum código as usa.

Para o Problema 2: **Opção A provisória** — manter as ~30 funções em `zapp` mas:
1. Adicionar prefixo `fn_evo_*` para funções que operam majoritariamente dados Evolution
2. Documentar explicitamente cada função e seu consumo de `evo`
3. Revisar em 6 meses se schema `pipeline` se torna viável

**Status:** Aguarda revisão do time. Não bloqueia as etapas seguintes do plano.

---

## Consequências se Aprovado

1. `evo.fn_ensure_evolution_backcompat_views` será atualizada (etapa 11 em execução)
2. 234 views de partição em `zapp` serão removidas em 3 ciclos mensais
3. ~30 funções renomeadas com prefixo `fn_evo_*` em `zapp`
4. CI-03 atualizado para verificar que apenas views do conjunto canônico existem em `zapp→evo`

---

## Revisão

Esta ADR deve ser aprovada antes da execução da etapa 10 do plano (que remove as views excedentes).
