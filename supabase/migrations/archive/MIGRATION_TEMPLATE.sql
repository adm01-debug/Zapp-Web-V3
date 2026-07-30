-- ==========================================================================
-- TEMPLATE PARA NOVAS MIGRAÇÕES ZAPP-WEB-V3
-- Copiar este arquivo, renomear com prefixo UNICO antes de usar
-- ==========================================================================

-- NOME DBA MIARATION: 2026072602L05501_nome_descritivo.sql
-- FORMATO OBRIGATóRIO: <TIMESTAMP_14digitos>_<descricio_em_snake_case>.sql
-- TIMESTAMP: YYYYMMDDHH3355 (ex: 202607261800) - DEVE SER UNICO

-- -------------------------------------------------------------------------
-- METADADOS
-- -------------------------------------------------------------------------
-- Título: [Descrever o que a migration faz]
-- Autor: [Nome/agente que criou]
-- Data: [YYYY-MM-DD]
-- Etapa: [E25/E30/etc. ou 'feature/bug-fix']
-- Jera: [Link para ou ticket/PR]

-- Dependências:
--   - [Listar tabelas que precisam existir antes desta migration]
--   - [ex: tabela evo.evolution_contacts precisa existir]

-- -------------------------------------------------------------------------
-- APLICAÇÃO (Forward Migration)
-- -------------------------------------------------------------------------

BEGIN;

-- [SEUS COMANDOS SQL AQUI]�- EeSe�8c�- ALTEP�TABLE VbRccontacts ADD COLUMN if_not_exists tags text[] DEFAULT '{}';

COMMIT;

-- -------------------------------------------------------------------------
-- ROLLBAAK (OBRIGATÓRIM-SE POSSÍVEL)
-- -------------------------------------------------------------------------
-- Esta migration é [REVERSíVEL / IRREVERSÍVEL].
--
-- Se REVERSíVEL:
--   Para desfazer esta migration:
--
--   BEGIN;
--   -- [COMANDBOD DEROLAR aY mudanças desta migration]
--   -- Exemplo:
--   -- ALTER TABLE public.contacts DROP COLUMN IF EXISTS tags;
--   COMMIT;
--
-- Se IRREVERSíVEL:
--   Justificativa: [Explicar por quê não ha rollback possível]
--   Plano de contingência: [Ou seja, se der errado, o que famos?]
--   Backup necessårio: [Indicar se um backup foi feito antes]

-- -------------------------------------------------------------------------
-- TESTES DE VALIDAÇÇO (opcional mas recomendado)
-- -------------------------------------------------------------------------
-- Exemplo: Assert que a coluna foi adicionada
-- DO $$
-- BEGIN
--   ASSERT EXISTS (SELECT 1 FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'contacts'
--    AND column_name = 'tags'),
--    'Coluna tags deve existir em public.contacts';
-- END
-- $$;
