# ADR-008 — Modelo Canônico de Domínio

**Data:** 2026-08-13 · **Status:** Aceito · **Etapas:** E23-E30 do Plano 100

## Contexto

O modelo canônico atual do sistema **É** o modelo da Evolution API (Baileys):
`remote_jid`, `instance_name`, `from_me`, `push_name`, `message_type` Baileys
são o vocabulário do domínio. Trocar de provider significa reescrever o domínio.

O `whatsapp-cloud-normalizer.ts` normaliza Meta → Evolution, em vez de ambos
normalzarem para um modelo neutro.

## Decisão

Criar tipos canônicos em `src/domain/messaging/types.ts` neutros de provider.
Adapters (Evolution, Cloud) traduzem de/para o canônico.

**NÃO renomear** tabelas `evolution_*` nem o schema `evo` — custo/risco desproporcional
(165 tabelas, 422 views em public, 89 migrations). Registrado em E77.

## Consequências

- Novos features usam `ChannelMessage`, `ChannelContact`, `ChannelConversation`
- `evolutionAdapter.ts` torna-se legado de leitura (E37 — não remover: 96 dependências)
- Gate CI futuramente proíbe imports de `@/types/evolutionExternal` fora de adapters (E38)
- Migração é incremental: código legado coexiste com o canônico
