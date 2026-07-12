-- GAP-06 (sessão 6, 2026-07-11): CHECK constraint no formato de instance_name
-- em whatsapp_connections.
--
-- PROBLEMA: sem validação no banco, qualquer string pode ser inserida como
-- instance_name, incluindo strings com espaços, caracteres especiais ou sequências
-- que a Evolution API rejeitaria. Uma instância com nome inválido seria criada no
-- banco mas nunca corresponderia a uma instância real na Evolution.
--
-- SOLUÇÃO: constraint CHECK que aplica a mesma allowlist usada pela Evolution API:
-- letras, dígitos, hífen e underscore, 1–64 caracteres. NULL é permitido
-- (colunas já existentes podem não ter instance_name preenchido).
--
-- NOTA: constraint NOT VALID → aplica apenas a novos INSERTs/UPDATEs.
-- Executar VALIDATE CONSTRAINT durante janela de manutenção para validar
-- linhas históricas após backfill (vide migration 20260711000004).

ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT chk_instance_name_format
  CHECK (instance_name IS NULL OR instance_name ~ '^[A-Za-z0-9_-]{1,64}$')
  NOT VALID;
