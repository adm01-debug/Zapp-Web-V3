# ADR — R1-EXT F3: 3 actions da evolution-api sem gate (decisão de produto)

**Data:** 2026-08-18 · **Status:** PENDENTE DE DECISÃO (dono) · **Origem:** simulação R1-EXT

## Contexto

27 actions da evolution-api receberam fail-closed de conversa (PRs #1240/#1247/#1260 — 24 fechadas). Restam 3 classificadas NAO_APERTAR pela simulação porque o gate por conversa é **inaplicável** (dados instance-wide, não por chat):

| Action | Linha | O que expõe | Por que não deu gate |
|---|---|---|---|
| `find-chats` | 137 | Lista de conversas da instância (JIDs, nomes, últimos eventos) | Não tem remoteJid único — retorna TODAS as conversas da instância; gate por conversa é inaplicável |
| `find-contacts` | 139 | Catálogo de contatos da instância (números, nomes) | Idem — instance-wide |
| `send-status` | 135 | Publica story/status na instância | Sem alvo de conversa — posta no status da instância |

## Opções

1. **Manter aberto (status quo)** — risco: qualquer autenticado lista contatos/conversas da instância (PII) e posta status. Mitigação atual: rate-limit por IP + instância pausada.
2. **Role-check admin/supervisor** — usar `authorizeRoles` (helper já importado mas nunca chamado na edge — auditoria confirmou): só admin/supervisor acessam find-chats/find-contacts/send-status. Quebra UX se agentes usam essas actions.
3. **Filtro pós-resposta** — a edge baixa a lista (service_role) e filtra no servidor pelos contatos visíveis ao usuário (lookup por remote_jid na lista). Custo: N+1 lookups em listas grandes; risco de vazar existência via tempo de resposta.
4. **Desabilitar no front** — esconder as ações para não-admin (sem backend = esconder — contraria a regra do dono se a feature é planejada).

## Recomendação da simulação

**Opção 2 (role-check admin)** como gate mínimo imediato + **decisão do dono** se agentes comuns precisam de find-chats/find-contacts (se precisam → opção 3 com cache).

## Verificação de uso real (para a decisão)

- `find-chats`/`find-contacts`: chamados por `useEvolutionApiManagement` (ferramentas de admin/supervisor; sem consumidor direto no front além do hook).
- `send-status`: `useEvolutionApiManagement` (Status/Stories) — exposto na UI a usuários com permissão de status.

## Decisão do dono (preencher)

- [ ] Aprovar opção 2 (role-check admin nas 3)
- [ ] Aprovar opção 3 (filtro pós-resposta para find-chats/find-contacts)
- [ ] Manter aberto com registro de risco
- [ ] Outra: ________________
