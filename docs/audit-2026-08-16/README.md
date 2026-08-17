# Auditoria Exaustiva + Plano de 100 Etapas — ZAPP Web V3 (2026-08-16)

> **O que é esta pasta:** o inventário completo do sistema (o que existe, o que está parcial, o que nunca foi feito) e o plano de implementação/correção em **100 etapas × 10 subetapas**, validado pela camada de validação (Claude) em 3 rodadas — **APROVADO**.

## O que tem aqui

| Arquivo | Conteúdo |
|---|---|
| `AUDITORIA-FUNCIONALIDADES.md` | Auditoria exaustiva: 1.964 itens classificados (PRESENTE/PARCIAL/NÃO INICIADA/PLANO/INFERIDO), pendências globais, veredito por domínio, evidências do banco vivo |
| `PLANO-100-ETAPAS.md` | Plano completo: 100 etapas × 10 subetapas = 1.000 subetapas, 428 checklists de conclusão |
| `fases/` | O MESMO plano fatiado em 10 arquivos, um por fase — **é por aqui que a execução deve ser feita** |
| `insumo/pendencias-consolidadas.md` | Todas as pendências extraídas dos 584 docs auditados (fonte das etapas) |
| `AGENTS.md` | Regras de execução para agentes de IA (LEIA antes de executar qualquer etapa) |

## Ordem de execução (obrigatória)

As fases estão ordenadas por **risco/impacto** — risco ativo explorável primeiro:

| # | Fase | Arquivo | Por que primeiro |
|---|---|---|---|
| 1 | Resposta imediata de segurança | `fases/fase-01-resposta-imediata-seguranca.md` | Secrets vazados, buckets PII públicos e RLS frouxa são exploráveis **hoje** |
| 2 | Fundação de qualidade | `fases/fase-02-fundacao-qualidade-testes-ci.md` | Testes fantasma (322 `expect(true)`) impedem detectar regressão dos fixes seguintes |
| 3 | Backend crítico, realtime e performance | `fases/fase-03-backend-critico-realtime-performance.md` | Realtime do inbox está **morto** em produção; fila offline quebrada |
| 4 | Inbox núcleo | `fases/fase-04-inbox-nucleo-hooks-servicos.md` | Coração do produto (hooks de mensageria) sem testes e com defeitos conhecidos |
| 5 | Inbox UI | `fases/fase-05-inbox-ui-componentes.md` | Stubs visíveis (tags, hover toolbar, vídeo) que enganam o usuário |
| 6 | Auth e Admin | `fases/fase-06-auth-admin.md` | Bypass do papel `dev` em produção, MFA com catch silencioso |
| 7 | Features de negócio | `fases/fase-07-features-negocio.md` | Dashboards com dados fictícios, campanhas sem RLS de escrita |
| 8 | Integrações e serviços | `fases/fase-08-integracoes-servicos.md` | 33/46 serviços órfãos, SIP inseguro, stubs sem flag |
| 9 | Desacoplamento Evo×Zapp | `fases/fase-09-desacoplamento-evo-zapp.md` | Fechamento da onda V4 (cloud, roles, congelamento) |
| 10 | Infra/Ops/Docs/Validação final | `fases/fase-10-infra-ops-docs-validacao.md` | Dívidas de infra + validação exaustiva + fechamento |

## Regras de ouro (resumo — o detalhe está no AGENTS.md)

1. **Nenhuma ação destrutiva sem a pré-condição da Etapa 93** (backup/restore validado + rollback ensaiado).
2. **Uma etapa por PR** — commit atômico, validação (typecheck + testes) dentro do PR, nunca direto na main.
3. **Checklist é contrato** — etapa só está DONE quando todo o `Critério de conclusão` passa com evidência.
4. Etapas com **[APROVAÇÃO]** só começam depois da decisão do dono (Joaquim).

## Como foi gerado

- 584 documentos auditados (2 ondas × 22 agentes read-only) + banco vivo medido via Supabase MCP (~340 tabelas, 955 funções, 657 migrations).
- Classificação validada pela camada VALIDA (Claude): régua `PRESENTE ≠ VERIFICADO` (código existir não prova funcionamento).
- Plano revisado em 3 rodadas de validação (reordenação por risco, fusão de duplicatas, lacunas de backup/perf corrigidas).
