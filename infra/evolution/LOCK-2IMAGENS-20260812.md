# 🔒 LOCK — Operação de consolidação de imagens Evolution API (2 imagens)

**Início:** 2026-08-12 ~10:00Z · **Expira:** 2026-08-12 18:00Z (ou aviso de liberação)

## Escopo bloqueado durante a janela
- **Stack 25 (`evolution`)** — NÃO fazer `update_stack`, `update_service`, `stack_action`, restart, rollback ou deploy de imagem nova no serviço `evolution_evolution`.
- **`infra/evolution/**` e `infra/evolution-api-custom/**`** — NÃO editar, mergear ou abrir PR nestes paths.
- **CI `publish-evolution-api-custom.yml`** — NÃO rodar manualmente.

## Motivo
Consolidação para manter **exatamente 2 imagens** `evolution-api-custom` no host:
1. **Oficial atual**: `sha256:f07b7fd27737066cdd8466855ff6f63038829153e129a0a065c4103862f86129` (2.4.0-rc2, Baileys 7.0.0-rc.9, T1-T20)
2. **Rollback**: `sha256:09f847e8a8d0be9c756f6e3d7a74ef3c3e591a2a0004b2d87017bd5fb8db807f`

As demais 10 imagens serão removidas APÓS consolidação de configs e validação. Toda a configuração está sendo consolidada no compose canônico (stack 25 + repo).

## Coordenação
- Executor: Hermes (sessão do Joaquim) — qualquer escrita em produção é exclusiva do executor.
- Outros agentes: aguardem o aviso de liberação (arquivo removido) para voltar a operar o stack 25.
