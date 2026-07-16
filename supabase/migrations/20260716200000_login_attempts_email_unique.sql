-- Migracao: UNIQUE constraint em login_attempts.email
-- Data: 2026-07-16
-- Contexto: teste adversarial descobriu que a edge function login-attempts
-- faz upsert com onConflict:'email' mas a tabela nao tinha UNIQUE constraint.
-- Sem a constraint, cada tentativa de login falhada criava um ROW SEPARADO
-- em vez de incrementar attempt_count. O lockout NUNCA ativava porque cada
-- row tinha attempt_count=1 (nunca atingia o threshold de 5).
--
-- BUG DE SEGURANCA: brute-force nao era bloqueado!
--
-- Fix: adicionar UNIQUE constraint + remover indice btree redundante
-- (o UNIQUE cria automaticamente um indice btree equivalente).

-- Adiciona UNIQUE em email (necessario para o upsert ON CONFLICT funcionar)
ALTER TABLE zapp.login_attempts
  ADD CONSTRAINT login_attempts_email_unique UNIQUE (email);

-- Remove indice btree agora redundante (coberto pelo UNIQUE)
DROP INDEX IF EXISTS zapp.idx_login_attempts_email;
