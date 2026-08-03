> ⚠️ SUPERSEDED (2026-07-15): This ADR described the dual-Supabase architecture. The project now uses a single self-hosted Supabase (schema zapp/evo). See externalClient.ts shim.

# ADR-005: Audit & Recovery Model

## Status: Implementado
## Data: 2026-07-24 (consolidado da Onda 2 e Onda 3)

## Contexto
O sistema Evolution DB lida com fluxos críticos de WhatsApp e CRM. Falhas na sincronização ou deleções acidentais precisam de um rastro de auditoria robusto e mecanismos de recuperação.

## Decisões (Consolidadas)

### 1. Immutable Logs
Toda mensagem recebida é logada em `provider_message_log` antes de qualquer processamento.

### 2. Audit Tables
`evolution_audit_log` registra todas as mudanças de estado e deleções, capturando o estado `old_data` e `new_data`.

### 3. Sequence Numbering
Coluna `sequence_number` BIGSERIAL em `messages` para ordenação determinística.

### 4. Reprocess Queue
Tabela `reprocess_jobs` para gerenciar tentativas de recuperação de mensagens que falharam no processamento inicial.

### 5. Outbox Pattern
Tabela `evolution_outbox` para garantir que eventos de domínio sejam persistidos atomicamente com a mudança de estado.

### 6. Optimistic Locking
Coluna `version` em `profiles` para prevenir condições de corrida em edições de perfil/contato.

### 7. Sentiment Analysis
Tabela `evolution_sentiment_analysis` para análise de sentimento de mensagens com alertas em `sentiment_alerts`.

## Consequências
- Aumento do uso de armazenamento para logs.
- Maior facilidade em debug de problemas de concorrência.
- Capacidade de "replay" de eventos em caso de desastre.
- Maior confiabilidade na ordem das mensagens.
- Visibilidade administrativa sobre falhas de integração.
- Proteção contra perda de dados em atualizações concorrentes.
