-- ============================================================
-- Passos 23 e 26 do plano de auditoria 2026-08-01
-- Decisões deliberadas de não-implementação documentadas em SQL
-- ============================================================

-- ---------------------
-- PASSO 23: profiles.onboarding_status
-- ---------------------
-- Análise: o campo `onboarding_status` existia apenas em uma migração
-- arquivada (archive/20260712142026_e4a3b66f-...sql) com comentário
-- "0 usos de onboarding_status". Nenhum arquivo em src/ referencia
-- o campo. A migration foi arquivada propositalmente antes de ser
-- aplicada à instância self-hosted, pois:
--   1. Zero front-end references confirmadas (grep src/)
--   2. Zero back-end RPC references confirmadas
--   3. Adicionar coluna desnecessária aumenta largura de linha em
--      zapp.profiles sem benefício funcional
-- DECISÃO: não adicionar profiles.onboarding_status ao self-hosted.
-- Se funcionalidade de onboarding for necessária no futuro, criar
-- migração específica naquele momento com escopo correto.
COMMENT ON TABLE zapp.profiles IS
  E'Perfis de usuários da plataforma ZAPP.\n'
  'Campo onboarding_status deliberadamente omitido (0 referências frontend/backend, ver auditoria 2026-08-01).';

-- ---------------------
-- PASSO 26: app_role enum ordering
-- ---------------------
-- Análise: a ordem dos valores no tipo enum zapp.app_role difere
-- entre Lovable Cloud (origem) e self-hosted (produção):
--   Lovable:      admin, supervisor, agent, special_agent, dev, manager
--   Self-hosted:  admin, manager, supervisor, agent, special_agent, dev
--
-- Impacto avaliado:
--   - Comparações de enum no PostgreSQL são por NAME (=, IN), não por
--     posição ordinal, exceto quando usados em ORDER BY sem CAST.
--   - Nenhuma query ativa usa ORDER BY app_role sem CAST explícito.
--   - Nenhum índice ordinal-dependente foi identificado.
--   - ALTER TYPE ... ADD VALUE / RENAME VALUE são seguros.
--   - Reordenar valores existentes exige DROP TYPE CASCADE + RECREATE,
--     o que invalidaria todas as colunas, funções e políticas RLS que
--     referenciam app_role — risco inaceitável em produção.
--
-- DECISÃO: manter ordem atual do self-hosted; não reordenar.
-- Os rótulos (admin, manager, supervisor, agent, special_agent, dev)
-- são idênticos em ambos os ambientes — apenas a posição ordinal difere,
-- sem efeito observável no comportamento da aplicação.
COMMENT ON TYPE public.app_role IS
  E'Papéis de usuário da plataforma.\n'
  'Ordem dos valores: admin, manager, supervisor, agent, special_agent, dev.\n'
  'Difere da ordem original Lovable (admin, supervisor, agent, special_agent, dev, manager) de forma deliberada;\n'
  'reordenação exigiria DROP TYPE CASCADE com risco inaceitável em produção (auditoria 2026-08-01, passo 26).';
