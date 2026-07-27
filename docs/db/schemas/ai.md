# Schema `ai` — IA / Agentes / Embeddings

**Dono:** time de IA  
**Atualizado:** 27/07/2026

## Propósito

Schema de domínio para features de inteligência artificial: embeddings vetoriais, agentes de IA, telemetria de IA.

## Estatísticas

| Objeto | Quantidade |
|---|---:|
| Tabelas | 31 |
| Triggers | 14 |

## Tabelas Principais

- `ai_agents` — definições de agentes IA
- `ai_agent_sessions` — sessões de agentes
- `ai_conversations` — conversas com IA
- `ai_embeddings` — vetores de embedding (coluna `vector(1536)`)
- `ai_telemetry` — telemetria de uso de IA

## Atenção: Extensão `vector`

A extensão `pgvector` (`vector`) está atualmente em `public` (erro de colocação). Quando movida para `extensions` (etapa 8), o `search_path` de **todas as funções do schema `ai`** que usam `vector` precisará incluir `extensions`.

Auditoria prévia obrigatória:
```sql
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'ai'
  AND (p.prosrc ILIKE '%<=>%' OR p.prosrc ILIKE '%cosine_distance%' OR p.prosrc ILIKE '%l2_distance%');
```

## Dependências

- **Usa extensão:** `vector` (pgvector) — atualmente em `public`, deve ir para `extensions`
- **Consumido por:** `zapp` (via views de contrato)
